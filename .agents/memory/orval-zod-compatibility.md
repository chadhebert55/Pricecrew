---
name: Orval Zod compatibility
description: OpenAPI schema patterns required by this workspace's Zod version.
---

The current workspace Zod version is incompatible with Orval's generated `zod.int()` and `zod.email()` helpers.

**Why:** OpenAPI `integer` types and `format: email` generated Zod APIs that are only present in a newer Zod release, causing the post-codegen TypeScript build to fail.

**How to apply:** In this workspace, express integer-like values as `number` and validate email-format behavior at the application boundary unless/until the shared Zod dependency is upgraded and verified.