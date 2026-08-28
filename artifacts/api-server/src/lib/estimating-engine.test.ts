import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CreateQuoteBody, PreviewQuoteBody } from "@workspace/api-zod";
import {
  auditPriceBookItem,
  calculateAdditionEstimate,
  calculateBathroomEstimate,
  calculateKitchenEstimate,
  calculateNewHouseEstimate,
  calculatePanelReplacementEstimate,
  calculateRecessedLightingEstimate,
  calculateServiceUpgradeEstimate,
  type EstimatingSettings,
  type PriceBookItem,
} from "./estimating-engine";
import type {
  AdditionInputRecord,
  BathroomInputRecord,
  KitchenInputRecord,
  NewHouseInputRecord,
  PanelReplacementInputRecord,
  RecessedLightingInputRecord,
  ServiceUpgradeInputRecord,
} from "@workspace/db";

const additionInputs: AdditionInputRecord = {
  length: 20, width: 16, receptacles: 8, switches: 3, dimmers: 1,
  recessedLights: 6, recessedLightSize: "4-inch", ceilingFans: 1,
  customerSuppliedFans: false, circuitCount: 2, routeLength: 50,
  homeRunLength: 35, panelManufacturer: "Siemens", breakerAmperage: 15,
  breakerPoleCount: 1, breakerProtectionType: "AFCI",
  cableType: "14/2 NM-B", crewSize: 2, crewHours: 8,
  laborAdjustmentHours: 0, laborRateType: "residential", notes: "",
};

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
  supplier: "Verified supplier",
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

const priceBook: PriceBookItem[] = [
  catalogRow("Juno WF4DREGSMAL 4-inch regressed wafer light", 30.605, {
    manufacturer: "Juno",
    manufacturerPartNumber: "WF4DREGSMAL",
  }),
  catalogRow("Juno WF6-DREG 6-inch regressed wafer light", 34.006, {
    manufacturer: "Juno",
    manufacturerPartNumber: "WF6-DREG",
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
  catalogRow("Panasonic FV-0511VF1 exhaust fan", 136, {
    category: "Ventilation",
    manufacturer: "Panasonic",
    manufacturerPartNumber: "FV-0511VF1",
  }),
  catalogRow("Contractor-supplied bathroom fan/light combination", 210, {
    category: "Ventilation",
  }),
  catalogRow("Contractor-supplied bathroom fan/light/heat combination", 360, {
    category: "Ventilation",
  }),
  catalogRow("Bathroom 15A circuit box and device materials", 35, {
    category: "Circuit",
  }),
];

const bathroomBuilderInputs: BathroomInputRecord = {
  gfciReceptacles: 0,
  additionalReceptacles: 0,
  vanityLights: 1,
  recessedLights: 0,
  exhaustFans: 1,
  fanLights: 1,
  fanLightHeatUnits: 1,
  heatedFloorCircuit: false,
  additionalSwitches: 0,
  routeLength: 30,
  circuitOption: "Reuse existing circuit",
  customerSuppliedFixtures: true,
  notes: "",
  laborRateType: "residential",
  panelManufacturer: "Siemens",
  breakerAmperage: 15,
  breakerPoleCount: 1,
  breakerProtectionType: "AFCI",
  gfciAmperage: 20,
  recessedLightSize: "4-inch",
  cableType: "12/2 NM-B",
  laborAdjustmentHours: 0,
};

test("bathroom prices all exhaust options as contractor supplied while vanity remains customer supplied", () => {
  const result = calculateBathroomEstimate(
    bathroomBuilderInputs,
    settings,
    priceBook,
  );

  assert.equal(
    result.assembly.find((line) => line.id === "vanity-lights")?.unitCost,
    0,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "vanity-lights")?.source,
    "Customer supplied fixture",
  );
  assert.equal(
    result.assembly.find((line) => line.id === "exhaust-fans")?.unitCost,
    136,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "fan-lights")?.unitCost,
    210,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "fan-light-heat")?.unitCost,
    360,
  );
});

test("bathroom quote-local exhaust overrides flow through material, profit, and margin totals", () => {
  const base = calculateBathroomEstimate(
    bathroomBuilderInputs,
    settings,
    priceBook,
  );
  const overridden = calculateBathroomEstimate(
    {
      ...bathroomBuilderInputs,
      exhaustFanMaterialCostOverride: 150,
      fanLightMaterialCostOverride: 250,
      fanLightHeatMaterialCostOverride: 400,
    },
    settings,
    priceBook,
  );

  assert.equal(
    overridden.assembly.find((line) => line.id === "exhaust-fans")?.unitCost,
    150,
  );
  assert.equal(
    overridden.assembly.find((line) => line.id === "fan-lights")?.unitCost,
    250,
  );
  assert.equal(
    overridden.assembly.find((line) => line.id === "fan-light-heat")?.unitCost,
    400,
  );
  assert.equal(overridden.pricing.materialCost - base.pricing.materialCost, 94);
  assert.notEqual(
    overridden.pricing.calculatedSellingPrice,
    base.pricing.calculatedSellingPrice,
  );
  assert.notEqual(overridden.pricing.grossProfit, base.pricing.grossProfit);
  assert.notEqual(overridden.pricing.grossMargin, base.pricing.grossMargin);
});

test("bathroom new 15A AFCI circuit includes cable, editable materials, breaker, and labor", () => {
  const reuse = calculateBathroomEstimate(
    bathroomBuilderInputs,
    settings,
    priceBook,
  );
  const afci = calculateBathroomEstimate(
    {
      ...bathroomBuilderInputs,
      circuitOption: "New dedicated circuit",
      newCircuitCableFootage: 40,
      newCircuitMaterialsQuantity: 2,
      newCircuitLaborHours: 4.5,
      newCircuitBreakerProtectionType: "AFCI",
    },
    settings,
    priceBook,
  );

  assert.equal(
    afci.assembly.find((line) => line.id === "bathroom-15a-circuit-cable")
      ?.quantity,
    40,
  );
  assert.equal(
    afci.assembly.find((line) => line.id === "bathroom-15a-circuit-cable")
      ?.unitCost,
    0.37,
  );
  assert.equal(
    afci.assembly.find((line) => line.id === "bathroom-15a-circuit-materials")
      ?.quantity,
    2,
  );
  assert.equal(
    afci.assembly.find((line) => line.id === "bathroom-15a-circuit-protection")
      ?.unitCost,
    44,
  );
  assert.equal(
    afci.assembly.find((line) => line.id === "bathroom-15a-circuit-protection")
      ?.description.includes("15A AFCI"),
    true,
  );
  assert.ok(
    Math.abs(afci.pricing.materialCost - reuse.pricing.materialCost - 128.8) <
      0.000001,
  );
  assert.equal(
    afci.pricing.laborCost - reuse.pricing.laborCost,
    4.5 * settings.loadedLaborCost,
  );
  assert.notEqual(
    afci.pricing.calculatedSellingPrice,
    reuse.pricing.calculatedSellingPrice,
  );
  assert.notEqual(afci.pricing.grossProfit, reuse.pricing.grossProfit);
  assert.notEqual(afci.pricing.grossMargin, reuse.pricing.grossMargin);
});

test("bathroom preview and create validate identical 15A circuit and exhaust override snapshots", () => {
  const jobInputs = {
    ...bathroomBuilderInputs,
    circuitOption: "New dedicated circuit" as const,
    newCircuitCableFootage: 25,
    newCircuitMaterialsQuantity: 1,
    newCircuitMaterialsUnitCostOverride: 42,
    newCircuitLaborHours: 3.5,
    newCircuitBreakerProtectionType: "AFCI" as const,
    exhaustFanMaterialCostOverride: 136,
    fanLightMaterialCostOverride: 225,
    fanLightHeatMaterialCostOverride: 375,
  };
  assert.equal(
    PreviewQuoteBody.safeParse({ module: "BATHROOM", jobInputs }).success,
    true,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "Bathroom customer",
      projectName: "Bathroom renovation",
      module: "BATHROOM",
      jobInputs,
      proposalDescription: "Install the configured bathroom electrical scope.",
    }).success,
    true,
  );

  const invalidInputs = {
    ...jobInputs,
    newCircuitBreakerProtectionType: "Unsupported",
  };
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "BATHROOM",
      jobInputs: invalidInputs,
    }).success,
    false,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "Bathroom customer",
      projectName: "Invalid bathroom",
      module: "BATHROOM",
      jobInputs: invalidInputs,
      proposalDescription: "Validation test.",
    }).success,
    false,
  );
});

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

test("panel exact selections enforce product role, manufacturer, amperage, and space compatibility", () => {
  const exactPanel =
    "Square D HOM612L100R 100A 6-space MLO load center — SKU 79511";
  const exactRaceway =
    "PVCFIT 200P40-20F 2-inch Sch40 PVC conduit 10-ft stick — SKU 8891";
  const exactFitting =
    "PVCFIT 200P CP 2-inch PVC conduit coupling — SKU 26466";
  const exactGroundBar = "Square D PK3GTA1 ground bar — SKU 86163";
  const exactPriceBook = [
    ...panelReplacementPriceBook,
    catalogRow(exactPanel, 151.625, {
      category: "Panel",
      manufacturer: "Square D",
      amperage: 100,
    }),
    catalogRow(
      "Square D QO130L100 100A 30-space load center — SKU TEST-30",
      225,
      {
        category: "Panel",
        manufacturer: "Square D",
        amperage: 100,
      },
    ),
    catalogRow(exactRaceway, 1.12886, { category: "Raceway" }),
    catalogRow(exactFitting, 0.84149, { category: "Raceway" }),
    catalogRow(exactGroundBar, 17.669, {
      category: "Grounding",
      manufacturer: "Square D",
    }),
    catalogRow("Square D 100A 2-pole standard breaker", 95, {
      manufacturer: "Square D",
      amperage: 100,
      poleCount: 2,
      protectionType: "Standard",
    }),
  ];
  const compatible = calculatePanelReplacementEstimate(
    {
      ...panelReplacementInputs,
      panelManufacturer: "Square D",
      panelAmperage: 100,
      panelSpaceCount: 6,
      breakerAmperage: 100,
      feederConductor: "1/0 aluminum XHHW conductor",
      exactCatalogParts: {
        panelProduct: exactPanel,
        feederRaceway: exactRaceway,
        feederRacewayFitting: exactFitting,
        groundBar: exactGroundBar,
      },
    },
    settings,
    exactPriceBook,
  );
  assert.equal(
    compatible.assembly.find((line) => line.id === "panel-replacement-panel")
      ?.unitCost,
    151.625,
  );
  assert.equal(
    compatible.assembly.find((line) => line.id === "feeder-raceway")?.unitCost,
    1.12886,
  );
  assert.equal(
    compatible.assembly.find((line) => line.id === "feeder-raceway-fittings")
      ?.unitCost,
    0.84149,
  );
  assert.equal(
    compatible.assembly.find((line) => line.id === "panel-ground-bars")
      ?.unitCost,
    17.669,
  );

  const incompatibleSpace = calculatePanelReplacementEstimate(
    {
      ...panelReplacementInputs,
      panelManufacturer: "Square D",
      panelAmperage: 100,
      panelSpaceCount: 12,
      breakerAmperage: 100,
      feederConductor: "1/0 aluminum XHHW conductor",
      exactCatalogParts: { panelProduct: exactPanel },
    },
    settings,
    exactPriceBook,
  );
  assert.equal(
    incompatibleSpace.assembly.find(
      (line) => line.id === "panel-replacement-panel",
    )?.unitCost,
    0,
  );
  assert.equal(
    incompatibleSpace.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_CATALOG_SELECTION_INCOMPATIBLE" &&
        warning.context.group === "panelProduct",
    ),
    true,
  );

  const incompatibleThirtySpace = calculatePanelReplacementEstimate(
    {
      ...panelReplacementInputs,
      panelManufacturer: "Square D",
      panelAmperage: 100,
      panelSpaceCount: 12,
      breakerAmperage: 100,
      feederConductor: "1/0 aluminum XHHW conductor",
      exactCatalogParts: {
        panelProduct:
          "Square D QO130L100 100A 30-space load center — SKU TEST-30",
      },
    },
    settings,
    exactPriceBook,
  );
  assert.equal(
    incompatibleThirtySpace.assembly.find(
      (line) => line.id === "panel-replacement-panel",
    )?.unitCost,
    0,
  );

  const incompatibleGroundBarRole = calculatePanelReplacementEstimate(
    {
      ...panelReplacementInputs,
      panelManufacturer: "Square D",
      panelAmperage: 100,
      panelSpaceCount: 6,
      breakerAmperage: 100,
      feederConductor: "1/0 aluminum XHHW conductor",
      exactCatalogParts: { groundBar: exactPanel },
    },
    settings,
    exactPriceBook,
  );
  assert.equal(
    incompatibleGroundBarRole.assembly.find(
      (line) => line.id === "panel-ground-bars",
    )?.unitCost,
    0,
  );
  assert.equal(
    incompatibleGroundBarRole.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_CATALOG_SELECTION_INCOMPATIBLE" &&
        warning.context.group === "groundBar",
    ),
    true,
  );
});

test("panel replacement labor uses quote-local crew size and hours", () => {
  const result = calculatePanelReplacementEstimate(
    {
      ...panelReplacementInputs,
      crewSize: 3,
      crewHours: 12,
    },
    settings,
    panelReplacementPriceBook,
  );

  assert.equal(result.pricing.laborCost, 40 * settings.loadedLaborCost);
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

test("addition preserves parity, editable pricing, audit, and cable safety", () => {
  const book = [
    ...priceBook,
    catalogRow("Pass & Seymour TM870-W 15A single-pole switch", 1.85),
    catalogRow("Lutron DVCL-153P-WH Diva LED+ dimmer", 30.28),
    catalogRow("Contractor-supplied ceiling fan", 180, { category: "Equipment" }),
  ];
  const result = calculateAdditionEstimate(additionInputs, settings, book);
  const areaOverride = calculateAdditionEstimate(
    { ...additionInputs, squareFootageOverride: 900 }, settings, book,
  );
  assert.equal(result.pricing.calculatedSellingPrice, areaOverride.pricing.calculatedSellingPrice);
  assert.equal(result.assembly.find((line) => line.id === "addition-cable")?.quantity, 120);
  const incompatible = calculateAdditionEstimate(
    { ...additionInputs, breakerAmperage: 20, cableType: "14/2 NM-B" },
    settings, book,
  );
  assert.equal(incompatible.assembly.find((line) => line.id === "addition-cable")?.unitCost, 0);
  assert.equal(PreviewQuoteBody.safeParse({ module: "ADDITION", jobInputs: additionInputs }).success, true);
  assert.equal(CreateQuoteBody.safeParse({
    customerName: "Addition customer", projectName: "Addition", module: "ADDITION",
    jobInputs: additionInputs, proposalDescription: "Addition scope",
  }).success, true);
  assert.equal(auditPriceBookItem({
    category: "Equipment", item: "Contractor-supplied ceiling fan",
    unitCost: 0, isDefault: false, supplierSku: null,
  }).builders.includes("Addition"), true);
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
    result.assembly.some((line) => line.id === "service-breaker"),
    false,
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

test("verified Milbank meter-main includes the 200A main breaker without a duplicate line or warning", () => {
  const milbankMeterMain =
    "Milbank U3990-XL-200 200A meter-main — SKU 304898";
  const result = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      exactCatalogParts: { meterDisconnect: milbankMeterMain },
    },
    settings,
    [
      ...servicePriceBook.filter(
        (row) =>
          !(
            row.amperage === 200 &&
            row.poleCount === 2 &&
            row.protectionType === "Standard"
          ),
      ),
      catalogRow(milbankMeterMain, 441.525, {
        category: "Equipment",
        manufacturer: "Milbank",
        manufacturerPartNumber: "U3990-XL-200",
        supplierSku: "304898",
        amperage: 200,
      }),
    ],
  );

  assert.equal(
    result.assembly.some((line) => line.id === "service-breaker"),
    false,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "service-meter-disconnect")
      ?.unitCost,
    441.525,
  );
  assert.equal(
    result.pricing.pricingWarnings.some((warning) =>
      (typeof warning === "string" ? warning : warning.message).includes(
        "200A 2-pole Standard breaker",
      ),
    ),
    false,
  );
});

test("service upgrade consumes exact Erico ground rod, Erico clamp, and AGP duct-seal rows", () => {
  const groundRod = "Erico 615880 5/8x8ft copper ground rod — SKU 160523";
  const groundClamp = "Erico CP58 5/8 ground rod clamp — SKU 31589";
  const ductSeal = "AGP DS1 1lb duct seal — SKU 1009903";
  const result = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      exactCatalogParts: {
        groundRod,
        acornClamp: groundClamp,
        ductSeal,
      },
    },
    settings,
    [
      ...servicePriceBook,
      catalogRow(groundRod, 25.313, {
        category: "Grounding",
        manufacturer: "Erico",
        manufacturerPartNumber: "615880",
        supplierSku: "160523",
      }),
      catalogRow(groundClamp, 6.092, {
        category: "Grounding",
        manufacturer: "Erico",
        manufacturerPartNumber: "CP58",
        supplierSku: "31589",
      }),
      catalogRow(ductSeal, 3.801, {
        category: "Normal Stock",
        manufacturer: "AGP",
        manufacturerPartNumber: "DS1",
        supplierSku: "1009903",
      }),
    ],
  );

  assert.equal(
    result.assembly.find((line) => line.id === "ground-rods")?.unitCost,
    25.313,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "acorn-clamps")?.unitCost,
    6.092,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "duct-seal")?.unitCost,
    3.801,
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
    {
      ...serviceUpgradeInputs,
      serviceDisconnect: "Outdoor service disconnect",
      meterDisconnectEquipment: "200A outdoor meter/disconnect",
    },
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

test("service exact catalog selectors resolve only the named compatible canonical row and omission retains legacy keys", () => {
  const exactSer = "Northeast 4/0 aluminum SER 1000 ft reel";
  const result = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      exactCatalogParts: { serviceToPanelConductor: exactSer },
    },
    settings,
    [
      ...servicePriceBook,
      catalogRow(exactSer, 9.75, {
        category: "Conductor",
        supplier: "Northeast Electrical",
        supplierSku: "SER-4-0-1000",
      }),
    ],
  );
  assert.equal(
    result.assembly.find((line) => line.id === "service-to-panel-conductor")?.unitCost,
    9.75,
  );
  const incompatible = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      exactCatalogParts: { serviceToPanelConductor: "Northeast 3/0 aluminum SER" },
    },
    settings,
    [
      ...servicePriceBook,
      catalogRow("Northeast 3/0 aluminum SER", 7, {
        category: "Conductor",
      }),
    ],
  );
  assert.equal(
    incompatible.assembly.find((line) => line.id === "service-to-panel-conductor")?.unitCost,
    0,
  );
  assert.equal(
    incompatible.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_CATALOG_SELECTION_INCOMPATIBLE" &&
        warning.context.group === "serviceToPanelConductor",
    ),
    true,
  );
  const legacy = calculateServiceUpgradeEstimate(
    { ...serviceUpgradeInputs, exactCatalogParts: undefined },
    settings,
    servicePriceBook,
  );
  assert.equal(
    legacy.assembly.find((line) => line.id === "service-to-panel-conductor")?.unitCost,
    8.5,
  );
});

test("service exact equipment and raceway selectors enforce compatibility and remain line-specific", () => {
  const meter =
    "Siemens MC0816B1200 200A meter-load-center — SKU 132873";
  const mastRaceway = "PVCFIT 2-inch Sch40 PVC conduit — SKU MAST";
  const feederRaceway = "PVCFIT 2-inch Sch40 PVC conduit — SKU FEEDER";
  const exactPriceBook = [
    ...servicePriceBook,
    catalogRow(meter, 523.989, {
      category: "Equipment",
      manufacturer: "Siemens",
      amperage: 200,
    }),
    catalogRow(mastRaceway, 1.25, { category: "Raceway" }),
    catalogRow(feederRaceway, 2.75, { category: "Raceway" }),
    catalogRow("Siemens ECHS200 2-inch load-center rain hub — SKU 26750", 11.954, {
      category: "Raceway",
      manufacturer: "Siemens",
    }),
  ];
  const independentRaceways = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      serviceToPanelConductor: "4/0 aluminum XHHW in raceway",
      exactCatalogParts: {
        meterDisconnect: meter,
        mastRaceway,
        serviceToPanelRaceway: feederRaceway,
      },
    },
    settings,
    exactPriceBook,
  );
  assert.equal(
    independentRaceways.assembly.find((line) => line.id === "mast-raceway")
      ?.unitCost,
    1.25,
  );
  assert.equal(
    independentRaceways.assembly.find(
      (line) => line.id === "service-to-panel-raceway",
    )?.unitCost,
    2.75,
  );

  const incompatibleMeter = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      serviceSize: "150A",
      breakerAmperage: 150,
      meterDisconnectEquipment:
        "150A meter-main with built-in outdoor disconnect",
      mastConductor: "3/0 aluminum XHHW conductor",
      serviceToPanelConductor: "3/0 aluminum SER",
      exactCatalogParts: { meterDisconnect: meter },
    },
    settings,
    exactPriceBook,
  );
  assert.equal(
    incompatibleMeter.assembly.find(
      (line) => line.id === "service-meter-disconnect",
    )?.unitCost,
    0,
  );
  assert.equal(
    incompatibleMeter.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_CATALOG_SELECTION_INCOMPATIBLE" &&
        warning.context.group === "meterDisconnect",
    ),
    true,
  );

  const incompatibleHub = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      panelManufacturer: "Square D",
      exactCatalogParts: {
        mastHub:
          "Siemens ECHS200 2-inch load-center rain hub — SKU 26750",
      },
    },
    settings,
    exactPriceBook,
  );
  assert.equal(
    incompatibleHub.assembly.find((line) => line.id === "mast-hub")?.unitCost,
    0,
  );
  assert.equal(
    incompatibleHub.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_CATALOG_SELECTION_INCOMPATIBLE" &&
        warning.context.group === "mastHub",
    ),
    true,
  );

  const incompatibleServicePanelRole = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      exactCatalogParts: { servicePanel: meter },
    },
    settings,
    exactPriceBook,
  );
  assert.equal(
    incompatibleServicePanelRole.assembly.find(
      (line) => line.id === "service-panel",
    )?.unitCost,
    0,
  );
  assert.equal(
    incompatibleServicePanelRole.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "EXACT_CATALOG_SELECTION_INCOMPATIBLE" &&
        warning.context.group === "servicePanel",
    ),
    true,
  );
});

test("service upgrade prices the exact Northeast 2-inch PVC mast rows at normalized estimating units", () => {
  const conduit =
    "PVCFIT 200P40-20F 2-inch Sch40 PVC conduit 10-ft stick — SKU 8891";
  const weatherhead =
    "PVCFIT 200P WH 2-inch PVC service weatherhead — SKU 512902";
  const expansionCoupling =
    "PVCFIT 200P EC 2-inch PVC expansion coupling — SKU 15350";
  const strap =
    "PVCFIT 200P PS 2-inch two-hole PVC conduit strap — SKU 152755";
  const coupling =
    "PVCFIT 200P CP 2-inch PVC conduit coupling — SKU 26466";
  const result = calculateServiceUpgradeEstimate(
    {
      ...serviceUpgradeInputs,
      mastFootage: 10,
      weatherheadQuantity: 1,
      mastExpansionCouplingQuantity: 1,
      mastStrapQuantity: 3,
      couplingQuantity: 2,
      mastRelatedPartsQuantity: 0,
      exactCatalogParts: {
        mastRaceway: conduit,
        mastWeatherhead: weatherhead,
        mastExpansionCoupling: expansionCoupling,
        mastStrap: strap,
        mastCoupling: coupling,
      },
    },
    settings,
    [
      ...servicePriceBook,
      catalogRow(conduit, 1.12886, {
        category: "Raceway",
        manufacturer: "Pvcfit",
        manufacturerPartNumber: "PVCFIT 200P40-20F",
        supplierSku: "8891",
      }),
      catalogRow(weatherhead, 15.70706, {
        category: "Raceway",
        manufacturer: "Pvcfit",
        manufacturerPartNumber: "PVCFIT 200P WH",
        supplierSku: "512902",
      }),
      catalogRow(expansionCoupling, 23.68549, {
        category: "Raceway",
        manufacturer: "Pvcfit",
        manufacturerPartNumber: "PVCFIT 200P EC",
        supplierSku: "15350",
      }),
      catalogRow(strap, 0.67005, {
        category: "Raceway",
        manufacturer: "Pvcfit",
        manufacturerPartNumber: "PVCFIT 200P PS",
        supplierSku: "152755",
      }),
      catalogRow(coupling, 0.84149, {
        category: "Raceway",
        manufacturer: "Pvcfit",
        manufacturerPartNumber: "PVCFIT 200P CP",
        supplierSku: "26466",
      }),
    ],
  );

  for (const [id, quantity, unitCost] of [
    ["mast-raceway", 10, 1.12886],
    ["mast-weatherhead", 1, 15.70706],
    ["mast-expansion-coupling", 1, 23.68549],
    ["mast-straps", 3, 0.67005],
    ["mast-couplings", 2, 0.84149],
  ] as const) {
    const line = result.assembly.find((candidate) => candidate.id === id);
    assert.equal(line?.quantity, quantity);
    assert.equal(line?.unitCost, unitCost);
    assert.notEqual(line?.source, "Unresolved exact catalog selection");
  }
  assert.equal(
    result.assembly.find((candidate) => candidate.id === "mast-raceway")
      ?.extendedCost,
    11.289,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        [
          "mastRaceway",
          "mastWeatherhead",
          "mastExpansionCoupling",
          "mastStrap",
          "mastCoupling",
        ].includes(String(warning.context.group)),
    ),
    false,
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
      serviceDisconnect: "Outdoor service disconnect",
      meterDisconnectEquipment: "200A outdoor meter/disconnect",
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
    {
      ...serviceUpgradeInputs,
      serviceDisconnect: "Outdoor service disconnect",
      meterDisconnectEquipment: "200A outdoor meter/disconnect",
    },
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

test("recessed lighting consumes the verified Juno 4-inch and 6-inch fixture rows", () => {
  const fourInch = calculateRecessedLightingEstimate(
    baseInputs,
    settings,
    priceBook,
  );
  const sixInch = calculateRecessedLightingEstimate(
    { ...baseInputs, fixtureSize: "6-inch" },
    settings,
    priceBook,
  );

  assert.equal(
    fourInch.assembly.find((line) => line.id === "recessed-fixtures")
      ?.unitCost,
    30.605,
  );
  assert.equal(
    sixInch.assembly.find((line) => line.id === "recessed-fixtures")?.unitCost,
    34.006,
  );
});

test("customer-supplied fixtures remain zero cost with a blocking audit warning", () => {
  const result = calculateRecessedLightingEstimate(
    { ...baseInputs, customerSuppliedFixtures: true },
    settings,
    priceBook,
  );

  assert.equal(
    result.assembly.find((line) => line.id === "recessed-fixtures")?.unitCost,
    0,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "CUSTOMER_SUPPLIED_MATERIAL_REVIEW" &&
        warning.severity === "error",
    ),
    true,
  );
});

test("price-book audit identifies unresolved active selections by builder", () => {
  const unresolvedBreaker = auditPriceBookItem(
    catalogRow("Square D 50A 2-pole GFCI breaker", 0, {
      category: "Protection",
    }),
  );
  const verifiedFixture = auditPriceBookItem(
    catalogRow("Juno WF4DREGSMAL 4-inch regressed wafer light", 30.605, {
      category: "Lighting",
    }),
  );

  assert.equal(unresolvedBreaker.isUnresolved, true);
  assert.equal(unresolvedBreaker.activeSelection, true);
  assert.deepEqual(unresolvedBreaker.builders, ["EV Charger"]);
  assert.match(unresolvedBreaker.auditMessage ?? "", /sourced contractor cost/i);
  assert.equal(verifiedFixture.isUnresolved, false);
  assert.deepEqual(verifiedFixture.builders, ["Addition", "Recessed Lighting"]);

  const unresolvedPrimer = auditPriceBookItem(
    catalogRow("PVCFIT clear quart primer — SKU 152609", 0, {
      category: "Normal Stock",
      supplierSku: "152609",
    }),
  );
  const sharedRaceway = auditPriceBookItem(
    catalogRow("PVCFIT 2-inch Sch40 PVC conduit — SKU 8891", 0, {
      category: "Raceway",
      supplierSku: "8891",
    }),
  );
  assert.deepEqual(unresolvedPrimer.builders, ["Service Upgrade"]);
  assert.deepEqual(sharedRaceway.builders, [
    "Service Upgrade",
    "Panel Replacement",
  ]);

  const legacyRows = [
    ["4-square deep box", "Devices", ["Service Upgrade"]],
    ["20A receptacle", "Devices", ["Service Upgrade"]],
    ["20A receptacle plate", "Trim", ["Service Upgrade"]],
    ["4x4x3/4 plywood", "Backing", ["Service Upgrade", "Panel Replacement"]],
    ["2x4x8 stud", "Framing", ["Service Upgrade", "Panel Replacement"]],
  ] as const;
  for (const [item, category, expectedBuilders] of legacyRows) {
    const audit = auditPriceBookItem(
      catalogRow(item, 0, { category }),
    );
    for (const expectedBuilder of expectedBuilders) {
      assert.equal(
        audit.builders.includes(expectedBuilder),
        true,
        `${item} should be visible under ${expectedBuilder}`,
      );
    }
    assert.deepEqual(audit.builders, [...expectedBuilders]);
    assert.equal(audit.activeSelection, true);
    assert.equal(audit.isUnresolved, true);
  }

  assert.deepEqual(
    auditPriceBookItem(
      catalogRow("PVCFIT 200P WH 2-inch PVC service weatherhead — SKU 512902", 0, {
        category: "Raceway",
        supplierSku: "512902",
      }),
    ).builders,
    ["Service Upgrade"],
  );
  assert.deepEqual(
    auditPriceBookItem(
      catalogRow("service duct seal", 0, { category: "Normal Stock" }),
    ).builders,
    ["Service Upgrade"],
  );
});

test("every service and panel builder material is assigned only to its consuming price-book audits", () => {
  type BuilderName = "Service Upgrade" | "Panel Replacement";
  type AuditInventoryItem =
    | {
        kind: "exact";
        key: string;
        builders: readonly BuilderName[];
      }
    | {
        kind: "legacy";
        key: string;
        builders: readonly BuilderName[];
      };

  const inventory: readonly AuditInventoryItem[] = [
    { kind: "exact", key: "304898", builders: ["Service Upgrade"] },
    { kind: "exact", key: "132873", builders: ["Service Upgrade"] },
    { kind: "exact", key: "1552599", builders: ["Service Upgrade"] },
    { kind: "exact", key: "79511", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "exact", key: "8891", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "exact", key: "512902", builders: ["Service Upgrade"] },
    { kind: "exact", key: "15350", builders: ["Service Upgrade"] },
    { kind: "exact", key: "152755", builders: ["Service Upgrade"] },
    { kind: "exact", key: "26750", builders: ["Service Upgrade"] },
    { kind: "exact", key: "25807", builders: ["Service Upgrade"] },
    { kind: "exact", key: "18745", builders: ["Service Upgrade"] },
    { kind: "exact", key: "26466", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "exact", key: "28551", builders: ["Service Upgrade"] },
    { kind: "exact", key: "79651", builders: ["Service Upgrade"] },
    { kind: "exact", key: "1266468", builders: ["Service Upgrade"] },
    { kind: "exact", key: "239663", builders: ["Service Upgrade"] },
    { kind: "exact", key: "300640", builders: ["Service Upgrade"] },
    { kind: "exact", key: "17742", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "exact", key: "35113", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "exact", key: "86163", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "exact", key: "160523", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "exact", key: "31589", builders: ["Service Upgrade"] },
    { kind: "exact", key: "9871", builders: ["Service Upgrade"] },
    { kind: "exact", key: "30952", builders: ["Service Upgrade"] },
    { kind: "exact", key: "1009903", builders: ["Service Upgrade"] },
    { kind: "exact", key: "152609", builders: ["Service Upgrade"] },
    { kind: "exact", key: "152791", builders: ["Service Upgrade"] },
    { kind: "exact", key: "32650", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "exact", key: "21719", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "legacy", key: "2-inch PVC mast raceway", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "2-inch PVC weatherhead", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "2-inch PVC expansion coupling", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "2-inch PVC strap", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "2-inch PVC hub", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "2-inch PVC LB", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "2-inch PVC 90", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "2-inch PVC coupling", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "2-inch PVC mast related parts", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "3/4-inch PVC raceway", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "3/4-inch PVC fittings", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "intersystem bonding terminal", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "water-meter bonding clamp", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "4-square deep box", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "20A receptacle", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "20A receptacle plate", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "service duct seal", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "PVC primer", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "PVC glue", builders: ["Service Upgrade"] },
    { kind: "legacy", key: "panel replacement feeder raceway", builders: ["Panel Replacement"] },
    { kind: "legacy", key: "panel replacement feeder raceway fittings", builders: ["Panel Replacement"] },
    { kind: "legacy", key: "panel knockout seal", builders: ["Panel Replacement"] },
    { kind: "legacy", key: "4x4x3/4 plywood", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "legacy", key: "2x4x8 stud", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "legacy", key: "#8 solid grounding conductor", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "legacy", key: "#4 green bonding conductor", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "legacy", key: "anti-oxidation compound", builders: ["Service Upgrade", "Panel Replacement"] },
    { kind: "legacy", key: "electrical tape", builders: ["Service Upgrade", "Panel Replacement"] },
  ];

  for (const selection of inventory) {
    const audit = auditPriceBookItem(
      catalogRow(
        selection.kind === "exact" ? `Builder selection — SKU ${selection.key}` : selection.key,
        0,
        selection.kind === "exact" ? { supplierSku: selection.key } : {},
      ),
    );
    assert.deepEqual(
      audit.builders,
      [...selection.builders],
      `${selection.kind} builder material "${selection.key}" has incomplete or unrelated price-book audit metadata`,
    );
  }

  const serviceBuilderSource = readFileSync(
    new URL(
      "../../../electrical-estimator/src/pages/quotes/new-service-upgrade.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const panelBuilderSource = readFileSync(
    new URL(
      "../../../electrical-estimator/src/pages/quotes/new-panel-replacement.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const serviceExactOptionsSource =
    serviceBuilderSource.match(
      /const exactCatalogOptions = \{([\s\S]*?)\} satisfies/,
    )?.[1] ?? "";
  const literalSkus = (source: string) =>
    Array.from(source.matchAll(/\bSKU\s+(\d+)\b/g), (match) => match[1]);
  const selectableSkusByBuilder = {
    "Service Upgrade": new Set([
      ...literalSkus(serviceBuilderSource),
      ...Array.from(
        serviceExactOptionsSource.matchAll(/["'](\d{4,})["']/g),
        (match) => match[1],
      ),
    ]),
    "Panel Replacement": new Set(literalSkus(panelBuilderSource)),
  } satisfies Record<BuilderName, Set<string>>;

  for (const [builder, selectableSkus] of Object.entries(
    selectableSkusByBuilder,
  ) as Array<[BuilderName, Set<string>]>) {
    const inventoriedSkus = inventory
      .filter(
        (selection) =>
          selection.kind === "exact" && selection.builders.includes(builder),
      )
      .map((selection) => selection.key);
    assert.deepEqual(
      [...selectableSkus].sort(),
      inventoriedSkus.sort(),
      `${builder} has a selectable exact catalog SKU missing from the price-book audit inventory`,
    );
  }
});

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

test("verified Needco controls price recessed single-pole, 3-way, and dimmer selections", () => {
  const verifiedControls = [
    ...priceBook,
    catalogRow(
      "Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",
      1.85,
      { category: "Controls", manufacturer: "Pass & Seymour" },
    ),
    catalogRow(
      "Pass & Seymour TM873-W 15A 3-way switch — SKU 32128",
      2.25,
      { category: "Controls", manufacturer: "Pass & Seymour" },
    ),
    catalogRow(
      "Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393",
      30.28,
      { category: "Controls", manufacturer: "Lutron" },
    ),
  ];
  const singlePole = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "single-pole",
      dimmerSelection: "Include dimmer",
      additionalSwitches: 1,
    },
    settings,
    verifiedControls,
  );
  assert.equal(
    singlePole.assembly.find((line) => line.id === "switch-controls")?.unitCost,
    1.85,
  );
  assert.equal(
    singlePole.assembly.find((line) => line.id === "additional-switches")?.unitCost,
    1.85,
  );
  assert.equal(
    singlePole.assembly.find((line) => line.id === "dimmer")?.unitCost,
    30.28,
  );

  const threeWay = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "traditional-3-way",
      switchType: "3-way",
      traditionalThreeWayFootage: 20,
    },
    settings,
    verifiedControls,
  );
  assert.equal(
    threeWay.assembly.find((line) => line.id === "switch-controls")?.unitCost,
    2.25,
  );
  assert.equal(
    threeWay.assembly.find((line) => line.id === "switch-controls")?.quantity,
    2,
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

test("verified Needco controls and boxes price standard kitchen locations", () => {
  const result = calculateKitchenEstimate(
    {
      ...baseKitchenInputs,
      threeWayOptions: 1,
      fourWayLocations: 1,
      fourWayCableFootage: 10,
      dimmers: 1,
    },
    settings,
    [
      ...priceBook,
      catalogRow(
        "Pass & Seymour S1-18-W 1-gang box — SKU 18134",
        2.4769,
        { category: "Rough-in", manufacturer: "Pass & Seymour" },
      ),
      catalogRow(
        "Pass & Seymour TM873-W 15A 3-way switch — SKU 32128",
        2.25,
        { category: "Controls", manufacturer: "Pass & Seymour" },
      ),
      catalogRow(
        "Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393",
        30.28,
        { category: "Controls", manufacturer: "Lutron" },
      ),
    ],
  );
  assert.equal(
    result.assembly.find((line) => line.id === "three-way-options")?.quantity,
    2,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "three-way-options")?.unitCost,
    2.25,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "dimmers")?.unitCost,
    30.28,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "kitchen-boxes")?.unitCost,
    2.4769,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "kitchen-four-way-boxes")?.unitCost,
    2.4769,
  );
});

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

const newHouseInputs: NewHouseInputRecord = {
  finishedSquareFootage: 2000,
  floorCount: 2,
  garageSquareFootage: 400,
  basementSquareFootage: 800,
  basementFinished: false,
  outletQuantity: 40,
  switchQuantity: 20,
  dimmerQuantity: 4,
  recessedLightQuantity: 12,
  recessedLightSize: "4-inch",
  fanQuantity: 2,
  fanSupply: "Contractor supplied",
  panelManufacturer: "Siemens",
  smokeCoQuantity: 0,
  bedroomCount: 3,
  bathroomQuantity: 0,
  kitchenApplianceCircuitQuantity: 4,
  laundryCircuitQuantity: 1,
  exteriorReceptacleQuantity: 2,
  exteriorLightingQuantity: 3,
  garageReceptacleQuantity: 4,
  garageCircuitQuantity: 1,
  servicePanelAllowance: 3500,
  hvacEquipmentCircuitQuantity: 0,
  miniSplitCircuitQuantity: 0,
  commonBranchCircuitQuantity: 12,
  branchCircuitFootage: 900,
  branchCircuitAmperage: 20,
  branchCircuitPoleCount: 1,
  branchCircuitProtectionType: "Standard",
  branchCircuitCableType: "12/2 NM-B",
  equipmentCircuitFootage: 0,
  equipmentCircuitAmperage: 30,
  equipmentCircuitPoleCount: 2,
  equipmentCircuitProtectionType: "Standard",
  equipmentCircuitCableType: "10/2 NM-B",
  crewSize: 2,
  crewHours: 80,
  laborAdjustmentHours: 4,
  laborRateType: "residential",
  notes: "",
};

const newHousePriceBook: PriceBookItem[] = [
  ...priceBook,
  catalogRow(
    "Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",
    1.85,
  ),
  catalogRow(
    "Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393",
    30.28,
  ),
];

test("New House uses editable quantities, footage, allowances, and exact catalog pricing", () => {
  const result = calculateNewHouseEstimate(
    newHouseInputs,
    settings,
    newHousePriceBook,
  );

  assert.equal(
    result.assembly.find((line) => line.id === "new-house-outlets")?.quantity,
    40,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "new-house-switches")?.unitCost,
    1.85,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "new-house-branch-cable")
      ?.quantity,
    16200,
  );
  assert.equal(
    result.assembly.find(
      (line) => line.id === "new-house-service-panel-allowance",
    )?.extendedCost,
    3500,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "new-house-branch-breakers")
      ?.quantity,
    18,
  );
  assert.equal(result.pricing.calculatedSellingPrice > 0, true);
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "NEW_HOUSE_SCOPE_REVIEW",
    ),
    true,
  );
});

test("New House room counts are whole-number inputs and bedroom count does not reprice", () => {
  const validInputs = {
    ...newHouseInputs,
    bedroomCount: 4,
    bathroomQuantity: 2,
  };
  assert.equal(
    PreviewQuoteBody.safeParse({ module: "NEW_HOUSE", jobInputs: validInputs }).success,
    true,
  );
  assert.equal(
    CreateQuoteBody.safeParse({
      customerName: "Room count validation",
      projectName: "New House room counts",
      module: "NEW_HOUSE",
      jobInputs: validInputs,
      proposalDescription: "Validate informational room counts.",
    }).success,
    true,
  );
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "NEW_HOUSE",
      jobInputs: { ...validInputs, bedroomCount: 2.5 },
    }).success,
    false,
  );
  assert.equal(
    PreviewQuoteBody.safeParse({
      module: "NEW_HOUSE",
      jobInputs: { ...validInputs, bathroomQuantity: 1.5 },
    }).success,
    false,
  );

  const withoutBedroom = calculateNewHouseEstimate(
    { ...validInputs, bedroomCount: 0 },
    settings,
    newHousePriceBook,
  );
  const withBedroom = calculateNewHouseEstimate(
    validInputs,
    settings,
    newHousePriceBook,
  );
  assert.deepEqual(withBedroom.assembly, withoutBedroom.assembly);
  assert.deepEqual(withBedroom.pricing, withoutBedroom.pricing);
});

test("New House characteristics scale calculated task labor without creating a flat square-foot price", () => {
  const smaller = calculateNewHouseEstimate(
    {
      ...newHouseInputs,
      finishedSquareFootage: 1200,
      floorCount: 1,
      garageSquareFootage: 0,
      basementSquareFootage: 0,
      crewSize: 1,
      crewHours: 0,
      laborAdjustmentHours: 0,
    },
    settings,
    newHousePriceBook,
  );
  const larger = calculateNewHouseEstimate(
    {
      ...newHouseInputs,
      finishedSquareFootage: 3000,
      floorCount: 3,
      basementFinished: true,
      crewSize: 1,
      crewHours: 0,
      laborAdjustmentHours: 0,
    },
    settings,
    newHousePriceBook,
  );

  assert.equal(larger.pricing.laborCost > smaller.pricing.laborCost, true);
  assert.equal(
    larger.assembly.find(
      (line) => line.id === "new-house-service-panel-allowance",
    )?.extendedCost,
    smaller.assembly.find(
      (line) => line.id === "new-house-service-panel-allowance",
    )?.extendedCost,
  );
});

test("New House preserves unresolved material warnings and excludes owner-supplied fixture cost", () => {
  const result = calculateNewHouseEstimate(
    {
      ...newHouseInputs,
      fanSupply: "Customer supplied",
      smokeCoQuantity: 4,
      branchCircuitFootage: 0,
    },
    settings,
    newHousePriceBook,
  );

  assert.equal(
    result.assembly.find((line) => line.id === "new-house-fans")?.unitCost,
    0,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "PRICE_BOOK_ITEM_UNRESOLVED" &&
        warning.context.itemKey === "standard smoke/CO detector",
    ),
    true,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.message.includes("branch circuit footage is zero"),
    ),
    true,
  );
});

test("New House refuses to price under-ampacity circuit cable selections", () => {
  const result = calculateNewHouseEstimate(
    {
      ...newHouseInputs,
      branchCircuitAmperage: 20,
      branchCircuitCableType: "14/2 NM-B",
      hvacEquipmentCircuitQuantity: 1,
      equipmentCircuitAmperage: 30,
      equipmentCircuitCableType: "12/2 NM-B",
    },
    settings,
    newHousePriceBook,
  );

  assert.equal(
    result.assembly.some((line) => line.id === "new-house-branch-cable"),
    false,
  );
  assert.equal(
    result.assembly.some((line) => line.id === "new-house-equipment-cable"),
    false,
  );
  assert.ok(
    result.pricing.pricingWarnings.filter(
      (warning) =>
        typeof warning !== "string" &&
        warning.severity === "error" &&
        warning.message.includes("incompatible"),
    ).length >= 1,
  );
});

test("New House compatibility remains blocking when selected circuit footage is zero", () => {
  const result = calculateNewHouseEstimate(
    {
      ...newHouseInputs,
      branchCircuitAmperage: 20,
      branchCircuitCableType: "14/2 NM-B",
      branchCircuitFootage: 0,
      hvacEquipmentCircuitQuantity: 1,
      equipmentCircuitAmperage: 30,
      equipmentCircuitCableType: "12/2 NM-B",
      equipmentCircuitFootage: 0,
    },
    settings,
    newHousePriceBook,
  );

  assert.equal(
    result.pricing.pricingWarnings.filter(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "NEW_HOUSE_COMPATIBILITY_REVIEW" &&
        warning.severity === "error",
    ).length,
    2,
  );
});

test("New House never substitutes exhaust fans for ceiling fans or omits exterior-lighting materials", () => {
  const result = calculateNewHouseEstimate(
    {
      ...newHouseInputs,
      fanSupply: "Contractor supplied",
      fanMaterialUnitCostOverride: undefined,
      fanQuantity: 2,
      exteriorLightingQuantity: 3,
    },
    settings,
    newHousePriceBook,
  );

  assert.equal(
    result.assembly.find((line) => line.id === "new-house-fans")?.unitCost,
    0,
  );
  assert.equal(
    result.assembly.find((line) => line.id === "new-house-exterior-lighting")
      ?.unitCost,
    0,
  );
  assert.equal(
    result.assembly.some(
      (line) =>
        line.id === "new-house-fans" &&
        line.source.includes("Panasonic"),
    ),
    false,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "PRICE_BOOK_ITEM_UNRESOLVED" &&
        warning.context.itemKey === "standard ceiling fan",
    ),
    true,
  );
  assert.equal(
    result.pricing.pricingWarnings.some(
      (warning) =>
        typeof warning !== "string" &&
        warning.code === "PRICE_BOOK_ITEM_UNRESOLVED" &&
        warning.context.itemKey === "standard exterior light fixture",
    ),
    true,
  );
});