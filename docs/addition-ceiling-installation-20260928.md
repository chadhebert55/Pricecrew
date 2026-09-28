# Addition ceiling-fan installation scope

Baseline: main 08744b2. Scope is the approved new-support versus verified-reuse decision, not a pricing rewrite. No PR #34 identity work is redone.

## Behavior

- New installation requires a company catalog row ID plus matching manufacturer/part identity, sourced positive normalized cost and each/kit/set units. The estimator verifies the selected complete assembly is fan-rated, suitable and includes mounting/termination hardware. No fuzzy product selection or catalog record is created. An ordinary box is never automatically substituted.
- New installation adds one selected support assembly, TM870-W on/off control, S1-18-W control box and RWP26WCC10 plate per fan, plus explicitly measured total additional cable. Additional footage and controls must not also be entered in the generic route/circuit or switch allowances.
- Verified reuse requires separate support and wiring/control confirmations. No new support, wire or controls are charged. Stale new-installation values are ignored.
- Confirmations apply to all selected fans and record the confirmed quantity. Changing quantity requires reconfirmation. Changing mode, support selection or wiring clears relevant confirmations in the UI.
- Missing mode/confirmation, material price/identity or new wiring stays Needs Review. This now applies to contractor-supplied fans as well, closing the previous asymmetry. Missing legacy supplied scope retains its existing warning.
- Customer-supplied equipment remains zero purchase cost despite stale overrides; installation scope remains. Existing fan labor is 1.75 person-hours per fan; new controls add the existing Addition 0.4 hours per control. No new wiring/support coefficient is invented. Estimators use existing project/manual labor controls for job conditions.

## Boundaries

This is an all-fans choice; mixed new/reuse locations require separate estimates. New mode currently supports standard on/off switching, not an inferred speed-control or separate fan/light package. The estimator must confirm suitability or leave the quote unresolved.

The preserved company catalog has no verified support product and its selected wall plate has zero cost. New installation is Ready-capable with a complete company catalog, but not falsely Ready with those gaps. Reuse is Ready-capable after both confirmations, subject to all other quote errors. No signed-in production workflow was verified.

## Tests and reconciliation

- Before implementation: 7 focused tests, 6 failed / 1 passed.
- After implementation and quantity-invalidation coverage: 25 focused Addition tests passed.
- Both new/reuse browser lifecycles passed: exact draft restore, preview/save equality, Ready, customer preview, public proposal/PDF, duplicate/revise, removal of confirmation blocks Ready, originals unchanged after QA-only catalog cost edits.
- Full API: 324 passed. One older circuit fixture was updated to explicitly confirm reuse; its circuit assertions are unchanged.
- Full browser with opt-in audit enabled: final unchanged rerun 56 passed. Initial run had 55 pass/1 failure from the preexisting audit listener attempting response.json after navigation in Service Upgrade. No timeout/runtime change was made.
- Deployment configuration: 13 passed. Typecheck and production build passed.

Two supplied fans with synthetic $150 sell/$65 loaded rates and 8 project hours:

| Path | Material | Hours | Loaded labor | Customer labor | Selling | GP |
|---|---:|---:|---:|---:|---:|---:|
| Verified reuse | $0 | 11.5 | $747.50 | $1,725 | $1,725 | $977.50 |
| New, $40 support each, $2 switch/$3 box/$4 plate each, 30 ft at $0.80 | $122 | 12.3 | $799.50 | $1,845 | $1,997.50 | $1,076 |

New-path margin is 53.87%; existing finalizer, company rates, markup/margin formulas and stored historical financials are unchanged. Optional JSON input fields require no SQL migration. Existing immutable snapshots are not recalculated.

## Release

Focused PR only. User also authorized a separate app-wide customer-scope presentation follow-up; it is intentionally not bundled here. CI and merge identifiers are recorded in the final report.
