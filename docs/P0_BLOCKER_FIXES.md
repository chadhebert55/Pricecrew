# PriceCrew P0 Blocker Fixes

Test date: September 26, 2026, America/New_York (September 27 UTC). Branch: `fix/p0-tm-and-wr`, based on production/main commit `3ca0b50`.

Both requested P0 regression cases pass. This patch addresses only the Time & Materials identifier failure and the New House weather-resistant receptacle false match. It does not merge the pending builder-directory work or implement any P1/P2/P3 recommendations.

## Time & Materials: cause and correction

The builder already uses the canonical identifier `TIME_MATERIALS`. Normalization removes underscores, yielding `TIMEMATERIALS`, but the backend supported only the human-readable aliases that normalize to `TIMEANDMATERIALS` or `TIMEANDMATERIALSBUILDER`. Consequently, a current quote could save successfully and then fail its Ready transition with HTTP 409, incorrectly labeled an unsupported legacy calculator.

The frontend's route and canonical-module maps had the same omission. Adding the canonical key to all three existing maps fixes Ready validation, Duplicate/Revise navigation, and revision prefill without introducing a new module, changing identifiers at rest, or creating a parallel normalization architecture.

| Lifecycle stage | Identity and verification |
|---|---|
| Builder route | Existing `/quotes/new/time-materials` retained |
| Preview request/result | `TIME_MATERIALS` request verified in browser and API tests; assembly preserved when saved |
| Quote creation/snapshot | Existing `TIME_MATERIALS` identifier retained; no snapshot migration |
| Ready | Canonical identifier recognized; ordinary readiness rules still apply |
| Customer proposal | Public proposal opens and retains the saved selling price |
| PDF | Actual browser-generated PDF inspected; saved total present, internal profit/cost labels absent |
| Duplicate API | New quote retains canonical module, assembly, and total |
| Duplicate/Revise UI | Opens existing route; restores hours/materials; saves canonical revision |
| Draft recovery | Real local draft save/reload/restore preserves inputs |
| Exports | Inspected module usage; no additional T&M-specific rejection path or exporter change needed. Existing export regressions pass; no real Jobber-account import attempted |

Existing aliases `Time & Materials` and `Time and Materials Builder` remain supported. Tests simulate persisted aliases in isolated data, mark them Ready, and create canonical revisions while preserving the original stored alias, assembly, and price. Unknown legacy calculators remain unsupported. Existing deliberate recalculation policies for Ready/revision are unchanged; this patch does not promise that explicitly recalculating a draft against changed settings freezes that draft's price.

## New House WR: cause and correction

The exterior assembly was labeled “Exterior weather-resistant receptacles” but explicitly requested `Pass & Seymour 3232-TRW 15A TR duplex receptacle`. The resolver therefore selected indoor SKU 243085 at $1 each without evidence of WR qualification. Manufacturer preference and an exact indoor match cannot establish weather resistance.

The exterior assembly now requests the distinct family `15A TR weather-resistant exterior duplex receptacle`. The central resolver checks product qualification before preference ranking, and its invalid-UOM fallback also rejects an unqualified product. There is no price hard-code or fuzzy qualification inference.

The catalog already stores manufacturer, manufacturer part, amperage, protection, and preferences but did not have structured TR/WR proof. This patch adds optional `verifiedReceptacle` metadata inside the existing preference JSON:

- **Identity:** Manufacturer and exact part must match the selected catalog record.
- **Evidence:** A nonblank verification source must be supplied.
- **Required specification:** 15A, duplex, standard protection, tamper resistant, and weather resistant.
- **Contradictions:** Existing catalog amperage or protection metadata cannot conflict with the qualification.
- **Ranking:** A verified preferred match or approved alternate can resolve. Equally valid candidates remain ambiguous.
- **No bypass:** A preferred indoor record, a similar description, or a part-number suffix is insufficient.

This preserves the existing request's standard-duplex protection type rather than silently substituting a GFCI device. Whether a different exterior assembly/protection configuration is desired is a company decision, not part of this patch. No electrical-code compliance claim is made.

No database column, table, or migration is added. The TypeScript JSON type, OpenAPI contract, and generated clients/validators are updated together so verified metadata survives normal API persistence. Synthetic verified products are test fixtures only, not real company approvals. There is no new qualification-management UI; the ordinary “Select Catalog Item” preference alone cannot bypass this proof requirement.

### Current company catalog

A read-only live company-catalog check found no verified compatible match for this exterior request. The standard P&S 3232-TRW / Northeast SKU 243085 has an indoor preference and no WR qualification. The listed 1597-TRWRW and 2097-TRWRW records are GFCIs with no recorded qualification for this standard-duplex request; the latter is also 20A. Their names or suffixes were not treated as proof, and neither was substituted.

Until an exact compatible company product is verified, the exterior material remains `UNRESOLVED_NEEDS_COMPANY_SELECTION`, with “Needs company material selection” and its weather-resistant request identified in the warning. It receives no fabricated price or indoor catalog snapshot. Standard indoor TR requests still resolve normally to P&S 3232-TRW.

For a fresh estimate with three exterior devices, the incorrect $3 indoor material charge is no longer included. The result is incomplete pricing requiring review, not a cheaper fully priced quote. Historical New House quotes are not migrated or silently repriced.

## Regression evidence

Before production-code changes, three targeted regressions reproduced the failures: canonical normalization returned null, Ready returned 409, and the exterior material incorrectly cost $1 each instead of remaining unresolved. Those same failure paths now pass.

| Check | Final result |
|---|---|
| Focused P0 API/resolver tests | 6 passed, 0 failed; 62 unrelated tests excluded by name filter |
| Full API regression | 299 passed, 0 failed, 0 skipped |
| Focused new browser tests | 3 passed, included in the 15-test run below |
| Relevant browser regression | 15 passed, 0 failed |
| Workspace type check | Passed |
| Full workspace build | Passed |
| Final test-project type check and whitespace check | Passed |

Independent [GitHub CI verification](https://github.com/chadhebert55/Pricecrew/actions/runs/36285812303) of code commit `7bb28a6` also passed: 299 API tests, the full 33-test browser suite, 13 deployment-configuration tests, and typecheck/build. The code is isolated in [P0-only PR #32](https://github.com/chadhebert55/Pricecrew/pull/32); its automatic Vercel preview deployment succeeded, but it has not been merged to production.

The full API count includes the six new P0 tests; the browser count includes the three new browser tests. These are not additive unique counts of 305 API or 18 browser tests.

### T&M financial and snapshot trace

The final browser fixture uses an isolated test company, one person, eight hours, a $150 customer labor rate, $65 loaded labor rate, 25% material markup, 40% target margin, and $75 entered material. These are test settings only, not changes to the user's rates.

| Quantity | Test result |
|---|---:|
| Labor hours | 8 |
| Material cost | $75.00 |
| Loaded labor cost | $520.00 |
| Customer labor | $1,200.00 |
| Saved/PDF selling price | $1,293.75 |

The browser asserts unchanged assembly and total through Ready and revision, and unchanged original pricing/assembly after revision. The API tests additionally check duplicate snapshots, supported historical aliases, and a saved WR test snapshot remaining unchanged after the fixture's catalog price/qualification changes.

The first browser lifecycle run also passed with default zero-rate test settings. Strengthening the fixture exposed test setup mistakes involving builder-specific defaults and fraction-vs-percent storage; these were corrected in test data only. The final full relevant browser run passed with nonzero labor. No application pricing behavior was modified to accommodate the test.

### Shared resolver and affected builders

- **Indoor TR:** Explicit negative/positive paired test proves the standard indoor part still resolves indoor scope but cannot satisfy the WR request.
- **Bathroom GFCIs:** Existing API assembly tests and Bathroom browser regression pass.
- **Kitchen receptacles:** Existing real-company resolver/assembly tests and Kitchen browser regression pass.
- **Service Call:** Existing API calculation, preview/save, and material-resolution coverage passes.
- **Customer-supplied materials:** Existing shared status/cost and Kitchen/Bathroom/Recessed regressions pass.
- **Breakers:** Existing manufacturer/family, duplicate, preferred, panel, and protection regressions pass; Panel browser cases pass.
- **Other exterior builders:** Source inspection found no other explicit WR/exterior receptacle request path. This qualification gate is scoped to the named family; it is not a generic outdoor-device classifier or a claim about future builders.
- **Other relevant UI:** Recessed, quote draft recovery, customer proposals/PDF, and existing Jobber export cases pass. No corresponding feature code changed.

The new WR tests also cover a verified preferred product, verified alternate, equally qualified ambiguity, changed manufacturer/part identity, conflicting amperage/protection, missing source, and false TR/WR flags. API persistence of the structured proof is tested.

## Exact changed files

Handwritten production files:

- `artifacts/api-server/src/routes/estimating.ts`: Canonical T&M alias.
- `artifacts/electrical-estimator/src/lib/quote-builder-routes.ts`: T&M route and canonical-module aliases.
- `artifacts/api-server/src/lib/material-resolution.ts`: Qualified WR family and pre-ranking proof gate.
- `artifacts/api-server/src/lib/estimating-engine.ts`: Exterior request identity and qualified UOM fallback; no arithmetic changes.
- `lib/db/src/schema/estimating.ts`: Optional TypeScript property for existing preference JSON; no DDL.
- `lib/api-spec/openapi.yaml`: Optional structured qualification contract.

Generated contract files:

- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/index.ts`
- `lib/api-zod/src/generated/types/materialPreference.ts`
- `lib/api-zod/src/generated/types/materialPreferenceVerifiedReceptacle.ts`
- `lib/api-zod/src/generated/types/materialPreferenceVerifiedReceptacleDeviceType.ts`
- `lib/api-zod/src/generated/types/materialPreferenceVerifiedReceptacleProtection.ts`

Tests and documentation:

- `artifacts/api-server/src/lib/estimating-foundation.test.ts`
- `artifacts/api-server/src/lib/material-resolution.test.ts`
- `scripts/src/p0-blockers.browser.test.ts`
- `docs/P0_BLOCKER_FIXES.md`

## Preservation and rollout

Pricing formulas, labor coefficients, subscription logic, Jobber implementation, builder-directory code, and unrelated builder forms are unchanged. No production customer records, company settings, supplier prices, quote snapshots, or proposal totals were written. All mutating regression tests use isolated local databases and test companies; the live catalog query was read-only.

This patch is prepared separately from the pending directory/audit branches, and the private test preview is updated. Production merge/deployment is not included in this verification. The one remaining material decision is to identify and document a genuinely compatible WR company product before enabling resolution; leaving it unresolved is the intended safe outcome, not an unfinished P0 fix.
