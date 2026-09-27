// Read-only audit runner. Requires local evidence; never seeds or changes catalog data.
import { readFile, writeFile } from "node:fs/promises";
import { calculateBathroomEstimate, bathroomLaborBreakdown } from "./estimating-engine";
import { normalizeSupplierCost } from "./material-resolution";
const root=process.env.AUDIT_OUTPUT??"/home/user/workspace/pricecrew-audit-evidence";
const raw=JSON.parse(await readFile(process.env.AUDIT_CATALOG!,"utf8"));
const numeric=new Set(["unitCost","supplierCost","normalizedUnitCost","supplierUnitQuantity","amperage","poleCount"]);
const catalog=raw.map((r:any)=>Object.fromEntries(Object.entries(r).map(([k,v])=>{
  const key=k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
  return [key,numeric.has(key)&&v!=null?Number(v):v];
})));
const fixture=JSON.parse(await readFile(`${root}/bathroom.json`,"utf8"));
const settings={residentialLaborSellRate:150,commercialLaborSellRate:165,loadedLaborCost:65,materialMarkup:.25,targetMargin:.4};
const matrix:any[]=[];
for(const manufacturer of ["Siemens","Square D Homeline","Square D QO","Eaton BR","Eaton CH"])
for(const amperage of [15,20,30,40,50,60])
for(const poleCount of [1,2])
for(const protectionType of ["Standard","AFCI","GFCI","Dual Function"]){
  const inputs={...fixture.initialRequest.jobInputs,panelManufacturer:manufacturer,bathroomCircuits:[{
    key:"audit",label:"Audit circuit",quantity:1,amperage,poleCount,protectionType,cableType:"12/2 NM-B",routeLength:30,
  }]};
  const result=calculateBathroomEstimate(inputs,settings,catalog);
  const line=result.assembly.find(l=>l.category==="Protection");
  matrix.push({manufacturer,amperage,poleCount,protectionType,line,warnings:result.pricing.pricingWarnings});
}
const wires:any[]=[];
for(const cableType of ["14/2 NM-B","14/3 NM-B","12/2 NM-B","12/3 NM-B","10/2 NM-B","10/3 NM-B","8/2 NM-B","8/3 NM-B","6/2 NM-B","6/3 NM-B"]){
  const result=calculateBathroomEstimate({...fixture.initialRequest.jobInputs,bathroomCircuits:[{
    key:"audit",label:"Audit circuit",quantity:2,amperage:20,poleCount:1,protectionType:"Dual Function",cableType,routeLength:30,
  }]},settings,catalog);
  wires.push({cableType,lines:result.assembly.filter(l=>/home.run|connector/i.test(l.id+" "+l.description)),warnings:result.pricing.pricingWarnings});
}
const builders=["new-house","custom","service-call","time-materials","addition","bathroom","ev-charger","kitchen","recessed-lighting","service-upgrade","panel-replacement"];
const traces:any[]=[];
for(const builder of builders){
  const e=JSON.parse(await readFile(`${root}/${builder}.json`,"utf8"));
  const p=e.preview.pricing,round=(v:number)=>Number(v.toFixed(2));
  const material=round(e.preview.assembly.reduce((s:number,l:any)=>s+l.extendedCost,0));
  const loaded=round(p.finalLaborHours*65);
  const customerLabor=round(p.finalLaborHours*p.laborSellRate);
  const price=round(Math.max(material*1.25+customerLabor,(material+loaded)/.6));
  traces.push({builder,material,loaded,customerLabor,price,actual:p.finalSellingPrice,
    reconciles:material===p.materialCost&&loaded===p.laborCost&&price===p.finalSellingPrice,
    zeros:e.preview.assembly.filter((l:any)=>l.unitCost===0),
    customerScope:e.saved.customerScope,
    laborHours:p.finalLaborHours,
  });
}
const bathroomInputs={...fixture.initialRequest.jobInputs,additionalReceptacles:1};
const report={matrix,wires,traces,bathroomLabor:bathroomLaborBreakdown(bathroomInputs),
  uom:[25.399,50.651,763.579].map(raw=>({raw,...normalizeSupplierCost(raw,"c","ea")})),
  unknownUom:normalizeSupplierCost(100,"unknown","ea")};
await writeFile(`${root}/calculation-audit.json`,JSON.stringify(report,null,2));
const cell=(v:unknown)=>`"${String(v??"").replace(/"/g,'""')}"`;
const matrixCsv=[
  ["Manufacturer family","Amperage","Poles","Protection","Resolution status","Selected description","Unit cost"],
  ...matrix.map(r=>[r.manufacturer,r.amperage,r.poleCount,r.protectionType,
    r.line?.resolutionStatus,r.line?.description,r.line?.unitCost]),
].map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
await writeFile(`${root}/breaker-matrix.csv`,matrixCsv);
console.log(JSON.stringify({
  matrixRequests:matrix.length,resolved:matrix.filter(r=>r.line?.unitCost>0).length,
  ambiguous:matrix.filter(r=>/ambiguous|duplicate/i.test(JSON.stringify(r.line))).length,
  financialTraces:traces.map(({builder,reconciles})=>({builder,reconciles})),
  bathroomLabor:report.bathroomLabor,uom:report.uom,unknownUom:report.unknownUom,
},null,2));
