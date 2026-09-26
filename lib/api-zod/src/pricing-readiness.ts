type SavedAssemblyCost = {
  id: string;
  category: string;
  description: string;
  source: string;
  quantity: number;
  unit: string;
  unitCost: number;
  extendedCost: number;
  intentionalExclusionReason?: string | null;
};

export const PANEL_CLOSEOUT_LABOR_REASON =
  "Panel directory preparation and final circuit labeling are included in the assembly labor; no separate material cost applies.";

/**
 * Recognize the exact labor-only rows emitted before explicit exclusion reasons
 * were saved. Do not exempt arbitrary materials merely labeled as labor.
 * This is a read-time compatibility rule: saved prices/totals are not rewritten.
 */
export function isIncludedPanelCloseoutLabor(line: SavedAssemblyCost): boolean {
  return (
    (line.id === "panel-directory-labeling" ||
      line.id === "panel-replacement-closeout") &&
    line.category === "Closeout" &&
    line.description ===
      "Prepare panel directory and complete final circuit labeling" &&
    line.source === "Included labor scope" &&
    line.unit === "scope" &&
    line.quantity === 1 &&
    line.unitCost === 0 &&
    line.extendedCost === 0
  );
}

export function hasUnresolvedMaterialCost(line: SavedAssemblyCost): boolean {
  return (
    line.quantity > 0 &&
    line.unitCost <= 0 &&
    (line.intentionalExclusionReason?.trim().length ?? 0) < 10 &&
    !isIncludedPanelCloseoutLabor(line)
  );
}
