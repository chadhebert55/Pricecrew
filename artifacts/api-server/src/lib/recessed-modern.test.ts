import assert from "node:assert/strict";
import test from "node:test";
import type { RecessedLightingInputRecord } from "@workspace/db";
import { CreateQuoteBody } from "@workspace/api-zod";
import { calculateRecessedLightingEstimate, type PriceBookItem } from "./estimating-engine";
import { recessedWiringPlan } from "@workspace/api-zod/remodel-circuits";
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness";

const settings={residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4};
const base:RecessedLightingInputRecord={circuitConfigurationVersion:2,roomLength:16,roomWidth:12,fixtureQuantity:4,fixtureSize:"4-inch",
  wiringOption:"New wiring from source",circuitOption:"Reuse existing circuit",switchType:"Single-pole",dimmerSelection:"No dimmer",
  customerSuppliedFixtures:false,ceilingHeight:"Standard 8-10 ft",accessDifficulty:"Attic access",laborAdjustmentHours:0,
  wireRunLength:40,wiringAllowanceFeet:0,additionalSwitches:0,additionalLights:0,notes:"Internal",panelManufacturer:"Siemens",
  breakerAmperage:15,breakerPoleCount:1,breakerProtectionType:"AFCI",cableType:"14/2 NM-B",
  wiringScope:"Existing wiring / fixture replacement",locationType:"Replace existing fixtures",
  lightingGroups:[{key:"main",quantity:4,controlType:"Existing switch"}],fixtureSpacingFeet:8,wireWastePercent:0};
const newJob:RecessedLightingInputRecord={...base,fixtureQuantity:6,wiringScope:"New wiring from nearby source",locationType:"Create new light locations",
  lightingGroups:[{key:"main",quantity:6,controlType:"Dimmer"}]};
const row=(item:string,extra:Partial<PriceBookItem>={}):PriceBookItem=>({item,unitCost:item.includes("cable")?2:10,category:"Other",
  supplier:"QA only",sourceDate:"2026-09-26",manufacturer:null,manufacturerPartNumber:null,supplierSku:null,upc:null,
  amperage:null,poleCount:null,protectionType:null,isDefault:false,...extra});
function catalogFor(inputs:RecessedLightingInputRecord){
  const missing=calculateRecessedLightingEstimate(inputs,settings,[]).pricing.pricingWarnings;
  return [...new Set(missing.flatMap(w=>typeof w!=="string"&&typeof w.context?.itemKey==="string"?[w.context.itemKey]:[]))]
    .filter(k=>!k.includes("breaker")).map(k=>row(k)).concat([
      row("Siemens 15A 1-pole AFCI breaker",{unitCost:40,category:"Protection",manufacturer:"Siemens",amperage:15,poleCount:1,protectionType:"AFCI"}),
      row("Siemens 20A 1-pole GFCI breaker",{unitCost:40,category:"Protection",manufacturer:"Siemens",amperage:20,poleCount:1,protectionType:"GFCI"}),
    ]);
}
const scenarios:Array<[string,RecessedLightingInputRecord,number,number,number,number]>=[
  ["simple replacement",base,0,0,0,3.05],
  ["typical new installation",newJob,0,80,1,8.85],
  ["new 15A AFCI home run",{...newJob,fixtureQuantity:8,wiringScope:"New home run to panel",lightingGroups:[{key:"main",quantity:8,controlType:"Dimmer"}]},1,96,1,13.45],
  ["3-way plus 4-way",{...newJob,lightingGroups:[{key:"main",quantity:6,controlType:"3-way switching",fourWayLocations:1,travelerLength:30}]},0,110,3,11.1],
  ["two dimmer groups",{...newJob,fixtureQuantity:12,lightingGroups:[{key:"a",quantity:6,controlType:"Dimmer"},{key:"b",quantity:6,controlType:"Dimmer"}]},0,120,2,15.45],
  ["difficult installation",{...newJob,accessDifficulty:"Limited / blind access",ceilingHeight:"High 11-14 ft",insulationPresent:true},0,80,1,12.305],
  ["customer-supplied fixtures",{...newJob,customerSuppliedFixtures:true},0,80,1,8.85],
];
for(const [name,inputs,breakers,footage,controls,hours] of scenarios)test(`Recessed v2 ${name}: complete price trace`,()=>{
  const catalog=catalogFor(inputs),result=calculateRecessedLightingEstimate(inputs,settings,catalog),p=result.pricing;
  assert.deepEqual(p.pricingWarnings.filter(w=>typeof w==="string"||w.severity==="error"),[]);
  assert.equal(result.assembly.some(hasUnresolvedMaterialCost),false);
  assert.equal(result.assembly.find(l=>l.id==="recessed-fixtures")?.quantity,inputs.fixtureQuantity);
  assert.equal(result.assembly.find(l=>l.id==="recessed-fixtures")?.extendedCost,inputs.customerSuppliedFixtures?0:inputs.fixtureQuantity*10);
  assert.equal(result.assembly.filter(l=>l.category==="Protection").reduce((s,l)=>s+l.quantity,0),breakers);
  assert.equal(result.assembly.filter(l=>l.category==="Controls").reduce((s,l)=>s+l.quantity,0),controls);
  assert.equal(result.assembly.filter(l=>l.category==="Conductor").reduce((s,l)=>s+l.quantity,0),footage);
  assert.equal(result.assembly.filter(l=>l.category==="Conductor").reduce((s,l)=>s+l.extendedCost,0),footage*2);
  assert.ok(Math.abs(p.finalLaborHours!-hours)<1e-8,`${p.finalLaborHours} versus ${hours}`);
  assert.equal(p.materialCost,Number(result.assembly.reduce((s,l)=>s+l.extendedCost,0).toFixed(2)));
  assert.equal(p.laborCost,Number((hours*65).toFixed(2)));
  assert.equal(p.laborSellAmount,Number((hours*150).toFixed(2)));
  assert.equal(p.finalSellingPrice,Number(Math.max(p.materialCost*1.25+p.laborSellAmount!,(p.materialCost+p.laborCost)/.6).toFixed(2)));
  assert.equal(p.grossProfit,Number((p.finalSellingPrice-p.materialCost-p.laborCost).toFixed(2)));
  assert.ok(Math.abs(p.grossMargin-p.grossProfit/p.finalSellingPrice)<.0001);
  const parsed=CreateQuoteBody.parse({module:"RECESSED_LIGHTING",jobInputs:inputs,customerName:"QA",projectName:name,proposalDescription:"Customer scope"});
  assert.deepEqual(calculateRecessedLightingEstimate(parsed.jobInputs as RecessedLightingInputRecord,settings,catalog),result);
  const adjusted=calculateRecessedLightingEstimate({...inputs,laborAdjustmentHours:-1},settings,catalog);
  assert.equal(adjusted.pricing.laborCost,Number(((hours-1)*65).toFixed(2)));
});
test("Recessed v2 scope is authoritative; planning is separate; conductor sizes stay separate",()=>{
  const input={...newJob,breakerAmperage:20,breakerProtectionType:"GFCI",protectionUpgrade:true,
    lightingGroups:[{key:"main",quantity:6,controlType:"3-way dimmer",fourWayLocations:1,travelerLength:30}],
    wireWastePercent:10,wiringAllowanceFeet:5};
  const result=calculateRecessedLightingEstimate(input,settings,catalogFor(input));
  assert.ok(result.assembly.some(l=>l.description.includes("12/2 NM-B")&&l.quantity===93));
  assert.ok(result.assembly.some(l=>l.description.includes("12/3 NM-B")&&l.quantity===30));
  assert.ok(result.assembly.some(l=>l.category==="Protection"&&l.description.includes("20A")&&l.description.includes("GFCI")));
  const changedRoom=calculateRecessedLightingEstimate({...input,roomLength:99,roomWidth:99},settings,catalogFor(input));
  assert.equal(changedRoom.pricing.finalSellingPrice,result.pricing.finalSellingPrice);
  const stale=calculateRecessedLightingEstimate({...base,circuitOption:"New dedicated circuit",additionalLights:10,additionalSwitches:10,protectionUpgrade:true},settings,catalogFor(base));
  assert.equal(stale.assembly.some(l=>l.category==="Protection"||l.category==="Conductor"||l.category==="Controls"),false);
  assert.equal(stale.assembly.find(l=>l.id==="recessed-fixtures")?.quantity,4);
  assert.equal(recessedWiringPlan({...input,wiringScope:"Existing wiring / fixture replacement"}).total,0);
});
test("Recessed v2 blocks incomplete groups, unsafe wiring and ambiguous/missing pricing",()=>{
  const home={...newJob,wiringScope:"New home run to panel"},catalog=catalogFor(home),breaker=catalog.find(r=>r.amperage===15)!;
  for(const [inputs,book] of [
    [{...home,breakerAmperage:20,advancedCableType:"14/2 NM-B"},catalog],
    [{...home,wireRunLength:0},catalog],
    [{...home,lightingGroups:[{key:"main",quantity:7,controlType:"Dimmer"}]},catalog],
    [{...home,lightingGroups:[{key:"main",quantity:6,controlType:"3-way switching",travelerLength:0}]},catalog],
    [home,[...catalog,breaker]],
    [home,catalog.filter(r=>r.item!=="recessed fixture installation consumables")],
    [{...home,panelManufacturer:"Eaton"},catalog],
  ] as Array<[RecessedLightingInputRecord,PriceBookItem[]]>){
    const result=calculateRecessedLightingEstimate(inputs,settings,book);
    assert.ok(result.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.severity==="error"));
  }
});
