import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test, { after } from "node:test";
import type {
  BathroomInputRecord,
  CustomInputRecord,
  EvChargerInputRecord,
  KitchenInputRecord,
  PricingWarningRecord,
  RecessedLightingInputRecord,
  ServiceCallInputRecord,
  TimeMaterialsInputRecord,
} from "@workspace/db";
import {
  customersTable,
  companyMembersTable,
  db,
  quotesTable,
} from "@workspace/db";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { CreateQuoteBody, PreviewQuoteBody } from "@workspace/api-zod";
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
  hasBlockingPricingWarnings,
  MAX_OVERRIDE_VALUE,
  matchCustomerForQuote,
  pricingForQuoteUpdate,
  parseProposalShareToken,
  validateOverrideValues,
  withProfit,
} from "../routes/estimating";
import {
  ensureEstimatorSeed,
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
  customerName: string;
  customerEmail?: string | null;
  projectName: string;
  proposalDescription: string;
  module: "SERVICE_CALL";
  jobInputs: ServiceCallInputRecord;
};

type CreatedQuote = {
  id: number;
  customerName: string;
  customerEmail: string | null;
};

type CustomerSummary = {
  id: number;
  name: string;
  email: string | null;
};

const authenticatedHeaders = {
  "content-type": "application/json",
  "x-test-clerk-user-id": "user_estimator_integration_tests",
};

after(async () => {
  await db
    .delete(companyMembersTable)
    .where(
      eq(
        companyMembersTable.userId,
        "user_estimator_integration_tests",
      ),
    );
});

async function startTestServer() {
  await ensureEstimatorSeed();
  await db
    .insert(companyMembersTable)
    .values({
      userId: "user_estimator_integration_tests",
      companyId: 1,
      role: "member",
    })
    .onConflictDoUpdate({
      target: companyMembersTable.userId,
      set: { companyId: 1, role: "member" },
    });
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, () => resolve(candidate));
    candidate.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Test server did not expose a TCP address");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function closeTestServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function postQuote(baseUrl: string, input: QuoteRequest) {
  const response = await fetch(`${baseUrl}/api/quotes`, {
    method: "POST",
    headers: authenticatedHeaders,
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

async function postCustomer(
  baseUrl: string,
  input: { name: string; email?: string | null },
) {
  const response = await fetch(`${baseUrl}/api/customers`, {
    method: "POST",
    headers: authenticatedHeaders,
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as CustomerSummary & { error?: string };
  assert.equal(
    response.status,
    201,
    `Expected customer creation to succeed: ${JSON.stringify(body)}`,
  );
  assert.equal(typeof body.id, "number");
  return body;
}

async function patchCustomer(
  baseUrl: string,
  id: number,
  input: { name?: string; email?: string | null },
) {
  const response = await fetch(`${baseUrl}/api/customers/${id}`, {
    method: "PATCH",
    headers: authenticatedHeaders,
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Partial<CustomerSummary> & {
    error?: string;
  };
  return { response, body };
}

async function cleanupCustomerTest(marker: string, email: string) {
  const customers = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.companyId, 1),
        or(
          like(customersTable.name, `${marker}%`),
          eq(customersTable.email, email),
        ),
      ),
    );
  const customerIds = customers.map((customer) => customer.id);
  if (customerIds.length === 0) return;

  await db
    .delete(quotesTable)
    .where(inArray(quotesTable.customerId, customerIds));
  await db
    .delete(customersTable)
    .where(inArray(customersTable.id, customerIds));
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
      .where(inArray(quotesTable.id, created.map((quote) => quote.id)));
    assert.equal(quotes.length, 2);
    assert.equal(quotes[0]?.customerId, quotes[1]?.customerId);

    const customers = await db
      .select()
      .from(customersTable)
      .where(
        and(
          eq(customersTable.companyId, 1),
          eq(customersTable.email, email),
        ),
      );
    assert.equal(customers.length, 1);
    assert.equal(quotes[0]?.customerId, customers[0]?.id);
  } finally {
    await closeTestServer(server);
    await cleanupCustomerTest(marker, email);
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
        and(
          eq(customersTable.companyId, 1),
          or(
            eq(customersTable.name, firstName),
            eq(customersTable.name, secondName),
          ),
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
      .where(inArray(quotesTable.id, claimed.map((quote) => quote.id)));
    assert.equal(claimedQuotes.length, 2);
    assert.equal(claimedQuotes[0]?.customerId, claimedQuotes[1]?.customerId);

    const customersAfter = await db
      .select()
      .from(customersTable)
      .where(
        and(
          eq(customersTable.companyId, 1),
          or(
            eq(customersTable.name, firstName),
            eq(customersTable.name, secondName),
            eq(customersTable.email, email),
          ),
        ),
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
    await cleanupCustomerTest(marker, email);
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
    await cleanupCustomerTest(marker, originalEmail);
  }
});

test("new builder preview and create contracts accept identical snapshots and reject invalid labor", () => {
  for (const [module, jobInputs] of [
    ["SERVICE_CALL", serviceCallInputs],
    ["TIME_MATERIALS", timeMaterialsInputs],
    ["CUSTOM", customInputs],
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