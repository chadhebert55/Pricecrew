---
name: Builder labor defaults
description: Defines how company labor defaults and quote-local labor changes interact.
---

Company labor values are defaults copied into each new quote's local assumptions. Editing the quote replaces that copied value for the quote; it does not add a second delta on top or mutate company settings.

**Why:** Contractors need a reusable company baseline and an independently editable quote assumption without hidden double-counting. Crew-based builders use the same rule by copying crew size and hours per person into the new quote.

**How to apply:** Wait for company settings before previewing or creating a new quote. After initialization, calculations and snapshots use the quote-local values only. Keep dollar labor overrides separate from labor-hour assumptions.