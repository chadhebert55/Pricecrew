---
name: Orval Zod compatibility
description: OpenAPI schema patterns required by this workspace's Zod version.
---

The current workspace Zod version is incompatible with Orval's generated `zod.int()` and `zod.email()` helpers. A nullable referenced object must use `anyOf: [$ref, { type: "null" }]`, not `allOf` plus `nullable`.

**Why:** OpenAPI `integer` types and `format: email` generated Zod APIs that are only present in a newer Zod release, causing the post-codegen TypeScript build to fail. Orval translated `allOf` plus `nullable` into an intersection that rejected null at runtime.

**How to apply:** Express integer-like values as `number`, validate email-format behavior at the application boundary, and represent nullable `$ref` object fields with an explicit `anyOf` null branch. Inspect generated Zod after changing these patterns.