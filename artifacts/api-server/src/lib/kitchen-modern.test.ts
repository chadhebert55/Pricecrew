import assert from "node:assert/strict";
import test from "node:test";
import { calculateKitchenEstimate, type PriceBookItem } from "./estimating-engine";
import { kitchenCircuitPlan, defaultCircuit } from "@workspace/api-zod/remodel-circuits";
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness";
import { CreateQuoteBody } from "@workspace/api-zod";
import type { KitchenInputRecord } from "@workspace/db";

const settings = { residentialLaborSellRate:150, commercialLaborSellRate:165, loadedLaborCost:65, materialMarkup:.25, targetMargin:.4 };
const row=(item:string,unitCost=10,extra:Partial<PriceBookItem>={}):PriceBookItem=>({
  item,unitCost,category:"Other",supplier:"Test fixture supplier",manufacturer:null,manufacturerPartNumber:null,supplierSku:null,
  upc:null,sourceDate:"2026-09-26",amperage:null,poleCount:null,protectionType:null,isDefault:false,...extra,
});
export const kitchenTestCatalog:PriceBookItem[] = [
  ...["12/2 NM-B","14/2 NM-B","14/3 NM-B","10/3 NM-B","8/3 NM-B","6/3 NM-B","4/3 NM-B"].map(c=>row(`${c} cable`,2)),
  ...["Pass & Seymour 3232-TRW 15A TR duplex receptacle","USB receptacle","sink light","island pendant",
    "undercabinet lighting","Juno WF4DREGSMAL 4-inch regressed wafer light","Pass & Seymour TM873-W 15A 3-way switch — SKU 32128",
    "Pass & Seymour S1-18-W 1-gang box — SKU 18134","Legrand radiant TM874WCC10 15A 4-way switch",
    "Legrand radiant RWP26WCC10 1-gang screwless wall plate","Lutron DVCL-153P-WH Diva dimmer — SKU 160288",
    "smart switch","device plate","duplex receptacle wall plate","appliance connection box","NM cable connector"].map(k=>row(k)),
  ...[15,20,30,40,50,60].flatMap(amperage=>["Standard","AFCI","GFCI","Dual Function"].map(protectionType=>row(`Siemens ${amperage}A ${amperage>20?2:1}-pole ${protectionType} breaker`,40,{
    category:"Protection",manufacturer:"Siemens",amperage,poleCount:amperage>20?2:1,protectionType,
  }))),
];
export const modernKitchenInputs:KitchenInputRecord = {
  circuitConfigurationVersion:2,refrigeratorCircuits:1,dishwasherCircuits:1,disposalCircuits:1,gasRangeCircuits:0,
  electricRangeCircuits:0,wallOvenCircuits:0,countertopReceptacles:4,sinkLights:1,islandPendants:0,undercabinetLighting:0,
  recessedLights:4,threeWayOptions:0,fourWayLocations:0,fourWayCableFootage:0,dimmers:0,smartSwitches:0,usbReceptacles:0,
  additionalDedicatedCircuits:0,routeLength:30,includeLightingCircuit:true,lightingCircuitFootage:40,
  smallApplianceCircuits:2,microwaveCircuits:1,applianceHomeRun12_2Length:60,customerSuppliedFixtures:true,
  customerSuppliedRecessedLights:false,notes:"",panelManufacturer:"Siemens",cableType:"12/2 NM-B",laborAdjustmentHours:0,
};
const scenarios:Array<[string,Partial<KitchenInputRecord>,number,number]> = [
  ["typical kitchen",{},7,400],
  ["50A range",{electricRangeCircuits:1},8,460],
  ["wall oven",{wallOvenCircuits:1},8,460],
  ["range and wall oven",{electricRangeCircuits:1,wallOvenCircuits:1},9,520],
  ["3-way and 4-way",{threeWayOptions:1,fourWayLocations:1,fourWayCableFootage:20},7,400],
  ["smart switches",{smartSwitches:2},7,400],
  ["additional identical breakers",{additionalBreakers:[{...defaultCircuit("extra"),quantity:3,protectionType:"GFCI"}]},10,400],
  ["customer-supplied decorative fixtures",{sinkLights:2,islandPendants:3,undercabinetLighting:2,customerSuppliedFixtures:true},7,400],
];
for(const [name,changes,breakers,footage] of scenarios) test(`Kitchen v2 ${name}: complete circuit-to-price trace`,()=>{
  const inputs={...modernKitchenInputs,...changes};
  const result=calculateKitchenEstimate(inputs,settings,kitchenTestCatalog);
  const warnings=result.pricing.pricingWarnings.filter(w=>typeof w==="string" || w.severity==="error");
  assert.deepEqual(warnings,[]);
  assert.equal(result.assembly.some(hasUnresolvedMaterialCost),false);
  assert.equal(result.assembly.filter(l=>l.category==="Protection").reduce((s,l)=>s+l.quantity,0),breakers);
  const homeRuns=result.assembly.filter(l=>l.id.startsWith("kitchen-home-run-"));
  assert.equal(homeRuns.reduce((s,l)=>s+l.quantity,0),footage);
  assert.equal(homeRuns.reduce((s,l)=>s+l.extendedCost,0),footage*2);
  for(const c of kitchenCircuitPlan(inputs)){
    const line=homeRuns.find(l=>l.id===`kitchen-home-run-${c.key}`)!;
    assert.equal(line.quantity,c.quantity*(c.routeLength??0));
    assert.ok(line.description.includes(c.cableType));
  }
  assert.equal(result.pricing.materialCost,Number(result.assembly.reduce((s,l)=>s+l.extendedCost,0).toFixed(2)));
  assert.equal(result.pricing.laborCost,Number((result.pricing.finalLaborHours!*65).toFixed(2)));
  assert.equal(result.pricing.laborSellAmount,Number((result.pricing.finalLaborHours!*150).toFixed(2)));
  assert.equal(result.pricing.finalSellingPrice,Number(Math.max(result.pricing.materialCost*1.25+result.pricing.laborSellAmount!, (result.pricing.materialCost+result.pricing.laborCost)/.6).toFixed(2)));
  assert.equal(result.pricing.grossProfit,Number((result.pricing.finalSellingPrice-result.pricing.materialCost-result.pricing.laborCost).toFixed(2)));
  assert.ok(result.assembly.filter(l=>l.intentionalExclusionReason).every(l=>l.unitCost===0));
  const parsed=CreateQuoteBody.parse({module:"KITCHEN",jobInputs:inputs,customerName:"Test",projectName:name,proposalDescription:"Test scope"});
  assert.deepEqual(calculateKitchenEstimate(parsed.jobInputs as KitchenInputRecord,settings,kitchenTestCatalog),result);
});
test("Kitchen v2: exact protection/manufacturer, independent routes, and signed labor",()=>{
  const c={...defaultCircuit("electricRangeCircuits"),quantity:1,amperage:40,cableType:"8/3 NM-B",protectionType:"GFCI",routeLength:25};
  const baseline=calculateKitchenEstimate({...modernKitchenInputs,electricRangeCircuits:1,circuitConfigurations:[c]},settings,kitchenTestCatalog);
  assert.equal(baseline.assembly.find(l=>l.id==="kitchen-home-run-electricRangeCircuits")?.extendedCost,50);
  assert.ok(baseline.assembly.some(l=>l.description.includes("40A")&&l.description.includes("GFCI")));
  const adjusted=calculateKitchenEstimate({...modernKitchenInputs,electricRangeCircuits:1,circuitConfigurations:[c],laborAdjustmentHours:-2},settings,kitchenTestCatalog);
  assert.equal(adjusted.pricing.laborCost,baseline.pricing.laborCost-130);
  assert.equal(adjusted.pricing.laborSellAmount,baseline.pricing.laborSellAmount!-300);
  const wrongManufacturer=calculateKitchenEstimate({...modernKitchenInputs,panelManufacturer:"Eaton"},settings,kitchenTestCatalog);
  assert.ok(wrongManufacturer.assembly.some(hasUnresolvedMaterialCost));
});
test("Kitchen v2: duplicate, missing, incompatible and zero-footage selections fail closed",()=>{
  const duplicate=kitchenTestCatalog.find(r=>r.amperage===20 && r.protectionType==="Dual Function")!;
  for(const [inputs,catalog] of [
    [modernKitchenInputs,[...kitchenTestCatalog,duplicate]],
    [{...modernKitchenInputs,smartSwitches:1},kitchenTestCatalog.filter(r=>r.item!=="smart switch")],
    [{...modernKitchenInputs,applianceHomeRun12_2Length:0},kitchenTestCatalog],
    [{...modernKitchenInputs,circuitConfigurations:[{...defaultCircuit("refrigeratorCircuits"),quantity:1,cableType:"14/2 NM-B"}]},kitchenTestCatalog],
    [{...modernKitchenInputs,electricRangeCircuits:1,circuitConfigurations:[{...defaultCircuit("electricRangeCircuits"),quantity:1,amperage:60}]},kitchenTestCatalog],
  ] as Array<[KitchenInputRecord,PriceBookItem[]]>){
    const result=calculateKitchenEstimate(inputs,settings,catalog);
    assert.ok(result.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.severity==="error"));
  }
});
