---
name: Concurrent validation isolation
description: Why independently registered build validations must be safe when they overlap.
---

Treat separately registered validation commands as concurrent, even when they are started in one validation run.

**Why:** A workspace build may temporarily replace generated API clients while another build reads them, and simultaneous builds can also empty the same output directory.

**How to apply:** Standalone build checks should establish their generated prerequisites, use an isolated temporary output directory, and be verified in the same run as the full workspace build.