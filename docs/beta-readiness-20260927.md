# PriceCrew Electrical Beta Readiness

Audit date: September 27, 2026. This audit exercises the current main implementation, documents estimating risks without changing financial behavior, and proposes one small customer-list UX fix. It is not a production certification or approval of electrical designs.

## Executive summary

| Release audience | Decision | Reason |
|---|---|---|
| Internal testing | PASS, with synthetic data and estimator review | All 11 active builders calculate, restore drafts, save snapshots, and preserve originals during duplication in the isolated audit. Final API and browser regression suites pass. |
| General limited contractor beta | NEEDS WORK | Routine scopes still encounter unresolved catalog/allowance items; Addition supply classification and several scope/labor semantics need review. Live authentication/onboarding and production smoke testing are outstanding. A deliberately supervised trial restricted to reviewed, fully priced scopes is a separate decision. |
| Unrestricted beta | NOT READY | The above gates plus production authorization/billing validation and actual Jobber import remain open. Passing arithmetic tests does not prove complete electrical scope. |

No newly confirmed application-wide P0 was found within the exercised coverage. Both previously fixed P0 regressions pass locally. This is not evidence that all production workflows or all electrical configurations are safe.

Final automated results: **299 API tests passed; 52 browser tests passed; typecheck and production build passed.** No failing tests remain in the final runs. Eight of the eleven sampled estimates correctly remain Needs Review rather than pretending missing costs are priced.

The only runtime change is in the Customers page: distinguish failed loading from an empty list, offer Retry, label search accessibly, and make customer names keyboard-accessible links. No pricing engine, labor coefficient, material resolution rule, saved-quote contract, billing rule, or company setting was changed.

## Baseline, environment, and evidence limits

- **Main baseline:** `87f206b77f19fb02980fa48f8c36a4f7f9606293`; branch `audit/beta-readiness-20260927`.
- **Previously merged work:** [PR #30, Builder Directory](https://github.com/chadhebert55/Pricecrew/pull/30), merged September 27 at 11:52:50 UTC, and [PR #32, P0 fixes](https://github.com/chadhebert55/Pricecrew/pull/32), merged at 11:14:09 UTC, are present in the audited main baseline.
- **Execution:** Local disposable PostgreSQL, actual API server, actual React application, Chromium/Playwright. Test-only authentication is explicitly separate from live Clerk. No production data was created, edited, deleted, repriced, or contacted.
- **Catalog evidence:** Read-only 302-row company catalog snapshot preserved September 26. It was copied into synthetic local companies for testing. It is not a fresh query of today's live company Price Book.
- **Production limits:** The signed-in Comet session was not reachable during the access attempt. Anonymous production browsing reached authentication; deployment-provider verification was unavailable. The production sign-in screenshot is preserved. Live authenticated pages, production company settings, production historical quotes, and production deployment correctness are NOT certified by this report.
- **Excluded work:** Earlier Addition/New House and Panel/Service redesign work remains outside this branch. No unrelated PR was merged, and this audit PR is not automatically merged.
- **Evidence language:** “UI” means browser interaction; “API” means authenticated local HTTP checks; “source” means code inspection. Desktop/tablet/mobile are viewport tests, not physical-device certification.

The evidence archive includes individual builder inputs, original and edited previews, saved snapshots, readiness responses, duplicate results, screenshots, financial traces, warnings, CSVs, PDFs, and final logs. Synthetic identifiers in these files belong to the disposable test environment.

## Application map and ownership

The supported journey is account/company setup → company pricing and Price Book → customer → builder → server calculation preview → saved draft/quote → Ready → customer proposal → PDF/acceptance → export. Initial account creation and real provider billing were not executed; the onboarding wizard itself and downstream local workflows were exercised.

| Surface | Primary ownership / contract | Audit observation |
|---|---|---|
| Account and company | Clerk, estimator authorization middleware, company membership, onboarding page | Local authorization and onboarding tests pass. Live provider/session behavior remains a release gate. |
| Pricing and catalog | Company settings; `material-resolution.ts`; supplier import routes | Tenant-specific costs and verified identities drive pricing. Unresolved items must remain unresolved. |
| Builder directory | `artifacts/electrical-estimator/src/lib/builder-directory.ts` and `pages/builders.tsx` | One presentation/navigation directory with 11 electrical entries and three categories. |
| Route wiring | `App.tsx` and builder page modules | Route definitions are separate routing contracts, not a competing card registry. All 11 routes work in the directory regression. |
| Builder forms | `pages/quotes/new*.tsx`; shared draft, takeoff, material, and preview helpers | Kitchen/Bathroom/Recessed share more modern circuit patterns; larger older builders retain separate form logic. |
| Calculation | `artifacts/api-server/src/lib/estimating-engine.ts`, shared breaker/material resolution and pricing finalizers | Server is authoritative. UI inputs and snapshot outputs are compared by tests. |
| Saved quotes | Estimating routes, module normalization, quote detail page | Editable drafts and immutable issued snapshots have different behavior. Original snapshots survive duplication/catalog changes in fixtures. |
| Proposal/PDF | Customer-safe proposal mapping and proposal/PDF components | Internal costs/margins excluded in sampled outputs; summary quality varies by builder. |
| Export | Saved-quote export/preflight and Jobber CSV validation | Snapshot-driven output; unresolved costs block export. Actual Jobber import not executed. |

Canonical Time & Materials module is `TIME_MATERIALS`; route/directory slug is `time-materials`. These are intentionally different layers, not an error. Supported historical aliases continue to normalize without rewriting stored identity or snapshot prices.

## Builder matrix

All listed rows are UI-tested for changed inputs, calculation preview, local draft leave/reload/restore, quote generation, saved detail, and internal customer preview. Duplicate and explicit Ready checks in this audit use API requests; separate existing browser regressions cover revision/Ready workflows for representative builders, including T&M.

| Builder / route suffix | Calculation and financial reconciliation | Draft UI | Save and snapshot | Duplicate/original API | Proposal | Mobile/tablet | Sample pricing |
|---|---|---|---|---|---|---|---|
| New House / `new-house` | PASS | PASS | PASS | PASS | Internal preview; public blocked | PASS viewport | Incomplete: WR and exterior fixtures |
| Addition / `addition` | PASS arithmetic; scope review below | PASS | PASS | PASS | Internal preview; public blocked | PASS viewport | Incomplete: switch/dimmer identity; fan classification |
| Kitchen / `kitchen` | PASS arithmetic | PASS | PASS | PASS | Internal preview; public blocked | PASS viewport | Incomplete: plates, USB, undercabinet, appliance connection selections |
| Bathroom / `bathroom` | PASS arithmetic | PASS | PASS | PASS | Internal preview; public blocked | PASS viewport | Incomplete: 15A AFCI ambiguity, plates, fixture box |
| Recessed / `recessed-lighting` | PASS | PASS | PASS | PASS | Internal preview; public blocked | PASS viewport | Incomplete: consumables, screwless plate |
| Service Call / `service-call` | PASS | PASS | PASS | PASS | Public proposal and PDF PASS | PASS viewport | Complete for sampled scope; Ready 200 |
| Panel Replacement / `panel-replacement` | PASS | PASS | PASS | PASS | Internal preview; public blocked | PASS viewport | Incomplete: generic supplies/ground bar, allowances |
| Service Upgrade / `service-upgrade` | PASS | PASS | PASS | PASS | Internal preview; public blocked | PASS viewport | Incomplete: lumber and allowances |
| EV Charger / `ev-charger` | PASS arithmetic; output/circuit review below | PASS | PASS | PASS | Internal preview; public blocked | PASS viewport | Incomplete: permit; configuration needs review |
| Time & Materials / `time-materials` | PASS | PASS | PASS | PASS | Public proposal and PDF PASS | PASS viewport | Complete labor-only sample; Ready 200 |
| Custom Quote / `custom` | PASS | PASS | PASS | PASS | Public proposal and PDF PASS | PASS viewport | Complete labor-only sample; Ready 200 |

“Incomplete” is not a failed automated test: the test passes when unsafe or incomplete pricing remains blocked. Public proposal/PDF was deliberately not forced through for these eight Needs Review samples.

### Sample scope and arithmetic

Synthetic settings: residential labor sell $150/person-hour; commercial $165; loaded labor $65/person-hour; material markup 25%; target margin 40%. T&M uses its explicit $165 sell-rate input. These are test-company inputs only, not changes to any real company.

| Builder | Representative edited scope | Material | Loaded labor | Person-hours | Selling price | Gross profit | Gross margin |
|---|---|---:|---:|---:|---:|---:|---:|
| New House | 2,200 ft², 2 floors, 42 receptacles, 22 switches, 3 exterior WR, 4 exterior fixtures | $2,611.70 | $14,723.36 | 226.5133 | $37,241.63 | $19,906.57 | 53.45% |
| Addition | 22×18, 8 receptacles, 2 switches, dimmer, 4 recessed, customer fan, 20A AFCI | $238.88 | $1,374.75 | 21.1500 | $3,471.10 | $1,857.47 | 53.51% |
| Kitchen | Appliance circuits including range/oven, lighting, controls, USB | $1,493.34 | $3,532.75 | 54.3500 | $10,019.17 | $4,993.08 | 49.84% |
| Bathroom | Additional receptacle, 45-ft receptacle home run, lighting/fan circuit | $279.85 | $1,041.08 | 16.0167 | $2,752.31 | $1,431.38 | 52.01% |
| Recessed | 8 fixtures, 22-ft room length, dimmer group, existing circuit | $314.05 | $711.75 | 10.9500 | $2,035.06 | $1,009.26 | 49.59% |
| Service Call | 2 visits, 1 person × 3 hours, one TR replacement | $1.00 | $422.50 | 6.5000 | $976.25 | $552.75 | 56.62% |
| Panel Replacement | Siemens 200A/40-space, 10-ft SER, 2×11 hours + two adjustments | $433.82 | $1,560.00 | 24.0000 | $4,142.27 | $2,148.45 | 51.87% |
| Service Upgrade | 200A overhead, 10-ft mast, 15-ft run, grounding, surge, 2×18 hours | $1,540.83 | $2,340.00 | 36.0000 | $7,326.04 | $3,445.21 | 47.03% |
| EV Charger | 2 customer-provided units; output input changed to 65A as a stress case | $383.89 | $227.50 | 3.5000 | $1,018.98 | $407.59 | 40.00% |
| T&M | 2 people × 6 hours, no material purchases | $0.00 | $780.00 | 12.0000 | $1,980.00 | $1,200.00 | 60.61% |
| Custom | 10 person-hours, labor-only | $0.00 | $650.00 | 10.0000 | $1,500.00 | $850.00 | 56.67% |

The EV change is an intentionally unusual input probe, not a recommended installation. Original/default previews are retained alongside the edited sample.

For every row, sum of saved assembly extended costs, rounded to cents, equals material cost. Loaded labor equals person-hours × $65; customer labor equals person-hours × selected sell rate. Total internal cost equals material plus loaded labor in these samples; there are no additional costs outside the assembly to add again. Allowance lines already inside material/assembly totals must not be counted twice.

Selling price reconciles to the existing greater-of marked-up materials plus customer labor, or target-margin floor, for these non-override cases. Gross profit equals selling price minus internal cost, and gross margin equals gross profit divided by selling price, allowing the stored four-decimal margin rounding. All 11 independent traces pass.

These are incomplete budget numbers where unresolved lines exist. They must not be presented as approved fully priced quotes.

## P0 blockers and preservation

No new global P0 is asserted from incomplete coverage. The following existing P0 protections are preserved and tested, but require production smoke confirmation before being called live-verified.

- **T&M identity/readiness:** Current builder restores its draft, saves, reaches Ready, opens public proposal, generates PDF, and revises without the former unsupported-legacy error. Current and supported historical aliases pass API and browser regressions; snapshots are not rewritten.
- **WR qualification:** New House requests `15A TR weather-resistant exterior duplex receptacle`. Indoor P&S 3232-TRW does not satisfy that request. The sample has three unresolved exterior receptacles, no invented cost, and Ready returns 409.
- **No verified compatible WR selection:** No selected material/SKU exists for that request in the preserved snapshot. The snapshot does contain WR-named GFCI products, including 1597-TRWRW (SKU 1003404) and 2097-TRWRW (SKU 1020717), but that is not evidence of a verified compatible standard-duplex selection for this request. No silent GFCI or TR substitution was made.

## P1 before contractor beta

The eight findings below are actionable review items, not authorization to change pricing. The first six directly affect estimating confidence; the last two are release-validation gates.

| ID | Finding and reproduction | Actual / expected | Risk and next action |
|---|---|---|---|
| P1-01 | Addition switch/dimmer identity: use sample switches and dimmer with the preserved catalog | Unresolved keys omit the SKU suffix, while priced TM870-W SKU 3211 and DVCL-153P-WH SKU 607393 records exist. Expected: verified identity reconciliation, not fuzzy price matching. | Common scope blocked. Approve precise canonical identity mapping with resolver and snapshot tests; do not duplicate catalog records. |
| P1-02 | Addition customer-supplied ceiling fan | Material is intentionally excluded at $0 with `CUSTOMER_SUPPLIED`, but `CUSTOMER_SUPPLIED_MATERIAL_REVIEW` is an error in missing-price. Bathroom/New House supply warnings differ. | False pricing failure and inconsistent readiness. Separate supply confirmation from missing contractor cost with regression tests. Existing tests explicitly expect this block, so it was not silently changed. |
| P1-03 | Common material and allowance coverage | 30 unresolved zero-cost assembly lines across sampled estimates; all eight incomplete samples block Ready. | Prepare verified material selections and job allowances for first contractor scopes. Preserve blank versus explicitly confirmed $0. See ranked report below. |
| P1-04 | Addition footage and additive labor semantics | A 50-ft common route plus one 50-ft home run yields 100 ft cable. Common route is added once to the first active row, not duplicated per row. Eight base hours plus task labor yields 21.15 hours in the edited sample. | Estimator can misunderstand the inputs and double-budget a physical run or labor. Confirm intended common-route/home-run authority and base/task meaning before changing formulas. |
| P1-05 | New House generic circuit and service scope | Eighteen common/kitchen/laundry/garage circuits all inherit the common 15A / 14/2 / Dual Function configuration in the sample; service/panel allowance 0 produces no equipment line. | Arithmetic is correct but a “complete new-home” label can exceed modeled scope. Qualified scope review, explicit circuit/service definitions, and clear exclusions are needed before unrestricted use. No code-compliance determination was automated. |
| P1-06 | EV output input and circuit selection are not coupled | Changing charger output to 65A leaves “Auto (Default 50A)” generating two 50A GFCI breakers. Source hardcodes Auto to 50; no output/circuit mismatch warning appears. | “Auto” is a configured default, not actual sizing. Confirm supported configuration rules with electrician review; at minimum clarify/validate contradictory inputs. Do not guess breaker/conductor sizes. |
| P1-07 | Production onboarding, signed-in lifecycle, and paid gating not verified | Local wizard, tenant guards, and test billing pass; real Clerk account flow, expired sessions, Stripe live setup/payment/webhooks and deployed account remain untested. | Required release smoke gate. Billing tests explicitly reject live Stripe secrets in current test-oriented configuration; do not promise paid signup until configuration/design is reviewed. |
| P1-08 | Actual Jobber import not verified | Four generated files match the preserved 119-header template and saved totals. No file imported into Jobber. | If advertised as import-ready, perform a supervised synthetic import and compare customer, scope, tax and total. Until then label only “Jobber Quote Import CSV.” |

### Additional estimating architecture decisions

- **Service main breaker verification:** The sample's configured Milbank meter-main and Siemens panel do not create a duplicate main-breaker charge. A separate source risk remains: the Service Upgrade included-main path depends in part on the meter-equipment selection string containing “meter main,” plus breaker characteristics, rather than universally verified resolved-product metadata. This is not a proven undercharge for the tested product; require metadata-driven regression coverage before broadening equipment choices.
- **Generic versus explicit circuits:** Addition already allocates its common route once; New House totals branch and equipment families separately. Do not add a new explicit circuit system on top of these allowances without a migration/authority contract. Kitchen/Bathroom models provide reusable patterns; no refactor was performed here.
- **Supply responsibility:** Customer-supplied purchase exclusions do not establish that all rough-in/support items exist. Review boxes, controls, connectors, and installation labor separately when expanding fixture responsibility controls.

## P2 after beta starts, with restrictions where noted

| ID | Finding | Recommendation |
|---|---|---|
| P2-01 | Customer list showed “No customers yet” after HTTP 503, with no retry | Fixed on review branch; two regression cases fail on baseline and pass after. |
| P2-02 | Customer search lacked an accessible name; customer navigation was row-click only | Fixed with labelled search and real customer links. |
| P2-03 | Large warning blocks and inconsistent taxonomy obscure actionable errors | Reuse compact review grouping, retaining every issue. Bathroom/Kitchen field warnings sometimes carry Service Upgrade source/code naming. Do not change readiness as cosmetic cleanup. |
| P2-04 | Labor labels and preview summaries vary | Standardize presentation to person-hours after mapping each model. Do not relabel a base field as “final labor” where task labor is added. |
| P2-05 | Customer-facing scope quality varies | Service Upgrade preview is too granular about supplies; Addition/New House include generic “Electrical material” wording. Custom labor-only internal preview can show an empty scope heading. Keep immutable issued proposals unchanged. |
| P2-06 | Long tablet/mobile builder pages | No measured page overflow in sampled widths, but dense warnings/materials consume substantial vertical space. Progressive disclosure should preserve frequent controls and advanced edits. |
| P2-07 | Draft test synchronization was weak | Strengthened stored-value assertions. Do not claim an unproven production persistence bug was fixed. |
| P2-08 | Setup/Price Book next action is unclear | Offer concise pricing-setup and unresolved-item guidance. A test company bypassing onboarding can produce zero-rate labor-only quotes; review direct-API/setup policy and real onboarding before broader release. |

## P3 polish

- **P3-01, wording:** Use “Customer-facing Proposal Description,” “Estimator Notes (Internal),” and “Final Selling Price” consistently at the presentation layer after a dedicated label inventory.
- **P3-02, compact summaries:** Add one-line collapsed section summaries when large-builder UX work is approved. Do not redesign all builders during an audit.
- **P3-03, precision presentation:** Retain unit-cost precision internally while consistently formatting final monetary summaries to cents.

## Unresolved material and zero-dollar report

The sample contains **38 zero-cost lines: 8 intentional and 30 unresolved/confirmation-required**, representing 26 distinct unresolved request/description keys. Frequency below counts distinct builders in this particular sample, not every possible optional configuration.

| Impact | Material / scope | Builders affected | Evidence and action |
|---|---|---|---|
| High, 3 builders | RWP26WCC10 screwless plate | Bathroom, Kitchen, Recessed | Verify purchased item/price; fail-closed placeholder currently remains. |
| High, 3 builders | Permit confirmation | EV, Panel, Service Upgrade | This is a job/company allowance decision, not a supplier product. Do not invent a default. |
| Medium, 2 builders | Duplex receptacle plate | Bathroom, Kitchen | Reconcile exact catalog identity or supply verified product. |
| Medium, 2 builders | Inspection and miscellaneous allowances | Panel, Service Upgrade | Require known job amount or explicit not-required/confirmed $0. |
| Single-builder but common scope | TM870-W switch, DVCL-153P-WH dimmer | Addition | Priced products exist; exact-key/SKU-suffix mismatch. |
| Single-builder, safety-critical | Verified standard duplex WR receptacle | New House | Leave unresolved pending explicit qualified product/preference. Indoor TR is forbidden. |
| Single-builder, common scope | Siemens 15A 1-pole AFCI | Bathroom | Two exact breaker candidates; company selection required. |
| Single-builder | Fixture outlet box | Bathroom | Verify contractor material. |
| Single-builder | USB, undercabinet, toggle plate, range/oven connection boxes | Kitchen | Product scope/connection method must be chosen, not guessed. |
| Single-builder | Recessed fixture consumables | Recessed | Decide individual product or approved allowance model; no fabricated price. |
| Single-builder | Ground bar, anti-oxidant, electrical tape | Panel | Generic keys do not share Service Upgrade's exact selected identities. Verify applicability before mapping. |
| Single-builder | Exterior light fixtures | New House | No verified contractor purchase selection; customer-supply option is separate future scope. |
| Single-builder | Lumber and utility coordination | Service Upgrade | Quote-specific cost/confirmation, not silent $0. |

The full `unresolved-materials.csv` lists every distinct key, builder frequency, and line count. `zero-dollar-lines.csv` classifies each actual line with its saved reason/status; `warning-classifications.csv` preserves current severity and proposed audit grouping.

Intentional zero lines are customer-supplied fixtures, included main breaker, and included panel closeout/labeling. They were not recosted. Unresolved contractor lines were not converted into legitimate $0 material.

### Resolver probes

The read-only diagnostic tested 240 manufacturer/amperage/pole/protection permutations across Siemens, Square D Homeline, Square D QO, Eaton BR and Eaton CH. Twenty-eight resolved, one was ambiguous, and 211 were unavailable in this catalog. Those 211 are not 211 defects: the grid deliberately includes unsupported or uncommon configurations.

Ten cable variants were probed using two circuits at 30 ft each, producing 60 ft and four connectors in the modeled rows. Missing 12/3 cable pricing and some larger 2-wire connector selections remain gaps. Existing connector preferences are not a substitute for verifying physical fit; no speculative connector change was made.

Supplier unit normalization retains precision and rejects unknown units in regression tests. Seed-looking or similar descriptions are not proof of verified WR qualification, breaker family compatibility, or usable supplier units.

## Labor consistency report

| Builder | Current model | Sample final person-hours | UX assessment |
|---|---|---:|---|
| New House | Crew × hours plus characteristic-adjusted scope tasks plus manual adjustment | 226.5133 | Base 160 hours is not final labor; expose the added task component. |
| Addition | Crew × hours plus device/lighting/fan/circuit tasks plus adjustment | 21.15 | Base 8 hours plus 13.15 task hours; label additivity clearly. |
| Kitchen | Task/circuit model plus manual adjustment | 54.35 | More structured modern model; final and adjustment labels should remain explicit. |
| Bathroom | Shared setup, incremental device/scope work, in-room/home-run/circuit labor, adjustment | 16.0167 | Route and circuit-specific labor need a transparent breakdown. |
| Recessed | Lighting-group/task model, access/height factors, adjustment | 10.95 | Preserve group calculations and manual-vs-suggested quantity distinction. |
| Service Call | Visits × crew × visit hours plus selected device work | 6.5 | Six visit hours plus 0.5 device labor; clarify before electrician enters a total visit allowance. |
| Panel Replacement | Crew × hours plus removal/feeder/grounding/access/general adjustments | 24 | 22 base plus 2 adjustment hours; person-hour labels should match Service Upgrade. |
| Service Upgrade | Crew × hours plus field-condition adjustments | 36 | Model is relatively explicit; no rate or coefficient change needed. |
| EV | Base setup plus route, quantity and access, difficulty multiplier, adjustment | 3.5 | Output amperage is not a labor/branch-sizing authority; configuration warning needed separately. |
| T&M | Crew × hours with explicit quote financial inputs | 12 | Clear person-hour reconciliation; current module identity preserved. |
| Custom | Explicit person-hours with quote financial inputs | 10 | Ensure rate/setup state is confirmed before use. |

No coefficient was tuned, and no pricing rate changed. Some legacy finalizers roll manual adjustment into reported calculated hours rather than returning a clean separate task/base/manual breakdown; correcting that contract requires focused compatibility tests, not a blanket label rename.

## Warnings, readiness, and error states

Required contractor pricing must block Ready; field assumptions generally need confirmation rather than being described as missing price. Customer-supplied purchase exclusion is informational unless a separate genuine dependency is unresolved. The report's proposed categories do not alter current warning severity.

| State | Evidence | Result / limitation |
|---|---|---|
| Missing required material or allowance | All eight incomplete builder samples, resolver tests | Explicit unresolved lines, Ready 409, export preflight blocked |
| Customer-supplied item | Addition/Bathroom/Kitchen/New House samples | Cost exclusion preserved; Addition classification issue documented |
| Customer fetch HTTP 503 | Two customer-list regression tests | Before false empty state; after clear Retry and no raw server detail |
| Empty customers / Price Book / quotes | Page-surface and onboarding fixtures | Renders; next-step guidance remains uneven |
| Invalid inputs and invalid preview/create shapes | API validation regression | Rejected; not a complete browser invalid-field matrix |
| Blocked/quota-exceeded local storage | Draft browser tests | Explicit storage warning; no silent successful-save claim |
| Missing/invalid proposal token, draft proposal token | Authorization/proposal tests | Rejected in local API |
| PDF pagination and long scope | Existing proposal browser regression | Pass; three fresh sampled public PDFs generated |
| Failed PDF/network/expired real session under all conditions | Not comprehensively fault-injected | Remains manual/fault-injection coverage work, not a claimed pass |

## Directory, responsive UX, and saved quotes

Directory regression verifies all 11 routes, card-body navigation, search, categories, favorite action independent of navigation, recently used behavior, scoped preference persistence, keyboard access, and responsive layout. Solo/Crew/Pro billing fixtures retain the same 11 builders. No large “Use Builder” button or redundant ACTIVE badge was reintroduced.

All 11 builders were captured at 1280, 768 and 375 px. Saved details were additionally captured at 768 and 375 px; dashboard, directory, Price Book, Customers, Settings and Billing have all three sizes. Recorded document width never exceeded viewport in these samples, and no builder console/page error was observed.

This does not prove every open dropdown, unusually long company name, large breaker inventory, physical touch target, or slow-network combination is usable. Existing mobile browser regression adds saved/export coverage; high-density Panel/Service forms remain candidates for progressive disclosure rather than redesign.

Saved detail retains quote identity, totals, internal view and customer view, advanced inputs, duplication, and export. Existing export/detail regression covers formatted object values rather than `[object Object]`; sampled customer previews contain no such rendering. Quote-local overrides and immutable-issued-snapshot behavior pass existing API/browser coverage. No real historical production quote was reopened, and none was repriced.

## Outputs and customer safety

| Output | What passed | What remains |
|---|---|---|
| Internal customer preview | All 11 saved samples opened; no loaded labor, gross profit/margin, raw object rendering in inspected content | More concise customer scope for older builders |
| Public proposal | Service Call, T&M, Custom samples; existing revision/token/acceptance regression | Live account and more fully priced builder families |
| PDF | Three fresh one-page PDFs; existing long-proposal pagination and agreement tests | Failed-generation UX matrix; physical printer testing |
| Acceptance | Automated required-agreement, revision-bound, tenant-safe, immutable/idempotent decision tests | Real production recipient session, no real customer contacted |
| Jobber Quote Import CSV | Four synthetic files, exact headers and totals | Actual Jobber import, tax configuration and account-specific behavior |
| Generic CSV / saved takeoff output | Existing snapshot/export regression | No independent external spreadsheet consumer certification |

Customer information flowed from browser-created and edited customer to selected builder, saved quote, public proposal data, and CSV. Duplicate normalized email was rejected with 409; same name with different email remained a separate customer. No merge rule was invented.

The three fresh public PDFs correspond to saved totals $976.25, $1,980 and $1,500. The additional customer-identity CSV is a $450 custom quote with explicitly configured synthetic rates; its initial setup-bypass run was not used as pricing certification.

### Jobber exact-template validation

Validation reads `artifacts/api-server/src/lib/jobber-official-2026.csv`, not spreadsheet grid dimensions. It finds **119 populated headers: 49 base fields plus 10 slots × 7 fields**, matching actual exported header names, casing and order.

Each file has one header row and exactly one quote row, 119 fields, valid UTF-8, valid service/product and boolean values, numeric amounts without currency symbols, and no more than 10 lines. The four samples use one grouped service line each; existing export tests cover large assemblies and CSV escaping, and the byte-level evidence summarizer reparses output.

Totals reconcile: Custom $1,500; customer workflow $450; Service Call $976.25; T&M $1,980. No CSV was sent or imported into a real Jobber account. Keep the integration claim conservative.

## Settings, onboarding, and security

Company financial settings feed server pricing: residential/commercial sell rates, loaded labor, material markup and margin target. Builder-specific default hours, quantities and flexible-estimate financial inputs also exist. Quote-local overrides are separate from company settings; the audit never updated real defaults.

Permit/inspection/miscellaneous/utility handling currently mixes job-specific confirmation and builder catalog/allowance fallback conventions. No unified shop-supplies policy was introduced. A future company-level consumables setting must default off for existing companies and prevent double counting with individually priced supplies.

The local onboarding wizard tests exercise a fresh provisioned test user, company-name validation, primary-trade selection, price-book choices, keyboard progression, and completion gating. The real sign-up provider was not used. Import preview/apply tests use synthetic records; the preserved catalog was loaded into audit companies for builder coverage rather than claiming a fresh live-company onboarding success.

| New-contractor question | Friction | Priority / answer |
|---|---|---|
| “Can I quote before pricing setup is finished?” | Wizard and direct API readiness need one clear policy; bypass fixture can retain zero financial inputs | P1 release/setup review; do not silently bless $0 rates |
| “The part is in my book, why is it missing?” | Exact request identity and preferred mapping are not obvious | P1 precise resolver review; explain selected product |
| “I entered 8 hours; why is labor higher?” | Base plus task labor is not transparent in older builders | P1 estimating clarity |
| “Does Auto size the EV circuit?” | UI says default 50A, but output field does not drive it | P1 scope/configuration review |
| “Why is my supplied fan a pricing error?” | Addition supply warning severity | P1 classification review |
| “Which missing items must I fix?” | Large warning blocks mix field notes and required costs | P2 compact grouped review |
| “Is this draft on my tablet too?” | Draft storage is browser-local and user/module scoped, not cloud draft synchronization | P2 concise storage guidance |

### Company isolation

Local API regression verifies unauthenticated requests denied, missing company membership denied, tenant-scoped quotes/materials/settings, cross-company resources hidden, protected supplier imports, and immutable saved pricing. A new two-company customer workflow explicitly checks customer GET/PATCH 404, quote/export 404, disjoint customer lists, and rejection of a query-string attempt to select another company's settings.

The new customer test's Price Book write probe was not executed because its companies had no catalog rows. Its disjoint empty lists alone are not evidence of Price Book write isolation; that coverage comes from the existing nonempty company/catalog API fixtures. No production penetration test or real multi-company Clerk session test was performed.

Billing suite coverage is test configuration, missing setup behavior, plan data, test checkout restrictions, rejection of live secrets/prices, and authentication. It is not a successful live charge, cancellation, webhook, renewal, plan-limit or failed-payment test. No billing prices or plans were changed.

## Draft investigation

The previous test waited only for a localStorage key to exist. A previous keystroke could have created that key before the newest values were persisted; the test then reloaded with a weaker synchronization condition than its assertion required.

The shared draft hook writes from a React effect, not a long debounce timer. The original pair of draft tests passed 20/20 executions, and the strengthened pair passed 20/20. The new assertions wait for exact customer/project and breaker quantities before navigating; no timeout increased and no draft runtime code changed.

Conclusion: a test synchronization weakness is proven and fixed. An intermittent production persistence defect was not reproduced. Immediate browser termination, cross-device recovery and every offline/quota/browser combination are not proven by these runs.

## Performance and code health

No runtime JS errors were observed in the eleven sample builder flows. The production build passes its reported entry-chunk budget: the entry bundle is about 476 KB before gzip, under the configured 500,000-byte threshold; route bundles and the PDF library are separate.

Worthwhile future work includes shared preview/issue presentation, person-hour breakdown contracts, configuration-driven circuit rows, verified panel inclusion metadata, consistent generic-versus-exact material identity, and bounded loading/error components. The approximately 5,400-line estimating engine and large Panel/Service forms are maintenance risks, not justification for an audit-time rewrite.

Some builders debounce previews and others maintain their own timing logic. No load test, API latency benchmark, request-rate budget, comprehensive rerender profile, or heap analysis was completed. Do not infer production performance from absence of console errors.

## Safe changes and regression evidence

| File | Change |
|---|---|
| `artifacts/electrical-estimator/src/pages/customers.tsx` | Only runtime change: fetch-error/Retry state, accessible search label, keyboard-accessible customer link |
| `scripts/src/customer-list-safety.browser.test.ts` | Two regression cases, proved failing on baseline and passing with fix |
| `scripts/src/quote-builder-draft-recovery.browser.test.ts` | Exact stored-value synchronization; no timeout increase |
| `scripts/src/beta-audit.browser.test.ts` | Opt-in 11-builder local audit runner and evidence capture |
| `scripts/src/beta-pages.browser.test.ts` | Opt-in responsive surface evidence |
| `scripts/src/beta-customer-workflow.browser.test.ts` | Opt-in customer lifecycle and isolation audit; explicit synthetic pricing |
| `artifacts/api-server/src/lib/beta-audit-calculations.ts` | Standalone read-only diagnostic, not imported by production engine |
| `scripts/beta-audit-artifacts.mjs` | Offline evidence CSV/JSON summarizer and exact-template checks |
| `docs/beta-audit-20260927-contract.md`, this report | Baseline, limitations, findings and review contract |

Before/after screenshots show the same HTTP-failure condition. Before, the user is told there are no customers; after, a plain error and Retry button appear. No other builder appearance was redesigned.

| Suite / check | Exact result | Evidence |
|---|---:|---|
| Full API | 299 passed, 0 failed, 0 skipped | `beta-api-final.log` |
| Final complete browser run | 52 passed, 0 failed, 0 skipped | `beta-browser-release-final.log` |
| Browser composition | 39 ordinary regression cases + 13 opt-in audit cases | Eleven builders + page surface + customer flow |
| Draft repetition before strengthening | 20 passed | `beta-draft-repeat.log` |
| Draft repetition after strengthening | 20 passed | `beta-draft-strengthened.log` |
| Customer regressions before fix | 2 expected failures | `beta-customer-before.log` |
| Customer regressions after fix | 2 passed, also included in final 52 | `beta-customer-after.log` |
| Typecheck | PASS, no TypeScript errors | Included in `pnpm run build` |
| Production build | PASS | `beta-build-release-final.log` |
| Independent financial traces | 11/11 reconcile | `calculation-audit.json` |
| Resolver diagnostics | 240 breaker permutations; 10 cable variants | Diagnostics, not an additional test-suite pass count |
| Jobber bytes/template/totals | 4/4 files pass | `evidence-summary.json` |

Repeated/focused checks are not added to the final 299/52 totals. These are local results; hosted CI and deployment are separate statuses.

### Reproduction

Use a disposable local test database and the repository's normal test environment. Never aim the audit seed runners at production. The opt-in browser audit refuses a database host other than localhost/127.0.0.1.

```sh
pnpm --filter @workspace/api-server test
AUDIT_CATALOG=/path/to/read-only-catalog.json AUDIT_OUTPUT=/path/to/evidence \
  pnpm --filter @workspace/scripts exec playwright test --config playwright.config.ts
pnpm run build
AUDIT_OUTPUT=/path/to/evidence node scripts/beta-audit-artifacts.mjs
```

The catalog file is intentionally not committed to GitHub. The report and reproduction helpers are sufficient to rerun against an authorized test catalog; private audit evidence is preserved in the Project.

## Final punch list in dependency order

1. Review the small Customers/draft-test PR. It changes no estimating behavior; merge only after explicit review.
2. Restore signed-in production browser access and verify the actual deployed commit, directory design, T&M Ready/PDF/revise, and New House WR fail-closed behavior.
3. Confirm first-beta scope and onboard a synthetic contractor through real authentication, pricing setup and catalog import. Decide whether zero-rate/unfinished-setup quotes may reach Ready.
4. Approve exact Addition switch/dimmer identity mapping and customer-supplied fan classification tests as isolated changes.
5. Resolve the highest-frequency catalog/allowance selections using verified supplier records and explicit company decisions. Do not invent prices or treat unknown as $0.
6. Review Addition common-route versus home-run authority and additive labor labels; then reuse the approved pattern for New House, not two new implementations.
7. Review New House generic circuit/service scope and EV output/circuit validation with an electrician. Keep these builders supervised until configurations are explicit.
8. Review included-main metadata and Panel/Service scope assumptions, then plan the previously requested UX work separately from this audit.
9. Perform a real synthetic Jobber CSV import and compare totals and customer mapping. Verify production PDF/acceptance without sending to real customers.
10. Validate live billing/auth/session/company isolation in an authorized test account. Do not launch paid self-serve onboarding on test-only assurances.
11. Apply compact warning groups and person-hour summaries without changing severity or financial formulas implicitly.
12. Repeat the full API/browser suites and live smoke checklist before changing release readiness.

### Decisions required from the owner

- Approve or reject the small audit PR; no automatic merge.
- Choose a supervised, restricted pilot versus waiting for all P1 gates.
- Confirm Addition cable-footage authority and the meaning of base/project hours.
- Select verified WR, AFCI, plates, boxes and other catalog products, plus allowance policies.
- Define setup completion/zero-rate readiness expectations and whether paid billing is in the first pilot.
- Approve a separate electrical configuration review for EV and New House before calculation or assembly changes.
- Arrange the signed-in production smoke and actual synthetic Jobber import.

No historical snapshot, real customer, production catalog record, company pricing default, billing plan, labor coefficient or markup/margin formula was altered by this audit. No new electrical-code rule was invented, and no unresolved cost was hidden to make a quote Ready.
