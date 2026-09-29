import assert from "node:assert/strict";
import test from "node:test";
import type { AdditionInputRecord } from "@workspace/db";
import { calculateAdditionEstimate, type PriceBookItem } from "./estimating-engine";

const settings = { residentialLaborSellRate: 150, commercialLaborSellRate: 165,
  loadedLaborCost: 65, materialMarkup: .25, targetMargin: .4 };
const inputs: AdditionInputRecord = {
  length:20,width:16,receptacles:0,switches:2,dimmers:1,recessedLights:0,ceilingFans:0,
  customerSuppliedFans:true,circuitCount:0,circuitEntries:[],routeLength:0,homeRunLength:50,
  panelManufacturer:"Siemens",breakerAmperage:20,breakerPoleCount:1,breakerProtectionType:"AFCI",
  cableType:"12/2 NM-B",crewSize:1,crewHours:8,laborAdjustmentHours:0,notes:"",
};
const switchKey = "Pass & Seymour TM870-W 15A single-pole switch";
const dimmerKey = "Lutron DVCL-153P-WH Diva LED+ dimmer";
const row = (item: string, unitCost: number, extra: Partial<PriceBookItem> = {}): PriceBookItem => ({
  item, unitCost, category:"Controls", unit:"ea", supplier:"Synthetic supplier",
  sourceDate:"2026-09-27",isDefault:false,manufacturer:null,manufacturerPartNumber:null,
  supplierSku:null,upc:null,amperage:null,poleCount:null,protectionType:null,...extra,
});
const controls = [
  row(`${switchKey} — SKU 3211`,1.85,{id:1,manufacturer:"Pass & Seymour",manufacturerPartNumber:"TM870-W",supplierSku:"3211"}),
  row(`${dimmerKey} — SKU 607393`,30.28,{id:2,manufacturer:"Lutron",manufacturerPartNumber:"DVCL-153P-WH",supplierSku:"607393"}),
];
const estimate = (book = controls, changes: Partial<AdditionInputRecord> = {}) =>
  calculateAdditionEstimate({...inputs,...changes},settings,book);
const controlLines = (result: ReturnType<typeof estimate>) =>
  result.assembly.filter(line=>["addition-switches","addition-dimmers"].includes(line.id));

test("Addition resolves verified control manufacturer/part identities despite supplier display suffixes", () => {
  const result = estimate();
  assert.deepEqual(controlLines(result).map(line=>line.unitCost),[1.85,30.28]);
  assert.deepEqual(controlLines(result).map(line=>line.materialSnapshot?.supplierSku),["3211","607393"]);
  assert.deepEqual(controlLines(result).map(line=>line.materialSnapshot?.requestKey),[switchKey,dimmerKey]);
  assert.equal(result.pricing.materialCost,33.98);
  assert.equal(result.pricing.finalLaborHours,9.3);
  assert.equal(result.pricing.laborCost,604.5);
});

test("Addition legacy exact display identities retain prices and identical financial math", () => {
  const legacy = estimate([row(switchKey,1.85),row(dimmerKey,30.28)]);
  const current = estimate();
  assert.deepEqual(current.pricing,legacy.pricing);
  assert.deepEqual(controlLines(current).map(l=>[l.quantity,l.extendedCost]),
    controlLines(legacy).map(l=>[l.quantity,l.extendedCost]));
});

test("Addition structured identity is not fuzzy description or supplier SKU matching", () => {
  const renamed = controls.map(r=>({...r,item:"Supplier display title"}));
  assert.deepEqual(controlLines(estimate(renamed)).map(l=>l.unitCost),[1.85,30.28]);
  const incorrect = [
    {...controls[0], manufacturer:"Different manufacturer"},
    {...controls[1], manufacturerPartNumber:"DVCL-153P-BL"},
    {...controls[0], item:"Similar switch",manufacturerPartNumber:"TM870WCC10"},
  ];
  assert.ok(controlLines(estimate(incorrect)).every(l=>l.unitCost===0));
});

test("Addition duplicate verified control identities stay unresolved, not cheapest-price selected", () => {
  const result = estimate([...controls,{...controls[0],id:3,item:"Duplicate supplier record",unitCost:2}]);
  assert.equal(result.assembly.find(l=>l.id==="addition-switches")?.resolutionStatus,"UNRESOLVED_AMBIGUOUS");
  assert.equal(result.assembly.find(l=>l.id==="addition-switches")?.unitCost,0);
});

test("Addition unpriced preferred control does not fall back to a priced identical part", () => {
  const preferred = {...controls[0],id:4,item:"Preferred switch",unitCost:0,
    materialPreferences:[{requestKey:switchKey,kind:"exact" as const}]};
  assert.equal(estimate([...controls,preferred]).assembly.find(l=>l.id==="addition-switches")?.unitCost,0);
});

test("Addition missing, unsourced, default, and mismatched-unit control rows remain unresolved", () => {
  for(const book of [[],controls.map(r=>({...r,unitCost:0})),
    controls.map(r=>({...r,supplier:null,sourceDate:null})),
    controls.map(r=>({...r,isDefault:true})),controls.map(r=>({...r,unit:"ft"}))]) {
    assert.ok(controlLines(estimate(book)).every(l=>l.unitCost===0));
  }
});

test("Addition supplied ceiling fan excludes purchase and stored override, preserving labor and every other line", () => {
  const book = [...controls,row("Contractor-supplied ceiling fan",180,{category:"Equipment"}),
    row("12/2 NM-B cable",.6,{category:"Conductor",unit:"ft"})];
  const scope: Partial<AdditionInputRecord> = {ceilingFans:2,routeLength:30,
    circuitEntries:[{amperage:20,poleCount:1,protectionType:"AFCI",cableType:"12/2 NM-B",quantity:1}]};
  const contractor = estimate(book,{...scope,customerSuppliedFans:false});
  const supplied = estimate(book,{...scope,customerSuppliedFans:true,ceilingFanMaterialCostOverride:999});
  assert.equal(contractor.assembly.find(l=>l.id==="addition-ceiling-fans")?.extendedCost,360);
  assert.equal(supplied.assembly.find(l=>l.id==="addition-ceiling-fans")?.extendedCost,0);
  assert.equal(supplied.assembly.find(l=>l.id==="addition-ceiling-fans")?.resolutionStatus,"CUSTOMER_SUPPLIED");
  assert.equal(supplied.pricing.finalLaborHours,contractor.pricing.finalLaborHours);
  assert.equal(supplied.pricing.finalLaborHours,15.3);
  assert.equal(supplied.assembly.find(l=>l.id==="addition-circuit-1-cable")?.quantity,80);
  assert.equal(supplied.assembly.find(l=>l.id==="addition-circuit-1-cable")?.extendedCost,48);
  assert.deepEqual(supplied.assembly.filter(l=>l.id!=="addition-ceiling-fans"),
    contractor.assembly.filter(l=>l.id!=="addition-ceiling-fans"));
  assert.equal(estimate(book,{ceilingFans:2,customerSuppliedFans:false,ceilingFanMaterialCostOverride:0})
    .assembly.find(l=>l.id==="addition-ceiling-fans")?.unitCost,0);
  assert.equal(estimate(book,{ceilingFans:2,customerSuppliedFans:false,ceilingFanMaterialCostOverride:125})
    .assembly.find(l=>l.id==="addition-ceiling-fans")?.extendedCost,250);
});

test("Addition supplied fan is a blocking scope confirmation, not a missing fan purchase price", () => {
  const result = estimate(controls,{ceilingFans:1,customerSuppliedFans:true});
  const warning = result.pricing.pricingWarnings.find(w=>typeof w!=="string"&&w.code==="ADDITION_SUPPLIED_FAN_SCOPE_REVIEW");
  assert.ok(warning && typeof warning !== "string");
  assert.equal(warning.category,"field-verification");
  assert.equal(warning.severity,"error"); // Do not silently unlock Ready with incomplete installation scope.
  assert.match(warning.message,/support.*wiring/i);
  assert.match(warning.message,/select new fan-rated support.*verified reuse/i);
  assert.doesNotMatch(warning.message,/does not generate/i);
  assert.ok(!result.pricing.pricingWarnings.some(w=>typeof w!=="string"&&w.code==="CUSTOMER_SUPPLIED_MATERIAL_REVIEW"));
});
