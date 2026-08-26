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

function cableResult(inputs: RecessedLightingInputRecord) {
  const result = calculateRecessedLightingEstimate(inputs, settings, priceBook);
  return {
    line: result.assembly.find((line) => line.id === "recessed-wiring"),
    warnings: result.pricing.pricingWarnings,
  };
}

test("15A single-pole can price selected 14/2 cable", () => {
  const result = cableResult(baseInputs);
  assert.equal(result.line?.unitCost, 0.37);
});

test("20A single-pole rejects selected 14/2 cable", () => {
  const result = cableResult({
    ...baseInputs,
    breakerAmperage: 20,
  });
  assert.equal(result.line, undefined);
  assert.ok(result.warnings.some((warning) => warning.includes("12/2 NM-B")));
});

test("20A single-pole can price selected 12/2 cable", () => {
  const result = cableResult({
    ...baseInputs,
    breakerAmperage: 20,
    cableType: "12/2 NM-B",
  });
  assert.equal(result.line?.unitCost, 0.56);
});

test("15A 3-way can price selected 14/3 cable", () => {
  const result = cableResult({
    ...baseInputs,
    switchType: "3-way",
    cableType: "14/3 NM-B",
  });
  assert.equal(result.line?.unitCost, 0.53);
});

test("20A 3-way remains unresolved without verified 12/3 cable", () => {
  const result = cableResult({
    ...baseInputs,
    breakerAmperage: 20,
    switchType: "3-way",
    cableType: "14/3 NM-B",
  });
  assert.equal(result.line, undefined);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("verified 12/3 cable row"),
    ),
  );
});

test("unsupported breaker amperage never prices a cable", () => {
  const result = cableResult({
    ...baseInputs,
    breakerAmperage: 30,
    cableType: "12/2 NM-B",
  });
  assert.equal(result.line, undefined);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("supported 15A or 20A lighting circuit"),
    ),
  );
});