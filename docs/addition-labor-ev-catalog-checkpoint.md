# Addition labor and EV catalog-resolution checkpoint

Baseline: `f1449b8725023f353889d56df09e2d5e9fc058bd`. Scope is the contractor-approved quote-local subpanel hours, single-yoke stacked-control labor, and EV material qualification workflow. PRs 34, 38, 39 and 40 are retained, not reimplemented.

## Behavior

- **Subpanel labor:** The current Addition form writes `additionScopeVersion: 2`. Selected 60A/100A subpanels require one positive total-person-hours field. It is added once to task hours, never multiplied by crew size. No subpanel ignores stored hours. Legacy unversioned calculation inputs retain their former labor behavior; opening a new editable revision upgrades inputs without editing the source.
- **Separate subpanel blocker:** Existing assembly is still only a panel, feeder and feeder breaker. Version 2 explicitly blocks complete-scope qualification, independently of the labor requirement. Hours or three priced rows cannot certify product family compatibility, SER suitability, ground bar, fittings and mounting scope. The prior broader manufacturer-family/Cu-Al/mounting redesign is NOT represented as complete.
- **Stacked control:** Addition uses the existing Bathroom standard-control allowance, 0.5 person-hours per single yoke, once. Fan installation remains 2.25 hours each and separately measured wiring remains feet/30. Bathroom engine behavior is unchanged. Device and white plate require identity-bound qualification and matching opening; estimator confirms non-duplicated independently controlled wiring. No unique stacked labor coefficient or manual control hours.
- **Exhaust control selection:** A new Addition exhaust scope starts unselected. Existing selected controls remain selected. The four existing/new choices are standard, timer, humidity and stacked. Missing choice blocks readiness.
- **EV catalog:** Price Book has an explicit required-component checklist independent of whether products exist. Search does not resolve products: the contractor chooses a record and saves an exact preference. NEMA 14-50R and 6-50R require evidence bound to manufacturer and part number. The same proof model supports stacked control/plate.
- **Product creation:** The manual product form submits a CSV to the existing import preview and selective Apply flow. Existing supplier import handles identity conflicts; there is no new automatic insertion or fuzzy product matcher. Optional breaker amp/pole/protection fields are available; electrical compatibility remains enforced by the existing resolver.
- **Resolution links:** Shared saved internal-material rendering says Resolve in Price Book. Addition and EV editable previews have the same action with exact semantic request keys. Returning focus recalculates only the editable preview. Saved snapshots are not refreshed or repriced.
- **EV neutral safety:** Existing conduit assembly contains two hots and ground, not a neutral. NEMA 14-50 with conduit or a two-conductor cable remains blocked, even when the receptacle is qualified. No conductor size, SKU or cost is added by this change.

## EV component audit

All existing modeled catalog requests are listed or linked: NEMA 14-50, NEMA 6-50, contractor EV charger, #8 THHN, #10 ground, EMT/PVC-with-fittings, 8/2 SER, 6/3 NM-B, 8/2 NM-B, 8/3 NM-B, load management, disconnect, surge protection and panel-modification allowance. Breakers retain structured manufacturer/amp/pole/protection qualification; a preference cannot override it. Permit fees remain quote-local.

Previously absent generic components had no visible catalog row and therefore no obvious configuration target. Product labels also could fail builder-usage filtering; semantic EV/stacked preferences now contribute the appropriate builder label.

The engine does not separately model a NEMA receptacle box/cover assembly or conduit neutral. No such components, prices or new labor coefficients were invented. The neutral gap is explicitly blocked. Box/cover and other complete-installation scope require contractor review before claiming EV assembly completeness. Catalog qualification is not code-compliance certification.

## Qualification still required

- Actual NEMA 14-50R and stacked SP/SP products: manufacturer, exact part number, supplier/SKU when available, sourced purchase cost, unit/date and specification reference.
- Matching white stacked plate: exact product, verified device opening, source and price.
- New-work fan-rated support, standard/multi-gang plate combinations, timers/humidity controls, complete matched 60A/100A subpanels and qualified Cu/Al SER combinations remain separate catalog/scope qualification work. No new production catalog records or prices were written.

## Verification

Local isolated Postgres/test-auth workflow, not signed-in production:

| Check | Final branch result |
|---|---:|
| New focused engine/resolver tests | 10 pass |
| Focused Addition ceiling/exhaust and three new lifecycle tests | 6 pass |
| Full API | 348 pass, 0 fail |
| Full browser including opt-in audits | 70 pass, 0 fail |
| Deployment configuration tests | 13 pass, 0 fail |
| Typecheck | library build plus all four checked projects pass |
| Production build | API, estimator and mockup builds pass |

The full run includes all 11 builder customer-scope render/PDF regressions and existing cross-company tests. No timeouts were increased. The existing exhaust lifecycle fixture now explicitly selects its former Standard switch scope; its 17-hour expected result is unchanged.

New tests prove missing/zero subpanel hours, ignore-hours-with-None, exact once-only labor, legacy behavior, separate complete-subpanel blocking, stacked qualification/plate/wiring failures, supplied fan zero equipment cost, NEMA identity proof, ambiguous candidates, neutral blocker, semantic resolution links, builder filtering, normal UI product creation/mapping, draft restore, saved quote, customer preview, duplicate/revise and saved financial immutability after catalog updates.

## Financial examples

These use synthetic catalog products/prices, never production prices.

| Fixture | Material | Person-hours | Internal labor | Customer labor | Final sell | GP | Margin |
|---|---:|---:|---:|---:|---:|---:|---:|
| Addition subpanel, deliberately unresolved materials | 110.00 | 26.5 | 1,722.50 | 3,975.00 | 4,112.50 | 2,280.00 | 55.44% |
| Addition supplied exhaust fan + stacked control | 160.00 | 18.25 | 1,186.25 | 2,737.50 | 2,937.50 | 1,591.25 | 54.17% |
| EV qualified receptacle | 117.50 | 3 | 195.00 | 450.00 | 596.88 | 284.38 | 47.64% |

The subpanel fixture contains 12 existing crew person-hours + 2.5 existing circuit hours + 12 entered subpanel hours. Unit coverage also isolates exactly 12 added hours without a branch circuit. Subpanel figures exclude unresolved material costs and are NOT a customer-ready price.

Quote totals still use the saved effective final selling price. Customer scope never recomputes financials. The tests compare assemblies and financial values through save/revise and after catalog changes; historical snapshots are not migrated or rewritten.
