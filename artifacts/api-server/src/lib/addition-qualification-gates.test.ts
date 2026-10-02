import test from "node:test";
import assert from "node:assert/strict";
import type { AdditionInputRecord } from "@workspace/db";
import { calculateAdditionEstimate, type PriceBookItem } from "./estimating-engine";
import { defaultLaundryRoom, requiredRoomCircuits, roomCircuitSuggestion, additionSubpanelRequest } from "@workspace/api-zod/addition-rooms";
import { compatibleStackedPlate, STACKED_CONTROL, STACKED_PLATE } from "@workspace/api-zod/catalog-components";

// Every auxiliary product and price in this file is isolated synthetic QA data.
const settings = { residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4 };
const base: AdditionInputRecord = {
  additionScopeVersion:3,length:20,width:16,receptacles:0,switches:0,dimmers:0,recessedLights:0,
  ceilingFans:0,customerSuppliedFans:true,circuitCount:0,circuitEntries:[],routeLength:0,homeRunLength:50,
  panelManufacturer:"Siemens",breakerAmperage:20,breakerPoleCount:1,breakerProtectionType:"AFCI",
  cableType:"12/2 NM-B",crewSize:1,crewHours:0,notes:"",
};
const row=(id:number,item:string,unitCost:number,extra:Partial<PriceBookItem>={}):PriceBookItem=>({
  id,item,unitCost,category:"Controls",unit:"ea",manufacturer:"QA",manufacturerPartNumber:`QA-${id}`,
  supplier:"Synthetic",supplierSku:`QA-${id}`,sourceDate:"2026-10-02",upc:null,amperage:null,poleCount:null,
  protectionType:null,isDefault:false,...extra,
});
const calc=(patch:Partial<AdditionInputRecord>,book:PriceBookItem[]=[])=>calculateAdditionEstimate({...base,...patch},settings,book);
const errors=(r:ReturnType<typeof calc>)=>r.pricing.pricingWarnings.filter(w=>typeof w!=="string"&&w.severity==="error");
const has=(r:ReturnType<typeof calc>,code:string)=>errors(r).some(w=>typeof w!=="string"&&w.code===code);
function trace(name:string,r:ReturnType<typeof calc>) {
  assert.ok(typeof r.pricing.finalLaborHours === "number");
  assert.equal(r.pricing.materialCost,Math.round(r.assembly.reduce((s,l)=>s+l.extendedCost,0)*100)/100);
  assert.equal(r.pricing.laborCost,r.pricing.finalLaborHours*65);
  assert.equal(r.pricing.laborSellAmount,r.pricing.finalLaborHours*150);
  assert.equal(r.pricing.grossProfit,Math.round((r.pricing.finalSellingPrice-r.pricing.materialCost-r.pricing.laborCost)*100)/100);
  if(process.env.QUALIFICATION_TRACE) console.log(JSON.stringify({name,
    complete:errors(r).length===0,components:r.assembly.map(l=>({id:l.id,quantity:l.quantity,unit:l.unit,unitCost:l.unitCost,extendedCost:l.extendedCost})),
    materialCost:r.pricing.materialCost,personHours:r.pricing.finalLaborHours,loadedLabor:r.pricing.laborCost,
    customerLabor:r.pricing.laborSellAmount,sellingPrice:r.pricing.finalSellingPrice,grossProfit:r.pricing.grossProfit,margin:r.pricing.grossMargin}));
}
for(const amps of [60,100] as const) for(const material of ["Aluminum","Copper"] as const)
test(`${amps}A ${material}: qualified feeder is one cable-foot per route-foot, but incomplete subpanel stays blocked`,()=>{
 const requestKey=`Addition ${amps}A ${material} SER feeder`;
 const feeder=row(1,"Synthetic approved SER cable",material==="Aluminum"?2:4,{unit:"ft",category:"Conductor",
  materialPreferences:[{requestKey,kind:"exact",verifiedComponent:{kind:"Qualified Addition SER feeder",
   manufacturer:"QA",manufacturerPartNumber:"QA-1",source:"Synthetic request-specific approval; no real sizing claim"}}]});
 const qualify=(p:PriceBookItem,role:"load center"|"feeder breaker")=>({...p,materialPreferences:[{
  requestKey:additionSubpanelRequest("Siemens",amps,role),kind:"exact" as const,verifiedComponent:{
   kind:`Qualified Addition ${role}`,manufacturer:p.manufacturer!,manufacturerPartNumber:p.manufacturerPartNumber!,
   source:"Synthetic request-specific product and family approval only"}}]});
 const panel=qualify(row(2,`${amps}A subpanel load center`,100,{category:"Panel",manufacturer:"Siemens"}),"load center");
 const breaker=qualify(row(3,"Synthetic feeder breaker",20,{manufacturer:"Siemens",category:"Protection",amperage:amps,poleCount:2,protectionType:"Standard"}),"feeder breaker");
 const inputs:Partial<AdditionInputRecord>={subpanelOption:`${amps}A Subpanel`,feederMaterial:material,feederDistance:50,subpanelLaborHours:12};
 const r=calc(inputs,[feeder,panel,breaker]);
 assert.ok(has(r,"ADDITION_SUBPANEL_SCOPE_UNQUALIFIED"));
 assert.equal(r.assembly.filter(l=>l.id.startsWith("addition-subpanel")).length,3);
 assert.equal(r.assembly.find(l=>l.id==="addition-subpanel-feeder")?.quantity,50);
 assert.equal(r.pricing.materialCost,120+50*feeder.unitCost);
 assert.equal(r.pricing.finalLaborHours,12);
 const unqualified=calc(inputs,[feeder,{...panel,materialPreferences:[]},{...breaker,materialPreferences:[]}]);
 assert.equal(unqualified.assembly.find(l=>l.id==="addition-subpanel-load-center")?.unitCost,0);
 assert.equal(unqualified.assembly.find(l=>l.id==="addition-subpanel-feeder-breaker")?.unitCost,0);
 assert.equal(calc({...inputs,feederDistance:75},[feeder,panel,breaker]).pricing.materialCost,120+75*feeder.unitCost);
 assert.equal(calc(inputs,[{...feeder,unit:"ea"},panel,breaker]).assembly.find(l=>l.id==="addition-subpanel-feeder")?.unitCost,0);
 assert.equal(calc(inputs,[feeder,{...panel,manufacturer:"GE"},breaker]).assembly.find(l=>l.id==="addition-subpanel-load-center")?.unitCost,0);
 assert.equal(calc(inputs,[feeder,panel,{...breaker,manufacturer:"GE"}]).assembly.find(l=>l.id==="addition-subpanel-feeder-breaker")?.unitCost,0);
 assert.equal(calc(inputs,[feeder,panel,breaker,qualify({...breaker,id:4,manufacturerPartNumber:"QA-other"},"feeder breaker")]).assembly.find(l=>l.id==="addition-subpanel-feeder-breaker")?.unitCost,0);
 trace(`${amps}A ${material}: partial assembly, NOT Ready`,r);
});
for(const [manufacturer,panelFamily] of [["Eaton","br"],["Square D","homeline"]] as const)
test(`${manufacturer}: subpanel exact component approval is family-specific and not interchangeable`,()=>{
 const qualify=(role:"load center"|"feeder breaker",id:number)=>row(id,`Synthetic ${role}`,25,{
  category:role==="load center"?"Panel":"Protection",
  manufacturer,panelFamily,amperage:60,poleCount:2,protectionType:"Standard",
  materialPreferences:[{requestKey:additionSubpanelRequest(manufacturer,60,role),kind:"exact",verifiedComponent:{
   kind:`Qualified Addition ${role}`,manufacturer,manufacturerPartNumber:`QA-${id}`,source:"Synthetic family-bound qualification"}}]});
 const book=[qualify("load center",60),qualify("feeder breaker",61)];
 const inputs:Partial<AdditionInputRecord>={panelManufacturer:manufacturer,subpanelOption:"60A Subpanel",feederMaterial:"Aluminum",feederDistance:50,subpanelLaborHours:12};
 const matched=calc(inputs,book),wrong=calc({...inputs,panelManufacturer:"Siemens"},book);
 for(const id of ["addition-subpanel-load-center","addition-subpanel-feeder-breaker"]){
  assert.equal(matched.assembly.find(l=>l.id===id)?.unitCost,25);
  assert.equal(wrong.assembly.find(l=>l.id===id)?.unitCost,0);
 }
 assert.ok(has(matched,"ADDITION_SUBPANEL_SCOPE_UNQUALIFIED"));
});
for(const dryerType of ["None","Gas","Electric"] as const)
test(`Laundry ${dryerType}: one schedule, no fabricated connection device or hidden labor`,()=>{
 const laundryRoom={...defaultLaundryRoom,dryerType,generalReceptacles:0,lightingLocations:0,switches:0};
 const circuitEntries=requiredRoomCircuits(undefined,laundryRoom).map(role=>({...roomCircuitSuggestion(role),roomCircuitReviewed:true}));
 const inputs={laundryRoom,circuitEntries};
 const book=circuitEntries.flatMap((c,i)=>[
  row(50+i*2,`${c.cableType} cable`,i+1,{unit:"ft",category:"Conductor"}),
  row(51+i*2,`Synthetic circuit breaker ${i}`,20+i*10,{category:"Protection",manufacturer:"Siemens",
    amperage:c.amperage,poleCount:c.poleCount,protectionType:c.protectionType}),
 ]);
 const r=calc(inputs,book);
 assert.equal(r.pricing.materialCost,dryerType==="Electric"?200:70);
 assert.ok(has(r,"ADDITION_ROOM_SCOPE_REQUIRED"));
 assert.equal(r.assembly.filter(l=>l.category==="Protection").length,dryerType==="Electric"?2:1);
 assert.equal(r.assembly.filter(l=>l.id.endsWith("-cable")).length,dryerType==="Electric"?2:1);
 assert.equal(r.pricing.finalLaborHours,(dryerType==="Electric"?2:1)*2.5);
 assert.ok(!r.assembly.some(l=>/connection|dryer-receptacle|washer-receptacle/.test(l.id)));
 if(dryerType==="Electric") for(const dryerConnectionMethod of ["Receptacle","Hardwired"] as const) {
   const selected=calc({...inputs,laundryRoom:{...laundryRoom,dryerConnectionMethod}},book);
   assert.ok(has(selected,"ADDITION_ROOM_SCOPE_REQUIRED"),"method alone cannot qualify missing materials");
   assert.deepEqual(selected.assembly,r.assembly);
   assert.equal(selected.pricing.finalLaborHours,r.pricing.finalLaborHours);
 }
 trace(`Laundry ${dryerType}: circuit-only incomplete scope, NOT Ready`,r);
});
const fanBook=[
 row(11,"Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",2),
 row(12,"fan timer switch",25),row(13,"fan humidity-sensing control",35),
 row(14,"Pass & Seymour S1-18-W 1-gang box — SKU 18134",2,{category:"Rough-in"}),
 row(15,"Legrand radiant RWP26WCC10 1-gang screwless wall plate",3,{category:"Trim"}),
 row(16,"14/3 NM-B cable",1,{category:"Conductor",unit:"ft"}),
];
for(const control of ["Standard switch","Timer switch","Humidity-sensing control"] as const)
test(`Exhaust fan ${control}: existing incremental labor and qualified synthetic product path`,()=>{
 const r=calc({bathroomExhaust:{quantity:1,customerSupplied:true,control,cableType:"14/3 NM-B",wiringLength:30}},fanBook);
 assert.equal(errors(r).length,0);
 assert.equal(r.pricing.finalLaborHours,2.25+(control==="Standard switch"?.5:.75)+1);
 assert.equal(r.assembly.find(l=>l.id==="addition-exhaust-fans")?.extendedCost,0);
 trace(`Exhaust fan ${control}: synthetic qualified priced scope`,r);
});
for(const equipmentType of ["Fan/light","Fan/light/heat"] as const)
test(`${equipmentType}: pricing one control does not establish complete controls/wiring`,()=>{
 const r=calc({bathroomExhaust:{equipmentType,quantity:1,customerSupplied:true,control:"Standard switch",cableType:"14/3 NM-B",wiringLength:30}},fanBook);
 assert.ok(has(r,"ADDITION_ROOM_SCOPE_REQUIRED"));
 assert.equal(r.pricing.finalLaborHours,(equipmentType==="Fan/light"?2.5:3.5)+.5+1);
});
test("exact plate pair evidence survives only its named device and plate identities",()=>{
 const control=row(20,"Synthetic stacked",21.48,{materialPreferences:[{requestKey:STACKED_CONTROL,kind:"exact",
  verifiedComponent:{kind:"Stacked single-pole/single-pole",manufacturer:"QA",manufacturerPartNumber:"QA-20",source:"Synthetic device evidence",plateOpening:"decorator"}}]});
 const plate=row(21,"Synthetic plate",1,{materialPreferences:[{requestKey:STACKED_PLATE,kind:"exact",verifiedComponent:{
   kind:"Matching white wall plate",manufacturer:"QA",manufacturerPartNumber:"QA-21",source:"Synthetic plate identity",plateOpening:"decorator",
   compatibleControl:{manufacturer:"QA",manufacturerPartNumber:"QA-20",source:"Synthetic pair evidence, not RCD11W/TP26-W approval"}}}]});
 assert.ok(compatibleStackedPlate(control,plate));
 assert.ok(!compatibleStackedPlate({...control,manufacturerPartNumber:"QA-new"},plate));
 assert.ok(!compatibleStackedPlate(control,{...plate,manufacturerPartNumber:"QA-new"}));
 const r=calc({bathroomExhaust:{quantity:1,customerSupplied:true,control:"Stacked single-pole/single-pole",
  cableType:"14/3 NM-B",wiringLength:30,stackedWiringVerified:true,verifiedControlQuantity:1}},[...fanBook,control,plate]);
 assert.equal(errors(r).length,0);
 assert.equal(r.pricing.finalLaborHours,3.75);
 trace("Synthetic stacked pair: qualified one-yoke scope, not real RCD11W plate approval",r);
});
