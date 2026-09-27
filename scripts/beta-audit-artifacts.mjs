// Read-only evidence summarizer. Does not connect to any database or API.
import fs from "node:fs";
import path from "node:path";
const root = process.env.AUDIT_OUTPUT;
if (!root) throw new Error("Set AUDIT_OUTPUT to the completed local audit evidence directory.");
const builders = ["new-house", "addition", "kitchen", "bathroom", "recessed-lighting", "service-call", "panel-replacement", "service-upgrade", "ev-charger", "time-materials", "custom"];
const rows = builders.map(b => JSON.parse(fs.readFileSync(path.join(root, `${b}.json`), "utf8")));
const csv = (rows) => rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
const write = (name, value) => fs.writeFileSync(path.join(root, name), value);
const zeros = [], requests = new Map();
for (const e of rows) for (const l of e.preview.assembly) {
  if (l.unitCost !== 0) continue;
  const intentional = Boolean(l.intentionalExclusionReason) || ["CUSTOMER_SUPPLIED", "INCLUDED"].includes(l.resolutionStatus);
  const key = l.materialRequestKey ?? l.description;
  zeros.push([e.builder, l.id, l.description, l.quantity, l.unit, intentional ? "INTENTIONAL" : "UNRESOLVED / CONFIRMATION REQUIRED", l.resolutionStatus, l.intentionalExclusionReason ?? l.source]);
  if (!intentional) {
    const r = requests.get(key) ?? { key, builders: new Set(), lines: 0 };
    r.builders.add(e.builder); r.lines++; requests.set(key, r);
  }
}
const ranked = [...requests.values()].sort((a,b) => b.builders.size - a.builders.size || a.key.localeCompare(b.key));
write("zero-dollar-lines.csv", csv([["Builder","Line ID","Description","Quantity","Unit","Classification","Resolution status","Reason"], ...zeros]));
write("unresolved-materials.csv", csv([["Request / description","Affected builders","Distinct builders","Assembly lines"], ...ranked.map(r=>[r.key,[...r.builders].join("; "),r.builders.size,r.lines])]));
write("financial-reconciliation.csv",csv([["Builder","Material","Loaded labor","Other costs outside assembly","Internal total","Person-hours","Customer labor","Selling price","Gross profit","Margin","Ready HTTP status"],
  ...rows.map(e=>{const p=e.preview.pricing;return [e.builder,p.materialCost,p.laborCost,0,e.math.internal,p.finalLaborHours,p.laborSellAmount,p.finalSellingPrice,p.grossProfit,p.grossMargin,e.markReadyStatus]})]));
write("warning-classifications.csv",csv([["Builder","Code","Current severity","Current category","Audit group","Message"],
  ...rows.flatMap(e=>(e.preview.pricing.pricingWarnings??[]).map(w=>{
    const group=/customer.supplied|customer supplied/i.test(w.code+" "+w.message) ? "CUSTOMER-SUPPLIED"
      : w.category==="missing-price" ? (/permit|inspection|allowance|utility|lumber/i.test(w.message)?"ALLOWANCE / REQUIRED PRICING":"REQUIRED PRICING")
      : /incompatible|invalid|unsafe/i.test(w.message) ? "ERROR"
      : /confirm|verify|field|scope/i.test(w.message) ? "FIELD CONFIRMATION" : "INFORMATIONAL";
    return [e.builder,w.code,w.severity,w.category,group,w.message];
  }))]));
// Independent RFC 4180 parser for checking actual output bytes against preserved sample.
function parse(text) {
  const rows=[]; let row=[], value="", quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===","&&!quoted){row.push(value);value="";}
    else if((c==="\r"||c==="\n")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(value);rows.push(row);row=[];value="";}
    else value+=c;
  }
  if(quoted)throw new Error("Unclosed quotation");
  if(row.length||value){row.push(value);rows.push(row)}
  return rows;
}
const official = parse(fs.readFileSync(new URL("../artifacts/api-server/src/lib/jobber-official-2026.csv",import.meta.url),"utf8"))[0];
const expected = official.filter(h=>h.trim());
if(expected.length!==119)throw new Error(`Official populated header count: ${expected.length}`);
const checks=[];
for(const name of fs.readdirSync(root).filter(n=>n.endsWith("-jobber.csv"))) {
  const bytes=fs.readFileSync(path.join(root,name));
  const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  const parsed=parse(text), [headers,data]=parsed;
  const errors=[];
  if(parsed.length!==2)errors.push("Not one quote per row");
  if(JSON.stringify(headers)!==JSON.stringify(expected))errors.push("Headers differ in name, case or order");
  if(data.length!==119)errors.push("Not 119 data fields");
  const get=n=>data[headers.indexOf(n)]??"";
  if(!["Draft","Awaiting Response","Approved"].includes(get("Quote Status (Draft/Awaiting Response/Approved)")))errors.push("Invalid status");
  headers.forEach((h,i)=>{if(h.endsWith("(True/False)")&&data[i]&&!["TRUE","FALSE"].includes(data[i]))errors.push("Invalid boolean")});
  let total=0, count=0;
  for(let i=1;i<=10;i++){
    const prefix=`Line Item ${i} `,category=get(prefix+"Category (Service/Product)");
    if(!category)continue;count++;
    if(!["Service","Product"].includes(category))errors.push("Invalid category");
    for(const field of ["Quantity","UNIT Price","UNIT Cost"]){
      const v=get(prefix+field);
      if(v&&!/^\d+(?:\.\d+)?$/.test(v))errors.push(`Invalid numeric ${prefix+field}`);
    }
    total+=Number(get(prefix+"Quantity"))*Number(get(prefix+"UNIT Price"));
  }
  const e=rows.find(e=>name===`${e.builder}-jobber.csv`);
  const expectedTotal=e?.saved.total??JSON.parse(fs.readFileSync(path.join(root,"customer-workflow.json"),"utf8")).quoteTotal;
  if(typeof expectedTotal!=="number")errors.push("Missing saved quote total evidence");
  if(Math.round(total*100)!==Math.round(expectedTotal*100))errors.push("Total does not equal saved quote");
  if(count<1||count>10)errors.push("Line count");
  checks.push({file:name,utf8:true,headers:headers.length,quoteRows:parsed.length-1,lineItems:count,total:Number(total.toFixed(2)),expectedTotal,errors});
}
const summary={builders:rows.length,zeroLines:zeros.length,intentionalZeros:zeros.filter(r=>r[5]==="INTENTIONAL").length,
  unresolvedZeroLines:zeros.filter(r=>r[5]!=="INTENTIONAL").length,distinctUnresolvedRequests:ranked.length,
  jobberOfficialPopulatedHeaders:expected.length,jobber:checks};
write("evidence-summary.json",JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if(checks.some(c=>c.errors.length))process.exitCode=1;
