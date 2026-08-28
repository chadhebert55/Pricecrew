---
name: Quote export fidelity
description: Rules for mapping saved quote snapshots into provider import formats without inventing commercial values.
---

Provider exports must use the authenticated tenant’s saved quote snapshot only. Preserve the exact saved final selling price, including overrides, while representing saved assembly costs without deriving per-line selling prices. Fields absent from the snapshot, including tax, discount, deposit, and taxable status, stay blank.

**Why:** A saved quote is a contractual snapshot. Recalculating from live settings or spreading the final price across assembly rows would change historical commercial terms and imply data the estimator never captured.

**How to apply:** Give each destination a versioned adapter and preflight. Validate provider limits and required identity/property mappings before generation. If a provider requires line prices to determine the total, use one clearly labeled saved-total line and keep assembly selling-price fields blank rather than allocating the total.