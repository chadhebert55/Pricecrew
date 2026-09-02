#!/usr/bin/env python3
"""
Build derived price books (Retail, Premium Contractor) from the
Contractor Price Book using category-aware multipliers.

Usage:
    python build-derived-price-books.py

Inputs (relative to repo root):
    artifacts/electrical-estimator/contractor-price-book-v1.csv

Outputs:
    artifacts/electrical-estimator/retail-price-book-v1.csv
    artifacts/electrical-estimator/premium-contractor-price-book-v1.csv
    artifacts/electrical-estimator/price-books-combined-v1.csv

See price-books-methodology.md for the rationale behind each multiplier.
"""
import csv
import os
import sys
from pathlib import Path

MULTIPLIERS = {
    # High-commodity, thin retail spread
    'Conductor':            (1.15, 0.85),
    'Conduit & Raceway':    (1.18, 0.85),
    'Wire Management':      (1.20, 0.85),
    'Fasteners':            (1.25, 0.85),
    'Firestop & Sealants':  (1.20, 0.85),
    'Grounding & Bonding':  (1.20, 0.85),
    # Devices & fittings — moderate retail markup
    'Fittings':             (1.28, 0.85),
    'Devices':              (1.30, 0.85),
    'Terminals & Lugs':     (1.25, 0.85),
    'Boxes':                (1.28, 0.85),
    # Lighting & panels — wider retail markup at HD
    'Lighting':             (1.35, 0.85),
    'Panels & Load Centers':(1.30, 0.85),
    'Protection':           (1.28, 0.85),
    # Specialty / less common at HD
    'Motors & Controls':    (1.35, 0.85),
    'HVAC & Motors':        (1.35, 0.85),
    'Solar & EV':           (1.35, 0.85),
    'Data & Comm':          (1.30, 0.85),
    # Tools & PPE — HD is competitive
    'Tools':                (1.22, 0.85),
    'PPE & Safety':         (1.20, 0.85),
    # Fallback
    'Misc':                 (1.25, 0.85),
}
DEFAULT_MUL = (1.25, 0.85)


def build_book(rows, kind):
    """kind: 'retail' | 'premium' | 'contractor' (pass-through)"""
    out = []
    for row in rows:
        r = dict(row)
        try:
            base = float(row['Customer Price'])
        except (ValueError, KeyError, TypeError):
            out.append(r)
            continue
        cat = row.get('Category', '')
        retail_mul, prem_mul = MULTIPLIERS.get(cat, DEFAULT_MUL)
        if kind == 'retail':
            new = base * retail_mul
        elif kind == 'premium':
            new = base * prem_mul
        else:
            new = base
        r['Customer Price'] = f"{new:.4f}"
        out.append(r)
    return out


def main():
    root = Path(__file__).resolve().parents[3]
    est = root / 'artifacts' / 'electrical-estimator'
    src = est / 'contractor-price-book-v1.csv'
    retail_out = est / 'retail-price-book-v1.csv'
    premium_out = est / 'premium-contractor-price-book-v1.csv'
    combined_out = est / 'price-books-combined-v1.csv'

    if not src.exists():
        print(f"ERROR: source not found at {src}", file=sys.stderr)
        sys.exit(1)

    with src.open(newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("ERROR: source is empty", file=sys.stderr)
        sys.exit(1)

    fieldnames = list(rows[0].keys())

    for path, kind in [(retail_out, 'retail'), (premium_out, 'premium')]:
        with path.open('w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(build_book(rows, kind))
        print(f"wrote {path.relative_to(root)} ({os.path.getsize(path):,} bytes)")

    combined_fields = ['Book'] + fieldnames
    with combined_out.open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=combined_fields)
        w.writeheader()
        for kind, label in [('retail', 'Retail'), ('contractor', 'Contractor'), ('premium', 'Premium Contractor')]:
            for r in build_book(rows, kind):
                out_row = {'Book': label}
                out_row.update(r)
                w.writerow(out_row)
    print(f"wrote {combined_out.relative_to(root)} ({os.path.getsize(combined_out):,} bytes)")


if __name__ == '__main__':
    main()
