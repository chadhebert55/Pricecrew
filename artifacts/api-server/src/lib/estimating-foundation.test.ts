import assert from "node:assert/strict";
import test from "node:test";
import type {
  BathroomInputRecord,
  EvChargerInputRecord,
  KitchenInputRecord,
  PricingWarningRecord,
  RecessedLightingInputRecord,
} from "@workspace/db";
import { CreateQuoteBody, PreviewQuoteBody } from "@workspace/api-zod";
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
  category: "Other",
  item,
  unitCost,
  supplier: "Northeast Electrical",
  manufacturer: null,
  manufacturerPartNumber: null,
  supplierSku: null,
  upc: null,
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
    upc: "88762121675",
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
  assert.equal(breaker?.source.includes("UPC 88762121675"), true);
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
    "8/2 SER cable",
  );
});

test("EV uses the selected non-conduit cable key and route footage per charger", () => {
  const result = calculateEvChargerEstimate(
    {
      ...evInputs,
      wiringMethod: "Romex (NM-B)",
      cableType: "6/3 NM-B",
      chargerQuantity: 2,
      routeLength: 25,
    },
    settings,
    [qf250a, catalogRow("6/3 NM-B cable", 9.5)],
  );
  const cable = result.assembly.find((line) => line.id === "cable");
  assert.equal(cable?.description, "6/3 NM-B cable — verify conductor sizing and route");
  assert.equal(cable?.quantity, 50);
  assert.equal(cable?.unitCost, 9.5);
});

test("EV cable selection precedence is job override, company default, then system fallback", () => {
  const companyDefault = calculateEvChargerEstimate(
    { ...evInputs, wiringMethod: "Romex (NM-B)", cableType: undefined },
    { ...settings, evDefaultCableType: "6/3 NM-B" },
    [catalogRow("6/3 NM-B cable", 3.921784)],
  );
  const jobOverride = calculateEvChargerEstimate(
    { ...evInputs, wiringMethod: "Romex (NM-B)", cableType: "8/2 NM-B" },
    { ...settings, evDefaultCableType: "6/3 NM-B" },
    [catalogRow("8/2 NM-B cable", 1.89096)],
  );
  const systemFallback = calculateEvChargerEstimate(
    { ...evInputs, wiringMethod: "Romex (NM-B)", cableType: undefined },
    settings,
    [catalogRow("8/3 NM-B cable", 2.682868)],
  );

  assert.equal(companyDefault.assembly.find((line) => line.id === "cable")?.unitCost, 3.921784);
  assert.equal(jobOverride.assembly.find((line) => line.id === "cable")?.unitCost, 1.89096);
  assert.equal(systemFallback.assembly.find((line) => line.id === "cable")?.unitCost, 2.682868);
});

test("EV preview and create validate the same cable snapshot", () => {
  const jobInputs = {
    ...evInputs,
    wiringMethod: "Romex (NM-B)",
    cableType: "8/3 NM-B" as const,
  };
  assert.equal(
    PreviewQuoteBody.safeParse({ module: "EV_CHARGER", jobInputs }).success,
    true,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "EV parity test",
      projectName: "50A circuit",
      module: "EV_CHARGER",
      jobInputs,
      proposalDescription: "Install configured EV circuit.",
    }).success,
    true,
  );

  const invalidInputs = { ...jobInputs, routeLength: -1 };
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "EV_CHARGER",
      jobInputs: invalidInputs,
    }).success,
    false,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "EV parity test",
      projectName: "Invalid route",
      module: "EV_CHARGER",
      jobInputs: invalidInputs,
      proposalDescription: "Validation test.",
    }).success,
    false,
  );
});

test("EV never substitutes a cable across incompatible wiring methods", () => {
  for (const [wiringMethod, cableType] of [
    ["MC Cable", "8/3 NM-B"],
    ["SER Cable", "8/3 NM-B"],
    ["Romex (NM-B)", "8/2 SER"],
  ] as const) {
    const result = calculateEvChargerEstimate(
      { ...evInputs, wiringMethod, cableType },
      settings,
      [
        catalogRow("8/3 NM-B cable", 2.682868),
        catalogRow("8/2 SER cable", 4.25),
      ],
    );
    assert.equal(
      result.assembly.find((line) => line.id === "cable")?.unitCost,
      0,
    );
    assert.equal(
      result.pricing.pricingWarnings.some(
        (warning) =>
          typeof warning !== "string" &&
          warning.message.includes("not compatible"),
      ),
      true,
    );
  }
});

test("EV zero route footage remains visible as a pricing warning", () => {
  const result = calculateEvChargerEstimate(
    {
      ...evInputs,
      wiringMethod: "Romex (NM-B)",
      cableType: "8/3 NM-B",
      routeLength: 0,
    },
    settings,
    [catalogRow("8/3 NM-B cable", 2.682868)],
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.message.includes("route length is zero or invalid"),
    ),
    true,
  );
});

test("EV legacy cable snapshots resolve by their original wiring method", () => {
  const romex = calculateEvChargerEstimate(
    { ...evInputs, wiringMethod: "Romex (NM-B)", cableType: undefined },
    settings,
    [qf250a],
  );
  const ser = calculateEvChargerEstimate(
    { ...evInputs, wiringMethod: "SER Cable", cableType: undefined },
    settings,
    [qf250a],
  );
  assert.equal(romex.assembly.find((line) => line.id === "cable")?.description.startsWith("8/3 NM-B cable"), true);
  assert.equal(ser.assembly.find((line) => line.id === "cable")?.description.startsWith("8/2 SER cable"), true);
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

test("task-based builders add quote labor adjustments exactly once", () => {
  const adjustedEstimates = [
    [
      calculateEvChargerEstimate(evInputs, settings, [qf250a]),
      calculateEvChargerEstimate(
        { ...evInputs, laborAdjustmentHours: 2.5 },
        settings,
        [qf250a],
      ),
    ],
    [
      calculateBathroomEstimate(bathroomInputs, settings, []),
      calculateBathroomEstimate(
        { ...bathroomInputs, laborAdjustmentHours: 2.5 },
        settings,
        [],
      ),
    ],
    [
      calculateKitchenEstimate(kitchenInputs, settings, []),
      calculateKitchenEstimate(
        { ...kitchenInputs, laborAdjustmentHours: 2.5 },
        settings,
        [],
      ),
    ],
    [
      calculateRecessedLightingEstimate(recessedInputs, settings, []),
      calculateRecessedLightingEstimate(
        { ...recessedInputs, laborAdjustmentHours: 2.5 },
        settings,
        [],
      ),
    ],
  ];

  for (const [base, adjusted] of adjustedEstimates) {
    assert.equal(
      adjusted.pricing.laborCost - base.pricing.laborCost,
      2.5 * settings.loadedLaborCost,
    );
  }
});

test("recessed lighting adjustment is not multiplied by ceiling difficulty", () => {
  for (const ceilingHeight of [
    "Standard 8-10 ft",
    "High ceiling",
    "Vaulted ceiling",
  ]) {
    const base = calculateRecessedLightingEstimate(
      { ...recessedInputs, ceilingHeight, laborAdjustmentHours: 0 },
      settings,
      [],
    );
    const adjusted = calculateRecessedLightingEstimate(
      { ...recessedInputs, ceilingHeight, laborAdjustmentHours: 2 },
      settings,
      [],
    );
    assert.ok(
      Math.abs(
        adjusted.pricing.laborCost -
          base.pricing.laborCost -
          2 * settings.loadedLaborCost,
      ) < 0.000001,
    );
  }
});

test("negative labor adjustments cannot produce negative labor cost", () => {
  const estimates = [
    calculateEvChargerEstimate(
      { ...evInputs, laborAdjustmentHours: -10_000 },
      settings,
      [qf250a],
    ),
    calculateBathroomEstimate(
      { ...bathroomInputs, laborAdjustmentHours: -10_000 },
      settings,
      [],
    ),
    calculateKitchenEstimate(
      { ...kitchenInputs, laborAdjustmentHours: -10_000 },
      settings,
      [],
    ),
    calculateRecessedLightingEstimate(
      { ...recessedInputs, laborAdjustmentHours: -10_000 },
      settings,
      [],
    ),
  ];

  for (const estimate of estimates) {
    assert.equal(estimate.pricing.laborCost, 0);
    assert.equal(estimate.pricing.laborSellAmount, 0);
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