---
name: Clerk UI fixture tenants
description: Isolating database-backed browser tests for Clerk-authenticated contractor flows.
---

Clerk-authenticated browser fixtures may create a provisional tenant before the test's explicit company membership is attached. Treat that provisional tenant as test-owned and clean it up with the fixture tenant.

**Why:** A browser test can pass its UI assertions yet leak an empty company if cleanup only removes the deliberately seeded tenant.

**How to apply:** Use a unique marker for the seeded tenant and user, scope all assertions and deletes to those identities, and verify both the marker tenant and any session-created placeholder tenant are gone afterward.