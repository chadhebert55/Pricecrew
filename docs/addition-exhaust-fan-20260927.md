# Addition bathroom exhaust fans: implementation and beta follow-up

## Scope and baseline

Baseline: main `32f4d33d5b0a1bf8cfd822db9d827d73cacfccdd`, after PRs #33 and #34. The approved product decision is to support bathroom exhaust fans within Addition, reusing Bathroom behavior rather than creating a separate pricing system.

Verification uses disposable local Postgres companies, synthetic prices, and the preserved 302-row company catalog snapshot. This is not signed-in production workflow verification. No production catalog, customer, settings or historical quote was edited.

## Before and after

Previously Addition offered ceiling fans only. It now has optional bathroom exhaust-only fan quantity, contractor versus Customer/GC supply, standard/timer/humidity control, separately measured total additional wiring, cable selection and a quote-local equipment override.

Zero quantity or absent new scope preserves the previous estimate exactly. This does not infer a complete bathroom from a fan count: receptacles, lighting and required circuits remain explicitly configured in the existing Addition sections. Fan/light/heat combinations, ductwork, replacement/reuse, multi-gang arrangements and additional accessories are not guessed.

The shared engine factors out Bathroom's equipment identity, controls, control-box/plate identities, wiring labor and equipment-pricing semantics. Both paths use those definitions. Bathroom's existing behavior, including its existing supplied-fixture semantics, remains unchanged.

## Generated materials and catalog trace

| Scope | Shared identity | Preserved company catalog result |
|---|---|---|
| Fan equipment, one per fan | Panasonic FV-0511VF1 exhaust fan | Row 372, SKU 1697956, MPN FV-0511VF1, existing $119.291/ea |
| Standard control, one per fan | Pass & Seymour TM870-W, SKU 3211 | Row 311, existing $1.85/ea |
| Control box, one per fan | Pass & Seymour S1-18-W, SKU 18134 | Row 310, existing $2.4769/ea |
| Control plate, one per fan | Legrand radiant RWP26WCC10 1-gang screwless wall plate | No verified resolution in preserved snapshot; excluded from priced cost and Needs Review |
| Timer alternative | fan timer switch | Unresolved company selection in preserved snapshot |
| Humidity alternative | fan humidity-sensing control | Unresolved company selection in preserved snapshot |
| Measured cable | 12/2, 14/2 or 14/3 NM-B cable, selected explicitly | Default 12/2 resolves row 399, SKU 3873, existing $0.562271/ft |

These amounts are observed snapshot values, not hardcoded prices or new defaults. Shared catalog resolution preserves missing/ambiguous selection errors. No close substitute or new catalog record was introduced.

## Labor, supplied equipment and double-counting

Exhaust labor adds the established Bathroom coefficients: 2.25 person-hours per fan, plus 0.5 per standard control or 0.75 per timer/humidity control, plus total additional wiring footage / 30. Addition's existing crew/project labor remains authoritative; Bathroom's 1.5-hour setup is not added again.

For two standard-control fans with 30 total additional feet, the increment is 6.5 person-hours. With an 8-hour existing baseline, the test obtains 14.5 hours, $942.50 loaded labor at synthetic $65/hour, and $2,175 customer labor at synthetic $150/hour. Existing margin/markup/finalization and overrides remain unchanged.

Customer/GC-supplied equipment always has zero purchase cost, a CUSTOMER_SUPPLIED resolution and an intentional-exclusion reason. This branch wins over a stale positive equipment override. Controls, box, plate, measured cable and installation labor remain identical to contractor-supplied scope.

Footage is a total, not multiplied by fan count. It must exclude existing common-route and circuit-schedule footage. Fan controls are generated once per fan and must not be repeated in the general switch count; the UI states both boundaries. Existing circuit and ceiling-fan lines remain unchanged. Estimator-entered overlapping scope cannot be inferred or automatically deduplicated.

## Readiness and compatibility

Missing/zero wiring produces ADDITION_EXHAUST_WIRING_REQUIRED and blocks Ready. Missing required fan or installation-material prices, duplicates, or a zero equipment override remain unresolved. Deliberately supplied equipment does not itself block Ready, but unresolved installation materials still do.

Circuit suitability, mounting/termination and field conditions remain visible field-verification advice. No new code-compliance determination or automatic branch circuit is introduced. Existing supplied ceiling-fan support/wiring blocking remains in place and is not bypassed by this new exhaust scope.

The sole contract extension is optional `AdditionInputs.bathroomExhaust`, reflected in OpenAPI, generated client/Zod types and the stored TypeScript input type. Existing endpoints/required fields are unchanged; no SQL migration or historical recalculation is performed. Old payloads stay unchanged. Draft and duplicate/revise preserve the optional scope and stale override, while the server safely excludes the supplied purchase charge.

Saved pricing and assembly remain immutable when a disposable test-company cable price changes. Existing proposal/PDF code is unchanged and customer-facing exports are checked for internal cost, warning and catalog leakage.

## Verification before PR

| Check | Result |
|---|---|
| New regression reproduction before implementation | 9 tests: 2 pass, 7 fail |
| Focused Addition exhaust, Addition identity and modern Bathroom | 26 pass, 0 fail |
| Full API | 316 pass, 0 fail, 0 skipped |
| Full browser, opt-in 11-builder audit enabled | 54 pass, 0 fail, 0 skipped |
| Final new browser lifecycle rerun | 1 pass |
| Deployment-configuration tests | 13 pass |
| Workspace typecheck and production build | Pass |

The browser regression covers supplied override precedence, exact draft persistence, restore, desktop/tablet/mobile overflow checks, save, Ready, public proposal, PDF, duplicate/revise, immutable originals, and Ready rejection after a required QA cable price is removed. The full browser run also checks the T&M builder identity and verified WR safeguards.

During test authoring, API response-field assertions and post-Ready approval metadata comparison were corrected to match existing contracts. A test-only DOM typing issue was corrected. No timeouts were increased or production runtime changed to mask test failures.

## Remaining beta findings

- **Ceiling-fan support/wiring:** Existing Addition ceiling-fan scope still needs a verified support/accessory/reuse model. Exhaust-fan support does not silently settle it.
- **Subpanel qualification:** Existing 60A/100A scope aliases resolve to Siemens SN2020L1125; the upstream manufacturer setting does not independently configure subpanel manufacturer. Preserve this rather than guess which manufacturer the estimator intended. Neutral isolation, ground bars and feeder suitability require explicit configuration decisions.
- **Catalog gaps:** Exhaust plate/timer/humidity controls, #6 copper SER, contractor ceiling fan, 12/3 NM-B and certain Eaton/Square D protection combinations remain company-selection work. The existing #1 aluminum SER metadata is truncated and does not certify full conductor configuration.
- **Production/integrations:** Signed-in production exhaust lifecycle, real Jobber CSV import, live Clerk/security configuration and paid billing/webhook flows are not certified by local tests. Existing broad beta gates remain.
- **Dependencies:** Production audit reports 8 advisories: 3 high and 5 moderate, no critical. These were not introduced by this change. OCR depends on sharp 0.33.5 (two high reports); ONNX installation transitively uses adm-zip 0.6.0 (one high and one moderate). Other moderate reports affect uuid 9.0.1, OpenTelemetry core 1.30.1 and qs 6.15.3 (two reports). A non-blocking CI audit is not a clean security bill of health.

The [sharp libvips advisory](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [sharp libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), and [adm-zip allocation advisory](https://github.com/advisories/GHSA-7q85-xj36-vmfc) require isolated dependency remediation with OCR/install-path regression and exposure review. Major transitive upgrades were not guessed into an estimating feature. The reported [adm-zip symlink issue](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9) has no patched version in the audit result.

## Decisions still needed

1. Approve verified company plate, timer and humidity-control products/prices. Existing Bathroom mappings are reused, not substituted.
2. Define ceiling-fan new-installation versus reuse/replacement support and wiring scope before lifting its current review block.
3. Define separate subpanel equipment/manufacturer selection and which feeder/grounding attributes must be explicitly verified.
4. Decide whether future Addition scope needs fan/light/heat combinations or installation-only/reused-wiring paths. Current exhaust-only new wiring scope does not pretend to support them.

These decisions are not prerequisites to safely merging the opt-in exhaust-only feature. They do limit the jobs that can reach Ready and prevent an unrestricted-beta certification.

## Changed files

- `artifacts/api-server/src/lib/estimating-engine.ts`
- `artifacts/api-server/src/lib/addition-exhaust-fan.test.ts`
- `artifacts/electrical-estimator/src/components/addition-exhaust-fan-fields.tsx`
- `artifacts/electrical-estimator/src/pages/quotes/new-addition.tsx`
- `lib/api-spec/openapi.yaml`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/additionInputs.ts`
- `lib/api-zod/src/generated/types/additionBathroomExhaust.ts`
- `lib/api-zod/src/generated/types/additionBathroomExhaustCableType.ts`
- `lib/api-zod/src/generated/types/additionBathroomExhaustControl.ts`
- `lib/api-zod/src/generated/types/index.ts`
- `lib/db/src/schema/estimating.ts` (TypeScript input only, no database schema migration)
- `scripts/src/addition-exhaust-fan.browser.test.ts`
- `docs/addition-exhaust-fan-20260927.md`

No company prices/rates, labor coefficients, margin formulas, billing, stored catalog records, historical snapshots, OCR or unrelated builder behavior changed. Release and post-merge results are recorded in the PR and final report.
