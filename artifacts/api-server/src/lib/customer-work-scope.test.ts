import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type {
  AssemblyLineRecord,
  QuoteJobInputsRecord,
  PricingRecord,
} from "@workspace/db";
import { customerProposalScope } from "./customer-scope";
import { customerScopeModules } from "./customer-work-scope";

const line = (
  id: string,
  quantity = 1,
  extra: Partial<AssemblyLineRecord> = {},
): AssemblyLineRecord => ({
  id,
  description: "PRIVATE supplier SKU 123",
  category: "Material",
  quantity,
  unit: "ea",
  unitCost: 7,
  extendedCost: quantity * 7,
  source: "Catalog",
  ...extra,
});
const inputs = (v: object) => v as QuoteJobInputsRecord;
test("every canonical builder has a customer-scope definition", () => {
  const directory = readFileSync(
    new URL(
      "../../../electrical-estimator/src/lib/builder-directory.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const modules = [
    ...directory.matchAll(/route:\s*"\/quotes\/new\/([^"]+)"/g),
  ].map((x) => x[1]!.replaceAll("-", "_").toUpperCase());
  assert.equal(modules.length, 11);
  for (const module of modules)
    assert.ok(customerScopeModules.includes(module as never), module);
});
test("Addition groups supporting materials and uses saved quantities without changing financial rows", () => {
  const assembly = [
    line("addition-receptacles", 11),
    line("addition-switches", 4),
    line("addition-dimmers", 2),
    line("addition-ceiling-fans", 1, {
      unitCost: 0,
      extendedCost: 0,
      resolutionStatus: "CUSTOMER_SUPPLIED",
    }),
    line("addition-circuit-1-cable", 75, { unit: "ft" }),
    line("addition-circuit-1-breaker", 3),
    line("addition-circuit-2-breaker", 2),
    line("addition-fan-support"),
  ];
  const before = structuredClone(assembly);
  const result = customerProposalScope("ADDITION", assembly);
  assert.equal(
    result.scope.find((x) => x.id === "receptacles")?.displayValue,
    "11 locations",
  );
  assert.equal(
    result.scope.find((x) => x.description === "New branch circuits")?.quantity,
    5,
  );
  assert.match(
    result.scope.find((x) => x.id === "fans-supplied")!.description,
    /customer-supplied ceiling fans/,
  );
  assert.doesNotMatch(
    JSON.stringify(result.scope),
    /PRIVATE|SKU|unitCost|75|Electrical material|Circuit breaker/,
  );
  assert.deepEqual(assembly, before);
});
test("bathroom combination units retain their real selected scope", () => {
  const r = customerProposalScope("BATHROOM", [
    line("fan-light-heat", 2, { resolutionStatus: "CUSTOMER_SUPPLIED" }),
  ]);
  assert.equal(
    r.scope[0]?.description,
    "Install customer-supplied fan/light/heat equipment",
  );
  assert.equal(r.scope[0]?.quantity, 2);
});
test("legacy recessed lighting retains additional locations and controls", () => {
  const r = customerProposalScope("RECESSED_LIGHTING", [
    line("recessed-fixtures", 4),
    line("additional-lights", 2),
    line("smart-switch-kit"),
    line("additional-switches", 2),
    line("recessed-wiring", 80, { unit: "ft" }),
  ]);
  assert.equal(r.scope.find((x) => x.id === "lights")?.quantity, 6);
  assert.ok(r.scope.some((x) => /Smart/.test(x.description)));
  assert.ok(r.scope.some((x) => /switch/i.test(x.description)));
  assert.doesNotMatch(JSON.stringify(r.scope), /80|ft|SKU/);
});
test("Recessed smart and multi-location groups summarize controls without material rows", () => {
  const r = customerProposalScope("RECESSED_LIGHTING", [
    line("recessed-fixtures", 8),
    line("recessed-group-0-smart"),
    line("recessed-group-1-three-way", 2),
    line("recessed-group-1-four-way"),
  ]);
  assert.ok(r.scope.some((x) => x.description === "Smart lighting controls"));
  assert.equal(
    r.scope.filter((x) => x.description === "Multi-location switching").length,
    1,
  );
});
test("explicit zero allowances are absent, supplied manual work remains, custom units do not double pluralize", () => {
  const r = customerProposalScope("CUSTOM", [
    line("custom-material-a", 2, {
      source: "Custom item",
      description: "Install owner-supplied dining pendant",
      unit: "locations",
      unitCost: 0,
      extendedCost: 0,
      intentionalExclusionReason: "Customer supplies pendants",
    }),
    line("permit-allowance", 1, {
      unitCost: 0,
      extendedCost: 0,
      intentionalExclusionReason: "Not required",
    }),
  ]);
  assert.equal(r.scope.length, 1);
  assert.equal(r.scope[0]?.displayValue, "2 locations");
  const panel = customerProposalScope("PANEL_REPLACEMENT", [
    line("panel-permit-allowance", 1, {
      unit: "allowance",
      unitCost: 0,
      extendedCost: 0,
      intentionalExclusionReason: "Not required",
    }),
  ]);
  assert.equal(panel.scope.length, 0);
});
test("generic custom descriptions and unregistered builders are internally flagged, never published", () => {
  for (const text of [
    "Electrical material",
    "Circuit breaker",
    "Assembly item",
    "[object Object]",
  ]) {
    const r = customerProposalScope("CUSTOM", [
      line("custom-material-a", 1, {
        description: text,
        source: "Custom item",
      }),
    ]);
    assert.equal(r.scope.length, 0);
    assert.equal(r.reviewIssues?.length, 1);
  }
  const unknown = customerProposalScope("FUTURE_BUILDER", [line("unmapped")]);
  assert.equal(unknown.scope.length, 0);
  assert.equal(unknown.reviewIssues?.length, 1);
  const partial = customerProposalScope("ADDITION", [
    line("addition-receptacles"),
    line("future-equipment"),
  ]);
  assert.equal(partial.reviewIssues?.length, 1);
  assert.doesNotMatch(JSON.stringify(partial.scope), /future-equipment/);
});
test("T&M uses customer labor rate not loaded cost and never allocates selling price from scope", () => {
  const pricing: PricingRecord = {
    finalLaborHours: 12,
    laborSellRate: 165,
    laborCost: 780,
    finalSellingPrice: 2345.67,
    materialCost: 100,
    materialMarkup: 0.25,
    calculatedSellingPrice: 2345.67,
    laborOverride: null,
    sellingPriceOverride: null,
    grossProfit: 1465.67,
    grossMargin: 0.6248,
    pricingWarnings: [],
  };
  const snapshot = structuredClone(pricing);
  const r = customerProposalScope("TIME_MATERIALS", [line("misc-a")], {
    pricing,
  });
  assert.equal(r.scope[0]?.displayValue, "12 person-hours at $165.00/hour");
  assert.doesNotMatch(JSON.stringify(r.scope), /\$780|2345|unitCost|margin/);
  assert.deepEqual(pricing, snapshot);
  const tm = customerProposalScope("TIME_MATERIALS", [line("misc-wire",50,{
    description:"12/2 NM-B",source:"Contractor-entered",unit:"ft",
  })], {pricing});
  assert.equal(tm.scope.length,2);
  assert.doesNotMatch(JSON.stringify(tm.scope),/NM-B|50 ft/);
});
test("verified Addition reuse assumption requires both confirmations and matching quantity", () => {
  const assembly = [line("addition-ceiling-fans")];
  const state = {
    ceilingFans: 1,
    ceilingFanInstallation: {
      mode: "reuse",
      supportVerified: true,
      wiringVerified: true,
      verifiedFanQuantity: 1,
    },
  };
  assert.equal(
    customerProposalScope("ADDITION", assembly, { inputs: inputs(state) })
      .assumptions.length,
    1,
  );
  state.ceilingFanInstallation.wiringVerified = false;
  assert.equal(
    customerProposalScope("ADDITION", assembly, { inputs: inputs(state) })
      .assumptions.length,
    0,
  );
});
