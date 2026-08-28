const routesByModuleKey: Record<string, string> = {
  EVCHARGER: "/quotes/new",
  EVCHARGERBUILDER: "/quotes/new",
  BATHROOM: "/quotes/new/bathroom",
  BATHROOMBUILDER: "/quotes/new/bathroom",
  KITCHEN: "/quotes/new/kitchen",
  KITCHENBUILDER: "/quotes/new/kitchen",
  RECESSEDLIGHTING: "/quotes/new/recessed-lighting",
  RECESSEDLIGHTINGBUILDER: "/quotes/new/recessed-lighting",
  SERVICEUPGRADE: "/quotes/new/service-upgrade",
  SERVICEUPGRADEBUILDER: "/quotes/new/service-upgrade",
  PANELREPLACEMENT: "/quotes/new/panel-replacement",
  PANELREPLACEMENTBUILDER: "/quotes/new/panel-replacement",
  SERVICECALL: "/quotes/new/service-call",
  SERVICECALLBUILDER: "/quotes/new/service-call",
  TIMEANDMATERIALS: "/quotes/new/time-materials",
  TIMEANDMATERIALSBUILDER: "/quotes/new/time-materials",
  CUSTOM: "/quotes/new/custom",
  CUSTOMBUILDER: "/quotes/new/custom",
  CUSTOMITEMS: "/quotes/new/custom",
  CUSTOMITEMSBUILDER: "/quotes/new/custom",
}

const canonicalModulesByKey: Record<string, string> = {
  EVCHARGER: "EV_CHARGER", EVCHARGERBUILDER: "EV_CHARGER",
  BATHROOM: "BATHROOM", BATHROOMBUILDER: "BATHROOM",
  KITCHEN: "KITCHEN", KITCHENBUILDER: "KITCHEN",
  RECESSEDLIGHTING: "RECESSED_LIGHTING", RECESSEDLIGHTINGBUILDER: "RECESSED_LIGHTING",
  SERVICEUPGRADE: "SERVICE_UPGRADE", SERVICEUPGRADEBUILDER: "SERVICE_UPGRADE",
  PANELREPLACEMENT: "PANEL_REPLACEMENT", PANELREPLACEMENTBUILDER: "PANEL_REPLACEMENT",
  SERVICECALL: "SERVICE_CALL", SERVICECALLBUILDER: "SERVICE_CALL",
  TIMEANDMATERIALS: "TIME_MATERIALS", TIMEANDMATERIALSBUILDER: "TIME_MATERIALS",
  CUSTOM: "CUSTOM", CUSTOMBUILDER: "CUSTOM",
  CUSTOMITEMS: "CUSTOM", CUSTOMITEMSBUILDER: "CUSTOM",
}

function moduleKey(module: string) {
  return module.trim().toUpperCase().replace(/&/g, "AND").replace(/[^A-Z0-9]/g, "")
}

export function canonicalQuoteModule(module: string) {
  return canonicalModulesByKey[moduleKey(module)]
}

/** Resolves canonical enum values and historical human-readable module labels. */
export function quoteBuilderRoute(module: string) {
  return routesByModuleKey[moduleKey(module)]
}