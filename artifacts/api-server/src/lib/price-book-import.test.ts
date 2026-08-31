import assert from "node:assert/strict";
import test from "node:test";
import type { PriceBookImportValueRecord } from "@workspace/db";
import { parsePriceBookImport } from "./price-book-import";

function existing(
  fields: Partial<PriceBookImportValueRecord> & {
    id?: number;
    isContractorOwned?: boolean;
  } = {},
) {
  return {
    id: fields.id ?? 1,
    category: fields.category ?? "Conductor",
    item: fields.item ?? "12/2 NM-B cable",
    unit: fields.unit ?? "ft",
    unitCost: fields.unitCost ?? 0.5,
    supplier: fields.supplier ?? "Northeast Electrical",
    manufacturer: fields.manufacturer ?? "Wic.",
    manufacturerPartNumber:
      fields.manufacturerPartNumber ?? "WIC. ROMEX 12/2",
    supplierSku: fields.supplierSku ?? "3873",
    upc: fields.upc ?? "98010026266",
    sourceDate: fields.sourceDate ?? "2026-08-25",
    amperage: fields.amperage ?? null,
    poleCount: fields.poleCount ?? null,
    protectionType: fields.protectionType ?? null,
    isDefault: false,
    isContractorOwned: fields.isContractorOwned ?? false,
  };
}

test("proposes an exact SKU update and safely normalizes per-thousand wire pricing", () => {
  const result = parsePriceBookImport(
    [
      "Category,Description,UOM,Customer Price,SKU,UPC,MPN,Price Date",
      'Conductor,"12/2 NM-B cable",m,"$562.271",3873,98010026266,WIC. ROMEX 12/2,2026-09-01',
    ].join("\n"),
    [existing()],
  );

  assert.deepEqual(result.report, {
    inserted: 0,
    updated: 1,
    skipped: 0,
    unresolved: 0,
  });
  assert.equal(result.rows[0]?.action, "update");
  assert.equal(result.rows[0]?.incoming.unit, "ft");
  assert.equal(result.rows[0]?.incoming.unitCost, 0.562271);
  assert.equal(result.rows[0]?.matchedItemId, 1);
  assert.equal(result.rows[0]?.stale, false);
});

test("marks an older exact-match supplier row stale and explains the rollback risk", () => {
  const result = parsePriceBookImport(
    [
      "Category,Description,UOM,Customer Price,SKU,Price Date",
      "Conductor,12/2 NM-B cable,ft,0.45,3873,8/1/2026",
    ].join("\n"),
    [existing({ sourceDate: "2026-08-25" })],
  );

  assert.equal(result.rows[0]?.action, "update");
  assert.equal(result.rows[0]?.status, "proposed");
  assert.equal(result.rows[0]?.stale, true);
  assert.equal(result.rows[0]?.incoming.sourceDate, "2026-08-01");
  assert.match(result.rows[0]?.reason ?? "", /older than the catalog price/i);
  assert.match(result.rows[0]?.reason ?? "", /acknowledge/i);
});

test("fails closed when a CSV price date is not a real unambiguous calendar date", () => {
  const result = parsePriceBookImport(
    [
      "Category,Description,UOM,Customer Price,SKU,Price Date",
      "Conductor,12/2 NM-B cable,ft,0.45,3873,02/30/2026",
    ].join("\n"),
    [existing()],
  );

  assert.equal(result.rows[0]?.action, "unresolved");
  assert.equal(result.rows[0]?.status, "unresolved");
  assert.equal(result.rows[0]?.stale, false);
  assert.equal(result.rows[0]?.incoming.sourceDate, null);
  assert.match(result.rows[0]?.reason ?? "", /invalid price date/i);
});

test("keeps contractor-owned exact matches out of the applyable proposal", () => {
  const result = parsePriceBookImport(
    "Category,Description,UOM,Customer Price,SKU\nConductor,12/2 NM-B cable,ft,0.75,3873",
    [existing({ isContractorOwned: true })],
  );

  assert.equal(result.rows[0]?.action, "skip");
  assert.equal(result.rows[0]?.status, "skipped");
  assert.match(result.rows[0]?.reason ?? "", /contractor-owned/i);
});

test("leaves conflicting exact identifiers unresolved instead of choosing a row", () => {
  const result = parsePriceBookImport(
    "Category,Description,UOM,Customer Price,SKU,UPC\nConductor,12/2 NM-B cable,ft,0.75,3873,OTHER-UPC",
    [
      existing({ id: 1, supplierSku: "3873", upc: "FIRST" }),
      existing({ id: 2, supplierSku: "OTHER", upc: "OTHER-UPC" }),
    ],
  );

  assert.equal(result.rows[0]?.action, "unresolved");
  assert.match(result.rows[0]?.reason ?? "", /multiple catalog rows/i);
});

test("rejects a matching SKU when another supplied identifier conflicts", () => {
  const result = parsePriceBookImport(
    "Category,Description,UOM,Customer Price,SKU,UPC\nConductor,12/2 NM-B cable,ft,0.75,3873,DIFFERENT-UPC",
    [existing({ supplierSku: "3873", upc: "ORIGINAL-UPC" })],
  );

  assert.equal(result.rows[0]?.action, "unresolved");
  assert.equal(result.rows[0]?.matchedItemId, 1);
  assert.match(result.rows[0]?.reason ?? "", /supplied UPC conflicts/i);
});

test("preserves optional catalog metadata omitted from a partial export", () => {
  const result = parsePriceBookImport(
    "Category,Description,UOM,Customer Price,SKU\nProtection,Siemens breaker,ea,49.25,3873",
    [
      existing({
        category: "Protection",
        item: "Siemens breaker",
        manufacturer: "Siemens",
        manufacturerPartNumber: "Q115AFC",
        supplierSku: "3873",
        upc: "88762100000",
        amperage: 15,
        poleCount: 1,
        protectionType: "AFCI",
      }),
    ],
  );

  assert.equal(result.rows[0]?.action, "update");
  assert.equal(result.rows[0]?.incoming.manufacturer, "Siemens");
  assert.equal(result.rows[0]?.incoming.manufacturerPartNumber, "Q115AFC");
  assert.equal(result.rows[0]?.incoming.upc, "88762100000");
  assert.equal(result.rows[0]?.incoming.amperage, 15);
  assert.equal(result.rows[0]?.incoming.poleCount, 1);
  assert.equal(result.rows[0]?.incoming.protectionType, "AFCI");
});

test("requires an exact catalog identifier and does not fuzzy-match descriptions", () => {
  const result = parsePriceBookImport(
    "Category,Description,UOM,Customer Price\nConductor,12/2 NM-B cable,ft,0.75",
    [existing()],
  );

  assert.equal(result.rows[0]?.action, "unresolved");
  assert.match(result.rows[0]?.reason ?? "", /exact SKU, UPC, or manufacturer/i);
});

test("keeps package pricing unresolved without an explicit package quantity", () => {
  const result = parsePriceBookImport(
    "Category,Description,UOM,Customer Price,SKU\nDevices,GFCI receptacle,c,250,NEW-1",
    [],
  );

  assert.equal(result.rows[0]?.action, "unresolved");
  assert.match(result.rows[0]?.reason ?? "", /ambiguous package unit/i);
});

test("proposes a new exact-identity row as an insert", () => {
  const result = parsePriceBookImport(
    "Category,Description,UOM,Customer Price,SKU\nDevices,New exact receptacle,ea,7.25,NEW-1",
    [],
    "2026-09-01",
  );

  assert.equal(result.rows[0]?.action, "insert");
  assert.equal(result.rows[0]?.status, "proposed");
  assert.equal(result.rows[0]?.incoming.sourceDate, "2026-09-01");
});