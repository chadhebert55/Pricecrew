---
name: PDF parser bundling
description: Runtime packaging constraint for server-side PDF extraction with pdf-parse.
---

Keep `pdf-parse` external to the API server bundle, with its native canvas dependency installed directly.

**Why:** Bundling pdf.js into the single server output breaks its worker-module lookup and can also omit the native DOM/canvas implementation, even though extraction works when run from source.

**How to apply:** When changing the API build or PDF dependency, verify extraction from the built server rather than relying only on source-level parser tests.