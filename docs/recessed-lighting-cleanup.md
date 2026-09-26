# Recessed Lighting Builder cleanup

Version 2 retains the PriceCrew catalog, exact breaker resolver, company settings and final pricing engine. It adds conditional wiring and lighting-group inputs without modifying legacy saved quotes or replacing any pricing system.

## Changes

- One quoted fixture quantity. Planning suggestions require an explicit Apply action, record their origin and remain editable.
- Existing-wiring replacements, extensions, nearby-source wiring and panel home runs now control the relevant fields and actual takeoff.
- Automatic 15A/14 AWG and 20A/12 AWG defaults, with validated advanced overrides.
- New breakers/protection upgrades resolve exact manufacturer, amperage, poles and protection in the existing Price Book.
- Lighting groups use explicit fixture allocations and existing, single-pole, dimmer, smart, 3-way or 3-way-dimmer controls. Multi-location groups add physical 4-way devices and separately priced traveler cable.
- Replacements receive different task labor from new locations. Height, restricted access, insulation, controls and route lengths affect labor; signed adjustments affect both cost and selling price.
- Customer fixture supply excludes fixture purchase cost only. Installation consumables, wiring and labor remain.
- Compact financial/readiness summaries, collapsed details, internal notes and unfinished-draft safety match Kitchen and Bathroom.

## Assumptions

Default fixture spacing is 8 FT and wire waste defaults to 0%, both adjustable under Advanced Wiring. Source/panel route is entered once; fixture interconnection is the sum of `(fixtures in each group - 1) × spacing`. Traveler routes are separately entered and use 14/3 or 12/3 according to circuit amperage. Multi-group jobs assume the entered source route is the combined source-feed route; verify all feeds in the field.

The existing 1.25-hour shared setup and 0.85-hour new-fixture task baseline are retained. Replacement fixtures use 0.45 hours each. Wiring is total entered/calculated feet divided by 40; a new home run adds 2.5 hours of circuit work. Protection-only upgrades add 0.25 hours. Single-pole/dimmer controls add 0.5 hours, smart switches 0.75, a 3-way pair 1.25 and each 4-way 0.75. Restricted access adds 1.25 hours; insulation handling adds 0.1 per new location. Existing 1.15 high-ceiling and 1.35 vaulted-ceiling multipliers remain. Estimators can adjust final labor without changing company defaults.

Fixture installation consumables are an explicit catalog-priced incidental line, not an invented allowance. Existing wafer products are reused; replacement suitability, existing enclosure conditions, control load compatibility and field requirements need verification. This is estimating guidance, not a lighting design or code approval.

## Catalog items requiring verified prices

The selected Juno wafer, exact breaker, 14/2 or 12/2 cable, traveler 14/3 or 12/3 cable, selected switches/dimmers, smart switch, control boxes/plates and `recessed fixture installation consumables` must resolve to unique positive company prices. Customer-supplied wafers are intentionally excluded. No production catalog edits were made.

## Verification

279 API/engine tests and 30 browser tests passed locally. All seven requested scenarios verify fixture/control/breaker quantities, separately sized cable, cost, exact labor, loaded cost, customer labor, profit, margin and selling price. Browser tests compare previews with saved quotes and exercise readiness, draft recovery, conditional controls, explicit planning, multi-group allocation and desktop/tablet/mobile layouts. Negative checks cover mismatched groups, missing routes, 14 AWG/20A, duplicate and missing catalog prices, wrong manufacturers and unfinished-quote blocking.

## Deliberate limits

Legacy drafts remain unchanged until explicit conversion. Legacy extra lights are combined into the main quantity; conversion calls out any legacy special smart-kit/additional-switch scope for review. The builder models one supplying circuit for a recessed-light job and separate switched groups, not an electrical load calculation or multiple independent home-run circuits. Existing-switch selection adds no new control material or labor.
