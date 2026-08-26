import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateKitchenEstimate,
  calculateRecessedLightingEstimate,
  type EstimatingSettings,
  type PriceBookItem,
} from "./estimating-engine";
import type {
  KitchenInputRecord,
  RecessedLightingInputRecord,
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
    "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote",
    85,
    { manufacturer: "Lutron" },
  ),
  catalogRow("Siemens Q115 15A 1-pole standard breaker", 9.5, {
    manufacturer: "Siemens",
    amperage: 15,
    poleCount: 1,
    protectionType: "Standard",
  }),
  catalogRow("Siemens Q120 20A 1-pole standard breaker", 10.5, {
    manufacturer: "Siemens",
    amperage: 20,
    poleCount: 1,
    protectionType: "Standard",
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

test("single-pole uses the 15A branch-circuit cable without traveler materials", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "Single-pole",
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

test("traditional 3-way prices adjustable 14/3 separately from 14/2", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "Traditional 3-way",
      switchType: "3-way",
      traditionalThreeWayFootage: 37,
    },
    settings,
    priceBook,
  );
  const branch = result.assembly.find((line) => line.id === "recessed-wiring");
  const traveler = result.assembly.find(
    (line) => line.id === "recessed-three-way-traveler",
  );
  assert.equal(branch?.description.includes("14/2 NM-B"), true);
  assert.equal(branch?.quantity, 50);
  assert.equal(branch?.unitCost, 0.37);
  assert.equal(traveler?.quantity, 37);
  assert.equal(traveler?.unitCost, 0.53);
  assert.equal(
    result.assembly.find(
      (line) => line.id === "recessed-circuit-protection",
    ),
    undefined,
  );
});

test("Diva and Pico switching uses one combo kit and no traveler cable", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod:
        "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote",
      traditionalThreeWayFootage: 50,
      dimmerSelection: "Include dimmer",
    },
    settings,
    priceBook,
  );
  const controls = result.assembly.find(
    (line) => line.id === "switch-controls",
  );
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

test("an explicitly selected new lighting circuit adds one 15A breaker only", () => {
  const result = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      circuitOption: "New dedicated circuit",
      switchingMethod: "Traditional 3-way",
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
  assert.equal(breakers[0]?.description.includes("15A"), true);
});

test("contractor-edited traveler and combo-kit costs flow into estimates", () => {
  const editedPriceBook = priceBook.map((row) =>
    row.item === "14/3 NM-B cable"
      ? { ...row, unitCost: 0.71 }
      : row.item ===
          "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote"
        ? { ...row, unitCost: 99 }
        : row,
  );
  const traditional = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod: "Traditional 3-way",
      switchType: "3-way",
      traditionalThreeWayFootage: 20,
    },
    settings,
    editedPriceBook,
  );
  const smart = calculateRecessedLightingEstimate(
    {
      ...baseInputs,
      switchingMethod:
        "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote",
    },
    settings,
    editedPriceBook,
  );
  assert.equal(
    traditional.assembly.find(
      (line) => line.id === "recessed-three-way-traveler",
    )?.unitCost,
    0.71,
  );
  assert.equal(
    smart.assembly.find((line) => line.id === "switch-controls")?.unitCost,
    99,
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