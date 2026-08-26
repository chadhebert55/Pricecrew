---
name: Estimate snapshot compatibility
description: Preserving historical quote pricing when estimator inputs and labor architecture evolve.
---

New pricing fields must be additive and optional for historical records. Never migrate, backfill, or recalculate saved quote assembly or pricing JSON when catalog data, labor settings, or estimator rules change.

**Why:** Saved quotes are contractual snapshots. New estimator fields can be present on newly calculated estimates while older records retain their original byte-level pricing and assembly shape.

**How to apply:** Keep serializers tolerant of absent additive fields, calculate only preview/new-quote flows from current settings, and verify existing assembly, pricing, total, and margin records remain unchanged across schema and seed changes.