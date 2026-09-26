/**
 * Read-only reproducible diagnostic. Relevant company-2 catalog values read
 * 2026-09-26; not a seed, migration, or replacement pricing engine.
 * Run: pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/lib/bathroom-labor-audit.ts
 */
import {calculateBathroomEstimate,bathroomLaborBreakdown,type PriceBookItem} from "./estimating-engine";
import {defaultCircuit} from "@workspace/api-zod/remodel-circuits";
import {hasUnresolvedMaterialCost} from "@workspace/api-zod/pricing-readiness";
import type {BathroomInputRecord} from "@workspace/db";
const settings={residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4};
const row=(id:number,item:string,unitCost:number,supplierSku:string|null,manufacturer:string,manufacturerPartNumber:string,extra:Partial<PriceBookItem>={}):PriceBookItem=>({
  id,item,unitCost,unit:"ea",supplierSku,manufacturer,manufacturerPartNumber,category:"Other",supplier:"Northeast Electrical",
  sourceDate:"2026-08-25",upc:null,amperage:null,poleCount:null,protectionType:null,isDefault:false,...extra,
});
const catalog:PriceBookItem[]=[
  row(310,"Pass & Seymour S1-18-W 1-gang box — SKU 18134",2.4769,"18134","Pass & Seymour","S1-18-W",{sourceDate:"2026-08-27"}),
  row(311,"Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",1.85,"3211","Pass & Seymour","TM870-W",{amperage:15}),
  row(353,"Pass & Seymour 3232-TRW 15A TR duplex receptacle",1,"243085","Pass & Seymour","3232-TRW",{
    amperage:15,supplierCost:1,supplierUom:"ea",normalizedUnit:"ea",normalizedUnitCost:1,
    materialPreferences:[{kind:"exact",requestKey:"Pass & Seymour 3232-TRW 15A TR duplex receptacle"}]}),
  row(355,"Pass & Seymour 2097-TRWRW 20A TR self-test GFCI",27.753,"1020717","Pass & Seymour","2097-TRWRW",{amperage:20,protectionType:"GFCI"}),
  row(361,"Legrand radiant RWP26WCC10 1-gang screwless wall plate",0,"RWP26WCC10","Legrand","RWP26WCC10",{
    supplier:"Company default — set current cost",sourceDate:"2026-08-26"}),
  row(372,"Panasonic FV-0511VF1 exhaust fan",119.291,"1697956","Panasonic","FV-0511VF1"),
  row(378,"Siemens Q115AFC 15A 1-pole AFCI breaker",44,null,"Siemens","Q115AFC",{
    supplier:"Company baseline — edit current cost",amperage:15,poleCount:1,protectionType:"AFCI",category:"Protection"}),
  row(380,"Siemens QA115AFC 15A 1-pole AFCI breaker",52.233,"900554","Siemens","ITE QA115AFC",{
    amperage:15,poleCount:1,protectionType:"AFCI",category:"Protection"}),
  row(383,"Siemens Q120DF 20A 1-pole dual-function breaker",69.239,"942105","Siemens","ITE Q120DF",{
    amperage:20,poleCount:1,protectionType:"Dual Function",category:"Protection",supplierCost:69.239,supplierUom:"ea",
    normalizedUnit:"ea",normalizedUnitCost:69.239,materialPreferences:[{kind:"exact",requestKey:"Siemens 20A 1-pole Dual Function breaker"}]}),
  row(399,"12/2 NM-B cable",.562271,"3873","Wic.","WIC. ROMEX 12/2",{unit:"ft"}),
  row(400,"14/2 NM-B cable",.379697,"27892","Wic.","WIC. ROMEX 14/2",{unit:"ft"}),
  row(600,"Arlington NM94 plastic NM cable connector",.25399,"13845","Arlington","NM94",{
    supplierCost:25.399,supplierUom:"c",normalizedUnit:"ea",normalizedUnitCost:.25399,
    materialPreferences:["14/2 NM-B","12/2 NM-B","10/2 NM-B"].map(c=>({kind:"family",requestKey:`NM cable connector for ${c}`}))}),
];
const corrected:BathroomInputRecord={
  circuitConfigurationVersion:2,gfciReceptacles:1,additionalReceptacles:1,vanityLights:1,recessedLights:0,exhaustFans:1,
  fanLights:0,fanLightHeatUnits:0,heatedFloorCircuit:false,additionalSwitches:1,fanControl:"Standard switch",
  circuitOption:"Reuse existing circuit",customerSuppliedFixtures:true,notes:"",routeLength:30,branchWiringLength:20,
  panelManufacturer:"Siemens",gfciAmperage:20,cableType:"12/2 NM-B",laborAdjustmentHours:0,
  bathroomCircuits:[defaultCircuit("receptacles","Bathroom Receptacle Circuit",1),
    {...defaultCircuit("lighting","Lighting / Fan Circuit",1),amperage:15,cableType:"14/2 NM-B",protectionType:"AFCI"}],
};
const previous={...corrected,bathroomCircuits:corrected.bathroomCircuits!.map((c,n)=>n===0?{...c,quantity:2}:c)};
const cases={
  reconstructed19Hours:{...previous,additionalReceptacles:0},
  sameTwoDevicesBefore:previous,
  corrected,
};
console.log(JSON.stringify({catalogAsOf:"2026-09-26",note:"Reconstruction, not a recovered historical quote. Partial prices remain Needs Review.",
  settings,cases:Object.fromEntries(Object.entries(cases).map(([name,inputs])=>{
    const result=calculateBathroomEstimate(inputs,settings,catalog);
    return [name,{inputs,diagnostics:bathroomLaborBreakdown(inputs),pricing:result.pricing,
      homeRunFeet:result.assembly.filter(l=>l.id.startsWith("bathroom-home-run")).reduce((s,l)=>s+l.quantity,0),
      breakers:result.assembly.filter(l=>l.category==="Protection").reduce((s,l)=>s+l.quantity,0),
      connectors:result.assembly.filter(l=>l.id.startsWith("bathroom-circuit-connectors")).reduce((s,l)=>s+l.quantity,0),
      unresolved:result.assembly.filter(hasUnresolvedMaterialCost).map(l=>({id:l.id,description:l.description,status:l.resolutionStatus,source:l.source})),
      assembly:result.assembly}];
  }))},null,2));
