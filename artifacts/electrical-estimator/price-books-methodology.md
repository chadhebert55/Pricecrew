# PriceCrew Price Book Methodology
*v1 — September 2, 2026*

## Three seed books

Every PriceCrew account ships with three pre-loaded price books so a new user can quote a real job the moment they log in — regardless of whether they buy at Home Depot or at a wholesale supply house.

| Book | Represents | Who it's for |
|---|---|---|
| **Retail** | Home Depot / Lowe's / Menards pricing | Solo electricians without a supply-house account |
| **Contractor** *(default)* | Typical wholesale rates at any supply house | Most licensed contractors |
| **Premium Contractor** | Volume/loyalty rates for shops doing $500k+/yr | Established multi-tech shops |

## How the numbers were built

**Contractor book** is the source of truth. 13,965 SKUs, sourced from a real Northeast supply-house pricing feed. The prices are framed as "contractor pricing" — nationally portable because supply-house margins are consistent across regions (a #12 THHN at a Rexel branch in Boston is very close to a #12 THHN at a CED branch in Phoenix).

**Retail and Premium books are derived from the Contractor book using category-aware multipliers** — not a flat percentage — because retail markup varies by product type:

| Category | Retail multiplier | Premium multiplier | Rationale |
|---|---:|---:|---|
| Conductor (wire) | 1.15× | 0.85× | Commodity; HD sells cheap, thin margins |
| Conduit & Raceway | 1.18× | 0.85× | Commodity |
| Wire Management | 1.20× | 0.85× | Commodity |
| Fasteners | 1.25× | 0.85× | Standard hardware retail |
| Firestop & Sealants | 1.20× | 0.85× | Commodity chemicals |
| Grounding & Bonding | 1.20× | 0.85× | Standard hardware retail |
| Fittings | 1.28× | 0.85× | Moderate retail spread |
| Terminals & Lugs | 1.25× | 0.85× | Standard hardware retail |
| Boxes | 1.28× | 0.85× | Moderate retail spread |
| Devices (switches, outlets) | 1.30× | 0.85× | HD marks these up |
| Protection (breakers, GFCIs) | 1.28× | 0.85× | Moderate retail spread |
| Panels & Load Centers | 1.30× | 0.85× | Moderate retail spread |
| Data & Comm | 1.30× | 0.85× | Less commodity |
| Lighting | 1.35× | 0.85× | HD marks fixtures 30–40% |
| Motors & Controls | 1.35× | 0.85× | Specialty, wider retail markup |
| HVAC & Motors | 1.35× | 0.85× | Specialty |
| Solar & EV | 1.35× | 0.85× | Specialty |
| Tools | 1.22× | 0.85× | HD is competitive on tools |
| PPE & Safety | 1.20× | 0.85× | HD is competitive on safety gear |
| Misc / fallback | 1.25× | 0.85× | Reasonable default |

## Files

- `contractor-price-book-v1.csv` — 13,965 SKUs, wholesale contractor pricing
- `contractor-price-book-v1-review.csv` — 572 SKUs flagged for manual review during audit
- `retail-price-book-v1.csv` — same SKUs, contractor prices × retail multiplier
- `premium-contractor-price-book-v1.csv` — same SKUs, contractor prices × 0.85
- `price-books-combined-v1.csv` — all three books stacked with a `Book` column (for single-table imports)

## Refresh cadence

- **Quarterly manual refresh** for v1 launch. Update the Contractor book from a fresh supply-house feed, re-run the multiplier script to regenerate Retail and Premium.
- **Crowd-sourced** once user base hits ~200 contractors — anonymously average uploaded invoices to correct any drift.
- Later: automated feeds from supply-house partners for accounts with API access.

## What NOT to claim in marketing

- ❌ Never name specific supply houses (Rexel, Graybar, City Electric, etc.) — legal risk and regionally exclusionary
- ❌ Never claim "the retail book pulls live from Home Depot's website" — it's a baseline, not a live feed
- ✅ Say: "Ships with retail, contractor, and premium contractor pricing baked in"
- ✅ Say: "Typical wholesale rates for licensed electricians"
- ✅ Say: "Retail baseline for guys who source at big-box stores"

## Regenerating the derived books

```
python3 <<'PY'
# (See build script — retail = contractor × category-multiplier, premium = contractor × 0.85)
PY
```

The multiplier script lives at `artifacts/electrical-estimator/scripts/build-derived-price-books.py` (to add). Whenever you refresh the Contractor book, re-run the script to keep all three in sync.
