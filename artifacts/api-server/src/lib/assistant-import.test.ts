import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import type { PriceBookImportValueRecord } from "@workspace/db";
import {
  reviewAssistantImport,
  type AssistantCatalogItem,
} from "./assistant-import";
import { searchAssistantGuide } from "./assistant-guide";

function catalog(
  fields: Partial<AssistantCatalogItem> & { id: number; item: string },
): AssistantCatalogItem {
  return {
    id: fields.id,
    category: fields.category ?? "Electrical",
    item: fields.item,
    unit: fields.unit ?? "ea",
    unitCost: fields.unitCost ?? 10,
    supplier: fields.supplier ?? "Supply House",
    manufacturer: fields.manufacturer ?? "Acme",
    manufacturerPartNumber: fields.manufacturerPartNumber ?? null,
    supplierSku: fields.supplierSku ?? null,
    upc: fields.upc ?? null,
    sourceDate: fields.sourceDate ?? "2026-08-01",
    amperage: fields.amperage ?? null,
    poleCount: fields.poleCount ?? null,
    protectionType: fields.protectionType ?? null,
    isContractorOwned: fields.isContractorOwned ?? false,
    updatedAt: fields.updatedAt ?? new Date("2026-08-15T12:00:00.000Z"),
  };
}

test("assistant supplier review classifies exact, likely, ambiguous, and unmatched rows without applying them", async () => {
  const csv = [
    "Category,Description,Unit Cost,SKU,Manufacturer",
    "Breaker,20A single pole breaker,15.50,BR-20,Acme",
    "Conductor,12/2 copper NM-B cable,0.75,,CopperCo",
    "Device,standard wall switch,4.25,,Acme",
    "Specialty,Unlisted controller,90.00,,Other",
  ].join("\n");
  const items = [
    catalog({
      id: 1,
      item: "20A single pole breaker",
      supplierSku: "BR20",
    }),
    catalog({
      id: 2,
      item: "12/2 copper NM-B cable",
      manufacturer: "CopperCo",
    }),
    catalog({ id: 3, item: "standard wall switch white" }),
    catalog({ id: 4, item: "standard wall switch ivory" }),
  ];

  const reviewed = await reviewAssistantImport({
    buffer: Buffer.from(csv),
    fileName: "supplier.csv",
    sourceDate: "2026-08-31",
    catalog: items,
  });

  assert.deepEqual(
    reviewed.rows.map((row) => row.confidence),
    ["EXACT", "LIKELY", "AMBIGUOUS", "NO_MATCH"],
  );
  assert.deepEqual(reviewed.report, {
    total: 4,
    exact: 1,
    likely: 1,
    ambiguous: 1,
    noMatch: 1,
    proposed: 2,
  });
  assert.equal(reviewed.rows[0]?.matchedItemId, 1);
  assert.equal(reviewed.rows[2]?.matchedItemId, null);
  assert.deepEqual(reviewed.rows[2]?.candidateItemIds, [3, 4]);
});

test("assistant supplier review gives exact identifiers precedence over similar names", async () => {
  const reviewed = await reviewAssistantImport({
    buffer: Buffer.from(
      "Description,Unit Cost,UPC\nCompletely different description,19.25,001-234",
    ),
    fileName: "supplier.csv",
    sourceDate: null,
    catalog: [
      catalog({ id: 1, item: "Name-only close candidate" }),
      catalog({
        id: 2,
        item: "Exact identifier target",
        upc: "001234",
      }),
    ],
  });

  assert.equal(reviewed.rows[0]?.confidence, "EXACT");
  assert.equal(reviewed.rows[0]?.matchedItemId, 2);
  assert.equal(reviewed.rows[0]?.score, 1);
});

test("assistant supplier review parses XLSX rows into the same deterministic review", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Description", "Unit Cost", "Supplier SKU"],
    ["20A single pole breaker", 22.5, "BR-20"],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Prices");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const reviewed = await reviewAssistantImport({
    buffer,
    fileName: "supplier.xlsx",
    sourceDate: null,
    catalog: [
      catalog({
        id: 8,
        item: "20A single pole breaker",
        supplierSku: "BR20",
      }),
    ],
  });

  assert.equal(reviewed.rows[0]?.confidence, "EXACT");
  assert.equal(reviewed.rows[0]?.incoming.unitCost, 22.5);
});

test("assistant guide search returns version-controlled routes and does not invent missing sections", () => {
  const results = searchAssistantGuide("How do I review OCR takeoffs?");
  assert.equal(results[0]?.title, "Takeoffs");
  assert.equal(results[0]?.path, "/builders");

  const fallback = searchAssistantGuide("quantum flux capacitor workflow");
  assert.deepEqual(fallback.map((section) => section.title), [
    "Assistant safety",
  ]);
});

test("assistant import record shape remains compatible with Price Book values", () => {
  const value: PriceBookImportValueRecord = {
    category: "Breaker",
    item: "20A breaker",
    unit: "ea",
    unitCost: 10,
    supplier: null,
    manufacturer: null,
    manufacturerPartNumber: null,
    supplierSku: null,
    upc: null,
    sourceDate: null,
    amperage: null,
    poleCount: null,
    protectionType: null,
  };
  assert.equal(value.unitCost, 10);
});