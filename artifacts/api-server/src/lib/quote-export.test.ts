import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildJobberQuoteCsv, preflightJobberQuoteExport, buildQuickBooksQuoteCsv,
  preflightQuickBooksQuoteExport, buildHousecallProQuoteCsv, preflightHousecallProQuoteExport,
  QUICKBOOKS_INVOICE_HEADERS, HOUSECALL_PRO_JOB_HEADERS } from "./quote-export";
import { parseJobberCsv, validateJobberCsv } from "./jobber-csv-validation";
import type { QuoteExportMapping } from "@workspace/api-zod";

type Quote = Parameters<typeof buildJobberQuoteCsv>[0];
function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id:42,companyId:7,customerId:null,quoteNumber:"Q-0042",customerName:"Ada Lovelace",
    customerEmail:"ada@example.com",projectName:'Kitchen, lighting "upgrade"',module:"KITCHEN",status:"ready",
    jobInputs:{notes:"PRIVATE INTERNAL NOTES"},assembly:[{id:"wire",category:"Material",description:"Supplier SKU12345",
      quantity:3,unit:"ft",unitCost:12.34,extendedCost:37.02,source:"Private supplier"}],
    pricing:{materialCost:37.02,laborCost:100,materialMarkup:.2,calculatedSellingPrice:300,finalSellingPrice:2345.67,
      laborOverride:null,sellingPriceOverride:2345.67,grossProfit:2208.65,grossMargin:.94,pricingWarnings:[]},
    proposalDescription:"Install safely,\r\nthen test O'Brien’s \"lighting\".",
    total:2345.67,margin:.94,sourceQuoteId:null,revisionNumber:0,createdAt:new Date(),updatedAt:new Date(),
    ...overrides,
  } as Quote;
}
const mapping: QuoteExportMapping = {propertyStreet1:"123 Main St",propertyCity:"Boston",propertyStateProvince:"MA",
  propertyZipPostalCode:"02108",taxable:"FALSE",taxConfirmed:true};
const official = parseJobberCsv(readFileSync(new URL("./jobber-official-2026.csv",import.meta.url),"utf8"))[0]!;
function result(q = quote(), m = mapping) {
  const before = structuredClone(q), r=buildJobberQuoteCsv(q,m);
  assert.deepEqual(r.issues,[]); assert.ok(r.csv); assert.deepEqual(q,before);
  const [headers,values]=parseJobberCsv(r.csv);
  assert.deepEqual(headers,official);assert.equal(headers.length,119);assert.equal(values.length,119);
  return {csv:r.csv, get:(h:string)=>values[headers.indexOf(h)]};
}
for (const module of ["PANEL_REPLACEMENT","RECESSED_LIGHTING","KITCHEN"]) test(`${module}: one service, saved override, no takeoff leak`,()=>{
  const q=quote({module}),r=result(q);
  assert.equal(r.get("Line Item 1 Category (Service/Product)"),"Service");
  assert.equal(r.get("Line Item 1 Name"),q.projectName);
  assert.equal(r.get("Line Item 1 Description"),q.proposalDescription);
  assert.equal(r.get("Line Item 1 UNIT Price"),"2345.67");
  assert.equal(r.get("Line Item 1 UNIT Cost"),"");
  assert.equal(r.get("Line Item 2 Name"),"");
  assert.equal(r.get("Quote Status (Draft/Awaiting Response/Approved)"),"Draft");
  assert.equal(r.get("Quote Internal Note"),"Created from PriceCrew quote Q-0042.");
  assert.doesNotMatch(r.csv,/SKU12345|Private supplier|PRIVATE INTERNAL|extendedCost/);
});
test("official sample header equality includes every empty slot and exact case/order",()=>{
  assert.equal(official.length,119); const r=result();
  for(let i=2;i<=10;i++) for(const h of official.filter(h=>h.startsWith(`Line Item ${i} `))) assert.equal(r.get(h),"");
});
test("existing client/property IDs and new property/email matching",()=>{
  const r=result(quote(),{...mapping,jobberClientId:"12345",jobberPropertyId:"9876"});
  assert.equal(r.get("Jobber Client ID"),"12345");assert.equal(r.get("Jobber Property ID"),"9876");
  const n=result();assert.equal(n.get("Jobber Client ID"),"");assert.equal(n.get("Client Email"),"ada@example.com");
  assert.equal(n.get("Jobber Property ID"),"");assert.equal(n.get("Property Street 1"),"123 Main St");
  assert.equal(n.get("Property Country"),"");
});
test("explicit customer name/email mapping and clearing",()=>{
  const r=result(quote(),{...mapping,clientFirstName:"Grace",clientLastName:"Hopper",clientEmail:""});
  assert.equal(r.get("Client Full Name (Display Only)"),"Grace Hopper");assert.equal(r.get("Client Email"),"");
});
test("opt-in cost is saved material plus effective labor override",()=>{
  const q=quote();q.pricing.laborOverride=250;
  assert.equal(result(q,{...mapping,includeInternalCost:true}).get("Line Item 1 UNIT Cost"),"287.02");
});
test("actual rounded CSV unit costs must still reconcile",()=>{
  const q=quote(); q.pricing.materialCost=.01; q.pricing.laborCost=0;
  const r=buildJobberQuoteCsv(q,{...mapping,includeInternalCost:true,lineItemDetail:"scope",
    scopeLines:[{name:"Work",description:"Install",quantity:3,unitPrice:781.89,unitCost:.003333333}]});
  assert.equal(r.csv,null);
  assert.ok(r.issues.some(i=>i.code==="EXPORT_COST_MISMATCH"));
});
test("intentional scope allocations reconcile, do not drop >10 lines or guess allocations",()=>{
  const scopeLines=[{name:"Receptacles & switches",description:"Replace devices",quantity:2,unitPrice:500,unitCost:50},
    {name:"Lighting",description:"Install lights",quantity:1,unitPrice:1345.67,unitCost:37.02}];
  const r=result(quote(),{...mapping,lineItemDetail:"scope",scopeLines,includeInternalCost:true});
  assert.equal(r.get("Line Item 2 UNIT Price"),"1345.67");
  assert.equal(buildJobberQuoteCsv(quote(),{...mapping,lineItemDetail:"scope",scopeLines:scopeLines.slice(0,1)}).csv,null);
  assert.equal(buildJobberQuoteCsv(quote(),{...mapping,lineItemDetail:"scope",scopeLines:Array(11).fill(scopeLines[0])}).csv,null);
});
test("customer-supplied materials remain excluded, active unpriced materials block",()=>{
  const q=quote();q.assembly[0]={...q.assembly[0]!,unitCost:0,extendedCost:0,intentionalExclusionReason:"Customer supplied"};
  result(q);
  delete q.assembly[0]!.intentionalExclusionReason;
  assert.equal(buildJobberQuoteCsv(q,mapping).csv,null);
});
test("large takeoffs never determine customer line count or leak internal JSON",()=>{
  for(const count of [0,9,10,30,100]){
    const q=quote();q.assembly=Array.from({length:count},(_,i)=>({...quote().assembly[0]!,id:`line-${i}`}));
    const r=result(q);assert.equal(r.get("Line Item 2 Name"),"");assert.doesNotMatch(r.csv,/unitCost|SKU12345/);
  }
});
test("commas, apostrophes, multiline scope, unicode and spreadsheet formulas round-trip",()=>{
  const q=quote(); const r=result(q);
  assert.equal(r.get("Quote Message"),q.proposalDescription);assert.equal(r.get("Quote Title"),q.projectName);
  assert.equal(result(quote({projectName:' =HYPERLINK("bad")'})).get("Quote Title"),'\' =HYPERLINK("bad")');
});
test("unknown tax blocks, invalid total/status/booleans/NaN blocked",()=>{
  for(const m of [{...mapping,taxConfirmed:false},{...mapping,quoteStatus:"Approved"},{...mapping,taxable:"yes"}]){
    assert.equal(buildJobberQuoteCsv(quote(),m as QuoteExportMapping).csv,null);
  }
  assert.equal(buildJobberQuoteCsv(quote({total:1}),mapping).csv,null);
  const q=quote();q.assembly[0]!.extendedCost=NaN;assert.equal(buildJobberQuoteCsv(q,mapping).csv,null);
  assert.equal(buildJobberQuoteCsv(quote({projectName:"[object Object]"}),mapping).csv,null);
});
test("intentional tax, discount and deposit retain exact saved totals",()=>{
  const q=quote();q.total=110;q.pricing.finalSellingPrice=110;
  const m:QuoteExportMapping={...mapping,taxable:"TRUE",taxMethod:"Exclusive",newTaxRateName:"Verified test tax",
    newTaxRate:10,lineItemDetail:"scope",scopeLines:[{name:"Electrical work",description:"Install",quantity:1,unitPrice:125}],
    discountType:"Unit",discountAmount:25,depositType:"Percentage",depositAmount:10};
  const r=result(q,m);assert.equal(r.get("Quote New Tax Rate (Percentage)"),"10");
  assert.equal(r.get("Quote Existing Tax Rate Name"),"");
  assert.equal(buildJobberQuoteCsv(q,{...m,existingTaxRateName:"Duplicate"}).csv,null);
  assert.equal(buildJobberQuoteCsv(q,{...m,newTaxRate:9}).csv,null);
  assert.equal(result(q,{...m,quoteStatus:"Awaiting Response"}).get("Quote Status (Draft/Awaiting Response/Approved)"),"Awaiting Response");
});
test("actual CSV validator catches malformed columns, booleans and prices",()=>{
  const r=result();
  assert.deepEqual(validateJobberCsv(r.csv,official,2345.67,2345.67),[]);
  for(const bad of [r.csv.replace('"FALSE"','"maybe"'),r.csv.replace('"2345.67"','"NaN"'),r.csv.replace('"Jobber Client ID"','"Client ID"')])
    assert.ok(validateJobberCsv(bad,official,2345.67,2345.67).length);
});
test("legacy included closeout is allowed; near-match zero materials and warning errors still block",()=>{
  const q=quote();q.assembly=[{id:"panel-directory-labeling",category:"Closeout",description:"Prepare panel directory and complete final circuit labeling",
    quantity:1,unit:"scope",unitCost:0,extendedCost:0,source:"Included labor scope"}];result(q);
  q.assembly[0]!.id="ground-bar";assert.equal(buildJobberQuoteCsv(q,mapping).csv,null);
  const unsafe=quote();unsafe.pricing.pricingWarnings=[{code:"MISSING_CATALOG_PRICE",severity:"error",category:"missing-price",message:"Missing",source:"Saved",context:{}}];
  assert.ok(preflightJobberQuoteExport(unsafe,mapping).some(i=>i.code==="BLOCKING_PRICING_WARNINGS"));
});
test("experimental QBO/HCP adapters preserved, require mappings and retain saved price",()=>{
  const q=quote(),qb={quickBooksCustomer:"Ada Lovelace",quickBooksInvoiceDate:"2026-08-30",quickBooksDueDate:"2026-08-30"};
  const qbcsv=buildQuickBooksQuoteCsv(q,qb).csv;assert.ok(qbcsv);
  assert.deepEqual(parseJobberCsv(qbcsv)[0],QUICKBOOKS_INVOICE_HEADERS);assert.match(qbcsv,/2345\.67/);
  assert.ok(preflightQuickBooksQuoteExport(q,{}).length);
  const hc=buildHousecallProQuoteCsv(q,{}).csv;assert.ok(hc);assert.deepEqual(parseJobberCsv(hc)[0],HOUSECALL_PRO_JOB_HEADERS);assert.match(hc,/2345\.67/);
  assert.ok(preflightHousecallProQuoteExport(quote({customerName:"",customerEmail:null}),{}).length);
});
