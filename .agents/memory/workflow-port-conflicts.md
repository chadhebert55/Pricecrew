---
name: Workflow port conflicts
description: How to interpret managed workflow failures when an older process still owns the configured port.
---

A managed workflow reporting `EADDRINUSE` does not prove the app is unavailable: an older process may still answer on the configured port.

**Why:** Restart attempts can fail during startup while direct API and web probes continue to return responses from the prior process.

**How to apply:** Report workflow health and direct serving availability separately. Do not treat a stale process response as proof that the new code is running; restart cleanly before behavior verification after code changes.