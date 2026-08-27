---
name: Selectable estimating dimensions
description: Rules for exposing service sizes, manufacturers, and protection choices in server-owned estimating contracts.
---

Every option exposed by an estimating builder must be enforced by the server-owned contract and have a coherent path to exact assembly resolution. A UI select alone is not a validation boundary. Related defaults must change together, and every advertised combination needs an editable price-book row or must remain explicitly unresolved.

**Why:** Exposing additional service sizes while retaining equipment and conductors from the default size produced internally inconsistent estimates. Constraining manufacturers only in the UI also allowed direct API requests to bypass the supported matrix.

**How to apply:** When adding a selectable size, manufacturer, protection type, or conductor package, update OpenAPI validation, generated types, linked form defaults, calculator compatibility warnings, insert-only catalog seeds, and representative exact-resolution tests together. Exact catalog selectors are optional, canonical item strings scoped to one assembly line; never reuse one selector for sibling lines, and clear stale linked selections when a controlling choice changes. Validate exact rows with category as the first role boundary, then enforce role terms and applicable dimensions; name matching alone permits cross-role equipment substitutions.