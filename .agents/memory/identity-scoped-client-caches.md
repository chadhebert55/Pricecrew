---
name: Identity-scoped client caches
description: Prevent tenant UI state from leaking across authenticated identities in one browser process.
---

Tenant-defining client queries must include the authenticated user identity in their cache key, and mutations must update that same scoped key.

**Why:** A shared company-profile cache can remain fresh across sign-out/sign-in or test identity changes, making one tenant's trade and route permissions appear for another tenant even though API authorization remains correct.

**How to apply:** Scope profile, role, company, plan, and other authorization-driving query keys by the current authenticated identity. Verify identity switching without restarting the browser process.