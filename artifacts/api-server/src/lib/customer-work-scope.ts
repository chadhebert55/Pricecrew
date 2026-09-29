import type {
  AssemblyLineRecord,
  PricingRecord,
  QuoteJobInputsRecord,
} from "@workspace/db";

export type CustomerScopeLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  displayValue?: string;
};
export type ScopeContext = {
  inputs?: QuoteJobInputsRecord;
  pricing?: PricingRecord;
};
export type WorkScope = {
  scope: CustomerScopeLine[];
  assumptions: string[];
  reviewIssues: string[];
};
const n = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
const generic =
  /^(?:electrical material|circuit breaker|material|misc(?:ellaneous)? material|unknown material|assembly item)(?:\s+\d+)?$/i;
export const isMeaningfulCustomerDescription = (s: string) =>
  !!s.trim() &&
  !generic.test(s.trim()) &&
  !/https?:|www\.|\b(?:SKU|UPC|catalog ID|unitCost|gross margin|loaded labor|internal notes)\b|\[object Object\]|\{\s*"/i.test(
    s,
  );
const supplied = (l: AssemblyLineRecord) =>
  l.resolutionStatus === "CUSTOMER_SUPPLIED" ||
  /customer.supplied|customer supplies|customer is supplying|builder\s*\/\s*gc.supplied/i.test(
    `${l.intentionalExclusionReason ?? ""} ${l.source} ${l.description}`,
  );

/** A presentation registry over immutable saved scope, never catalog lookup or estimation.
 * New builders must register semantic work here; unknown modules fail closed with an internal review issue.
 */
export const customerScopeModules = [
  "ADDITION",
  "NEW_HOUSE",
  "KITCHEN",
  "BATHROOM",
  "RECESSED_LIGHTING",
  "EV_CHARGER",
  "SERVICE_UPGRADE",
  "SERVICE_CALL",
  "TIME_MATERIALS",
  "TIME_AND_MATERIALS",
  "CUSTOM",
  "PANEL_REPLACEMENT",
] as const;
export function customerWorkScope(
  module: string,
  lines: AssemblyLineRecord[],
  context: ScopeContext = {},
): WorkScope {
  const scope: CustomerScopeLine[] = [],
    assumptions: string[] = [],
    reviewIssues: string[] = [];
  const inputs = (context.inputs ?? {}) as unknown as Record<string, unknown>;
  const matching = (pattern: RegExp) => lines.filter((l) => pattern.test(l.id));
  const present = (pattern: RegExp) => matching(pattern).length > 0;
  const add = (
    id: string,
    description: string,
    quantity = 1,
    unit = "scope",
    displayValue?: string,
  ) => {
    if (quantity > 0)
      scope.push({
        id,
        description,
        quantity,
        unit,
        displayValue:
          displayValue ??
          (unit === "scope"
            ? "Included"
            : `${quantity} ${unit}${quantity === 1 || unit.endsWith("s") ? "" : "s"}`),
      });
  };
  const count = (
    id: string,
    label: string,
    pattern: RegExp,
    unit = "location",
  ) => {
    const found = matching(pattern);
    const normal = found.filter((l) => !supplied(l)),
      customer = found.filter(supplied);
    if (normal.length)
      add(
        id,
        label,
        normal.reduce((s, l) => s + l.quantity, 0),
        unit,
      );
    if (customer.length)
      add(
        `${id}-supplied`,
        `Install customer-supplied ${label.replace(/^Install /i, "").toLowerCase()}`,
        customer.reduce((s, l) => s + l.quantity, 0),
        unit,
      );
  };
  const included = (
    id: string,
    label: string,
    pattern: RegExp,
    displayValue = "Included",
  ) => {
    const found = matching(pattern);
    if (found.length) add(id, label, 1, "scope", displayValue);
  };
  const controls = (pattern: RegExp) =>
    included("controls", "Switching and lighting controls", pattern);
  const circuits = (pattern: RegExp, label = "New branch circuits") => {
    const found = matching(pattern);
    add(
      `circuits-${label}`,
      label,
      found.reduce((s, l) => s + l.quantity, 0),
      "circuit",
    );
  };
  const finish = () => {
    if (scope.length) add("testing", "Testing and final trim");
  };
  if (module === "ADDITION") {
    count(
      "receptacles",
      "Install general-use receptacles",
      /^addition-receptacles$/,
    );
    count("switches", "Install switches", /^addition-switches$/);
    count("dimmers", "Install dimmers", /^addition-dimmers$/);
    count(
      "recessed",
      "Install recessed lighting",
      /^addition-recessed-lights$/,
      "fixture",
    );
    count("fans", "Install ceiling fans", /^addition-ceiling-fans$/);
    count(
      "exhaust",
      (inputs.bathroomExhaust as {control?:string})?.control === "Stacked single-pole/single-pole"
        ? "Install bathroom exhaust fans with independent light/fan controls"
        : "Install bathroom exhaust fans",
      /^addition-exhaust-fans$/,
    );
    circuits(/^addition-(?:circuit-\d+-breaker|breakers)$/);
    included("subpanel", "Subpanel installation", /^addition-subpanel-/);
    const fan = inputs.ceilingFanInstallation as
      | {
          mode?: string;
          supportVerified?: boolean;
          wiringVerified?: boolean;
          verifiedFanQuantity?: number;
        }
      | undefined;
    if (present(/^addition-ceiling-fans$/)) {
      if (
        fan?.mode === "reuse" &&
        fan.supportVerified &&
        fan.wiringVerified &&
        fan.verifiedFanQuantity === n(inputs.ceilingFans)
      )
        assumptions.push(
          "Existing fan-rated support, wiring and controls will be reused as verified by the estimator.",
        );
      else if (fan?.mode === "new" && present(/^addition-fan-support$/))
        assumptions.push(
          "New fan-rated support, selected on/off controls and additional wiring are included for the ceiling-fan locations.",
        );
    }
    if (present(/^addition-exhaust-fans$/))
      assumptions.push(
        "Bathroom exhaust-fan scope is electrical only; ductwork is not included.",
      );
    finish();
  } else if (module === "NEW_HOUSE") {
    for (const [id, label, unit] of [
      ["outlets", "general receptacles", "location"],
      ["switches", "standard switches", "location"],
      ["dimmers", "dimmers", "location"],
      ["recessed-lights", "recessed lighting", "fixture"],
      ["smoke-co", "smoke/CO alarms", "device"],
      ["fans", "ceiling fans", "location"],
      ["bathroom-gfci", "bathroom GFCI receptacles", "location"],
      ["exterior-receptacles", "exterior receptacles", "location"],
      ["exterior-lighting", "exterior lighting", "location"],
      ["garage-receptacles", "garage receptacles", "location"],
    ])
      count(id!, `Install ${label}`, new RegExp(`^new-house-${id}$`), unit);
    // Grouped saved breaker totals remain authoritative. Inputs only split that total if they reconcile.
    const branch = matching(/^new-house-branch-breakers$/).reduce(
      (s, l) => s + l.quantity,
      0,
    );
    const fields = [
      ["kitchenApplianceCircuitQuantity", "Kitchen/appliance circuits"],
      ["laundryCircuitQuantity", "Laundry circuits"],
      ["garageCircuitQuantity", "Garage circuits"],
      ["commonBranchCircuitQuantity", "General branch circuits"],
    ] as const;
    if (
      branch > 0 &&
      fields.reduce((s, [key]) => s + n(inputs[key]), 0) === branch
    )
      fields.forEach(([key, label]) =>
        add(key, label, n(inputs[key]), "circuit"),
      );
    else circuits(/^new-house-branch-breakers$/);
    circuits(/^new-house-equipment-breakers$/, "HVAC and equipment circuits");
    included(
      "service",
      "Electrical panel/service allowance",
      /^new-house-service-panel-allowance$/,
    );
    finish();
  } else if (module === "KITCHEN") {
    for (const [id, label] of [
      ["countertop-receptacles", "countertop receptacles"],
      ["usb-receptacles", "USB receptacles"],
      ["sink-lights", "sink lighting"],
      ["island-pendants", "island pendant lights"],
      ["undercabinet-lighting", "undercabinet lighting"],
      ["recessed-lights", "recessed lighting"],
    ])
      count(id!, `Install ${label}`, new RegExp(`^${id}$`));
    const labels: Record<string, string> = {
      refrigeratorCircuits: "Refrigerator circuit",
      dishwasherCircuits: "Dishwasher circuit",
      disposalCircuits: "Disposal circuit",
      gasRangeCircuits: "Gas range circuit",
      electricRangeCircuits: "Electric range circuit",
      wallOvenCircuits: "Wall oven circuit",
      smallApplianceCircuits: "Small-appliance circuits",
      microwaveCircuits: "Microwave circuit",
      additionalDedicatedCircuits: "Other dedicated circuits",
    };
    let named = false;
    for (const [key, label] of Object.entries(labels)) {
      const quantity = n(inputs[key]);
      if (
        quantity &&
        present(new RegExp(`^kitchen-home-run-${key}$|^${key}$`))
      ) {
        add(key, label, quantity, "circuit");
        named = true;
      }
    }
    if (present(/^kitchen-(home-run-lighting|lighting-circuit)/))
      add("lighting-circuit", "Lighting circuit", 1, "circuit");
    if (!present(/^kitchen-home-run-/)) {
      count(
        "small-appliance",
        "Small-appliance circuits",
        /^kitchen-small-appliance-circuit(?:s|-[12])-device$/,
        "circuit",
      );
      count(
        "microwave",
        "Microwave circuit",
        /^kitchen-microwave-circuits?-device$/,
        "circuit",
      );
    }
    if (!named && !scope.some((s) => s.unit === "circuit"))
      included(
        "protection",
        "Selected circuit protection",
        /^kitchen-.*breaker|^.*Circuits-breaker$/,
      );
    controls(
      /^(three-way-options|dimmers|smart-switches|kitchen-smart-switches|kitchen-four-way-switches)$/,
    );
    finish();
  } else if (module === "BATHROOM") {
    for (const [id, label] of [
      ["gfci-receptacles", "bathroom GFCI receptacles"],
      ["additional-receptacles", "downstream receptacles"],
      ["vanity-lights", "vanity lighting"],
      ["recessed-lights", "recessed lighting"],
      ["bathroom-shower-lights", "shower lighting"],
      ["exhaust-fans", "bathroom exhaust fans"],
      ["fan-lights", "fan/light equipment"],
      ["fan-light-heat", "fan/light/heat equipment"],
    ])
      count(id!, `Install ${label}`, new RegExp(`^${id}$`));
    included(
      "floor",
      "Heated-floor electrical circuit and selected controls",
      /heated-floor|floor-thermostat/,
    );
    const bathroomCircuits = inputs.bathroomCircuits as
      Array<{ quantity: number }> | undefined;
    if (
      inputs.circuitConfigurationVersion === 2 &&
      Array.isArray(bathroomCircuits)
    ) {
      const qty =
        bathroomCircuits.reduce((s, c) => s + n(c.quantity), 0) +
        (inputs.heatedFloorCircuit && !inputs.heatedFloorCircuitKey ? 1 : 0);
      add("bathroom-circuits", "New bathroom branch circuits", qty, "circuit");
    } else
      circuits(
        /^bathroom-(?:breaker-|15a-circuit-protection)/,
        "New bathroom branch circuits",
      );
    controls(
      /^bathroom-(single-pole|three-way|dimmers|smart|fan-controls)$|^additional-switches$/,
    );
    if (
      !present(/^bathroom-(?:breaker-|15a-circuit-protection)/) &&
      inputs.circuitOption === "Reuse existing circuit"
    )
      add(
        "existing-circuit",
        "Existing bathroom circuit",
        1,
        "scope",
        "Extend/reuse",
      );
    finish();
  } else if (module === "RECESSED_LIGHTING") {
    count(
      "lights",
      "Install recessed lighting",
      /^(recessed-fixtures|additional-lights)$/,
      "fixture",
    );
    const groups = inputs.lightingGroups as
      Array<{ quantity: number }> | undefined;
    if (Array.isArray(groups) && groups.some((g) => n(g.quantity) > 0))
      add(
        "groups",
        "Lighting groups",
        groups.filter((g) => n(g.quantity) > 0).length,
        "group",
      );
    const kinds = [
      [/dimmer$/, "Dimmer controls"],
      [/smart/, "Smart lighting controls"],
      [/three-way|four-way/, "Multi-location switching"],
      [/switch$/, "Lighting switches"],
    ] as const;
    for (const [pattern, label] of kinds)
      included(
        label,
        label,
        new RegExp(`^recessed-.*${pattern.source.replace(/\$$/, "")}$`),
      );
    included("legacy-smart", "Smart lighting controls", /^smart-switch-kit$/);
    included("legacy-dimmer", "Dimmer controls", /^dimmer$/);
    included(
      "legacy-controls",
      "Lighting switches",
      /^(switch-controls|additional-switches)$/,
    );
    if (
      ["Create new light locations", "Replace existing fixtures"].includes(
        String(inputs.locationType),
      )
    )
      add("locations", String(inputs.locationType));
    const wiring: Record<string, string> = {
      "Existing wiring / fixture replacement": "Reuse existing lighting wiring",
      "Extend existing lighting circuit": "Extend existing lighting circuit",
      "New wiring from nearby source": "New lighting wiring from nearby source",
      "New home run to panel": "New lighting home run and circuit protection",
    };
    if (wiring[String(inputs.wiringScope)])
      add("wiring", wiring[String(inputs.wiringScope)]!);
    else
      included(
        "wiring",
        "Selected lighting wiring and circuit connections",
        /^recessed-.*(?:wire|wiring|protection)/,
      );
    finish();
  } else if (module === "SERVICE_UPGRADE") {
    const rating = /^(100|125|150|200|225|320|400)A$/.test(
      String(inputs.serviceSize),
    )
      ? `${inputs.serviceSize} `
      : "";
    if (present(/^service-(panel|meter-disconnect|breaker)$/))
      add("service", `${rating}electrical service upgrade`);
    included("meter", "Meter/main equipment", /^service-meter-disconnect$/);
    included("panel", "Electrical panel installation", /^service-panel$/);
    included(
      "mast",
      "Service entrance mast and raceway",
      /^mast-(?!conductors)/,
    );
    included("entrance", "Service entrance conductors", /^mast-conductors$/);
    included(
      "feeder",
      "Service-to-panel conductors and raceway",
      /^service-to-panel-/,
    );
    included(
      "grounding",
      "Grounding and bonding system",
      /^(ground-|grounding-|bonding-|water-meter-|acorn-|intersystem-)/,
    );
    included(
      "surge",
      "Whole-home surge protection",
      /^service-surge-protection$/,
    );
    included(
      "breakers",
      "Selected branch-circuit connections and protection",
      /^(existing-breaker-|service-breaker$)/,
    );
    included(
      "backing",
      "Panel mounting/backboard",
      /^(job-lumber|plywood-backing|studs)$/,
    );
    count("outlet", "Install service-area receptacle", /^receptacle-20a$/);
    included(
      "labels",
      "Circuit identification, testing and cleanup",
      /^panel-directory-labeling$/,
    );
  } else if (module === "EV_CHARGER") {
    const qty =
      n(inputs.chargerQuantity) ||
      matching(/^breaker$/).reduce((s, l) => s + l.quantity, 0);
    add("ev-circuit", "Level 2 EV charger circuit", qty, "circuit");
    if (qty) {
      const supply = String(inputs.chargerSupply);
      add(
        "ev-install",
        /customer|builder|gc/i.test(supply)
          ? "Install customer-supplied EV charger"
          : "EV charger installation",
        qty,
        "charger",
      );
    }
    included("routing", "Circuit routing and wiring", /^(cable|hots|ground)$/);
    included("raceway", "Conduit/raceway installation", /^raceway$/);
    included("protection", "Required circuit protection", /^breaker$/);
    included("connection", "Charger receptacle connection", /^receptacle$/);
    included("load", "Load management equipment", /^load-management$/);
    included("disconnect", "Equipment disconnect", /^disconnect$/);
    included("surge", "Surge protection", /^surge$/);
    included("panel", "Selected panel modifications", /^panel-modification$/);
    if (qty) add("testing", "Testing and commissioning");
  } else if (module === "SERVICE_CALL") {
    for (const [id, label] of [
      ["standard-receptacle-replacement", "Replace receptacles"],
      ["tr-receptacle-replacement", "Replace tamper-resistant receptacles"],
      ["single-pole-switch-replacement", "Replace switches"],
      ["gfci-replacement", "Replace GFCI receptacles"],
    ])
      count(id!, label!, new RegExp(`^${id}$`));
    if (n(inputs.visitQuantity))
      add(
        "visit",
        "Electrical service visit",
        n(inputs.visitQuantity),
        "visit",
      );
    assumptions.push(
      "Service work is limited to the tasks described in this proposal.",
    );
  } else if (["TIME_MATERIALS", "TIME_AND_MATERIALS"].includes(module)) {
    const p = context.pricing;
    if (p && n(p.finalLaborHours))
      add(
        "labor",
        "Electrical labor",
        n(p.finalLaborHours),
        "person-hour",
        `${p.finalLaborHours} person-hours${n(p.laborSellRate) ? ` at $${p.laborSellRate!.toFixed(2)}/hour` : ""}`,
      );
    else if (n(inputs.crewSize) * n(inputs.crewHours))
      add(
        "labor",
        "Electrical labor",
        n(inputs.crewSize) * n(inputs.crewHours),
        "person-hour",
      );
    if (lines.length)
      add(
        "materials",
        "Materials and approved job costs",
        1,
        "scope",
        "Included in total investment",
      );
    assumptions.push(
      "Time and materials is an authorization estimate; actual usage is confirmed before invoicing.",
    );
  } else if (module !== "CUSTOM") {
    reviewIssues.push(
      "No customer-scope definition exists for this builder. Review the proposal description before sharing.",
    );
  }
  // Explicit quote-local work descriptions are not catalog descriptions. Never expose automatic supplier text.
  if (!["TIME_MATERIALS", "TIME_AND_MATERIALS"].includes(module)) {
    for (const line of lines.filter((l) =>
      /^(custom-material-|misc-)|^manual-work$/.test(l.id),
    )) {
      const text = line.description.trim();
      if (
        isMeaningfulCustomerDescription(text) &&
        !/^(?:Miscellaneous|Custom) material \d+$/i.test(text) &&
        /custom|manual|contractor-entered/i.test(line.source)
      ) {
        const label =
          supplied(line) && !/(?:customer|owner|gc).supplied/i.test(text)
            ? `Customer-supplied: ${text}`
            : text;
        add(
          line.id,
          label,
          line.quantity,
          ["ea", "each"].includes(line.unit) ? "location" : line.unit,
          line.unit === "allowance" ? "Included" : undefined,
        );
      } else
        reviewIssues.push(
          `Customer-facing description needed for saved item ${line.id}; revise its customer-facing item description.`,
        );
    }
    if (
      module === "CUSTOM" &&
      !scope.length &&
      n(context.pricing?.finalLaborHours)
    )
      add("labor", "Electrical work described above");
  }
  for (const line of lines.filter(
    (l) =>
      /^(?:panel-)?(?:permit|inspection|utility-coordination|miscellaneous)-allowance$|^permit$/.test(
        l.id,
      ) && l.extendedCost > 0,
  )) {
    const label = /inspection/.test(line.id)
      ? "Inspection allowance"
      : /utility/.test(line.id)
        ? "Utility coordination"
        : /miscellaneous/.test(line.id)
          ? "Selected job allowance"
          : "Permit allowance";
    add(line.id, label);
  }
  // Only these supporting identities are intentionally absorbed into work above.
  // Unknown work stays visible to the estimator instead of silently disappearing.
  const known: Record<string, RegExp> = {
    ADDITION:
      /^addition-(?:receptacles|switches|dimmers|recessed-lights|ceiling-fans|fan-(?:support|controls|boxes|plates|wiring)|exhaust-(?:fans|controls|boxes|plates|wiring)|cable|breakers|circuit-\d+-(?:cable|breaker)|subpanel-(?:feeder|feeder-breaker|load-center))$/,
    NEW_HOUSE:
      /^new-house-(?:outlets|switches|dimmers|recessed-lights|smoke-co|fans|bathroom-gfci|exterior-receptacles|exterior-lighting|garage-receptacles|branch-cable|branch-breakers|equipment-cable|equipment-breakers|service-panel-allowance)$/,
    KITCHEN:
      /^(?:countertop-receptacles|usb-receptacles|sink-lights|island-pendants|undercabinet-lighting|recessed-lights|three-way-options|dimmers|(?:refrigerator|dishwasher|disposal|gasRange|electricRange|wallOven|additionalDedicated)Circuits|kitchen-(?:home-run-.+|breaker-.+|breakers-(?:15a|20a)|circuit-connectors-.+|connection-.+|receptacle-.+|smart-(?:switches|boxes|plates)|four-way-(?:switches|boxes|plates|cable)|boxes|plates|countertop-plates|decorator-plates|switch-plates|wiring|appliance-(?:devices|boxes|plates|home-run-cable)|lighting-circuit.*|small-appliance-circuit.*|microwave-circuit.*|countertop-circuit-protection))$/,
    BATHROOM:
      /^(?:gfci-receptacles|additional-receptacles|vanity-lights|recessed-lights|exhaust-fans|fan-lights|fan-light-heat|heated-floor|additional-switches|bathroom-(?:home-run-.+|breaker-.+|circuit-connectors-.+|15a-circuit-(?:cable|materials|protection)|single-pole|three-way|dimmers|smart|fan-controls|floor-thermostat|shower-lights|device-boxes|decora-plates|duplex-plates|fixture-boxes|boxes|plates|wiring))$/,
    RECESSED_LIGHTING:
      /^(?:additional-lights|smart-switch-kit|switch-controls|additional-switches|dimmer|recessed-(?:fixtures|installation-materials|branch-wiring|traveler-wire|group-\d+-(?:switch|dimmer|smart|three-way|four-way)|control-boxes|control-plates|wiring|circuit-protection|home-run-.+|breaker-.+|circuit-connectors-.+))$/,
    EV_CHARGER:
      /^(?:breaker|charger|hots|ground|raceway|cable|receptacle|load-management|disconnect|surge|panel-modification)$/,
    SERVICE_CALL:
      /^(?:standard-receptacle-replacement|tr-receptacle-replacement|single-pole-switch-replacement|gfci-replacement)$/,
    SERVICE_UPGRADE:
      /^(?:service-(?:panel|meter-disconnect|breaker|surge-protection)|mast-(?:raceway|weatherhead|expansion-coupling|straps|hub|lb|90|couplings|related-parts|conductors)|service-to-panel-(?:conductor|raceway)|ground-bars|ground-rods|acorn-clamps|intersystem-bonding|grounding-conductor|bonding-conductor|grounding-pvc|grounding-pvc-fittings|water-meter-bonding|water-meter-bonding-conductor|four-square-box|receptacle-20a|receptacle-plate|job-lumber|plywood-backing|studs|duct-seal|pvc-primer|pvc-glue|anti-oxidant|electrical-tape|panel-directory-labeling|existing-breaker-.+)$/,
    CUSTOM: /^custom-material-/,
  };
  const common =
    /^(?:custom-material-|misc-)|^manual-work$|^(?:panel-)?(?:permit|inspection|utility-coordination|miscellaneous)-allowance$|^permit$/;
  if (known[module])
    for (const line of lines)
      if (!known[module]!.test(line.id) && !common.test(line.id))
        reviewIssues.push(
          `Saved item ${line.id} has no customer-scope mapping; review its installation scope before sharing.`,
        );
  if (!scope.length && !reviewIssues.length)
    reviewIssues.push(
      "Saved estimate lacks recognizable customer work. Provide a customer-facing proposal description.",
    );
  return { scope, assumptions, reviewIssues };
}
