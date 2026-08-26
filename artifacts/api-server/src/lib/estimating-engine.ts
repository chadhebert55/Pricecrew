import type {
  AssemblyLineRecord,
  BathroomInputRecord,
  EvChargerInputRecord,
  PricingRecord,
} from "@workspace/db";

export type PriceBookItem = {
  item: string;
  unitCost: number;
  supplier: string | null;
  manufacturer: string | null;
  manufacturerPartNumber: string | null;
  supplierSku: string | null;
  sourceDate: string | null;
  amperage: number | null;
  poleCount: number | null;
  protectionType: string | null;
};

export type EstimatingSettings = {
  laborRate: number;
  materialMarkup: number;
  targetMargin: number;
};

type EstimateResult = {
  assembly: AssemblyLineRecord[];
  pricing: PricingRecord;
};

const starterCosts: Record<string, number> = {
  "#8 copper THHN": 2.4,
  "#10 copper grounding conductor": 1.1,
  "#8/2 SER cable": 3.85,
  "1 in. EMT with fittings": 5.25,
  "1 in. PVC with fittings": 4.2,
  "NEMA 14-50 receptacle": 38,
  "NEMA 6-50 receptacle": 34,
  "EV charger": 599,
  "local disconnect": 80,
  "load management device": 550,
  "whole-home surge protection": 85,
  "panel modification allowance": 250,
  "permit allowance": 125,
  "GFCI receptacle": 24,
  "standard receptacle": 6,
  "vanity light allowance": 95,
  "recessed light": 38,
  "exhaust fan": 145,
  "fan/light": 210,
  "fan/light/heat": 360,
  "heated floor circuit allowance": 195,
  "single-pole switch": 9,
  "bathroom circuit materials": 135,
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unitCost(
  key: string,
  priceBook: PriceBookItem[],
  pricingWarnings: string[],
): { value: number; source: string } {
  const match = priceBook.find(
    (item) => normalized(item.item) === normalized(key),
  );
  if (match && Number.isFinite(match.unitCost) && match.unitCost > 0) {
    return { value: match.unitCost, source: "Company price book" };
  }

  const starterCost = starterCosts[key];
  if (starterCost !== undefined) {
    pricingWarnings.push(
      `Pricing for "${key}" is not available in the company price book; the starter value was used. Confirm the cost before sending.`,
    );
    return {
      value: starterCost,
      source: "Default starter value — confirm before sending",
    };
  }

  pricingWarnings.push(
    `No price is available for "${key}". This material is currently excluded from the estimate until a cost is added.`,
  );
  return {
    value: 0,
    source: "Missing price — add to company price book",
  };
}

function addLine(
  assembly: AssemblyLineRecord[],
  line: Omit<AssemblyLineRecord, "extendedCost">,
) {
  assembly.push({
    ...line,
    extendedCost: Number((line.quantity * line.unitCost).toFixed(3)),
  });
}

function resolveBreaker(
  inputs: EvChargerInputRecord,
  circuitAmps: number,
  priceBook: PriceBookItem[],
  pricingWarnings: string[],
) {
  const poleCount = /single|1[- ]?pole/i.test(inputs.breakerRequirement) ? 1 : 2;
  const protectionType = /gfci/i.test(inputs.breakerRequirement)
    ? "GFCI"
    : "Standard";
  const match = priceBook.find(
    (item) =>
      normalized(item.manufacturer ?? "") === normalized(inputs.panelManufacturer) &&
      item.amperage === circuitAmps &&
      item.poleCount === poleCount &&
      normalized(item.protectionType ?? "") === normalized(protectionType) &&
      Number.isFinite(item.unitCost) &&
      item.unitCost > 0,
  );

  if (!match) {
    pricingWarnings.push(
      `Unresolved breaker: no exact ${inputs.panelManufacturer} ${circuitAmps}A ${poleCount}-pole ${protectionType} breaker is available in the company price book. No generic breaker cost was substituted.`,
    );
    return {
      value: 0,
      description: `${poleCount}-pole ${circuitAmps}A ${protectionType} breaker — unresolved`,
      source: "Unresolved exact breaker — add compatible catalog item",
    };
  }

  const part = match.manufacturerPartNumber
    ? ` ${match.manufacturerPartNumber}`
    : "";
  const sourceParts = [
    match.supplier,
    match.supplierSku ? `SKU ${match.supplierSku}` : null,
    match.sourceDate,
  ].filter(Boolean);

  return {
    value: match.unitCost,
    description: `${poleCount}-pole ${circuitAmps}A ${protectionType} breaker — ${match.manufacturer}${part}`,
    source: sourceParts.length > 0
      ? sourceParts.join(" • ")
      : "Company price book",
  };
}

function finalizeEstimate(
  assembly: AssemblyLineRecord[],
  laborHours: number,
  settings: EstimatingSettings,
  pricingWarnings: string[],
): EstimateResult {
  const materialCost = Number(
    assembly.reduce((sum, line) => sum + line.extendedCost, 0).toFixed(2),
  );
  const laborCost = Number((laborHours * settings.laborRate).toFixed(2));
  const costWithMarkup = materialCost * (1 + settings.materialMarkup) + laborCost;
  const targetMarginPrice =
    settings.targetMargin > 0 && settings.targetMargin < 1
      ? (materialCost + laborCost) / (1 - settings.targetMargin)
      : costWithMarkup;
  const calculatedSellingPrice = Number(
    Math.max(costWithMarkup, targetMarginPrice).toFixed(2),
  );
  const grossProfit = Number(
    (calculatedSellingPrice - materialCost - laborCost).toFixed(2),
  );

  return {
    assembly,
    pricing: {
      materialCost,
      laborCost,
      materialMarkup: settings.materialMarkup,
      calculatedSellingPrice,
      finalSellingPrice: calculatedSellingPrice,
      laborOverride: null,
      sellingPriceOverride: null,
      grossProfit,
      grossMargin:
        calculatedSellingPrice > 0
          ? Number((grossProfit / calculatedSellingPrice).toFixed(4))
          : 0,
      pricingWarnings,
    },
  };
}

export function calculateEvChargerEstimate(
  inputs: EvChargerInputRecord,
  settings: EstimatingSettings,
  priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];
  const quantity = Math.max(1, Number(inputs.chargerQuantity) || 1);
  const routeLength = Math.max(0, Number(inputs.routeLength) || 0);
  const isConduit = /conduit|emt|pvc/i.test(inputs.wiringMethod);
  const isReceptacle = /receptacle|nema/i.test(inputs.connection);
  const circuitAmps = /auto/i.test(inputs.circuitAmps)
    ? 50
    : Number.parseInt(inputs.circuitAmps, 10) || 50;
  const difficultyMultiplier =
    inputs.difficulty === "Extreme" ? 2.2 : inputs.difficulty === "Hard" ? 1.5 : 1;
  const accessHours = /limited|occupied|difficult/i.test(inputs.access) ? 0.75 : 0;

  const breaker = resolveBreaker(
    inputs,
    circuitAmps,
    priceBook,
    pricingWarnings,
  );
  addLine(assembly, {
    id: "breaker",
    category: "Protection",
    description: breaker.description,
    quantity,
    unit: "ea",
    unitCost: breaker.value,
    source: breaker.source,
  });

  if (inputs.chargerSupply === "Contractor Provided") {
    const charger = unitCost("EV charger", priceBook, pricingWarnings);
    addLine(assembly, {
      id: "charger",
      category: "Equipment",
      description: "Level 2 EV charger",
      quantity,
      unit: "ea",
      unitCost: charger.value,
      source: charger.source,
    });
  }

  if (isConduit) {
    const hot = unitCost("#8 copper THHN", priceBook, pricingWarnings);
    const ground = unitCost(
      "#10 copper grounding conductor",
      priceBook,
      pricingWarnings,
    );
    const conduitKey = /pvc/i.test(inputs.wiringMethod)
      ? "1 in. PVC with fittings"
      : "1 in. EMT with fittings";
    const conduit = unitCost(conduitKey, priceBook, pricingWarnings);
    addLine(assembly, {
      id: "hots",
      category: "Conductor",
      description: "#8 copper THHN — two hots",
      quantity: routeLength * 2 * quantity,
      unit: "ft",
      unitCost: hot.value,
      source: hot.source,
    });
    addLine(assembly, {
      id: "ground",
      category: "Conductor",
      description: "#10 copper grounding conductor",
      quantity: routeLength * quantity,
      unit: "ft",
      unitCost: ground.value,
      source: ground.source,
    });
    addLine(assembly, {
      id: "raceway",
      category: "Raceway",
      description: conduitKey,
      quantity: routeLength * quantity,
      unit: "ft",
      unitCost: conduit.value,
      source: conduit.source,
    });
  } else {
    const ser = unitCost("#8/2 SER cable", priceBook, pricingWarnings);
    addLine(assembly, {
      id: "ser",
      category: "Cable",
      description: "#8/2 SER cable — standard 50A starter default",
      quantity: routeLength * quantity,
      unit: "ft",
      unitCost: ser.value,
      source: ser.source,
    });
  }

  if (isReceptacle) {
    const receptacle = unitCost(
      /14-50/i.test(inputs.connection)
        ? "NEMA 14-50 receptacle"
        : "NEMA 6-50 receptacle",
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "receptacle",
      category: "Connection",
      description: inputs.connection,
      quantity,
      unit: "ea",
      unitCost: receptacle.value,
      source: receptacle.source,
    });
  }

  if (inputs.loadManagement !== "None") {
    const item = unitCost(
      "load management device",
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "load-management",
      category: "Controls",
      description: inputs.loadManagement,
      quantity,
      unit: "ea",
      unitCost: item.value,
      source: item.source,
    });
  }

  if (inputs.disconnect !== "Not Required") {
    const item = unitCost("local disconnect", priceBook, pricingWarnings);
    addLine(assembly, {
      id: "disconnect",
      category: "Protection",
      description: "Local disconnect",
      quantity,
      unit: "ea",
      unitCost: item.value,
      source: item.source,
    });
  }

  if (inputs.surgeProtection === "Include") {
    const item = unitCost(
      "whole-home surge protection",
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "surge",
      category: "Protection",
      description: "Whole-home surge protection",
      quantity: 1,
      unit: "ea",
      unitCost: item.value,
      source: item.source,
    });
  }

  if (inputs.panelModifications !== "None") {
    const item = unitCost(
      "panel modification allowance",
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "panel-modification",
      category: "Panel",
      description: inputs.panelModifications,
      quantity: 1,
      unit: "allowance",
      unitCost: item.value,
      source: item.source,
    });
  }

  if (inputs.permit === "Required") {
    const item = unitCost("permit allowance", priceBook, pricingWarnings);
    addLine(assembly, {
      id: "permit",
      category: "Permit",
      description: "Permit allowance",
      quantity: 1,
      unit: "allowance",
      unitCost: item.value,
      source: item.source,
    });
  }

  const baseHours = 2 + routeLength / 30 + quantity * 0.5 + accessHours;
  return finalizeEstimate(
    assembly,
    baseHours * difficultyMultiplier,
    settings,
    pricingWarnings,
  );
}

export function calculateBathroomEstimate(
  inputs: BathroomInputRecord,
  settings: EstimatingSettings,
  priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];

  const addPricedItem = (
    id: string,
    category: string,
    key: string,
    description: string,
    quantity: number,
    customerSupplied = false,
  ) => {
    const safeQuantity = Math.max(0, Number(quantity) || 0);
    if (safeQuantity === 0) return;
    const price = customerSupplied
      ? { value: 0, source: "Customer supplied fixture" }
      : unitCost(key, priceBook, pricingWarnings);
    addLine(assembly, {
      id,
      category,
      description,
      quantity: safeQuantity,
      unit: "ea",
      unitCost: price.value,
      source: price.source,
    });
  };

  addPricedItem(
    "gfci-receptacles",
    "Devices",
    "GFCI receptacle",
    "20A GFCI receptacle",
    inputs.gfciReceptacles,
  );
  addPricedItem(
    "additional-receptacles",
    "Devices",
    "standard receptacle",
    "Additional receptacle downstream of GFCI",
    inputs.additionalReceptacles,
  );
  addPricedItem(
    "vanity-lights",
    "Lighting",
    "vanity light allowance",
    "Vanity light",
    inputs.vanityLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "recessed-lights",
    "Lighting",
    "recessed light",
    "Recessed light",
    inputs.recessedLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "exhaust-fans",
    "Ventilation",
    "exhaust fan",
    "Exhaust fan with new switch leg",
    inputs.exhaustFans,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "fan-lights",
    "Ventilation",
    "fan/light",
    "Combination fan/light",
    inputs.fanLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "fan-light-heat",
    "Ventilation",
    "fan/light/heat",
    "Combination fan/light/heat",
    inputs.fanLightHeatUnits,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "additional-switches",
    "Devices",
    "single-pole switch",
    "Additional switch",
    inputs.additionalSwitches,
  );

  if (inputs.heatedFloorCircuit) {
    addPricedItem(
      "heated-floor",
      "Circuit",
      "heated floor circuit allowance",
      "Dedicated heated-floor circuit allowance",
      1,
    );
  }

  if (/new/i.test(inputs.circuitOption)) {
    addPricedItem(
      "bathroom-circuit",
      "Circuit",
      "bathroom circuit materials",
      "New dedicated bathroom circuit materials",
      1,
    );
  } else {
    pricingWarnings.push(
      "Existing bathroom circuit reuse must be field-verified for capacity and applicable protection requirements before the quote is sent.",
    );
  }

  if (inputs.fanLightHeatUnits > 0 || inputs.heatedFloorCircuit) {
    pricingWarnings.push(
      "Dedicated-circuit and control requirements for heat-producing bathroom equipment must be verified against the selected equipment and field conditions.",
    );
  }

  const laborHours =
    1.5 +
    inputs.gfciReceptacles * 0.75 +
    inputs.additionalReceptacles * 0.55 +
    inputs.vanityLights * 0.8 +
    inputs.recessedLights * 0.9 +
    inputs.exhaustFans * 2.25 +
    inputs.fanLights * 2.5 +
    inputs.fanLightHeatUnits * 3.5 +
    (inputs.heatedFloorCircuit ? 3 : 0) +
    inputs.additionalSwitches * 0.5 +
    (/new/i.test(inputs.circuitOption) ? 3 : 0);

  return finalizeEstimate(assembly, laborHours, settings, pricingWarnings);
}