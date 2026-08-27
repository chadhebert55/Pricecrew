import assert from "node:assert/strict";
import test from "node:test";
import { CreateQuoteBody, PreviewQuoteBody } from "@workspace/api-zod";
import {
  calculateKitchenEstimate,
  calculatePanelReplacementEstimate,
  calculateRecessedLightingEstimate,
  calculateServiceUpgradeEstimate,
  type EstimatingSettings,
  type PriceBookItem,
} from "./estimating-engine";
import type {
  KitchenInputRecord,
  PanelReplacementInputRecord,
  RecessedLightingInputRecord,
  ServiceUpgradeInputRecord,
} from "@workspace/db";

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
  supplier: "Verified supplier",
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

const priceBook: PriceBookItem[] = [
  catalogRow("Juno 4-inch regressed wafer light", 29, {
    manufacturer: "Juno",
  }),
  catalogRow("14/2 NM-B cable", 0.37),
  catalogRow("14/3 NM-B cable", 0.53),
  catalogRow("12/2 NM-B cable", 0.56),
  catalogRow("Legrand radiant TM870WCC10 15A single-pole switch", 4.5, {
    manufacturer: "Legrand",
  }),
  catalogRow("Legrand radiant TM873WCC10 15A 3-way switch", 7.5, {
    manufacturer: "Legrand",
  }),
  catalogRow(
    "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote combo-pack",
    85,
    { manufacturer: "Lutron" },
  ),
  catalogRow("Siemens Q115 15A 1-pole standard breaker", 9.5, {
    manufacturer: "Siemens",
    amperage: 15,
    poleCount: 1,
    protectionType: "Standard",
  }),
  catalogRow("Siemens Q115AFC 15A 1-pole AFCI breaker", 44, {
    manufacturer: "Siemens",
    manufacturerPartNumber: "Q115AFC",
    supplierSku: "SIEMENS-15-AFCI",
    amperage: 15,
    poleCount: 1,
    protectionType: "AFCI",
  }),
  catalogRow("Siemens QF115A 15A 1-pole GFCI breaker", 52, {
    manufacturer: "Siemens",
    manufacturerPartNumber: "QF115A",
    supplierSku: "SIEMENS-15-GFCI",
    amperage: 15,
    poleCount: 1,
    protectionType: "GFCI",
  }),
  catalogRow("Siemens Q115DF 15A 1-pole dual-function breaker", 64, {
    manufacturer: "Siemens",
    manufacturerPartNumber: "Q115DF",
    supplierSku: "SIEMENS-15-DUAL",
    amperage: 15,
    poleCount: 1,
    protectionType: "Dual Function",
  }),
  catalogRow("Siemens Q120 20A 1-pole standard breaker", 10.5, {
    manufacturer: "Siemens",
    amperage: 20,
    poleCount: 1,
    protectionType: "Standard",
  }),
  catalogRow("Siemens Q120AFC 20A 1-pole AFCI breaker", 58, {
    manufacturer: "Siemens",
    manufacturerPartNumber: "Q120AFC",
    supplierSku: "SIEMENS-20-AFCI",
    amperage: 20,
    poleCount: 1,
    protectionType: "AFCI",
  }),
  catalogRow("Siemens QF120A 20A 1-pole GFCI breaker", 71, {
    manufacturer: "Siemens",
    manufacturerPartNumber: "QF120A",
    supplierSku: "SIEMENS-20-GFCI",
    amperage: 20,
    poleCount: 1,
    protectionType: "GFCI",
  }),
  catalogRow("Siemens Q120DF 20A 1-pole dual-function breaker", 69, {
    manufacturer: "Siemens",
    manufacturerPartNumber: "Q120DF",
    supplierSku: "SIEMENS-20-DUAL",
    amperage: 20,
    poleCount: 1,
    protectionType: "Dual Function",
  }),
  catalogRow("Pass & Seymour 3232-TRW 15A TR duplex receptacle", 1.25, {
    manufacturer: "Pass & Seymour",
    manufacturerPartNumber: "3232-TRW",
    supplierSku: "243085",
    amperage: 15,
  }),
  catalogRow("Legrand radiant TM874WCC10 15A 4-way switch", 12, {
    manufacturer: "Legrand",
  }),
  catalogRow(
    "Carlon B114R-UPC 14 cu. in. single-gang old-work box",
    3.25,
  ),
  catalogRow(
    "Legrand radiant RWP26WCC10 1-gang screwless wall plate",
    4.6,
  ),
  catalogRow("Kitchen small-appliance circuit device assumption", 6),
  catalogRow("Kitchen microwave circuit device assumption", 8),
];

const serviceUpgradeInputs: ServiceUpgradeInputRecord = {
  serviceSize: "200A",
  serviceConfiguration: "Overhead mast",
  serviceDisconnect: "Meter-main combination",
  panelManufacturer: "Siemens",
  breakerAmperage: 200,
  breakerPoleCount: 2,
  breakerProtectionType: "Standard",
  meterDisconnectEquipment: "200A meter-main with built-in outdoor disconnect",
  surgeProtection: "Whole-home surge protection",
  includeOverheadMast: true,
  mastFootage: 10,
  weatherheadQuantity: 1,
  hubQuantity: 1,
  lbQuantity: 1,
  ninetyQuantity: 1,
  couplingQuantity: 2,
  mastRelatedPartsQuantity: 1,
  mastConductor: "4/0 aluminum XHHW conductor",
  mastConductorQuantity: 3,
  mastConductorFootage: 10,
  serviceToPanelConductor: "4/0 aluminum SER",
  serviceToPanelFootage: 15,
  groundBarQuantity: 2,
  groundRodQuantity: 2,
  acornClampQuantity: 2,
  intersystemBondingQuantity: 1,
  groundingConductorFootage: 30,
  bondingConductorFootage: 20,
  pvcThreeQuarterFootage: 10,
  pvcThreeQuarterFittingsQuantity: 4,
  waterMeterBondingQuantity: 2,
  waterMeterBondingFootage: 20,
  fourSquareBoxQuantity: 1,
  receptacle20AQuantity: 1,
  receptaclePlateQuantity: 1,
  plywoodQuantity: 1,
  studsQuantity: 2,
  ductSealQuantity: 1,
  pvcPrimerQuantity: 1,
  pvcGlueQuantity: 1,
  antiOxidantQuantity: 1,
  electricalTapeQuantity: 2,
  permitAllowance: 150,
  inspectionAllowance: 75,
  utilityCoordinationAllowance: 0,
  miscellaneousAllowance: 100,
  crewSize: 2,
  crewHours: 16,
  relocationLaborHours: 0,
  accessDifficultyLaborHours: 0,
  groundingReworkLaborHours: 0,
  feederDistanceLaborHours: 0,
  serviceConditionLaborHours: 0,
  utilityCoordinationLaborHours: 0,
  generalLaborAdjustmentHours: 0,
  existingBreakers: [],
  existingOtherBreakerQuantity: 0,
  laborRateType: "residential",
  notes: "",
};

const servicePriceBook: PriceBookItem[] = [
  catalogRow("100A outdoor meter/disconnect", 260),
  catalogRow("150A outdoor meter/disconnect", 340),
  catalogRow("200A outdoor meter/disconnect", 425),
  catalogRow("100A meter-main with built-in outdoor disconnect", 360),
  catalogRow("150A meter-main with built-in outdoor disconnect", 440),
  catalogRow("200A meter-main with built-in outdoor disconnect", 525),
  catalogRow("Outdoor service disconnect", 280),
  catalogRow("Siemens 100A service panel", 220, { manufacturer: "Siemens" }),
  catalogRow("Siemens 150A service panel", 285, { manufacturer: "Siemens" }),
  catalogRow("Siemens 200A service panel", 350, { manufacturer: "Siemens" }),
  catalogRow("Siemens 100A 2-pole standard breaker", 95, {
    manufacturer: "Siemens",
    amperage: 100,
    poleCount: 2,
    protectionType: "Standard",
  }),
  catalogRow("Siemens 150A 2-pole standard breaker", 135, {
    manufacturer: "Siemens",
    amperage: 150,
    poleCount: 2,
    protectionType: "Standard",
  }),
  catalogRow("Siemens 200A 2-pole standard breaker", 180, {
    manufacturer: "Siemens",
    amperage: 200,
    poleCount: 2,
    protectionType: "Standard",
  }),
  catalogRow("Whole-home surge protection", 143),
  catalogRow("Legacy custom surge device", 211, {
    manufacturer: "Legacy Manufacturer",
    manufacturerPartNumber: "LEGACY-SPD-1",
    supplierSku: "LEGACY-211",
  }),
  catalogRow("2-inch PVC mast raceway", 4.25),
  catalogRow("2-inch PVC weatherhead", 48),
  catalogRow("2-inch PVC hub", 18),
  catalogRow("2-inch PVC LB", 42),
  catalogRow("2-inch PVC 90", 30),
  catalogRow("2-inch PVC coupling", 8),
  catalogRow("2-inch PVC mast related parts", 25),
  catalogRow("1/0 aluminum XHHW conductor", 1.65),
  catalogRow("3/0 aluminum XHHW conductor", 2.05),
  catalogRow("4/0 aluminum XHHW conductor", 2.4),
  catalogRow("1/0 aluminum SER cable", 5.25),
  catalogRow("3/0 aluminum SER cable", 7.1),
  catalogRow("4/0 aluminum SER cable", 8.5),
  catalogRow("1/0 copper service conductor alternative", 9),
  catalogRow("2/0 copper service conductor alternative", 12),
  catalogRow("4/0 copper service conductor alternative", 15),
  catalogRow("ground bar", 18),
  catalogRow("ground rod", 22),
  catalogRow("acorn clamp", 7),
  catalogRow("intersystem bonding terminal", 32),
  catalogRow("#8 solid grounding conductor", 1.2),
  catalogRow("#4 green bonding conductor", 2.8),
  catalogRow("3/4-inch PVC raceway", 1.5),
  catalogRow("3/4-inch PVC fittings", 4),
  catalogRow("water-meter bonding clamp", 12),
  catalogRow("#4 green water-meter bonding conductor", 2.8),
  catalogRow("4-square deep box", 5),
  catalogRow("20A receptacle", 8),
  catalogRow("20A receptacle plate", 3),
  catalogRow("4x4x3/4 plywood", 55),
  catalogRow("2x4x8 stud", 6),
];

const panelReplacementInputs: PanelReplacementInputRecord = {
  replacementType: "Like-for-like panel replacement",
  panelManufacturer: "Siemens",
  panelAmperage: 200,
  panelSpaceCount: 40,
  breakerAmperage: 200,
  breakerPoleCount: 2,
  breakerProtectionType: "Standard",
  feederConductor: "4/0 aluminum XHHW conductor",
  feederLength: 15,
  feederConductorQuantity: 3,
  feederRacewayFootage: 15,
  feederRacewayFittingsQuantity: 4,
  groundBarQuantity: 2,
  groundRodQuantity: 0,
  groundingConductorFootage: 20,
  bondingConductorFootage: 10,
  existingBreakers: [],
  existingOtherBreakerQuantity: 0,
  fillerPlateQuantity: 2,
  knockoutSealQuantity: 4,
  plywoodQuantity: 1,
  studsQuantity: 2,
  antiOxidantQuantity: 1,
  electricalTapeQuantity: 2,
  permitAllowance: 125,
  inspectionAllowance: 0,
  miscellaneousAllowance: 75,
  crewSize: 2,
  crewHours: 10,
  panelRemovalLaborHours: 2,
  feederInstallationLaborHours: 1,
  groundingLaborHours: 1,
  accessDifficultyLaborHours: 0,
  generalLaborAdjustmentHours: 0,
  laborRateType: "residential",
  notes: "",
};

const panelReplacementPriceBook: PriceBookItem[] = [
  ...servicePriceBook,
  catalogRow("Siemens 200A panel replacement enclosure", 480, {
    manufacturer: "Siemens",
  }),
  catalogRow("Siemens panel filler plate", 3.5, {
    manufacturer: "Siemens",
  }),
  catalogRow("panel knockout seal", 1.25),
  catalogRow("panel replacement feeder raceway", 4.25),
  catalogRow("panel replacement feeder raceway fittings", 8),
  catalogRow("anti-oxidation compound", 12),
  catalogRow("electrical tape", 4),
];

test("panel replacement preview and create accept the same immutable input shape", () => {
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "PANEL_REPLACEMENT",
      jobInputs: panelReplacementInputs,
      laborOverride: 1200,
      sellingPriceOverride: 4900,
    }).success,
    true,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "Panel customer",
      projectName: "Panel replacement",
      module: "PANEL_REPLACEMENT",
      jobInputs: panelReplacementInputs,
      proposalDescription: "Replace the selected electrical panel.",
      laborOverride: 1200,
      sellingPriceOverride: 4900,
    }).success,
    true,
  );
});

test("panel replacement resolves exact panel, breaker, and compatible feeder rows", () => {
  const result = calculatePanelReplacementEstimate(
    panelReplacementInputs,
    settings,
    panelReplacementPriceBook,
  );

  assert.equal(
    result.assembly.find((line) => line.id === "panel-replacement-panel")
      ?.unitCost,
    480,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "panel-replacement-breaker")
      ?.unitCost,
    180,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "panel-replacement-feeder")
      ?.quantity,
    45,
  );
  assert.equal(result.pricing.laborCost, 24 * settings.loadedLaborCost);
});

test("panel replacement never prices an incompatible feeder or generic breaker", () => {
  const result = calculatePanelReplacementEstimate(
    {
      ...panelReplacementInputs,
      breakerProtectionType: "GFCI",
      feederConductor: "1/0 aluminum XHHW conductor",
    },
    settings,
    panelReplacementPriceBook,
  );

  assert.equal(
    result.assembly.find((line) => line.id === "panel-replacement-breaker")
      ?.unitCost,
    0,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "panel-replacement-feeder")
      ?.unitCost,
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
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "PANEL_REPLACEMENT_FEEDER_COMPATIBILITY_REVIEW",
    ),
    true,
  );
});

test("panel replacement requires a complete supported panel, OCPD, and conductor tuple", () => {
  const result = calculatePanelReplacementEstimate(
    {
      ...panelReplacementInputs,
      breakerAmperage: 150,
      feederConductor: "3/0 aluminum XHHW conductor",
      feederConductorQuantity: 4,
    },
    settings,
    panelReplacementPriceBook,
  );

  assert.equal(
    result.assembly.find((line) => line.id === "panel-replacement-breaker")
      ?.unitCost,
    0,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "panel-replacement-feeder")
      ?.unitCost,
    0,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "PANEL_REPLACEMENT_FEEDER_COMPATIBILITY_REVIEW",
    ),
    true,
  );
});

test("panel replacement breaker inventory rejects unverified default rows", () => {
  const result = calculatePanelReplacementEstimate(
    {
      ...panelReplacementInputs,
      existingBreakers: [
        {
          amperage: 20,
          poleCount: 1,
          protectionType: "AFCI",
          quantity: 2,
        },
      ],
    },
    settings,
    [
      ...panelReplacementPriceBook,
      catalogRow("Siemens 20A 1-pole AFCI breaker", 52, {
        manufacturer: "Siemens",
        amperage: 20,
        poleCount: 1,
        protectionType: "AFCI",
        isDefault: true,
      }),
    ],
  );

  assert.equal(
    result.assembly.find((line) => line.id === "panel-existing-breaker-0")
      ?.unitCost,
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

test("panel replacement preview and create reject negative task labor", () => {
  const invalidInputs = {
    ...panelReplacementInputs,
    panelRemovalLaborHours: -1,
  };
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "PANEL_REPLACEMENT",
      jobInputs: invalidInputs,
    }).success,
    false,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "Panel customer",
      projectName: "Panel replacement",
      module: "PANEL_REPLACEMENT",
      jobInputs: invalidInputs,
      proposalDescription: "Replace the selected electrical panel.",
    }).success,
    false,
  );
});

test("service upgrade preview and create validation accept the same additive input snapshot", () => {
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "SERVICE_UPGRADE",
      jobInputs: serviceUpgradeInputs,
      laborOverride: 1600,
      sellingPriceOverride: 7900,
    }).success,
    true,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "Service customer",
      projectName: "200A service upgrade",
      module: "SERVICE_UPGRADE",
      jobInputs: serviceUpgradeInputs,
      proposalDescription: "Upgrade the selected electrical service.",
      laborOverride: 1600,
      sellingPriceOverride: 7900,
    }).success,
    true,
  );
});

test("service upgrade preview and create validation reject unknown panel manufacturers", () => {
  const invalidInputs = {
    ...serviceUpgradeInputs,
    panelManufacturer: "Unknown Manufacturer",
  };
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "SERVICE_UPGRADE",
      jobInputs: invalidInputs,
    }).success,
    false,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "Service customer",
      projectName: "Service upgrade",
      module: "SERVICE_UPGRADE",
      jobInputs: invalidInputs,
      proposalDescription: "Upgrade the selected electrical service.",
    }).success,
    false,
  );
});

test("default integrated 200A service upgrade exposes the complete assembly and 32 person-hours", () => {
  const result = calculateServiceUpgradeEstimate(
    serviceUpgradeInputs,
    settings,
    servicePriceBook,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "mast-conductors")?.quantity,
    30,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "mast-raceway")?.quantity,
    10,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "service-to-panel-conductor")
      ?.quantity,
    15,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "service-breaker")?.unitCost,
    180,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "service-meter-disconnect")
      ?.unitCost,
    525,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "PRICE_BOOK_ITEM_UNRESOLVED" &&
        warning.context.itemKey ===
          "200A meter-main with built-in outdoor disconnect",
    ),
    false,
  );
  assert.equal(result.pricing.laborCost, 32 * settings.loadedLaborCost);
  assert.equal(
    result.assembly.some((line) => line.id === "service-disconnect"),
    false,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "service-surge-protection")
      ?.unitCost,
    143,
  );
  assert.equal(
    result.assembly.some((line) => line.id === "panel-directory-labeling"),
    true,
  );
  assert.deepEqual(
    ["duct-seal", "pvc-primer", "pvc-glue", "anti-oxidant", "electrical-tape"].map(
      (id) => result.assembly.find((line) => line.id === id)?.quantity,
    ),
    [1, 1, 1, 1, 2],
  );
  assert.equal(
    result.assembly.some((line) => line.id === "water-meter-bonding"),
    true,
  );
  assert.equal(
    result.assembly.some((line) => line.id === "plywood-backing"),
    true,
  );
});

test("service upgrade preserves an exact custom surge selection and source metadata", () => {
  const result = calculateServiceUpgradeEstimate(
    { ...serviceUpgradeInputs, surgeProtection: "Legacy custom surge device" },
    settings,
    servicePriceBook,
  );
  const surge = result.assembly.find(
    (line) => line.id === "service-surge-protection",
  );
  assert.equal(surge?.description, "Legacy custom surge device");
  assert.equal(surge?.unitCost, 211);
  assert.equal(surge?.source.includes("Legacy Manufacturer"), true);
  assert.equal(surge?.source.includes("MPN LEGACY-SPD-1"), true);
  assert.equal(surge?.source.includes("SKU LEGACY-211"), true);
});

test("legacy generic surge labels fall forward to the verified canonical row", () => {
  const result = calculateServiceUpgradeEstimate(
    { ...serviceUpgradeInputs, surgeProtection: "service upgrade surge protection" },
    settings,
    servicePriceBook,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "service-surge-protection")
      ?.unitCost,
    143,
  );
});

test("100A and 150A service selections resolve size-specific equipment and conductors", () => {
  const configurations = [
    {
      serviceSize: "100A" as const,
      amperage: 100,
      meter: "100A outdoor meter/disconnect",
      mast: "1/0 aluminum XHHW conductor",
      feeder: "1/0 aluminum SER" as const,
      expected: {
        breaker: 95,
        meter: 260,
        panel: 220,
        mast: 1.65,
        feeder: 5.25,
      },
    },
    {
      serviceSize: "150A" as const,
      amperage: 150,
      meter: "150A outdoor meter/disconnect",
      mast: "3/0 aluminum XHHW conductor",
      feeder: "3/0 aluminum SER" as const,
      expected: {
        breaker: 135,
        meter: 340,
        panel: 285,
        mast: 2.05,
        feeder: 7.1,
      },
    },
  ];

  for (const configuration of configurations) {
    const result = calculateServiceUpgradeEstimate(
      {
        ...serviceUpgradeInputs,
        serviceSize: configuration.serviceSize,
        breakerAmperage: configuration.amperage,
        meterDisconnectEquipment: configuration.meter,
        mastConductor: configuration.mast,
        serviceToPanelConductor: configuration.feeder,
      },
      settings,
      servicePriceBook,
    );
    assert.equal(
      result.assembly.find((line) => line.id === "service-breaker")?.unitCost,
      configuration.expected.breaker,
    );
    assert.equal(
      result.assembly.find((line) => line.id === "service-panel")?.unitCost,
      configuration.expected.panel,
    );
    assert.equal(
      result.assembly.find((line) => line.id === "service-meter-disconnect")
        ?.unitCost,
      configuration.expected.meter,
    );
    assert.equal(
      result.assembly.find((line) => line.id === "mast-conductors")?.unitCost,
      configuration.expected.mast,
    );
    assert.equal(
      result.assembly.find((line) => line.id === "service-to-panel-conductor")
        ?.unitCost,
      configuration.expected.feeder,
    );
    assert.equal(
      result.pricing.pricingWarnings.some(
        (warning) =>
          typeof warning !== "string" &&
          warning.code === "PRICE_BOOK_ITEM_UNRESOLVED" &&
          warning.context.itemKey === configuration.meter,
      ),
      false,
    );
  }
});

test("service upgrade warns when breaker amperage conflicts with selected service size", () => {
  const result = calculateServiceUpgradeEstimate(
    { ...serviceUpgradeInputs, serviceSize: "100A", breakerAmperage: 200 },
    settings,
    servicePriceBook,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "SERVICE_UPGRADE_SIZE_COMPATIBILITY_REVIEW",
    ),
    true,
  );
});

test("service upgrade conductor, quantity, footage, and labor choices remain explicit", () => {
  const result = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      serviceConfiguration: "Underground service",
      includeOverheadMast: false,
      serviceToPanelConductor: "4/0 copper alternative",
      serviceToPanelFootage: 27,
      groundRodQuantity: 3,
      crewSize: 3,
      crewHours: 9,
      relocationLaborHours: 0.5,
      accessDifficultyLaborHours: 0.5,
      groundingReworkLaborHours: 0.25,
      feederDistanceLaborHours: 0.25,
      serviceConditionLaborHours: 0.25,
      utilityCoordinationLaborHours: 0.25,
      generalLaborAdjustmentHours: 0,
    },
    settings,
    servicePriceBook,
  );
  assert.equal(
    result.assembly.some((line) => line.id === "mast-weatherhead"),
    false,
  );
  const conductor = result.assembly.find(
    (line) => line.id === "service-to-panel-conductor",
  );
  assert.equal(conductor?.quantity, 27);
  assert.equal(conductor?.unitCost, 15);
  assert.equal(
    result.assembly.find((line) => line.id === "ground-rods")?.quantity,
    3,
  );
  assert.equal(result.pricing.laborCost, 29 * settings.loadedLaborCost);
  assert.equal(
    result.pricing.pricingWarnings.some((warning) =>
      (typeof warning === "string" ? warning : warning.code) ===
      "SERVICE_UPGRADE_COPPER_ALTERNATIVE_REVIEW"),
    true,
  );
});

test("service upgrade XHHW feeder, breaker inventory, and field adders remain explicit", () => {
  const breakerCatalog = catalogRow("Siemens Q120 20A standard breaker", 10.5, {
    manufacturer: "Siemens",
    amperage: 20,
    poleCount: 1,
    protectionType: "Standard",
  });
  const result = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      serviceToPanelConductor: "4/0 aluminum XHHW in raceway",
      serviceToPanelFootage: 20,
      relocationLaborHours: 1,
      accessDifficultyLaborHours: 2,
      generalLaborAdjustmentHours: -1,
      existingBreakers: [
        {
          amperage: 20,
          poleCount: 1,
          protectionType: "Standard",
          quantity: 3,
        },
      ],
      existingOtherBreakerQuantity: 1,
    },
    settings,
    [...servicePriceBook, breakerCatalog],
  );

  assert.equal(
    result.assembly.find((line) => line.id === "service-to-panel-conductor")
      ?.quantity,
    60,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "service-to-panel-raceway")
      ?.quantity,
    20,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "existing-breaker-0")?.quantity,
    3,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "existing-breaker-other")
      ?.unitCost,
    0,
  );
  assert.equal(result.pricing.laborCost, 34 * settings.loadedLaborCost);
});

test("service upgrade labor adders cannot produce negative labor cost", () => {
  const result = calculateServiceUpgradeEstimate(
    { ...serviceUpgradeInputs, generalLaborAdjustmentHours: -10_000 },
    settings,
    servicePriceBook,
  );
  assert.equal(result.pricing.laborCost, 0);
  assert.equal(result.pricing.laborSellAmount, 0);
});

test("service upgrade preserves contractor prices and never substitutes unresolved exact items", () => {
  const editedPriceBook = servicePriceBook.map((row) =>
    row.item === "4/0 aluminum SER cable"
      ? { ...row, unitCost: 11.25 }
      : row,
  );
  const edited = calculateServiceUpgradeEstimate(
    serviceUpgradeInputs,
    settings,
    editedPriceBook,
  );
  assert.equal(
    edited.assembly.find((line) => line.id === "service-to-panel-conductor")
      ?.unitCost,
    11.25,
  );

  const unresolved = calculateServiceUpgradeEstimate(
    serviceUpgradeInputs,
    settings,
    [],
  );
  assert.equal(
    unresolved.assembly.find((line) => line.id === "service-breaker")?.unitCost,
    0,
  );
  assert.equal(
    unresolved.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_BREAKER_UNRESOLVED",
    ),
    true,
  );
  assert.equal(
    unresolved.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "PRICE_BOOK_ITEM_UNRESOLVED",
    ),
    true,
  );
});

test("service upgrade mast assembly obeys the explicit include control", () => {
  const result = calculateServiceUpgradeEstimate(
    { ...serviceUpgradeInputs, includeOverheadMast: false },
    settings,
    servicePriceBook,
  );
  assert.equal(
    result.assembly.some((line) => line.id.startsWith("mast-")),
    false,
  );
});

test("service upgrade breaker resolution rejects unknown protection and unverified default rows", () => {
  const unknownProtection = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      breakerProtectionType: "Standard-like",
    },
    settings,
    servicePriceBook,
  );
  assert.equal(
    unknownProtection.assembly.find((line) => line.id === "service-breaker")
      ?.unitCost,
    0,
  );

  const defaultOnly = calculateServiceUpgradeEstimate(
    serviceUpgradeInputs,
    settings,
    servicePriceBook.map((row) =>
      row.item === "Siemens 200A 2-pole standard breaker"
        ? { ...row, isDefault: true }
        : row,
    ),
  );
  assert.equal(
    defaultOnly.assembly.find((line) => line.id === "service-breaker")
      ?.unitCost,
    0,
  );
  assert.equal(
    defaultOnly.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_BREAKER_UNRESOLVED",
    ),
    true,
  );
});

const baseInputs: RecessedLightingInputRecord = {
  roomLength: 16,
  roomWidth: 12,
  fixtureQuantity: 4,
  fixtureSize: "4-inch",
  wiringOption: "New wiring from source",
  circuitOption: "Reuse existing circuit",
  switchType: "Single-pole",
  dimmerSelection: "No dimmer",
  customerSuppliedFixtures: false,
  ceilingHeight: "Standard 8-10 ft",
  accessDifficulty: "Attic access",
  laborAdjustmentHours: 0,
  wireRunLength: 40,
  wiringAllowanceFeet: 10,
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

test("preview and create validation accept canonical and legacy switching values", () => {
  const methods: NonNullable<RecessedLightingInputRecord["switchingMethod"]>[] = [
    "single-pole",
    "traditional-3-way",
    "smart-3-way",
    "Single-pole",
    "Traditional 3-way",
    "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote",
  ];

  for (const switchingMethod of methods) {
    const jobInputs = { ...baseInputs, switchingMethod };
    assert.equal(
      PreviewQuoteBody.safeParse({
        module: "RECESSED_LIGHTING",
        jobInputs,
      }).success,
      true,
    );
    assert.equal(
      CreateQuoteBody.safeParse({
        customerName: "Compatibility test",
        projectName: "Switching compatibility",
        module: "RECESSED_LIGHTING",
        jobInputs,
        proposalDescription: "Compatibility validation",
      }).success,
      true,
    );
  }
});

test("single-pole uses the selected compatible branch-circuit cable", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "single-pole",
    },
    settings,
    priceBook,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "recessed-wiring")?.unitCost,
    0.37,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "recessed-three-way-traveler",
    ),
    undefined,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "recessed-circuit-protection",
    ),
    undefined,
  );
});

test("traditional 3-way uses entered 14/3 footage plus wiring allowance", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "traditional-3-way",
      switchType: "3-way",
      traditionalThreeWayFootage: 37,
    },
    settings,
    priceBook,
  );
  const cable = result.assembly.find((line) => line.id === "recessed-wiring");
  assert.equal(cable?.description.includes("14/3 NM-B"), true);
  assert.equal(cable?.quantity, 47);
  assert.equal(cable?.unitCost, 0.53);
  assert.equal(
    result.assembly.find(
      (line) => line.id === "recessed-circuit-protection",
    ),
    undefined,
  );
});

test("traditional 3-way prices 14/3 with the actual reused-circuit form defaults", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      circuitOption: "Reuse existing circuit",
      breakerAmperage: 20,
      cableType: "12/2 NM-B",
      switchingMethod: "traditional-3-way",
      switchType: "3-way",
      traditionalThreeWayFootage: 40,
    },
    settings,
    priceBook,
  );
  const cable = result.assembly.find((line) => line.id === "recessed-wiring");
  assert.equal(cable?.description.includes("14/3 NM-B"), true);
  assert.equal(cable?.quantity, 50);
  assert.equal(cable?.unitCost, 0.53);
  assert.equal(
    result.pricing.pricingWarnings.some((warning) =>
      (typeof warning === "string" ? warning : warning.message).includes(
        "Existing circuit capacity",
      ),
    ),
    true,
  );
});

test("smart 3-way uses one combo kit and no separate dimmer", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "smart-3-way",
      traditionalThreeWayFootage: 50,
      dimmerSelection: "Include dimmer",
    },
    settings,
    priceBook,
  );
  const controls = result.assembly.find((line) => line.id === "smart-switch-kit");
  assert.equal(controls?.quantity, 1);
  assert.equal(controls?.unit, "kit");
  assert.equal(controls?.unitCost, 85);
  assert.equal(
    result.assembly.find(
      (line) => line.id === "recessed-three-way-traveler",
    ),
    undefined,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "recessed-dimmer"),
    undefined,
  );
});

test("an explicitly selected new lighting circuit keeps the contractor's breaker choice", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      circuitOption: "New dedicated circuit",
      switchingMethod: "traditional-3-way",
      switchType: "3-way",
      traditionalThreeWayFootage: 25,
      breakerAmperage: 20,
    },
    settings,
    priceBook,
  );
  const breakers = result.assembly.filter(
    (line) => line.id === "recessed-circuit-protection",
  );
  assert.equal(breakers.length, 1);
  assert.equal(breakers[0]?.description.includes("20A"), true);
  assert.equal(
    result.pricing.pricingWarnings.some((warning) =>
      (typeof warning === "string" ? warning : warning.message).includes(
        "No cable cost was substituted",
      ),
    ),
    true,
  );
});

test("contractor-edited traveler and combo-kit costs flow into estimates", () => {
  const editedPriceBook = priceBook.map((row) =>
    row.item === "14/3 NM-B cable"
      ? { ...row, unitCost: 0.71 }
      : row.item ===
          "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote combo-pack"
        ? { ...row, unitCost: 99 }
        : row,
  );
  const traditional = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "traditional-3-way",
      switchType: "3-way",
      traditionalThreeWayFootage: 20,
    },
    settings,
    editedPriceBook,
  );
  const smart = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "smart-3-way",
    },
    settings,
    editedPriceBook,
  );
  assert.equal(
    traditional.assembly.find((line) => line.id === "recessed-wiring")?.unitCost,
    0.71,
  );
  assert.equal(
    smart.assembly.find((line) => line.id === "smart-switch-kit")?.unitCost,
    99,
  );
});

test("smart 3-way remains zero cost with a visible unresolved warning", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "smart-3-way",
      switchType: "3-way",
    },
    settings,
    priceBook.filter(
      (row) =>
        row.item !==
        "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote combo-pack",
    ),
  );
  const kit = result.assembly.find((line) => line.id === "smart-switch-kit");
  assert.equal(kit?.unitCost, 0);
  assert.equal(
    result.pricing.pricingWarnings.some((warning) =>
      (typeof warning === "string" ? warning : warning.message).includes(
        "Lutron Diva Smart Dimmer",
      ),
    ),
    true,
  );
});

const baseKitchenInputs: KitchenInputRecord = {
  refrigeratorCircuits: 0,
  dishwasherCircuits: 0,
  disposalCircuits: 0,
  gasRangeCircuits: 0,
  electricRangeCircuits: 0,
  countertopReceptacles: 0,
  sinkLights: 1,
  islandPendants: 0,
  undercabinetLighting: 0,
  recessedLights: 4,
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

test("kitchen lighting uses one configured 15A breaker and 14/2 cable", () => {
  const result = calculateKitchenEstimate(
    {
      ...baseKitchenInputs,
      includeLightingCircuit: true,
      lightingCircuitAmperage: 15,
      lightingCircuitFootage: 42,
      lightingCircuitLaborHours: 3,
    },
    settings,
    priceBook,
  );
  const breaker = result.assembly.find(
    (line) => line.id === "kitchen-lighting-circuit-breaker",
  );
  const cable = result.assembly.find(
    (line) => line.id === "kitchen-lighting-circuit-cable",
  );
  assert.equal(breaker?.description.includes("15A"), true);
  assert.equal(breaker?.unitCost, 9.5);
  assert.equal(cable?.description.includes("14/2 NM-B"), true);
  assert.equal(cable?.quantity, 42);
  assert.equal(cable?.unitCost, 0.37);
});

test("four-way locations add controls, box, plate, cable, and labor without a breaker", () => {
  const baseline = calculateKitchenEstimate(
    { ...baseKitchenInputs, includeLightingCircuit: false },
    settings,
    priceBook,
  );
  const result = calculateKitchenEstimate(
    {
      ...baseKitchenInputs,
      includeLightingCircuit: false,
      fourWayLocations: 2,
      fourWayCableFootage: 60,
      fourWayLaborHoursPerLocation: 1,
    },
    settings,
    priceBook,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "kitchen-four-way-switches")
      ?.quantity,
    2,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "kitchen-four-way-boxes")
      ?.quantity,
    2,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "kitchen-four-way-plates")
      ?.quantity,
    2,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "kitchen-four-way-cable")
      ?.quantity,
    60,
  );
  assert.equal(
    result.assembly.some((line) => line.id.includes("circuit-protection")),
    false,
  );
  assert.ok(result.pricing.laborCost > baseline.pricing.laborCost);
});

test("small-appliance circuits and microwave circuit remain independently selectable", () => {
  const result = calculateKitchenEstimate(
    {
      ...baseKitchenInputs,
      includeLightingCircuit: false,
      smallApplianceCircuit1: true,
      smallApplianceCircuit1Footage: 35,
      smallApplianceCircuit1LaborHours: 2.5,
      smallApplianceCircuit2: false,
      smallApplianceCircuit2Footage: 55,
      smallApplianceCircuit2LaborHours: 4,
      microwaveCircuit: true,
      microwaveCircuitFootage: 25,
      microwaveCircuitLaborHours: 2,
      applianceCircuitAmperage: 20,
      applianceCircuitCableType: "12/2 NM-B",
      applianceCircuitProtectionType: "Standard",
    },
    settings,
    priceBook,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "kitchen-small-appliance-circuit-1-cable",
    )?.quantity,
    35,
  );
  assert.equal(
    result.assembly.some((line) =>
      line.id.startsWith("kitchen-small-appliance-circuit-2"),
    ),
    false,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "kitchen-microwave-circuit-cable",
    )?.quantity,
    25,
  );
  assert.equal(
    result.assembly.filter((line) => line.id.endsWith("-breaker")).length,
    2,
  );
});

test("shared appliance home-run length multiplies by selected circuits into one visible 12/2 line", () => {
  const editedPriceBook = priceBook.map((row) =>
    row.item === "12/2 NM-B cable" ? { ...row, unitCost: 0.72 } : row,
  );
  const result = calculateKitchenEstimate(
    {
      ...baseKitchenInputs,
      includeLightingCircuit: false,
      smallApplianceCircuits: 2,
      microwaveCircuits: 1,
      applianceHomeRun12_2Length: 60,
      applianceCircuitAmperage: 20,
      applianceCircuitProtectionType: "Standard",
    },
    settings,
    editedPriceBook,
  );
  const homeRun = result.assembly.find(
    (line) => line.id === "kitchen-appliance-home-run-cable",
  );
  assert.equal(homeRun?.quantity, 180);
  assert.equal(homeRun?.unit, "ft");
  assert.equal(homeRun?.unitCost, 0.72);
  assert.equal(homeRun?.description.includes("60 ft × 3 selected circuits = 180 ft"), true);
  assert.equal(
    result.assembly.some(
      (line) =>
        line.id === "kitchen-small-appliance-circuit-1-cable" ||
        line.id === "kitchen-small-appliance-circuit-2-cable" ||
        line.id === "kitchen-microwave-circuit-cable",
    ),
    false,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "kitchen-small-appliance-circuits-breaker",
    )?.quantity,
    2,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "kitchen-microwave-circuits-breaker",
    )?.quantity,
    1,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "kitchen-small-appliance-circuits-device",
    )?.quantity,
    2,
  );
});

test("Kitchen breaker section derives 15A and 20A quantities without double-counting circuit breakers", () => {
  const result = calculateKitchenEstimate(
    {
      ...baseKitchenInputs,
      countertopReceptacles: 4,
      includeLightingCircuit: true,
      lightingCircuitFootage: 40,
      lightingCircuitLaborHours: 3,
      smallApplianceCircuits: 2,
      microwaveCircuits: 1,
      applianceHomeRun12_2Length: 60,
      applianceCircuitAmperage: 20,
      breaker15AProtectionType: "Dual Function",
      breaker20AProtectionType: "Dual Function",
    },
    settings,
    priceBook,
  );

  const countertopDevices = result.assembly.find(
    (line) => line.id === "countertop-receptacles",
  );
  const breaker15A = result.assembly.find(
    (line) => line.id === "kitchen-breakers-15a",
  );
  const breaker20A = result.assembly.find(
    (line) => line.id === "kitchen-breakers-20a",
  );

  assert.equal(countertopDevices?.quantity, 4);
  assert.equal(countertopDevices?.unitCost, 1.25);
  assert.equal(countertopDevices?.description.includes("GFCI"), false);
  assert.equal(breaker15A?.quantity, 1);
  assert.equal(breaker15A?.unitCost, 64);
  assert.equal(breaker15A?.description.includes("Q115DF"), true);
  assert.equal(breaker20A?.quantity, 4);
  assert.equal(breaker20A?.unitCost, 69);
  assert.equal(breaker20A?.description.includes("Q120DF"), true);
  assert.equal(
    result.assembly.some((line) => line.id.endsWith("-breaker")),
    false,
  );
  assert.equal(
    result.assembly.some(
      (line) => line.id === "kitchen-countertop-circuit-protection",
    ),
    false,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "kitchen-appliance-home-run-cable",
    )?.quantity,
    180,
  );
});

test("Kitchen breaker protection types and quantity overrides resolve exact editable price-book rows", () => {
  const result = calculateKitchenEstimate(
    {
      ...baseKitchenInputs,
      countertopReceptacles: 4,
      includeLightingCircuit: true,
      lightingCircuitFootage: 40,
      lightingCircuitLaborHours: 3,
      smallApplianceCircuits: 2,
      microwaveCircuits: 1,
      applianceHomeRun12_2Length: 60,
      applianceCircuitAmperage: 20,
      breaker15AQuantity: 2,
      breaker15AProtectionType: "GFCI",
      breaker20AQuantity: 5,
      breaker20AProtectionType: "AFCI",
    },
    settings,
    priceBook,
  );

  const breaker15A = result.assembly.find(
    (line) => line.id === "kitchen-breakers-15a",
  );
  const breaker20A = result.assembly.find(
    (line) => line.id === "kitchen-breakers-20a",
  );
  assert.equal(breaker15A?.quantity, 2);
  assert.equal(breaker15A?.unitCost, 52);
  assert.equal(breaker15A?.description.includes("QF115A"), true);
  assert.equal(breaker15A?.source.includes("SKU SIEMENS-15-GFCI"), true);
  assert.equal(breaker20A?.quantity, 5);
  assert.equal(breaker20A?.unitCost, 58);
  assert.equal(breaker20A?.description.includes("Q120AFC"), true);
  assert.equal(breaker20A?.source.includes("SKU SIEMENS-20-AFCI"), true);
  assert.equal(
    result.pricing.pricingWarnings.some((warning) =>
      typeof warning === "string"
        ? warning.includes("15A breaker quantity")
        : warning.message.includes("15A breaker quantity"),
    ),
    true,
  );
  assert.equal(
    result.pricing.pricingWarnings.some((warning) =>
      typeof warning === "string"
        ? warning.includes("20A breaker quantity")
        : warning.message.includes("20A breaker quantity"),
    ),
    true,
  );
});

test("contractor-edited kitchen circuit and four-way prices flow into estimates", () => {
  const editedPriceBook = priceBook.map((row) =>
    row.item === "14/2 NM-B cable"
      ? { ...row, unitCost: 0.49 }
      : row.item === "Legrand radiant TM874WCC10 15A 4-way switch"
        ? { ...row, unitCost: 18 }
        : row,
  );
  const result = calculateKitchenEstimate(
    {
      ...baseKitchenInputs,
      includeLightingCircuit: true,
      lightingCircuitFootage: 20,
      fourWayLocations: 1,
      fourWayCableFootage: 10,
    },
    settings,
    editedPriceBook,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "kitchen-lighting-circuit-cable",
    )?.unitCost,
    0.49,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "kitchen-four-way-switches")
      ?.unitCost,
    18,
  );
});