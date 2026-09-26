# Kitchen Builder calculation cleanup

## Compatibility and release scope

New Kitchen estimates explicitly use circuit configuration version 2. Existing saved quotes are immutable snapshots; older recovered drafts keep their inputs and legacy calculator until the estimator chooses the visible conversion action. No catalog data or company settings are migrated, and no database migration is required.

## Calculation assumptions

- Appliance quantities are the only source of circuit counts. Countertop receptacles do not create a duplicate circuit in addition to small-appliance circuits.
- Each configured circuit contributes quantity times home-run distance in its selected cable. A blank per-circuit distance inherits the default appliance distance. Lighting has its own route.
- Branch interconnect footage and 4-way traveler footage are separate total distances, not repeated per home run.
- Breakers are grouped by manufacturer, amperage, poles and protection through the existing catalog resolver. Extra breakers add breaker materials and 0.25 installation hours each, but not a new home run.
- Existing incremental remodel device labor is retained. Every home run adds footage / 30 labor hours; wall oven connections use the same 2-hour connection allowance as ranges. Smart switches add 0.75 hours each. Manual adjustments may be positive or negative; a below-zero result is clamped and blocks readiness.
- Standard appliance connections assume cord-connected devices; heavy appliances use a separately priced connection-box allowance. Final equipment connection methods require field verification.
- NM-B cable compatibility is conservative estimating validation, not code approval. No 14 AWG on 20A; 60A range/oven selections require changing the default cable to a supported larger size. Equipment specifications, terminals, derating and field requirements remain the estimator's responsibility.
- Customer-supplied decorative fixtures and recessed fixtures have separate selections. Only fixture purchase cost is excluded; labor and other installation material remain.

## Catalog requirements

No production prices were invented or changed. Existing sourced items are reused. New exact company catalog keys that may need pricing include `smart switch`, `NM cable connector`, `appliance connection box`, and `duplex receptacle wall plate`. Previously unresolved allowance keys now resolve by normal company item names (`USB receptacle`, `device plate`, `sink light`, `island pendant`, `undercabinet lighting`). Selected cables and manufacturer-specific breakers must also have one positive-priced catalog match. Missing or duplicate matches remain blocking.

## Verification inventory

- Engine scenarios: typical seven-circuit kitchen; 50A range; wall oven; both range and oven; 3-way plus 4-way; smart controls; identical extra breakers; customer-supplied decorative fixtures.
- Assert cable sizes, per-circuit footage, wire cost, breaker quantity/protection, material sum, calculated/adjusted hours, loaded labor, customer labor, selling price and gross profit.
- Negative cases: missing smart-switch price, duplicate breaker, different manufacturer, zero home run, undersized conductor, 60A with default 6/3 cable.
- Browser/API: all eight scenarios preview/save with identical assemblies and pricing; Ready transition; negative labor adjustment; invalid circuit blocked by both UI and server; unfinished draft; recovery after reload; 1280/768/375-pixel layouts.
- Existing API, browser, proposal/PDF, catalog/import, allowance, customer/draft and deployment regressions run unchanged.
