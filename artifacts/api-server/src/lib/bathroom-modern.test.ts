import assert from "node:assert/strict";
import test from "node:test";
import { calculateBathroomEstimate, bathroomLaborBreakdown, type PriceBookItem } from "./estimating-engine";
import { defaultCircuit } from "@workspace/api-zod/remodel-circuits";
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness";
import { CreateQuoteBody } from "@workspace/api-zod";
import type { BathroomInputRecord } from "@workspace/db";

const settings={residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4};
const base:BathroomInputRecord={circuitConfigurationVersion:2,gfciReceptacles:1,additionalReceptacles:0,vanityLights:1,
  recessedLights:0,exhaustFans:1,fanLights:0,fanLightHeatUnits:0,heatedFloorCircuit:false,additionalSwitches:2,
  circuitOption:"Reuse existing circuit",customerSuppliedFixtures:true,notes:"Internal only",routeLength:30,branchWiringLength:20,
  panelManufacturer:"Siemens",cableType:"12/2 NM-B",bathroomCircuits:[],fanControl:"Standard switch"};
const typical:BathroomInputRecord={...base,additionalReceptacles:2,recessedLights:3,bathroomCircuits:[
  defaultCircuit("receptacles","Receptacles",1),{...defaultCircuit("lighting","Lighting/fan",1),amperage:15,cableType:"14/2 NM-B",protectionType:"AFCI"}]};
const large:BathroomInputRecord={...typical,fanLightHeatUnits:1,exhaustFans:0,heatedFloorCircuit:true,heatedFloorThermostat:true,
  showerLights:1,dimmers:1,smartSwitches:1,fanControl:"Humidity-sensing control",
  heatedFloorConfiguration:{...defaultCircuit("heated-floor","Heated floor",1),protectionType:"GFCI",routeLength:25}};
const row=(item:string,extra:Partial<PriceBookItem>={}):PriceBookItem=>({item,unitCost:item.includes("cable")?2:10,
  category:"Other",supplier:"QA only",manufacturer:null,manufacturerPartNumber:null,supplierSku:null,upc:null,sourceDate:"2026-09-26",
  amperage:null,poleCount:null,protectionType:null,isDefault:false,...extra});
function catalogFor(inputs:BathroomInputRecord) {
  const empty=calculateBathroomEstimate(inputs,settings,[]);
  const keys=new Set(empty.pricing.pricingWarnings.flatMap(w=>typeof w!=="string"&&typeof w.context?.itemKey==="string"?[w.context.itemKey]:[]));
  const items=[...keys].filter(k=>!k.includes("breaker")).map(k=>row(k));
  for(const [amperage,protectionType] of [[20,"Dual Function"],[15,"AFCI"],[20,"GFCI"]] as const)
    items.push(row(`Siemens ${amperage}A 1-pole ${protectionType} breaker`,{category:"Protection",manufacturer:"Siemens",amperage,poleCount:1,protectionType,unitCost:40}));
  return items;
}
for(const [name,inputs,count,footage] of [
  ["basic bathroom",base,0,0],["typical remodel",typical,2,60],["larger bathroom",large,3,85],
  ["existing circuits",{...base,additionalReceptacles:2,recessedLights:2,branchWiringLength:0},0,0],
] as Array<[string,BathroomInputRecord,number,number]>) test(`Bathroom v2 ${name}: takeoff to final quote`,()=>{
  const catalog=catalogFor(inputs),result=calculateBathroomEstimate(inputs,settings,catalog),p=result.pricing;
  assert.deepEqual(p.pricingWarnings.filter(w=>typeof w==="string"||w.severity==="error"),[]);
  assert.equal(result.assembly.some(hasUnresolvedMaterialCost),false);
  assert.equal(result.assembly.filter(l=>l.category==="Protection").reduce((s,l)=>s+l.quantity,0),count);
  const wires=result.assembly.filter(l=>l.id.startsWith("bathroom-home-run"));
  assert.equal(wires.reduce((s,l)=>s+l.quantity,0),footage);
  assert.equal(wires.reduce((s,l)=>s+l.extendedCost,0),footage*2);
  assert.equal(result.assembly.find(l=>l.id==="gfci-receptacles")?.quantity,1);
  assert.equal(result.assembly.find(l=>l.id==="vanity-lights")?.unitCost,0);
  assert.equal(p.materialCost,Number(result.assembly.reduce((s,l)=>s+l.extendedCost,0).toFixed(2)));
  assert.equal(p.laborCost,Number((p.finalLaborHours!*65).toFixed(2)));
  assert.equal(p.laborSellAmount,Number((p.finalLaborHours!*150).toFixed(2)));
  assert.equal(p.finalSellingPrice,Number(Math.max(p.materialCost*1.25+p.laborSellAmount!,(p.materialCost+p.laborCost)/.6).toFixed(2)));
  assert.equal(p.grossProfit,Number((p.finalSellingPrice-p.materialCost-p.laborCost).toFixed(2)));
  assert.ok(Math.abs(p.grossMargin-p.grossProfit/p.finalSellingPrice)<.0001);
  const parsed=CreateQuoteBody.parse({module:"BATHROOM",jobInputs:inputs,customerName:"QA",projectName:name,proposalDescription:"Scope"});
  assert.deepEqual(calculateBathroomEstimate(parsed.jobInputs as BathroomInputRecord,settings,catalog),result);
  const adjusted=calculateBathroomEstimate({...inputs,laborAdjustmentHours:-1},settings,catalog);
  assert.equal(adjusted.pricing.laborCost,p.laborCost-65);
  assert.equal(adjusted.pricing.laborSellAmount,p.laborSellAmount!-150);
});
test("Bathroom v2 floor shares a selected circuit without duplication; remodel labor is incremental",()=>{
  const inputs={...large,heatedFloorCircuitKey:"receptacles"},catalog=catalogFor(inputs);
  const result=calculateBathroomEstimate(inputs,settings,catalog);
  assert.equal(result.assembly.filter(l=>l.category==="Protection").reduce((s,l)=>s+l.quantity,0),2);
  assert.equal(result.assembly.some(l=>l.id==="bathroom-home-run-heated-floor"),false);
  const one=calculateBathroomEstimate(base,settings,catalogFor({...base,additionalReceptacles:1}));
  const two=calculateBathroomEstimate({...base,additionalReceptacles:1},settings,catalogFor({...base,additionalReceptacles:1}));
  assert.ok(Math.abs(two.pricing.finalLaborHours!-one.pricing.finalLaborHours!-.55)<1e-8);
});
test("Bathroom v2 rejects missing, duplicate, wrong manufacturer, incompatible cable and invalid floor references",()=>{
  const catalog=catalogFor(large);
  const breaker=catalog.find(r=>r.amperage===20&&r.protectionType==="Dual Function")!;
  for(const [i,book] of [
    [large,catalog.filter(r=>r.item!=="smart switch")],
    [large,[...catalog,breaker]],
    [{...large,panelManufacturer:"Eaton"},catalog],
    [{...large,bathroomCircuits:[{...defaultCircuit("bad","Bad",1),cableType:"14/2 NM-B"}]},catalog],
    [{...large,heatedFloorCircuitKey:"missing"},catalog],
    [{...typical,routeLength:0},catalog],
  ] as Array<[BathroomInputRecord,PriceBookItem[]]>){
    const r=calculateBathroomEstimate(i,settings,book);
    assert.ok(r.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.severity==="error"));
  }
});

test("Bathroom A–C: physical devices never multiply circuits, home runs or connectors",()=>{
  const a:BathroomInputRecord={...typical,recessedLights:0,additionalReceptacles:1,additionalSwitches:1};
  const catalog=catalogFor(a);
  const metrics=(i:BathroomInputRecord)=>{
    const result=calculateBathroomEstimate(i,settings,catalog);
    const qty=(prefix:string)=>result.assembly.filter(l=>l.id.startsWith(prefix)).reduce((s,l)=>s+l.quantity,0);
    return {result,breakers:result.assembly.filter(l=>l.category==="Protection").reduce((s,l)=>s+l.quantity,0),
      homeRuns:qty("bathroom-home-run"),connectors:qty("bathroom-circuit-connectors")};
  };
  const typicalResult=metrics(a);
  assert.deepEqual([typicalResult.breakers,typicalResult.homeRuns,typicalResult.connectors],[2,60,4]);
  assert.equal(typicalResult.result.assembly.find(l=>l.id==="bathroom-wiring")?.quantity,20);
  assert.equal(typicalResult.result.assembly.find(l=>l.id==="bathroom-home-run-receptacles")?.quantity,30);
  assert.equal(typicalResult.result.assembly.find(l=>l.id==="bathroom-home-run-lighting")?.quantity,30);
  const one={...a,bathroomCircuits:[a.bathroomCircuits![0]!]};
  for(const devices of [{gfciReceptacles:2,additionalReceptacles:0},{gfciReceptacles:1,additionalReceptacles:1},
    {gfciReceptacles:4,additionalReceptacles:5,recessedLights:8,exhaustFans:2,additionalSwitches:6}]) {
    const b=metrics({...one,...devices});
    assert.deepEqual([b.breakers,b.homeRuns,b.connectors],[1,30,2]);
    assert.equal(b.result.assembly.find(l=>l.id==="gfci-receptacles")?.quantity,devices.gfciReceptacles);
  }
  const c=metrics({...one,bathroomCircuits:[{...one.bathroomCircuits[0]!,quantity:2}]});
  assert.deepEqual([c.breakers,c.homeRuns,c.connectors],[2,60,4]);
  const override=metrics({...a,bathroomCircuits:[{...a.bathroomCircuits![0]!,routeLength:45},a.bathroomCircuits![1]!]});
  assert.equal(override.homeRuns,75);
  assert.equal(override.result.assembly.find(l=>l.id==="bathroom-wiring")?.quantity,20);
});

test("Bathroom labor diagnostics reconcile to real pricing without tuning rates or snapshot quantities",()=>{
  const corrected:BathroomInputRecord={...typical,recessedLights:0,additionalReceptacles:1,additionalSwitches:1};
  const previous={...corrected,bathroomCircuits:corrected.bathroomCircuits!.map((c,n)=>n===0?{...c,quantity:2}:c)};
  const catalog=catalogFor(corrected);
  const before=calculateBathroomEstimate(previous,settings,catalog);
  const after=calculateBathroomEstimate(corrected,settings,catalog);
  assert.ok(Math.abs(before.pricing.finalLaborHours!-after.pricing.finalLaborHours!-4)<1e-10);
  const diagnostic=bathroomLaborBreakdown(corrected);
  assert.equal(diagnostic.finalLaborHours,after.pricing.finalLaborHours);
  assert.equal(diagnostic.components.circuitHomeRuns,8);
  assert.ok(Math.abs(diagnostic.calculatedLaborHours-15.5166666667)<1e-8);
  for(const adjustment of [-2,0,2]) {
    const i={...corrected,laborAdjustmentHours:adjustment};
    const result=calculateBathroomEstimate(i,settings,catalog),d=bathroomLaborBreakdown(i);
    assert.equal(result.pricing.finalLaborHours,d.finalLaborHours);
    assert.equal(result.pricing.calculatedLaborHours,d.calculatedLaborHours);
    assert.equal(result.pricing.laborCost,Number((d.finalLaborHours*65).toFixed(2)));
    assert.equal(result.pricing.laborSellAmount,Number((d.finalLaborHours*150).toFixed(2)));
  }
  const restored=CreateQuoteBody.parse({module:"BATHROOM",jobInputs:JSON.parse(JSON.stringify(previous)),
    customerName:"QA",projectName:"Quantity recovery",proposalDescription:"Bathroom scope"});
  assert.equal((restored.jobInputs as BathroomInputRecord).bathroomCircuits![0]!.quantity,2);
  const reconstructed19=calculateBathroomEstimate({...previous,additionalReceptacles:0},settings,catalog);
  assert.equal(reconstructed19.pricing.finalLaborHours!.toFixed(1),"19.0");
});

test("Bathroom E–F: fixtures add labor; customer supply only removes equipment purchase",()=>{
  const i={...base,recessedLights:2};
  const catalog=catalogFor(i);
  const contractor=calculateBathroomEstimate({...i,customerSuppliedRecessedLights:false},settings,catalog);
  const supplied=calculateBathroomEstimate({...i,customerSuppliedRecessedLights:true},settings,catalog);
  assert.equal(contractor.pricing.finalLaborHours,supplied.pricing.finalLaborHours);
  assert.equal(supplied.assembly.find(l=>l.id==="vanity-lights")?.resolutionStatus,"CUSTOMER_SUPPLIED");
  assert.equal(supplied.assembly.find(l=>l.id==="recessed-lights")?.resolutionStatus,"CUSTOMER_SUPPLIED");
  assert.ok(supplied.assembly.filter(l=>l.resolutionStatus==="CUSTOMER_SUPPLIED").every(l=>!hasUnresolvedMaterialCost(l)&&l.extendedCost===0));
  for(const id of ["bathroom-wiring","bathroom-fixture-boxes","bathroom-device-boxes","bathroom-fan-controls"])
    assert.deepEqual(supplied.assembly.find(l=>l.id===id),contractor.assembly.find(l=>l.id===id));
  assert.ok(Math.abs(bathroomLaborBreakdown(i).finalLaborHours-bathroomLaborBreakdown(base).finalLaborHours-1.8)<1e-10);
});
