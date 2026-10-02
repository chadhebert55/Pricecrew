# Addition qualification gates: investigation and bounded implementation

Baseline: PRs #42/#43, main `8ed5d39194bf79452c35bac1337bb6f36543a001`. Scope is qualification, not another builder redesign. No production catalog or historical quote writes are part of this work.

## Findings and implemented changes

- **P1, stacked plate compatibility:** A common decorator opening was sufficient to pass the previous device/plate check. A failing regression proved that a TP26-W identity/opening record could qualify against RCD11W without pair evidence. Plate qualification now includes the exact compatible control manufacturer/part and an authoritative evidence reference; the engine also checks the selected control against that evidence. Existing saved quote financial/material snapshots are not recalculated.
- **P2, electric dryer decision:** Laundry did not distinguish receptacle from hardwired connections. One optional, no-default selection is added only for Electric. It persists through existing draft/save/revise inputs. It does not create a receptacle, cable, breaker, connection price or new labor allowance. Missing connection materials remain blocked even after a method is selected.
- **P1, subpanel product qualification:** Generic load-center pricing and the normal breaker selector did not establish approved subpanel products. Current version-3 Addition now requires explicit Price Book component proof for the load center and feeder breaker, bound to size and the existing UI family (Siemens, Eaton BR or Square D Homeline). Breakers must additionally pass the existing structured manufacturer/amperage/poles/protection and duplicate checks. Version-2 calculation and stored snapshots remain unchanged.
- **P1, EV installation completeness:** Previously isolated regression work is included here: a qualified 3894WREV plus represented neutral cable and breaker did not establish box/cover completeness. A readiness-only gate now retains that missing installation scope; existing neutral checks remain. No cost or quantity was changed.
- **Preserved:** One Addition estimate, one visible room circuit schedule, existing route/home-run quantities, four SER request keys, current labor coefficients and total subpanel person-hours once. Customer proposal generation and historical snapshot serialization are unchanged.

## Subpanels: current model and required approval

Current material model has exactly three lines: a requested SER feeder in FT, one feeder breaker in EA and one load center in EA. Grounding/neutral provisions are mentioned in the requested scope, not independently qualified components. No ground bar, connector, backboard or incidental price is silently added.

| Request | Qualification path | Complete installation |
|---|---|---|
| 60A Aluminum | Existing exact component request, synthetic positive/UOM tests | Needs Review |
| 60A Copper | Existing exact component request, synthetic positive/UOM tests | Needs Review |
| 100A Aluminum | Existing exact component request, synthetic positive/UOM tests | Needs Review |
| 100A Copper | Existing exact component request, synthetic positive/UOM tests | Needs Review |

All four use distance × normalized per-foot cable price once. The tests assert 50 FT and 75 FT, reject EA feeder mappings, and do not multiply cable footage by four conductors. A qualified feeder record is not a qualified complete subpanel.

The feeder breaker uses structured manufacturer, amperage, poles and protection plus existing family compatibility filtering and duplicate rejection, after exact family-specific component qualification. The load center also needs a matching manufacturer and exact family-specific qualification. Generic `60A subpanel load center` / `100A subpanel load center` pricing alone no longer supplies these current version-3 component costs. Legacy version-2 treatment is preserved.

The builder still cannot prove the complete panel/breaker/feeder installation tuple or isolated-neutral/ground-bar/fittings coverage. The existing overall completeness gate is therefore retained. The new requests appear in the existing Price Book component selector; no physical product records were created. Explicit proof is contractor-recorded evidence, not automated manufacturer certification.

### Recommended model, not yet approved or activated

Reuse current company catalog products/preferences, exact identity snapshots, supplier UOM normalization and the four feeder request keys. Add a company-approved scope manifest only after the contractor supplies the BOM and inclusion decisions:

| Role | Quantity basis | Approval needed |
|---|---|---|
| Load center | 1 EA | Exact manufacturer/part, family, included neutral/ground hardware |
| Feeder breaker | 1 EA | Existing main-panel family and documented compatible exact breaker |
| SER product | Route FT | Exact qualified product for chosen size/material; neutral/EGC configuration and suitability evidence |
| Ground bar / neutral hardware | Explicit EA or documented included/not applicable | Specific panel installation requirements; no duplicate hardware |
| Connectors/fittings | Explicit per-installation quantities | Cable entry/termination/mounting method and exact products |
| Mounting/backboard/labels/incidental materials | Explicit quantity/UOM or included-with reason | Contractor's normal scope and supplied-product inclusion evidence |

An included component would reference the parent product's documented inclusion, not become a fake zero-price material. Missing required roles would remain blocked. This approval-dependent manifest is a proposal, not a new parallel assembly engine in this branch. No conductor sizes or approved product identities were inferred.

Required next: an approved BOM for at least one actual size/material/panel-family combination, exact products and prices/UOM, compatibility evidence, component inclusion boundaries and mounting method. Approval for one combination must not qualify the other three automatically. Subpanel labor remains separately entered total person-hours, added once and never multiplied by crew size.

## Laundry: current model and required approval

Washer and electric-dryer rows remain the sole source for circuit breakers and home-run cable. Gas creates no electric-dryer circuit. Existing circuit labor is 2.5 hours per circuit; no new connection labor coefficient was created.

Laundry general receptacles and lighting are not automatically reinterpreted as appliance connections. Washer-only, gas and electric scenarios remain blocked until connection scope is known. Electric now requires a Receptacle/Hardwired decision, but neither selection clears the incomplete-connection gate.

Required next:

- **Washer:** exact intended receptacle/connection device, protection/location decision, box and cover/plate, how many connections per visible washer circuit, and whether any item is shared/included elsewhere.
- **Gas dryer:** actual power connection and whether it shares the washer supply or another visible circuit; do not infer an electric-dryer branch.
- **Electric dryer:** selected connection method, exact equipment requirements, receptacle configuration or hardwire termination, box/cover/connectors and compatibility with the estimator-reviewed circuit.
- **Labor boundary:** confirm which connection/termination work the existing circuit allowance already covers and which existing device labor concept, if any, applies once. No new default was invented.

The smallest eventual model is connection components attached to the existing room scope and referenced visible circuit row, with explicit coverage against general-device counts. No second Laundry circuit calculator is needed. A complete qualified connection cannot be demonstrated before these decisions; all tested complete-connection claims remain blocked.

## Bathroom fan controls and wiring

Exhaust fan + standard, timer and humidity controls continue using shared Bathroom concepts. Equipment, one physical control/box/plate per fan and separately measured wiring remain distinct. Standard and stacked use the established 0.5-hour control allowance per yoke; timer/humidity use the existing 0.75-hour allowance. Existing equipment allowances remain 2.25 exhaust, 2.5 fan/light and 3.5 fan/light/heat hours, plus separately measured wiring / 30. These values were not changed.

Fan/light and fan/light/heat remain blocked because pricing one control does not specify all independent switched functions, equipment-specific wiring or required circuits. RCD11W offers two independent single-pole functions on one yoke, not a generic complete heat/light/fan controller.

Required next: exact fan equipment and manufacturer installation/control diagrams; functions to switch independently; approved physical controls/yokes and compatible plates; new vs verified existing wiring; measured wiring segments and cable identities; required existing or new visible circuit assignment. No dedicated circuit or conductor was guessed. The eventual scope manifest should reference existing circuit rows and separate in-room wiring segments, not add hidden home runs.

## Exact Northeast records and authoritative evidence

| Product | Northeast SKU | Supplier basis | Normalized each cost | Qualification |
|---|---|---|---|---|
| Pass & Seymour / Legrand 3894WREV | 163554 | $57.32 EA | $57.32 | Individual NEMA 14-50R verified and locally mapped; full EV installation remains gated |
| Pass & Seymour / Legrand RCD11W | 1095902 | $21.48 EA | $21.48 | Individual stacked SP/SP device verified and locally mapped; one yoke |
| Pass & Seymour / Legrand TP26-W | 17242 | $46.83 C / 100 EA | $0.4683 | Product import/unit conversion tested; not paired with RCD11W |

Costs are supplied by the contractor, not retrieved from an authenticated supplier account. Local fixtures retain supplier, SKU, manufacturer/part, source date, supplier price/UOM/unit quantity and normalized cost; builder code has none of these purchase costs embedded.

[Legrand's RCD11W page](https://www.legrand.us/wiring-devices/radiant-collection/switches/radiant-two-single-pole-switches-white/p/rcd11w) describes two single-pole switches in one gang and specifies radiant screwless wall plates, sold separately. It does not approve TP26-W. Matching color, brand or opening is not accepted as pair evidence.

[Legrand's 3894WREV page](https://www.legrand.us/wiring-devices/outlets-and-receptacles/power-outlets/50a-weather-resistant-electrical-outlet-for-ev-chargers/p/ps-3894wrev) identifies the NEMA 14-50 product and states that a wall plate is not included. Its individual qualification does not qualify the rest of the EV assembly.

No production product import, mapping or price update was performed. Production action remains: review the exact three-row import, apply only approved rows through the existing workflow, map the first two individual components, and leave TP26-W's RCD11W pairing unresolved until authoritative approval or another exact approved plate is supplied.

## Verification boundaries

Focused tests cover all four qualified feeder requests but intentionally blocked complete subpanels; UOM/length and duplicate/wrong breaker behavior; washer/gas/electric schedule cardinality; dryer method without false completion; standard/timer/humidity exhaust; blocked multi-function scope; exact plate-pair identity; exact Northeast identity/price/UOM and EV safety.

Browser checks cover actual local import and mapping, missing pair evidence disabling mapping, draft restoration of dryer method, saved catalog identity, deliberate revisions, customer scope/total separation and historical snapshots unchanged after a future hypothetical supplier-price update. Synthetic pair evidence is clearly marked; TP26-W/RCD11W is never synthetically approved as a real pair.

The final review report records completed suite counts and financial traces. Qualified complete scenarios for subpanel and Laundry cannot truthfully be supplied yet; their financial traces are labeled incomplete, not ready prices. This branch makes no claim of production compatibility or electrical-code certification.
