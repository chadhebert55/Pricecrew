---
name: Blueprint review corrections
description: Keeping post-quote takeoff corrections traceable without rewriting the quote’s saved approval.
---

Corrections made after a quote is saved belong to the live blueprint takeoff review and its append-only audit. They must remain visually and structurally separate from the quote’s original takeoff approval snapshot, which is never rewritten.

**Why:** A saved quote is a historical estimate snapshot. Contractors still need to correct a later-discovered blueprint approval, but changing the embedded approval would erase what the quote originally used.

**How to apply:** Stage reopened-review edits locally until explicit confirmation. On confirmation, append item review events with the reviewer note and timestamp to the live takeoff. Show the resulting correction as later review activity and keep the original quote inputs, assembly, pricing, and embedded takeoff snapshot unchanged.