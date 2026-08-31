---
name: Price-book seed ownership
description: How insert-only catalog seeding safely handles starter defaults and contractor edits.
---

Price-book edits must atomically transfer ownership away from startup defaults. Seed reconciliation may update only rows it can prove remain system-owned; ambiguous or contractor-owned rows must keep their exact values.

**Why:** Insert-only behavior alone can leave starter rows unusable for exact catalog resolution, while broad seed updates can overwrite contractor pricing. Explicit ownership is required to avoid both failure modes.

**How to apply:** Mark every user edit contractor-owned, keep normal startup seeding insert-only, and use narrowly proven reconciliation for legacy system-owned rows. Supplier-file imports must recheck ownership at apply time, serialize per tenant, fail closed on conflicting exact identifiers, and preserve verified fields omitted from partial exports. Test fresh initialization, legacy edited-row preservation, and concurrent imports together.