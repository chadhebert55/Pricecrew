# Raw supplier imports and app navigation

## Interface

The estimator now uses the actual logo, Satoshi/Cabinet Grotesk typography, and cream/teal/charcoal palette from [getpricecrew.com](https://getpricecrew.com). New Quote opens a job-type picker; the EV builder remains available at `/quotes/new/ev-charger`. Saved quote revisions use the explicit builder route.

## Northeast CSV support

The import review recognizes supplier title/date lines before the real CSV header, dotted column headers, empty rows, account notes, and repeated headers. Original file row numbers are retained. Raw Northeast exports are recognized only with the Northeast supplier heading and Stock Number column.

- Matching uses exact SKU/UPC. Truncated supplier Stock Number values are not treated as unique manufacturer part numbers.
- Existing canonical material names and categories are preserved so a supplier description cannot disconnect quote-builder pricing.
- Missing descriptions can be supplied by a unique existing catalog match.
- Verified wire/cable matches with a canonical foot unit normalize `m` pricing by 1,000.
- Unmatched each-priced rows with descriptions can be reviewed as new Supplier catalog entries. They do not automatically become a generic builder allowance or substitute product.
- Ambiguous bulk-unit conversions, missing descriptions without a match, conflicting identifiers, and duplicate catalog identities remain unresolved.
- Contractor-owned prices remain protected. Historical saved quotes are not recalculated.
- Review shows 100 rows per page. Existing updates are initially selected; new products require explicit selection. The apply request remains company-scoped and rechecks identifiers/ownership.

## Google Sheets

Download the current sheet using File → Download → Comma-separated values (.csv), then upload through Price Book. This change does **not** establish a live or scheduled Google Sheets connection. A recurring connection needs a separately approved private authentication and synchronization workflow; never publish a supplier price sheet to make it readable.

## Validation

- Raw-export fixtures cover dated headers, physical row numbers, safe normalization, missing descriptions, identity conflicts, new each-priced products, and protection of contractor-owned entries.
- A pricing-engine regression verifies that an imported wire price still fills the canonical material in an addition quote.
- Browser coverage exercises review pagination, explicit selection, applying one update, preserving its canonical name, and leaving unselected new products out of the catalog.
- UI regressions cover the quote picker, EV draft restoration/revision, actual logo loading, dark/light colors, and phone navigation.

No live company pricing or production deployment is changed by this branch.
