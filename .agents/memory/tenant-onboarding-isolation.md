---
name: Tenant onboarding isolation
description: Security boundary for provisioning an authenticated identity without an existing company membership.
---

An authenticated identity without a membership must receive a newly provisioned company. It may inherit non-private estimating defaults, but it must never claim a shared starter tenant or inherit customers, quotes, or proposal links.

**Why:** Treating the first signup as the owner of an existing starter company lets an arbitrary identity take over private tenant data.

**How to apply:** Keep onboarding transactional and tenant-isolated. Seed settings and catalog rows only, and preserve database-enforced uniqueness for identity membership and company ownership.