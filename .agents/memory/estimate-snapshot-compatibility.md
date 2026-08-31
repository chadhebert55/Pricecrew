---
name: Estimate snapshot compatibility
description: Preserving historical quote pricing when estimator inputs and labor architecture evolve.
---

New pricing fields must be additive and optional for historical records. Never migrate or backfill saved quote assembly or pricing JSON when catalog data, labor settings, or estimator rules change. Draft commercial edits and draft-to-ready promotion must recalculate from the current tenant Price Book; already-ready commercial snapshots must be revised rather than rewritten.

**Why:** Customer-ready quotes are contractual snapshots, but an editable draft must not remain customer-ready using material prices that became missing, zero, incompatible, ambiguous, or stale after it was first saved.

**How to apply:** Keep request schemas strict for new calculations, but keep serializers tolerant of absent additive fields and legacy input shapes; do not require historical job-input JSON to satisfy the latest request validator. Normalize legacy fields only in response serialization, never before persistence. Recalculate editable drafts from current company-scoped settings and catalog rows whenever commercial overrides change or the draft is promoted to ready. Preserve ready status/proposal-only updates exactly, reject in-place ready commercial edits, and route them through Duplicate/Revise. Verify preview, create, draft update, revision, readiness, proposal, and export all retain unresolved-price blocking and tenant isolation.