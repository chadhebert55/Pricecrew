import type {
  AdditionCircuitEntry,
  AdditionInputRecord,
  AssemblyLineRecord,
  BathroomInputRecord,
  CustomInputRecord,
  EvChargerInputRecord,
  KitchenInputRecord,
  LaborRateType,
  NewHouseInputRecord,
  PanelReplacementInputRecord,
  PricingRecord,
  PricingWarningCategory,
  PricingWarningContext,
  PricingWarningRecord,
  PricingWarningSeverity,
  RecessedLightingInputRecord,
  ServiceCallInputRecord,
  ServiceUpgradeInputRecord,
  TimeMaterialsInputRecord,
} from "@workspace/db";

const JUNO_WF4_VERIFIED = "Juno WF4DREGSMAL 4-inch regressed wafer light";
const JUNO_WF6_VERIFIED = "Juno WF6-DREG 6-inch regressed wafer light";
export type PriceBookItem = {
  id?: number;
  category: string;
  item: string;
  unitCost: number;
  supplier: string | null;
  manufacturer: string | null;
  manufacturerPartNumber: string | null;
  supplierSku: string | null;
  upc: string | null;
  sourceDate: string | null;
  amperage: number | null;
  poleCount: number | null;
  protectionType: string | null;
  isDefault: boolean;
};

export type PriceBookAudit = {
  builders: string[];
  activeSelection: boolean;
  isUnresolved: boolean;
  auditMessage: string | null;
};

export type EstimatingSettings = {
  residentialLaborSellRate: number;
  commercialLaborSellRate: number;
  loadedLaborCost: number;
  materialMarkup: number;
  targetMargin: number;
  evDefaultCableType?: string;
  newHouseCrewSize?: number;
  newHouseHoursPerPerson?: number;
  newHouseLaborAdjustmentHours?: number;
};

const compatibleNmBCablesByAmperage: Record<number, readonly string[]> = {
  15: ["12/2 NM-B", "14/2 NM-B", "14/3 NM-B"],
  20: ["12/2 NM-B"],
  30: ["10/2 NM-B", "10/3 NM-B"],
  40: ["8/2 NM-B", "8/3 NM-B"],
};

function compatibleNmBCables(amperage: number) {
  return compatibleNmBCablesByAmperage[amperage];
}

function isCompatibleNmBCable(amperage: number, cableType: string) {
  return compatibleNmBCables(amperage)?.includes(cableType) ?? false;
}

type EstimateResult = {
  assembly: AssemblyLineRecord[];
  pricing: PricingRecord;
};

type WarningMetadata = {
  code: string;
  severity: PricingWarningSeverity;
  category: PricingWarningCategory;
  source: string;
  context: PricingWarningContext;
};

function stableWarningCode(message: string) {
  const template = message
    .replace(/"[^"]+"/g, '"value"')
    .replace(/\b\d+(?:\.\d+)?\b/g, "#")
    .toUpperCase();
  let hash = 2166136261;
  for (let index = 0; index < template.length; index += 1) {
    hash ^= template.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ESTIMATE_WARNING_${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function warningMetadata(message: string): WarningMetadata {
  if (message.startsWith("Duplicate Price Book matches found")) {
    const count = Number(message.match(/\((\d+) active compatible/)?.[1]);
    return {
      code: "DUPLICATE_PRICE_BOOK_MATCHES",
      severity: "error",
      category: "missing-price",
      source: "price-book",
      context: {
        itemKey: message.match(/for "([^"]+)"/)?.[1] ?? null,
        matchCount: Number.isFinite(count) ? count : null,
        rule: "clean up or disambiguate duplicate active catalog rows",
      },
    };
  }
  if (message.startsWith("New House")) {
    const isCompatibilityError = message.includes("incompatible");
    const isMissingPrice =
      message.includes("unresolved") || message.includes("zero cost");
    return {
      code: isCompatibilityError
        ? "NEW_HOUSE_COMPATIBILITY_REVIEW"
        : isMissingPrice
          ? "NEW_HOUSE_PRICE_REVIEW"
          : "NEW_HOUSE_SCOPE_REVIEW",
      severity: isCompatibilityError || isMissingPrice ? "error" : "warning",
      category: isCompatibilityError
        ? "compatibility"
        : isMissingPrice
          ? "missing-price"
          : "planning",
      source: "new-house-builder",
      context: {
        rule: "confirm new-house allowances, supply responsibility, and field conditions",
      },
    };
  }
  if (message.startsWith("Service Call")) {
    return {
      code: "SERVICE_CALL_FIELD_REVIEW",
      severity: "warning",
      category: "field-verification",
      source: "service-call",
      context: {
        rule: "confirm service conditions and final repair scope in the field",
      },
    };
  }
  if (message.startsWith("Time & Materials")) {
    return {
      code: "TIME_MATERIALS_REVIEW",
      severity: "warning",
      category: "planning",
      source: "time-materials",
      context: {
        rule: "confirm actual labor and material usage before invoicing",
      },
    };
  }
  if (message.startsWith("Customer-supplied material")) {
    return {
      code: "CUSTOMER_SUPPLIED_MATERIAL_REVIEW",
      severity: "error",
      category: "missing-price",
      source: "customer-supplied-material",
      context: {
        rule: "confirm the customer-provided material is available and excluded intentionally",
      },
    };
  }
  if (message.startsWith("Active material selection")) {
    return {
      code: "ACTIVE_MATERIAL_ZERO_COST",
      severity: "error",
      category: "missing-price",
      source: "zero-cost-material-guard",
      context: {
        item: message.match(/"([^"]+)"/)?.[1] ?? null,
        rule: "every active material selection requires a verified or explicitly confirmed cost",
      },
    };
  }
  if (message.startsWith("Exact catalog selection")) {
    const match =
      message.match(/"([^"]+)" for (\w+)/) ??
      message.match(/"([^"]+)" is incompatible.* for (\w+)/);
    return {
      code: message.includes("incompatible")
        ? "EXACT_CATALOG_SELECTION_INCOMPATIBLE"
        : "EXACT_CATALOG_SELECTION_UNSUPPORTED",
      severity: "error",
      category: message.includes("incompatible")
        ? "compatibility"
        : "missing-price",
      source: "exact-catalog-selection",
      context: { item: match?.[1] ?? null, group: match?.[2] ?? null },
    };
  }
  if (message.startsWith("No verified price is available")) {
    return {
      code: "PRICE_BOOK_ITEM_UNRESOLVED",
      severity: "error",
      category: "missing-price",
      source: "price-book",
      context: { itemKey: message.match(/"([^"]+)"/)?.[1] ?? null },
    };
  }
  if (message.startsWith("Unresolved breaker:")) {
    const match = message.match(
      /exact (.+?) (\d+|selected amperage)A (\d+|selected pole count)-pole ([^.]+) breaker/,
    );
    return {
      code: "EXACT_BREAKER_UNRESOLVED",
      severity: "error",
      category: "missing-price",
      source: "breaker-resolution",
      context: {
        manufacturer: match?.[1] ?? null,
        amperage: match?.[2] ? Number(match[2]) || null : null,
        poleCount: match?.[3] ? Number(match[3]) || null : null,
        protectionType: match?.[4] ?? null,
      },
    };
  }
  if (message.startsWith("Addition circuit compatibility is unresolved:")) {
    return {
      code: "ADDITION_CIRCUIT_COMPATIBILITY_REVIEW",
      severity: "error",
      category: "compatibility",
      source: "addition-circuit-schedule",
      context: {
        rule: "each Addition circuit requires an explicitly compatible cable",
      },
    };
  }
  if (message.startsWith("Addition subpanel feeder distance")) {
    return {
      code: "ADDITION_SUBPANEL_FEEDER_DISTANCE_REQUIRED",
      severity: "error",
      category: "rule",
      source: "addition-subpanel",
      context: {
        rule: "a selected Addition subpanel requires a positive feeder distance",
      },
    };
  }
  if (message.startsWith("Service Upgrade allowance")) {
    return {
      code: "SERVICE_UPGRADE_ALLOWANCE_REVIEW",
      severity: "warning",
      category: "planning",
      source: "service-upgrade-allowance",
      context: {
        rule: "local permit, inspection, or miscellaneous amount requires confirmation",
      },
    };
  }
  if (message.startsWith("Panel Replacement allowance")) {
    return {
      code: "PANEL_REPLACEMENT_ALLOWANCE_REVIEW",
      severity: "warning",
      category: "planning",
      source: "panel-replacement-allowance",
      context: {
        rule: "local permit, inspection, or miscellaneous amount requires confirmation",
      },
    };
  }
  if (message.includes("Panel Replacement assumptions")) {
    return {
      code: "PANEL_REPLACEMENT_FIELD_REVIEW",
      severity: "warning",
      category: "field-verification",
      source: "panel-replacement-configuration",
      context: {
        rule: "verify existing panel, feeder routing, working clearances, and field conditions",
      },
    };
  }
  if (message.includes("does not meet the selected breaker amperage")) {
    return {
      code: "PANEL_REPLACEMENT_FEEDER_COMPATIBILITY_REVIEW",
      severity: "error",
      category: "compatibility",
      source: "panel-replacement-feeder",
      context: {
        rule: "selected feeder conductor must be explicitly compatible with the selected overcurrent protection",
      },
    };
  }
  if (
    message.includes("service configuration") ||
    message.includes("field conditions")
  ) {
    return {
      code: "SERVICE_UPGRADE_FIELD_REVIEW",
      severity: "warning",
      category: "field-verification",
      source: "service-upgrade-configuration",
      context: {
        rule: "verify utility arrangement, existing service, and field conditions",
      },
    };
  }
  if (message.includes("copper alternative")) {
    return {
      code: "SERVICE_UPGRADE_COPPER_ALTERNATIVE_REVIEW",
      severity: "warning",
      category: "compatibility",
      source: "service-upgrade-conductor",
      context: {
        rule: "confirm the explicitly selected copper service conductor with the company price book",
      },
    };
  }
  if (message.includes("does not match the selected service size")) {
    return {
      code: "SERVICE_UPGRADE_SIZE_COMPATIBILITY_REVIEW",
      severity: "warning",
      category: "compatibility",
      source: "service-upgrade-size",
      context: {
        rule: "confirm service equipment and protection match the selected service size",
      },
    };
  }
  if (
    message.includes("supported branch-circuit cable") ||
    message.includes("No cable cost was substituted")
  ) {
    return {
      code: "UNSUPPORTED_BRANCH_CABLE",
      severity: "error",
      category: "rule",
      source: "conductor-rule",
      context: { rule: "15A branch circuit requires 14/2 NM-B or 12/2 NM-B" },
    };
  }
  if (message.includes("wire run is zero")) {
    return {
      code: "WIRE_RUN_LENGTH_ZERO",
      severity: "warning",
      category: "rule",
      source: "conductor-rule",
      context: {
        rule: "wire run plus wiring allowance must be greater than zero",
      },
    };
  }
  if (
    message.includes("14/3 NM-B traveler footage is zero") ||
    message.includes(
      "contractor-entered 14/3 NM-B footage and wiring allowance are both zero",
    )
  ) {
    return {
      code: "THREE_WAY_TRAVELER_FOOTAGE_ZERO",
      severity: "warning",
      category: "rule",
      source: "switching-rule",
      context: { conductor: "14/3 NM-B", switching: "traditional-3-way" },
    };
  }
  if (message.includes("cable footage is zero")) {
    return {
      code: "CONFIGURABLE_CABLE_FOOTAGE_ZERO",
      severity: "warning",
      category: "rule",
      source: "conductor-rule",
      context: { rule: "selected cable footage must be greater than zero" },
    };
  }
  if (message.includes("home run") && message.includes("zero")) {
    return {
      code: "APPLIANCE_HOME_RUN_LENGTH_ZERO",
      severity: "warning",
      category: "rule",
      source: "circuit-rule",
      context: {
        conductor: "12/2 NM-B",
        rule: "home run length must be greater than zero",
      },
    };
  }
  if (message.includes("route length is unresolved")) {
    return {
      code: "ROUTE_LENGTH_UNRESOLVED",
      severity: "warning",
      category: "rule",
      source: "circuit-rule",
      context: { rule: "route length is required to price common wiring" },
    };
  }
  if (
    message.includes("existing circuit") ||
    message.includes("Existing bathroom circuit")
  ) {
    return {
      code: "EXISTING_CIRCUIT_FIELD_REVIEW",
      severity: "warning",
      category: "field-verification",
      source: "circuit-rule",
      context: {
        rule: "verify existing circuit capacity and protection in the field",
      },
    };
  }
  if (message.includes("Verify Lutron Diva")) {
    return {
      code: "LUTRON_COMPATIBILITY_REVIEW",
      severity: "warning",
      category: "compatibility",
      source: "smart-switching-rule",
      context: { ecosystem: "Lutron Diva/Pico" },
    };
  }
  if (message.includes("planning guidance")) {
    return {
      code: "LIGHTING_SPACING_PLANNING_GUIDANCE",
      severity: "info",
      category: "planning",
      source: "lighting-planning",
      context: {
        rule: "fixture spacing is planning guidance, not code compliance",
      },
    };
  }
  if (message.includes("Room dimensions are incomplete")) {
    return {
      code: "ROOM_DIMENSIONS_INCOMPLETE",
      severity: "warning",
      category: "planning",
      source: "lighting-planning",
      context: { requiredInputs: "room length and width" },
    };
  }
  if (message.includes("Fixture quantity and spacing")) {
    return {
      code: "LIGHTING_LAYOUT_FIELD_REVIEW",
      severity: "warning",
      category: "field-verification",
      source: "lighting-planning",
      context: {
        rule: "verify ceiling layout, obstructions, insulation, and fire rating",
      },
    };
  }
  if (message.includes("Lutron")) {
    return {
      code: "SMART_SWITCHING_FIELD_REVIEW",
      severity: "warning",
      category: "compatibility",
      source: "switching-rule",
      context: { ecosystem: "smart switching" },
    };
  }
  if (message.includes("breaker quantity")) {
    const amperage = message.match(/(15|20)A/)?.[1];
    return {
      code: "BREAKER_QUANTITY_OVERRIDE_REVIEW",
      severity: "warning",
      category: "rule",
      source: "breaker-quantity-rule",
      context: { amperage: amperage ? Number(amperage) : null },
    };
  }
  if (message.includes("not represented by the configurable")) {
    return {
      code: "BREAKER_QUANTITY_UNREPRESENTED",
      severity: "warning",
      category: "rule",
      source: "breaker-quantity-rule",
      context: {
        rule: "selected circuit amperage must be represented by a configured breaker quantity",
      },
    };
  }
  if (message.includes("Electric-range breaker")) {
    return {
      code: "HEAVY_APPLIANCE_ASSEMBLY_UNRESOLVED",
      severity: "warning",
      category: "missing-price",
      source: "appliance-circuit-rule",
      context: { appliance: "electric range" },
    };
  }
  if (message.includes("Both gas and electric range")) {
    return {
      code: "RANGE_TYPE_CONFLICT",
      severity: "warning",
      category: "rule",
      source: "appliance-circuit-rule",
      context: { rule: "confirm final range fuel type" },
    };
  }
  if (message.includes("Countertop receptacle spacing")) {
    return {
      code: "COUNTERTOP_LAYOUT_FIELD_REVIEW",
      severity: "warning",
      category: "field-verification",
      source: "countertop-receptacle-rule",
      context: { rule: "verify spacing, protection, and box locations" },
    };
  }
  if (message.includes("Appliance circuit prices")) {
    return {
      code: "APPLIANCE_ALLOWANCE_REVIEW",
      severity: "warning",
      category: "missing-price",
      source: "appliance-circuit-rule",
      context: {
        rule: "confirm appliance specifications and exact catalog requirements",
      },
    };
  }
  if (message.includes("Dedicated-circuit and control requirements")) {
    return {
      code: "BATHROOM_EQUIPMENT_REQUIREMENT_REVIEW",
      severity: "warning",
      category: "field-verification",
      source: "bathroom-equipment-rule",
      context: {
        rule: "verify heat-producing equipment circuit and control requirements",
      },
    };
  }
  if (message.includes("Bathroom box, plate")) {
    return {
      code: "BATHROOM_LAYOUT_ALLOWANCE_REVIEW",
      severity: "warning",
      category: "field-verification",
      source: "bathroom-layout-rule",
      context: {
        rule: "verify box, plate, and wiring quantities against final layout",
      },
    };
  }
  const inferredCategory: PricingWarningCategory =
    /field|verify|verified/i.test(message)
      ? "field-verification"
      : /allowance|planning/i.test(message)
        ? "planning"
        : "rule";
  return {
    code: stableWarningCode(message),
    severity: "warning",
    category: inferredCategory,
    source: "estimating-engine",
    context: {
      ruleTemplate: message
        .replace(/"[^"]+"/g, '"value"')
        .replace(/\b\d+(?:\.\d+)?\b/g, "#"),
    },
  };
}

export function normalizePricingWarnings(
  warnings: Array<PricingWarningRecord | string> | null | undefined,
): PricingWarningRecord[] {
  return (warnings ?? []).map((warning) => {
    if (typeof warning !== "string") {
      return {
        ...warning,
        context: warning.context ?? {},
      };
    }
    return {
      ...warningMetadata(warning),
      message: warning,
    };
  });
}

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type PriceBookMatch =
  | { status: "none"; candidates: [] }
  | { status: "unique"; candidates: [PriceBookItem]; match: PriceBookItem }
  | { status: "ambiguous"; candidates: PriceBookItem[] };

function resolvePriceBookMatch(
  priceBook: PriceBookItem[],
  predicate: (item: PriceBookItem) => boolean,
): PriceBookMatch {
  const candidates = priceBook.filter(predicate);
  if (candidates.length === 0) {
    return { status: "none", candidates: [] };
  }
  if (candidates.length === 1) {
    return {
      status: "unique",
      candidates: [candidates[0]!],
      match: candidates[0]!,
    };
  }
  return { status: "ambiguous", candidates };
}

function duplicatePriceBookWarning(identity: string, matchCount: number) {
  return `Duplicate Price Book matches found for "${identity}" (${matchCount} active compatible catalog rows). No price was selected. Clean up or disambiguate the company Price Book before sending this quote.`;
}

const BUILDER_NAMES = [
  "EV Charger",
  "Bathroom",
  "Kitchen",
  "Addition",
  "Recessed Lighting",
  "Service Upgrade",
  "Panel Replacement",
  "New House",
] as const;

const EXACT_SELECTOR_SKU_BUILDERS: Record<
  string,
  Array<(typeof BUILDER_NAMES)[number]>
> = {
  "304898": ["Service Upgrade"],
  "132873": ["Service Upgrade"],
  "1552599": ["Service Upgrade"],
  "79511": ["Service Upgrade", "Panel Replacement"],
  "8891": ["Service Upgrade", "Panel Replacement"],
  "512902": ["Service Upgrade"],
  "15350": ["Service Upgrade"],
  "152755": ["Service Upgrade"],
  "26750": ["Service Upgrade"],
  "25807": ["Service Upgrade"],
  "18745": ["Service Upgrade"],
  "26466": ["Service Upgrade", "Panel Replacement"],
  "28551": ["Service Upgrade"],
  "79651": ["Service Upgrade"],
  "1266468": ["Service Upgrade"],
  "239663": ["Service Upgrade"],
  "300640": ["Service Upgrade"],
  "17742": ["Service Upgrade", "Panel Replacement"],
  "35113": ["Service Upgrade", "Panel Replacement"],
  "86163": ["Service Upgrade", "Panel Replacement"],
  "160523": ["Service Upgrade", "Panel Replacement"],
  "31589": ["Service Upgrade"],
  "9871": ["Service Upgrade"],
  "30952": ["Service Upgrade"],
  "1009903": ["Service Upgrade"],
  "152609": ["Service Upgrade"],
  "152791": ["Service Upgrade"],
  "32650": ["Service Upgrade", "Panel Replacement"],
  "21719": ["Service Upgrade", "Panel Replacement"],
};

const LEGACY_ITEM_BUILDER_USAGE: Record<
  string,
  Array<(typeof BUILDER_NAMES)[number]>
> = {
  "2 inch pvc mast raceway": ["Service Upgrade"],
  "2 inch pvc weatherhead": ["Service Upgrade"],
  "2 inch pvc expansion coupling": ["Service Upgrade"],
  "2 inch pvc strap": ["Service Upgrade"],
  "2 inch pvc hub": ["Service Upgrade"],
  "2 inch pvc lb": ["Service Upgrade"],
  "2 inch pvc 90": ["Service Upgrade"],
  "2 inch pvc coupling": ["Service Upgrade"],
  "2 inch pvc mast related parts": ["Service Upgrade"],
  "3 4 inch pvc raceway": ["Service Upgrade"],
  "3 4 inch pvc fittings": ["Service Upgrade"],
  "intersystem bonding terminal": ["Service Upgrade"],
  "water meter bonding clamp": ["Service Upgrade"],
  "4 square deep box": ["Service Upgrade"],
  "20a receptacle": ["Service Upgrade"],
  "20a receptacle plate": ["Service Upgrade"],
  "service duct seal": ["Service Upgrade"],
  "pvc primer": ["Service Upgrade"],
  "pvc glue": ["Service Upgrade"],
  "panel replacement feeder raceway": ["Panel Replacement"],
  "panel replacement feeder raceway fittings": ["Panel Replacement"],
  "panel knockout seal": ["Panel Replacement"],
  "4x4x3 4 plywood": ["Service Upgrade", "Panel Replacement"],
  "2x4x8 stud": ["Service Upgrade", "Panel Replacement"],
  "8 solid grounding conductor": ["Service Upgrade", "Panel Replacement"],
  "4 green bonding conductor": ["Service Upgrade", "Panel Replacement"],
  "anti oxidation compound": ["Service Upgrade", "Panel Replacement"],
  "electrical tape": ["Service Upgrade", "Panel Replacement"],
};

function addBuilderIf(
  builders: Set<string>,
  builder: (typeof BUILDER_NAMES)[number],
  condition: boolean,
) {
  if (condition) builders.add(builder);
}

export function auditPriceBookItem(
  item: Pick<
    PriceBookItem,
    "category" | "item" | "unitCost" | "isDefault" | "supplierSku"
  >,
): PriceBookAudit {
  const name = normalized(item.item);
  const category = normalized(item.category);
  const builders = new Set<string>();
  const exactSelectorSku =
    item.supplierSku?.trim() ??
    item.item.match(/(?:SKU|Northeast #)\s*([A-Z0-9-]+)/i)?.[1];
  const exactBuilders =
    EXACT_SELECTOR_SKU_BUILDERS[exactSelectorSku ?? ""] ?? [];
  const legacyBuilders = LEGACY_ITEM_BUILDER_USAGE[name] ?? [];
  for (const builder of exactBuilders) {
    builders.add(builder);
  }
  for (const builder of legacyBuilders) {
    builders.add(builder);
  }

  addBuilderIf(
    builders,
    "EV Charger",
    name.includes("ev charger") ||
      name.includes("load management") ||
      name.includes("local disconnect") ||
      name.includes("nema 14 50") ||
      name.includes("nema 6 50") ||
      name.includes("1 in emt") ||
      name.includes("1 in pvc"),
  );
  addBuilderIf(
    builders,
    "Bathroom",
    name.includes("bathroom") ||
      name.includes("vanity") ||
      name.includes("fan light") ||
      name.includes("heated floor"),
  );
  addBuilderIf(
    builders,
    "Kitchen",
    name.includes("kitchen") ||
      name.includes("refrigerator") ||
      name.includes("dishwasher") ||
      name.includes("disposal") ||
      name.includes("range circuit") ||
      name.includes("countertop") ||
      name.includes("usb receptacle") ||
      name.includes("sink light") ||
      name.includes("island pendant") ||
      name.includes("undercabinet"),
  );
  addBuilderIf(
    builders,
    "Recessed Lighting",
    name.includes("juno") ||
      name.includes("recessed") ||
      name.includes("single pole switch") ||
      name.includes("3 way switch") ||
      name.includes("dimmer") ||
      name.includes("wall plate"),
  );
  addBuilderIf(
    builders,
    "Addition",
    name.includes("addition") ||
      name.includes("subpanel") ||
      name.includes("load center") ||
      name.includes("6 copper ser") ||
      name.includes("1 aluminum ser") ||
      name.includes("ceiling fan") ||
      name.includes("juno") ||
      name.includes("recessed") ||
      name.includes("single pole switch") ||
      name.includes("dimmer"),
  );
  addBuilderIf(
    builders,
    "Service Upgrade",
    name.includes("service") ||
      name.includes("meter") ||
      name.includes("mast") ||
      name.includes("weatherhead") ||
      name.includes("utility") ||
      name.includes("xhhw") ||
      name.includes("aluminum ser") ||
      name.includes("copper service") ||
      name.includes("ground rod") ||
      name.includes("acorn clamp") ||
      name.includes("bonding") ||
      name.includes("duct seal"),
  );
  addBuilderIf(
    builders,
    "Panel Replacement",
    name.includes("panel") ||
      name.includes("feeder") ||
      name.includes("ground bar") ||
      name.includes("ground rod") ||
      name.includes("acorn clamp") ||
      name.includes("bonding") ||
      name.includes("duct seal"),
  );
  addBuilderIf(
    builders,
    "New House",
    name.includes("new house") ||
      name.includes("smoke co") ||
      name.includes("smoke carbon monoxide") ||
      name.includes("subpanel") ||
      name.includes("load center"),
  );

  if (category === "protection" && name.includes("breaker")) {
    if (name.includes("50a") && name.includes("2 pole")) {
      builders.add("EV Charger");
    }
    if (
      (name.includes("15a") || name.includes("20a")) &&
      name.includes("1 pole")
    ) {
      builders.add("Bathroom");
      builders.add("Kitchen");
      builders.add("Addition");
      builders.add("Recessed Lighting");
      builders.add("New House");
    }
    if (
      (name.includes("20a") || name.includes("30a") || name.includes("40a")) &&
      name.includes("2 pole")
    ) {
      builders.add("New House");
    }
    if (
      (name.includes("15a") || name.includes("20a") || name.includes("30a")) &&
      (name.includes("1 pole") || name.includes("2 pole"))
    ) {
      builders.add("Addition");
    }
    if (
      (name.includes("60a") || name.includes("100a")) &&
      name.includes("2 pole")
    ) {
      builders.add("Addition");
    }
    if (
      (name.includes("100a") ||
        name.includes("150a") ||
        name.includes("200a")) &&
      name.includes("2 pole")
    ) {
      builders.add("Service Upgrade");
      builders.add("Panel Replacement");
    }
  }
  if (category === "conductor") {
    if (
      name.includes("12 2 nm b") ||
      name.includes("14 2 nm b") ||
      name.includes("14 3 nm b")
    ) {
      builders.add("Bathroom");
      builders.add("Kitchen");
      builders.add("Addition");
      builders.add("Recessed Lighting");
      builders.add("New House");
    }
    if (name.includes("10 2 nm b") || name.includes("8 2 nm b")) {
      builders.add("New House");
    }
    if (name.includes("10 3 nm b")) {
      builders.add("Addition");
    }
    if (
      name.includes("8 3 nm b") ||
      name.includes("8 2 nm b") ||
      name.includes("6 3 nm b") ||
      name.includes("8 2 ser") ||
      name.includes("8 copper thhn") ||
      name.includes("10 copper grounding")
    ) {
      builders.add("EV Charger");
    }
    if (
      name.includes("xhhw") ||
      name.includes("aluminum ser") ||
      name.includes("copper service conductor")
    ) {
      builders.add("Service Upgrade");
      builders.add("Panel Replacement");
    }
    if (name.includes("6 copper ser") || name.includes("1 aluminum ser")) {
      builders.add("Addition");
    }
  }
  if (
    category === "devices" ||
    category === "controls" ||
    category === "lighting" ||
    category === "ventilation" ||
    category === "rough in" ||
    category === "trim"
  ) {
    if (
      (name.includes("receptacle") && !name.startsWith("20a receptacle")) ||
      name.includes("single gang") ||
      name.includes("device plate") ||
      name.includes("exhaust fan")
    ) {
      builders.add("Bathroom");
      builders.add("Kitchen");
      builders.add("Addition");
      builders.add("New House");
    }
  }
  if (category === "normal stock") {
    addBuilderIf(
      builders,
      "Service Upgrade",
      [
        "plywood",
        "stud",
        "duct seal",
        "primer",
        "cement",
        "anti oxidant",
        "electrical tape",
      ].some((term) => name.includes(term)),
    );
    addBuilderIf(
      builders,
      "Panel Replacement",
      [
        "plywood",
        "stud",
        "filler plate",
        "knockout seal",
        "anti oxidant",
        "electrical tape",
      ].some((term) => name.includes(term)),
    );
  }
  if (category === "grounding") {
    addBuilderIf(
      builders,
      "Service Upgrade",
      [
        "ground bar",
        "ground rod",
        "acorn",
        "rod clamp",
        "grounding conductor",
      ].some((term) => name.includes(term)),
    );
    addBuilderIf(
      builders,
      "Panel Replacement",
      ["ground bar", "ground rod", "grounding conductor"].some((term) =>
        name.includes(term),
      ),
    );
  }
  if (
    category === "raceway" &&
    (name.includes("2 inch") ||
      name.includes("3 4 inch") ||
      name.includes("pvcfit") ||
      name.includes("ocal"))
  ) {
    builders.add("Service Upgrade");
    builders.add("Panel Replacement");
  }
  if (
    name.includes("primer") ||
    name.includes("cement") ||
    name.includes("anti oxidant") ||
    name.includes("electrical tape")
  ) {
    builders.add("Service Upgrade");
  }
  if (name.includes("anti oxidant") || name.includes("electrical tape")) {
    builders.add("Panel Replacement");
  }
  if (name.includes("whole home surge protection")) {
    builders.add("EV Charger");
    builders.add("Service Upgrade");
  }
  if (name.includes("permit allowance")) {
    if (name.includes("service")) builders.add("Service Upgrade");
    if (name.includes("panel")) builders.add("Panel Replacement");
  }

  if (exactBuilders.length > 0 || legacyBuilders.length > 0) {
    builders.clear();
    for (const builder of [...exactBuilders, ...legacyBuilders]) {
      builders.add(builder);
    }
  }
  const isUnresolved =
    !Number.isFinite(item.unitCost) ||
    item.unitCost <= 0 ||
    item.isDefault ||
    name.startsWith("unverified ");
  const builderList = BUILDER_NAMES.filter((builder) => builders.has(builder));
  return {
    builders: builderList,
    activeSelection: builderList.length > 0,
    isUnresolved,
    auditMessage: isUnresolved
      ? `Set a sourced contractor cost before using this selection in ${builderList.join(", ") || "an estimator builder"}.`
      : null,
  };
}

function itemHasTerms(item: PriceBookItem, ...terms: string[]) {
  const name = normalized(item.item);
  return terms.every((term) => name.includes(normalized(term)));
}

function itemInCategory(item: PriceBookItem, category: string) {
  return normalized(item.category) === normalized(category);
}

function catalogSpaceCount(item: PriceBookItem) {
  const match = normalized(item.item).match(/\b(\d+)\s+space\b/);
  return match ? Number(match[1]) : null;
}

function catalogSource(item: PriceBookItem) {
  const parts = [
    item.supplier,
    item.manufacturer,
    item.manufacturerPartNumber ? `MPN ${item.manufacturerPartNumber}` : null,
    item.supplierSku ? `SKU ${item.supplierSku}` : null,
    item.upc ? `UPC ${item.upc}` : null,
    item.sourceDate,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "Company price book";
}

function unitCost(
  key: string,
  priceBook: PriceBookItem[],
  pricingWarnings: string[],
  expectedCategory?: string,
): { value: number; source: string; item?: PriceBookItem } {
  const match = resolvePriceBookMatch(
    priceBook,
    (item) =>
      normalized(item.item) === normalized(key) &&
      (!expectedCategory || itemInCategory(item, expectedCategory)) &&
      !item.isDefault &&
      !normalized(item.item).startsWith("unverified "),
  );
  if (match.status === "ambiguous") {
    pricingWarnings.push(
      duplicatePriceBookWarning(key, match.candidates.length),
    );
    return {
      value: 0,
      source: "Unresolved — duplicate catalog matches",
    };
  }
  if (
    match.status === "unique" &&
    Number.isFinite(match.match.unitCost) &&
    match.match.unitCost > 0
  ) {
    return {
      value: match.match.unitCost,
      source: catalogSource(match.match),
      item: match.match,
    };
  }

  pricingWarnings.push(
    `No verified price is available for "${key}". This material is unresolved and excluded from material cost until a sourced catalog item is added.`,
  );
  return {
    value: 0,
    source: "Unresolved — no verified catalog price",
  };
}

type ExactCatalogPartSelector = keyof NonNullable<
  ServiceUpgradeInputRecord["exactCatalogParts"]
>;

function exactCatalogCost(
  selection: string | undefined,
  selector: ExactCatalogPartSelector,
  priceBook: PriceBookItem[],
  pricingWarnings: string[],
  compatible: (item: PriceBookItem) => boolean = () => true,
) {
  if (!selection?.trim()) return null;
  const selectedSku = selection.match(
    /(?:SKU|Northeast #)\s*([A-Z0-9-]+)/i,
  )?.[1];
  const isSelectable = (item: PriceBookItem) =>
    !item.isDefault && !normalized(item.item).startsWith("unverified ");
  const exactIdentity = (item: PriceBookItem) =>
    normalized(item.item) === normalized(selection) && isSelectable(item);
  const exactCandidates = resolvePriceBookMatch(priceBook, exactIdentity);
  const skuIdentity = (item: PriceBookItem) =>
    Boolean(selectedSku) &&
    normalized(item.supplierSku ?? "") === normalized(selectedSku ?? "") &&
    isSelectable(item);
  const skuCandidates =
    exactCandidates.status === "none" && selectedSku
      ? resolvePriceBookMatch(priceBook, skuIdentity)
      : ({ status: "none", candidates: [] } as const);
  const identity =
    exactCandidates.status !== "none" ? exactIdentity : skuIdentity;
  const identityCandidates =
    exactCandidates.status !== "none" ? exactCandidates : skuCandidates;
  const selected = resolvePriceBookMatch(
    priceBook,
    (item) => identity(item) && compatible(item),
  );

  if (selected.status === "ambiguous") {
    pricingWarnings.push(
      duplicatePriceBookWarning(selection, selected.candidates.length),
    );
    return {
      value: 0,
      source: "Unresolved — duplicate exact catalog matches",
    };
  }
  if (
    selected.status === "none" &&
    identityCandidates.status !== "none"
  ) {
    pricingWarnings.push(
      `Exact catalog selection "${selection}" is incompatible with the selected configuration for ${selector}. No generic catalog row was substituted.`,
    );
    return {
      value: 0,
      source: "Unresolved incompatible exact catalog selection",
    };
  }
  if (
    selected.status !== "unique" ||
    !Number.isFinite(selected.match.unitCost) ||
    selected.match.unitCost <= 0
  ) {
    pricingWarnings.push(
      `Exact catalog selection "${selection}" for ${selector} is unavailable or unpriced. No generic catalog row was substituted.`,
    );
    return { value: 0, source: "Unresolved exact catalog selection" };
  }
  return {
    value: selected.match.unitCost,
    source: catalogSource(selected.match),
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

function protectionType(value: string): string | null {
  const selection = normalized(value);
  if (
    selection.includes("dual function") ||
    (selection.includes("afci") && selection.includes("gfci"))
  ) {
    return "Dual Function";
  }
  if (selection.split(" ").includes("afci")) return "AFCI";
  if (selection.split(" ").includes("gfci")) return "GFCI";
  if (selection === "standard" || selection.endsWith(" standard breaker")) {
    return "Standard";
  }
  return null;
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
  if (!exactProtectionType) {
    pricingWarnings.push(
      `Unresolved breaker: protection type "${selection.protectionType || "not selected"}" is not an exact supported selection. No Standard or generic breaker cost was substituted.`,
    );
    return {
      value: 0,
      description: `${selection.poleCount || "?"}-pole ${selection.amperage || "?"}A ${selection.protectionType || "unselected protection"} breaker — unresolved`,
      source: "Unresolved exact breaker — select supported protection",
    };
  }
  const requiresSiemensQf2 =
    normalized(selection.manufacturer) === "siemens" &&
    selection.poleCount === 2 &&
    exactProtectionType === "GFCI" &&
    [40, 50, 60].includes(selection.amperage);
  const match = resolvePriceBookMatch(
    priceBook,
    (item) =>
      normalized(item.manufacturer ?? "") ===
        normalized(selection.manufacturer) &&
      item.amperage === selection.amperage &&
      item.poleCount === selection.poleCount &&
      normalized(item.protectionType ?? "") ===
        normalized(exactProtectionType) &&
      (!requiresSiemensQf2 ||
        /^(?:ite)?qf(?:240a|250a|260a)$/.test(
          normalized(item.manufacturerPartNumber ?? "").replace(/\s+/g, ""),
        )) &&
      !item.isDefault &&
      !normalized(item.item).startsWith("unverified "),
  );

  const breakerIdentity = `${selection.manufacturer || "selected manufacturer"} ${selection.amperage || "selected amperage"}A ${selection.poleCount || "selected pole count"}-pole ${exactProtectionType} breaker`;
  if (match.status === "ambiguous") {
    pricingWarnings.push(
      duplicatePriceBookWarning(breakerIdentity, match.candidates.length),
    );
    return {
      value: 0,
      description: `${selection.poleCount || "?"}-pole ${selection.amperage || "?"}A ${exactProtectionType} breaker — unresolved duplicate catalog matches`,
      source: "Unresolved duplicate exact breaker matches",
    };
  }

  if (
    match.status !== "unique" ||
    !Number.isFinite(match.match.unitCost) ||
    match.match.unitCost <= 0
  ) {
    pricingWarnings.push(
      `Unresolved breaker: no exact ${selection.manufacturer || "selected manufacturer"} ${selection.amperage || "selected amperage"}A ${selection.poleCount || "selected pole count"}-pole ${exactProtectionType} breaker is available in the company price book. No generic breaker cost was substituted.`,
    );
    return {
      value: 0,
      description: `${selection.poleCount || "?"}-pole ${selection.amperage || "?"}A ${exactProtectionType} breaker — unresolved`,
      source: "Unresolved exact breaker — add compatible catalog item",
    };
  }

  const part = match.match.manufacturerPartNumber
    ? ` ${match.match.manufacturerPartNumber}`
    : "";
  return {
    value: match.match.unitCost,
    description: `${selection.poleCount}-pole ${selection.amperage}A ${exactProtectionType} breaker — ${match.match.manufacturer}${part}`,
    source: catalogSource(match.match),
  };
}

function selectedLaborRateType(value?: string): LaborRateType {
  return value === "commercial" ? "commercial" : "residential";
}

function selectedEvCableType(
  value?: string,
): NonNullable<EvChargerInputRecord["cableType"]> {
  switch (value) {
    case "8/2 NM-B":
    case "6/3 NM-B":
    case "8/2 SER":
      return value;
    default:
      return "8/3 NM-B";
  }
}

function finalizeEstimate(
  assembly: AssemblyLineRecord[],
  laborHours: number,
  settings: EstimatingSettings,
  pricingWarnings: string[],
  requestedLaborRateType?: string,
): EstimateResult {
  const zeroCostMaterialLines = assembly.filter(
    (line) =>
      line.quantity > 0 &&
      line.unitCost <= 0 &&
      !line.intentionalExclusionReason &&
      line.source !== "Included labor scope",
  );
  for (const line of zeroCostMaterialLines) {
    const hasLineWarning = pricingWarnings.some(
      (warning) =>
        warning.includes("No verified price is available") ||
        warning.startsWith("Exact catalog selection") ||
        warning.startsWith("Unresolved breaker:") ||
        warning.includes("No cable cost was substituted") ||
        warning.includes("zero cost") ||
        warning.includes("customer-supplied") ||
        warning.includes("is unresolved"),
    );
    if (!hasLineWarning) {
      pricingWarnings.push(
        `Active material selection "${line.description}" has zero cost and is unresolved. Add a sourced price-book value or confirm the material before sending the quote.`,
      );
    }
  }
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
      pricingWarnings: normalizePricingWarnings(pricingWarnings),
      laborSellRate,
      laborSellAmount,
      laborRateType,
    },
  };
}

function percentage(
  value: number | undefined,
  fallback: number,
  maximum: number,
) {
  return Number.isFinite(Number(value))
    ? Math.min(maximum, Math.max(0, Number(value))) / 100
    : fallback;
}

function configuredEstimateSettings(
  settings: EstimatingSettings,
  inputs: {
    laborRateType?: LaborRateType;
    laborSellRate?: number;
    loadedLaborCost?: number;
    materialMarkup?: number;
    targetMargin?: number;
  },
): EstimatingSettings {
  const selectedType = selectedLaborRateType(inputs.laborRateType);
  const sellRate =
    Number.isFinite(Number(inputs.laborSellRate)) &&
    Number(inputs.laborSellRate) >= 0
      ? Number(inputs.laborSellRate)
      : selectedType === "commercial"
        ? settings.commercialLaborSellRate
        : settings.residentialLaborSellRate;
  return {
    ...settings,
    loadedLaborCost:
      Number.isFinite(Number(inputs.loadedLaborCost)) &&
      Number(inputs.loadedLaborCost) >= 0
        ? Number(inputs.loadedLaborCost)
        : settings.loadedLaborCost,
    residentialLaborSellRate:
      selectedType === "residential"
        ? sellRate
        : settings.residentialLaborSellRate,
    commercialLaborSellRate:
      selectedType === "commercial"
        ? sellRate
        : settings.commercialLaborSellRate,
    materialMarkup: percentage(
      inputs.materialMarkup,
      settings.materialMarkup,
      500,
    ),
    targetMargin: percentage(inputs.targetMargin, settings.targetMargin, 99.99),
  };
}

function addMiscellaneousMaterialLines(
  assembly: AssemblyLineRecord[],
  pricingWarnings: string[],
  lines: Array<{
    id: string;
    description: string;
    cost: number;
    intentionalExclusion?: { confirmed: true; reason: string };
  }>,
  warningPrefix: string,
) {
  lines.forEach((line, index) => {
    const description = line.description.trim();
    const cost = Number.isFinite(Number(line.cost))
      ? Math.max(0, Number(line.cost))
      : 0;
    const exclusionReason =
      line.intentionalExclusion?.confirmed === true
        ? line.intentionalExclusion.reason.trim()
        : "";
    if (!description && cost === 0) return;
    if (!description) {
      pricingWarnings.push(
        `${warningPrefix} material line ${index + 1} has a cost but no description. Confirm the material before sending the quote.`,
      );
    }
    if (cost === 0 && exclusionReason.length < 10) {
      pricingWarnings.push(
        `${warningPrefix} material "${description || `line ${index + 1}`}" has zero cost and must be confirmed before sending the quote.`,
      );
    }
    addLine(assembly, {
      id: `misc-${line.id || index + 1}`,
      category: "Materials",
      description: description || `Miscellaneous material ${index + 1}`,
      quantity: 1,
      unit: "allowance",
      unitCost: cost,
      source: exclusionReason
        ? "Contractor-entered material allowance — intentionally excluded"
        : "Contractor-entered material allowance",
      ...(exclusionReason
        ? { intentionalExclusionReason: exclusionReason }
        : {}),
    });
  });
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
  if (routeLength === 0) {
    pricingWarnings.push(
      "EV route length is zero or invalid. Cable and raceway footage must be confirmed before this estimate is complete.",
    );
  }
  const isConduit = /conduit|emt|pvc/i.test(inputs.wiringMethod);
  const isReceptacle = /receptacle|nema/i.test(inputs.connection);
  const circuitAmps = /auto/i.test(inputs.circuitAmps)
    ? 50
    : Number.parseInt(inputs.circuitAmps, 10) || 50;
  const difficultyMultiplier =
    inputs.difficulty === "Extreme"
      ? 2.2
      : inputs.difficulty === "Hard"
        ? 1.5
        : 1;
  const accessHours = /limited|occupied|difficult/i.test(inputs.access)
    ? 0.75
    : 0;

  const breaker = resolveBreaker(
    {
      manufacturer: inputs.panelManufacturer,
      amperage: circuitAmps,
      poleCount: /single|1[- ]?pole/i.test(inputs.breakerRequirement) ? 1 : 2,
      protectionType: inputs.breakerRequirement,
    },
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
    const cableType =
      inputs.cableType ??
      (/ser cable/i.test(inputs.wiringMethod)
        ? "8/2 SER"
        : selectedEvCableType(settings.evDefaultCableType));
    const isRomex = /romex|nm-b/i.test(inputs.wiringMethod);
    const isSer = /ser cable/i.test(inputs.wiringMethod);
    const isCompatible =
      (isRomex && cableType.endsWith("NM-B")) ||
      (isSer && cableType === "8/2 SER");
    const cable = isCompatible
      ? unitCost(`${cableType} cable`, priceBook, pricingWarnings)
      : {
          value: 0,
          source: "Unresolved — wiring method and cable type are incompatible",
        };
    if (!isCompatible) {
      pricingWarnings.push(
        `EV wiring method "${inputs.wiringMethod}" is not compatible with cable type "${cableType}". No cable price was substituted.`,
      );
    }
    addLine(assembly, {
      id: "cable",
      category: "Cable",
      description: isCompatible
        ? `${cableType} cable — verify conductor sizing and route`
        : `${inputs.wiringMethod} / ${cableType} — unresolved compatibility`,
      quantity: routeLength * quantity,
      unit: "ft",
      unitCost: cable.value,
      source: cable.source,
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
    const item = unitCost("load management device", priceBook, pricingWarnings);
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
  const laborAdjustmentHours = Number.isFinite(
    Number(inputs.laborAdjustmentHours),
  )
    ? Number(inputs.laborAdjustmentHours)
    : 0;
  return finalizeEstimate(
    assembly,
    Math.max(0, baseHours * difficultyMultiplier + laborAdjustmentHours),
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
    unitCostOverride?: number,
  ) => {
    const safeQuantity = Math.max(0, Number(quantity) || 0);
    if (safeQuantity === 0) return;
    const price = customerSupplied
      ? (() => {
          pricingWarnings.push(
            `Customer-supplied material "${description}" has no contractor price. Confirm the customer-provided item is available and intentionally excluded before sending the quote.`,
          );
          return { value: 0, source: "Customer supplied fixture" };
        })()
      : unitCostOverride !== undefined
        ? (() => {
            const override = Number(unitCostOverride);
            if (Number.isFinite(override) && override > 0) {
              return {
                value: override,
                source: "Quote-local material cost override",
              };
            }
            pricingWarnings.push(
              `Active material selection "${description}" has zero cost and is unresolved. Enter a positive quote material cost or clear the override to use the company price book.`,
            );
            return {
              value: 0,
              source: "Unresolved quote-local material cost override",
            };
          })()
        : unitCost(key, priceBook, pricingWarnings);
    addLine(assembly, {
      id,
      category,
      description,
      quantity: safeQuantity,
      unit,
      unitCost: price.value,
      source: price.source,
      ...(customerSupplied
        ? {
            intentionalExclusionReason:
              "Customer is supplying this fixture; contractor material cost is intentionally excluded.",
          }
        : {}),
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
    "Customer-supplied vanity light fixture",
    inputs.vanityLights,
    true,
  );
  addPricedItem(
    "recessed-lights",
    "Lighting",
    inputs.recessedLightSize === "6-inch"
      ? JUNO_WF6_VERIFIED
      : JUNO_WF4_VERIFIED,
    `${inputs.recessedLightSize === "6-inch" ? "6-inch" : "4-inch"} Juno regressed wafer light`,
    inputs.recessedLights,
    false,
  );
  addPricedItem(
    "exhaust-fans",
    "Ventilation",
    "Panasonic FV-0511VF1 exhaust fan",
    "Panasonic FV-0511VF1 exhaust fan with new switch leg",
    inputs.exhaustFans,
    false,
    "ea",
    inputs.exhaustFanMaterialCostOverride,
  );
  addPricedItem(
    "fan-lights",
    "Ventilation",
    "Contractor-supplied bathroom fan/light combination",
    "Panasonic FV-0511VFL bathroom fan/light combination",
    inputs.fanLights,
    false,
    "ea",
    inputs.fanLightMaterialCostOverride,
  );
  addPricedItem(
    "fan-light-heat",
    "Ventilation",
    "Contractor-supplied bathroom fan/light/heat combination",
    "Panasonic FV-0511VHL bathroom fan/light/heat combination",
    inputs.fanLightHeatUnits,
    false,
    "ea",
    inputs.fanLightHeatMaterialCostOverride,
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
    const circuitCableFootage = Number.isFinite(
      Number(inputs.newCircuitCableFootage),
    )
      ? Math.max(0, Number(inputs.newCircuitCableFootage))
      : Math.max(0, Number(inputs.routeLength) || 0);
    addPricedItem(
      "bathroom-15a-circuit-cable",
      "Conductor",
      "14/2 NM-B cable",
      "14/2 NM-B cable for new 15A bathroom circuit",
      circuitCableFootage,
      false,
      "ft",
    );
    addPricedItem(
      "bathroom-15a-circuit-materials",
      "Circuit",
      "Bathroom 15A circuit box and device materials",
      "Normal box, device, connector, and circuit materials for new 15A bathroom circuit",
      inputs.newCircuitMaterialsQuantity ?? 1,
      false,
      "package",
      inputs.newCircuitMaterialsUnitCostOverride,
    );
    const breaker = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer ?? "",
        amperage: 15,
        poleCount: 1,
        protectionType:
          inputs.newCircuitBreakerProtectionType ??
          inputs.breakerProtectionType ??
          "Standard",
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "bathroom-15a-circuit-protection",
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
    (/new/i.test(inputs.circuitOption)
      ? Number.isFinite(Number(inputs.newCircuitLaborHours))
        ? Math.max(0, Number(inputs.newCircuitLaborHours))
        : 3
      : 0) +
    (Number.isFinite(Number(inputs.laborAdjustmentHours))
      ? Number(inputs.laborAdjustmentHours)
      : 0);

  return finalizeEstimate(
    assembly,
    Math.max(0, laborHours),
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
      ? (() => {
          pricingWarnings.push(
            `Customer-supplied material "${description}" has no contractor price. Confirm the customer-provided item is available and intentionally excluded before sending the quote.`,
          );
          return { value: 0, source: "Customer supplied fixture" };
        })()
      : unitCost(key, priceBook, pricingWarnings);
    addLine(assembly, {
      id,
      category,
      description,
      quantity: safeQuantity,
      unit,
      unitCost: price.value,
      source: price.source,
      ...(customerSupplied
        ? {
            intentionalExclusionReason:
              "Customer is supplying this fixture; contractor material cost is intentionally excluded.",
          }
        : {}),
    });
  };

  const usesBreakerSection =
    inputs.breaker15AQuantity !== undefined ||
    inputs.breaker15AProtectionType !== undefined ||
    inputs.breaker20AQuantity !== undefined ||
    inputs.breaker20AProtectionType !== undefined;

  const addConfiguredBreaker = ({
    id,
    label,
    quantity,
    amperage,
    protection,
  }: {
    id: string;
    label: string;
    quantity: number;
    amperage: 15 | 20;
    protection: string;
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
      id,
      category: "Protection",
      description: `${label}: ${breaker.description}`,
      quantity: safeQuantity,
      unit: "ea",
      unitCost: breaker.value,
      source: breaker.source,
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
    includeBreaker = true,
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
    includeBreaker?: boolean;
    deviceKey?: string;
    deviceDescription?: string;
  }) => {
    const safeQuantity = safeNumber(quantity);
    if (safeQuantity === 0) return;
    if (includeBreaker) {
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
    }

    if (footage !== undefined) {
      const safeFootage = safeNumber(footage);
      if (safeFootage > 0) {
        const cable = unitCost(
          `${cableType} cable`,
          priceBook,
          pricingWarnings,
        );
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

  const circuitItems: Array<
    [keyof KitchenInputRecord, string, string, string]
  > = [
    [
      "refrigeratorCircuits",
      "Unverified allowance — refrigerator circuit materials",
      "Refrigerator circuit allowance — exact breaker/conductor unresolved",
      "Circuit",
    ],
    [
      "dishwasherCircuits",
      "Unverified allowance — dishwasher circuit materials",
      "Dishwasher circuit allowance — exact breaker/conductor unresolved",
      "Circuit",
    ],
    [
      "disposalCircuits",
      "Unverified allowance — disposal circuit materials",
      "Disposal circuit allowance — exact breaker/conductor unresolved",
      "Circuit",
    ],
    [
      "gasRangeCircuits",
      "Unverified allowance — gas range circuit materials",
      "Gas range circuit allowance — exact breaker/conductor unresolved",
      "Circuit",
    ],
    [
      "additionalDedicatedCircuits",
      "Unverified allowance — additional dedicated circuit materials",
      "Additional dedicated circuit allowance — exact breaker/conductor unresolved",
      "Circuit",
    ],
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
    "Pass & Seymour 3232-TRW 15A TR duplex receptacle",
    "Decora-style tamper-resistant countertop receptacle",
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
      ? JUNO_WF6_VERIFIED
      : JUNO_WF4_VERIFIED,
    `${inputs.recessedLightSize === "6-inch" ? "6-inch" : "4-inch"} Juno regressed wafer light`,
    inputs.recessedLights,
    inputs.customerSuppliedFixtures,
  );
  addPricedItem(
    "three-way-options",
    "Controls",
    "Pass & Seymour TM873-W 15A 3-way switch — SKU 32128",
    "Pass & Seymour 15A 3-way switches",
    inputs.threeWayOptions * 2,
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
    "Pass & Seymour S1-18-W 1-gang box — SKU 18134",
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
    "Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393",
    "Lutron Diva LED+ dimmer",
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
    "Pass & Seymour S1-18-W 1-gang box — SKU 18134",
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
      protection: inputs.breaker15AProtectionType ?? "Standard",
      includeBreaker: !usesBreakerSection,
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
    (applianceAmperage === 15
      ? inputs.breaker15AProtectionType
      : applianceAmperage === 20
        ? inputs.breaker20AProtectionType
        : undefined) ??
    inputs.applianceCircuitProtectionType ??
    "Standard";
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
  const applianceHomeRunLength = safeNumber(inputs.applianceHomeRun12_2Length);
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
      includeBreaker: !usesBreakerSection,
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
      includeBreaker: !usesBreakerSection,
      deviceKey: "Kitchen small-appliance circuit device assumption",
      deviceDescription:
        "Small-appliance Circuit 1 company-configured device assumption",
    });
  }
  if (
    inputs.smallApplianceCircuits === undefined &&
    inputs.smallApplianceCircuit2
  ) {
    addConfiguredCircuit({
      id: "kitchen-small-appliance-circuit-2",
      label: "Small-appliance Circuit 2",
      footage: usesSharedApplianceHomeRun
        ? undefined
        : safeNumber(inputs.smallApplianceCircuit2Footage),
      amperage: applianceAmperage,
      cableType: applianceCable,
      protection: applianceProtection,
      includeBreaker: !usesBreakerSection,
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
      includeBreaker: !usesBreakerSection,
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
      includeBreaker: !usesBreakerSection,
      deviceKey: "Kitchen microwave circuit device assumption",
      deviceDescription:
        "Dedicated microwave circuit company-configured device assumption",
    });
  }
  if (usesBreakerSection) {
    const automatic15AQuantity =
      (inputs.includeLightingCircuit && lightingCount > 0 ? 1 : 0) +
      (applianceAmperage === 15 ? selectedApplianceCircuitCount : 0);
    const automatic20AQuantity =
      (inputs.countertopReceptacles > 0 ? 1 : 0) +
      (applianceAmperage === 20 ? selectedApplianceCircuitCount : 0);
    const breaker15AQuantity =
      inputs.breaker15AQuantity ?? automatic15AQuantity;
    const breaker20AQuantity =
      inputs.breaker20AQuantity ?? automatic20AQuantity;

    addConfiguredBreaker({
      id: "kitchen-breakers-15a",
      label: "Kitchen 15A breaker selection",
      quantity: breaker15AQuantity,
      amperage: 15,
      protection: inputs.breaker15AProtectionType ?? "Dual Function",
    });
    addConfiguredBreaker({
      id: "kitchen-breakers-20a",
      label: "Kitchen 20A breaker selection",
      quantity: breaker20AQuantity,
      amperage: 20,
      protection: inputs.breaker20AProtectionType ?? "Dual Function",
    });

    if (
      inputs.breaker15AQuantity !== undefined &&
      breaker15AQuantity !== automatic15AQuantity
    ) {
      pricingWarnings.push(
        `The estimator-set 15A breaker quantity (${breaker15AQuantity}) differs from the ${automatic15AQuantity} included 15A circuit(s). Confirm this configurable estimate before sending.`,
      );
    }
    if (
      inputs.breaker20AQuantity !== undefined &&
      breaker20AQuantity !== automatic20AQuantity
    ) {
      pricingWarnings.push(
        `The estimator-set 20A breaker quantity (${breaker20AQuantity}) differs from the ${automatic20AQuantity} included 20A circuit(s). Confirm this configurable estimate before sending.`,
      );
    }
    if (
      selectedApplianceCircuitCount > 0 &&
      applianceAmperage !== 15 &&
      applianceAmperage !== 20
    ) {
      pricingWarnings.push(
        `The selected ${applianceAmperage}A appliance circuits are not represented by the configurable 15A/20A Kitchen breaker quantities.`,
      );
    }
  }

  if (usesSharedApplianceHomeRun && selectedApplianceCircuitCount > 0) {
    if (applianceHomeRunFootage > 0) {
      const cable = unitCost("12/2 NM-B cable", priceBook, pricingWarnings);
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
  if (inputs.countertopReceptacles > 0 && !usesBreakerSection) {
    const breaker = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer ?? "",
        amperage: inputs.breakerAmperage ?? 0,
        poleCount: inputs.breakerPoleCount ?? 0,
        protectionType: inputs.breakerProtectionType ?? "GFCI",
      },
      priceBook,
      pricingWarnings,
    );
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
    fourWayLocations * safeNumber(inputs.fourWayLaborHoursPerLocation ?? 0.75) +
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
      : legacyApplianceCableLaborHours) +
    (Number.isFinite(Number(inputs.laborAdjustmentHours))
      ? Number(inputs.laborAdjustmentHours)
      : 0);

  return finalizeEstimate(
    assembly,
    Math.max(0, laborHours),
    settings,
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculateAdditionEstimate(
  inputs: AdditionInputRecord,
  settings: EstimatingSettings,
  priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];
  const n = (value: number | undefined) =>
    Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const squareFeet =
    inputs.squareFootageOverride === undefined
      ? n(inputs.length) * n(inputs.width)
      : n(inputs.squareFootageOverride);
  if (!squareFeet) {
    pricingWarnings.push(
      "Addition size is incomplete. Enter positive length and width or a positive direct square-foot override before sending the quote.",
    );
  }
  pricingWarnings.push(
    `Addition allowances use ${Number(squareFeet.toFixed(2))} square feet for planning only. Selling price is calculated from the editable scope, materials, and labor rather than a fixed square-foot rate.`,
  );
  const catalogLine = (
    id: string,
    category: string,
    key: string,
    description: string,
    quantity: number,
  ) => {
    if (!n(quantity)) return;
    const price = unitCost(key, priceBook, pricingWarnings);
    addLine(assembly, {
      id,
      category,
      description,
      quantity: n(quantity),
      unit: "ea",
      unitCost: price.value,
      source: price.source,
    });
  };
  catalogLine(
    "addition-receptacles",
    "Devices",
    "Pass & Seymour 3232-TRW 15A TR duplex receptacle",
    "Tamper-resistant receptacles",
    inputs.receptacles,
  );
  catalogLine(
    "addition-switches",
    "Controls",
    "Pass & Seymour TM870-W 15A single-pole switch",
    "Single-pole switches",
    inputs.switches,
  );
  catalogLine(
    "addition-dimmers",
    "Controls",
    "Lutron DVCL-153P-WH Diva LED+ dimmer",
    "LED dimmers",
    inputs.dimmers,
  );
  const size = inputs.recessedLightSize === "6-inch" ? "6-inch" : "4-inch";
  catalogLine(
    "addition-recessed-lights",
    "Lighting",
    size === "6-inch" ? JUNO_WF6_VERIFIED : JUNO_WF4_VERIFIED,
    `${size} recessed lights`,
    inputs.recessedLights,
  );

  const fans = n(inputs.ceilingFans);
  if (fans) {
    let fanPrice = { value: 0, source: "Customer supplied fixture" };
    if (inputs.customerSuppliedFans) {
      pricingWarnings.push(
        'Customer-supplied material "ceiling fan" has no contractor price. Confirm the customer-provided item is available and intentionally excluded before sending the quote.',
      );
    } else if (
      inputs.ceilingFanMaterialCostOverride !== undefined &&
      n(inputs.ceilingFanMaterialCostOverride) > 0
    ) {
      fanPrice = {
        value: n(inputs.ceilingFanMaterialCostOverride),
        source: "Quote-local material cost override",
      };
    } else if (inputs.ceilingFanMaterialCostOverride !== undefined) {
      pricingWarnings.push(
        'Active material selection "contractor-supplied ceiling fan" has zero cost and is unresolved. Enter a positive quote material cost or clear the override to use the company price book.',
      );
      fanPrice.source = "Unresolved quote-local material cost override";
    } else {
      fanPrice = unitCost(
        "Contractor-supplied ceiling fan",
        priceBook,
        pricingWarnings,
      );
    }
    addLine(assembly, {
      id: "addition-ceiling-fans",
      category: "Equipment",
      description: inputs.customerSuppliedFans
        ? "Customer-supplied ceiling fans"
        : "Contractor-supplied ceiling fans",
      quantity: fans,
      unit: "ea",
      unitCost: fanPrice.value,
      source: fanPrice.source,
      ...(inputs.customerSuppliedFans
        ? {
            intentionalExclusionReason:
              "Customer is supplying the ceiling fans; contractor material cost is intentionally excluded.",
          }
        : {}),
    });
  }

  const circuitEntries = Array.isArray(inputs.circuitEntries)
    ? inputs.circuitEntries
    : null;
  const additionCableCompatible = (entry: AdditionCircuitEntry) =>
    isCompatibleNmBCable(entry.amperage, entry.cableType);

  if (circuitEntries) {
    let commonRouteAllocated = false;
    for (const [index, entry] of circuitEntries.entries()) {
      const quantity = n(entry.quantity);
      if (!quantity) continue;
      const commonRouteFootage = commonRouteAllocated
        ? 0
        : n(inputs.routeLength);
      commonRouteAllocated = true;
      const footage = commonRouteFootage + n(inputs.homeRunLength) * quantity;
      const compatible = additionCableCompatible(entry);
      if (!compatible) {
        pricingWarnings.push(
          `Addition circuit compatibility is unresolved: ${entry.cableType} cannot be used for a ${entry.amperage}A circuit. Select 12/2 NM-B for 20A circuits, 10/2 or 10/3 NM-B for 30A circuits, or 12/2/14/2/14/3 NM-B for 15A circuits; no cable cost was substituted.`,
        );
      }
      if (footage) {
        const cable = compatible
          ? unitCost(`${entry.cableType} cable`, priceBook, pricingWarnings)
          : {
              value: 0,
              source:
                "Unresolved — breaker amperage and cable type are incompatible",
            };
        addLine(assembly, {
          id: `addition-circuit-${index + 1}-cable`,
          category: "Conductor",
          description: compatible
            ? `${entry.amperage}A ${entry.poleCount}-pole ${entry.cableType} branch-circuit cable`
            : `${entry.amperage}A ${entry.poleCount}-pole ${entry.cableType} cable — unresolved compatibility`,
          quantity: footage,
          unit: "ft",
          unitCost: cable.value,
          source: cable.source,
        });
      } else {
        pricingWarnings.push(
          `Addition circuit ${entry.amperage}A cable footage is zero. Confirm the common route and per-circuit home-run assumptions.`,
        );
      }
      const breaker = resolveBreaker(
        {
          manufacturer: inputs.panelManufacturer,
          amperage: entry.amperage,
          poleCount: entry.poleCount,
          protectionType: entry.protectionType,
        },
        priceBook,
        pricingWarnings,
      );
      addLine(assembly, {
        id: `addition-circuit-${index + 1}-breaker`,
        category: "Protection",
        description: breaker.description,
        quantity,
        unit: "ea",
        unitCost: breaker.value,
        source: breaker.source,
      });
    }
  } else {
    const circuits = n(inputs.circuitCount);
    const footage = n(inputs.routeLength) + n(inputs.homeRunLength) * circuits;
    const compatible = isCompatibleNmBCable(
      inputs.breakerAmperage,
      inputs.cableType,
    );
    if (footage) {
      if (!compatible) {
        pricingWarnings.push(
          `Addition circuit compatibility is unresolved: ${inputs.cableType} cannot be used for a ${inputs.breakerAmperage}A circuit. Select ${compatibleNmBCables(inputs.breakerAmperage)?.join(" or ") ?? "a supported cable"}; no cable cost was substituted.`,
        );
      }
      const cable = compatible
        ? unitCost(`${inputs.cableType} cable`, priceBook, pricingWarnings)
        : {
            value: 0,
            source:
              "Unresolved — breaker amperage and cable type are incompatible",
          };
      addLine(assembly, {
        id: "addition-cable",
        category: "Conductor",
        description: compatible
          ? `${inputs.cableType} branch-circuit cable`
          : `${inputs.cableType} / ${inputs.breakerAmperage}A circuit — unresolved compatibility`,
        quantity: footage,
        unit: "ft",
        unitCost: cable.value,
        source: cable.source,
      });
    } else if (circuits) {
      pricingWarnings.push(
        "Addition cable footage is zero. Confirm the common route and per-circuit home-run assumptions.",
      );
    }
    if (circuits) {
      const breaker = resolveBreaker(
        {
          manufacturer: inputs.panelManufacturer,
          amperage: inputs.breakerAmperage,
          poleCount: inputs.breakerPoleCount,
          protectionType: inputs.breakerProtectionType,
        },
        priceBook,
        pricingWarnings,
      );
      addLine(assembly, {
        id: "addition-breakers",
        category: "Protection",
        description: breaker.description,
        quantity: circuits,
        unit: "ea",
        unitCost: breaker.value,
        source: breaker.source,
      });
    }
  }

  const subpanelOption = inputs.subpanelOption ?? "No Subpanel";
  if (subpanelOption !== "No Subpanel") {
    const feederDistance = n(inputs.feederDistance);
    const subpanelAmperage = subpanelOption === "60A Subpanel" ? 60 : 100;
    const feederKey =
      subpanelAmperage === 60 ? "#6 copper SER cable" : "#1 aluminum SER cable";
    const feederDescription =
      subpanelAmperage === 60
        ? "#6 copper SER 4-wire feeder"
        : "#1 aluminum SER 4-wire feeder";
    const panelKey = `${subpanelAmperage}A subpanel load center`;

    if (feederDistance <= 0) {
      pricingWarnings.push(
        `Addition subpanel feeder distance is zero. Enter a positive feeder distance for the selected ${subpanelOption} before sending the quote.`,
      );
    }

    const feeder = unitCost(feederKey, priceBook, pricingWarnings, "Conductor");
    addLine(assembly, {
      id: "addition-subpanel-feeder",
      category: "Conductor",
      description: `${feederDescription} with two hots, insulated neutral, and equipment grounding conductor`,
      quantity: feederDistance,
      unit: "ft",
      unitCost: feeder.value,
      source: feeder.source,
    });

    const feederBreaker = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer,
        amperage: subpanelAmperage,
        poleCount: 2,
        protectionType: "Standard",
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "addition-subpanel-feeder-breaker",
      category: "Protection",
      description: feederBreaker.description,
      quantity: 1,
      unit: "ea",
      unitCost: feederBreaker.value,
      source: feederBreaker.source,
    });

    const panel = unitCost(panelKey, priceBook, pricingWarnings, "Panel");
    const panelIdentity = panel.item
      ? [
          panel.item.manufacturer,
          panel.item.manufacturerPartNumber,
        ].filter(Boolean).join(" ")
      : "";
    addLine(assembly, {
      id: "addition-subpanel-load-center",
      category: "Panel",
      description: panelIdentity
        ? `${subpanelAmperage}A subpanel — ${panelIdentity} main-lug load center with isolated neutral and equipment grounding provisions`
        : `${subpanelAmperage}A subpanel load center with isolated neutral and equipment grounding provisions${panel.value > 0 ? "" : " — unresolved"}`,
      quantity: 1,
      unit: "ea",
      unitCost: panel.value,
      source: panel.source,
    });
  }

  const circuits = circuitEntries
    ? circuitEntries.reduce((sum, entry) => sum + n(entry.quantity), 0)
    : n(inputs.circuitCount);
  const taskHours =
    n(inputs.receptacles) * 0.45 +
    n(inputs.switches) * 0.4 +
    n(inputs.dimmers) * 0.5 +
    n(inputs.recessedLights) +
    fans * 1.75 +
    circuits * 2.5;
  const adjustment = Number.isFinite(Number(inputs.laborAdjustmentHours))
    ? Number(inputs.laborAdjustmentHours)
    : 0;
  return finalizeEstimate(
    assembly,
    Math.max(
      0,
      taskHours +
        Math.max(1, n(inputs.crewSize)) * n(inputs.crewHours) +
        adjustment,
    ),
    settings,
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculateServiceUpgradeEstimate(
  inputs: ServiceUpgradeInputRecord,
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
    unit = "ea",
  ) => {
    const safeQuantity = safeNumber(quantity);
    if (safeQuantity === 0) return;
    const price = unitCost(key, priceBook, pricingWarnings);
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
  const addExactOrLegacy = (
    id: string,
    category: string,
    selector: ExactCatalogPartSelector,
    legacyKey: string,
    description: string,
    quantity: number,
    unit = "ea",
    compatible?: (item: PriceBookItem) => boolean,
  ) => {
    const safeQuantity = safeNumber(quantity);
    if (safeQuantity === 0) return;
    const price =
      exactCatalogCost(
        inputs.exactCatalogParts?.[selector],
        selector,
        priceBook,
        pricingWarnings,
        compatible,
      ) ?? unitCost(legacyKey, priceBook, pricingWarnings);
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

  const addAllowance = (
    id: string,
    label: string,
    key: string,
    amount: number,
  ) => {
    const enteredAmount = safeNumber(amount);
    const price =
      enteredAmount > 0
        ? {
            value: enteredAmount,
            source: "Contractor-entered configurable allowance",
          }
        : unitCost(key, priceBook, pricingWarnings);
    if (price.value === 0) {
      pricingWarnings.push(
        `Service Upgrade allowance "${label}" is unresolved until a local amount is entered or a company price-book value is configured.`,
      );
    }
    addLine(assembly, {
      id,
      category: "Allowance",
      description: `${label} — configurable allowance`,
      quantity: 1,
      unit: "allowance",
      unitCost: price.value,
      source: price.source,
    });
  };

  const serviceAmperage = Number.parseInt(inputs.serviceSize, 10);
  const breakerAmperage = Math.max(1, Number(inputs.breakerAmperage) || 1);
  const breakerPoleCount = Math.max(1, Number(inputs.breakerPoleCount) || 1);
  const selectedMeterEquipment = normalized(
    inputs.exactCatalogParts?.meterDisconnect ??
      inputs.meterDisconnectEquipment,
  );
  const meterMainIncludesMainBreaker =
    inputs.serviceDisconnect === "Meter-main combination" &&
    selectedMeterEquipment.includes("meter main") &&
    breakerAmperage === serviceAmperage &&
    breakerPoleCount === 2 &&
    normalized(inputs.breakerProtectionType) === "standard";

  if (!meterMainIncludesMainBreaker) {
    const breaker = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer,
        amperage: breakerAmperage,
        poleCount: breakerPoleCount,
        protectionType: inputs.breakerProtectionType,
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "service-breaker",
      category: "Protection",
      description: breaker.description,
      quantity: 1,
      unit: "ea",
      unitCost: breaker.value,
      source: breaker.source,
    });
  }

  addExactOrLegacy(
    "service-meter-disconnect",
    "Equipment",
    "meterDisconnect",
    inputs.meterDisconnectEquipment,
    inputs.meterDisconnectEquipment,
    1,
    "ea",
    (item) =>
      inputs.serviceDisconnect === "Meter-main combination" &&
      itemInCategory(item, "Equipment") &&
      item.amperage === Number.parseInt(inputs.serviceSize, 10) &&
      itemHasTerms(item, "meter"),
  );
  if (inputs.serviceDisconnect !== "Meter-main combination") {
    addPricedItem(
      "service-disconnect",
      "Equipment",
      inputs.serviceDisconnect,
      inputs.serviceDisconnect,
      1,
    );
  }
  addExactOrLegacy(
    "service-panel",
    "Panel",
    "servicePanel",
    `${inputs.panelManufacturer} ${inputs.serviceSize} service panel`,
    `${inputs.panelManufacturer} ${inputs.serviceSize} service panel`,
    1,
    "ea",
    (item) =>
      itemInCategory(item, "Panel") &&
      normalized(item.manufacturer ?? "") ===
        normalized(inputs.panelManufacturer) &&
      item.amperage === Number.parseInt(inputs.serviceSize, 10) &&
      (itemHasTerms(item, "panel") || itemHasTerms(item, "load center")),
  );
  if (inputs.surgeProtection !== "None") {
    const selectedSurgeProtection = inputs.surgeProtection.trim();
    const hasExactSelectedPrice = priceBook.some(
      (item) =>
        normalized(item.item) === normalized(selectedSurgeProtection) &&
        Number(item.unitCost) > 0 &&
        item.isDefault !== true,
    );
    const knownLegacyAlias = [
      "whole home surge protection",
      "service upgrade surge protection",
    ].includes(normalized(selectedSurgeProtection));
    const surgePriceKey =
      hasExactSelectedPrice || !knownLegacyAlias
        ? selectedSurgeProtection
        : "Whole-home surge protection";
    addPricedItem(
      "service-surge-protection",
      "Protection",
      surgePriceKey,
      surgePriceKey,
      1,
    );
  }

  if (inputs.includeOverheadMast) {
    addExactOrLegacy(
      "mast-raceway",
      "Raceway",
      "mastRaceway",
      "2-inch PVC mast raceway",
      "2-inch PVC mast raceway",
      inputs.mastFootage,
      "ft",
      (item) =>
        itemInCategory(item, "Raceway") &&
        itemHasTerms(item, "2 inch", "conduit"),
    );
    addExactOrLegacy(
      "mast-weatherhead",
      "Raceway",
      "mastWeatherhead",
      "2-inch PVC weatherhead",
      "2-inch PVC weatherhead",
      inputs.weatherheadQuantity,
      "ea",
      (item) =>
        itemInCategory(item, "Raceway") &&
        itemHasTerms(item, "2 inch", "weatherhead"),
    );
    addExactOrLegacy(
      "mast-expansion-coupling",
      "Raceway",
      "mastExpansionCoupling",
      "2-inch PVC expansion coupling",
      "2-inch PVC expansion couplings",
      inputs.mastExpansionCouplingQuantity ?? 0,
      "ea",
      (item) =>
        itemInCategory(item, "Raceway") &&
        itemHasTerms(item, "2 inch", "expansion", "coupling"),
    );
    addExactOrLegacy(
      "mast-straps",
      "Raceway",
      "mastStrap",
      "2-inch PVC conduit strap",
      "2-inch PVC conduit straps",
      inputs.mastStrapQuantity ?? 0,
      "ea",
      (item) =>
        itemInCategory(item, "Raceway") &&
        itemHasTerms(item, "2 inch", "conduit", "strap"),
    );
    addExactOrLegacy(
      "mast-hub",
      "Raceway",
      "mastHub",
      "2-inch PVC hub",
      "2-inch PVC hub",
      inputs.hubQuantity,
      "ea",
      (item) =>
        itemInCategory(item, "Raceway") &&
        itemHasTerms(item, "2 inch", "hub") &&
        normalized(item.manufacturer ?? "") ===
          normalized(inputs.panelManufacturer),
    );
    addExactOrLegacy(
      "mast-lb",
      "Raceway",
      "mastLb",
      "2-inch PVC LB",
      "2-inch PVC LB",
      inputs.lbQuantity,
      "ea",
      (item) =>
        itemInCategory(item, "Raceway") && itemHasTerms(item, "2 inch", "lb"),
    );
    addExactOrLegacy(
      "mast-90",
      "Raceway",
      "mastNinety",
      "2-inch PVC 90",
      "2-inch PVC 90",
      inputs.ninetyQuantity,
      "ea",
      (item) =>
        itemInCategory(item, "Raceway") && itemHasTerms(item, "2 inch", "90"),
    );
    addExactOrLegacy(
      "mast-couplings",
      "Raceway",
      "mastCoupling",
      "2-inch PVC coupling",
      "2-inch PVC couplings",
      inputs.couplingQuantity,
      "ea",
      (item) =>
        itemInCategory(item, "Raceway") &&
        itemHasTerms(item, "2 inch", "coupling") &&
        !normalized(item.item).includes("expansion"),
    );
    addPricedItem(
      "mast-related-parts",
      "Raceway",
      "2-inch PVC mast related parts",
      "2-inch PVC mast related parts",
      inputs.mastRelatedPartsQuantity,
    );
    addPricedItem(
      "mast-conductors",
      "Conductor",
      inputs.mastConductor,
      `${inputs.mastConductor}s`,
      inputs.mastConductorQuantity * inputs.mastConductorFootage,
      "ft",
    );
  }

  const serviceConductorKey =
    {
      "1/0 aluminum SER": "1/0 aluminum SER cable",
      "1/0 copper alternative": "1/0 copper service conductor alternative",
      "3/0 aluminum SER": "3/0 aluminum SER cable",
      "2/0 copper alternative": "2/0 copper service conductor alternative",
      "4/0 aluminum XHHW in raceway": "4/0 aluminum XHHW conductor",
      "4/0 aluminum SER": "4/0 aluminum SER cable",
      "4/0 copper alternative": "4/0 copper service conductor alternative",
      "Other configured conductor": "other configured service conductor",
    }[inputs.serviceToPanelConductor] ?? "other configured service conductor";
  const serviceConductor =
    inputs.serviceToPanelConductor === "4/0 aluminum SER"
      ? (exactCatalogCost(
          inputs.exactCatalogParts?.serviceToPanelConductor,
          "serviceToPanelConductor",
          priceBook,
          pricingWarnings,
          (item) =>
            itemInCategory(item, "Conductor") &&
            normalized(item.item).includes("4 0") &&
            normalized(item.item).includes("ser"),
        ) ?? unitCost(serviceConductorKey, priceBook, pricingWarnings))
      : inputs.exactCatalogParts?.serviceToPanelConductor
        ? exactCatalogCost(
            inputs.exactCatalogParts.serviceToPanelConductor,
            "serviceToPanelConductor",
            priceBook,
            pricingWarnings,
            () => false,
          )!
        : unitCost(serviceConductorKey, priceBook, pricingWarnings);
  addLine(assembly, {
    id: "service-to-panel-conductor",
    category: "Conductor",
    description: `${inputs.serviceToPanelConductor} from meter/disconnect to panel`,
    quantity:
      safeNumber(inputs.serviceToPanelFootage) *
      (inputs.serviceToPanelConductor === "4/0 aluminum XHHW in raceway"
        ? 3
        : 1),
    unit: "ft",
    unitCost: serviceConductor.value,
    source: serviceConductor.source,
  });
  if (inputs.serviceToPanelConductor === "4/0 aluminum XHHW in raceway") {
    addExactOrLegacy(
      "service-to-panel-raceway",
      "Raceway",
      "serviceToPanelRaceway",
      "2-inch PVC mast raceway",
      "2-inch PVC raceway from meter-main to panel",
      inputs.serviceToPanelFootage,
      "ft",
      (item) =>
        itemInCategory(item, "Raceway") &&
        itemHasTerms(item, "2 inch", "conduit"),
    );
  }
  if (inputs.serviceToPanelConductor.includes("copper alternative")) {
    pricingWarnings.push(
      "A copper alternative is explicitly selected for meter/disconnect-to-panel wiring; confirm the configured conductor and company price-book value.",
    );
  }

  addExactOrLegacy(
    "ground-bars",
    "Grounding",
    "groundBar",
    "ground bar",
    "Ground bars",
    inputs.groundBarQuantity,
    "ea",
    (item) =>
      itemInCategory(item, "Grounding") &&
      itemHasTerms(item, "ground bar") &&
      (normalized(item.manufacturer ?? "") === "ge" ||
        !["siemens", "square d"].includes(
          normalized(item.manufacturer ?? ""),
        ) ||
        normalized(item.manufacturer ?? "") ===
          normalized(inputs.panelManufacturer)),
  );
  addExactOrLegacy(
    "ground-rods",
    "Grounding",
    "groundRod",
    "ground rod",
    "Ground rods",
    inputs.groundRodQuantity,
    "ea",
    (item) =>
      itemInCategory(item, "Grounding") &&
      normalized(item.item).includes("ground") &&
      normalized(item.item).includes("rod") &&
      normalized(item.item).includes("5 8"),
  );
  addExactOrLegacy(
    "acorn-clamps",
    "Grounding",
    "acornClamp",
    "acorn clamp",
    "Acorn clamps",
    inputs.acornClampQuantity,
    "ea",
    (item) =>
      itemInCategory(item, "Grounding") &&
      (normalized(item.item).includes("acorn") ||
        normalized(item.item).includes("rod clamp")) &&
      normalized(item.item).includes("5 8"),
  );
  addPricedItem(
    "intersystem-bonding",
    "Bonding",
    "intersystem bonding terminal",
    "Intersystem bonding terminal",
    inputs.intersystemBondingQuantity,
  );
  addPricedItem(
    "grounding-conductor",
    "Grounding",
    "#8 solid grounding conductor",
    "#8 solid grounding conductor",
    inputs.groundingConductorFootage,
    "ft",
  );
  addPricedItem(
    "bonding-conductor",
    "Bonding",
    "#4 green bonding conductor",
    "#4 green bonding conductor",
    inputs.bondingConductorFootage,
    "ft",
  );
  addExactOrLegacy(
    "grounding-pvc",
    "Raceway",
    "groundingRaceway",
    "3/4-inch PVC raceway",
    "3/4-inch PVC / raceway",
    inputs.pvcThreeQuarterFootage,
    "ft",
    (item) =>
      itemInCategory(item, "Raceway") && itemHasTerms(item, "3 4", "conduit"),
  );
  addExactOrLegacy(
    "grounding-pvc-fittings",
    "Raceway",
    "groundingRacewayFitting",
    "3/4-inch PVC fittings",
    "3/4-inch PVC fittings",
    inputs.pvcThreeQuarterFittingsQuantity,
    "ea",
    (item) =>
      itemInCategory(item, "Raceway") && itemHasTerms(item, "3 4", "coupling"),
  );
  addPricedItem(
    "water-meter-bonding",
    "Bonding",
    "water-meter bonding clamp",
    "Water-meter bonding",
    inputs.waterMeterBondingQuantity,
  );
  addPricedItem(
    "water-meter-bonding-conductor",
    "Bonding",
    "#4 green bonding conductor",
    "#4 green water-meter bonding conductor",
    inputs.waterMeterBondingFootage,
    "ft",
  );

  addPricedItem(
    "four-square-box",
    "Devices",
    "4-square deep box",
    "4-square deep box",
    inputs.fourSquareBoxQuantity,
  );
  addPricedItem(
    "receptacle-20a",
    "Devices",
    "20A receptacle",
    "20A receptacle",
    inputs.receptacle20AQuantity,
  );
  addPricedItem(
    "receptacle-plate",
    "Trim",
    "20A receptacle plate",
    "20A receptacle plate",
    inputs.receptaclePlateQuantity,
  );
  addPricedItem(
    "plywood-backing",
    "Backing",
    "4x4x3/4 plywood",
    "4x4x3/4 plywood backing",
    inputs.plywoodQuantity,
  );
  addPricedItem(
    "studs",
    "Framing",
    "2x4x8 stud",
    "2x4x8 studs",
    inputs.studsQuantity,
  );
  addExactOrLegacy(
    "duct-seal",
    "Normal Stock",
    "ductSeal",
    "service duct seal",
    "Service / duct seal",
    inputs.ductSealQuantity ?? 0,
    "ea",
    (item) =>
      itemInCategory(item, "Normal Stock") && itemHasTerms(item, "duct seal"),
  );
  addExactOrLegacy(
    "pvc-primer",
    "Normal Stock",
    "pvcPrimer",
    "PVC primer",
    "PVC primer",
    inputs.pvcPrimerQuantity ?? 0,
    "ea",
    (item) =>
      itemInCategory(item, "Normal Stock") && itemHasTerms(item, "primer"),
  );
  addExactOrLegacy(
    "pvc-glue",
    "Normal Stock",
    "pvcGlue",
    "PVC glue",
    "PVC glue",
    inputs.pvcGlueQuantity ?? 0,
    "ea",
    (item) =>
      itemInCategory(item, "Normal Stock") && itemHasTerms(item, "cement"),
  );
  addExactOrLegacy(
    "anti-oxidant",
    "Normal Stock",
    "antiOxidant",
    "anti-oxidation compound",
    "Anti-oxidation compound",
    inputs.antiOxidantQuantity ?? 0,
    "ea",
    (item) =>
      itemInCategory(item, "Normal Stock") &&
      itemHasTerms(item, "anti oxidant"),
  );
  addExactOrLegacy(
    "electrical-tape",
    "Normal Stock",
    "electricalTape",
    "electrical tape",
    "Electrical tape",
    inputs.electricalTapeQuantity ?? 0,
    "roll",
    (item) =>
      itemInCategory(item, "Normal Stock") &&
      itemHasTerms(item, "electrical tape"),
  );
  addLine(assembly, {
    id: "panel-directory-labeling",
    category: "Closeout",
    description: "Prepare panel directory and complete final circuit labeling",
    quantity: 1,
    unit: "scope",
    unitCost: 0,
    source: "Included labor scope",
  });

  for (const [index, existingBreaker] of (
    inputs.existingBreakers ?? []
  ).entries()) {
    const quantity = safeNumber(existingBreaker.quantity);
    if (quantity === 0) continue;
    const resolved = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer,
        amperage: Math.max(1, Number(existingBreaker.amperage) || 1),
        poleCount: Math.max(1, Number(existingBreaker.poleCount) || 1),
        protectionType: existingBreaker.protectionType,
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: `existing-breaker-${index}`,
      category: "Existing Circuits",
      description: `Replacement ${resolved.description}`,
      quantity,
      unit: "ea",
      unitCost: resolved.value,
      source: resolved.source,
    });
  }
  addPricedItem(
    "existing-breaker-other",
    "Existing Circuits",
    "other existing-circuit breaker",
    "Other existing-circuit breaker — exact selection required",
    inputs.existingOtherBreakerQuantity ?? 0,
  );

  addAllowance(
    "permit-allowance",
    "Permit",
    "service upgrade permit allowance",
    inputs.permitAllowance,
  );
  addAllowance(
    "inspection-allowance",
    "Inspection",
    "service upgrade inspection allowance",
    inputs.inspectionAllowance,
  );
  addAllowance(
    "utility-coordination-allowance",
    "Utility",
    "service upgrade utility coordination allowance",
    inputs.utilityCoordinationAllowance ?? 0,
  );
  addAllowance(
    "miscellaneous-allowance",
    "Miscellaneous",
    "service upgrade miscellaneous allowance",
    inputs.miscellaneousAllowance,
  );

  pricingWarnings.push(
    "Service configuration and existing utility conditions require field verification; selections are configurable estimating assumptions, not universal code requirements.",
  );
  if (inputs.breakerAmperage !== Number.parseInt(inputs.serviceSize, 10)) {
    pricingWarnings.push(
      `The selected ${inputs.breakerAmperage}A main breaker does not match the selected service size ${inputs.serviceSize}; confirm the intentional equipment configuration before quoting.`,
    );
  }
  const crewSize = Math.max(1, Number(inputs.crewSize) || 1);
  const crewHours = safeNumber(inputs.crewHours);
  const fieldConditionHours = [
    inputs.relocationLaborHours,
    inputs.accessDifficultyLaborHours,
    inputs.groundingReworkLaborHours,
    inputs.feederDistanceLaborHours,
    inputs.serviceConditionLaborHours,
    inputs.utilityCoordinationLaborHours,
    inputs.generalLaborAdjustmentHours ?? inputs.laborAdjustmentHours,
  ].reduce<number>(
    (total, value) =>
      total + (Number.isFinite(Number(value)) ? Number(value) : 0),
    0,
  );
  const personHours = Math.max(0, crewSize * crewHours + fieldConditionHours);

  return finalizeEstimate(
    assembly,
    personHours,
    settings,
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculatePanelReplacementEstimate(
  inputs: PanelReplacementInputRecord,
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
    unit = "ea",
  ) => {
    const safeQuantity = safeNumber(quantity);
    if (safeQuantity === 0) return;
    const price = unitCost(key, priceBook, pricingWarnings);
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
  const addExactOrLegacy = (
    id: string,
    category: string,
    selector: ExactCatalogPartSelector,
    legacyKey: string,
    description: string,
    quantity: number,
    unit = "ea",
    compatible?: (item: PriceBookItem) => boolean,
  ) => {
    const safeQuantity = safeNumber(quantity);
    if (safeQuantity === 0) return;
    const price =
      exactCatalogCost(
        inputs.exactCatalogParts?.[selector],
        selector,
        priceBook,
        pricingWarnings,
        compatible,
      ) ?? unitCost(legacyKey, priceBook, pricingWarnings);
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

  const addAllowance = (
    id: string,
    label: string,
    key: string,
    amount: number,
  ) => {
    const enteredAmount = safeNumber(amount);
    const price =
      enteredAmount > 0
        ? {
            value: enteredAmount,
            source: "Contractor-entered configurable allowance",
          }
        : unitCost(key, priceBook, pricingWarnings);
    if (price.value === 0) {
      pricingWarnings.push(
        `Panel Replacement allowance "${label}" is unresolved until a local amount is entered or a company price-book value is configured.`,
      );
    }
    addLine(assembly, {
      id,
      category: "Allowance",
      description: `${label} — configurable allowance`,
      quantity: 1,
      unit: "allowance",
      unitCost: price.value,
      source: price.source,
    });
  };

  const panelAmperage = Math.max(1, Number(inputs.panelAmperage) || 1);
  const breakerAmperage = Math.max(1, Number(inputs.breakerAmperage) || 1);
  const breakerPoleCount = Math.max(1, Number(inputs.breakerPoleCount) || 1);
  const breakerMatchesPanel =
    breakerAmperage === panelAmperage && breakerPoleCount === 2;
  const breaker = resolveBreaker(
    {
      manufacturer: inputs.panelManufacturer,
      amperage: breakerAmperage,
      poleCount: breakerPoleCount,
      protectionType: inputs.breakerProtectionType,
    },
    priceBook,
    pricingWarnings,
  );
  addLine(assembly, {
    id: "panel-replacement-breaker",
    category: "Protection",
    description: breaker.description,
    quantity: 1,
    unit: "ea",
    unitCost: breakerMatchesPanel ? breaker.value : 0,
    source: breakerMatchesPanel
      ? breaker.source
      : "Unresolved panel/breaker compatibility — select a supported exact configuration",
  });

  addExactOrLegacy(
    "panel-replacement-panel",
    "Panel",
    "panelProduct",
    `${inputs.panelManufacturer} ${panelAmperage}A panel replacement enclosure`,
    `${inputs.panelManufacturer} ${panelAmperage}A ${inputs.panelSpaceCount}-space panel — ${inputs.replacementType}`,
    1,
    "ea",
    (item) =>
      itemInCategory(item, "Panel") &&
      normalized(item.manufacturer ?? "") ===
        normalized(inputs.panelManufacturer) &&
      item.amperage === panelAmperage &&
      catalogSpaceCount(item) === inputs.panelSpaceCount &&
      (itemHasTerms(item, "panel") || itemHasTerms(item, "load center")),
  );
  addPricedItem(
    "panel-space-fillers",
    "Panel",
    `${inputs.panelManufacturer} panel filler plate`,
    `${inputs.panelManufacturer} panel filler plates`,
    inputs.fillerPlateQuantity,
  );
  addPricedItem(
    "panel-knockout-seals",
    "Panel",
    "panel knockout seal",
    "Panel knockout seals",
    inputs.knockoutSealQuantity,
  );

  const feederKey = {
    "1/0 aluminum XHHW conductor": "1/0 aluminum XHHW conductor",
    "3/0 aluminum XHHW conductor": "3/0 aluminum XHHW conductor",
    "4/0 aluminum XHHW conductor": "4/0 aluminum XHHW conductor",
    "1/0 copper service conductor alternative":
      "1/0 copper service conductor alternative",
    "2/0 copper service conductor alternative":
      "2/0 copper service conductor alternative",
    "Other configured feeder conductor": "other configured feeder conductor",
  }[inputs.feederConductor];
  const compatibleFeederConductors: Record<number, string[]> = {
    100: [
      "1/0 aluminum XHHW conductor",
      "1/0 copper service conductor alternative",
    ],
    150: [
      "3/0 aluminum XHHW conductor",
      "2/0 copper service conductor alternative",
    ],
    200: ["4/0 aluminum XHHW conductor"],
  };
  const feederIsCompatible =
    breakerMatchesPanel &&
    inputs.feederConductorQuantity === 3 &&
    (compatibleFeederConductors[breakerAmperage]?.includes(
      inputs.feederConductor,
    ) ??
      false);
  const feederQuantity =
    safeNumber(inputs.feederLength) *
    safeNumber(inputs.feederConductorQuantity);
  if (!feederIsCompatible) {
    pricingWarnings.push(
      `The selected panel/breaker/feeder tuple (${panelAmperage}A panel, ${breakerAmperage}A ${breakerPoleCount}-pole breaker, ${inputs.feederConductorQuantity} × ${inputs.feederConductor}) does not meet the selected breaker amperage and supported configuration. No feeder conductor cost was substituted; confirm an exact compatible tuple before quoting.`,
    );
    addLine(assembly, {
      id: "panel-replacement-feeder",
      category: "Feeder",
      description: `${inputs.feederConductor} feeder — unresolved compatibility`,
      quantity: feederQuantity,
      unit: "ft",
      unitCost: 0,
      source: "Unresolved feeder compatibility — select a supported conductor",
    });
  } else {
    const feeder = unitCost(feederKey, priceBook, pricingWarnings);
    addLine(assembly, {
      id: "panel-replacement-feeder",
      category: "Feeder",
      description: `${inputs.feederConductor} feeder`,
      quantity: feederQuantity,
      unit: "ft",
      unitCost: feeder.value,
      source: feeder.source,
    });
  }
  addExactOrLegacy(
    "feeder-raceway",
    "Raceway",
    "feederRaceway",
    "panel replacement feeder raceway",
    "Panel replacement feeder raceway",
    inputs.feederRacewayFootage,
    "ft",
    (item) =>
      itemInCategory(item, "Raceway") &&
      itemHasTerms(item, "2 inch", "conduit"),
  );
  addExactOrLegacy(
    "feeder-raceway-fittings",
    "Raceway",
    "feederRacewayFitting",
    "panel replacement feeder raceway fittings",
    "Panel replacement feeder raceway fittings",
    inputs.feederRacewayFittingsQuantity,
    "ea",
    (item) =>
      itemInCategory(item, "Raceway") &&
      itemHasTerms(item, "2 inch", "coupling"),
  );

  addExactOrLegacy(
    "panel-ground-bars",
    "Grounding",
    "groundBar",
    "ground bar",
    "Ground bars",
    inputs.groundBarQuantity,
    "ea",
    (item) =>
      itemInCategory(item, "Grounding") &&
      itemHasTerms(item, "ground bar") &&
      (normalized(item.manufacturer ?? "") === "ge" ||
        !["siemens", "square d"].includes(
          normalized(item.manufacturer ?? ""),
        ) ||
        normalized(item.manufacturer ?? "") ===
          normalized(inputs.panelManufacturer)),
  );
  addExactOrLegacy(
    "panel-ground-rods",
    "Grounding",
    "groundRod",
    "ground rod",
    "Ground rods",
    inputs.groundRodQuantity,
    "ea",
    (item) =>
      itemInCategory(item, "Grounding") &&
      normalized(item.item).includes("ground") &&
      normalized(item.item).includes("rod") &&
      normalized(item.item).includes("5 8"),
  );
  addPricedItem(
    "panel-grounding-conductor",
    "Grounding",
    "#8 solid grounding conductor",
    "#8 solid grounding conductor",
    inputs.groundingConductorFootage,
    "ft",
  );
  addPricedItem(
    "panel-bonding-conductor",
    "Bonding",
    "#4 green bonding conductor",
    "#4 green bonding conductor",
    inputs.bondingConductorFootage,
    "ft",
  );
  addPricedItem(
    "panel-plywood",
    "Backing",
    "4x4x3/4 plywood",
    "4x4x3/4 plywood backing",
    inputs.plywoodQuantity,
  );
  addPricedItem(
    "panel-studs",
    "Framing",
    "2x4x8 stud",
    "2x4x8 studs",
    inputs.studsQuantity,
  );
  addExactOrLegacy(
    "panel-anti-oxidant",
    "Normal Stock",
    "antiOxidant",
    "anti-oxidation compound",
    "Anti-oxidation compound",
    inputs.antiOxidantQuantity,
    "ea",
    (item) =>
      itemInCategory(item, "Normal Stock") &&
      itemHasTerms(item, "anti oxidant"),
  );
  addExactOrLegacy(
    "panel-electrical-tape",
    "Normal Stock",
    "electricalTape",
    "electrical tape",
    "Electrical tape",
    inputs.electricalTapeQuantity,
    "roll",
    (item) =>
      itemInCategory(item, "Normal Stock") &&
      itemHasTerms(item, "electrical tape"),
  );

  for (const [index, existingBreaker] of (
    inputs.existingBreakers ?? []
  ).entries()) {
    const quantity = safeNumber(existingBreaker.quantity);
    if (quantity === 0) continue;
    const resolved = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer,
        amperage: Math.max(1, Number(existingBreaker.amperage) || 1),
        poleCount: Math.max(1, Number(existingBreaker.poleCount) || 1),
        protectionType: existingBreaker.protectionType,
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: `panel-existing-breaker-${index}`,
      category: "Existing Circuits",
      description: `Replacement ${resolved.description}`,
      quantity,
      unit: "ea",
      unitCost: resolved.value,
      source: resolved.source,
    });
  }
  addPricedItem(
    "panel-existing-breaker-other",
    "Existing Circuits",
    "other existing-circuit breaker",
    "Other existing-circuit breaker — exact selection required",
    inputs.existingOtherBreakerQuantity ?? 0,
  );

  addAllowance(
    "panel-permit-allowance",
    "Permit",
    "panel replacement permit allowance",
    inputs.permitAllowance,
  );
  addAllowance(
    "panel-inspection-allowance",
    "Inspection",
    "panel replacement inspection allowance",
    inputs.inspectionAllowance,
  );
  addAllowance(
    "panel-miscellaneous-allowance",
    "Miscellaneous",
    "panel replacement miscellaneous allowance",
    inputs.miscellaneousAllowance,
  );

  assembly.push({
    id: "panel-replacement-closeout",
    category: "Closeout",
    description: "Prepare panel directory and complete final circuit labeling",
    quantity: 1,
    unit: "scope",
    unitCost: 0,
    extendedCost: 0,
    source: "Included labor scope",
  });
  pricingWarnings.push(
    "Panel Replacement assumptions require field verification of the existing panel, feeder routing, working clearances, grounding, and circuit protection; selections are configurable estimating assumptions, not universal code requirements.",
  );
  if (!breakerMatchesPanel) {
    pricingWarnings.push(
      `Panel Replacement field verification is required because the selected ${breakerAmperage}A ${breakerPoleCount}-pole panel breaker does not match the supported ${panelAmperage}A, 2-pole panel configuration; breaker pricing remains unresolved.`,
    );
  }

  const crewSize = Math.max(1, Number(inputs.crewSize) || 1);
  const crewHours = safeNumber(inputs.crewHours);
  const adjustmentHours = [
    inputs.panelRemovalLaborHours,
    inputs.feederInstallationLaborHours,
    inputs.groundingLaborHours,
    inputs.accessDifficultyLaborHours,
    inputs.generalLaborAdjustmentHours ?? inputs.laborAdjustmentHours,
  ].reduce<number>(
    (total, value) =>
      total + (Number.isFinite(Number(value)) ? Number(value) : 0),
    0,
  );

  return finalizeEstimate(
    assembly,
    Math.max(0, crewSize * crewHours + adjustmentHours),
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
  const fixtureQuantity = Math.max(
    1,
    Math.round(safeNumber(inputs.fixtureQuantity)),
  );
  const additionalLights = Math.round(safeNumber(inputs.additionalLights));
  const additionalSwitches = Math.round(safeNumber(inputs.additionalSwitches));
  const wireRunLength = safeNumber(inputs.wireRunLength);
  const wiringAllowanceFeet = safeNumber(inputs.wiringAllowanceFeet);
  const traditionalThreeWayFootage = safeNumber(
    inputs.traditionalThreeWayFootage ?? 0,
  );
  const laborAdjustmentHours = Number.isFinite(
    Number(inputs.laborAdjustmentHours),
  )
    ? Number(inputs.laborAdjustmentHours)
    : 0;
  const isNewWiring = /new/i.test(inputs.wiringOption);
  const isNewCircuit = /new/i.test(inputs.circuitOption);
  const switchingMethod = inputs.switchingMethod as string | undefined;
  const isLegacyThreeWay =
    !switchingMethod && /3[- ]?way/i.test(inputs.switchType);
  const isTraditionalThreeWay =
    switchingMethod === "traditional-3-way" ||
    switchingMethod === "Traditional 3-way" ||
    isLegacyThreeWay;
  const isSmartKit =
    switchingMethod === "smart-3-way" ||
    switchingMethod ===
      "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote";
  const fixtureKey =
    inputs.fixtureSize === "6-inch" ? JUNO_WF6_VERIFIED : JUNO_WF4_VERIFIED;
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
      ? (() => {
          pricingWarnings.push(
            `Customer-supplied material "${description}" has no contractor price. Confirm the customer-provided item is available and intentionally excluded before sending the quote.`,
          );
          return { value: 0, source: "Customer supplied fixture" };
        })()
      : unitCost(key, priceBook, pricingWarnings);
    addLine(assembly, {
      id,
      category,
      description,
      quantity: safeQuantity,
      unit,
      unitCost: price.value,
      source: price.source,
      ...(customerSupplied
        ? {
            intentionalExclusionReason:
              "Customer is supplying this fixture; contractor material cost is intentionally excluded.",
          }
        : {}),
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
    ? "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote combo-pack"
    : isTraditionalThreeWay
      ? "Pass & Seymour TM873-W 15A 3-way switch — SKU 32128"
      : "Pass & Seymour TM870-W 15A single-pole switch — SKU 3211";
  const controlDescription = isSmartKit
    ? "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote — combo pack"
    : isTraditionalThreeWay
      ? "Pass & Seymour 15A traditional 3-way switches"
      : "Pass & Seymour 15A single-pole switch";
  addPricedItem(
    isSmartKit ? "smart-switch-kit" : "switch-controls",
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
    "Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",
    "Additional Pass & Seymour single-pole switches",
    additionalSwitches,
  );
  if (!isSmartKit && /include|yes|selected/i.test(inputs.dimmerSelection)) {
    addPricedItem(
      "dimmer",
      "Controls",
      "Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393",
      "Lutron Diva LED+ dimming control — final load compatibility to be verified",
      1,
    );
  }

  if (isNewWiring) {
    const selectedCable = isTraditionalThreeWay
      ? "14/3 NM-B"
      : inputs.cableType;
    const cableMatchesBreaker =
      !isNewCircuit ||
      (inputs.breakerAmperage === 15
        ? isTraditionalThreeWay
          ? selectedCable === "14/3 NM-B"
          : selectedCable === "14/2 NM-B" || selectedCable === "12/2 NM-B"
        : inputs.breakerAmperage === 20
          ? !isTraditionalThreeWay && selectedCable === "12/2 NM-B"
          : false);
    if (!cableMatchesBreaker) {
      pricingWarnings.push(
        `Selected ${selectedCable} cable is not appropriate for the ${inputs.breakerAmperage}A ${isTraditionalThreeWay ? "3-way" : "single-pole"} configuration. No cable cost was substituted. Confirm the breaker and conductor selection in the field.`,
      );
    } else {
      const cableFootage = isTraditionalThreeWay
        ? traditionalThreeWayFootage
        : wireRunLength;
      if (cableFootage + wiringAllowanceFeet <= 0) {
        pricingWarnings.push(
          isTraditionalThreeWay
            ? "Traditional 3-way switching is selected but contractor-entered 14/3 NM-B footage and wiring allowance are both zero. Add footage so cable can be priced."
            : "New wiring is selected but the approximate wire run is zero. Add a run length and/or wiring allowance so cable can be priced.",
        );
      } else {
        const cable = unitCost(
          `${selectedCable} cable`,
          priceBook,
          pricingWarnings,
        );
        addLine(assembly, {
          id: "recessed-wiring",
          category: "Conductor",
          description: isTraditionalThreeWay
            ? "14/3 NM-B cable — contractor-entered 3-way footage plus wiring allowance"
            : `${selectedCable} cable — approximate run plus wiring allowance`,
          quantity: Number((cableFootage + wiringAllowanceFeet).toFixed(2)),
          unit: "ft",
          unitCost: cable.value,
          source: cable.source,
        });
        if (isTraditionalThreeWay && cableFootage === 0) {
          pricingWarnings.push(
            "Traditional 3-way switching has zero contractor-entered 14/3 NM-B footage. Confirm the entered footage before the quote is sent.",
          );
        }
      }
    }
  } else {
    pricingWarnings.push(
      "Existing switch leg / lighting box conditions must be opened and field-verified for capacity, grounding, box support, and accessible wiring before installation.",
    );
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
        amperage: inputs.breakerAmperage,
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
  const taskLaborHours =
    1.25 +
    fixtureQuantity * 0.85 +
    additionalLights * 0.65 +
    (isTraditionalThreeWay ? 1.25 : isSmartKit ? 1 : 0.5) +
    additionalSwitches * 0.45 +
    (!isSmartKit && /include|yes|selected/i.test(inputs.dimmerSelection)
      ? 0.5
      : 0) +
    (isNewWiring
      ? ((isTraditionalThreeWay ? traditionalThreeWayFootage : wireRunLength) +
          wiringAllowanceFeet) /
        40
      : 0) +
    (isNewCircuit ? 2.5 : 0) +
    accessHours;
  const laborHours = taskLaborHours * ceilingMultiplier + laborAdjustmentHours;

  return finalizeEstimate(
    assembly,
    Math.max(0, laborHours),
    settings,
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculateServiceCallEstimate(
  inputs: ServiceCallInputRecord,
  settings: EstimatingSettings,
  priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];
  const safeQuantity = (value: number) =>
    Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const addCatalogLine = (
    id: string,
    description: string,
    key: string,
    quantity: number,
  ) => {
    const selectedQuantity = safeQuantity(quantity);
    if (selectedQuantity === 0) return;
    const price = unitCost(key, priceBook, pricingWarnings);
    addLine(assembly, {
      id,
      category: "Devices",
      description,
      quantity: selectedQuantity,
      unit: "ea",
      unitCost: price.value,
      source: price.source,
    });
  };

  addCatalogLine(
    "standard-receptacle-replacement",
    "Standard receptacle replacement",
    "standard receptacle",
    inputs.receptacleReplacementQuantity,
  );
  addCatalogLine(
    "tr-receptacle-replacement",
    "Tamper-resistant receptacle replacement",
    "Pass & Seymour 3232-TRW 15A TR duplex receptacle",
    inputs.trReceptacleReplacementQuantity,
  );
  addCatalogLine(
    "single-pole-switch-replacement",
    "Single-pole switch replacement",
    "Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",
    inputs.switchReplacementQuantity,
  );
  addCatalogLine(
    "gfci-replacement",
    "20A tamper-resistant self-test GFCI replacement",
    "Pass & Seymour 2097-TRWRW 20A TR self-test GFCI",
    inputs.gfciReplacementQuantity,
  );
  addMiscellaneousMaterialLines(
    assembly,
    pricingWarnings,
    inputs.miscellaneousMaterials,
    "Service Call",
  );

  const visitQuantity = Math.max(1, safeQuantity(inputs.visitQuantity));
  const crewSize = Math.max(1, safeQuantity(inputs.crewSize));
  const crewHours = safeQuantity(inputs.crewHours);
  const deviceLaborHours =
    safeQuantity(inputs.receptacleReplacementQuantity) * 0.5 +
    safeQuantity(inputs.trReceptacleReplacementQuantity) * 0.5 +
    safeQuantity(inputs.switchReplacementQuantity) * 0.5 +
    safeQuantity(inputs.gfciReplacementQuantity) * 0.75;
  const laborHours = visitQuantity * crewSize * crewHours + deviceLaborHours;
  if (laborHours === 0) {
    pricingWarnings.push(
      "Service Call labor is zero. Enter visit hours before sending the quote.",
    );
  }
  pricingWarnings.push(
    "Service Call scope, device condition, circuit capacity, and protection requirements must be confirmed in the field.",
  );

  return finalizeEstimate(
    assembly,
    laborHours,
    configuredEstimateSettings(settings, inputs),
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculateTimeMaterialsEstimate(
  inputs: TimeMaterialsInputRecord,
  settings: EstimatingSettings,
  _priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];
  addMiscellaneousMaterialLines(
    assembly,
    pricingWarnings,
    inputs.miscellaneousMaterials,
    "Time & Materials",
  );
  const crewSize = Number.isFinite(Number(inputs.crewSize))
    ? Math.max(1, Number(inputs.crewSize))
    : 1;
  const crewHours = Number.isFinite(Number(inputs.crewHours))
    ? Math.max(0, Number(inputs.crewHours))
    : 0;
  const laborHours = crewSize * crewHours;
  if (laborHours === 0) {
    pricingWarnings.push(
      "Time & Materials labor is zero. Enter expected hours before sending the quote.",
    );
  }
  pricingWarnings.push(
    "Time & Materials values are an authorization estimate. Confirm actual labor and material usage before invoicing.",
  );

  return finalizeEstimate(
    assembly,
    laborHours,
    configuredEstimateSettings(settings, inputs),
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculateCustomEstimate(
  inputs: CustomInputRecord,
  settings: EstimatingSettings,
  _priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];

  inputs.materials.forEach((line, index) => {
    const description = line.description.trim();
    const quantity = Number.isFinite(Number(line.quantity))
      ? Math.max(0, Number(line.quantity))
      : 0;
    const unitCost = Number.isFinite(Number(line.unitCost))
      ? Math.max(0, Number(line.unitCost))
      : 0;
    const exclusionReason =
      line.intentionalExclusion?.confirmed === true
        ? line.intentionalExclusion.reason.trim()
        : "";
    if (!description && quantity === 0 && unitCost === 0) return;
    if (!description) {
      pricingWarnings.push(
        `Custom material line ${index + 1} has no description. Confirm the material before sending the quote.`,
      );
    }
    if (unitCost === 0 && exclusionReason.length < 10) {
      pricingWarnings.push(
        `Custom material "${description || `line ${index + 1}`}" has zero cost and must be confirmed before sending the quote.`,
      );
    }
    addLine(assembly, {
      id: `custom-material-${line.id || index + 1}`,
      category: "Materials",
      description: description || `Custom material ${index + 1}`,
      quantity,
      unit: line.unit.trim() || "ea",
      unitCost,
      source: exclusionReason
        ? "Contractor-entered custom material — intentionally excluded"
        : "Contractor-entered custom material",
      ...(exclusionReason
        ? { intentionalExclusionReason: exclusionReason }
        : {}),
    });
  });

  addMiscellaneousMaterialLines(
    assembly,
    pricingWarnings,
    inputs.miscellaneousMaterials,
    "Custom",
  );

  const laborHours = Number.isFinite(Number(inputs.laborHours))
    ? Math.max(0, Number(inputs.laborHours))
    : 0;
  if (laborHours === 0) {
    pricingWarnings.push(
      "Custom scope labor is zero. Enter labor hours before sending the quote.",
    );
  }

  return finalizeEstimate(
    assembly,
    laborHours,
    configuredEstimateSettings(settings, inputs),
    pricingWarnings,
    inputs.laborRateType,
  );
}

export function calculateNewHouseEstimate(
  inputs: NewHouseInputRecord,
  settings: EstimatingSettings,
  priceBook: PriceBookItem[],
): EstimateResult {
  const assembly: AssemblyLineRecord[] = [];
  const pricingWarnings: string[] = [];
  const quantity = (value: number | undefined) =>
    Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const amount = (value: number | undefined) =>
    Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

  const addCatalogLine = (
    id: string,
    category: string,
    description: string,
    key: string,
    selectedQuantity: number,
  ) => {
    const lineQuantity = quantity(selectedQuantity);
    if (lineQuantity === 0) return;
    const price = unitCost(key, priceBook, pricingWarnings);
    addLine(assembly, {
      id,
      category,
      description,
      quantity: lineQuantity,
      unit: "ea",
      unitCost: price.value,
      source: price.source,
    });
  };

  addCatalogLine(
    "new-house-outlets",
    "Devices",
    "General-purpose tamper-resistant receptacles",
    "Pass & Seymour 3232-TRW 15A TR duplex receptacle",
    inputs.outletQuantity,
  );
  addCatalogLine(
    "new-house-switches",
    "Controls",
    "Single-pole switches",
    "Pass & Seymour TM870-W 15A single-pole switch — SKU 3211",
    inputs.switchQuantity,
  );
  addCatalogLine(
    "new-house-dimmers",
    "Controls",
    "LED-compatible dimmers",
    "Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393",
    inputs.dimmerQuantity,
  );
  addCatalogLine(
    "new-house-recessed-lights",
    "Lighting",
    `${inputs.recessedLightSize} recessed light fixtures`,
    inputs.recessedLightSize === "4-inch"
      ? JUNO_WF4_VERIFIED
      : JUNO_WF6_VERIFIED,
    inputs.recessedLightQuantity,
  );

  const fanQuantity = quantity(inputs.fanQuantity);
  if (fanQuantity > 0) {
    if (inputs.fanSupply === "Contractor supplied") {
      if (inputs.fanMaterialUnitCostOverride !== undefined) {
        const fanCost = amount(inputs.fanMaterialUnitCostOverride);
        if (fanCost === 0) {
          pricingWarnings.push(
            "New House contractor-supplied fan has a zero-cost override and is unresolved. Enter a confirmed unit cost before sending the quote.",
          );
        }
        addLine(assembly, {
          id: "new-house-fans",
          category: "Fixtures",
          description: "Ceiling fan fixtures",
          quantity: fanQuantity,
          unit: "ea",
          unitCost: fanCost,
          source: "Quote-local unit cost override",
        });
      } else {
        addCatalogLine(
          "new-house-fans",
          "Fixtures",
          "Ceiling fan fixtures",
          "standard ceiling fan",
          fanQuantity,
        );
      }
    } else {
      addLine(assembly, {
        id: "new-house-fans",
        category: "Fixtures",
        description: `Ceiling fan fixtures — ${inputs.fanSupply.toLowerCase()}`,
        quantity: fanQuantity,
        unit: "ea",
        unitCost: 0,
        source: "Included labor scope",
        intentionalExclusionReason: `${inputs.fanSupply} fixture supply is intentionally excluded from contractor material cost.`,
      });
      pricingWarnings.push(
        `New House ceiling fan fixtures are ${inputs.fanSupply.toLowerCase()} and excluded from contractor material cost. Confirm supply responsibility and final fixture specifications.`,
      );
    }
  }

  addCatalogLine(
    "new-house-smoke-co",
    "Life Safety",
    "Smoke / carbon-monoxide combination devices",
    "standard smoke/CO detector",
    inputs.smokeCoQuantity,
  );
  addCatalogLine(
    "new-house-bathroom-gfci",
    "Devices",
    "Bathroom GFCI receptacle allowances",
    "Pass & Seymour 1597-TRWRW 15A TR self-test GFCI",
    inputs.bathroomQuantity,
  );
  addCatalogLine(
    "new-house-exterior-receptacles",
    "Devices",
    "Exterior weather-resistant receptacles",
    "Pass & Seymour 3232-TRW 15A TR duplex receptacle",
    inputs.exteriorReceptacleQuantity,
  );
  addCatalogLine(
    "new-house-exterior-lighting",
    "Lighting",
    "Exterior lighting fixture allowances",
    "standard exterior light fixture",
    inputs.exteriorLightingQuantity,
  );
  addCatalogLine(
    "new-house-garage-receptacles",
    "Devices",
    "Garage tamper-resistant receptacles",
    "Pass & Seymour 3232-TRW 15A TR duplex receptacle",
    inputs.garageReceptacleQuantity,
  );

  const branchCircuitCount =
    quantity(inputs.commonBranchCircuitQuantity) +
    quantity(inputs.kitchenApplianceCircuitQuantity) +
    quantity(inputs.laundryCircuitQuantity) +
    quantity(inputs.garageCircuitQuantity);
  const equipmentCircuitCount =
    quantity(inputs.hvacEquipmentCircuitQuantity) +
    quantity(inputs.miniSplitCircuitQuantity);

  if (branchCircuitCount > 0) {
    const averageBranchFootage = quantity(inputs.branchCircuitFootage);
    const branchFootage = averageBranchFootage * branchCircuitCount;
    const requiredBranchCables = compatibleNmBCables(
      inputs.branchCircuitAmperage,
    );
    const branchCableIsCompatible = isCompatibleNmBCable(
      inputs.branchCircuitAmperage,
      inputs.branchCircuitCableType,
    );
    if (!branchCableIsCompatible) {
      pricingWarnings.push(
        `New House branch-circuit cable is incompatible: ${inputs.branchCircuitCableType} cannot be priced for the selected ${inputs.branchCircuitAmperage}A circuit. Select ${requiredBranchCables?.join(" or ") ?? "a supported cable"} before sending the quote.`,
      );
    }
    if (branchFootage === 0) {
      pricingWarnings.push(
        "New House branch circuit footage is zero while branch circuits are selected. Add average home-run footage per circuit before sending the quote.",
      );
    } else if (branchCableIsCompatible) {
      const cable = unitCost(
        `${inputs.branchCircuitCableType} cable`,
        priceBook,
        pricingWarnings,
      );
      addLine(assembly, {
        id: "new-house-branch-cable",
        category: "Wire",
        description: `${inputs.branchCircuitCableType} branch-circuit home runs (${averageBranchFootage} ft average × ${branchCircuitCount} circuits)`,
        quantity: branchFootage,
        unit: "ft",
        unitCost: cable.value,
        source: cable.source,
      });
    }
    const breaker = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer,
        amperage: inputs.branchCircuitAmperage,
        poleCount: inputs.branchCircuitPoleCount,
        protectionType: inputs.branchCircuitProtectionType,
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "new-house-branch-breakers",
      category: "Protection",
      description: `${inputs.branchCircuitAmperage}A branch-circuit breakers — ${inputs.branchCircuitProtectionType}`,
      quantity: branchCircuitCount,
      unit: "ea",
      unitCost: breaker.value,
      source: breaker.source,
    });
  }

  if (equipmentCircuitCount > 0) {
    const averageEquipmentFootage = quantity(inputs.equipmentCircuitFootage);
    const equipmentFootage = averageEquipmentFootage * equipmentCircuitCount;
    const requiredEquipmentCables = compatibleNmBCables(
      inputs.equipmentCircuitAmperage,
    );
    const equipmentCableIsCompatible = isCompatibleNmBCable(
      inputs.equipmentCircuitAmperage,
      inputs.equipmentCircuitCableType,
    );
    if (!equipmentCableIsCompatible) {
      pricingWarnings.push(
        `New House equipment-circuit cable is incompatible: ${inputs.equipmentCircuitCableType} cannot be priced for the selected ${inputs.equipmentCircuitAmperage}A circuit. Select ${requiredEquipmentCables?.join(" or ") ?? "a supported cable"} before sending the quote.`,
      );
    }
    if (equipmentFootage === 0) {
      pricingWarnings.push(
        "New House equipment-circuit footage is zero while HVAC or mini-split circuits are selected. Add average home-run footage per circuit before sending the quote.",
      );
    } else if (equipmentCableIsCompatible) {
      const cable = unitCost(
        `${inputs.equipmentCircuitCableType} cable`,
        priceBook,
        pricingWarnings,
      );
      addLine(assembly, {
        id: "new-house-equipment-cable",
        category: "Wire",
        description: `${inputs.equipmentCircuitCableType} HVAC / equipment home runs (${averageEquipmentFootage} ft average × ${equipmentCircuitCount} circuits)`,
        quantity: equipmentFootage,
        unit: "ft",
        unitCost: cable.value,
        source: cable.source,
      });
    }
    const breaker = resolveBreaker(
      {
        manufacturer: inputs.panelManufacturer,
        amperage: inputs.equipmentCircuitAmperage,
        poleCount: inputs.equipmentCircuitPoleCount,
        protectionType: inputs.equipmentCircuitProtectionType,
      },
      priceBook,
      pricingWarnings,
    );
    addLine(assembly, {
      id: "new-house-equipment-breakers",
      category: "Protection",
      description: `${inputs.equipmentCircuitAmperage}A equipment breakers — ${inputs.equipmentCircuitProtectionType}`,
      quantity: equipmentCircuitCount,
      unit: "ea",
      unitCost: breaker.value,
      source: breaker.source,
    });
  }

  const servicePanelAllowance = amount(inputs.servicePanelAllowance);
  if (servicePanelAllowance > 0) {
    addLine(assembly, {
      id: "new-house-service-panel-allowance",
      category: "Allowances",
      description: "Service and panel equipment allowance",
      quantity: 1,
      unit: "allowance",
      unitCost: servicePanelAllowance,
      source: "Contractor-entered New House allowance",
    });
  }

  const floorMultiplier =
    1 + Math.max(0, quantity(inputs.floorCount) - 1) * 0.06;
  const basementMultiplier =
    quantity(inputs.basementSquareFootage) > 0
      ? inputs.basementFinished
        ? 1.12
        : 1.06
      : 1;
  const garageMultiplier = quantity(inputs.garageSquareFootage) > 0 ? 1.04 : 1;
  const squareFootageMultiplier = Math.min(
    1.5,
    Math.max(0.75, quantity(inputs.finishedSquareFootage) / 2000),
  );
  const characteristicMultiplier =
    squareFootageMultiplier *
    floorMultiplier *
    basementMultiplier *
    garageMultiplier;
  const scopeLaborHours =
    quantity(inputs.outletQuantity) * 0.25 +
    quantity(inputs.switchQuantity) * 0.3 +
    quantity(inputs.dimmerQuantity) * 0.5 +
    quantity(inputs.recessedLightQuantity) * 0.4 +
    fanQuantity * 1.25 +
    quantity(inputs.smokeCoQuantity) * 0.25 +
    quantity(inputs.bathroomQuantity) * 0.75 +
    quantity(inputs.kitchenApplianceCircuitQuantity) * 1.25 +
    quantity(inputs.laundryCircuitQuantity) * 1 +
    quantity(inputs.exteriorReceptacleQuantity) * 0.4 +
    quantity(inputs.exteriorLightingQuantity) * 0.75 +
    quantity(inputs.garageReceptacleQuantity) * 0.4 +
    quantity(inputs.garageCircuitQuantity) * 1.25 +
    quantity(inputs.hvacEquipmentCircuitQuantity) * 1.5 +
    quantity(inputs.miniSplitCircuitQuantity) * 2 +
    quantity(inputs.commonBranchCircuitQuantity) * 1;
  const crewLaborHours = quantity(inputs.crewSize) * quantity(inputs.crewHours);
  const laborHours =
    crewLaborHours +
    scopeLaborHours * characteristicMultiplier +
    amount(inputs.laborAdjustmentHours);

  pricingWarnings.push(
    `New House allowances use ${Math.round(quantity(inputs.finishedSquareFootage)).toLocaleString()} finished sq. ft., ${Math.round(quantity(inputs.floorCount))} floor(s), and the selected garage/basement characteristics. Pricing is calculated from editable quantities, footage, materials, and task labor—not a flat price per square foot.`,
  );
  if (laborHours === 0) {
    pricingWarnings.push(
      "New House labor is zero. Enter crew hours or labor adjustments before sending the quote.",
    );
  }

  return finalizeEstimate(
    assembly,
    laborHours,
    settings,
    pricingWarnings,
    inputs.laborRateType,
  );
}
