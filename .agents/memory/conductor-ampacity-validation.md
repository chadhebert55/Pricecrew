---
name: Conductor ampacity validation
description: Safety rule for pricing branch-circuit cable in estimating builders.
---

Cable catalog pricing must be gated by both the selected breaker amperage and the switching/conductor configuration. If no verified compatible conductor row exists, omit cable cost and surface an explicit unresolved warning rather than substituting a generic row.

**Why:** Validating only the switching topology can price an undersized conductor against the selected overcurrent protection, producing an unsafe and misleading quote.

**How to apply:** For every builder that prices branch-circuit cable, constrain supported circuit amperages at the API boundary, repeat the safety check in the estimator, and cover supported and unsupported combinations with executable tests.