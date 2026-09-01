---
name: Assistant commercial safety
description: Safety boundary for AI-assisted pricing, quote preparation, and supplier imports.
---

Assistant-generated commercial values must be derived from current tenant-owned Price Book and company settings data. Model-supplied price overrides and unresolved or ambiguous matches must fail closed.

**Why:** Prompt instructions are not an integrity boundary. Quote and catalog writes can otherwise persist invented prices or overwrite newer contractor edits.

**How to apply:** Keep tools read/preview-only, issue server-owned expiring pending actions, and revalidate tenant/user ownership, value provenance, freshness, and idempotency atomically when the user confirms.