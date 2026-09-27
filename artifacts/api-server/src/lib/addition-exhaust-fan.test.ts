import assert from "node:assert/strict";
import test from "node:test";
import { CreateQuoteBody } from "@workspace/api-zod";
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness";
import type { AdditionInputRecord, BathroomInputRecord } from "@workspace/db";
import { calculateAdditionEstimate, calculateBathroomEstimate, type PriceBookItem } from "./estimating-engine";

const settings = {residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4};
const base: AdditionInputRecord = {
  length:20,width:16,receptacles:0,switches:0,dimmers:0,recessedLights:0,ceilingFans:0,
  customerSuppliedFans:true,circuitCount:0,routeLength:0,homeRunLength:50,
  panelManufacturer:"Siemens",breakerAmperage:20,breakerPoleCount:1,breakerProtectionType:"AFCI",
  cableType:"12/2 NM-B",crewSize:1,crewHours:8,notes:"",
};
const row = (item:string,unitCost:number,category:string,unit="ea"):PriceBookItem => ({
  id:Math.round(unitCost*100),item,unitCost,category,unit,supplier:"Synthetic QA",sourceDate:"2026-09-27",
  manufacturer:null,manufacturerPartNumber:null,supplierSku:null,upc:null,amperage:null,poleCount:null,
  protectionType:null,isDefault:false,
});
const book = [
  row("Panasonic FV-0511VF1 exhaust fan",119.291,"Ventilation"),
  row("Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",1.85,"Controls"),
  row("Pass & Seymour S1-18-W 1-gang box — SKU 18134",3,"Rough-in"),
  row("Legrand radiant RWP26WCC10 1-gang screwless wall plate",4,"Trim"),
  row("12/2 NM-B cable",.6,"Conductor","ft"),
  row("fan timer switch",25,"Controls"),
  row("fan humidity-sensing control",35,"Controls"),
];
const scope = {quantity:2,customerSupplied:false,control:"Standard switch",wiringLength:30,cableType:"12/2 NM-B"};
// Structural cast lets the new behavior fail against main before schema implementation.
const inputs = (fan:object=scope):AdditionInputRecord => ({...base,bathroomExhaust:fan} as AdditionInputRecord);
const calc = (fan:object=scope,catalog=book) => calculateAdditionEstimate(inputs(fan),settings,catalog);
const line = (result:ReturnType<typeof calc>,id:string) => result.assembly.find(l=>l.id===`addition-exhaust-${id}`)!;
const errors = (result:ReturnType<typeof calc>) => result.pricing.pricingWarnings.filter(w=>typeof w!=="string"&&w.severity==="error");

test("Addition old payload and explicit zero exhaust quantity preserve the entire estimate",()=>{
  assert.deepEqual(calc({...scope,quantity:0}),calculateAdditionEstimate(base,settings,book));
});
test("Addition contractor exhaust fans include Bathroom equipment, controls, boxes, plates and total measured wire",()=>{
  const r=calc();
  assert.equal(line(r,"fans")?.quantity,2);
  assert.equal(line(r,"fans").unitCost,119.291);
  assert.equal(line(r,"fans").materialSnapshot?.requestKey,"Panasonic FV-0511VF1 exhaust fan");
  for(const id of ["controls","boxes","plates"]) assert.equal(line(r,id)?.quantity,2);
  assert.equal(line(r,"wiring")?.quantity,30); // Total measured footage, not multiplied by fans.
  assert.equal(r.pricing.finalLaborHours,14.5); // 8 base + 2*(2.25+.5) + 30/30.
  assert.equal(r.pricing.laborCost,942.5);
  assert.equal(r.pricing.laborSellAmount,2175);
  assert.equal(errors(r).length,0);
  assert.equal(r.assembly.some(hasUnresolvedMaterialCost),false);
});
test("Addition customer-supplied exhaust fan ignores stale override, preserves every installation line and labor",()=>{
  const contractor=calc(), supplied=calc({...scope,customerSupplied:true,materialCostOverride:999});
  assert.equal(line(supplied,"fans")?.extendedCost,0);
  assert.equal(line(supplied,"fans").resolutionStatus,"CUSTOMER_SUPPLIED");
  assert.equal(hasUnresolvedMaterialCost(line(supplied,"fans")),false);
  assert.deepEqual(supplied.assembly.filter(l=>l.id!=="addition-exhaust-fans"),contractor.assembly.filter(l=>l.id!=="addition-exhaust-fans"));
  assert.equal(supplied.pricing.finalLaborHours,contractor.pricing.finalLaborHours);
  assert.equal(errors(supplied).length,0);
});
test("Addition no contractor fan match, duplicate match or zero override stays unresolved",()=>{
  for(const r of [calc(scope,book.filter(r=>r.category!=="Ventilation")),calc(scope,[...book,book[0]!]),
    calc({...scope,materialCostOverride:0})]) {
    assert.equal(line(r,"fans")?.unitCost,0);
    assert.equal(hasUnresolvedMaterialCost(line(r,"fans")),true);
    assert.ok(errors(r).length>0);
  }
  assert.equal(line(calc({...scope,materialCostOverride:150}),"fans").extendedCost,300);
});
test("Addition supplied fan does not mask missing installation materials or unspecified wiring",()=>{
  for(const key of [book[1]!.item,book[2]!.item,book[3]!.item,book[4]!.item]) {
    const r=calc({...scope,customerSupplied:true},book.filter(r=>r.item!==key));
    assert.ok(r.assembly.some(hasUnresolvedMaterialCost),key);
    assert.ok(errors(r).length>0,key);
  }
  for(const wiringLength of [undefined,0]) assert.ok(errors(calc({...scope,wiringLength})).length>0);
});
test("Addition exhaust controls reuse Bathroom control cost and person-hour assumptions",()=>{
  for(const [control,cost,controlHours] of [["Standard switch",1.85,.5],["Timer switch",25,.75],["Humidity-sensing control",35,.75]] as const) {
    const r=calc({...scope,control});
    assert.equal(line(r,"controls")?.unitCost,cost);
    assert.equal(r.pricing.finalLaborHours,8+2*(2.25+controlHours)+1);
  }
});
test("Addition exhaust scope does not multiply existing circuit cable or ceiling-fan labor",()=>{
  const existing={...base,ceilingFans:1,circuitCount:1,routeLength:50};
  const without=calculateAdditionEstimate(existing,settings,book);
  const withFan=calculateAdditionEstimate({...existing,bathroomExhaust:scope} as AdditionInputRecord,settings,book);
  assert.deepEqual(withFan.assembly.filter(l=>!l.id.startsWith("addition-exhaust-")),without.assembly);
  assert.equal(withFan.pricing.finalLaborHours!-without.pricing.finalLaborHours!,6.5);
  assert.ok(withFan.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.code==="ADDITION_SUPPLIED_FAN_SCOPE_REVIEW"));
});
test("Addition new optional exhaust scope survives API validation; old payload stays unchanged",()=>{
  const parse=(jobInputs:object)=>CreateQuoteBody.parse({module:"ADDITION",jobInputs,customerName:"QA",projectName:"Bath addition",proposalDescription:"Scope"}).jobInputs;
  assert.deepEqual(parse(inputs()),inputs());
  assert.deepEqual(parse(base),base);
});
test("Bathroom modern exhaust assembly and labor remain at established baseline",()=>{
  const bath:BathroomInputRecord={circuitConfigurationVersion:2,gfciReceptacles:0,additionalReceptacles:0,vanityLights:0,
    recessedLights:0,exhaustFans:2,fanLights:0,fanLightHeatUnits:0,heatedFloorCircuit:false,additionalSwitches:0,
    circuitOption:"Reuse existing circuit",customerSuppliedFixtures:true,notes:"",branchWiringLength:30,
    cableType:"12/2 NM-B",bathroomCircuits:[],fanControl:"Standard switch"};
  const r=calculateBathroomEstimate(bath,settings,book);
  assert.equal(r.pricing.finalLaborHours,8); // Shared setup1.5 + fans4.5 + controls1 + wiring1.
  assert.deepEqual(r.assembly.map(l=>[l.id,l.quantity,l.unitCost]),[
    ["exhaust-fans",2,119.291],["bathroom-wiring",30,.6],["bathroom-fan-controls",2,1.85],
    ["bathroom-device-boxes",2,3],["bathroom-decora-plates",2,4],
  ]);
  assert.equal(errors(r).length,0);
});
