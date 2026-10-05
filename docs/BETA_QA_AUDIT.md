# PriceCrew Electrical Beta Readiness

Test date: September 26, 2026 (America/New_York). Audited application revision: `9c987ee12434331d8bfc0f11b3acb026ae7ce59e`, including the pending builder-directory changes. Audit branch: `audit/electrical-beta-qa`.

**Recommendation: address the two P0 findings before inviting an unrestricted electrical beta.** The financial arithmetic reconciled in all 11 sample estimates, but correct arithmetic cannot compensate for an incorrect selected product, missing assembly components, or an unusable saved-quote transition. Do not interpret incomplete-price diagnostic totals as customer-ready bids.

This is a working-workflow audit, not just a source review. It used browser interaction, actual local API/database saves, restored drafts, generated proposals/PDFs/CSVs, a read-only copy of 302 company catalog records, and source-level calculation tracing. No pricing formulas, material mappings, labor coefficients, production data, customer communications, or Stripe configuration were changed during the audit. Only audit runners and documentation were added.

## Environment and evidence boundaries

- **Application under test:** local frontend/API/Postgres, based on the revision above. Existing production catalog records were read and copied into isolated local test companies. New synthetic customers used `qa@example.com`; no actual customers were contacted.
- **Production coverage:** public marketing/pricing pages were inspected live. Authenticated production signup, Clerk sessions, production Settings, paid-plan provisioning, and an actual Jobber import were not completed. This report is not a claim that every tested branch change is deployed.
- **Deployment state:** resolver and Bathroom changes were merged earlier. Builder-directory PR #30 remains open. Its code was tested locally and in CI, but this audit does not authorize or claim a production merge.
- **Rates used:** $150/hour residential customer labor, $165 commercial, $65 loaded labor, 25% material markup, 40% target margin. These were explicit test-company settings, not changes to production settings. Custom used 8 hours; T&M used one person × 8 hours at $165; Service Call used one visit × one person × two base hours; New House used two × 80 crew hours; Service Upgrade two × 16; Panel two × 10.
- **Test outcomes:** dedicated real-catalog builder run 11/11 passed as an audit harness; cross-page responsive capture 1/1; API regression 293/293. The broader browser suite had 33 passes and one intermittent directory draft-persistence failure; all four directory tests passed on focused retry. The 11 opt-in audit cases were intentionally skipped in that broader run, having run separately with the catalog snapshot.
- **Meaning of a passing audit case:** evidence was captured, the route worked, the draft restored, and snapshot assertions passed. It does not mean its material pricing was complete or its Ready transition passed.
- **Harness errors excluded from product defect counts:** missing test Clerk environment variables caused an initial API run to fail; the correctly configured rerun passed 293/293. Initial PDF checks performed after duplication hit the intended superseded-proposal protection; reordered tests generated PDFs normally. Settings requires ClerkProvider and cannot render in the current bypass harness. No production Settings crash is alleged.
- **Evidence:** sanitized calculation/zero-cost appendices, test CSV, screenshots and PDFs accompany this report. Raw test JSON includes local IDs and the copied company catalog and is not a public deliverable. No credentials or real customer private information belong in the report.

## Prioritized punch list

Counts: **P0: 2 · P1: 11 · P2: 4 · P3: 2**. Counts include explicitly labeled investigation and verification items; they are not all confirmed software defects. P0/P1 items are intentionally documented rather than fixed under this audit-only scope.

### P0 blockers

| ID | Area / page | Reproduction and actual result | Expected behavior | Recommendation / shared impact |
| --- | --- | --- | --- | --- |
| P0-01 | Saved Quotes / Time & Materials; confirmed | Create a current T&M quote with one person, 8 hours, $75 miscellaneous material. Save draft, then mark Ready. PATCH returns 409: “unsupported legacy calculator.” Duplicate succeeds but retains `TIME_MATERIALS`, so the suggested recovery does not fix the canonical identifier. | A quote produced by the current builder should pass the supported-module check and then undergo ordinary readiness validation. | `normalizeEstimateModule` strips underscores to `TIMEMATERIALS`, but aliases only include `TIMEANDMATERIALS`. Add canonical identifier coverage and regression tests for Ready, overrides and revise. Shared quote-update routing affected; do not rewrite historical snapshots. |
| P0-02 | New House / material identity; confirmed mismatch | Use default New House with three exterior receptacles. Assembly calls them “Exterior weather-resistant receptacles,” but resolves SKU 243085 / P&S 3232-TRW, requested as a standard TR duplex receptacle, at $1 each. Snapshot contains no verified WR qualification. | WR scope must request a verified WR material family or remain unresolved, not declare a standard TR match adequate. | Introduce/validate the correct request specification and company-approved WR mapping. Do not guess a replacement. Builder assembly plus central resolution contract affected. This is an estimating product mismatch, not an electrical-code certification. |

### P1 important

| ID | Area / page | Reproduction and actual result | Expected behavior | Recommendation / shared impact |
| --- | --- | --- | --- | --- |
| P1-01 | Addition / exact material resolution; confirmed | Default Addition has two switches and one dimmer. TM870-W and DVCL-153P-WH resolve to $0, although catalog rows with the same part identities and SKU suffixes exist at $1.85 and $30.28. Other newer builders resolve them. | Stable supplier/part identity should survive a display-description suffix. | Route these requests through stable catalog identities/preferences, not description equality. Shared resolver integration affected; do not fuzzy-match or duplicate records. |
| P1-02 | Addition / customer supply; confirmed | Default customer-supplied ceiling fan has status `CUSTOMER_SUPPLIED` and an intentional exclusion, but pricing still contains error-level `CUSTOMER_SUPPLIED_MATERIAL_REVIEW`. | Customer supply alone must not make pricing incomplete; installation labor remains. | Remove only the obsolete blocking warning path after verifying the shared status contract. Addition/legacy warning integration affected. Other missing materials must still block Ready. |
| P1-03 | Customer scopes / proposals; confirmed | Generate Service Call with one TR receptacle. Its actual public proposal and PDF say “Electrical material / 1 ea.” New House and Addition have repeated generic rows; Service Upgrade still exposes a long material-oriented scope. | Useful customer-facing work, not a generic or raw-takeoff substitute. | Extend stable builder-work scope mapping while keeping internal costs/SKUs private. Shared customer-scope generator affected. Do not expose raw catalog descriptions to fix it. |
| P1-04 | Customer-supplied responsibility in grouped scopes; confirmed | Bathroom with customer-supplied vanity, or Kitchen with customer-supplied decorative fixtures, groups lighting as “Included.” `customer.supplied` regex does not match the stored sentence “Customer is supplying this fixture…”. | Proposal should clearly distinguish supply from installation when fixtures are customer supplied. | Read structured `CUSTOMER_SUPPLIED` status instead of inferring responsibility from prose. Shared proposal grouping affected. No internal financial leak was observed. |
| P1-05 | New House / Addition assembly completeness; suspected missing costs | Inspect default assemblies: devices, fixtures, cable and breakers are present, but no corresponding general device-box/plate/connector lines. New House has 14 assembly rows despite dozens of devices. | Required rough-in/trim components must be priced, explicitly included in another priced assembly, or flagged for selection. | Compare each device assembly with company standards. Establish whether another charge intentionally includes these components before adding costs. Builder-specific assembly definitions affected; not safe to patch speculatively. |
| P1-06 | Labor allowance overlap; suspected, not proven duplicate | Addition adds 8 entered crew hours plus 12.25 task hours; New House adds 160 crew hours plus 59.254 modeled task hours; Service Call adds 2 visit-hours plus 0.5 receptacle labor. | Estimator must understand whether entered crew/visit time is a base allowance or a total already covering task work. | Confirm intended semantics with the owner. Relabel/document or change only after explicit labor-model review. Shared engine contains the arithmetic, but behavior is builder-specific. Do not simply subtract task labor to lower totals. |
| P1-07 | New House / wire defaults; electrician review | Default 15A, 14/2 common branch configuration also drives five kitchen-appliance and two laundry circuits. That yields 18 × 60 feet of 14/2 across these categories. | Distinct loads should have clearly reviewable cable/protection assumptions; generic defaults must not appear universally approved. | Electrician review of grouped circuit defaults and per-load configuration. New House circuit plan affected. Suspicious estimating assumptions, not a code ruling. |
| P1-08 | Company material decisions / catalog readiness; confirmed gaps | Default Bathroom, Kitchen, Recessed, Panel and other samples remain incomplete for plates, boxes, consumables, specialty fixtures and/or job fees. Siemens 15A AFCI has two equally valid priced candidates and no winning preference. | Genuine uncertainty stays unresolved, with clear selection/fee actions. | Complete the consolidated material decisions below. Prefer existing supplier records; no arbitrary alternates. Shared resolver/preferences plus company data affected. Correctly blocking uncertainty is not itself a resolver defect. |
| P1-09 | Billing / paid launch; confirmed incomplete implementation | Billing shows test-mode Solo $19 and Crew $49 only; current-plan result is null and Pro is absent from the checkout plan list. No real paid lifecycle was exercised. | Before paid launch, all three plans and active subscription state must match approved terms. | Separate paid-phase implementation and sandbox lifecycle verification, including cancel/reactivate and founding eligibility. Shared billing affected. Not a reason to create charges during this free-beta audit. |
| P1-10 | Marketing / historical pricing promise; confirmed copy conflict | Homepage says updating a price once makes every estimate, “old and new,” use the current number. | Saved quotes retain their pricing snapshots until an intentional revision/refresh. | Correct the marketing explanation, not historical quote behavior. Marketing only; no shared calculation change. The claim was observed on the [live homepage](https://getpricecrew.com/). |
| P1-11 | Draft recovery reliability; intermittent / investigation | Full suite: navigate directory → Bathroom, immediately enter project name, wait 10 seconds for localStorage; value never appears. Focused retry and 11-builder direct-route restore tests pass. | Input should not be lost around asynchronous defaults/settings initialization; draft save should be reliable. | Use the archived failed-run log and reproduce under slow settings/network before fixing. Could be test timing or an initialization race; not a proven production data-loss bug. Shared draft/default initialization may be involved. |

### P2 polish and verification gaps

| ID | Area / page | Reproduction and actual result | Expected behavior | Recommendation / shared impact |
| --- | --- | --- | --- | --- |
| P2-01 | Kitchen warning summary; confirmed | Default modern Kitchen correctly generates six 20A breakers but also says estimator-set 20A quantity 0 differs from one included circuit. Warning originates from disabled legacy-base fields. | Show warnings for the authoritative current circuit plan only. | Filter or prevent the obsolete base warning without changing quantities. Kitchen/legacy calculation wrapper affected. |
| P2-02 | Kitchen material label; confirmed | Countertop line says “Decora-style” while selected SKU 243085 is the standard duplex TR item and plate request is duplex. | Display must agree with the configured device and plate form factor. | Resolve company intent, then align label/specification. Do not silently buy a different device. Kitchen presentation/request wording affected. |
| P2-03 | Pricing offer clarity; confirmed copy ambiguity | Home says first 100 accounts; pricing says first 100 paying customers. Pricing also says founding pricing lasts only through phase two while separately promising active-subscription lock. Annual prices are presented without an approved annual policy in this task. | Eligibility, availability window and retained price should be unambiguous. | Use “first 100 paying customers,” distinguish signup window from lifetime-while-active lock, and confirm annual treatment. No amount edits. Marketing only. Observed on [homepage](https://getpricecrew.com/) and [pricing page](https://getpricecrew.com/pricing.html). |
| P2-04 | Settings / authentication QA coverage; harness limitation | Bypass-mode browser Settings hits `useAuth` outside ClerkProvider; other authenticated test pages use the test wrapper successfully. | Test harness should support Settings, followed by a real Clerk account smoke test. | Add appropriate auth-provider testing support separately; verify live company-settings edit/persistence. No evidence of the same failure with a real ClerkProvider. Test/shared auth boundary affected. |

### P3 future

| ID | Area | Reproduction / actual | Expected or desired | Recommendation / shared impact |
| --- | --- | --- | --- | --- |
| P3-01 | Builder Favorites / Recent | Favorites persist per user in this browser, not across devices. | Optional cross-device continuity when a user-settings service is available. | Keep safe browser persistence for beta; no migration needed now. Navigation preferences only. |
| P3-02 | Long proposal PDF density | 55-row fixture produces three pages; page three contains total/terms/acceptance with considerable whitespace. No clipping, overlap or orphaned scope row observed. | Optional denser long-document layout without sacrificing acceptance space. | Later consider layout tuning after real contractor examples. PDF presentation only, not a launch blocker. |

## All-builder financial and workflow results

Every builder route opened. Each sample saved an unfinished draft, restored entered project information, calculated through the real API, saved matching assembly/pricing, opened Internal and Customer views, and duplicated without changing the original pricing snapshot. Default UI settings were used except one downstream Bathroom receptacle and explicit manual materials for the flexible builders.

| Builder | Calculated hours | Material subtotal | Loaded labor | Customer labor | Selling total | Ready attempt |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| New House | 219.2540 | $2,609.00 | $14,251.51 | $32,888.10 | $36,149.35 | Blocked: unresolved exterior fixtures |
| Custom Quote | 8.0000 | $180.00 | $520.00 | $1,200.00 | $1,425.00 | Passed; actual public proposal/PDF/CSV |
| Service Call | 2.5000 | $1.00 | $162.50 | $375.00 | $376.25 | Passed; actual public proposal/PDF/CSV |
| Time & Materials | 8.0000 | $75.00 | $520.00 | $1,320.00 | $1,413.75 | Incorrect legacy-module block |
| Addition | 20.2500 | $236.88 | $1,316.25 | $3,037.50 | $3,333.60 | Missing-price and customer-supply errors |
| Bathroom | 15.5167 | $271.41 | $1,008.58 | $2,327.50 | $2,666.76 | Four unresolved contractor lines |
| EV Charger | 3.0000 | $191.94 | $195.00 | $450.00 | $689.92 | Correctly blocked: unconfirmed permit fee |
| Kitchen | 46.3500 | $978.50 | $3,012.75 | $6,952.50 | $8,175.63 | Unselected contractor materials |
| Recessed Lighting | 6.7500 | $179.48 | $438.75 | $1,012.50 | $1,236.85 | Consumables/plate missing |
| Service Upgrade | 32.0000 | $1,540.83 | $2,080.00 | $4,800.00 | $6,726.04 | Unconfirmed lumber/fees |
| Panel Replacement | 22.0000 | $433.82 | $1,430.00 | $3,300.00 | $3,842.28 | Materials/fees unresolved |

These numbers are test results, not recommendations. All eleven reconcile against the existing arithmetic: rounded assembly sum → loaded labor → customer labor → larger of markup-plus-labor and margin-floor price. Profit equals selling price minus materials and loaded labor; no new pricing engine was introduced. The audit independently checked those sums, not just the absence of an error.

Manual adjustments/overrides were covered by existing API and focused Bathroom/Kitchen/Recessed/Panel browser regressions. All sample manual adjustments were zero, so this audit did not disguise missing materials with override prices.

## Labor construction and double-counting review

| Builder | Observed construction | Audit interpretation |
| --- | --- | --- |
| New House | 160 crew hours + 53.75 task hours × 1.1024 characteristic factor = 219.254 | Crew/task overlap requires confirmation. Factor covers floor/garage characteristics, not a price-per-square-foot shortcut. |
| Custom | Entered 8 hours | No additional task labor in sample. |
| Service Call | 1 visit × 1 person × 2 hours + 1 receptacle × 0.5 = 2.5 | Confirm whether base visit time already includes device installation. |
| T&M | 1 person × 8 hours = 8 | No extra task labor in sample; saved-module bug is separate. |
| Addition | 8 crew + 6×0.45 receptacles + 2×0.4 switches + 0.5 dimmer + 4×1 recessed + 1.75 fan + 2.5 circuit = 20.25 | Possible entered-total versus base-allowance ambiguity. |
| Bathroom | 8 circuit/home-run + 0.75 GFCI + 0.55 downstream + 0.5 general control + 0.5 fan control + 0.8 vanity + 2.25 fan + 20/30 in-room + 1.5 setup = 15.5167 | No repeated device-driven circuit found; circuit base is largest contributor. |
| EV | 2 setup + 15/30 route + 1×0.5 equipment = 3 | Standard difficulty/access, adjustment zero. Customer-supplied charger does not remove installation labor. |
| Kitchen | 16.7667 setup/common wiring/devices/fixtures/controls + 29.5833 actual circuit bases/routes = 46.35 | Legacy appliance circuit quantities are zeroed before authoritative circuit assemblies are added. No duplicate legacy circuit charge found in this sample. |
| Recessed | 1.25 setup + 4×0.85 fixtures + 0.5 dimmer + 64/40 wiring = 6.75 | No new-home-run labor on selected existing-circuit sample. |
| Service Upgrade | 2 people × 16 hours + zero adjustments = 32 | Included directory line has no second purchase charge. Verify entered crew allowance covers all actual service work. |
| Panel | 2 people × 10 hours + 1 removal + 1 feeder = 22 | Confirm entered crew hours are baseline excluding these incremental tasks. Included main breaker is not charged twice. |

Specific material checks:

- **Kitchen boxes:** nine countertop/control boxes plus four separate appliance boxes. Generic box description explicitly excludes appliance boxes; no duplicate found in the sample. Plates are separated into four countertop duplex, three USB/dimmer decorator, two three-way toggle and four appliance duplex. Required prices are unresolved rather than silently assumed.
- **Kitchen wire/breakers:** 360 feet of 12/2 appliance home runs + 40 feet of 14/2 lighting home run + 80 feet of additional common-route 12/2. Six 20A DF plus one 15A DF breaker; 14 connectors. No duplicate legacy home-run assembly found. Estimator must ensure common-route allowance does not describe the same physical run.
- **Bathroom:** two actual circuits, two breakers, 60 home-run feet, four connectors, separate 20-foot in-room allowance. Two receptacles do not create two receptacle circuits. The prior 19.0-hour reconstruction versus corrected 15.5-hour result and full component breakdown remain in `bathroom-circuit-clarity.md`.
- **Addition:** 50 common-route feet + 50 home-run feet = 100 feet. Separate labels make this potentially legitimate, but verify route semantics before treating it as duplication.
- **Panel:** included main breaker remains $0 with explicit inclusion; no second main charge. SER/reuse regressions verify no automatic conduit duplication.
- **New House/Addition:** missing box/plate/connector coverage is a concern, not evidence that duplicate allowances should be deleted.
- **Zero/inactive items:** focused Bathroom and Recessed regressions confirmed no fixture material/labor at zero quantity and preserved circuit independence. No universal claim is made about every possible combination in all builders.

## Consolidated zero-cost classification

Categories: A customer supplied; B intentionally included/no separate material cost; C reliable catalog identity exists but this request failed; D equal valid duplicates; E UOM failure; F company/job selection or verification needed; G no matching product found in the inspected catalog. F does not imply a product is absent from all supplier catalogs.

| Builder / material | Category | Why / action |
| --- | --- | --- |
| New House ceiling fans | A | Explicit customer supply; installation labor remains. |
| New House exterior lighting | F | Choose fixture standard or intentional customer supply; not a verified priced family. |
| Addition single-pole switches | C | TM870-W / SKU 3211 exists; request-description path misses suffix. |
| Addition dimmers | C | DVCL-153P-WH / SKU 607393 exists; same mismatch. |
| Addition ceiling fans | A | Correct $0 but obsolete blocking warning must be fixed. |
| Bathroom vanity fixture | A | Correct zero purchase cost; labor and rough-in remain. |
| Bathroom Siemens 15A AFCI | D | Q115AFC and QA115AFC remain equally valid priced matches. Company preference required, not arbitrary cheapest selection. |
| Bathroom decorator plate | F | Current requested RWP26WCC10 row lacks reliable positive cost. |
| Bathroom duplex plates, fixture outlet box | F | Company standard/compatibility selection required. |
| EV permit | F | Job fee is unconfirmed; not a supplier material failure. Explicit verified $0 or Not Required is supported. |
| EV customer-provided charger | A | Purchase line omitted rather than unresolved; labor remains. |
| Kitchen sink light and island pendants | A | Explicit customer supply, no pricing-incomplete error from these lines. |
| Kitchen undercabinet lights | F | Contractor supplied by default; needs actual product/price. Not converted to customer supplied to hide missing cost. |
| Kitchen USB receptacle | F | Company standard required. |
| Kitchen countertop, decorator, toggle, appliance plates | F | Select verified matching form factors and prices. |
| Recessed installation consumables | F | Define sourced consumables or explicit included assembly; do not invent a lump sum. |
| Recessed control plate | F | Same unpriced RWP26WCC10 request. |
| Service Upgrade job lumber | F | Job-specific plywood/stud purchase cost not confirmed. |
| Service Upgrade permit, inspection, utility, miscellaneous | F | Enter intentional job fee or explicitly confirm zero/not required. |
| Service Upgrade directory/labeling | B | Included in assembly labor. |
| Panel included main breaker | B | Included in the selected PN4040B1200C panel. |
| Panel ground bar | F | Multiple manufacturer-specific catalog candidates exist; select approved compatible family. Not a blind generic substitution. |
| Panel anti-oxidant and tape | F | Catalog candidates exist, but generic placeholder requests have no company-approved preference. Tape product suitability must be reviewed. |
| Panel permit, inspection, miscellaneous | F | Same job-fee confirmation requirement. |
| Panel directory/closeout | B | Included labor, no separate purchase. |
| Wire matrix: 12/3 NM-B | G | No matching row found in the inspected 302-record company catalog. |
| Wire matrix: connector for 8/2 or 6/2 | F | No deterministic compatible company preference. Flag only those material requests. |

Custom, Service Call and T&M sample assemblies had no zero-cost material rows. No active sample row was classified E after normalization; synthetic unknown-UOM and mismatched-base tests fail closed as expected.

## Catalog, breaker and wire audit

The deterministic resolver honors compatible preferred records before equally valid supplier matches. It does not collapse similar descriptions or bypass panel-family compatibility. Existing source date, raw supplier cost/UOM, normalized cost, supplier SKU and resolved status survive in material snapshots.

Known checks:

- P&S 3232-TRW / SKU 243085 resolves at $1 each.
- Kitchen six Siemens Q120DF / SKU 942105 resolve at $69.239 each; extended internal value $415.434, displayed $415.43.
- Siemens QF120A / SKU 1098885 resolves at $71.027 each.
- NM94: 25.399/c → $0.25399/ea; NM95: 50.651/c → $0.50651/ea; RD-42: 763.579/c → $7.63579/ea.
- Unknown UOM produces no conversion. Stored raw supplier values are preserved. Dimension mismatch tests reject feet-as-each preferences.
- The real-catalog matrix requested 240 combinations: five manufacturer families × six amperages (15/20/30/40/50/60) × two pole counts × four protection types. **28 resolved, one ambiguous, 211 had no verified match.** Many cross-product combinations are not expected available products; this is coverage evidence, not 212 catalog defects.
- Resolved counts: Siemens 13, Homeline 8, Eaton BR 7, QO 0, Eaton CH 0. No cross-family substitution observed. Zero QO/CH matches means the inspected catalog cannot satisfy those requests, not that those products do not exist.
- Siemens 15A AFCI was the one ambiguous combination. The 20A DF preferred item did not remain ambiguous.
- Cable matrix used two explicit circuits × 30 feet. Each generated 60 home-run feet and four connectors. 14/2, 14/3, 12/2, 10/2, 10/3, 8/2, 8/3, 6/2, 6/3 resolved; 12/3 did not. Connector preferences were unresolved for 8/2 and 6/2.
- This matrix intentionally exercises supported and suspicious configurations; it is not an ampacity approval. Incompatible combinations and feeder/service suitability remain electrician review matters. Existing unsafe-cable readiness regressions passed.

## Customer proposals, PDFs and exports

Public proposal privacy and accept/decline regression checks passed. Sample public output did not expose internal hours, loaded labor, margins, supplier prices, raw builder inputs, JSON or internal Ready badge. Customer View was inspected for all 11 saved samples; incomplete samples were not forced Ready merely to generate a PDF.

Actual Custom and Service Call saved quotes generated one-page PDFs with correct number/date/total, scope, terms and signature area. A separate controlled panel fixture generated a clean one-page PDF; a 55-row controlled fixture generated three pages with repeated headings and preserved custom terms. These two layout fixtures are not real production quotes. All six rendered pages were inspected: no text clipping, overlap, orphaned scope row or footer collision was observed.

The official Jobber template has **119 populated headers**, 49 base fields plus ten seven-field slots. Three actual CSVs generated from isolated saved Custom, Service Call and T&M quotes each parsed as two records with exactly 119 cells per record and an identical ordered header list to the [official Jobber CSV](https://help.getjobber.com/help-center/files/39456455271831/quotes-sample-file.csv).

The delivered test file is `service-call-jobber.csv`:

- Synthetic saved Service Call quote; total $376.25.
- One Service line, quantity 1, UNIT Price 376.25, status Draft.
- UNIT Cost intentionally blank; no private material assembly dumped.
- Synthetic QA client name/email and property address; no fabricated production customer mapping.
- Comma, apostrophe, quotes and multiline description exercised; UTF-8 decoding and CSV parse succeeded.
- TRUE/FALSE fields and accepted status/category checked; unused cells remain empty; no undefined, NaN, null, object-string or JSON payload found.
- Existing-ID/new-address, multi-scope, ten-line limit, override, rounding and tax-review behavior are covered by export/API regressions. More than ten customer scope lines blocks rather than silently drops scope.
- Exported unit prices: Custom 1425.00, Service Call 376.25, T&M 1413.75, each exactly equal to its saved final selling price.

**No actual Jobber-account import was performed.** Structural conformity is proven; operational compatibility is not. The earlier request for a CSV from an existing production quote remains dependent on verified client/property/tax mapping. This QA file is explicitly not a substitute represented as that production quote. Follow [Jobber's import workflow](https://help.getjobber.com/en/articles/import-quotes/) for the final account test.

Generic Quote CSV remains a separate escape hatch. Housecall Pro and QuickBooks exports are experimental/unverified, not certified direct imports. Exact PriceCrew → Jobber field mapping and uncollected fields are documented in `saved-quote-jobber-cleanup.md`.

## Onboarding, customers, plans and mobile

The eight onboarding browser scenarios passed: initial step, placeholder/empty-name validation, Enter submission, trade requirement, electrical import route, skip route, non-electrical notice and Back preservation. Authenticated and anonymous route tests, tenant isolation API tests, saved links and stale-proposal protection passed in the local harness.

Customer list rendered at desktop/tablet/mobile. Test quote creation exercised synthetic customer associations and persistence. A full real-user customer-edit UI journey and real Clerk signup/session-expiry journey were not completed. Company Settings remained blocked by the harness provider limitation; its real signed-in save/reload remains a launch checklist item.

All 11 builder routes were exercised in the directory test. Search (`panel`, `service`, `car`, `bath`, `custom`), empty-state reset, favorites without navigation, recent links, keyboard navigation, per-user browser preferences and draft recovery passed on focused retry. Solo/Crew/Pro billing fixtures all showed all 11 builders. Source review found no builder-specific plan gate. This verifies directory availability, not actual paid subscription provisioning.

Dashboard, directory, Price Book, customer list, Billing, all builder forms and saved quotes were captured at relevant desktop/tablet/mobile sizes. At 1280, 768 and 375 pixels, the measured document width never exceeded the viewport on the tested rendered screens. Settings is excluded from this success claim because only its error boundary rendered. Tables may intentionally scroll within their own container.

No page-level JavaScript errors were captured in the 11-builder run. No `[object Object]`, NaN or Infinity display was observed in those sample views. Browser console errors on the cross-page sweep were limited to the known Settings test-provider failure. This is sample coverage, not proof that every nested table or all long text is safe.

The live pricing page correctly displayed the requested four-week free beta, founding monthly $19/$49/$99, and regular monthly $29/$69/$199. It also displayed founding annual $190/$499/$999 and regular annual $290/$699/$1999, which need a product decision rather than an audit-time amount change. Referral and paid capability promises still require implementation verification. Findings above cover the eligibility and lock wording conflicts on the [live pricing page](https://getpricecrew.com/pricing.html).

## Launch readiness

PASS means passed within the explicitly tested scope, not universal production certification. NEEDS WORK includes substantive issues and required verification not completed.

| Area | Result | Reason |
| --- | --- | --- |
| Authentication | NEEDS WORK | Local auth/tenant tests pass; real Clerk signup/session journey still required. |
| Onboarding | PASS | Eight browser scenarios passed in isolated environment. |
| Company Setup | NEEDS WORK | Real signed-in Settings save/reload blocked from this harness coverage. |
| Price Book | NEEDS WORK | UI/import data available; missing approved families and Addition identity-path failure. |
| Supplier Import | PASS | Reviewed selected-row import and conflict/identity regressions pass locally; no production import applied. |
| Quote Builders | NEEDS WORK | Eleven routes/drafts work, but T&M Ready bug and New House material mismatch remain. |
| Material Resolution | NEEDS WORK | Known preferred/UOM cases pass; missing preferences and builder integration gaps remain. |
| Labor Calculations | NEEDS WORK | Arithmetic reconciles; entered base/total versus task overlap needs owner review. |
| Saved Quotes | NEEDS WORK | Snapshots stable; T&M module normalization fails, intermittent draft test needs investigation. |
| Customer Proposals | NEEDS WORK | Privacy passes; generic scope and supply-responsibility defects remain. |
| PDF | PASS | Two actual one-page outputs plus controlled one-/three-page layouts inspected; wording inherits scope issues. |
| Jobber Export | NEEDS WORK | Exact 119-header structural/total checks pass; real account import still unverified. |
| Billing | NEEDS WORK | Test-only implementation, missing Pro checkout and paid lifecycle verification. |
| Mobile | PASS | Tested rendered screens fit 375/768 widths; Settings and full real-auth journey excluded. |
| Data Safety | PASS | No production writes/charges/messages; local snapshots unchanged after duplication; tenant tests pass. |

## Recommended order

1. Fix canonical T&M saved-module handling and the New House WR request mismatch; add regression tests before merging.
2. Resolve Addition's known part identities and remove its obsolete customer-supply blocker.
3. Correct customer-facing scope and explicit supply responsibility without exposing internal data.
4. Decide company material standards: 15A Siemens AFCI preference, plates, fixture box, USB, undercabinet product, consumables, compatible ground bar, tape/compound; supply verified job fees.
5. Review New House/Addition missing assembly components and New House grouped cable defaults with the electrician.
6. Review labor-entry semantics, not coefficients based solely on whether the price looks high.
7. Reproduce the draft initialization flake, then complete real Clerk/Settings/customer-edit smoke tests on the intended deployment.
8. Import the QA CSV in a real Jobber account and record the resulting client/property/quote total. Do not send it to a customer.
9. Align marketing snapshot/founding wording; finish sandbox billing lifecycle before the paid phase.

## Files added during this audit

- `docs/BETA_QA_AUDIT.md`: this persistent report.
- `scripts/src/beta-audit.browser.test.ts`: opt-in, localhost-only real-catalog workflow audit for all 11 builders.
- `scripts/src/beta-pages.browser.test.ts`: opt-in responsive surface capture.
- `artifacts/api-server/src/lib/beta-audit-calculations.ts`: read-only matrix, UOM and arithmetic evidence runner.

No application production code was modified as an audit fix. Do not run the catalog-backed harness against production: it explicitly refuses a non-local database. The broader existing test suite also requires disposable test databases and the documented test environment. Keep raw catalog exports and test authentication details outside public reports.
