import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRecessedLightingEstimate,
  type EstimatingSettings,
  type PriceBookItem,
} from "./estimating-engine";
import type { RecessedLightingInputRecord } from "@workspace/db";

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