import assert from "node:assert/strict";
import test from "node:test";
import { customerMaterialDescription as describe } from "./customer-scope";

test("known panel and service scope has useful labels without exposing catalog data", () => {
  const cases = [
    ["panel-ground-bars", "Panel grounding bars"],
    ["panel-space-fillers", "Panel filler plates"],
    ["panel-knockout-seals", "Panel knockout seals"],
    ["panel-electrical-tape", "Electrical insulating tape"],
    ["panel-anti-oxidant", "Anti-oxidation compound"],
    ["panel-grounding-conductor", "#8 bare copper grounding conductor"],
    ["panel-bonding-conductor", "#4 copper bonding conductor"],
    ["panel-plywood", "Plywood panel backing"],
    ["panel-studs", "Framing lumber for panel backing"],
    ["water-meter-bonding", "Water-meter bonding clamps"],
  ];
  for (const [id, expected] of cases) {
    assert.equal(describe("SECRET Supplier SKU ABC123 https://private.example", {
      id, source: "Supplier catalog", category: "Material",
    }), expected);
  }
  assert.equal(describe("Unknown supplier fixture", { source: "Catalog" }), "Electrical material");
});

test("panel and feeder descriptions use only supported ratings and explicit inclusion", () => {
  assert.equal(describe("Siemens PN4040B1200C 200A 40-space panel (main breaker included)", {
    id: "panel-replacement-panel", source: "Northeast",
  }), "200A 40-space electrical panel");
  const breaker = { id: "panel-replacement-breaker", unitCost: 0,
    intentionalExclusionReason: "Main breaker is included in the Siemens PN4040B1200C panel price; no separate charge." };
  assert.equal(describe("Siemens 200A 2-pole Standard main breaker", breaker),
    "200A main breaker (included with panel)");
  assert.ok(!describe("Siemens 200A 2-pole Standard main breaker", {
    ...breaker, intentionalExclusionReason: undefined,
  }).includes("included"));
  for (const cable of ["4/0 aluminum", "2/0 copper"]) {
    assert.equal(describe(`${cable} SER feeder`, { id: "panel-replacement-feeder" }), `${cable} SER feeder cable`);
  }
  assert.equal(describe("Reuse existing feeder cable", { id: "panel-replacement-feeder" }), "Reuse existing feeder cable");
});

test("allowances distinguish explicit not-required from an unresolved zero", () => {
  for (const [kind, label] of [["permit", "Permit"], ["inspection", "Inspection"], ["miscellaneous", "Miscellaneous work"]]) {
    const line = { id: `panel-${kind}-allowance`, source: "Company catalog", unitCost: 0 };
    assert.equal(describe("PRIVATE allowance", line), `${label} allowance`);
    assert.equal(describe("PRIVATE allowance", { ...line,
      intentionalExclusionReason: `Contractor confirmed ${kind} is not required / $0 for this job.`,
    }), `${label} allowance (not required)`);
    assert.equal(describe("PRIVATE allowance", { ...line, unitCost: 75,
      intentionalExclusionReason: "not required",
    }), `${label} allowance`);
  }
});
