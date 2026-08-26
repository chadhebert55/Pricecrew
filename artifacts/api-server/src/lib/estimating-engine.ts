import type {
  AssemblyLineRecord,
  BathroomInputRecord,
  EvChargerInputRecord,
  KitchenInputRecord,
  LaborRateType,
  PricingRecord,
  RecessedLightingInputRecord,
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
  isDefault: boolean;
};

export type EstimatingSettings = {
  residentialLaborSellRate: number;
  commercialLaborSellRate: number;
  loadedLaborCost: number;
  materialMarkup: number;
  targetMargin: number;
};

type EstimateResult = {
  assembly: AssemblyLineRecord[];
  pricing: PricingRecord;
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function catalogSource(item: PriceBookItem) {
  const parts = [
    item.supplier,
    item.supplierSku ? `SKU ${item.supplierSku}` : null,
    item.sourceDate,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "Company price book";
}

function unitCost(
  key: string,
  priceBook: PriceBookItem[],
  pricingWarnings: string[],
): { value: number; source: string } {
  const match = priceBook.find(
    (item) =>
      normalized(item.item) === normalized(key) &&
      !item.isDefault &&
      !normalized(item.item).startsWith("unverified "),
  );
  if (match && Number.isFinite(match.unitCost) && match.unitCost > 0) {
    return { value: match.unitCost, source: catalogSource(match) };
  }

  pricingWarnings.push(
    `No verified price is available for "${key}". This material is unresolved and excluded from material cost until a sourced catalog item is added.`,
  );
  return {
    value: 0,
    source: "Unresolved — no verified catalog price",
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

function protectionType(value: string) {
  if (/dual|afci.*gfci|gfci.*afci/i.test(value)) return "Dual Function";
  if (/afci/i.test(value)) return "AFCI";
  if (/gfci/i.test(value)) return "GFCI";
  return "Standard";
}

type BreakerSelection = {
  manufacturer: string;
  amperage: number;
  poleCount: number;
  protectionType: string;
};

function resolveBreaker(
  selection: BreakerSelection,
  priceBook: PriceBookItem[],
  pricingWarnings: string[],
) {
  const exactProtectionType = protectionType(selection.protectionType);
  const match = priceBook.find(
    (item) =>
      normalized(item.manufacturer ?? "") === normalized(selection.manufacturer) &&
      item.amperage === selection.amperage &&
      item.poleCount === selection.poleCount &&
      normalized(item.protectionType ?? "") === normalized(exactProtectionType) &&
      Number.isFinite(item.unitCost) &&
      item.unitCost > 0,
  );

  if (!match) {
    pricingWarnings.push(
      `Unresolved breaker: no exact ${selection.manufacturer || "selected manufacturer"} ${selection.amperage || "selected amperage"}A ${selection.poleCount || "selected pole count"}-pole ${exactProtectionType} breaker is available in the company price book. No generic breaker cost was substituted.`,
    );
    return {
      value: 0,
      description: `${selection.poleCount || "?"}-pole ${selection.amperage || "?"}A ${exactProtectionType} breaker — unresolved`,
      source: "Unresolved exact breaker — add compatible catalog item",
    };
  }

  const part = match.manufacturerPartNumber
    ? ` ${match.manufacturerPartNumber}`
    : "";
  return {
    value: match.unitCost,
    description: `${selection.poleCount}-pole ${selection.amperage}A ${exactProtectionType} breaker — ${match.manufacturer}${part}`,
    source: catalogSource(match),
  };
}

function selectedLaborRateType(value?: string): LaborRateType {
  return value === "commercial" ? "commercial" : "residential";
}

function finalizeEstimate(
  assembly: AssemblyLineRecord[],
  laborHours: number,
  settings: EstimatingSettings,
  pricingWarnings: string[],
  requestedLaborRateType?: string,
): EstimateResult {
  const laborRateType = selectedLaborRateType(requestedLaborRateType);
  const laborSellRate =
    laborRateType === "commercial"
      ? settings.commercialLaborSellRate
      : settings.residentialLaborSellRate;
  const materialCost = Number(
    assembly.reduce((sum, line) => sum + line.extendedCost, 0).toFixed(2),
  );
  const laborCost = Number((laborHours * settings.loadedLaborCost).toFixed(2));
  const laborSellAmount = Number((laborHours * laborSellRate).toFixed(2));
  const rateBasedSellingPrice =
    materialCost * (1 + settings.materialMarkup) + laborSellAmount;
  const targetMarginPrice =
    settings.targetMargin > 0 && settings.targetMargin < 1
      ? (materialCost + laborCost) / (1 - settings.targetMargin)
      : rateBasedSellingPrice;
  const calculatedSellingPrice = Number(
    Math.max(rateBasedSellingPrice, targetMarginPrice).toFixed(2),
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
      laborSellRate,
      laborSellAmount,
      laborRateType,
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

  const breaker = resolveBreaker({
    manufacturer: inputs.panelManufacturer,
    amperage: circuitAmps,
    poleCount: /single|1[- ]?pole/i.test(inputs.breakerRequirement) ? 1 : 2,
    protectionType: inputs.breakerRequirement,
  }, priceBook, pricingWarnings);
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
      description: "#8/2 SER cable — verify conductor sizing and route",
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
    inputs.laborRateType,
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
    unit = "ea",
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
      unit,
      unitCost: price.value,
      source: price.source,
    });
  };

  const gfciAmperage = inputs.gfciAmperage === 15 ? 15 : 20;
  addPricedItem(
    "gfci-receptacles",
    "Devices",
    gfciAmperage === 15
      ? "Pass & Seymour 1597-TRWRW 15A TR self-test GFCI"
      : "Pass & Seymour 2097-TRWRW 20A TR self-test GFCI",
    `${gfciAmperage}A tamper-resistant self-test GFCI receptacle`,
    inputs.gfciReceptacles,
  );
  addPricedItem(
    "additional-receptacles",
    "Devices",
    "Pass & Seymour 3232-TRW 15A TR duplex receptacle",
    "15A tamper-resistant duplex receptacle downstream of GFCI",
    inputs.additionalReceptacles,
  );
  addPricedItem(
    "vanity-lights",
    "Lighting",
    "Unverified allowance — vanity light",
    "Vanity light allowance — fixture not verified",
    inputs.vanityLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "recessed-lights",
    "Lighting",
    inputs.recessedLightSize === "6-inch"
      ? "Juno 6-inch regressed wafer light"
      : "Juno 4-inch regressed wafer light",
    `${inputs.recessedLightSize === "6-inch" ? "6-inch" : "4-inch"} Juno regressed wafer light`,
    inputs.recessedLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "exhaust-fans",
    "Ventilation",
    "Panasonic FV-0511VF1 exhaust fan",
    "Panasonic FV-0511VF1 exhaust fan with new switch leg",
    inputs.exhaustFans,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "fan-lights",
    "Ventilation",
    "Unverified allowance — fan/light",
    "Combination fan/light allowance — equipment not verified",
    inputs.fanLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "fan-light-heat",
    "Ventilation",
    "Unverified allowance — fan/light/heat",
    "Combination fan/light/heat allowance — equipment not verified",
    inputs.fanLightHeatUnits,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "additional-switches",
    "Devices",
    "Unverified allowance — single-pole switch",
    "Additional switch allowance",
    inputs.additionalSwitches,
  );

  if (inputs.heatedFloorCircuit) {
    addPricedItem(
      "heated-floor",
      "Circuit",
      "Unverified allowance — heated-floor circuit",
      "Dedicated heated-floor circuit allowance — assembly not verified",
      1,
    );
  }

  if (/new/i.test(inputs.circuitOption)) {
    addPricedItem(
      "bathroom-circuit",
      "Circuit",
      "Unverified allowance — bathroom circuit materials",
      "New dedicated bathroom circuit materials allowance",
      1,
    );
    const breaker = resolveBreaker({
      manufacturer: inputs.panelManufacturer ?? "",
      amperage: inputs.breakerAmperage ?? 0,
      poleCount: inputs.breakerPoleCount ?? 0,
      protectionType: inputs.breakerProtectionType ?? "GFCI",
    }, priceBook, pricingWarnings);
    addLine(assembly, {
      id: "bathroom-circuit-protection",
      category: "Protection",
      description: breaker.description,
      quantity: 1,
      unit: "ea",
      unitCost: breaker.value,
      source: breaker.source,
    });
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

  const deviceCount =
    inputs.gfciReceptacles +
    inputs.additionalReceptacles +
    inputs.additionalSwitches +
    inputs.vanityLights +
    inputs.recessedLights +
    inputs.exhaustFans +
    inputs.fanLights +
    inputs.fanLightHeatUnits;
  addPricedItem(
    "bathroom-boxes",
    "Rough-in",
    "Unverified allowance — single-gang box",
    "Bathroom device and fixture box allowance",
    deviceCount,
  );
  addPricedItem(
    "bathroom-plates",
    "Trim",
    "Unverified allowance — device plate",
    "Bathroom device plate allowance",
    inputs.gfciReceptacles +
      inputs.additionalReceptacles +
      inputs.additionalSwitches,
  );
  const routeLength = Math.max(0, Number(inputs.routeLength) || 0);
  if (routeLength > 0) {
    addPricedItem(
      "bathroom-wiring",
      "Conductor",
      `${inputs.cableType ?? "12/2 NM-B"} cable`,
      `Bathroom common-route cable — ${inputs.cableType ?? "12/2 NM-B"}`,
      routeLength,
      false,
      "ft",
    );
  } else {
    pricingWarnings.push(
      "Bathroom route length is unresolved. Add a route length so common wiring material can be priced.",
    );
  }
  pricingWarnings.push(
    "Bathroom box, plate, and wiring quantities are planning allowances and must be verified against the final layout and field conditions.",
  );

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
    routeLength / 30 +
    (/new/i.test(inputs.circuitOption) ? 3 : 0);

  return finalizeEstimate(
    assembly,
    laborHours,
    settings,
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculateKitchenEstimate(
  inputs: KitchenInputRecord,
  settings: EstimatingSettings,
  priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];
  const safeNumber = (value: number | undefined) =>
    Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

  const addPricedItem = (
    id: string,
    category: string,
    key: string,
    description: string,
    quantity: number,
    customerSupplied = false,
    unit = "ea",
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
      unit,
      unitCost: price.value,
      source: price.source,
    });
  };

  const addConfiguredCircuit = ({
    id,
    label,
    footage,
    quantity = 1,
    amperage,
    cableType,
    protection,
    deviceKey,
    deviceDescription,
  }: {
    id: string;
    label: string;
    footage?: number;
    quantity?: number;
    amperage: number;
    cableType: "12/2 NM-B" | "14/2 NM-B";
    protection: string;
    deviceKey?: string;
    deviceDescription?: string;
  }) => {
    const safeQuantity = safeNumber(quantity);
    if (safeQuantity === 0) return;
    const breaker = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer ?? "",
        amperage,
        poleCount: 1,
        protectionType: protection,
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: `${id}-breaker`,
      category: "Protection",
      description: `${label}: ${breaker.description}`,
      quantity: safeQuantity,
      unit: "ea",
      unitCost: breaker.value,
      source: breaker.source,
    });

    if (footage !== undefined) {
      const safeFootage = safeNumber(footage);
      if (safeFootage > 0) {
        const cable = unitCost(`${cableType} cable`, priceBook, pricingWarnings);
        addLine(assembly, {
          id: `${id}-cable`,
          category: "Conductor",
          description: `${label}: ${cableType} cable`,
          quantity: safeFootage,
          unit: "ft",
          unitCost: cable.value,
          source: cable.source,
        });
      } else {
        pricingWarnings.push(
          `${label} is selected, but its configurable cable footage is zero.`,
        );
      }
    }

    if (deviceKey && deviceDescription) {
      addPricedItem(
        `${id}-device`,
        "Devices",
        deviceKey,
        deviceDescription,
        safeQuantity,
      );
    }
  };

  const circuitItems: Array<[keyof KitchenInputRecord, string, string, string]> = [
    ["refrigeratorCircuits", "Unverified allowance — refrigerator circuit materials", "Refrigerator circuit allowance — exact breaker/conductor unresolved", "Circuit"],
    ["dishwasherCircuits", "Unverified allowance — dishwasher circuit materials", "Dishwasher circuit allowance — exact breaker/conductor unresolved", "Circuit"],
    ["disposalCircuits", "Unverified allowance — disposal circuit materials", "Disposal circuit allowance — exact breaker/conductor unresolved", "Circuit"],
    ["gasRangeCircuits", "Unverified allowance — gas range circuit materials", "Gas range circuit allowance — exact breaker/conductor unresolved", "Circuit"],
    ["additionalDedicatedCircuits", "Unverified allowance — additional dedicated circuit materials", "Additional dedicated circuit allowance — exact breaker/conductor unresolved", "Circuit"],
  ];
  for (const [field, key, description, category] of circuitItems) {
    addPricedItem(field, category, key, description, inputs[field] as number);
  }
  if (inputs.electricRangeCircuits > 0) {
    addLine(assembly, {
      id: "electricRangeCircuits",
      category: "Circuit",
      description:
        "Electric range breaker and conductor — unresolved pending appliance specification",
      quantity: inputs.electricRangeCircuits,
      unit: "circuit",
      unitCost: 0,
      source: "Unresolved heavy-appliance assembly — no material substituted",
    });
    pricingWarnings.push(
      "Electric-range breaker and conductor are unresolved and excluded from material cost until a verified heavy-appliance assembly is selected.",
    );
  }

  addPricedItem(
    "countertop-receptacles",
    "Devices",
    "Pass & Seymour 2097-TRWRW 20A TR self-test GFCI",
    "20A tamper-resistant self-test countertop GFCI receptacle",
    inputs.countertopReceptacles,
  );
  addPricedItem(
    "usb-receptacles",
    "Devices",
    "Unverified allowance — USB receptacle",
    "USB receptacle allowance",
    inputs.usbReceptacles,
  );
  addPricedItem(
    "sink-lights",
    "Lighting",
    "Unverified allowance — sink light",
    "Sink light allowance",
    inputs.sinkLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "island-pendants",
    "Lighting",
    "Unverified allowance — island pendant",
    "Island pendant allowance",
    inputs.islandPendants,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "undercabinet-lighting",
    "Lighting",
    "Unverified allowance — undercabinet lighting",
    "Undercabinet lighting allowance",
    inputs.undercabinetLighting,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "recessed-lights",
    "Lighting",
    inputs.recessedLightSize === "6-inch"
      ? "Juno 6-inch regressed wafer light"
      : "Juno 4-inch regressed wafer light",
    `${inputs.recessedLightSize === "6-inch" ? "6-inch" : "4-inch"} Juno regressed wafer light`,
    inputs.recessedLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "three-way-options",
    "Controls",
    "Unverified allowance — 3-way switch pair",
    "3-way switching allowance",
    inputs.threeWayOptions,
  );
  const fourWayLocations = safeNumber(inputs.fourWayLocations);
  addPricedItem(
    "kitchen-four-way-switches",
    "Controls",
    "Legrand radiant TM874WCC10 15A 4-way switch",
    "Kitchen multi-location lighting control — 4-way switch location",
    fourWayLocations,
  );
  addPricedItem(
    "kitchen-four-way-boxes",
    "Rough-in",
    "Carlon B114R-UPC 14 cu. in. single-gang old-work box",
    "Kitchen 4-way switch-location box",
    fourWayLocations,
  );
  addPricedItem(
    "kitchen-four-way-plates",
    "Trim",
    "Legrand radiant RWP26WCC10 1-gang screwless wall plate",
    "Kitchen 4-way switch-location wall plate",
    fourWayLocations,
  );
  if (fourWayLocations > 0) {
    const fourWayCableFootage = safeNumber(inputs.fourWayCableFootage);
    if (fourWayCableFootage > 0) {
      const fourWayCable = unitCost(
        "14/3 NM-B cable",
        priceBook,
        pricingWarnings,
      );
      addLine(assembly, {
        id: "kitchen-four-way-cable",
        category: "Conductor",
        description:
          "14/3 NM-B cable — configurable multi-location lighting-control run",
        quantity: fourWayCableFootage,
        unit: "ft",
        unitCost: fourWayCable.value,
        source: fourWayCable.source,
      });
    } else {
      pricingWarnings.push(
        "One or more 4-way switch locations are selected, but the configurable 14/3 cable footage is zero.",
      );
    }
  }
  addPricedItem(
    "dimmers",
    "Controls",
    "Unverified allowance — dimmer switch",
    "Dimmer switch allowance",
    inputs.dimmers,
  );

  const deviceCount =
    inputs.countertopReceptacles +
    inputs.usbReceptacles +
    inputs.threeWayOptions * 2 +
    inputs.dimmers;
  addPricedItem(
    "kitchen-boxes",
    "Rough-in",
    "Unverified allowance — single-gang box",
    "Kitchen device box allowance",
    deviceCount,
  );
  addPricedItem(
    "kitchen-plates",
    "Trim",
    "Unverified allowance — device plate",
    "Kitchen device plate allowance",
    deviceCount,
  );
  if (inputs.routeLength > 0) {
    addPricedItem(
      "kitchen-wiring",
      "Conductor",
      `${inputs.cableType ?? "12/2 NM-B"} cable`,
      `Kitchen common-route cable — ${inputs.cableType ?? "12/2 NM-B"}`,
      inputs.routeLength,
      false,
      "ft",
    );
  }

  const lightingCount =
    inputs.sinkLights +
    inputs.islandPendants +
    inputs.undercabinetLighting +
    inputs.recessedLights;
  if (inputs.includeLightingCircuit && lightingCount > 0) {
    addConfiguredCircuit({
      id: "kitchen-lighting-circuit",
      label: "Kitchen lighting circuit",
      footage: safeNumber(inputs.lightingCircuitFootage),
      amperage: 15,
      cableType: "14/2 NM-B",
      protection: "Standard",
    });
  }

  const applianceAmperage = Math.max(
    1,
    safeNumber(inputs.applianceCircuitAmperage ?? 20),
  );
  const applianceCable =
    inputs.applianceCircuitCableType === "14/2 NM-B"
      ? "14/2 NM-B"
      : "12/2 NM-B";
  const applianceProtection =
    inputs.applianceCircuitProtectionType ?? "Standard";
  const smallApplianceQuantity =
    inputs.smallApplianceCircuits !== undefined
      ? safeNumber(inputs.smallApplianceCircuits)
      : (inputs.smallApplianceCircuit1 ? 1 : 0) +
        (inputs.smallApplianceCircuit2 ? 1 : 0);
  const microwaveQuantity =
    inputs.microwaveCircuits !== undefined
      ? safeNumber(inputs.microwaveCircuits)
      : inputs.microwaveCircuit
        ? 1
        : 0;
  const selectedApplianceCircuitCount =
    smallApplianceQuantity + microwaveQuantity;
  const usesSharedApplianceHomeRun =
    inputs.applianceHomeRun12_2Length !== undefined;
  const applianceHomeRunLength = safeNumber(
    inputs.applianceHomeRun12_2Length,
  );
  const applianceHomeRunFootage =
    applianceHomeRunLength * selectedApplianceCircuitCount;
  if (inputs.smallApplianceCircuits !== undefined) {
    addConfiguredCircuit({
      id: "kitchen-small-appliance-circuits",
      label: "Small Appliance Circuits",
      quantity: smallApplianceQuantity,
      footage: undefined,
      amperage: applianceAmperage,
      cableType: "12/2 NM-B",
      protection: applianceProtection,
      deviceKey: "Kitchen small-appliance circuit device assumption",
      deviceDescription:
        "Small Appliance Circuits company-configured device assumption",
    });
  } else if (inputs.smallApplianceCircuit1) {
    addConfiguredCircuit({
      id: "kitchen-small-appliance-circuit-1",
      label: "Small-appliance Circuit 1",
      footage: usesSharedApplianceHomeRun
        ? undefined
        : safeNumber(inputs.smallApplianceCircuit1Footage),
      amperage: applianceAmperage,
      cableType: applianceCable,
      protection: applianceProtection,
      deviceKey: "Kitchen small-appliance circuit device assumption",
      deviceDescription:
        "Small-appliance Circuit 1 company-configured device assumption",
    });
  }
  if (inputs.smallApplianceCircuits === undefined && inputs.smallApplianceCircuit2) {
    addConfiguredCircuit({
      id: "kitchen-small-appliance-circuit-2",
      label: "Small-appliance Circuit 2",
      footage: usesSharedApplianceHomeRun
        ? undefined
        : safeNumber(inputs.smallApplianceCircuit2Footage),
      amperage: applianceAmperage,
      cableType: applianceCable,
      protection: applianceProtection,
      deviceKey: "Kitchen small-appliance circuit device assumption",
      deviceDescription:
        "Small-appliance Circuit 2 company-configured device assumption",
    });
  }
  if (inputs.microwaveCircuits !== undefined) {
    addConfiguredCircuit({
      id: "kitchen-microwave-circuits",
      label: "Microwave Circuit",
      quantity: microwaveQuantity,
      footage: undefined,
      amperage: applianceAmperage,
      cableType: "12/2 NM-B",
      protection: applianceProtection,
      deviceKey: "Kitchen microwave circuit device assumption",
      deviceDescription:
        "Microwave Circuit company-configured device assumption",
    });
  } else if (inputs.microwaveCircuit) {
    addConfiguredCircuit({
      id: "kitchen-microwave-circuit",
      label: "Dedicated microwave circuit",
      footage: usesSharedApplianceHomeRun
        ? undefined
        : safeNumber(inputs.microwaveCircuitFootage),
      amperage: applianceAmperage,
      cableType: applianceCable,
      protection: applianceProtection,
      deviceKey: "Kitchen microwave circuit device assumption",
      deviceDescription:
        "Dedicated microwave circuit company-configured device assumption",
    });
  }
  if (usesSharedApplianceHomeRun && selectedApplianceCircuitCount > 0) {
    if (applianceHomeRunFootage > 0) {
      const cable = unitCost(
        "12/2 NM-B cable",
        priceBook,
        pricingWarnings,
      );
      addLine(assembly, {
        id: "kitchen-appliance-home-run-cable",
        category: "Conductor",
        description: `Kitchen appliance-circuit home runs — 12/2 NM-B (${applianceHomeRunLength} ft × ${selectedApplianceCircuitCount} selected circuits = ${applianceHomeRunFootage} ft)`,
        quantity: applianceHomeRunFootage,
        unit: "ft",
        unitCost: cable.value,
        source: cable.source,
      });
    } else {
      pricingWarnings.push(
        "One or more appliance circuits are selected, but Home Run 12/2 Length is zero.",
      );
    }
  }

  if (inputs.routeLength <= 0) {
    pricingWarnings.push(
      "Kitchen route length is unresolved. Add a route length so common wiring material can be priced.",
    );
  }
  if (inputs.electricRangeCircuits > 0 && inputs.gasRangeCircuits > 0) {
    pricingWarnings.push(
      "Both gas and electric range circuits are selected. Confirm the final appliance specification before sending.",
    );
  }
  if (inputs.countertopReceptacles > 0) {
    const breaker = resolveBreaker({
      manufacturer: inputs.panelManufacturer ?? "",
      amperage: inputs.breakerAmperage ?? 0,
      poleCount: inputs.breakerPoleCount ?? 0,
      protectionType: inputs.breakerProtectionType ?? "GFCI",
    }, priceBook, pricingWarnings);
    addLine(assembly, {
      id: "kitchen-countertop-circuit-protection",
      category: "Protection",
      description: breaker.description,
      quantity: 1,
      unit: "ea",
      unitCost: breaker.value,
      source: breaker.source,
    });
    pricingWarnings.push(
      "Countertop receptacle spacing, GFCI protection, and box locations must be field-verified.",
    );
  }
  if (
    inputs.refrigeratorCircuits +
      inputs.dishwasherCircuits +
      inputs.disposalCircuits +
      inputs.gasRangeCircuits +
      inputs.electricRangeCircuits +
      smallApplianceQuantity +
      microwaveQuantity +
      inputs.additionalDedicatedCircuits >
    0
  ) {
    pricingWarnings.push(
      "Appliance circuit prices are unverified planning allowances. Exact breaker, conductor, and equipment requirements remain unresolved until appliance specifications and field conditions are confirmed.",
    );
  }

  const smallApplianceBaseLaborHours =
    inputs.smallApplianceCircuits !== undefined
      ? smallApplianceQuantity * 3
      : (inputs.smallApplianceCircuit1
          ? safeNumber(inputs.smallApplianceCircuit1LaborHours ?? 3)
          : 0) +
        (inputs.smallApplianceCircuit2
          ? safeNumber(inputs.smallApplianceCircuit2LaborHours ?? 3)
          : 0);
  const microwaveBaseLaborHours =
    inputs.microwaveCircuits !== undefined
      ? microwaveQuantity * 3
      : inputs.microwaveCircuit
        ? safeNumber(inputs.microwaveCircuitLaborHours ?? 3)
        : 0;
  const legacyApplianceCableLaborHours =
    inputs.smallApplianceCircuits === undefined &&
    inputs.microwaveCircuits === undefined
      ? (inputs.smallApplianceCircuit1
          ? safeNumber(inputs.smallApplianceCircuit1Footage) / 30
          : 0) +
        (inputs.smallApplianceCircuit2
          ? safeNumber(inputs.smallApplianceCircuit2Footage) / 30
          : 0) +
        (inputs.microwaveCircuit
          ? safeNumber(inputs.microwaveCircuitFootage) / 30
          : 0)
      : 0;
  const laborHours =
    2 +
    inputs.routeLength / 30 +
    inputs.refrigeratorCircuits * 1.5 +
    inputs.dishwasherCircuits * 1.5 +
    inputs.disposalCircuits * 1.25 +
    inputs.gasRangeCircuits * 1.25 +
    inputs.electricRangeCircuits * 2 +
    inputs.countertopReceptacles * 0.6 +
    inputs.sinkLights * 0.8 +
    inputs.islandPendants * 1.1 +
    inputs.undercabinetLighting * 1.2 +
    inputs.recessedLights * 0.9 +
    inputs.threeWayOptions * 0.75 +
    fourWayLocations *
      safeNumber(inputs.fourWayLaborHoursPerLocation ?? 0.75) +
    (fourWayLocations > 0 ? safeNumber(inputs.fourWayCableFootage) / 40 : 0) +
    inputs.dimmers * 0.35 +
    inputs.usbReceptacles * 0.45 +
    inputs.additionalDedicatedCircuits * 1.5 +
    (inputs.includeLightingCircuit
      ? safeNumber(inputs.lightingCircuitLaborHours ?? 3) +
        safeNumber(inputs.lightingCircuitFootage) / 30
      : 0) +
    smallApplianceBaseLaborHours +
    microwaveBaseLaborHours +
    (usesSharedApplianceHomeRun
      ? applianceHomeRunFootage / 30
      : legacyApplianceCableLaborHours);

  return finalizeEstimate(
    assembly,
    laborHours,
    settings,
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculateRecessedLightingEstimate(
  inputs: RecessedLightingInputRecord,
  settings: EstimatingSettings,
  priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];
  const safeNumber = (value: number) =>
    Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const roomLength = safeNumber(inputs.roomLength);
  const roomWidth = safeNumber(inputs.roomWidth);
  const fixtureQuantity = Math.max(1, Math.round(safeNumber(inputs.fixtureQuantity)));
  const additionalLights = Math.round(safeNumber(inputs.additionalLights));
  const additionalSwitches = Math.round(safeNumber(inputs.additionalSwitches));
  const wireRunLength = safeNumber(inputs.wireRunLength);
  const wiringAllowanceFeet = safeNumber(inputs.wiringAllowanceFeet);
  const traditionalThreeWayFootage = safeNumber(
    inputs.traditionalThreeWayFootage ?? 0,
  );
  const laborAdjustmentHours = Number.isFinite(Number(inputs.laborAdjustmentHours))
    ? Number(inputs.laborAdjustmentHours)
    : 0;
  const isNewWiring = /new/i.test(inputs.wiringOption);
  const isNewCircuit = /new/i.test(inputs.circuitOption);
  const switchingMethod =
    inputs.switchingMethod ??
    (/3[- ]?way/i.test(inputs.switchType)
      ? "Traditional 3-way"
      : "Single-pole");
  const isTraditionalThreeWay = switchingMethod === "Traditional 3-way";
  const isSmartKit =
    switchingMethod ===
    "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote";
  const fixtureKey =
    inputs.fixtureSize === "6-inch"
      ? "Juno 6-inch regressed wafer light"
      : "Juno 4-inch regressed wafer light";
  const fixtureLabel = inputs.fixtureSize === "6-inch" ? "6-inch" : "4-inch";

  const addPricedItem = (
    id: string,
    category: string,
    key: string,
    description: string,
    quantity: number,
    customerSupplied = false,
    unit = "ea",
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
      unit,
      unitCost: price.value,
      source: price.source,
    });
  };

  addPricedItem(
    "recessed-fixtures",
    "Lighting",
    fixtureKey,
    `${fixtureLabel} Juno regressed wafer fixtures`,
    fixtureQuantity,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "additional-lights",
    "Lighting",
    fixtureKey,
    `Additional ${fixtureLabel} Juno light locations`,
    additionalLights,
    inputs.customerSuppliedFixtures,
  );

  const controlKey = isSmartKit
    ? "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote"
    : isTraditionalThreeWay
      ? "Legrand radiant TM873WCC10 15A 3-way switch"
      : "Legrand radiant TM870WCC10 15A single-pole switch";
  const controlDescription = isSmartKit
    ? "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote — combo pack"
    : isTraditionalThreeWay
      ? "Legrand radiant 15A traditional 3-way switches"
      : "Legrand radiant 15A single-pole switch";
  addPricedItem(
    "switch-controls",
    "Controls",
    controlKey,
    controlDescription,
    isTraditionalThreeWay ? 2 : 1,
    false,
    isSmartKit ? "kit" : "ea",
  );
  addPricedItem(
    "additional-switches",
    "Controls",
    "Unverified allowance — single-pole switch",
    "Additional single-pole switch allowances",
    additionalSwitches,
  );
  if (
    !isSmartKit &&
    /include|yes|selected/i.test(inputs.dimmerSelection)
  ) {
    addPricedItem(
      "dimmer",
      "Controls",
      "Unverified allowance — dimmer switch",
      "Dimming control allowance — final load compatibility to be verified",
      1,
    );
  }

  if (isNewWiring) {
    const selectedCable = inputs.cableType;
    const cableIsAppropriate =
      selectedCable === "14/2 NM-B" || selectedCable === "12/2 NM-B";
    if (!cableIsAppropriate) {
      pricingWarnings.push(
        `Selected ${selectedCable} cable is not a supported branch-circuit cable for this 15A recessed-lighting estimate. Select 14/2 NM-B or 12/2 NM-B; no cable cost was substituted.`,
      );
    } else if (wireRunLength + wiringAllowanceFeet > 0) {
      const cable = unitCost(`${selectedCable} cable`, priceBook, pricingWarnings);
      addLine(assembly, {
        id: "recessed-wiring",
        category: "Conductor",
        description: `${selectedCable} cable — 15A lighting circuit run plus wiring allowance`,
        quantity: Number((wireRunLength + wiringAllowanceFeet).toFixed(2)),
        unit: "ft",
        unitCost: cable.value,
        source: cable.source,
      });
    } else {
      pricingWarnings.push(
        "New wiring is selected but the approximate wire run is zero. Add a run length and/or wiring allowance so cable can be priced.",
      );
    }
  } else {
    pricingWarnings.push(
      "Existing switch leg / lighting box conditions must be opened and field-verified for capacity, grounding, box support, and accessible wiring before installation.",
    );
  }

  if (isTraditionalThreeWay) {
    if (traditionalThreeWayFootage > 0) {
      const travelerCable = unitCost(
        "14/3 NM-B cable",
        priceBook,
        pricingWarnings,
      );
      addLine(assembly, {
        id: "recessed-three-way-traveler",
        category: "Conductor",
        description: "14/3 NM-B cable — traditional 3-way traveler run",
        quantity: Number(traditionalThreeWayFootage.toFixed(2)),
        unit: "ft",
        unitCost: travelerCable.value,
        source: travelerCable.source,
      });
    } else {
      pricingWarnings.push(
        "Traditional 3-way switching is selected, but the dedicated 14/3 NM-B traveler footage is zero. Enter the run footage so it can be priced separately from the main lighting circuit wiring.",
      );
    }
  }

  if (isSmartKit) {
    pricingWarnings.push(
      "Verify Lutron Diva and Pico compatibility, wireless range, device placement, and existing wiring requirements in the field before the quote is sent.",
    );
  }

  if (isNewCircuit) {
    const breaker = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer,
        amperage: 15,
        poleCount: inputs.breakerPoleCount,
        protectionType: inputs.breakerProtectionType,
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "recessed-circuit-protection",
      category: "Protection",
      description: breaker.description,
      quantity: 1,
      unit: "ea",
      unitCost: breaker.value,
      source: breaker.source,
    });
  } else {
    pricingWarnings.push(
      "Existing circuit capacity, load, overcurrent protection, and required AFCI/GFCI protection must be field-verified before the quote is sent.",
    );
  }

  const suggestedFixtureCount =
    roomLength > 0 && roomWidth > 0
      ? Math.max(1, Math.ceil(roomLength / 8) * Math.ceil(roomWidth / 8))
      : 0;
  if (suggestedFixtureCount > 0) {
    pricingWarnings.push(
      `Planning guidance only: ${suggestedFixtureCount} fixtures at approximately 8 ft grid spacing are suggested for the entered room dimensions. Final spacing, layout, obstructions, and code requirements must be field-verified.`,
    );
  } else {
    pricingWarnings.push(
      "Room dimensions are incomplete. Fixture count and spacing guidance cannot be calculated until both length and width are entered.",
    );
  }
  pricingWarnings.push(
    "Fixture quantity and spacing are planning guidance, not a code-compliance determination. Confirm ceiling layout, joists, ductwork, insulation, fire rating, and switching requirements in the field.",
  );

  const ceilingMultiplier = /vault/i.test(inputs.ceilingHeight)
    ? 1.35
    : /high/i.test(inputs.ceilingHeight)
      ? 1.15
      : 1;
  const accessHours = /limited|blind|between|difficult/i.test(
    inputs.accessDifficulty,
  )
    ? 1.25
    : /attic|open/i.test(inputs.accessDifficulty)
      ? 0
      : 0.5;
  const laborHours =
    (1.25 +
      fixtureQuantity * 0.85 +
      additionalLights * 0.65 +
      (isTraditionalThreeWay ? 1.25 : isSmartKit ? 1 : 0.5) +
      additionalSwitches * 0.45 +
      (!isSmartKit &&
      /include|yes|selected/i.test(inputs.dimmerSelection)
        ? 0.5
        : 0) +
      (isNewWiring ? (wireRunLength + wiringAllowanceFeet) / 40 : 0) +
      (isTraditionalThreeWay ? traditionalThreeWayFootage / 40 : 0) +
      (isNewCircuit ? 2.5 : 0) +
      accessHours +
      laborAdjustmentHours) *
    ceilingMultiplier;

  return finalizeEstimate(
    assembly,
    Math.max(0, laborHours),
    settings,
    pricingWarnings,
    inputs.laborRateType,
  );
}