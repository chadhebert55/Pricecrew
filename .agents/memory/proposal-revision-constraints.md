---
name: Proposal revision constraints
description: Ordering and timestamp-precision rules for signed proposal revision constraints.
---

Create the quote revision composite unique index before adding the proposal-decision foreign key that references it.

**Why:** Drizzle schema push can emit the foreign key before the supporting unique index, which PostgreSQL rejects even when both objects are declared correctly.

**How to apply:** Before synchronizing a fresh or drifted database, verify the composite unique index exists first, then add the foreign key. Check for duplicate or orphaned rows before either operation.

Proposal decisions must store the exact database `updated_at` value referenced by the foreign key rather than round-tripping it through a JavaScript `Date`.

**Why:** PostgreSQL can retain microseconds while JavaScript dates and signed token timestamps retain milliseconds. The values compare as the same revision in application logic but can differ under an exact database foreign key.

**How to apply:** Insert the decision timestamp from the quote row inside the database transaction; use millisecond comparison only for matching the signed token to the loaded revision.