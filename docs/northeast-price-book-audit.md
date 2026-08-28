# Northeast Electrical price-book audit

Source workbook: `0_HBS_Master_Workbook_v1.1_Northeast_Mapped_1787854885808.xlsx`  
Catalog price date: 2026-08-25

## Audit rules

- Reviewed every material key requested by the six active builders: EV Charger, Bathroom, Kitchen, Recessed Lighting, Service Upgrade, and Panel Replacement.
- Accepted only exact product rows or confidently mapped wire families from the Northeast `Material Database`, `Material Options`, and `Supplier Catalog` sheets.
- Converted catalog `m` wire pricing to dollars per foot only where the product family and size were explicit. A selected exact supplier SKU can also normalize an `m` 4/0 SER variant per thousand feet; no `c` pricing is normalized unless its canonical selector label explicitly states a 100-unit or 100-foot package.
- Retained supplier, manufacturer, manufacturer part number, Northeast SKU, UPC, unit, and source date where the workbook supplied them.
- Left uncertain products at zero cost. The estimator emits a structured, visible unresolved-price warning instead of silently substituting a generic product.
- Seed reconciliation updates only recognized untouched starter rows. Contractor-edited rows are preserved.
- Price-book management starts on unresolved rows and can narrow the audit by active V1 builder and material category. Each row identifies the builders that consume that exact canonical selection.

## Confident Northeast mappings

### Cable and conductors

| Price-book item | Northeast SKU | Catalog product | Catalog UOM | Normalized cost |
| --- | ---: | --- | --- | ---: |
| 8/3 NM-B cable | 19117 | WIC. ROMEX 8/3 | m | $2.682868/ft |
| 8/2 NM-B cable | 22923 | WIC. ROMEX 8/2 | m | $1.890960/ft |
| 6/3 NM-B cable | 25138 | WIC. ROMEX 6/3 | m | $3.921784/ft |
| 12/2 NM-B cable | 3873 | WIC. ROMEX 12/2 | m | $0.562271/ft |
| 14/2 NM-B cable | 27892 | WIC. ROMEX 14/2 | m | $0.379697/ft |
| 14/3 NM-B cable | 10802 | WIC. ROMEX 14/3 | m | $0.539950/ft |
| #8 copper THHN | 61161 | WIC. THHN 8 STR | m | $0.700684/ft |
| 1/0 aluminum XHHW | 1020694 | WIA. XHHW 1/0 S | m | $0.730841/ft |
| 3/0 aluminum XHHW | 1005949 | WIA. XHHW 3/0 S | m | $1.072337/ft |
| 4/0 aluminum XHHW | 392124 | WIA. XHHW 4/0 S | m | $1.191903/ft |
| 1/0 aluminum SER | 295793 | WIA. SER 1/0-1/ | m | $2.631865/ft |
| 3/0 aluminum SER | 239619 | WIA. SER 3/0-3/ | m | $3.930704/ft |

The workbook contains additional rows for several wire sizes. The seeded row is a specific editable Northeast SKU, not a claim that it is the only valid color, reel, or packaging variant.

### Devices and breakers

The seed retains exact Northeast rows for the workbook-mapped Pass & Seymour tamper-resistant receptacles and self-test GFCIs, Panasonic FV-0511VF1 fan, Siemens 20A standard/GFCI/dual-function breakers, Eaton BR 20A standard/AFCI/dual-function breakers, Square D Homeline 20A standard/GFCI/dual-function breakers, and Siemens/Square D 50A two-pole GFCI breakers.

Exact 15A rows were added for:

- Siemens Q115 standard and Q115DF dual-function
- Eaton BR115 standard, BRN115AF AFCI, and BRN115DF dual-function
- Square D Homeline HOM115 standard and HOM115GFI GFCI

Breaker prices resolve only when manufacturer, amperage, pole count, and protection type all match. Panel-family compatibility remains the contractor's responsibility.

## Builder-by-builder unresolved audit

### EV Charger

Mapped: 8/3, 8/2, and 6/3 NM-B; #8 THHN; exact Siemens and Square D 50A GFCI rows.

Unresolved: 8/2 SER (no exact workbook family), other two-pole breaker combinations, NEMA 14-50/6-50 devices, disconnects, load-management devices, charger allowances, conduit bodies/fittings, panel modifications, permits, and surge products without an exact selected catalog part.

### Bathroom

Mapped: 12/2, 14/2, and 14/3 NM-B; exact Pass & Seymour receptacle/GFCI rows; exact supported breaker tuples; Panasonic FV-0511VF1.

Unresolved: generic vanity, fan/light, fan/heat, heated-floor, fixture, box, plate, and permit allowances; any breaker tuple not represented by an exact compatible workbook row.

### Kitchen

Mapped: 12/2, 14/2, and 14/3 NM-B; exact Pass & Seymour receptacle/GFCI rows; exact supported 15A and 20A breaker tuples.

Unresolved: appliance-specific device allowances, USB/specialty devices, island/sink/undercabinet allowances, boxes and plates without exact package identity, four-way/control package variants, and unsupported breaker tuples.

### Recessed Lighting

Mapped: 14/2 and 14/3 NM-B plus exact supported 15A breaker tuples.

Unresolved: Juno fixture rows without an exact workbook model, retail-pack switch/dimmer/plate/box variants that do not exactly match Northeast catalog part numbers, smart-control combo packs, and unsupported breakers. Their former starter prices are no longer treated as verified catalog prices.

### Service Upgrade

Mapped: selected 1/0, 3/0, and 4/0 aluminum XHHW rows; selected 1/0 and 3/0 aluminum SER rows; exact breaker tuples where present.

Unresolved: 4/0 SER because workbook variants diverge materially; copper service alternatives; meter-main/panel/disconnect equipment; mast, weatherhead, hub, LB, elbows, couplings, and PVC sold under ambiguous `c` units; grounding/bonding products without selected dimensions; permits, utility coordination, labeling, normal stock, and generic field allowances.

Service Upgrade and Panel Replacement snapshots may optionally carry
`exactCatalogParts` canonical item strings on a per-line basis (for example
`meterDisconnect`, `servicePanel`/`panelProduct`, `serviceToPanelConductor`,
`groundRod`, `mastRaceway`, `feederRaceway`, `ductSeal`, `pvcPrimer`, and
`electricalTape`). A selector is never shared by sibling assembly lines.
The estimator uses an exact selector only when that exact current price-book item is
priced and compatible; it does not fall back to a generic row. Equipment and panels
are checked against selected service size and manufacturer, and rod/clamp selections
are checked against their hardware family. Omitted selectors retain legacy item-key
resolution for historical snapshots.

### Panel Replacement

Mapped: the same exact supported conductor and breaker rows used by the service and branch-circuit builders.

Unresolved: panel enclosures and mains without an exact selected product family; feeder variants not confidently mapped; existing-breaker inventories outside the exact manufacturer/amperage/pole/protection tuples; grounding, raceway, fitting, permit, and miscellaneous allowances.

## Intentionally rejected substitutions

- No generic breaker price is used for a missing manufacturer/family tuple.
- No ROMEX row is substituted for SER, and no SER row is substituted for NM-B.
- No cable/fitting `c` price is divided without a confirmed package quantity.
- No generic ground rod, acorn clamp, ground bar, receptacle, plate, anti-oxidant, PVC cement/primer, or service-equipment row is selected when size, package, or compatibility is underspecified.
- Saved quote snapshots are not recalculated when seed prices or company defaults change.