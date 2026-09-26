# Bathroom circuit clarity and calculation audit

This is a targeted cleanup of the existing Bathroom Builder, not a redesign. All ten sections remain, along with draft recovery, customer-supplied fixtures, heated-floor sharing, overrides, automatic breaker requirements and unfinished-quote generation.

## What changed

- `bathroom-builder-fields.tsx`: explicit circuit/device explanations; two active defaults; active Add Circuit; removable rows; inactive recovered rows tucked away with Restore/Remove; conditional recessed size and customer-supply fields; clearer in-room allowance; summary separates circuits from physical devices.
- `remodel-builder.tsx`: Bathroom-only compact circuit mode labels **Circuit Quantity**, hides Poles in Advanced Circuit Settings and gives long protection labels more room. Other builders retain their previous layout.
- `new-bathroom.tsx`: summary consumes the same readiness result as Generate Quote and Calculation Preview.
- `estimating-engine.ts`: shared internal Bathroom labor-component function used by the calculation and debug audit. No labor coefficient, company rate, markup, margin target or circuit multiplication rule changed. The in-room material line is now explicitly an allowance.
- `bathroom-modern.test.ts`, `bathroom-builder.browser.test.ts`: quantity independence, takeoff, financial reconciliation, conditional fields, add/remove, inactive-row recovery, customer supply and saved drafts.
- `bathroom-labor-audit.ts`: reproducible, read-only reconstruction using relevant company catalog values observed September 26, 2026. This is not a seed or a second pricing engine.

No schema migration was needed. Existing `bathroomCircuits[].quantity` remains the authoritative circuit/home-run count. Existing saved quote snapshots are not rewritten.

## Before and now

Before this pass, the engine already used circuit-row quantity rather than reading the receptacle-device count. The row label, such as “Bathroom receptacles quantity,” made it easy to enter two physical receptacles as two circuits. That correctly multiplied the configured row but represented the wrong intended scope.

Now the row explicitly asks for **Circuit Quantity** and explains that devices are entered separately. Two physical receptacles do not change the number of configured circuits. A deliberately entered quantity of two still produces two breakers, two home runs and four circuit connectors.

Recovered drafts retain their exact circuit quantities. PriceCrew cannot safely assume every saved quantity of two was a mistake, so it does not silently reduce them.

## Defaults and conditional controls

The initial active rows are one Bathroom Receptacle Circuit, 20A, 1-pole, Dual Function, 12/2 NM-B; and one Lighting / Fan Circuit, 15A, 1-pole, AFCI, 14/2 NM-B. Both use the default 30-foot route unless individually overridden. These remain editable estimating assumptions, not code determinations.

Poles is under Advanced Circuit Settings; a configured two-pole row opens that section automatically. Inactive rows no longer occupy full cards. Recessed size and recessed customer-supply controls appear only when recessed quantity is positive; vanity supply appears only when vanity quantity is positive. Existing conditional exhaust equipment overrides and heated-floor configuration remain intact.

Additional In-Room Wiring Allowance and Allowance Cable remain independent of per-circuit home-run cable. The beta still supports one allowance cable rather than a new routing system.

## Before/after reconstruction

The exact unsaved 19-hour screen state was not recoverable as a saved Bathroom quote. The first column below reconstructs 19.0 displayed hours with two receptacle circuits, one lighting circuit, one primary GFCI, no downstream receptacle entered, one customer-supplied vanity fixture, one exhaust fan, one general switch plus one fan switch, 30-foot routes and 20 feet of in-room 12/2.

The middle column adds the intended downstream receptacle while holding the extra circuit in place. This isolates the circuit correction from the device correction. Both comparisons use the same current catalog snapshot, not a mixture of pre-resolver and post-resolver pricing.

| Metric | Reconstructed 19.0-hour screen | Same two devices, before circuit correction | Corrected intended bathroom |
|---|---:|---:|---:|
| Calculated labor | 18.9667 h (19.0 displayed) | 19.5167 h (19.5 displayed) | 15.5167 h (15.5 displayed) |
| Manual adjustment | 0 h | 0 h | 0 h |
| Physical receptacles | 1 | 2 | 2 |
| Actual configured circuits | 3 | 3 | 2 |
| Breaker quantity | 3 | 3 | 2 |
| Home-run cable | 90 ft | 90 ft | 60 ft |
| 12/2 home-run cable | 60 ft | 60 ft | 30 ft |
| 14/2 home-run cable | 30 ft | 30 ft | 30 ft |
| Additional in-room 12/2 | 20 ft | 20 ft | 20 ft |
| Circuit connectors | 6 | 6 | 4 |
| Priced material subtotal | $354.55 | $358.03 | $271.41 |
| Loaded labor cost | $1,232.83 | $1,268.58 | $1,008.58 |
| Customer labor | $2,845.00 | $2,927.50 | $2,327.50 |
| Calculated selling price, incomplete | $3,288.19 | $3,375.04 | $2,666.76 |
| Gross profit, incomplete | $1,700.81 | $1,748.43 | $1,386.77 |
| Gross margin, incomplete | 51.72% | 51.80% | 52.00% |
| Status | Needs Review | Needs Review | Needs Review |

**These are incomplete-price diagnostic totals, not customer-ready quotes.** Unresolved required materials are excluded from those monetary totals and still block normal generation. Adding their verified prices will change materials, profit and selling price.

The isolated circuit correction removes 30 feet of 12/2, one Q120DF breaker, two NM94 connectors and 4.0 labor hours. It reduces the priced material subtotal by $86.62 and the calculated selling price by $708.28 in the same-two-device comparison. No labor or selling-price override was used.

## Labor breakdown for the corrected bathroom

| Component | Hours |
|---|---:|
| Circuit/home-run labor: 2 × (3 + 30/30) | 8.0000 |
| Primary GFCI | 0.7500 |
| Downstream receptacle | 0.5500 |
| General single-pole control | 0.5000 |
| Fan control | 0.5000 |
| Vanity fixture installation | 0.8000 |
| Exhaust fan installation | 2.2500 |
| In-room wiring: 20/30 | 0.6667 |
| Shared setup/other assembly labor | 1.5000 |
| Recessed, shower, heated floor and specialty controls | 0 |
| Calculated total | 15.5167 |
| Manual adjustment | 0 |
| Final labor | 15.5167 |

Company settings used: $150/hour customer labor, $65/hour loaded labor, 25% material markup, 40% target margin. These were read, not changed. The calculation still chooses the existing markup/labor versus margin-floor result.

The 8-hour circuit allowance remains the largest component. It was deliberately not tuned in this pass; whether its 3-hour-per-circuit base is appropriate for shared remodel work is a separate labor-model decision.

## Verification

- **A, typical bathroom:** two circuits, two breakers, 60 feet of home runs separated into 30 feet each of 12/2 and 14/2, four connectors, plus independent 20-foot in-room allowance.
- **B, two devices on one circuit:** one breaker, one 30-foot home run, two connectors; tested both two GFCIs and GFCI plus downstream.
- **C, two actual circuits:** quantity two yields two breakers, 60 feet and four connectors.
- **D/E, recessed conditions:** size/supply controls disappear at zero and reappear above zero; fixture material and 0.9-hour incremental labor are tested.
- **F, customer supply:** zero fixture purchase, `CUSTOMER_SUPPLIED`, no missing-price failure for that fixture; labor, boxes, wiring and controls unchanged.
- **G, add/remove:** third active configurable circuit appears and can be removed; zero-quantity rows can be restored without losing their route configuration.
- **H, recovery:** entered circuit quantity two, description, route override and device counts survive a reload and Restore Draft. No automatic “correction” of saved quantity.
- **Financial trace:** preview assembly and pricing exactly equal saved quote assembly and pricing; saved total equals final selling price. Loaded/customer labor and gross profit are checked with nonzero rates. Unsafe cable blocks Ready while unfinished draft generation remains available.
- **Regression:** 293 API tests passed; 30 browser tests passed, covering Kitchen, Bathroom, Panel, Recessed Lighting, supplier imports, saved quotes, overrides, draft recovery, PDF/proposal privacy, accept/decline and export flows. The focused Bathroom browser test passed again after final small-screen spacing and nonzero-rate assertions.
- **Layout:** screenshots inspected at 1280, 768 and 375 pixels; no horizontal document overflow. No other builder UX was redesigned.

## Remaining materials and decisions

The corrected current-catalog test has four unresolved lines:

- **15A Siemens AFCI breaker:** existing Q115AFC baseline record at $44 and Northeast QA115AFC SKU900554 at $52.233 are both priced candidates without a saved company preference. Select the approved standard and confirm the baseline record's status.
- **Decorator/screwless plate:** RWP26WCC10 has a zero placeholder price. Set its verified cost or select another approved plate.
- **Duplex plate:** no approved priced family match.
- **Vanity fixture outlet box:** no approved priced family match. Customer supply excludes the fixture purchase, not this contractor-supplied box.

No new occupancy/humidity control product was added without a catalog standard. Existing Standard, Timer and Humidity-sensing choices remain. Specialty shower/floor/control selections still require their own verified catalog materials when used.

Decisions needed: preferred 15A AFCI record, plate standards/prices and fixture-box standard. Separately, the earlier Jobber live-account test remains blocked by missing real customer/property/tax data; this Bathroom pass did not fabricate that information.
