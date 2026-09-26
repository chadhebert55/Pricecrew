import type { MaterialPreference, MaterialSnapshot } from "@workspace/db";

export type CatalogMaterial = {
  id?: number;
  item: string;
  unit?: string;
  unitCost: number;
  isDefault: boolean;
  isContractorOwned?: boolean;
  supplier?: string | null;
  supplierSku?: string | null;
  manufacturer?: string | null;
  manufacturerPartNumber?: string | null;
  sourceDate?: string | null;
  supplierCost?: number | null;
  supplierUom?: string | null;
  normalizedUnit?: string | null;
  normalizedUnitCost?: number | null;
  supplierUnitQuantity?: number | null;
  materialPreferences?: MaterialPreference[] | null;
  panelFamily?: string | null;
};

export const materialKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Only dimensional conversions explicitly established by the catalog/import are safe. */
export function normalizeSupplierCost(raw: number, uom: string, baseUnit?: string | null, quantity?: number | null) {
  const unit = materialKey(uom);
  const base = materialKey(baseUnit ?? "");
  if (!Number.isFinite(raw) || raw < 0) return null;
  const each = ["ea", "each"].includes(unit);
  const foot = ["ft", "foot", "feet"].includes(unit);
  if (["sheet", "set", "kit", "lot", "scope", "hour", "hr", "pair"].includes(unit) && (!base || base === unit))
    return { normalizedUnit: unit, normalizedUnitCost: raw, supplierUnitQuantity: 1 };
  if (each || foot) {
    const normalizedUnit = each ? "ea" : "ft";
    if (base && ![normalizedUnit, each ? "each" : "feet", each ? "ea" : "foot"].includes(base)) return null;
    return { normalizedUnit, normalizedUnitCost: raw, supplierUnitQuantity: 1 };
  }
  // 'c' specifies count, NOT whether the base dimension is each or feet.
  if (!["ea", "each", "ft", "foot", "feet"].includes(base)) return null;
  const divisor = unit === "c" ? 100 : ["m", "per thousand feet"].includes(unit) ? 1000
    : ["pack", "package", "box", "roll"].includes(unit) ? quantity : null;
  if (!divisor || !Number.isFinite(divisor) || divisor <= 0) return null;
  if (unit === "per thousand feet" && !["ft", "foot", "feet"].includes(base)) return null;
  return { normalizedUnit: ["ea", "each"].includes(base) ? "ea" : "ft",
    normalizedUnitCost: Number((raw / divisor).toFixed(6)), supplierUnitQuantity: divisor };
}

export function breakerManufacturerCompatible(item: CatalogMaterial, selection: string) {
  const selected = materialKey(selection);
  const make = materialKey(item.manufacturer ?? "");
  const family = materialKey(item.panelFamily ?? "");
  const part = materialKey(item.manufacturerPartNumber ?? "").replace(/^(sqd|ite|c h|cutler hammer|eaton) /, "").replace(/ /g, "");
  if (selected.startsWith("square d")) {
    if (!make.startsWith("square d")) return false;
    const requested = selected.includes("homeline") ? "homeline" : selected.includes("qo") ? "qo" : "";
    const actual = family || (part.startsWith("hom") ? "homeline" : part.startsWith("qo") ? "qo" : "");
    // Legacy Square D selections were Homeline in PriceCrew. Never substitute QO.
    return requested ? actual === requested : actual !== "qo";
  }
  if (selected.startsWith("eaton")) {
    if (!make.startsWith("eaton")) return false;
    const requested = selected.includes("br") ? "br" : selected.includes("ch") ? "ch" : "";
    const actual = family || (part.startsWith("br") ? "br" : part.startsWith("ch") ? "ch" : "");
    return requested ? actual === requested : actual !== "ch";
  }
  return make === selected;
}

export function usableCatalogCost(item: CatalogMaterial): number | null {
  if (item.isDefault || materialKey(item.item).startsWith("unverified ")) return null;
  if (item.isContractorOwned) return Number.isFinite(item.unitCost) && item.unitCost > 0 ? item.unitCost : null;
  if (item.supplierCost != null || item.supplierUom != null) {
    if (item.supplierCost == null || !item.supplierUom) return null;
    const converted = normalizeSupplierCost(item.supplierCost, item.supplierUom, item.normalizedUnit, item.supplierUnitQuantity);
    if (!converted || converted.normalizedUnitCost <= 0 || materialKey(converted.normalizedUnit) !== materialKey(item.unit ?? "")) return null;
    // Stored normalized cost is a checksum, not a second mutable pricing engine.
    if (item.normalizedUnitCost != null && Math.abs(item.normalizedUnitCost - converted.normalizedUnitCost) > 0.0000005) return null;
    return converted.normalizedUnitCost;
  }
  // Legacy canonical prices remain usable; unknown package units never become each prices.
  if (item.unit && !["ea", "each", "ft", "foot", "feet", "sheet", "set", "kit", "lot", "scope", "hour", "hr", "pair", "pack", "roll"].includes(materialKey(item.unit))) return null;
  return Number.isFinite(item.unitCost) && item.unitCost > 0 ? item.unitCost : null;
}

const rank = { exact: 1, manufacturer: 2, family: 3, alternate: 4 } as const;
export function matchingPreferences(item: CatalogMaterial, requestKey: string, manufacturer?: string) {
  return (item.materialPreferences ?? []).filter(p =>
    materialKey(p.requestKey) === materialKey(requestKey) &&
    (!p.manufacturer || materialKey(p.manufacturer) === materialKey(manufacturer ?? "")));
}

/** Preferences never bypass the caller's electrical compatibility predicate. */
export function selectCatalogMaterial<T extends CatalogMaterial>(
  items: T[], compatible: (item: T) => boolean, requestKey = "", manufacturer?: string,
): { status: "none" | "ambiguous" | "unique"; candidates: T[]; match?: T; resolutionStatus?: string } {
  const candidates = items.filter(compatible);
  const ranked = candidates.map(item => ({ item,
    preference: matchingPreferences(item, requestKey, manufacturer).sort((a,b) => rank[a.kind] - rank[b.kind])[0] }));
  const preferred = ranked.filter(row => row.preference);
  // An explicitly selected but unpriced preferred item must not silently fall back.
  const pool = preferred.length ? preferred : ranked.filter(row => usableCatalogCost(row.item) !== null);
  const min = Math.min(...pool.map(row => row.preference ? rank[row.preference.kind] : 5));
  const winners = pool.filter(row => (row.preference ? rank[row.preference.kind] : 5) === min);
  if (!winners.length) return { status: "none", candidates };
  if (winners.length > 1) return { status: "ambiguous", candidates: winners.map(row => row.item) };
  const winner = winners[0];
  return { status: "unique", candidates: [winner.item], match: winner.item,
    resolutionStatus: winner.preference?.kind === "alternate" ? "RESOLVED_APPROVED_ALTERNATE"
      : winner.preference ? "RESOLVED_COMPANY_PREFERRED"
      : manufacturer ? "RESOLVED_MANUFACTURER_MATCH" : "RESOLVED_SUPPLIER_EXACT" };
}

export function catalogSnapshot(item: CatalogMaterial, status: string, requestKey: string): MaterialSnapshot {
  return { catalogId: item.id ?? null, requestKey, supplier: item.supplier ?? null,
    supplierSku: item.supplierSku ?? null, manufacturer: item.manufacturer ?? null,
    manufacturerPartNumber: item.manufacturerPartNumber ?? null, description: item.item,
    supplierCost: item.supplierCost ?? null, supplierUom: item.supplierUom ?? null,
    normalizedUnit: item.normalizedUnit ?? item.unit ?? null,
    normalizedUnitCost: usableCatalogCost(item), sourceDate: item.sourceDate ?? null,
    resolutionStatus: usableCatalogCost(item) === null ? (item.supplierUom ? "UNRESOLVED_UOM" : "UNRESOLVED_NO_MATCH")
      : item.isContractorOwned ? "MANUAL_OVERRIDE" : status };
}
