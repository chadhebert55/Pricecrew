import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test from "node:test";
import type {
  AdditionInputRecord,
  BathroomInputRecord,
  CustomInputRecord,
  EvChargerInputRecord,
  KitchenInputRecord,
  NewHouseInputRecord,
  PricingWarningRecord,
  RecessedLightingInputRecord,
  ServiceCallInputRecord,
  TimeMaterialsInputRecord,
} from "@workspace/db";
import {
  companiesTable,
  customersTable,
  companyMembersTable,
  companySettingsTable,
  db,
  priceBookItemsTable,
  proposalDecisionsTable,
  quotesTable,
} from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  CreateQuoteBody,
  PreviewQuoteBody,
  UpdateSettingsBody,
} from "@workspace/api-zod";
import app from "../app";
import {
  calculateBathroomEstimate,
  calculateCustomEstimate,
  calculateEvChargerEstimate,
  calculateKitchenEstimate,
  calculateRecessedLightingEstimate,
  calculateServiceCallEstimate,
  calculateTimeMaterialsEstimate,
  normalizePricingWarnings,
  type EstimatingSettings,
  type PriceBookItem,
} from "./estimating-engine";
import {
  formatQuoteNumber,
  customerMaterialDescription,
  createProposalShareToken,
  evaluateCustomerReadyPricing,
  hasBlockingPricingWarnings,
  MAX_OVERRIDE_VALUE,
  matchCustomerForQuote,
  normalizePercentageSetting,
  normalizeEstimateModule,
  negativeLaborAdjustmentFields,
  pricingForQuoteUpdate,
  parseProposalShareToken,
  validateOverrideValues,
  withProfit,
} from "../routes/estimating";
import {
  ensureEstimatorSeed,
  seedEstimatorData,
  SIEMENS_QF250A_SEED_COST,
} from "./estimating-seed";

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

test("customer-safe quote numbers use only a company-scoped sequence", () => {
  const existing = formatQuoteNumber(41);
  const concurrent = [
    formatQuoteNumber(42),
    formatQuoteNumber(43),
    formatQuoteNumber(44),
  ];
  assert.equal(existing, "Q-000041");
  assert.equal(new Set([existing, ...concurrent]).size, 4);
  assert.equal(formatQuoteNumber(45), "Q-000045");
});

const serviceCallInputs: ServiceCallInputRecord = {
  serviceType: "Residential standard service visit",
  visitQuantity: 1,
  receptacleReplacementQuantity: 1,
  trReceptacleReplacementQuantity: 1,
  switchReplacementQuantity: 0,
  gfciReplacementQuantity: 1,
  crewSize: 1,
  crewHours: 2,
  laborRateType: "residential",
  materialMarkup: 30,
  targetMargin: 35,
  miscellaneousMaterials: [],
  notes: "",
};

const timeMaterialsInputs: TimeMaterialsInputRecord = {
  serviceType: "Commercial time and materials",
  crewSize: 2,
  crewHours: 3,
  laborRateType: "commercial",
  laborSellRate: 200,
  loadedLaborCost: 60,
  materialMarkup: 50,
  targetMargin: 30,
  miscellaneousMaterials: [
    { id: "wire", description: "Wire and fittings allowance", cost: 100 },
  ],
  notes: "",
};

const customInputs: CustomInputRecord = {
  laborHours: 4,
  laborRateType: "commercial",
  laborSellRate: 180,
  loadedLaborCost: 70,
  materialMarkup: 20,
  targetMargin: 40,
  materials: [
    {
      id: "fixture",
      description: "Owner-selected decorative fixture",
      quantity: 2,
      unit: "ea",
      unitCost: 25,
    },
  ],
  miscellaneousMaterials: [
    { id: "consumables", description: "Consumables allowance", cost: 10 },
  ],
  notes: "Internal custom scope note.",
};

const newHouseInputs: NewHouseInputRecord = {
  finishedSquareFootage: 2200,
  floorCount: 2,
  garageSquareFootage: 420,
  basementSquareFootage: 0,
  basementFinished: false,
  outletQuantity: 42,
  switchQuantity: 20,
  dimmerQuantity: 4,
  recessedLightQuantity: 12,
  recessedLightSize: "4-inch",
  fanQuantity: 2,
  fanSupply: "Builder / GC supplied",
  panelManufacturer: "Siemens",
  smokeCoQuantity: 5,
  bedroomCount: 4,
  bathroomQuantity: 2,
  kitchenApplianceCircuitQuantity: 5,
  laundryCircuitQuantity: 2,
  exteriorReceptacleQuantity: 3,
  exteriorLightingQuantity: 4,
  garageReceptacleQuantity: 4,
  garageCircuitQuantity: 1,
  servicePanelAllowance: 3500,
  hvacEquipmentCircuitQuantity: 1,
  miniSplitCircuitQuantity: 0,
  commonBranchCircuitQuantity: 12,
  branchCircuitFootage: 900,
  branchCircuitAmperage: 20,
  branchCircuitPoleCount: 1,
  branchCircuitProtectionType: "Dual Function",
  branchCircuitCableType: "12/2 NM-B",
  equipmentCircuitFootage: 80,
  equipmentCircuitAmperage: 30,
  equipmentCircuitPoleCount: 2,
  equipmentCircuitProtectionType: "Standard",
  equipmentCircuitCableType: "10/2 NM-B",
  crewSize: 2,
  crewHours: 80,
  laborAdjustmentHours: 0,
  laborRateType: "residential",
  notes: "",
};

test("Service Call uses verified device rows and visibly preserves unresolved materials", () => {
  const result = calculateServiceCallEstimate(serviceCallInputs, settings, [
    catalogRow("Pass & Seymour 3232-TRW 15A TR duplex receptacle", 1.25),
    catalogRow("Pass & Seymour 2097-TRWRW 20A TR self-test GFCI", 24.5),
  ]);
  assert.equal(
    result.assembly.find((line) => line.id === "tr-receptacle-replacement")
      ?.unitCost,
    1.25,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "standard-receptacle-replacement")
      ?.unitCost,
    0,
  );
  assert.equal(result.pricing.materialMarkup, 0.3);
  assert.equal(result.pricing.laborCost, 243.75);
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "PRICE_BOOK_ITEM_UNRESOLVED" &&
        warning.context.itemKey === "standard receptacle",
    ),
    true,
  );
  expectStructuredWarnings(result.pricing.pricingWarnings);
});

test("Time & Materials honors quote-local labor, loaded cost, markup, and margin assumptions", () => {
  const result = calculateTimeMaterialsEstimate(
    timeMaterialsInputs,
    settings,
    [],
  );
  assert.equal(result.pricing.materialCost, 100);
  assert.equal(result.pricing.laborCost, 360);
  assert.equal(result.pricing.laborSellRate, 200);
  assert.equal(result.pricing.laborSellAmount, 1200);
  assert.equal(result.pricing.materialMarkup, 0.5);
  assert.equal(result.pricing.finalSellingPrice, 1350);
  assert.equal(result.pricing.grossMargin, 0.6593);
  expectStructuredWarnings(result.pricing.pricingWarnings);
});

test("Custom Items uses exact quote-local labor, materials, markup, and margin assumptions", () => {
  const result = calculateCustomEstimate(customInputs, settings, []);
  assert.equal(result.pricing.materialCost, 60);
  assert.equal(result.pricing.laborCost, 280);
  assert.equal(result.pricing.laborSellRate, 180);
  assert.equal(result.pricing.laborSellAmount, 720);
  assert.equal(result.pricing.materialMarkup, 0.2);
  assert.equal(result.pricing.finalSellingPrice, 792);
  assert.equal(result.assembly[0]?.description, "Owner-selected decorative fixture");
  assert.equal(result.assembly[0]?.extendedCost, 50);
  assert.deepEqual(result.pricing.pricingWarnings, []);
});

type QuoteRequest = {
  customerId?: number;
  sourceQuoteId?: number;
  customerName: string;
  customerEmail?: string | null;
  projectName: string;
  proposalDescription: string;
  module: "SERVICE_CALL" | "NEW_HOUSE" | "ADDITION";
  jobInputs: ServiceCallInputRecord | NewHouseInputRecord | AdditionInputRecord;
};

type CreatedQuote = {
  id: number;
  customerId: number | null;
  customerName: string;
  customerEmail: string | null;
};

test("module aliases include canonical and seeded historical builder labels", () => {
  assert.equal(normalizeEstimateModule("EV_CHARGER"), "EV_CHARGER");
  assert.equal(normalizeEstimateModule("EV Charger Builder"), "EV_CHARGER");
  assert.equal(normalizeEstimateModule("Time & Materials"), "TIME_MATERIALS");
  assert.equal(normalizeEstimateModule("New House Builder"), "NEW_HOUSE");
  assert.equal(normalizeEstimateModule("unknown legacy calculator"), null);
});

type CustomerSummary = {
  id: number;
  name: string;
  email: string | null;
};

const testServerContexts = new Map<
  Server,
  { userId: string; baseUrl: string }
>();
const authenticatedHeadersByBaseUrl = new Map<string, Record<string, string>>();

function authenticatedHeaders(baseUrl: string) {
  const headers = authenticatedHeadersByBaseUrl.get(baseUrl);
  if (!headers) throw new Error(`No test authentication registered for ${baseUrl}`);
  return headers;
}

async function startTestServer() {
  await ensureEstimatorSeed();
  const userId = `user_estimator_integration_${randomUUID()}`;
  const [company] = await db
    .insert(companiesTable)
    .values({ name: `Estimator integration test ${randomUUID()}` })
    .returning();
  if (!company) throw new Error("Unable to create isolated test company");
  try {
    await ensureTestCompanySeed(company.id);
    await db.insert(companyMembersTable).values({
      userId,
      companyId: company.id,
      role: "owner",
    });
  } catch (error) {
    await cleanupTestCompany(company.id, userId);
    throw error;
  }
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, () => resolve(candidate));
    candidate.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Test server did not expose a TCP address");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  testServerContexts.set(server, { userId, baseUrl });
  authenticatedHeadersByBaseUrl.set(baseUrl, {
    "content-type": "application/json",
    "x-test-clerk-user-id": userId,
  });
  return {
    server,
    baseUrl,
  };
}

async function closeTestServer(server: Server) {
  const context = testServerContexts.get(server);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  testServerContexts.delete(server);
  if (!context) return;
  authenticatedHeadersByBaseUrl.delete(context.baseUrl);

  const [membership] = await db
    .select({ companyId: companyMembersTable.companyId })
    .from(companyMembersTable)
    .where(eq(companyMembersTable.userId, context.userId));
  if (!membership) return;
  await cleanupTestCompany(membership.companyId, context.userId);
}

async function cleanupTestCompany(companyId: number, userId: string) {
  await db
    .delete(proposalDecisionsTable)
    .where(eq(proposalDecisionsTable.companyId, companyId));
  await db
    .delete(quotesTable)
    .where(eq(quotesTable.companyId, companyId));
  await db
    .delete(customersTable)
    .where(eq(customersTable.companyId, companyId));
  await db
    .delete(priceBookItemsTable)
    .where(eq(priceBookItemsTable.companyId, companyId));
  await db
    .delete(companySettingsTable)
    .where(eq(companySettingsTable.companyId, companyId));
  await db
    .delete(companyMembersTable)
    .where(eq(companyMembersTable.userId, userId));
  await db
    .delete(companiesTable)
    .where(eq(companiesTable.id, companyId));
}

async function ensureTestCompanySeed(companyId: number) {
  await seedEstimatorData(db, { companyId });
}

async function postQuote(baseUrl: string, input: QuoteRequest) {
  const response = await fetch(`${baseUrl}/api/quotes`, {
    method: "POST",
    headers: authenticatedHeaders(baseUrl),
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Partial<CreatedQuote> & {
    error?: string;
  };
  assert.equal(
    response.status,
    201,
    `Expected quote creation to succeed: ${JSON.stringify(body)}`,
  );
  assert.equal(typeof body.id, "number");
  return body as CreatedQuote;
}

async function getQuote(baseUrl: string, id: number) {
  const response = await fetch(`${baseUrl}/api/quotes/${id}`, {
    headers: authenticatedHeaders(baseUrl),
  });
  const body = (await response.json()) as {
    jobInputs: Record<string, unknown>;
    assembly: Array<{
      id: string;
      description: string;
      unitCost: number;
      extendedCost: number;
    }>;
    pricing: { materialCost: number; laborCost: number };
    error?: string;
  };
  assert.equal(
    response.status,
    200,
    `Expected quote reload to succeed: ${JSON.stringify(body)}`,
  );
  return body;
}

test("saved Addition subpanel preview stays identical and retains the 30A 10/3 NM-B circuit", async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const context = testServerContexts.get(server);
    assert.ok(context);
    const [membership] = await db
      .select({ companyId: companyMembersTable.companyId })
      .from(companyMembersTable)
      .where(eq(companyMembersTable.userId, context.userId));
    assert.ok(membership);
    await db.insert(priceBookItemsTable).values([
      {
        companyId: membership.companyId,
        category: "Conductor",
        item: "10/3 NM-B cable",
        unit: "ft",
        unitCost: 1.25,
        supplier: "Regression catalog",
        manufacturer: "Test Wire",
        manufacturerPartNumber: "TEST-10-3",
        supplierSku: "TEST-10-3",
        sourceDate: "2026-08-28",
        isDefault: false,
      },
      {
        companyId: membership.companyId,
        category: "Conductor",
        item: "10/2 NM-B cable",
        unit: "ft",
        unitCost: 0.75,
        supplier: "Regression catalog",
        manufacturer: "Test Wire",
        manufacturerPartNumber: "TEST-10-2",
        supplierSku: "TEST-10-2",
        sourceDate: "2026-08-28",
        isDefault: false,
      },
      {
        companyId: membership.companyId,
        category: "Conductor",
        item: "#6 copper SER cable",
        unit: "ft",
        unitCost: 3,
        supplier: "Regression catalog",
        manufacturer: "Test Wire",
        manufacturerPartNumber: "TEST-6-CU-SER",
        supplierSku: "TEST-6-CU-SER",
        sourceDate: "2026-08-28",
        isDefault: false,
      },
      {
        companyId: membership.companyId,
        category: "Panel",
        item: "60A subpanel load center",
        unit: "ea",
        unitCost: 120,
        supplier: "Regression catalog",
        manufacturer: "Test Panel",
        manufacturerPartNumber: "TEST-60-PANEL",
        supplierSku: "TEST-60-PANEL",
        sourceDate: "2026-08-28",
        isDefault: false,
      },
      {
        companyId: membership.companyId,
        category: "Protection",
        item: "Siemens 60A 2-pole Standard breaker",
        unit: "ea",
        unitCost: 40,
        supplier: "Regression catalog",
        manufacturer: "Siemens",
        manufacturerPartNumber: "TEST-60-BREAKER",
        supplierSku: "TEST-60-BREAKER",
        sourceDate: "2026-08-28",
        amperage: 60,
        poleCount: 2,
        protectionType: "Standard",
        isDefault: false,
      },
    ]);
    const jobInputs: AdditionInputRecord = {
      length: 20,
      width: 16,
      receptacles: 0,
      switches: 0,
      dimmers: 0,
      recessedLights: 0,
      ceilingFans: 0,
      customerSuppliedFans: true,
      circuitCount: 1,
      routeLength: 50,
      homeRunLength: 35,
      panelManufacturer: "Siemens",
      breakerAmperage: 20,
      breakerPoleCount: 1,
      breakerProtectionType: "Standard",
      cableType: "12/2 NM-B",
      circuitEntries: [{
        amperage: 30,
        poleCount: 2,
        protectionType: "Standard",
        cableType: "10/3 NM-B",
        quantity: 1,
      }],
      subpanelOption: "60A Subpanel",
      feederDistance: 45,
      crewSize: 1,
      crewHours: 1,
      notes: "",
    };
    const previewResponse = await fetch(`${baseUrl}/api/quotes/preview`, {
      method: "POST",
      headers: authenticatedHeaders(baseUrl),
      body: JSON.stringify({ module: "ADDITION", jobInputs }),
    });
    const preview = (await previewResponse.json()) as Awaited<
      ReturnType<typeof getQuote>
    >;
    assert.equal(
      previewResponse.status,
      200,
      `Expected Addition preview to succeed: ${JSON.stringify(preview)}`,
    );
    const created = await postQuote(baseUrl, {
      customerName: `Addition 10/3 ${randomUUID()}`,
      projectName: "30A Addition circuit",
      proposalDescription: "Install the configured 30A branch circuit.",
      module: "ADDITION",
      jobInputs,
    });
    const saved = await getQuote(baseUrl, created.id);
    assert.equal(saved.jobInputs.subpanelOption, "60A Subpanel");
    assert.equal(saved.jobInputs.feederDistance, 45);
    const savedEntries = saved.jobInputs.circuitEntries as AdditionInputRecord["circuitEntries"];
    assert.equal(savedEntries?.[0]?.cableType, "10/3 NM-B");
    const cableLine = saved.assembly.find(
      (line) => line.id === "addition-circuit-1-cable",
    );
    assert.equal(cableLine?.description, "30A 2-pole 10/3 NM-B branch-circuit cable");
    assert.equal(cableLine?.unitCost, 1.25);
    assert.equal(cableLine?.extendedCost, 106.25);
    const feederLine = saved.assembly.find(
      (line) => line.id === "addition-subpanel-feeder",
    );
    assert.equal(feederLine?.description.includes("#6 copper SER 4-wire"), true);
    assert.equal(feederLine?.unitCost, 3);
    assert.equal(feederLine?.extendedCost, 135);
    assert.equal(
      saved.assembly.find(
        (line) => line.id === "addition-subpanel-feeder-breaker",
      )?.unitCost,
      40,
    );
    assert.equal(
      saved.assembly.find(
        (line) => line.id === "addition-subpanel-load-center",
      )?.unitCost,
      120,
    );
    assert.deepEqual(saved.assembly, preview.assembly);
    assert.deepEqual(saved.pricing, preview.pricing);
    assert.equal(
      saved.assembly.some((line) => line.description.includes("10/2 NM-B")),
      false,
    );
  } finally {
    await closeTestServer(server);
  }
});

async function postCustomer(
  baseUrl: string,
  input: { name: string; email?: string | null },
) {
  const { response, body } = await postCustomerRequest(baseUrl, input);
  assert.equal(
    response.status,
    201,
    `Expected customer creation to succeed: ${JSON.stringify(body)}`,
  );
  assert.equal(typeof body.id, "number");
  return body as CustomerSummary;
}

async function postCustomerRequest(
  baseUrl: string,
  input: { name: string; email?: string | null },
) {
  const response = await fetch(`${baseUrl}/api/customers`, {
    method: "POST",
    headers: authenticatedHeaders(baseUrl),
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as CustomerSummary & { error?: string };
  return { response, body };
}

async function patchCustomer(
  baseUrl: string,
  id: number,
  input: { name?: string; email?: string | null },
) {
  const response = await fetch(`${baseUrl}/api/customers/${id}`, {
    method: "PATCH",
    headers: authenticatedHeaders(baseUrl),
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Partial<CustomerSummary> & {
    error?: string;
  };
  return { response, body };
}

test("simultaneous same-email quotes share one persisted customer", async () => {
  const marker = `Concurrent same-email ${randomUUID()}`;
  const email = `${randomUUID()}@example.com`;
  const { server, baseUrl } = await startTestServer();

  try {
    const input = {
      customerName: marker,
      customerEmail: `  ${email.toUpperCase()} `,
      projectName: `${marker} project`,
      proposalDescription: "Concurrent customer identity regression",
      module: "SERVICE_CALL" as const,
      jobInputs: serviceCallInputs,
    };
    const created = await Promise.all([
      postQuote(baseUrl, { ...input, projectName: `${marker} project one` }),
      postQuote(baseUrl, { ...input, projectName: `${marker} project two` }),
    ]);

    const quotes = await db
      .select()
      .from(quotesTable)
      .where(inArray(quotesTable.id, created.map((quote) => quote.id)))
      .then((rows) => rows.sort((left, right) => left.id - right.id));
    assert.equal(quotes.length, 2);
    assert.equal(quotes[0]?.customerId, quotes[1]?.customerId);

    const customers = await db
      .select()
      .from(customersTable)
      .where(
        eq(customersTable.email, email),
      );
    assert.equal(customers.length, 1);
    assert.equal(quotes[0]?.customerId, customers[0]?.id);
  } finally {
    await closeTestServer(server);
  }
});

test("simultaneous customer creation produces one normalized-email conflict", async () => {
  const marker = `Concurrent customer creation ${randomUUID()}`;
  const email = `${randomUUID()}@example.com`;
  const firstName = `${marker} first`;
  const secondName = `${marker} second`;
  const { server, baseUrl } = await startTestServer();

  try {
    const results = await Promise.all([
      postCustomerRequest(baseUrl, {
        name: firstName,
        email: `  ${email.toUpperCase()} `,
      }),
      postCustomerRequest(baseUrl, {
        name: secondName,
        email: ` ${email} `,
      }),
    ]);

    const successful = results.filter(
      (result) => result.response.status === 201,
    );
    const conflicts = results.filter(
      (result) => result.response.status === 409,
    );
    assert.equal(successful.length, 1);
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0]?.body, {
      error: "A customer with this email already exists.",
    });
    assert.equal(successful[0]?.body.email, email);
    assert.equal(typeof successful[0]?.body.id, "number");

    const customers = await db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        email: customersTable.email,
      })
      .from(customersTable)
      .where(eq(customersTable.email, email));
    assert.equal(customers.length, 1);
    assert.equal(customers[0]?.id, successful[0]?.body.id);
    assert.equal(customers[0]?.name, successful[0]?.body.name);
  } finally {
    await closeTestServer(server);
  }
});

test("simultaneous email claims converge on one customer without rewriting historical quotes", async () => {
  const marker = `Concurrent email claim ${randomUUID()}`;
  const email = `${randomUUID()}@example.com`;
  const firstName = `${marker} first`;
  const secondName = `${marker} second`;
  const { server, baseUrl } = await startTestServer();

  try {
    const historical = await Promise.all([
      postQuote(baseUrl, {
        customerName: firstName,
        customerEmail: null,
        projectName: `${marker} historical one`,
        proposalDescription: "Historical quote one",
        module: "SERVICE_CALL",
        jobInputs: serviceCallInputs,
      }),
      postQuote(baseUrl, {
        customerName: secondName,
        customerEmail: null,
        projectName: `${marker} historical two`,
        proposalDescription: "Historical quote two",
        module: "SERVICE_CALL",
        jobInputs: serviceCallInputs,
      }),
    ]);
    const historicalBefore = (
      await db
        .select()
        .from(quotesTable)
        .where(inArray(quotesTable.id, historical.map((quote) => quote.id)))
    ).sort((left, right) => left.id - right.id);
    assert.equal(historicalBefore.length, 2);
    assert.equal(
      historicalBefore.every((quote) => quote.customerEmail === null),
      true,
    );

    const existingCustomers = await db
      .select()
      .from(customersTable)
      .where(
        or(
          eq(customersTable.name, firstName),
          eq(customersTable.name, secondName),
        ),
      );
    assert.equal(existingCustomers.length, 2);
    assert.equal(
      existingCustomers.every((customer) => customer.email === null),
      true,
    );

    const claimed = await Promise.all([
      postQuote(baseUrl, {
        customerName: firstName,
        customerEmail: email,
        projectName: `${marker} claimed one`,
        proposalDescription: "Concurrent email claim one",
        module: "SERVICE_CALL",
        jobInputs: serviceCallInputs,
      }),
      postQuote(baseUrl, {
        customerName: secondName,
        customerEmail: email,
        projectName: `${marker} claimed two`,
        proposalDescription: "Concurrent email claim two",
        module: "SERVICE_CALL",
        jobInputs: serviceCallInputs,
      }),
    ]);

    const claimedQuotes = await db
      .select()
      .from(quotesTable)
      .where(inArray(quotesTable.id, claimed.map((quote) => quote.id)))
      .then((rows) => rows.sort((left, right) => left.id - right.id));
    assert.equal(claimedQuotes.length, 2);
    assert.equal(claimedQuotes[0]?.customerId, claimedQuotes[1]?.customerId);

    const customersAfter = await db
      .select()
      .from(customersTable)
      .where(
        inArray(customersTable.name, [firstName, secondName]),
      );
    assert.equal(customersAfter.length, 2);
    assert.equal(
      customersAfter.filter((customer) => customer.email === email).length,
      1,
    );
    assert.equal(
      customersAfter.filter((customer) => customer.email === null).length,
      1,
    );
    const winningCustomer = customersAfter.find(
      (customer) => customer.email === email,
    );
    assert.equal(winningCustomer !== undefined, true);
    assert.equal(
      claimedQuotes.every((quote) => quote.customerId === winningCustomer?.id),
      true,
    );

    const historicalAfter = (
      await db
        .select()
        .from(quotesTable)
        .where(inArray(quotesTable.id, historical.map((quote) => quote.id)))
    ).sort((left, right) => left.id - right.id);
    assert.deepEqual(historicalAfter, historicalBefore);
  } finally {
    await closeTestServer(server);
  }
});

test("customer email edits normalize, preserve quote snapshots, and reject conflicts atomically", async () => {
  const marker = `Customer edit ${randomUUID()}`;
  const originalEmail = `${randomUUID()}@example.com`;
  const conflictingEmail = `${randomUUID()}@example.com`;
  const updatedEmail = `${randomUUID()}@example.com`;
  const { server, baseUrl } = await startTestServer();

  try {
    const primary = await postCustomer(baseUrl, {
      name: `${marker} primary`,
      email: `  ${originalEmail.toUpperCase()} `,
    });
    const conflicting = await postCustomer(baseUrl, {
      name: `${marker} conflicting`,
      email: `  ${conflictingEmail.toUpperCase()} `,
    });
    assert.equal(primary.email, originalEmail);
    assert.equal(conflicting.email, conflictingEmail);

    const historical = await postQuote(baseUrl, {
      customerName: `${marker} primary`,
      customerEmail: `  ${originalEmail.toUpperCase()} `,
      projectName: `${marker} historical quote`,
      proposalDescription: "Customer profile edit snapshot regression",
      module: "SERVICE_CALL",
      jobInputs: serviceCallInputs,
    });
    const historicalBefore = await db
      .select({
        id: quotesTable.id,
        customerId: quotesTable.customerId,
        customerName: quotesTable.customerName,
        customerEmail: quotesTable.customerEmail,
      })
      .from(quotesTable)
      .where(eq(quotesTable.id, historical.id));
    assert.deepEqual(historicalBefore, [
      {
        id: historical.id,
        customerId: primary.id,
        customerName: `${marker} primary`,
        customerEmail: `  ${originalEmail.toUpperCase()} `,
      },
    ]);

    const customersBeforeConflict = await db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        email: customersTable.email,
      })
      .from(customersTable)
      .where(inArray(customersTable.id, [primary.id, conflicting.id]));

    const conflict = await patchCustomer(baseUrl, primary.id, {
      name: `${marker} changed during conflict`,
      email: `  ${conflictingEmail.toUpperCase()} `,
    });
    assert.equal(conflict.response.status, 409);
    assert.deepEqual(conflict.body, {
      error: "A customer with this email already exists.",
    });

    const customersAfterConflict = await db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        email: customersTable.email,
      })
      .from(customersTable)
      .where(inArray(customersTable.id, [primary.id, conflicting.id]));
    assert.deepEqual(
      customersAfterConflict.sort((left, right) => left.id - right.id),
      customersBeforeConflict.sort((left, right) => left.id - right.id),
    );

    const successfulUpdate = await patchCustomer(baseUrl, primary.id, {
      name: `  ${marker} updated   primary  `,
      email: `  ${updatedEmail.toUpperCase()} `,
    });
    assert.equal(successfulUpdate.response.status, 200);
    assert.equal(successfulUpdate.body.name, `${marker} updated primary`);
    assert.equal(successfulUpdate.body.email, updatedEmail);

    const historicalAfter = await db
      .select({
        id: quotesTable.id,
        customerId: quotesTable.customerId,
        customerName: quotesTable.customerName,
        customerEmail: quotesTable.customerEmail,
      })
      .from(quotesTable)
      .where(eq(quotesTable.id, historical.id));
    assert.deepEqual(historicalAfter, historicalBefore);
  } finally {
    await closeTestServer(server);
  }
});

test("simultaneous customer email edits produce one conflict without partial updates", async () => {
  const marker = `Concurrent customer edit ${randomUUID()}`;
  const firstEmail = `${randomUUID()}@example.com`;
  const secondEmail = `${randomUUID()}@example.com`;
  const claimedEmail = `${randomUUID()}@example.com`;
  const firstName = `${marker} first`;
  const secondName = `${marker} second`;
  const { server, baseUrl } = await startTestServer();

  try {
    const [first, second] = await Promise.all([
      postCustomer(baseUrl, {
        name: firstName,
        email: `  ${firstEmail.toUpperCase()} `,
      }),
      postCustomer(baseUrl, {
        name: secondName,
        email: `  ${secondEmail.toUpperCase()} `,
      }),
    ]);
    assert.equal(first.email, firstEmail);
    assert.equal(second.email, secondEmail);

    const historical = await Promise.all([
      postQuote(baseUrl, {
        customerName: firstName,
        customerEmail: `  ${firstEmail.toUpperCase()} `,
        projectName: `${marker} historical first`,
        proposalDescription: "Concurrent customer edit snapshot first",
        module: "SERVICE_CALL",
        jobInputs: serviceCallInputs,
      }),
      postQuote(baseUrl, {
        customerName: secondName,
        customerEmail: `  ${secondEmail.toUpperCase()} `,
        projectName: `${marker} historical second`,
        proposalDescription: "Concurrent customer edit snapshot second",
        module: "SERVICE_CALL",
        jobInputs: serviceCallInputs,
      }),
    ]);
    const historicalBefore = (
      await db
        .select({
          id: quotesTable.id,
          customerId: quotesTable.customerId,
          customerName: quotesTable.customerName,
          customerEmail: quotesTable.customerEmail,
        })
        .from(quotesTable)
        .where(inArray(quotesTable.id, historical.map((quote) => quote.id)))
    ).sort((left, right) => left.id - right.id);
    assert.deepEqual(
      historicalBefore.map(({ customerId, customerName, customerEmail }) => ({
        customerId,
        customerName,
        customerEmail,
      })).sort((left, right) => (left.customerId ?? 0) - (right.customerId ?? 0)),
      [
        {
          customerId: first.id,
          customerName: firstName,
          customerEmail: `  ${firstEmail.toUpperCase()} `,
        },
        {
          customerId: second.id,
          customerName: secondName,
          customerEmail: `  ${secondEmail.toUpperCase()} `,
        },
      ].sort((left, right) => left.customerId - right.customerId),
    );

    const customersBefore = (
      await db
        .select({
          id: customersTable.id,
          name: customersTable.name,
          email: customersTable.email,
        })
        .from(customersTable)
        .where(inArray(customersTable.id, [first.id, second.id]))
    ).sort((left, right) => left.id - right.id);

    const updates = await Promise.all([
      patchCustomer(baseUrl, first.id, {
        name: `${marker} first claimed`,
        email: `  ${claimedEmail.toUpperCase()} `,
      }),
      patchCustomer(baseUrl, second.id, {
        name: `${marker} second claimed`,
        email: `  ${claimedEmail.toUpperCase()} `,
      }),
    ]);
    const successfulUpdates = updates.filter(
      (update) => update.response.status === 200,
    );
    const conflicts = updates.filter((update) => update.response.status === 409);
    assert.equal(successfulUpdates.length, 1);
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0]?.body, {
      error: "A customer with this email already exists.",
    });
    assert.equal(successfulUpdates[0]?.body.email, claimedEmail);
    assert.equal(
      successfulUpdates[0]?.body.name,
      successfulUpdates[0]?.body.id === first.id
        ? `${marker} first claimed`
        : `${marker} second claimed`,
    );

    const customersAfter = (
      await db
        .select({
          id: customersTable.id,
          name: customersTable.name,
          email: customersTable.email,
        })
        .from(customersTable)
        .where(inArray(customersTable.id, [first.id, second.id]))
    ).sort((left, right) => left.id - right.id);
    const winningCustomerId = successfulUpdates[0]?.body.id;
    assert.equal(
      customersAfter.filter((customer) => customer.email === claimedEmail)
        .length,
      1,
    );
    assert.equal(
      customersAfter.find((customer) => customer.email === claimedEmail)?.id,
      winningCustomerId,
    );
    const losingCustomer = customersAfter.find(
      (customer) => customer.id !== winningCustomerId,
    );
    assert.ok(losingCustomer);
    assert.deepEqual(
      losingCustomer,
      customersBefore.find((customer) => customer.id === losingCustomer?.id),
    );

    const historicalAfter = (
      await db
        .select({
          id: quotesTable.id,
          customerId: quotesTable.customerId,
          customerName: quotesTable.customerName,
          customerEmail: quotesTable.customerEmail,
        })
        .from(quotesTable)
        .where(inArray(quotesTable.id, historical.map((quote) => quote.id)))
    ).sort((left, right) => left.id - right.id);
    assert.deepEqual(historicalAfter, historicalBefore);
  } finally {
    await closeTestServer(server);
  }
});

test("new builder preview and create contracts accept identical snapshots and reject invalid labor", () => {
  for (const [module, jobInputs] of [
    ["SERVICE_CALL", serviceCallInputs],
    ["TIME_MATERIALS", timeMaterialsInputs],
    ["CUSTOM", customInputs],
    ["NEW_HOUSE", newHouseInputs],
  ] as const) {
    const preview = PreviewQuoteBody.safeParse({ module, jobInputs });
    const create = CreateQuoteBody.safeParse({
      customerName: "Parity customer",
      projectName: "Service estimate",
      proposalDescription: "Customer-facing scope",
      module,
      jobInputs,
    });
    assert.equal(preview.success, true);
    assert.equal(create.success, true);
    if (preview.success && create.success) {
      assert.deepEqual(create.data.jobInputs, preview.data.jobInputs);
    }
  }

  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "TIME_MATERIALS",
      jobInputs: { ...timeMaterialsInputs, crewHours: -1 },
    }).success,
    false,
  );
});

test("New House settings require an integer crew size and hydrate valid fresh quote inputs", () => {
  assert.equal(
    UpdateSettingsBody.safeParse({ newHouseCrewSize: 1.5 }).success,
    false,
  );
  const updatedSettings = UpdateSettingsBody.safeParse({
    newHouseCrewSize: 3,
    newHouseHoursPerPerson: 72,
    newHouseLaborAdjustmentHours: 4,
  });
  assert.equal(updatedSettings.success, true);
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "NEW_HOUSE",
      jobInputs: {
        ...newHouseInputs,
        crewSize: 3,
        crewHours: 72,
        laborAdjustmentHours: 4,
      },
    }).success,
    true,
  );
});

test("customer matching is email-first and never merges different emails that share a name", () => {
  const customers = [
    {
      id: 1,
      companyId: 1,
      name: "Alex Smith",
      email: "alex.one@example.com",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: 2,
      companyId: 1,
      name: "Alex Smith",
      email: "alex.two@example.com",
      createdAt: new Date("2026-01-02T00:00:00Z"),
    },
  ];

  assert.equal(
    matchCustomerForQuote(customers, {
      name: "Alex Smith",
      email: "ALEX.TWO@example.com",
    })?.customer.id,
    2,
  );
  assert.equal(
    matchCustomerForQuote(customers, {
      name: "Alex Smith",
      email: "alex.three@example.com",
    }),
    null,
  );
  assert.equal(
    matchCustomerForQuote(customers, { name: "Alex Smith", email: null }),
    null,
  );
});

test("customer matching safely adds an email to one unambiguous email-less record", () => {
  const customers = [
    {
      id: 3,
      companyId: 1,
      name: "Jordan Lee",
      email: null,
      createdAt: new Date("2026-01-03T00:00:00Z"),
    },
  ];
  const match = matchCustomerForQuote(customers, {
    name: "  jordan   lee ",
    email: "Jordan@example.com",
  });
  assert.equal(match?.customer.id, 3);
  assert.equal(match?.shouldSetEmail, true);
});

test("zero-cost active T&M material lines produce a structured audit warning", () => {
  const result = calculateTimeMaterialsEstimate(
    {
      ...timeMaterialsInputs,
      miscellaneousMaterials: [
        { id: "unknown", description: "Unconfirmed specialty part", cost: 0 },
      ],
    },
    settings,
    [],
  );
  assert.equal(result.assembly[0]?.unitCost, 0);
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "TIME_MATERIALS_REVIEW" &&
        warning.message.includes("zero cost"),
    ),
    true,
  );
});

test("default breaker rows remain unresolved in every previously permissive builder", () => {
  const default50AGfci = catalogRow("Unverified Siemens 50A GFCI breaker", 99, {
    manufacturer: "Siemens",
    amperage: 50,
    poleCount: 2,
    protectionType: "GFCI",
    isDefault: true,
  });
  const default15AStandard = catalogRow(
    "Unverified Siemens 15A standard breaker",
    9,
    {
      manufacturer: "Siemens",
      amperage: 15,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: true,
    },
  );
  const estimates = [
    {
      name: "EV Charger",
      lineId: "breaker",
      result: calculateEvChargerEstimate(evInputs, settings, [default50AGfci]),
    },
    {
      name: "Bathroom",
      lineId: "bathroom-15a-circuit-protection",
      result: calculateBathroomEstimate(
        {
          ...bathroomInputs,
          circuitOption: "Install new 15A circuit",
          newCircuitBreakerProtectionType: "Standard",
        },
        settings,
        [default15AStandard],
      ),
    },
    {
      name: "Kitchen",
      lineId: "kitchen-breakers-15a",
      result: calculateKitchenEstimate(
        {
          ...kitchenInputs,
          breaker15AQuantity: 1,
          breaker15AProtectionType: "Standard",
        },
        settings,
        [default15AStandard],
      ),
    },
    {
      name: "Recessed Lighting",
      lineId: "recessed-circuit-protection",
      result: calculateRecessedLightingEstimate(
        {
          ...recessedInputs,
          circuitOption: "Install new circuit",
        },
        settings,
        [default15AStandard],
      ),
    },
  ];

  for (const { name, lineId, result } of estimates) {
    assert.equal(
      result.assembly.find((line) => line.id === lineId)?.unitCost,
      0,
      name,
    );
    assert.equal(
      result.pricing.pricingWarnings.some(
        (warning) =>
          typeof warning !== "string" &&
          warning.code === "EXACT_BREAKER_UNRESOLVED",
      ),
      true,
      name,
    );
  }
});

test("Custom and T&M zero-cost contractor materials block readiness without an audited exclusion", () => {
  const cases = [
    {
      name: "Time & Materials",
      jobInputs: {
        ...timeMaterialsInputs,
        miscellaneousMaterials: [
          { id: "tm-zero", description: "Special-order fitting", cost: 0 },
        ],
      },
      calculate: (jobInputs: TimeMaterialsInputRecord) =>
        calculateTimeMaterialsEstimate(jobInputs, settings, []),
    },
    {
      name: "Custom",
      jobInputs: {
        ...customInputs,
        materials: [
          {
            id: "custom-zero",
            description: "Owner-selected fixture",
            quantity: 1,
            unit: "ea",
            unitCost: 0,
          },
        ],
        miscellaneousMaterials: [],
      },
      calculate: (jobInputs: CustomInputRecord) =>
        calculateCustomEstimate(jobInputs, settings, []),
    },
  ] as const;

  for (const testCase of cases) {
    const estimate = testCase.calculate(testCase.jobInputs as never);
    const readiness = evaluateCustomerReadyPricing({
      pricing: estimate.pricing,
      assembly: estimate.assembly,
      jobInputs: testCase.jobInputs,
    });
    assert.equal(readiness.allowed, false, testCase.name);
  }
});

test("an explicit material exclusion reason is stored and permits readiness", () => {
  const reason = "Customer is purchasing this material directly.";
  const jobInputs: TimeMaterialsInputRecord = {
    ...timeMaterialsInputs,
    miscellaneousMaterials: [
      {
        id: "excluded",
        description: "Customer-purchased light fixture",
        cost: 0,
        intentionalExclusion: { confirmed: true, reason },
      },
    ],
  };
  const estimate = calculateTimeMaterialsEstimate(jobInputs, settings, []);
  assert.equal(
    estimate.assembly[0]?.intentionalExclusionReason,
    reason,
  );
  assert.equal(
    evaluateCustomerReadyPricing({
      pricing: estimate.pricing,
      assembly: estimate.assembly,
      jobInputs,
    }).allowed,
    true,
  );
});

test("negative labor adjustments block customer-ready status", () => {
  const jobInputs = {
    ...recessedInputs,
    laborAdjustmentHours: -20,
  };
  assert.deepEqual(negativeLaborAdjustmentFields(jobInputs), [
    "laborAdjustmentHours",
  ]);
  const readiness = evaluateCustomerReadyPricing({
    pricing: {
      materialCost: 100,
      laborCost: 130,
      materialMarkup: 0.25,
      calculatedSellingPrice: 425,
      finalSellingPrice: 425,
      laborOverride: null,
      sellingPriceOverride: null,
      grossProfit: 195,
      grossMargin: 0.4588,
      pricingWarnings: [],
    },
    assembly: [],
    jobInputs,
  });
  assert.equal(readiness.allowed, false);
  assert.match(
    readiness.allowed ? "" : readiness.error,
    /Negative labor adjustments/,
  );
});

test("below-cost quotes require and record a deliberate-loss confirmation", () => {
  const pricing = withProfit(
    {
      materialCost: 100,
      laborCost: 130,
      materialMarkup: 0.25,
      calculatedSellingPrice: 425,
      finalSellingPrice: 425,
      laborOverride: null,
      sellingPriceOverride: null,
      grossProfit: 195,
      grossMargin: 0.4588,
      pricingWarnings: [],
    },
    { sellingPriceOverride: 200 },
  );
  const withoutApproval = evaluateCustomerReadyPricing({
    pricing,
    assembly: [],
    jobInputs: timeMaterialsInputs,
  });
  assert.equal(withoutApproval.allowed, false);
  assert.match(
    withoutApproval.allowed ? "" : withoutApproval.error,
    /below calculated cost/,
  );

  const confirmedAt = new Date("2026-08-28T15:00:00.000Z");
  const approved = evaluateCustomerReadyPricing({
    pricing,
    assembly: [],
    jobInputs: timeMaterialsInputs,
    deliberateLossConfirmation: {
      confirmed: true,
      reason: "Strategic warranty recovery for this customer.",
    },
    now: confirmedAt,
  });
  assert.equal(approved.allowed, true);
  if (!approved.allowed) return;
  assert.deepEqual(approved.deliberateLossApproval, {
    reason: "Strategic warranty recovery for this customer.",
    confirmedAt: confirmedAt.toISOString(),
    costAtConfirmation: 230,
    sellingPriceAtConfirmation: 200,
  });

  const staleApproval = evaluateCustomerReadyPricing({
    pricing: {
      ...pricing,
      finalSellingPrice: 200.004,
      sellingPriceOverride: 200.004,
      deliberateLossApproval: approved.deliberateLossApproval,
    },
    assembly: [],
    jobInputs: timeMaterialsInputs,
  });
  assert.equal(staleApproval.allowed, false);
});

test("quotes with unresolved catalog prices cannot enter a ready state", () => {
  const unresolved = calculateServiceCallEstimate(serviceCallInputs, settings, []);
  assert.equal(
    hasBlockingPricingWarnings(unresolved.pricing.pricingWarnings),
    true,
  );
  const resolved = calculateTimeMaterialsEstimate(
    timeMaterialsInputs,
    settings,
    [],
  );
  assert.equal(hasBlockingPricingWarnings(resolved.pricing.pricingWarnings), false);
});

test("legacy unresolved warning strings still block ready-state promotion", () => {
  for (const warning of [
    'Exact catalog selection "Selected row" for servicePanel is unavailable or unpriced. No generic catalog row was substituted.',
    "Unresolved breaker: no exact Siemens 20A 1-pole GFCI breaker is available in the company price book.",
    'Customer-supplied material "Selected fixture" has no contractor price. Confirm the customer-provided item is available and intentionally excluded before sending the quote.',
    'Active material selection "Selected material" has zero cost and is unresolved. Add a sourced price-book value or confirm the material before sending the quote.',
  ]) {
    assert.equal(hasBlockingPricingWarnings([warning]), true, warning);
  }
});

test("customer proposal descriptions strip exact catalog identity", () => {
  assert.equal(
    customerMaterialDescription(
      "Pass & Seymour 2097-TRWRW 20A TR self-test GFCI replacement",
    ),
    "GFCI receptacle",
  );
  assert.equal(
    customerMaterialDescription(
      "Siemens Q120DF 20A 1-pole dual-function breaker — SKU 123",
    ),
    "20A 1-pole dual-function breaker",
  );
  assert.equal(
    customerMaterialDescription(
      "Acme ZX-9912 supplier SKU 884219 https://supplier.example/product",
    ),
    "Electrical material",
  );
  assert.equal(
    customerMaterialDescription("Acme Electrical conduit"),
    "Electrical material",
  );
  assert.equal(
    customerMaterialDescription("Future Supplier unencoded name", {
      category: "Materials",
      source: "Price book catalog",
    }),
    "Electrical material",
  );
  assert.equal(
    customerMaterialDescription("Owner-selected decorative fixture", {
      category: "Materials",
      source: "Custom item",
    }),
    "Owner-selected decorative fixture",
  );
});

test("module default percentage boundary accepts points and legacy fractions", () => {
  assert.equal(normalizePercentageSetting(25), 0.25);
  assert.equal(normalizePercentageSetting(40), 0.4);
  assert.equal(normalizePercentageSetting(0.25), 0.25);
});

test("customer proposal tokens are high entropy, tamper evident, and rotate with quote changes", () => {
  const firstUpdate = new Date("2026-08-27T20:00:00.000Z");
  const secondUpdate = new Date("2026-08-27T20:00:01.000Z");
  const first = createProposalShareToken(42, firstUpdate);
  const second = createProposalShareToken(42, secondUpdate);
  assert.ok(first.length >= 50);
  assert.notEqual(first, second);
  assert.deepEqual(parseProposalShareToken(first), {
    quoteId: 42,
    timestamp: firstUpdate.getTime(),
  });
  assert.equal(
    parseProposalShareToken(`${first.slice(0, -1)}x`),
    null,
  );
});

test("quote revisions retain source customer identity and reject reassignment", async () => {
  const marker = `Revision customer ${randomUUID()}`;
  const email = `${randomUUID()}@example.com`;
  const { server, baseUrl } = await startTestServer();

  try {
    const source = await postQuote(baseUrl, {
      customerName: `${marker} original`,
      customerEmail: email,
      projectName: `${marker} source`,
      proposalDescription: "Immutable source proposal",
      module: "SERVICE_CALL",
      jobInputs: serviceCallInputs,
    });
    assert.equal(typeof source.customerId, "number");

    const renamedEmail = `renamed-${email}`;
    const renamed = await patchCustomer(baseUrl, source.customerId!, {
      name: `${marker} renamed`,
      email: renamedEmail,
    });
    assert.equal(renamed.response.status, 200);

    const revision = await postQuote(baseUrl, {
      sourceQuoteId: source.id,
      // Deliberately retain stale snapshot identity and omit customerId. The
      // source relationship, not mutable profile text, must select customer.
      customerName: source.customerName,
      customerEmail: source.customerEmail,
      projectName: `${marker} revision`,
      proposalDescription: "Editable recalculated revision",
      module: "SERVICE_CALL",
      jobInputs: { ...serviceCallInputs, crewHours: 3 },
    });
    assert.equal(revision.customerId, source.customerId);

    const other = await postCustomer(baseUrl, {
      name: `${marker} other`,
      email: `other-${email}`,
    });
    const mismatchResponse = await fetch(`${baseUrl}/api/quotes`, {
      method: "POST",
      headers: authenticatedHeaders(baseUrl),
      body: JSON.stringify({
        customerId: other.id,
        sourceQuoteId: source.id,
        customerName: other.name,
        customerEmail: other.email,
        projectName: `${marker} invalid reassignment`,
        proposalDescription: "Must be rejected",
        module: "SERVICE_CALL",
        jobInputs: serviceCallInputs,
      }),
    });
    assert.equal(mismatchResponse.status, 400);
    assert.match(
      ((await mismatchResponse.json()) as { error: string }).error,
      /retain the source quote customer/i,
    );
  } finally {
    await closeTestServer(server);
  }
});

test("New House room counts persist through create, reload, duplicate, and legacy snapshot reads", async () => {
  const marker = `New House room counts ${randomUUID()}`;
  const { server, baseUrl } = await startTestServer();

  try {
    const source = await postQuote(baseUrl, {
      customerName: marker,
      customerEmail: `${randomUUID()}@example.com`,
      projectName: `${marker} source`,
      proposalDescription: "Persist the informational room program.",
      module: "NEW_HOUSE",
      jobInputs: newHouseInputs,
    });
    const created = await getQuote(baseUrl, source.id);
    assert.equal(created.jobInputs.bedroomCount, 4);
    assert.equal(created.jobInputs.bathroomQuantity, 2);

    const sourcePricing = created.pricing;
    const duplicateResponse = await fetch(
      `${baseUrl}/api/quotes/${source.id}/duplicate`,
      {
        method: "POST",
        headers: authenticatedHeaders(baseUrl),
      },
    );
    assert.equal(duplicateResponse.status, 201);
    const duplicateBody = (await duplicateResponse.json()) as { id: number };
    const duplicate = await getQuote(baseUrl, duplicateBody.id);
    assert.equal(duplicate.jobInputs.bedroomCount, 4);
    assert.equal(duplicate.jobInputs.bathroomQuantity, 2);
    assert.deepEqual(duplicate.pricing, sourcePricing);

    const [sourceRow] = await db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.id, source.id));
    assert.ok(sourceRow);
    const { bedroomCount: _legacyBedroomCount, ...legacyInputs } =
      sourceRow.jobInputs as NewHouseInputRecord;
    await db
      .update(quotesTable)
      .set({
        jobInputs: legacyInputs as unknown as typeof sourceRow.jobInputs,
      })
      .where(eq(quotesTable.id, source.id));

    const legacy = await getQuote(baseUrl, source.id);
    assert.equal(legacy.jobInputs.bathroomQuantity, 2);
    assert.equal("bedroomCount" in legacy.jobInputs, false);
  } finally {
    await closeTestServer(server);
  }
});