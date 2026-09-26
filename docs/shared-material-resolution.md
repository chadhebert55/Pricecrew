# Shared material resolution and supplier units

The change is centralized in the existing estimating pipeline. No builder contains the Northeast example prices, company labor rates/markup are unchanged, and saved quote rows were not recalculated.

## Implementation

- `artifacts/api-server/src/lib/material-resolution.ts`: preference-ranked selection, manufacturer/panel-family compatibility, safe supplier conversion and material provenance.
- `estimating-engine.ts`: shared resolver integration and assembly snapshots; circuit connectors selected by cable; countertop/control boxes explicitly separate from appliance boxes; duplex/decorator/toggle plates separated; heavy appliance connection type must be selected.
- `price-book-import.ts` and `routes/estimating.ts`: retain raw cost/UOM through preview/apply, normalized values, metadata-only preference updates and explicit conversion validation.
- DB schema, additive SQL and generated OpenAPI/React/Zod types: raw and normalized fields, company material preferences, panel family, assembly resolution status/snapshot.
- `material-resolution.tsx`, shared remodel preview and Saved Quote: compact material status, customer-supplied labels, provenance and Select Catalog Item action.
- Price Book: SKU/part/manufacturer search and persistent company preferred-material selection, with removal of an existing preference. Two equally ranked preferences remain ambiguous.
- Regression coverage: material resolver, Kitchen engine, shared engine, saved-quote integration and three builder browser suites.

## Selection and safety

Electrical compatibility is checked before preference ranking. Exact company preference wins, then manufacturer preference, family preference, approved alternate, and finally a unique usable supplier record. Equally valid candidates remain unresolved. An unpriced placeholder no longer competes with a verified priced item; an explicitly preferred but unpriced record does not silently fall back.

Square D Homeline and QO and Eaton BR/CH remain distinct. Supplier brand prefixes such as ITE and C-H are understood for part-family parsing. No cross-manufacturer substitution is permitted.

Supported conversion paths include each, feet, explicit per-100/per-1000 base units, and explicit package quantities. Unknown dimensions or mismatched assembly/catalog units block readiness. Raw supplier values remain separate from usable cost; normalized cost is checked against the raw conversion. Existing three-decimal extended-cost rounding and two-decimal quote totals are preserved.

Customer-supplied fixtures carry `CUSTOMER_SUPPLIED`, zero contractor fixture purchase cost, and their intentional-exclusion reason. Labor and separately itemized contractor materials remain. Undercabinet lighting remains contractor supplied.

## Bounded production catalog correction

This was not a bulk supplier import. The original CSV was not available in the workspace; the baseline was the existing persisted import 5, `HERBERT_PRC_FIL - HERBERT_PRC_FIL.csv`, effective **2026-08-25**, plus the user's explicit product identities/conversions.

- Existing IDs 353, 383 and 384 retained identity and price, with raw-each metadata and exact company preferences added.
- Three missing catalog records added from the retained raw import values: RD-42 SKU257230 ID599; NM94 SKU13845 ID600; NM95 SKU29311 ID601.
- Raw/normalized: 763.579/c → 7.63579 each; 25.399/c → 0.25399 each; 50.651/c → 0.50651 each.
- No existing catalog records merged/deleted. Import 5's historical review rows were not rewritten to pretend they had been applied through its original workflow. The bounded SQL is the audit record; a future fresh preview can recognize the normalized records.
- The 17 pre-existing company-2 quote records bounded by ID18 retained the identical full-row checksum `8f8121e372d390ebaf85bce345ce8df7` before/after.

NM94 is preferred for 14/2, 12/2 and 10/2; NM95 for supported three-conductor NM cable through 6/3, based on the [Arlington cable-range chart](https://www.aifittings.com/reference/files/pdf/charts/nm-cable-ranges.pdf). Larger/unknown combinations remain unresolved.

RD-42 is available at its normalized cost but deliberately not universally preferred. It is a new-work range/dryer receptacle box; the current appliance assembly does not establish mounting suitability, so an estimator/company must confirm the choice ([RD-42 specifications](https://www.mc-mc.com/Product/allied-moulded-rd-42)).

## Verification

The 289-test API suite passed, including four-builder engine regressions, import safeguards, draft recalculation, immutable issued quotes, pricing overrides, customer proposal privacy and export checks. The full browser run passed 27 existing tests, then the three affected builder suites passed after their isolated QA fixture units were corrected. Those suites exercise preview → saved assembly/pricing → Ready guards, responsive layout and draft restoration. A further explicit wrong-dimension regression was added after this baseline.

The real-identity Kitchen test verifies six Siemens Q120DF breakers at 69.239 each = 415.434, displayed 415.43; P&S 3232-TRW at 1.00; QF120A at 71.027; NM94 normalized precision and snapshot; and zero-cost customer fixtures without unresolved status. Intentional unresolved USB/plate/specialty families still block readiness.

The generic Kitchen device-box line and appliance boxes cover different devices, not duplicate boxes. The generic label now says countertop/control boxes excluding appliances. Cable, connectors and breakers derive from actual circuit quantities. No material prices were inserted into builder logic to make tests pass.

## Remaining decisions and limits

Select company standards for USB receptacles, unpriced duplex/toggle plates, unmatched breaker variants, specialty controls and appliance connection hardware. Confirm RD-42 mounting applicability before preferring it for range receptacles. Unknown connector sizes remain unresolved rather than using NM94/NM95 indiscriminately.

Existing saved snapshots remain historical on read. Existing explicit draft save/revise behavior still intentionally calculates against the current catalog; issued commercial values remain protected. The new metadata does not retroactively enrich old snapshots.

The company-preference UI is a material-family selector, not a compatibility certification system for every product. Breaker specs and material dimensions are enforced, while non-breaker substitutions still require a deliberate company approval.
