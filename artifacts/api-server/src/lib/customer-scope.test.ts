import assert from "node:assert/strict";
import test from "node:test";
import type { AssemblyLineRecord } from "@workspace/db";
import { customerProposalScope, customerMaterialDescription as describe } from "./customer-scope";

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

const line = (id: string, description = "Private supplier SKU ABC123", unitCost = 10, extra = {}) =>
  ({ id, description, unitCost, quantity: 1, unit: "ea", category: "Material",
    source: "Supplier", extendedCost: unitCost, ...extra }) as AssemblyLineRecord;

test("panel proposal summarizes saved work without mutating costs or inventing selected breakers", () => {
  const assembly = [
    line("panel-replacement-panel", "Siemens 200A 40-space electrical panel"),
    line("panel-replacement-breaker", "200A main breaker", 0,
      { intentionalExclusionReason: "Main breaker is included with panel" }),
    line("panel-replacement-feeder", "Reuse existing feeder cable", 0),
    line("panel-ground-bars"), line("panel-plywood"), line("panel-studs"),
    line("panel-electrical-tape"), line("panel-anti-oxidant"),
    line("panel-permit-allowance", "Permit", 0, { unit: "allowance" }),
    line("panel-inspection-allowance", "Inspection", 0, { unit: "allowance" }),
    line("panel-miscellaneous-allowance", "Miscellaneous", 0, { unit: "allowance" }),
    line("panel-replacement-closeout", "Panel labeling", 0),
  ];
  const before = structuredClone(assembly);
  const { scope, assumptions } = customerProposalScope("PANEL_REPLACEMENT", assembly);
  assert.deepEqual(scope.map(row => [row.description, row.displayValue]), [
    ["200A 40-space electrical panel", "Included"],
    ["Existing feeder", "Reconnect/reuse"],
    ["Grounding & bonding", "Included"],
    ["Panel mounting/backboard", "Included"],
    ["Circuit identification & panel directory", "Included"],
    ["Testing & cleanup", "Included"],
  ]);
  assert.match(assumptions[0]!, /field verification/);
  assert.deepEqual(assembly, before);
  assert.doesNotMatch(JSON.stringify(scope), /unitCost|SKU|supplier|main breaker|not required/i);
});

test("selected breakers, paid allowances, and new cable remain; unselected work is absent", () => {
  const { scope, assumptions } = customerProposalScope("PANEL_REPLACEMENT", [
    line("panel-existing-breaker-0"), line("panel-replacement-feeder", "2/0 copper SER"),
    line("panel-permit-allowance", "Permit", 75, { unit: "allowance" }),
    line("panel-studs", "Studs", 10, { quantity: 0 }),
  ]);
  assert.equal(scope.find(row => row.id === "breakers")?.description, "Required circuit breakers");
  assert.equal(scope.find(row => row.id === "feeder")?.description, "New feeder installation");
  assert.equal(scope.find(row => row.id === "panel-permit-allowance")?.description, "Permit allowance");
  assert.equal(scope.some(row => row.id === "backboard"), false);
  assert.deepEqual(assumptions, []);
});

test("other modules retain useful saved scope and hide only zero allowances", () => {
  const { scope } = customerProposalScope("CUSTOM", [
    line("manual-work", "Reconnect existing outlet", 0, { source: "manual" }),
    line("permit-allowance", "Permit", 0, { unit: "allowance" }),
  ]);
  assert.equal(scope.length, 1);
  assert.equal(scope[0]!.description, "Reconnect existing outlet");
});
