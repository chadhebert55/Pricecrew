/** Semantic builder requests, not catalog products or electrical sizing rules. */
import {additionFeederRequests, additionSubpanelComponentRequests} from "./addition-rooms";
export const NEMA_1450 = "NEMA 14-50 receptacle";
export const NEMA_650 = "NEMA 6-50 receptacle";
export const STACKED_CONTROL =
  "Addition stacked single-pole/single-pole control";
export const STACKED_PLATE =
  "Addition stacked control matching white wall plate";
export const qualifiedComponentKinds: Record<string, string> = {
  ...Object.fromEntries(additionFeederRequests.map(request=>[request,"Qualified Addition SER feeder"])),
  ...Object.fromEntries(additionSubpanelComponentRequests.map(request=>[request,request.endsWith("load center")
    ? "Qualified Addition load center" : "Qualified Addition feeder breaker"])),
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
  compatibleControl?: {
    manufacturer: string;
    manufacturerPartNumber: string;
    source: string;
  };
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
  if (!kind) return undefined;
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
      (additionFeederRequests.includes(request as typeof additionFeederRequests[number])
        ? ["ft","foot","feet"].includes(key(item.unit ?? ""))
        : ["ea", "each"].includes(key(item.unit ?? ""))) &&
      (![STACKED_CONTROL, STACKED_PLATE].includes(request) ||
        ["decorator", "duplex", "toggle"].includes(
          p.verifiedComponent.plateOpening ?? "",
        )) &&
      (request !== STACKED_PLATE ||
        (!!p.verifiedComponent.compatibleControl?.manufacturer.trim() &&
         !!p.verifiedComponent.compatibleControl.manufacturerPartNumber.trim() &&
         !!p.verifiedComponent.compatibleControl.source.trim())),
  )?.verifiedComponent;
}
/** Matching openings are necessary, not sufficient: evidence names the exact control. */
export function compatibleStackedPlate(control: Product, plate: Product): boolean {
  const device = componentProof(control, STACKED_CONTROL);
  const cover = componentProof(plate, STACKED_PLATE);
  return !!device && !!cover?.compatibleControl &&
    device.plateOpening === cover.plateOpening &&
    key(cover.compatibleControl.manufacturer) === key(control.manufacturer ?? "") &&
    key(cover.compatibleControl.manufacturerPartNumber) === key(control.manufacturerPartNumber ?? "");
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
