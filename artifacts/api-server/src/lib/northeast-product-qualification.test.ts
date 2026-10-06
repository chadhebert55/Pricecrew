import assert from "node:assert/strict";
import test from "node:test";
import {parsePriceBookImport} from "./price-book-import";
import {calculateAdditionEstimate,calculateEvChargerEstimate,type PriceBookItem} from "./estimating-engine";
import {NEMA_1450,STACKED_CONTROL,STACKED_PLATE} from "@workspace/api-zod/catalog-components";
import type {AdditionInputRecord,EvChargerInputRecord} from "@workspace/db";

// Contractor-provided prices as of 2026-10-02. Test data only, never seed/migration data.
export const productCsv=`item,category,unit,unitCost,packageQuantity,normalizedUnit,supplier,manufacturer,manufacturerPartNumber,supplierSku,sourceDate
PAS 3894WREV WR STR BLD RECP 50A 12,Connection,EA,57.32,1,ea,Northeast Electrical,Pass & Seymour / Legrand,3894WREV,163554,2026-10-02
Pass & Seymour RCD11W Two Single Pole Switches 15A 120V White,Controls,EA,21.48,1,ea,Northeast Electrical,Pass & Seymour / Legrand,RCD11W,1095902,2026-10-02
1-Gang Wall Plate Decorator Nylon Standard White,Trim,C,46.83,100,ea,Northeast Electrical,Pass & Seymour / Legrand,TP26-W,17242,2026-10-02`;
const imported=parsePriceBookImport(productCsv,[]);
const rows:PriceBookItem[]=imported.rows.map((r,i)=>({...r.incoming,id:900+i,isDefault:false,isContractorOwned:false}));
const proof=(r:PriceBookItem,requestKey:string,kind:string):PriceBookItem=>({...r,materialPreferences:[{requestKey,kind:"exact",verifiedComponent:{
  kind,manufacturer:r.manufacturer!,manufacturerPartNumber:r.manufacturerPartNumber!,
  source:requestKey===NEMA_1450
    ?"2026-10-02: https://www.legrand.us/wiring-devices/outlets-and-receptacles/power-outlets/50a-weather-resistant-electrical-outlet-for-ev-chargers/p/ps-3894wrev"
    :"2026-10-02: RCD11W device only; TP26-W pairing NOT qualified. https://www.legrand.us/wiring-devices/radiant-collection/switches/radiant-two-single-pole-switches-white/p/rcd11w",
  ...(requestKey===STACKED_CONTROL?{plateOpening:"decorator" as const}:{})
}}]});
const catalog=[proof(rows[0],NEMA_1450,"NEMA 14-50R"),proof(rows[1],STACKED_CONTROL,"Stacked single-pole/single-pole"),rows[2]];
const settings={residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4};
function financialTrace(name:string,r:ReturnType<typeof calculateAdditionEstimate>){
 assert.ok(typeof r.pricing.finalLaborHours === "number");
 const round=(n:number)=>Math.round(n*100)/100;
 assert.equal(r.pricing.materialCost,round(r.assembly.reduce((s,l)=>s+l.extendedCost,0)));
 assert.equal(r.pricing.laborCost,round(r.pricing.finalLaborHours*65));
 assert.equal(r.pricing.laborSellAmount,round(r.pricing.finalLaborHours*150));
 assert.equal(r.pricing.grossProfit,round(r.pricing.finalSellingPrice-r.pricing.materialCost-r.pricing.laborCost));
 if(process.env.QUALIFICATION_TRACE) console.log(JSON.stringify({name,complete:false,
  components:r.assembly.map(l=>({id:l.id,quantity:l.quantity,unit:l.unit,unitCost:l.unitCost,extendedCost:l.extendedCost})),
  materialCost:r.pricing.materialCost,personHours:r.pricing.finalLaborHours,loadedLabor:r.pricing.laborCost,
  customerLabor:r.pricing.laborSellAmount,sellingPrice:r.pricing.finalSellingPrice,grossProfit:r.pricing.grossProfit,margin:r.pricing.grossMargin}));
}
const addition:AdditionInputRecord={additionScopeVersion:2,length:20,width:16,receptacles:0,switches:0,dimmers:0,recessedLights:0,
 ceilingFans:0,customerSuppliedFans:true,circuitCount:0,routeLength:0,homeRunLength:0,panelManufacturer:"Siemens",
 breakerAmperage:20,breakerPoleCount:1,breakerProtectionType:"AFCI",cableType:"12/2 NM-B",crewSize:1,crewHours:0,notes:"",
 bathroomExhaust:{quantity:1,customerSupplied:true,control:"Stacked single-pole/single-pole",cableType:"14/3 NM-B",
 wiringLength:30,stackedWiringVerified:true,verifiedControlQuantity:1}};
const ev:EvChargerInputRecord={chargerQuantity:1,chargerSupply:"Customer Provided",connection:"NEMA 14-50 Receptacle",
 wiringMethod:"Romex (NM-B)",cableType:"6/3 NM-B",routeLength:30,panelManufacturer:"Siemens",circuitAmps:"50",breakerRequirement:"GFCI 2-Pole",
 difficulty:"Standard",access:"Standard",loadManagement:"None",disconnect:"Not Required",surgeProtection:"None",
 panelModifications:"None",permit:"Not Required",laborAdjustmentHours:0} as EvChargerInputRecord;
test("three exact Northeast products preview as inserts without description substitution",()=>{
 assert.equal(imported.rows.length,3);
 assert.ok(imported.rows.every(r=>r.action==="insert"&&r.status==="proposed"));
 assert.deepEqual(rows.map(r=>[r.manufacturerPartNumber,r.supplierSku,r.unitCost]),[
  ["3894WREV","163554",57.32],["RCD11W","1095902",21.48],["TP26-W","17242",.4683]]);
});
test("TP26-W retains per-100 basis and never becomes 46.83 each",()=>{
 const p=rows[2]; assert.equal(p.supplierCost,46.83);assert.equal(p.supplierUom,"C");
 assert.equal(p.supplierUnitQuantity,100);assert.equal(p.unit,"ea");assert.equal(p.normalizedUnitCost,.4683);
 assert.equal(p.unitCost,.4683);assert.equal(p.unitCost.toFixed(2),"0.47");
});
test("qualified EV request resolves exact 3894WREV at 57.32 each",()=>{
 const r=calculateEvChargerEstimate(ev,settings,catalog),l=r.assembly.find(l=>l.id==="receptacle")!;
 assert.equal(l.materialSnapshot?.manufacturerPartNumber,"3894WREV");assert.equal(l.materialSnapshot?.supplierSku,"163554");
 assert.equal(l.unitCost,57.32);assert.equal(l.extendedCost,57.32);
});
test("standard Addition receptacle request does not select the EV receptacle",()=>{
 const r=calculateAdditionEstimate({...addition,bathroomExhaust:undefined,receptacles:1},settings,catalog);
 assert.ok(!r.assembly.some(l=>l.materialSnapshot?.manufacturerPartNumber==="3894WREV"));
 const ordinary=r.assembly.find(l=>l.id==="addition-receptacles")!;assert.equal(ordinary.unitCost,0);
});
test("RCD11W costs 21.48 and contributes one 0.5-hour control allowance, with separate fan and wiring labor",()=>{
 const r=calculateAdditionEstimate(addition,settings,catalog),l=r.assembly.find(l=>l.id==="addition-exhaust-controls")!;
 assert.equal(l.quantity,1);assert.equal(l.unitCost,21.48);assert.equal(l.materialSnapshot?.manufacturerPartNumber,"RCD11W");
 assert.equal(r.pricing.finalLaborHours,2.25+.5+30/30);
 const single=calculateAdditionEstimate({...addition,bathroomExhaust:{...addition.bathroomExhaust!,control:"Standard switch"}},settings,catalog);
 assert.equal(r.pricing.finalLaborHours,single.pricing.finalLaborHours);
 assert.equal(r.assembly.find(l=>l.id==="addition-exhaust-fans")?.extendedCost,0);
 financialTrace("Exact RCD11W at contractor cost; plate and other materials unresolved",r);
});
test("priced TP26-W without independently established pair qualification remains unresolved",()=>{
 const barePreference={...rows[2],materialPreferences:[{requestKey:STACKED_PLATE,kind:"exact" as const}]};
 for(const p of [rows[2],barePreference]){
  const r=calculateAdditionEstimate(addition,settings,[catalog[0],catalog[1],p]);
  assert.equal(r.assembly.find(l=>l.id==="addition-exhaust-plates")?.unitCost,0);
  assert.ok(r.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.code==="ADDITION_EXHAUST_CONTROL_REQUIRED"));
 }
});
test("matching decorator openings alone do not qualify RCD11W with TP26-W",()=>{
 const plate={...rows[2],materialPreferences:[{requestKey:STACKED_PLATE,kind:"exact" as const,
  verifiedComponent:{kind:"Matching white wall plate",manufacturer:rows[2].manufacturer!,
   manufacturerPartNumber:"TP26-W",source:"Plate product identity only; no pair approval",plateOpening:"decorator" as const}}]};
 const r=calculateAdditionEstimate(addition,settings,[catalog[0],catalog[1],plate]);
 assert.equal(r.assembly.find(l=>l.id==="addition-exhaust-plates")?.unitCost,0);
 assert.ok(r.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.code==="ADDITION_EXHAUST_CONTROL_REQUIRED"));
});
test("receptacle qualification does not remove neutral or missing breaker blockers",()=>{
 for(const patch of [{wiringMethod:"EMT Conduit"},{wiringMethod:"PVC Conduit"},{cableType:"8/2 NM-B" as const},{wiringMethod:"SER Cable",cableType:"8/2 SER" as const}]){
  const r=calculateEvChargerEstimate({...ev,...patch},settings,catalog);
  assert.ok(r.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.code==="EV_NEUTRAL_SCOPE_REQUIRED"));
  assert.ok(r.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.code==="EXACT_BREAKER_UNRESOLVED"));
  assert.equal(r.assembly.find(l=>l.id==="receptacle")?.unitCost,57.32);
 }
});
test("future supplier preview updates exact existing products and preserves C-to-each conversion",()=>{
 const existing=rows.map(r=>({...r,id:r.id!,unit:r.unit!,isContractorOwned:false}));
 const repeat=parsePriceBookImport(productCsv,existing);
 assert.ok(repeat.rows.every(r=>r.action!=="insert"));
 const changed=parsePriceBookImport(productCsv.replace(",46.83,100,",",47.83,100,"),existing);
 const plate=changed.rows.find(r=>r.incoming.manufacturerPartNumber==="TP26-W")!;
 assert.equal(plate.action,"update");assert.equal(plate.matchedItemId,902);
 assert.equal(plate.incoming.supplierCost,47.83);assert.equal(plate.incoming.unitCost,.4783);
});
test("priced 3894WREV, neutral-bearing cable and breaker cannot bypass unmodeled box/cover scope",()=>{
 // Auxiliary costs are isolated QA values, not company product/pricing decisions.
 const auxiliary:PriceBookItem[]=[
  {...rows[0],id:950,item:"6/3 NM-B cable",category:"Conductor",unit:"ft",unitCost:1,manufacturerPartNumber:"QA-WIRE",
   supplierCost:null,supplierUom:null,normalizedUnit:"ft",normalizedUnitCost:1,supplierSku:"QA-WIRE"},
  {...rows[0],id:951,item:"QA Siemens QF250A",category:"Protection",manufacturer:"Siemens",manufacturerPartNumber:"QF250A",
   amperage:50,poleCount:2,protectionType:"GFCI",unitCost:100,supplierCost:null,supplierUom:null,normalizedUnitCost:100,supplierSku:"QA-BREAKER"},
 ];
 const r=calculateEvChargerEstimate(ev,settings,[...catalog,...auxiliary]);
 assert.equal(r.pricing.materialCost,187.32);
 assert.ok(r.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.code==="EV_RECEPTACLE_INSTALLATION_UNQUALIFIED"),
  "a qualified receptacle does not certify a complete box/cover installation");
 financialTrace("Exact 3894WREV with synthetic cable/breaker costs; box/cover unresolved",r);
});
