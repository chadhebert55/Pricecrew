# Addition room packages and feeder-selection checkpoint

Baseline: main `862f09dab0dfa47bf5b1156c7fe2a908e959166d` (PR #41). This is an additive version-3 editable Addition path, not an estimating-engine rewrite. No production company catalog or quote records were written.

## Preserved

- Dimensions and optional square-foot override establish editable allowances, not a price per square foot.
- Existing Addition device, ceiling-fan, circuit, crew and adjustment coefficients and pricing formulas remain unchanged.
- Supplied fans retain zero purchase cost; support, controls, wiring and labor remain separate.
- New-support and verified-reuse confirmation paths remain unchanged.
- Subpanel labor remains quote-local total person-hours, required above zero for selected subpanels, added once and ignored when no subpanel.
- Historical assembly/pricing records are not recalculated. Existing version-2 proposal wording is preserved; current wording is version-gated.
- Standalone Bathroom uses the same values and material keys as before, now sharing those constants with room packages.

## Added

- Bathroom and Laundry checkboxes in one Common Rooms section. Exhaust entry exists only inside Bathroom. Legacy exhaust-only drafts remain readable without automatically adding bathroom devices.
- Bathroom GFCI/downstream receptacles, vanity/recessed/wet-location lights, separate lighting switches, supplied-fixture choices and exhaust/fan-light/fan-light-heat selection.
- Laundry general devices, lighting, supplied decorative fixtures, washer circuit quantity and None/Gas/Electric dryer choice.
- Shared room scope helpers and Bathroom device allowances. No standalone setup, service-call charge or Bathroom selling-price result is imported.
- Suggested room circuits are explicit rows in the existing schedule, with stable role identifiers. Suggestions must be reviewed by the estimator. Circuit calculation reads this schedule only.
- Removing or disabling a room removes its managed suggestions, not manually entered general rows. A manually assigned row can replace a suggestion. Duplicate role assignments, missing assignments and unreviewed suggestions block Ready.
- Per-row home-run feet; an omitted value inherits the default. Quantity multiplies the effective footage once. Existing in-room wiring is allocated once to the first active circuit's cable.
- In-Room Branch Wiring Allowance label and explanation distinguish that allowance from home runs and explicitly measured fan wiring.
- Explicit Copper/Aluminum SER selection. Four semantic size/material requests use the existing Price Book component qualification workflow. Exact product identity, qualification evidence, price and foot units are required; conductor size is not inferred.
- Collapsible sections, two-column circuit controls where space permits, person-hour labels and an additive labor summary. Advanced cost/sell overrides are disclosed separately.
- Internal materials show existing resolver status and supplied/unresolved distinctions. Existing Price Book actions and editable-focus refresh remain intact.
- Customer scope describes room work, supplied fixtures, selected fan controls and version-3 subpanel/feeder work without exposing catalog identities or internal labor.

## Single calculation and labor trace

The engine charges general tasks + incremental room devices/equipment + scheduled circuits + crew person-hours + subpanel person-hours + signed adjustment, with a zero minimum.

Room circuits add no separate hidden circuit labor. Each main schedule circuit uses Addition's established 2.5-hour allowance. Bathroom setup is not added. Exhaust equipment, control and measured fan-wiring labor use existing Bathroom treatment once. Stacked SP/SP remains one control/yoke.

Laundry general receptacles, switches and recessed lights use existing Addition allowances. Decorative fixture installation uses the shared established fixture-installation allowance; no new coefficient was introduced.

The local combined fixture uses 6 general receptacles, 2 switches, 1 dimmer, 4 recessed fixtures, a default Bathroom and Laundry, supplied exhaust fan with 30 FT additional wiring, 5 scheduled circuits, 2 crew members × 8 hours, 12 subpanel person-hours and +2 manual hours:

- General tasks: 8.00 hours.
- Main schedule circuits: 12.50 hours.
- Exhaust/control/wiring: 3.75 hours.
- Bathroom devices: 2.05 hours.
- Laundry devices: 1.20 hours.
- Calculated task labor: 27.50 hours.
- Crew: 16.00 person-hours.
- Subpanel: 12.00 person-hours.
- Adjustment: 2.00 hours.
- Final: 57.50 hours.

Synthetic fixture feeder costs are only test data, never production company prices. At the fixture's $2/FT Aluminum product and 50 FT, material cost is $100; at $4/FT Copper, it is $200. Other unqualified materials intentionally remain unresolved and do not become customer-ready. At the fixture's $65 loaded/$150 sell labor rates, Aluminum results are labor cost $3,737.50, labor sell $8,625.00, selling price $8,750.00, GP $4,912.50 and stored margin 0.5614. Copper changes material and selling price, not labor. This is an incomplete QA estimate, not a suggested customer price.

## Qualification limitations

- No real 60A Copper, 60A Aluminum, 100A Copper or 100A Aluminum SER product was qualified in production. The new mapping paths are available and tested with isolated synthetic products.
- Complete subpanel compatibility/material qualification remains blocked: panel family, matched enclosure/feeder breaker, suitable four-wire SER, ground/neutral configuration, fittings, mounting and incidental materials. Entering labor or mapping a feeder does not remove that existing gate.
- Laundry washer/dryer connection devices, boxes/covers and gas-dryer power scope are not qualified by a scheduled circuit. Those installations remain Needs Review. This pass does not silently infer an appliance receptacle or connection product. Their complete connection model needs a subsequent contractor-approved qualification path.
- Fan/light and fan/light/heat equipment can be represented with existing equipment/labor concepts, but their complete independent control/wiring configuration is not qualified by the exhaust-only control assembly. They remain Needs Review.
- Missing new fan-rated support, timer/humidity control, matching plates, other required priced products and fan confirmations continue to block.
- General and room counts are deliberately additive; the UI explains that the estimator must not repeat the same device. Circuit-review confirmations explicitly cover overlap with other rows; the program does not guess intent from similar labels.

## Verification

- Initial new scope regressions: 1 passed, 6 failed before implementation.
- Focused Addition/Bathroom/customer-scope checks: 61 passed.
- Full local API suite before the final historical-wording assertion: 357 passed.
- Full local browser suite including opt-in audits: 71 passed, zero skipped.
- The strengthened new room lifecycle test additionally passes through the actual Price Book feeder-mapping UI.
- Deployment configuration: 13 passed.
- Workspace typecheck and production build passed. No test timeouts were increased.
- Draft, saved quote, duplicate/revise, internal/customer views, customer-ready blocking, financial reconciliation and local historical snapshots were exercised.
- Desktop 1440, tablet 834 and mobile 390 widths passed no-horizontal-overflow assertions; screenshots were captured.
- All 11 active builders' customer-scope/PDF and broader browser regressions passed. Existing Jobber export regression tests passed; no real Jobber account import was performed.
- No signed-in production workflow was verified. CI and merge status are reported separately in the final checkpoint.

## Scope boundary

The preceding exact Northeast product import/EV completeness work is isolated on branch `test/northeast-qualified-products`, commit `95285cd`, and is not included here. No Northeast costs were hard-coded into this implementation. Production product application remains pending a reachable signed-in workflow; RCD11W/TP26-W pair qualification also remains pending authoritative resolution of the manufacturer's plate guidance.
