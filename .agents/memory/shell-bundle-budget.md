---
name: Shell bundle budget
description: Guidance for adding shared authenticated-shell features without consuming the estimator entry-chunk budget.
---

Features mounted in the authenticated shell should lazy-load substantial UI primitives and feature-specific API code.

**Why:** A directly imported Radix dropdown for a small global feature increased the estimator entry chunk enough to exceed its enforced 500 KB budget, while lazy loading kept the same behavior and restored the prior entry size.

**How to apply:** When adding app-wide shell controls, compare the entry bundle before and after. Prefer a focused lazy feature boundary when the control pulls in menus, dialogs, charts, or other substantial dependencies.