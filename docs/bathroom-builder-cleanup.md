# Bathroom Builder cleanup

Version 2 adds independent named circuit rows, quantity, breaker configuration, cable and route lengths. It reuses the shared remodel circuit plan, exact existing breaker resolver, Price Book lookup and final pricing engine. Older saved inputs retain the legacy calculation path until explicitly converted.

## Workflow

- Three starting rows and Add Circuit; zero quantity means no new home run or breaker.
- Default route is per circuit. In-room branch wiring is a separate total, never multiplied into home runs.
- Heated-floor power can use a selected active circuit row or one new dedicated row. It is counted once.
- Incremental GFCI/downstream device and equipment labor remains based on the existing Bathroom model, with one shared setup.
- Single-pole, physical 3-way switches, dimmers, smart switches, fan timer/humidity controls and wet-location lights use actual takeoff rows.
- Customer-supplied vanity/recessed fixture purchase costs are intentionally excluded. Installation and applicable incidental material costs remain.
- Compact summaries, collapsible sections, signed labor adjustment and the shared issues/financial preview replace the long flat form.
- Incomplete pricing permits only an explicitly unfinished draft. The existing server readiness guard remains authoritative.

## Assumptions and catalog review

These are configurable estimating assumptions, not an electrical design or code approval. Each new circuit receives 3 hours incremental circuit labor plus route length / 30. Single-pole, physical 3-way and dimmer controls receive 0.5 hours; smart controls 0.75 hours. One fan control is added per selected equipment unit at 0.5 hours for standard or 0.75 for timer/humidity. Additional light/heat controls must be selected separately. Wet-location light installation is 0.9 hours and thermostat installation 0.75 hours.

Heated-floor scope does not include heating mats or flooring. In-room branch cable must be checked against its actual supplying circuit. Fixture boxes are added for vanity fixtures; wafer fixtures and exhaust equipment are assumed to have their own listed connection enclosures. Shared home-run connectors are counted separately.

Catalog entries still require a unique positive company price: selected exact manufacturer/ampere/pole/protection breakers and cable, smart switch, fan timer switch, fan humidity-sensing control, heated-floor thermostat, wet-location recessed light, fixture outlet box, duplex receptacle wall plate and NM cable connector. Existing exact GFCI, wafer, switch, dimmer, box, plate and Panasonic equipment keys are reused. No production prices or catalog rows were invented or changed.

## Verification

270 API/engine tests and 29 browser tests passed locally. The four requested Bathroom scenarios trace cable quantity and costs, breaker quantities, material totals, incremental labor, loaded labor cost, customer labor, margin and selling price. Browser tests compare authoritative previews with saved assemblies, pricing and totals and exercise the server Ready guard. Additional checks cover missing/duplicate catalogs, wrong manufacturer, 14 AWG on 20A, zero route, floor-circuit reuse, signed labor, saved drafts and desktop/tablet/375px layouts.

## Deliberate limits

No database migration, company default change or existing quote rewrite. Legacy package overrides remain in recovered legacy inputs until explicit conversion; the conversion notice explains their replacement. Equipment-specific multi-function controls and final field circuit assignments still require estimator verification.
