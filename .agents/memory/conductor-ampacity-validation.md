---
name: Conductor ampacity validation
description: Safety rule for pricing branch-circuit and feeder conductors in estimating builders.
---

Conductor catalog pricing must be gated by the complete overcurrent-protection tuple, including applicable equipment rating, breaker amperage and poles, conductor type and count, and switching topology. If the tuple or exact verified catalog row is unsupported, omit conductor cost and surface an explicit unresolved warning rather than substituting a generic row.

**Why:** Validating only one dimension can price an undersized conductor or an incompatible panel/feeder configuration against the selected overcurrent protection, producing an unsafe and misleading quote.

**How to apply:** For every builder that prices cable or feeders, constrain supported values at the API boundary, repeat the full tuple check in the estimator, and cover supported and unsupported combinations with executable tests.