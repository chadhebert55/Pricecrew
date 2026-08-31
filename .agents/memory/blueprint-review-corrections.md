---
name: Blueprint review corrections
description: Keeping post-quote takeoff corrections traceable without rewriting the quote’s saved approval.
---

Corrections made after a quote is saved belong to the live blueprint takeoff review and its append-only audit. They must remain visually and structurally separate from the quote’s original takeoff approval snapshot, which is never rewritten.

**Why:** A saved quote is a historical estimate snapshot. Contractors still need to correct a later-discovered blueprint approval, but changing the embedded approval would erase what the quote originally used.

**How to apply:** Stage reopened-review edits locally until explicit confirmation. On confirmation, append item review events with the reviewer note and timestamp to the live takeoff. Show the resulting correction as later review activity and keep the original quote inputs, assembly, pricing, and embedded takeoff snapshot unchanged.

Concurrent reviewers must submit the item state they originally loaded. Accept a correction only when every reviewed field still matches that baseline, and update the item plus append its audit event atomically. A stale reviewer must reload before retrying.

**Why:** Serializing only the writes is not enough when both reviewers calculated changes from the same old decision; compare-and-set prevents the later request from silently replacing the first reviewer’s correction.

**How to apply:** Treat the status, approved quantity, and reviewer note as one optimistic-lock baseline. Return a stable conflict code without writing an event when the baseline is stale, and order same-timestamp events by their database insertion identity.