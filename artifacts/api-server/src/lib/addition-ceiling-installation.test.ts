import assert from "node:assert/strict";
import test from "node:test";
import { CreateQuoteBody } from "@workspace/api-zod";
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness";
import type { AdditionInputRecord } from "@workspace/db";
import { calculateAdditionEstimate, type PriceBookItem } from "./estimating-engine";

const settings={residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4};
const base: AdditionInputRecord={length:20,width:16,receptacles:0,switches:0,dimmers:0,recessedLights:0,
  ceilingFans:2,customerSuppliedFans:true,ceilingFanMaterialCostOverride:999,circuitCount:0,circuitEntries:[],
  routeLength:0,homeRunLength:50,panelManufacturer:"Siemens",breakerAmperage:20,breakerPoleCount:1,
  breakerProtectionType:"AFCI",cableType:"12/2 NM-B",crewSize:1,crewHours:8,notes:""};
const row=(id:number,item:string,cost:number,category:string,extra:Partial<PriceBookItem>={}):PriceBookItem=>({
  id,item,unitCost:cost,unit:"ea",category,supplier:"Synthetic QA",sourceDate:"2026-09-28",
  manufacturer:null,manufacturerPartNumber:null,supplierSku:null,upc:null,amperage:null,poleCount:null,
  protectionType:null,isDefault:false,...extra,
});
const book=[
  row(101,"QA selected fan-rated support kit",40,"Rough-in",{manufacturer:"QA",manufacturerPartNumber:"SUPPORT-1"}),
  row(102,"Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",2,"Controls",{manufacturer:"Pass & Seymour",manufacturerPartNumber:"TM870-W"}),
  row(103,"Pass & Seymour S1-18-W 1-gang box — SKU 18134",3,"Rough-in"),
  row(104,"Legrand radiant RWP26WCC10 1-gang screwless wall plate",4,"Trim"),
  row(105,"14/3 NM-B cable",.8,"Conductor",{unit:"ft"}),
  row(106,"Contractor-supplied ceiling fan",150,"Equipment"),
];
const reuse={mode:"reuse",supportVerified:true,wiringVerified:true,verifiedFanQuantity:2};
const fresh={mode:"new",verifiedFanQuantity:2,supportCatalogId:101,supportManufacturer:"QA",supportPartNumber:"SUPPORT-1",
  supportVerified:true,wiringVerified:true,wiringLength:30,cableType:"14/3 NM-B"};
const input=(installation?:object,patch:Partial<AdditionInputRecord>={})=>
  ({...base,...patch,...(installation?{ceilingFanInstallation:installation}:{})} as AdditionInputRecord);
const calc=(installation?:object,catalog=book,patch:Partial<AdditionInputRecord>={})=>
  calculateAdditionEstimate(input(installation,patch),settings,catalog);
const errors=(r:ReturnType<typeof calc>)=>r.pricing.pricingWarnings.filter(w=>typeof w!=="string"&&w.severity==="error");

test("verified ceiling-fan reuse excludes new support/wire/control and stale purchase override without readiness error",()=>{
  const r=calc(reuse);
  assert.equal(errors(r).length,0);
  assert.equal(r.assembly.length,1);
  assert.equal(r.assembly[0]!.resolutionStatus,"CUSTOMER_SUPPLIED");
  assert.equal(r.assembly[0]!.extendedCost,0);
  assert.equal(r.pricing.finalLaborHours,11.5);
  assert.equal(r.pricing.laborCost,747.5);
  assert.equal(r.pricing.laborSellAmount,1725);
});
test("missing or incomplete ceiling-fan installation choice blocks both supply responsibilities",()=>{
  for(const installation of [undefined,{}, {mode:"reuse",supportVerified:true},{mode:"reuse",wiringVerified:true},
    {...fresh,supportVerified:false},{...fresh,wiringVerified:false},{...fresh,wiringLength:0}])
    for(const customerSuppliedFans of [true,false]) assert.ok(errors(calc(installation,book,{customerSuppliedFans})).length);
});
test("new fan scope adds exact selected support, control, box, plate and total wire, not equipment purchase",()=>{
  const r=calc(fresh);
  assert.equal(errors(r).length,0);
  const line=(id:string)=>r.assembly.find(l=>l.id===id)!;
  assert.equal(line("addition-fan-support").quantity,2);
  assert.equal(line("addition-fan-support").materialSnapshot?.catalogId,101);
  assert.equal(line("addition-fan-support").materialSnapshot?.manufacturerPartNumber,"SUPPORT-1");
  for(const id of ["controls","boxes","plates"]) assert.equal(line(`addition-fan-${id}`).quantity,2);
  assert.equal(line("addition-fan-wiring").quantity,30);
  assert.equal(r.pricing.materialCost,122);
  assert.equal(r.pricing.finalLaborHours,12.3); // Existing fan 1.75 + Addition switch .4 per location.
  assert.equal(r.pricing.laborCost,799.5);
  assert.equal(r.pricing.laborSellAmount,1845);
  assert.equal(r.pricing.finalSellingPrice,1997.5);
  assert.equal(r.pricing.grossProfit,1076);
  assert.equal(r.pricing.grossMargin,.5387);
});
test("support selection fails closed for deleted, foreign, changed identity, unpriced or wrong unit rows",()=>{
  for(const catalog of [book.slice(1),book.map(r=>r.id===101?{...r,id:999}:r),
    book.map(r=>r.id===101?{...r,manufacturerPartNumber:"OTHER"}:r),
    book.map(r=>r.id===101?{...r,unitCost:0}:r),
    book.map(r=>r.id===101?{...r,unit:"ft"}:r),
    book.map(r=>r.id===101?{...r,supplier:null}:r)]){
    const r=calc(fresh,catalog);
    assert.ok(errors(r).length);
    assert.equal(r.assembly.find(l=>l.id==="addition-fan-support")?.unitCost,0);
  }
});
test("every missing contractor installation material still blocks supplied fan readiness",()=>{
  for(const id of [102,103,104,105]){
    const r=calc(fresh,book.filter(l=>l.id!==id));
    assert.ok(errors(r).length);
    assert.ok(r.assembly.some(hasUnresolvedMaterialCost));
  }
});
test("supply toggle changes only purchase, reused path ignores stale new-installation selections",()=>{
  const supplied=calc(fresh),contractor=calc(fresh,book,{customerSuppliedFans:false,ceilingFanMaterialCostOverride:undefined});
  assert.deepEqual(supplied.assembly.slice(1),contractor.assembly.slice(1));
  assert.equal(supplied.pricing.finalLaborHours,contractor.pricing.finalLaborHours);
  assert.equal(contractor.assembly[0]!.extendedCost,300);
  assert.deepEqual(calc({...fresh,...reuse}),calc(reuse));
});
test("zero ceiling fans ignores installation configuration; new optional scope survives API parsing",()=>{
  assert.deepEqual(calc(fresh,book,{ceilingFans:0}),calc(undefined,book,{ceilingFans:0}));
  const payload=input(fresh,{circuitEntries:undefined});
  assert.deepEqual(CreateQuoteBody.parse({module:"ADDITION",jobInputs:payload,customerName:"QA",
    projectName:"Fan installation",proposalDescription:"Scope"}).jobInputs,payload);
});
test("changing fan quantity invalidates confirmations",()=>{
  assert.ok(errors(calc(reuse,book,{ceilingFans:3})).length);
  assert.ok(errors(calc(fresh,book,{ceilingFans:1})).length);
});
