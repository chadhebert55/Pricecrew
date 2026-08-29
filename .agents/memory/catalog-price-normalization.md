---
name: Catalog price normalization
description: Rules for storing normalized supplier-catalog prices and deciding when a catalog unit is safe to convert.
---

Store wire prices normalized from a supplier's per-thousand `m` unit with at least six decimal places, and retain supplier, manufacturer, part number, SKU, UPC, and source date when available. Do not normalize `c` or other package units without an explicit package quantity. When enriching seed metadata from a lookup table, missing lookup values must preserve explicit metadata already present on the canonical row.

**Why:** Three-decimal storage rounded exact per-foot prices, while ambiguous case/package quantities could create invented unit costs if divided without evidence. A sparse enrichment lookup can otherwise silently erase verified identifiers such as UPCs.

**How to apply:** When importing or reconciling catalog rows, convert only explicit wire-family `m` prices by dividing by 1,000. Keep ambiguous variants at zero with visible unresolved warnings, prefer enrichment metadata only when present, and update only recognized untouched seed rows so contractor edits survive.