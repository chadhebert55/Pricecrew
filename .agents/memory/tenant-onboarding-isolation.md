---
name: Tenant onboarding isolation
description: Security boundary for provisioning an authenticated identity without an existing company membership.
---

An authenticated identity without a membership must receive a newly provisioned company. It may inherit non-private estimating defaults, but it must never claim a shared starter tenant or inherit customers, quotes, or proposal links.

**Why:** Treating the first signup as the owner of an existing starter company lets an arbitrary identity take over private tenant data.

**How to apply:** Keep onboarding transactional and tenant-isolated. Seed settings and catalog rows only, and preserve database-enforced uniqueness for identity membership and company ownership.

Global starter-catalog reconciliation must target the designated starter company explicitly, never an unordered “first company.” New tenants copy that starter catalog, so reconciling an arbitrary tenant can leave every new company with stale defaults.

**Why:** Database row order is not stable; selecting an arbitrary first company allowed verified catalog updates to miss the starter tenant while startup checks still appeared successful.

**How to apply:** Resolve the starter by its reserved identity before updating defaults, then verify onboarding with a brand-new authenticated identity and isolated company.