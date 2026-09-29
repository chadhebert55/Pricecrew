/** Semantic builder requests, not catalog products or electrical sizing rules. */
export const NEMA_1450 = "NEMA 14-50 receptacle";
export const NEMA_650 = "NEMA 6-50 receptacle";
export const STACKED_CONTROL =
  "Addition stacked single-pole/single-pole control";
export const STACKED_PLATE =
  "Addition stacked control matching white wall plate";
export const qualifiedComponentKinds: Record<string, string> = {
  [NEMA_1450]: "NEMA 14-50R",
  [NEMA_650]: "NEMA 6-50R",
  [STACKED_CONTROL]: "Stacked single-pole/single-pole",
  [STACKED_PLATE]: "Matching white wall plate",
};
export type ComponentProof = {
  kind: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  source: string;
  plateOpening?: "decorator" | "duplex" | "toggle";
};
type Product = {
  manufacturer?: string | null;
  manufacturerPartNumber?: string | null;
  unit?: string;
  materialPreferences?:
    { requestKey: string; verifiedComponent?: ComponentProof }[] | null;
};
const key = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function componentProof(
  item: Product,
  request: string,
): ComponentProof | undefined {
  const kind = qualifiedComponentKinds[request];
  return item.materialPreferences?.find(
    (p) =>
      key(p.requestKey) === key(request) &&
      p.verifiedComponent?.kind === kind &&
      !!p.verifiedComponent.source.trim() &&
      !!item.manufacturer?.trim() &&
      !!item.manufacturerPartNumber?.trim() &&
      key(p.verifiedComponent.manufacturer) === key(item.manufacturer) &&
      key(p.verifiedComponent.manufacturerPartNumber) ===
        key(item.manufacturerPartNumber) &&
      ["ea", "each"].includes(key(item.unit ?? "")) &&
      (![STACKED_CONTROL, STACKED_PLATE].includes(request) ||
        ["decorator", "duplex", "toggle"].includes(
          p.verifiedComponent.plateOpening ?? "",
        )),
  )?.verifiedComponent;
}
export const evCatalogComponents = [
  NEMA_1450,
  NEMA_650,
  "EV charger",
  "#8 copper THHN",
  "#10 copper grounding conductor",
  "1 in. EMT with fittings",
  "1 in. PVC with fittings",
  "8/2 SER cable",
  "6/3 NM-B cable",
  "8/2 NM-B cable",
  "8/3 NM-B cable",
  "load management device",
  "local disconnect",
  "whole-home surge protection",
  "panel modification allowance",
];
