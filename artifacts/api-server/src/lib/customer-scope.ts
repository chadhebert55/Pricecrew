import type { AssemblyLineRecord } from "@workspace/db";

type PublicScopeLine = {
  id: string; description: string; quantity: number; unit: string; displayValue?: string;
};

/**
 * A view of the saved snapshot, never a recalculation or a catalog lookup.
 * Zero-cost included labor/reused materials are real scope; only explicitly
 * not-required or zero allowances are omitted.
 */
export function customerProposalScope(module: string, assembly: AssemblyLineRecord[]): { scope: PublicScopeLine[]; assumptions: string[] } {
  const lines = assembly.filter(line => {
    if (line.quantity <= 0) return false;
    const allowance = line.unit === "allowance" || /-allowance$/.test(line.id);
    return !(allowance && line.unitCost === 0);
  });
  if (["KITCHEN", "BATHROOM", "RECESSED_LIGHTING"].includes(module)) {
    // Group saved work, not catalog products. Never invent scope or recalculate.
    const groups = new Map<string, { supplied: boolean; contractor: boolean }>();
    for (const line of lines) {
      const category = line.category.toLowerCase();
      const label = /allowance|permit/.test(category) ? "Selected job allowances"
        : /protection|circuit/.test(category) ? "Circuit connections & protection"
        : /conductor|cable|wire|raceway|rough/.test(category) ? "Wiring & installation materials"
        : /control|switch/.test(category) ? "Lighting & equipment controls"
        : /device|receptacle/.test(category) ? "Receptacles & controls"
        : /fixture|light/.test(category) ? "Lighting installation"
        : /equipment|fan|heat/.test(category) ? "Electrical equipment installation"
        : "Electrical installation work";
      const group = groups.get(label) ?? { supplied: false, contractor: false };
      if (/customer.supplied/i.test(line.intentionalExclusionReason ?? "")) group.supplied = true;
      else group.contractor = true;
      groups.set(label, group);
    }
    return { scope: [...groups].map(([description, group], i) => ({
      id: `customer-work-${i}`, description, quantity: 1, unit: "scope",
      displayValue: group.supplied ? (group.contractor ? "Included; some items customer supplied" : "Install customer-supplied items") : "Included",
    })), assumptions: [] };
  }
  if (module !== "PANEL_REPLACEMENT") {
    return { scope: lines.map(line => ({
      id: line.id, description: customerMaterialDescription(line.description, line),
      quantity: line.quantity, unit: line.unit,
    })), assumptions: [] };
  }
  const scope: PublicScopeLine[] = [];
  const assumptions: string[] = [];
  const used = new Set<string>();
  const add = (id: string, description: string, members: AssemblyLineRecord[], displayValue = "Included") => {
    if (!members.length) return;
    members.forEach(line => used.add(line.id));
    scope.push({ id, description, quantity: 1, unit: "scope", displayValue });
  };
  const byIds = (...ids: string[]) => lines.filter(line => ids.includes(line.id));
  const panel = lines.find(line => line.id === "panel-replacement-panel");
  if (panel) {
    add("panel", customerMaterialDescription(panel.description, panel), [panel],
      panel.quantity === 1 ? "Included" : `${panel.quantity} included`);
    const main = lines.find(line => line.id === "panel-replacement-breaker");
    if (main?.unitCost === 0 && /\bmain breaker is included\b/i.test(main.intentionalExclusionReason ?? ""))
      used.add(main.id); // Included with the panel, never a second supplied item.
  }
  const feeder = lines.find(line => line.id === "panel-replacement-feeder");
  if (feeder) {
    const reuse = /^Reuse existing feeder cable$/i.test(feeder.description.trim());
    add("feeder", reuse ? "Existing feeder" : "New feeder installation", [feeder],
      reuse ? "Reconnect/reuse" : "Included");
    if (reuse) assumptions.push("Existing feeder cable will be reused only after field verification of its condition, size, ampacity, length, terminations, grounding, and suitability for the new panel.");
  }
  add("grounding", "Grounding & bonding", byIds(
    "panel-ground-bars", "panel-ground-rods", "panel-grounding-conductor", "panel-bonding-conductor"));
  add("breakers", "Required circuit breakers", lines.filter(line =>
    !used.has(line.id) && (line.id === "panel-replacement-breaker" || line.id.startsWith("panel-existing-breaker-"))));
  add("backboard", "Panel mounting/backboard", byIds("panel-plywood", "panel-studs"));
  add("raceway", "Feeder conduit and fittings", byIds("feeder-raceway", "feeder-raceway-fittings"));
  // Ancillary installation materials are included in the panel work, not shown
  // as a shopping list. If there is no panel row, keep an explicit work item.
  const supplies = byIds("panel-space-fillers", "panel-knockout-seals", "panel-anti-oxidant", "panel-electrical-tape");
  if (panel) supplies.forEach(line => used.add(line.id));
  else add("supplies", "Panel installation materials", supplies);
  for (const line of lines.filter(line => /-allowance$/.test(line.id))) {
    add(line.id, customerMaterialDescription(line.description, line), [line]);
  }
  const closeout = byIds("panel-replacement-closeout");
  // Preserve any custom or legacy scope without exposing supplier descriptions.
  const other = lines.filter(line => !used.has(line.id) && !closeout.includes(line));
  for (const line of other) {
    const label = customerMaterialDescription(line.description, line);
    if (label !== "Electrical material") add(line.id, label, [line], `${line.quantity} ${line.unit}`);
  }
  add("additional-work", "Additional electrical installation work",
    other.filter(line => !used.has(line.id)));
  add("directory", "Circuit identification & panel directory", closeout);
  add("closeout", "Testing & cleanup", closeout);
  return { scope, assumptions };
}

/**
 * Produces proposal-safe scope wording.  Catalog rows are deliberately
 * fail-closed: a future supplier naming convention must not become public
 * merely because it does not resemble a SKU.  User-entered allowances remain
 * useful unless they look like a branded catalog description.
 */
export function customerMaterialDescription(
  description: string,
  line?: {
    id?: string; category?: string; source?: string;
    unitCost?: number; intentionalExclusionReason?: string;
  },
) {
  // Builder IDs identify scope, not supplier inventory. Only constant wording
  // and narrowly validated electrical ratings may cross the public boundary.
  const id = line?.id ?? "";
  const labels: Record<string, string> = {
    "panel-space-fillers": "Panel filler plates",
    "panel-knockout-seals": "Panel knockout seals",
    "feeder-raceway": "Feeder conduit",
    "feeder-raceway-fittings": "Feeder conduit fittings",
    "panel-ground-bars": "Panel grounding bars",
    "panel-ground-rods": "Grounding electrodes (ground rods)",
    "panel-grounding-conductor": "#8 bare copper grounding conductor",
    "panel-bonding-conductor": "#4 copper bonding conductor",
    "panel-plywood": "Plywood panel backing",
    "panel-studs": "Framing lumber for panel backing",
    "panel-anti-oxidant": "Anti-oxidation compound",
    "panel-electrical-tape": "Electrical insulating tape",
    "panel-replacement-closeout": "Panel directory preparation and final circuit labeling",
    "panel-directory-labeling": "Panel directory preparation and final circuit labeling",
    "water-meter-bonding": "Water-meter bonding clamps",
    "water-meter-bonding-conductor": "#4 copper water-meter bonding conductor",
    "grounding-pvc": "Grounding conductor protective conduit",
    "grounding-pvc-fittings": "Grounding conduit fittings",
    "four-square-box": "Electrical junction box",
    "receptacle-20a": "20A receptacle",
    "receptacle-plate": "Receptacle cover plate",
    "plywood-backing": "Plywood panel backing",
    "studs": "Framing lumber for panel backing",
    "job-lumber": "Panel backing and framing lumber",
    "duct-seal": "Electrical duct seal",
    "pvc-primer": "Conduit primer",
    "pvc-glue": "Conduit cement",
    "anti-oxidant": "Anti-oxidation compound",
    "electrical-tape": "Electrical insulating tape",
  };
  if (Object.hasOwn(labels, id)) return labels[id]!;
  const allowance = id.match(/^(?:panel-)?(permit|inspection|utility-coordination|miscellaneous)-allowance$/);
  if (allowance) {
    const label = {
      permit: "Permit allowance", inspection: "Inspection allowance",
      "utility-coordination": "Utility coordination allowance",
      miscellaneous: "Miscellaneous work allowance",
    }[allowance[1]!]!;
    const notRequired = line?.unitCost === 0 &&
      /\bnot required\b/i.test(line?.intentionalExclusionReason ?? "");
    return `${label}${notRequired ? " (not required)" : ""}`;
  }
  if (id === "panel-replacement-feeder") {
    if (/^Reuse existing feeder cable$/i.test(description.trim()))
      return "Reuse existing feeder cable";
    const ser = description.match(/\b(4\/0 aluminum|2\/0 copper) SER\b/i);
    return ser ? `${ser[1]!.toLowerCase()} SER feeder cable` : "Panel feeder cable";
  }
  if (id === "panel-replacement-breaker" && line?.unitCost === 0 &&
      /\bmain breaker is included\b/i.test(line.intentionalExclusionReason ?? "")) {
    const rating = description.match(/\b(100|125|150|200|225|400)A\b/i);
    return `${rating ? `${rating[1]}A ` : ""}main breaker (included with panel)`;
  }
  if (id === "panel-replacement-panel") {
    const rating = description.match(/\b(100|125|150|200|225|400)A\b/i);
    const spaces = description.match(/\b(12|20|24|30|32|40|42|54|60)-space\b/i);
    return `${rating ? `${rating[1]}A ` : ""}${spaces ? `${spaces[1]}-space ` : ""}electrical panel`;
  }
  const rules: Array<[RegExp, string]> = [
    [
      /^Milbank .*200A meter-main.*$/i,
      "200A meter-main with built-in disconnect",
    ],
    [/^Siemens .*200A .*panel.*$/i, "200A Siemens panel"],
    [/^Square D .*100A .*load center.*$/i, "100A Square D panel"],
    [
      /^.*intersystem bonding (?:terminal|connector).*$/i,
      "Intersystem bonding connector",
    ],
    [/^#8 solid grounding conductor$/i, "#8 bare copper"],
    [/^#4 green bonding conductor$/i, "#4 green copper"],
    [/^.*Pass & Seymour.*traditional 3-way switches.*$/i, "3-way switches"],
    [/^.*Pass & Seymour.*single-pole switches?.*$/i, "Single-pole switch"],
    [/^.*Pass & Seymour.*GFCI.*$/i, "GFCI receptacle"],
    [/^.*Pass & Seymour.*duplex receptacle.*$/i, "Tamper-resistant receptacle"],
    [/^.*Legrand radiant.*single-pole switch.*$/i, "Single-pole switch"],
    [/^.*Lutron.*dimmer.*$/i, "Dimmer"],
    [/^.*Juno.*4-inch.*(?:wafer|light).*$/i, "4-inch recessed light"],
    [/^.*Juno.*6-inch.*(?:wafer|light).*$/i, "6-inch recessed light"],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(description)) return replacement;
  }
  if (/\bbreaker\b/i.test(description)) {
    const breaker = description.match(
      /(\d+A).*?(\d)-pole.*?(standard|GFCI|AFCI|dual-function).*?breaker/i,
    );
    return breaker
      ? `${breaker[1]} ${breaker[2]}-pole ${breaker[3]} breaker`
      : "Circuit breaker";
  }
  const genericForCategory = line?.category
    ?.toLocaleLowerCase()
    .includes("labor")
    ? "Electrical labor"
    : line?.category?.toLocaleLowerCase().includes("permit")
      ? "Permit and inspection allowance"
      : "Electrical material";
  const catalogOrigin =
    Boolean(line?.source) &&
    !/customer supplied|allowance|custom|manual|labor/i.test(
      line?.source ?? "",
    );
  // Catalog names, SKUs, URLs, supplier product codes, and unknown
  // supplier-origin descriptions are contractor-only.
  if (
    catalogOrigin ||
    /https?:\/\/|www\.|\b(?:sku|upc|model|part(?:\s*(?:no|number))?)\b/i.test(
      description,
    ) ||
    /[A-Z]{2,}[-\s]?\d{3,}|\b[A-Z0-9]{6,}\b/.test(description)
  ) {
    return genericForCategory;
  }
  // An initial capitalized vendor/brand token followed by a material is a
  // catalog-style name even when it has no URL or part number (for example,
  // “Acme Electrical conduit”). Keep ordinary human-entered scope useful.
  if (
    /^[A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,2}\s+(?:conduit|wire|cable|panel|breaker|receptacle|switch|fixture|fitting|material)s?$/.test(
      description,
    ) &&
    /^[A-Z]/.test(description)
  ) {
    return genericForCategory;
  }
  return description.trim() || genericForCategory;
}
