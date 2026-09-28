# Customer-facing work scope

Baseline: main `28d10b799594b9c7de042ea90c0780c898719001`, after merged Addition ceiling-fan PR #36. This change is presentation and customer-scope review only; no engine, material resolver, catalog, rate, coefficient, billing or database schema changes.

## Root cause and architecture

The previous customer path sanitized individual material descriptions into generic labels, then exposed those rows. Some remodel builders grouped only by material category. Neither model expressed the selected work.

`customerProposalScope` remains the shared entry point. The new `customerWorkScope` registry uses saved semantic assembly IDs and saved job inputs to summarize selected work. Supporting wire, boxes, plates, connectors and protection stay inside installation scope. Counts come from saved quantities, not hardcoded examples. T&M uses saved customer labor hours/rate and billing categories, never loaded costs. Custom work uses explicit contractor-entered descriptions; generic descriptions require review.

Saved detail, public web proposal, printable proposal, browser PDF and the automatic Jobber description fallback consume this shared view. Existing Panel Replacement semantics are preserved. Module normalization was moved unchanged to `estimate-module.ts` so historical aliases use the same rules as calculation/revision routes.

Customer scope is a deterministic projection of persisted assembly, inputs and pricing, not a new stored financial snapshot. Reload/duplicate use those saved values. No SQL migration, catalog lookup, recalculation, or historical data rewrite occurs. The public Total Investment remains `quote.pricing.finalSellingPrice`.

Unknown module/material scope or generic custom descriptions are exposed only as contractor-side review messages. Ready transitions reject them. Existing public tokens also fail closed for missing customer scope, including decision submission, without exposing internal issue details. Existing pricing/readiness validation remains in place.

## Tested examples

| Builder | Previous presentation | Current selected work |
|---|---|---|
| Addition | 14 material rows, generic descriptions and cable footage | 11 receptacles, 4 switches, 2 dimmers, 8 recessed fixtures, one supplied ceiling fan, one supplied exhaust fan, 5 circuits, final trim |
| New House | 14 material rows including wiring/protection | Devices, lighting, alarms, supplied fans, bathroom/exterior/garage work, appliance/laundry/general/HVAC circuits |
| Kitchen | 6 broad material-category groups | Named appliance circuits, countertop/USB receptacles, supplied decorative lighting, recessed lighting and controls |
| Bathroom | 6 material-category groups | GFCI/downstream receptacles, supplied vanity lighting, exhaust fan, selected bathroom circuits and controls |
| Recessed Lighting | 4 material-category groups | Fixtures, groups, selected controls, new/replacement location and selected wiring scope |
| Service Call | One generic catalog row | Selected replacement task and service visit count |
| Panel Replacement | 7 summarized scope rows | Same selected panel/reuse/grounding/breaker/backboard/closeout concepts |
| Service Upgrade | 34 equipment/conductor/fitting rows | 11 major service, equipment, grounding, surge and closeout items |
| EV Charger | 3 material rows | Circuit count, supplied charger installation, routing, protection and commissioning |
| Time & Materials | Empty included scope for labor-only estimate | 12 person-hours at saved $165 customer hourly rate |
| Custom | Manual item | Preserved meaningful description and corrected “2 locations,” not “2 locationss” |

All 11 paired fixtures have byte-equivalent serialized assembly and pricing before/after. The fixtures intentionally contain unresolved catalog pricing; rendering/PDF tests use the saved DTO in an isolated public-render fixture while confirming the actual Ready API rejects incomplete estimates. They are not claimed as real send-ready quotes.

Real public API/UI sharing is separately exercised for Ready-capable T&M, Custom and both Addition ceiling-fan paths. Both fan paths retain draft restore, exact preview/save equality, revision, confirmation blocking and immutable financials.

## Verification

- Focused customer scope: 16 passed.
- API: 333 passed, zero failures/skips.
- Browser including opt-in 11-builder audit: 67 passed, zero failures/skips.
- Deployment configuration: 13 passed.
- Typecheck and production build: passed.
- All 11 builders: saved customer view, desktop/tablet/mobile public render, PDF text/scope/total parity, duplicate and unchanged original after test-only catalog price change.
- Two Addition paths: customer-supplied fan purchase remains $0. New includes selected support, controls and wiring; verified reuse omits new support/wire/control. Relevant contractor-material gaps still block.

Regression tests formerly asserted “Electrical material” or invented fixture IDs; they now use semantic work identities and meaningful expected scope. Authorization/decision tests no longer inherit arbitrary seed takeoff IDs. The opt-in lighting audit now waits for the exact restored eight-light, 22-foot-room preview rather than taking an older four-light response. No timeout or runtime persistence change.

## Financial reconciliation, synthetic Ready Addition cases

| Case | Material | Loaded labor | Internal cost | Customer labor | Selling | Gross profit | Margin |
|---|---:|---:|---:|---:|---:|---:|---:|
| New support, two supplied fans, one branch circuit | $232 | $962 | $1,194 | $2,220 | $2,510 | $1,316 | 52.43% |
| Verified reuse, two supplied fans, one branch circuit | $110 | $910 | $1,020 | $2,100 | $2,237.50 | $1,217.50 | 54.41% |

These use synthetic test catalog values, not production supplier prices.

## Remaining limits

- No signed-in production workflow verified. Local tests and CI do not establish production acceptance.
- New Addition fan support still needs a verified company catalog selection. Previously identified wall-plate and other missing catalog prices remain unresolved; this PR does not supply prices.
- Mixed new/reused ceiling-fan locations remain outside the existing all-fans choice.
- Unknown legacy/custom scope requires contractor revision; descriptions are not invented.
- Kitchen and New House samples use two PDF pages; other samples use one. Scope and totals match across formats.
- Existing builder-generated proposal description prose is not rewritten. Estimators must review that free text; this change addresses Included Scope and its data flow.
- Jobber real-account import, billing/Clerk production checks, subpanel qualification, catalog gaps and dependency advisories remain separate beta work.
