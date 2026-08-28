---
name: Customer identity matching
description: Conservative rules for linking customer records to newly created quotes without merging unrelated people.
---

Treat normalized email as the strongest customer identity within a company. A name-only match is safe only when exactly one matching customer has no email; different emails must remain different customers even when names match.

**Why:** Application-only read-then-write checks fail under concurrent quote creation and can split one person's quote history or merge unrelated people. The database must enforce normalized-email uniqueness, and conflict handling must reload the winning customer.

**How to apply:** Use the same normalization for customer CRUD and quote creation, preserve null-email behavior, and never rewrite historical quote snapshots when a customer record changes. When concurrency tests fail, verify the normalized-email index exists in the live database; a schema declaration alone does not prove it was applied.