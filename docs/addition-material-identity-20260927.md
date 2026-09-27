# Addition material identity and supplied-fan audit

## Scope and baseline

Baseline is main `d663640ee18928937b27ec49ad3be70e0a9c630d`, after [PR #33](https://github.com/chadhebert55/Pricecrew/pull/33). Only two Addition control identities, Addition's supplied-fan warning metadata, and two explanatory UI strings are changed. The implementation does not redesign Addition or add an exhaust-fan assembly.

Catalog findings use the preserved 302-row company catalog snapshot from the preceding September 26/27 audit. Source dates in that snapshot are mostly August 25/27, 2026. These are reproducible snapshot findings, not a fresh production catalog certification. Browser tests use disposable local companies and local Postgres; no production settings, prices, customers, catalog rows, or quotes were edited.

## Confirmed bugs and bounded repair

- **Exact controls failed to resolve:** Addition requests `Pass & Seymour TM870-W 15A single-pole switch` and `Lutron DVCL-153P-WH Diva LED+ dimmer`. Existing catalog descriptions append supplier SKU suffixes. The shared exact-name lookup cannot find them without an explicit preference. Addition now also qualifies an exact manufacturer AND manufacturer-part-number match in Controls, with supplier/source-date evidence, then delegates preference ranking, ambiguity, and cost normalization to the existing resolver. No fuzzy or SKU-only match, new material price, catalog rename, or shared matching rewrite.
- **Supplied fan was misclassified:** The fan was already intentionally excluded at zero purchase cost, but its warning text was mapped to a missing-price error. The new Addition-only code is `ADDITION_SUPPLIED_FAN_SCOPE_REVIEW`, category `field-verification`, severity `error`. Existing Ready blocking is retained because support and wiring scope is not separately modeled or confirmed. Other builders' warnings are unchanged.
- **UI overclaimed support:** The previous helper said fan-rated support remained included, although Addition generates no dedicated support assembly. The helper now accurately retains labor and asks for support/wiring confirmation. It explicitly says ceiling fans are not exhaust-fan scope.

Five of eight regression tests failed before implementation; all eight pass after. No readiness shortcut was introduced.

## Input to material to output trace

UI `new-addition.tsx` sends `ADDITION` inputs to server preview/create. `calculateAdditionEstimate` creates the authoritative assembly; shared lookup, breaker/cable resolution, `addLine`, and `finalizeEstimate` produce costs, resolution status, immutable material snapshots, and pricing. Saved quote retrieval does not recalculate from current catalog values.

| Input / generated line | Request and observed catalog identity | Finding |
|---|---|---|
| Receptacles × quantity | `Pass & Seymour 3232-TRW 15A TR duplex receptacle`; row 353, SKU 243085, MPN 3232-TRW; $1/ea | Existing company-preferred indoor TR identity. Not a WR request; Addition has no separate exterior-WR input. |
| Switches × quantity | `Pass & Seymour TM870-W 15A single-pole switch`; row 311, SKU 3211, MPN TM870-W; $1.85/ea | Exact product was present but unresolved due to display suffix. Repaired without altering its stored price. |
| Dimmers × quantity | `Lutron DVCL-153P-WH Diva LED+ dimmer`; row 313, SKU 607393, matching MPN; $30.28/ea | Same suffix defect, repaired. Does not imply every load is dimmer-compatible. |
| Recessed lights × quantity | 4-inch Juno WF4DREGSMAL, row 314, $30.605/ea; 6-inch WF6-DREG, row 315, $34.006/ea | Explicit company-priced products; no automatic exhaust/fixture substitute. Catalog supplier SKU is absent for these two rows. |
| Ceiling fans × quantity, supplied | No purchase catalog lookup; `CUSTOMER_SUPPLIED`, $0 with exclusion reason | Correct deliberate exclusion, including when an old positive override remains in state. Task labor and all other generated materials retained. |
| Ceiling fans × quantity, contractor supplied | `Contractor-supplied ceiling fan`; row 376 is a zero-cost generic placeholder | Unresolved until a verified company selection or permitted positive quote-local cost is supplied. Zero override stays unresolved. No Panasonic exhaust product substituted. |
| Active circuit cable | Exact cable type through shared heavy-circuit resolver; default 12/2 NM-B is row 399, SKU 3873, MPN `WIC. ROMEX 12/2`, $0.562271/ft | Cable footage is common route once on the first active row plus home run × each row quantity. Default 50 + 50 × 1 = 100 ft, not 50. |
| Active circuit breaker | Manufacturer, amperage, poles, protection via shared resolver; default Siemens 20A 1-pole AFCI is QA120AFC, row 381, SKU 900102, $52.233 | One breaker per circuit. Wrong manufacturer/protection is not substituted to obtain a price. |
| 60A subpanel feeder | `#6 copper SER cable`; row 570, zero price/no exact sourced product | Remains unresolved. No conductor substitution. |
| 100A subpanel feeder | `#1 aluminum SER cable`; row 408, SKU 295809, MPN `WIA. SER 1-1-1-`, $2.417841/ft | Existing sourced row resolves, but truncated part metadata does not independently certify full conductor configuration or installation ampacity. Contractor review needed. |
| Subpanel feeder breaker × 1 | Siemens 60A Q260 row 414/SKU 25268/$21.10, or 100A Q2100H row 415/SKU 12427/$153.411 | Existing shared breaker selection retained. |
| Subpanel load center × 1 | `60A subpanel load center` row 409 or `100A subpanel load center` row 410; both map to Siemens SN2020L1125, SKU 1552612, stored 125A rating, $90.476 | Two scope aliases for the same product, not two simultaneous charges. Generic selection is not constrained by the UI's selected manufacturer; that input also represents feeding-panel breaker family. Need explicit business/equipment model before changing it. |

The trace enumerates every Addition material-emitting path, including legacy scalar circuits, 4/6-inch recessed selection, supplied/contractor fan, both subpanels, nine offered cable variants, and twelve 20A breaker family/protection combinations (27 diagnostic scenarios). It is not exhaustive certification of every amperage/pole permutation.

### Additional catalog gaps in diagnostic scenarios

- **12/3 NM-B:** No matching verified row in the snapshot; stays unresolved.
- **Eaton 20A 1-pole GFCI:** No qualified match in the snapshot; stays unresolved.
- **Square D Homeline 20A 1-pole AFCI:** No qualified match in the snapshot; stays unresolved.
- **Other offered cables tested:** 14/2, 14/3, 12/2, 10/2, 10/3, 8/2, 8/3, and 6/3 NM-B resolve through their existing catalog paths.
- **Fan support/boxes/controls/connectors:** Addition has no dedicated fan support or accessory assembly. A supplied toggle does not remove these lines: they were not generated in the first place. Do not equate generic route cable with a verified complete installation assembly.

## Supplied-fan semantics and decisions

Addition models **ceiling fans**, not bathroom/exhaust fans. The catalog has Panasonic FV-0511VF1 (SKU 1697956), FV-0511VFL (1697108), FV-0511VHL (1620176), and FV-0511VH1 (1620175) bathroom/exhaust equipment, but those are not compatible replacements for the requested ceiling-fan identity.

The current boolean distinguishes customer-supplied purchase exclusion from contractor purchase. It has no separate GC identity, contractor stock/already-purchased exclusion, installation-only mode, or replacement-versus-new scope. If the electrician is supplying a purchased fan, the current contractor branch charges its cost; if “supplied” is meant to mean already paid outside this quote, that needs an explicit estimating rule. This audit does not invent that rule.

Supply true ignores fan purchase cost and any stored override. Supply false uses a positive quote-local override or the current company lookup; explicit zero is unresolved. Both branches retain 1.75 person-hours per fan plus all other existing materials and task labor. A regression exercises nonzero circuit cable and proves the fan toggle preserves it.

Decisions requiring contractor review:

1. Should Addition support bathroom/exhaust equipment, or should that scope stay in Bathroom? Which exact equipment/control combinations?
2. What verified fan-rated box/support, wire, control, connector scope belongs to new installation versus replacement, and what may legitimately be reused?
3. What confirmation should permit Ready for supplied fixtures once that assembly is complete? Current block deliberately remains; no fake “confirmed” bypass.
4. Should supplying-party choices include GC and contractor stock/already paid? Define purchase-cost treatment independently from installation labor.
5. Does the existing 50-ft common route represent distribution wire in addition to the 50-ft circuit home run? Clarify before changing footage.
6. Should the subpanel manufacturer be independently selectable from the feeding-panel manufacturer, and how should actual panel model, neutral isolation, ground bar and feeder suitability be confirmed?

## Financial invariants and compatibility

No formulas or coefficients changed. Task hours remain receptacles × .45 + switches × .4 + dimmers × .5 + recessed lights × 1 + fans × 1.75 + circuits × 2.5; then crew size (minimum 1) × crew hours plus adjustment, floored at zero. Existing finalizer, loaded cost, markup/margin, quote-local overrides and reported labor fields are untouched. New material identity resolution can legitimately increase a newly calculated estimate by charging existing company-priced controls that previously remained unresolved.

The 20×16-ft example with 6 receptacles, 2 switches, 1 dimmer, 4 recessed lights, 1 supplied ceiling fan and one 20A AFCI circuit produces 100 ft cable with current route defaults, 20.25 labor hours, $270.86 materials, $1,316.25 loaded labor, $3,037.50 customer labor, $3,376.07 selling price, $1,788.96 gross profit, and 52.99% displayed margin. These are synthetic settings ($150 sell, $65 loaded, 25% material markup), not production default changes. Status remains Needs Review for fan scope.

Neither explicit circuits nor scalar legacy fields were rewritten. Array circuits are authoritative when present, avoiding simultaneous generic and explicit breaker/cable charging. No additional fan, device, subpanel or circuit labor was introduced. Historical snapshot records were not migrated or repriced; existing snapshots keep their original warnings as well as their original costs. The browser regression changes only a disposable QA catalog after saving and proves original pricing and assembly remain identical.

## Verification

- Focused API: 8 tests; pre-fix 3 pass / 5 fail; repaired 8 pass.
- Full API: 307 tests pass, zero failures/skips.
- Full browser with explicit audit enabled: 53 tests pass, zero failures/skips. Includes all 11 builder samples, customer regression, draft recovery, proposal/PDF tests, T&M Ready/revision/PDF, and New House WR rejection.
- Typecheck and production build: pass after correcting nullable metadata in the new test fixture. No application change was needed for that typecheck error.
- New Addition browser lifecycle: exact persisted values restored, controls resolved, fan intentionally excluded, Ready 409, shareable proposal disabled, internal customer preview safe, duplicate preserved, original snapshot unchanged after QA-only catalog edit.
- Addition's public proposal/PDF was intentionally not bypassed: unresolved scope must remain blocked. Other fully priced fixtures exercise PDF/proposal generation.
- One initial browser-test authoring error attempted to click that disabled proposal action. Corrected to assert the safety gate, with no timeout increase or runtime change.
- PR #33 had an initial local API run overlap code generation and transiently lose a generated module. Serial rerun passed 299/299; tests and production runtime were not changed to conceal it.

## Changed files and release constraints

- `artifacts/api-server/src/lib/estimating-engine.ts`: two Addition-only control qualification paths and one Addition-only warning classifier/message.
- `artifacts/api-server/src/lib/addition-material-identity.test.ts`: eight focused regressions.
- `artifacts/electrical-estimator/src/pages/quotes/new-addition.tsx`: two truthful fan helper strings.
- `scripts/src/addition-material-identity.browser.test.ts`: one lifecycle and immutable snapshot regression.
- `docs/addition-material-identity-20260927.md`: this audit.

No schema migration, billing, API route/contract, company preference, rate, catalog, proposal engine, snapshot storage, OCR/Blueprint Takeoff, New House or other builder change. Unanswered estimating decisions remain documented, not implemented. Local/CI results are not a signed-in production workflow verification.
