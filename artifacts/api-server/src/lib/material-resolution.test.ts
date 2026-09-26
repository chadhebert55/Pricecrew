import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSupplierCost, selectCatalogMaterial, usableCatalogCost, breakerManufacturerCompatible } from "./material-resolution";
import { calculateKitchenEstimate, type PriceBookItem } from "./estimating-engine";
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness";
import type { KitchenInputRecord } from "@workspace/db";

const row = (item: string, extra: Partial<PriceBookItem> = {}): PriceBookItem => ({
  item, category: "Devices", unit: "ea", unitCost: 1, supplier: "Northeast Electrical",
  manufacturer: null, manufacturerPartNumber: null, supplierSku: null, upc: null, sourceDate: "2026-08-25",
  amperage: null, poleCount: null, protectionType: null, isDefault: false, ...extra,
});
test("supplier c preserves dimensional base and full normalized precision; unknown units fail closed", () => {
  for (const [raw, each] of [[25.399,.25399],[50.651,.50651],[763.579,7.63579]]) {
    assert.equal(normalizeSupplierCost(raw,"c","ea")?.normalizedUnitCost,each);
    assert.equal(normalizeSupplierCost(raw,"c"),null);
  }
  assert.equal(normalizeSupplierCost(56.2271,"c","ft")?.normalizedUnitCost,.562271);
  assert.equal(normalizeSupplierCost(562.271,"m","ft")?.normalizedUnitCost,.562271);
  assert.equal(normalizeSupplierCost(99,"unknown","ea"),null);
  assert.equal(usableCatalogCost(row("connector",{supplierCost:25.399,supplierUom:"c",normalizedUnit:"ea",normalizedUnitCost:.25399,unitCost:.25399})),.25399);
  assert.equal(usableCatalogCost(row("connector",{supplierCost:25.399,supplierUom:"c",normalizedUnit:"ea",normalizedUnitCost:25.399})),null);
});
test("preferences rank deterministically, ties stay ambiguous, zero placeholders are not verified candidates", () => {
  const verified=row("breaker",{id:1,unitCost:69.239});
  const zero=row("breaker",{id:2,unitCost:0});
  assert.equal(selectCatalogMaterial([zero,verified],()=>true).match?.id,1);
  assert.equal(selectCatalogMaterial([verified,{...verified,id:3}],()=>true).status,"ambiguous");
  const preferred={...verified,materialPreferences:[{requestKey:"20A breaker",kind:"exact" as const}]};
  assert.equal(selectCatalogMaterial([{...verified,id:3},preferred],()=>true,"20A breaker").match?.id,1);
  assert.equal(selectCatalogMaterial([preferred,{...preferred,id:3}],()=>true,"20A breaker").status,"ambiguous");
  assert.equal(selectCatalogMaterial([verified,{...preferred,id:2,unitCost:0}],()=>true,"20A breaker").match?.id,2);
  const alternate={...verified,id:4,materialPreferences:[{requestKey:"20A breaker",kind:"alternate" as const}]};
  assert.equal(selectCatalogMaterial([alternate,preferred],()=>true,"20A breaker").match?.id,1);
});
test("manufacturer and panel family compatibility cannot be bypassed by preferences", () => {
  const hom=row("Homeline",{manufacturer:"Square D",manufacturerPartNumber:"SQD HOM120"});
  const qo=row("QO",{manufacturer:"Square D",manufacturerPartNumber:"QO120"});
  assert.ok(breakerManufacturerCompatible(hom,"Square D Homeline"));
  assert.ok(!breakerManufacturerCompatible(qo,"Square D Homeline"));
  assert.ok(breakerManufacturerCompatible(qo,"Square D QO"));
  assert.ok(!breakerManufacturerCompatible(qo,"Siemens"));
  assert.ok(breakerManufacturerCompatible(row("BR",{manufacturer:"Eaton",manufacturerPartNumber:"BR120"}),"Eaton BR"));
  assert.ok(!breakerManufacturerCompatible(row("CH",{manufacturer:"Eaton",manufacturerPartNumber:"CH120"}),"Eaton BR"));
});
const settings={residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4};
const kitchen: KitchenInputRecord = {
  circuitConfigurationVersion:2,refrigeratorCircuits:1,dishwasherCircuits:1,disposalCircuits:1,microwaveCircuits:1,
  smallApplianceCircuits:2,gasRangeCircuits:0,electricRangeCircuits:0,countertopReceptacles:4,sinkLights:1,islandPendants:2,
  undercabinetLighting:0,recessedLights:0,threeWayOptions:0,dimmers:0,usbReceptacles:1,
  additionalDedicatedCircuits:0,routeLength:20,applianceHomeRun12_2Length:60,customerSuppliedFixtures:true,notes:"",
  panelManufacturer:"Siemens",breaker20AProtectionType:"Dual Function",cableType:"12/2 NM-B",
};
const breaker=row("Siemens Q120DF", {id:383,unitCost:69.239,manufacturer:"Siemens",manufacturerPartNumber:"ITE Q120DF",
  supplierSku:"942105",amperage:20,poleCount:1,protectionType:"Dual Function",category:"Protection",
  materialPreferences:[{requestKey:"Siemens 20A 1-pole Dual Function breaker",kind:"exact"}]});
const catalog=[
  breaker,row("Siemens unpriced duplicate",{unitCost:0,manufacturer:"Siemens",amperage:20,poleCount:1,protectionType:"Dual Function"}),
  row("Pass & Seymour 3232-TRW 15A TR duplex receptacle",{id:353,supplierSku:"243085",manufacturerPartNumber:"3232-TRW"}),
  row("Arlington NM94",{id:900,supplierCost:25.399,supplierUom:"c",supplierUnitQuantity:100,normalizedUnit:"ea",
    normalizedUnitCost:.25399,unitCost:.25399,supplierSku:"13845",manufacturer:"Arlington",manufacturerPartNumber:"NM94",
    materialPreferences:[{requestKey:"NM cable connector for 12/2 NM-B",kind:"family"}]}),
  row("12/2 NM-B cable",{unit:"ft",unitCost:.562271,supplierCost:562.271,supplierUom:"m",normalizedUnit:"ft",normalizedUnitCost:.562271}),
];
test("real company kitchen identities flow through shared resolver, normalized assembly, and quote snapshot", () => {
  const result=calculateKitchenEstimate(kitchen,settings,catalog);
  const b=result.assembly.find(l=>l.category==="Protection")!;
  assert.equal(b.quantity,6); assert.equal(b.unitCost,69.239); assert.equal(b.extendedCost,415.434);
  assert.equal(b.extendedCost.toFixed(2),"415.43");
  assert.equal(b.materialSnapshot?.supplierSku,"942105");
  assert.equal(b.resolutionStatus,"RESOLVED_COMPANY_PREFERRED");
  assert.equal(result.assembly.find(l=>l.id==="kitchen-appliance-devices")?.unitCost,1);
  const connector=result.assembly.find(l=>l.id.startsWith("kitchen-circuit-connectors"))!;
  assert.equal(connector.quantity,12); assert.equal(connector.unitCost,.25399); assert.equal(connector.extendedCost,3.048);
  assert.equal(connector.materialSnapshot?.supplierCost,25.399); assert.equal(connector.materialSnapshot?.supplierUom,"c");
  assert.equal(result.assembly.filter(l=>l.id.startsWith("kitchen-home-run")).reduce((s,l)=>s+l.quantity,0),360);
  assert.equal(result.assembly.find(l=>l.id==="sink-lights")?.resolutionStatus,"CUSTOMER_SUPPLIED");
  assert.ok(!hasUnresolvedMaterialCost(result.assembly.find(l=>l.id==="sink-lights")!));
  assert.ok(result.assembly.some(hasUnresolvedMaterialCost)); // USB/plates/etc intentionally remain unresolved.
  assert.equal(result.pricing.materialCost,Number(result.assembly.reduce((s,l)=>s+l.extendedCost,0).toFixed(2)));
  const snapshot=JSON.stringify(result);
  calculateKitchenEstimate(kitchen,settings,catalog.map(r=>({...r,unitCost:100})));
  assert.equal(JSON.stringify(result),snapshot,"future catalog edits cannot mutate the existing calculated snapshot");
  const gfci=calculateKitchenEstimate({...kitchen,breaker20AProtectionType:"GFCI"},settings,[
    ...catalog,row("Siemens QF120A",{unitCost:71.027,manufacturer:"Siemens",amperage:20,poleCount:1,protectionType:"GFCI",manufacturerPartNumber:"ITE QF120A",supplierSku:"1098885"})]);
  assert.equal(gfci.assembly.find(l=>l.category==="Protection")?.unitCost,71.027);
});
test("approved family preferences cannot convert feet into each quantities", () => {
  const wrongDimension = catalog.map(item=>item.id===900?{...item,unit:"ft",normalizedUnit:"ft"}:item);
  const result=calculateKitchenEstimate(kitchen,settings,wrongDimension);
  const connector=result.assembly.find(l=>l.id.startsWith("kitchen-circuit-connectors"))!;
  assert.equal(connector.resolutionStatus,"UNRESOLVED_UOM");
  assert.equal(connector.unitCost,0);
  assert.ok(hasUnresolvedMaterialCost(connector));
});
