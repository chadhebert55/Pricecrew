import assert from "node:assert/strict";
import test from "node:test";
import type {
  BathroomInputRecord,
  EvChargerInputRecord,
  KitchenInputRecord,
  PricingWarningRecord,
  RecessedLightingInputRecord,
} from "@workspace/db";
import {
  calculateBathroomEstimate,
  calculateEvChargerEstimate,
  calculateKitchenEstimate,
  calculateRecessedLightingEstimate,
  normalizePricingWarnings,
  type EstimatingSettings,
  type PriceBookItem,
} from "./estimating-engine";
import {
  formatQuoteNumber,
  MAX_OVERRIDE_VALUE,
  pricingForQuoteUpdate,
  validateOverrideValues,
  withProfit,
} from "../routes/estimating";
import { SIEMENS_QF250A_SEED_COST } from "./estimating-seed";

const settings: EstimatingSettings = {
  residentialLaborSellRate: 150,
  commercialLaborSellRate: 165,
  loadedLaborCost: 65,
  materialMarkup: 0.25,
  targetMargin: 0.4,
};

const catalogRow = (
  item: string,
  unitCost: number,
  fields: Partial<PriceBookItem> = {},
): PriceBookItem => ({
  item,
  unitCost,
  supplier: "Northeast Electrical",
  manufacturer: null,
  manufacturerPartNumber: null,
  supplierSku: null,
  sourceDate: "2026-08-25",
  amperage: null,
  poleCount: null,
  protectionType: null,
  isDefault: false,
  ...fields,
});

const qf250a = catalogRow(
  "Siemens / ITE QF250A 50A 2-pole GFCI breaker",
  SIEMENS_QF250A_SEED_COST,
  {
    manufacturer: "Siemens",
    manufacturerPartNumber: "ITE QF250A",
    supplierSku: "1101170",
    amperage: 50,
    poleCount: 2,
    protectionType: "GFCI",
  },
);

function expectStructuredWarnings(
  warnings: Array<PricingWarningRecord | string>,
) {
  assert.ok(warnings.length > 0);
  for (const warning of warnings) {
    assert.equal(typeof warning, "object");
    if (typeof warning === "string") continue;
    assert.ok(warning.code.length > 0);
    assert.ok(["info", "warning", "error"].includes(warning.severity));
    assert.ok(warning.category.length > 0);
    assert.ok(warning.source.length > 0);
    assert.ok(warning.message.length > 0);
    assert.equal(typeof warning.context, "object");
  }
}

const evInputs: EvChargerInputRecord = {
  chargerQuantity: 1,
  chargerOutputAmps: 40,
  circuitAmps: "Auto",
  chargerSupply: "Customer Provided",
  connection: "Hardwired",
  routeLength: 15,
  wiringMethod: "SER Cable",
  location: "Indoor",
  panelManufacturer: "Siemens",
  panelSpace: "Available",
  breakerRequirement: "GFCI 2-Pole",
  access: "Standard",
  permit: "Not Required",
  loadManagement: "None",
  disconnect: "Not Required",
  surgeProtection: "None",
  panelModifications: "None",
  difficulty: "Standard",
  notes: "",
  laborRateType: "residential",
};

test("EV resolves the exact Siemens QF250A price and structures missing material warnings", () => {
  assert.equal(SIEMENS_QF250A_SEED_COST, 151.702);
  const result = calculateEvChargerEstimate(evInputs, settings, [qf250a]);
  const breaker = result.assembly.find((line) => line.id === "breaker");
  assert.equal(breaker?.unitCost, 151.702);
  assert.equal(breaker?.description.includes("ITE QF250A"), true);
  assert.equal(breaker?.source.includes("SKU 1101170"), true);
  expectStructuredWarnings(result.pricing.pricingWarnings);
  const missingCable = result.pricing.pricingWarnings.find(
    (warning) =>
      typeof warning !== "string" &&
      warning.code === "PRICE_BOOK_ITEM_UNRESOLVED",
  );
  assert.equal(
    typeof missingCable === "string"
      ? undefined
      : missingCable?.context.itemKey,
    "#8/2 SER cable",
  );
});

test("EV does not substitute a generic breaker for the wrong manufacturer", () => {
  const result = calculateEvChargerEstimate(
    { ...evInputs, panelManufacturer: "Square D" },
    settings,
    [qf250a],
  );
  assert.equal(
    result.assembly.find((line) => line.id === "breaker")?.unitCost,
    0,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_BREAKER_UNRESOLVED",
    ),
    true,
  );
});

const bathroomInputs: BathroomInputRecord = {
  gfciReceptacles: 1,
  additionalReceptacles: 0,
  vanityLights: 1,
  recessedLights: 0,
  exhaustFans: 1,
  fanLights: 0,
  fanLightHeatUnits: 0,
  heatedFloorCircuit: false,
  additionalSwitches: 1,
  routeLength: 0,
  circuitOption: "Reuse existing circuit",
  customerSuppliedFixtures: true,
  notes: "",
  laborRateType: "residential",
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "GFCI",
  gfciAmperage: 20,
  recessedLightSize: "4-inch",
  cableType: "12/2 NM-B",
};

const kitchenInputs: KitchenInputRecord = {
  refrigeratorCircuits: 0,
  dishwasherCircuits: 0,
  disposalCircuits: 0,
  gasRangeCircuits: 0,
  electricRangeCircuits: 0,
  countertopReceptacles: 0,
  sinkLights: 1,
  islandPendants: 0,
  undercabinetLighting: 0,
  recessedLights: 0,
  threeWayOptions: 0,
  dimmers: 0,
  usbReceptacles: 0,
  additionalDedicatedCircuits: 0,
  routeLength: 0,
  customerSuppliedFixtures: true,
  notes: "",
  laborRateType: "residential",
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "Standard",
  recessedLightSize: "4-inch",
  cableType: "12/2 NM-B",
};

const recessedInputs: RecessedLightingInputRecord = {
  roomLength: 0,
  roomWidth: 0,
  fixtureQuantity: 1,
  fixtureSize: "4-inch",
  wiringOption: "Use existing switch leg / lighting box",
  circuitOption: "Reuse existing circuit",
  switchType: "Single-pole",
  switchingMethod: "single-pole",
  dimmerSelection: "No dimmer",
  customerSuppliedFixtures: true,
  ceilingHeight: "Standard 8-10 ft",
  accessDifficulty: "Attic access",
  laborAdjustmentHours: 0,
  wireRunLength: 0,
  wiringAllowanceFeet: 0,
  additionalSwitches: 0,
  additionalLights: 0,
  notes: "",
  laborRateType: "residential",
  panelManufacturer: "Siemens",
  breakerAmperage: 15,
  breakerPoleCount: 1,
  breakerProtectionType: "Standard",
  cableType: "14/2 NM-B",
};

test("all current builders return the shared structured warning shape", () => {
  const estimates = [
    calculateEvChargerEstimate(evInputs, settings, [qf250a]),
    calculateBathroomEstimate(bathroomInputs, settings, []),
    calculateKitchenEstimate(kitchenInputs, settings, []),
    calculateRecessedLightingEstimate(recessedInputs, settings, []),
  ];
  for (const estimate of estimates) {
    expectStructuredWarnings(estimate.pricing.pricingWarnings);
  }
});

test("legacy string snapshot warnings normalize without rewriting stored snapshots", () => {
  const normalized = normalizePricingWarnings([
    'No verified price is available for "legacy material".',
  ]);
  assert.deepEqual(normalized[0], {
    code: "PRICE_BOOK_ITEM_UNRESOLVED",
    severity: "error",
    category: "missing-price",
    source: "price-book",
    context: { itemKey: "legacy material" },
    message: 'No verified price is available for "legacy material".',
  });
});

test("override calculations preserve legacy warning arrays in stored pricing", () => {
  const legacyWarnings = ["Legacy saved warning"];
  const updated = withProfit(
    {
      materialCost: 100,
      laborCost: 130,
      laborRateType: "residential",
      laborSellRate: 150,
      laborSellAmount: 300,
      materialMarkup: 0.25,
      calculatedSellingPrice: 425,
      finalSellingPrice: 425,
      laborOverride: null,
      sellingPriceOverride: null,
      grossProfit: 195,
      grossMargin: 0.4588,
      pricingWarnings: legacyWarnings,
    },
    { laborOverride: 140 },
  );
  assert.strictEqual(updated.pricingWarnings, legacyWarnings);
  assert.deepEqual(updated.pricingWarnings, ["Legacy saved warning"]);
});

test("status-only quote updates preserve the exact stored pricing object", () => {
  const storedPricing = {
    materialCost: 100,
    laborCost: 130,
    materialMarkup: 0.25,
    calculatedSellingPrice: 425,
    finalSellingPrice: 425,
    laborOverride: null,
    sellingPriceOverride: null,
    grossProfit: 195,
    grossMargin: 0.4588,
    pricingWarnings: ["Legacy saved warning"],
  };
  assert.strictEqual(pricingForQuoteUpdate(storedPricing, {}), storedPricing);
});

test("traditional 3-way zero traveler footage has its specific warning code", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...recessedInputs,
      wiringOption: "New wiring from source",
      switchingMethod: "traditional-3-way",
      switchType: "3-way",
      traditionalThreeWayFootage: 0,
    },
    settings,
    [],
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "THREE_WAY_TRAVELER_FOOTAGE_ZERO",
    ),
    true,
  );
});

test("override validation rejects negative, non-finite, and oversized values", () => {
  assert.equal(validateOverrideValues({ laborOverride: 0 }), true);
  assert.equal(
    validateOverrideValues({ sellingPriceOverride: MAX_OVERRIDE_VALUE }),
    true,
  );
  assert.equal(validateOverrideValues({ laborOverride: -0.01 }), false);
  assert.equal(validateOverrideValues({ sellingPriceOverride: Infinity }), false);
  assert.equal(
    validateOverrideValues({ laborOverride: MAX_OVERRIDE_VALUE + 0.01 }),
    false,
  );
});

test("company-aware quote numbers remain unique across concurrent IDs and deletions", () => {
  const existing = formatQuoteNumber(1, 41);
  const concurrent = [
    formatQuoteNumber(1, 42),
    formatQuoteNumber(1, 43),
    formatQuoteNumber(2, 42),
  ];
  assert.equal(existing, "Q-1-000041");
  assert.equal(new Set([existing, ...concurrent]).size, 4);
  assert.equal(formatQuoteNumber(1, 44), "Q-1-000044");
});