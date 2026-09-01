import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import type {
  AssistantImportConfidence,
  PriceBookImportValueRecord,
} from "@workspace/db";
import { normalizePriceBookIdentifier } from "./price-book-import";
import { isOlderPriceBookSourceDate } from "./price-book-import";

export type AssistantCatalogItem = PriceBookImportValueRecord & {
  id: number;
  updatedAt: Date;
  isContractorOwned: boolean;
};

export type AssistantImportRow = {
  rowNumber: number;
  confidence: AssistantImportConfidence;
  score: number;
  reason: string;
  incoming: PriceBookImportValueRecord;
  matchedItemId: number | null;
  candidateItemIds: number[];
  before: PriceBookImportValueRecord | null;
  beforeUpdatedAt: string | null;
  stale: boolean;
};

const MAX_ROWS = 5_000;

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitDelimitedLine(line: string, delimiter = ",") {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function csvRows(buffer: Buffer) {
  const text = new TextDecoder("utf-8", { fatal: true })
    .decode(buffer)
    .replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = (lines[0]?.match(/\t/g)?.length ?? 0) >
    (lines[0]?.match(/,/g)?.length ?? 0)
    ? "\t"
    : ",";
  return lines.map((line) => splitDelimitedLine(line, delimiter));
}

function workbookRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: false,
    cellDates: false,
    bookVBA: true,
  });
  if (workbook.vbaraw) {
    throw new Error("Macro-enabled workbooks are not supported.");
  }
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The workbook does not contain a worksheet.");
  const sheet = workbook.Sheets[firstSheet];
  if (!sheet) throw new Error("The first worksheet could not be read.");
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: "",
  });
}

async function pdfRows(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ itemJoiner: "  " });
    const lines = result.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const rows = lines.map((line) =>
      line.includes(",")
        ? splitDelimitedLine(line)
        : line.split(/\s{2,}|\t+/).map((cell) => cell.trim()),
    );
    if (!rows.some((row) => row.length >= 3)) {
      throw new Error(
        "No safe table could be extracted from this PDF. Upload a text-based supplier table or use CSV/Excel.",
      );
    }
    return rows;
  } finally {
    await parser.destroy();
  }
}

function headerIndex(rows: string[][]) {
  const aliases = new Set([
    "item",
    "description",
    "product",
    "name",
    "unitcost",
    "cost",
    "price",
    "suppliersku",
    "sku",
    "upc",
    "manufacturerpartnumber",
    "mpn",
  ]);
  return rows.findIndex(
    (row) =>
      row.map(normalizeHeader).filter((header) => aliases.has(header)).length >= 2,
  );
}

function indexFor(headers: string[], aliases: string[]) {
  const index = headers.findIndex((header) => aliases.includes(header));
  return index >= 0 ? index : null;
}

function value(row: string[], index: number | null) {
  return index === null ? "" : String(row[index] ?? "").trim();
}

function nullable(value: string) {
  return value.trim() || null;
}

function canonicalSourceDate(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const year = Number(iso?.[1] ?? us?.[3]);
  const month = Number(iso?.[2] ?? us?.[1]);
  const day = Number(iso?.[3] ?? us?.[2]);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function numberValue(value: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalRows(rows: string[][], sourceDate: string | null) {
  const start = headerIndex(rows);
  if (start < 0) {
    throw new Error(
      "Could not find a recognizable item/description and cost header row.",
    );
  }
  const headers = rows[start].map(normalizeHeader);
  const itemIndex = indexFor(headers, [
    "item",
    "description",
    "product",
    "productdescription",
    "name",
  ]);
  const costIndex = indexFor(headers, [
    "unitcost",
    "cost",
    "price",
    "customerprice",
    "netprice",
  ]);
  if (itemIndex === null || costIndex === null) {
    throw new Error("The file must include item/description and unit cost columns.");
  }
  const categoryIndex = indexFor(headers, ["category", "productcategory"]);
  const unitIndex = indexFor(headers, ["unit", "uom", "unitofmeasure"]);
  const supplierIndex = indexFor(headers, ["supplier", "vendor"]);
  const manufacturerIndex = indexFor(headers, ["manufacturer", "brand", "mfg"]);
  const supplierSkuIndex = indexFor(headers, ["suppliersku", "sku", "vendoritem"]);
  const upcIndex = indexFor(headers, ["upc", "barcode"]);
  const mpnIndex = indexFor(headers, [
    "manufacturerpartnumber",
    "manufacturerpart",
    "mpn",
    "partnumber",
  ]);
  const sourceDateIndex = indexFor(headers, ["sourcedate", "pricedate", "date"]);

  return rows
    .slice(start + 1, start + 1 + MAX_ROWS)
    .map((row, index) => {
      const item = value(row, itemIndex);
      const unitCost = numberValue(value(row, costIndex));
      if (!item || unitCost === null || unitCost < 0) return null;
      const rawDate = nullable(value(row, sourceDateIndex)) ?? sourceDate;
      const sourceDateValue = canonicalSourceDate(rawDate);
      if (rawDate && !sourceDateValue) {
        throw new Error(`Row ${start + index + 2} has an invalid price date.`);
      }
      const canonicalValue: PriceBookImportValueRecord = {
        category: value(row, categoryIndex),
        item,
        unit: value(row, unitIndex),
        unitCost,
        supplier: nullable(value(row, supplierIndex)),
        manufacturer: nullable(value(row, manufacturerIndex)),
        manufacturerPartNumber: nullable(value(row, mpnIndex)),
        supplierSku: nullable(value(row, supplierSkuIndex)),
        upc: nullable(value(row, upcIndex)),
        sourceDate: sourceDateValue,
        amperage: null,
        poleCount: null,
        protectionType: null,
      };
      return {
        rowNumber: start + index + 2,
        value: canonicalValue,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1),
  );
}

function similarity(left: string, right: string) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / union.size;
}

function importValue(item: AssistantCatalogItem): PriceBookImportValueRecord {
  return {
    category: item.category,
    item: item.item,
    unit: item.unit,
    unitCost: item.unitCost,
    supplier: item.supplier,
    manufacturer: item.manufacturer,
    manufacturerPartNumber: item.manufacturerPartNumber,
    supplierSku: item.supplierSku,
    upc: item.upc,
    sourceDate: item.sourceDate,
    amperage: item.amperage,
    poleCount: item.poleCount,
    protectionType: item.protectionType,
  };
}

function mergeIncoming(
  incoming: PriceBookImportValueRecord,
  existing: PriceBookImportValueRecord,
): PriceBookImportValueRecord {
  return {
    ...incoming,
    category: incoming.category || existing.category,
    unit: incoming.unit || existing.unit,
    supplier: incoming.supplier ?? existing.supplier,
    manufacturer: incoming.manufacturer ?? existing.manufacturer,
    manufacturerPartNumber:
      incoming.manufacturerPartNumber ?? existing.manufacturerPartNumber,
    supplierSku: incoming.supplierSku ?? existing.supplierSku,
    upc: incoming.upc ?? existing.upc,
    sourceDate: incoming.sourceDate ?? existing.sourceDate,
    amperage: incoming.amperage ?? existing.amperage,
    poleCount: incoming.poleCount ?? existing.poleCount,
    protectionType: incoming.protectionType ?? existing.protectionType,
  };
}

function exactIdentifiers(value: PriceBookImportValueRecord) {
  return [
    ["supplierSku", value.supplierSku],
    ["upc", value.upc],
    ["manufacturerPartNumber", value.manufacturerPartNumber],
  ] as const;
}

function matchRow(
  rowNumber: number,
  incoming: PriceBookImportValueRecord,
  catalog: AssistantCatalogItem[],
): AssistantImportRow {
  const exact = catalog.filter((candidate) =>
    exactIdentifiers(incoming).some(
      ([field, identifier]) =>
        identifier &&
        normalizePriceBookIdentifier(identifier) ===
          normalizePriceBookIdentifier(candidate[field]),
    ),
  );
  if (exact.length === 1) {
    const match = exact[0];
    const before = importValue(match);
    const merged = mergeIncoming(incoming, before);
    const stale = isOlderPriceBookSourceDate(incoming.sourceDate, match.sourceDate);
    return {
      rowNumber,
      confidence: "EXACT",
      score: 1,
      reason: "One company catalog row matched an exact SKU, UPC, or manufacturer part number.",
      incoming: merged,
      matchedItemId: match.id,
      candidateItemIds: [match.id],
      before,
      beforeUpdatedAt: match.updatedAt.toISOString(),
      stale,
    };
  }
  if (exact.length > 1) {
    return {
      rowNumber,
      confidence: "AMBIGUOUS",
      score: 1,
      reason: "Multiple company catalog rows share an exact identifier.",
      incoming,
      matchedItemId: null,
      candidateItemIds: exact.map((item) => item.id),
      before: null,
      beforeUpdatedAt: null,
      stale: false,
    };
  }

  const ranked = catalog
    .map((candidate) => ({
      candidate,
      score: similarity(
        `${incoming.manufacturer ?? ""} ${incoming.item}`,
        `${candidate.manufacturer ?? ""} ${candidate.item}`,
      ),
    }))
    .filter(({ score }) => score >= 0.45)
    .sort(
      (left, right) =>
        right.score - left.score || left.candidate.id - right.candidate.id,
    );
  const best = ranked[0];
  const second = ranked[1];
  if (best && best.score >= 0.68 && (!second || best.score - second.score >= 0.15)) {
    const before = importValue(best.candidate);
    const merged = mergeIncoming(incoming, before);
    const stale = isOlderPriceBookSourceDate(
      incoming.sourceDate,
      best.candidate.sourceDate,
    );
    return {
      rowNumber,
      confidence: "LIKELY",
      score: Number(best.score.toFixed(3)),
      reason: "One name/manufacturer candidate is materially stronger than the alternatives.",
      incoming: merged,
      matchedItemId: best.candidate.id,
      candidateItemIds: [best.candidate.id],
      before,
      beforeUpdatedAt: best.candidate.updatedAt.toISOString(),
      stale,
    };
  }
  if (best) {
    const candidates = ranked.slice(0, 5);
    return {
      rowNumber,
      confidence: "AMBIGUOUS",
      score: Number(best.score.toFixed(3)),
      reason: "Name evidence does not identify one catalog row safely.",
      incoming,
      matchedItemId: null,
      candidateItemIds: candidates.map(({ candidate }) => candidate.id),
      before: null,
      beforeUpdatedAt: null,
      stale: false,
    };
  }
  return {
    rowNumber,
    confidence: "NO_MATCH",
    score: 0,
    reason: "No exact identifier or reliable company catalog candidate matched.",
    incoming,
    matchedItemId: null,
    candidateItemIds: [],
    before: null,
    beforeUpdatedAt: null,
    stale: false,
  };
}

export async function reviewAssistantImport(input: {
  buffer: Buffer;
  fileName: string;
  sourceDate: string | null;
  catalog: AssistantCatalogItem[];
}) {
  const extension = input.fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  let rows: string[][];
  if (extension === ".csv" || extension === ".txt") {
    rows = csvRows(input.buffer);
  } else if (extension === ".xlsx" || extension === ".xls") {
    rows = workbookRows(input.buffer);
  } else if (extension === ".pdf") {
    rows = await pdfRows(input.buffer);
  } else {
    throw new Error("Supported supplier files are CSV, XLS, XLSX, and text-based PDF.");
  }
  const canonical = canonicalRows(rows, input.sourceDate);
  if (canonical.length === 0) {
    throw new Error("No valid item and unit-cost rows were found.");
  }
  if (canonical.length >= MAX_ROWS) {
    throw new Error(`The file exceeds the ${MAX_ROWS.toLocaleString()} row review limit.`);
  }
  const matchedRows = canonical.map(({ rowNumber, value }) =>
    matchRow(rowNumber, value, input.catalog),
  );
  const report = {
    total: matchedRows.length,
    exact: matchedRows.filter((row) => row.confidence === "EXACT").length,
    likely: matchedRows.filter((row) => row.confidence === "LIKELY").length,
    ambiguous: matchedRows.filter((row) => row.confidence === "AMBIGUOUS").length,
    noMatch: matchedRows.filter((row) => row.confidence === "NO_MATCH").length,
    proposed: matchedRows.filter(
      (row) =>
        (row.confidence === "EXACT" || row.confidence === "LIKELY") &&
        row.matchedItemId !== null &&
        !row.stale,
    ).length,
  };
  return { rows: matchedRows, report };
}