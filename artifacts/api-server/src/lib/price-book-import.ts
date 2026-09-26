import type {
  PriceBookImportReportRecord,
  PriceBookImportRowRecord,
  PriceBookImportValueRecord,
} from "@workspace/db";
import { normalizeSupplierCost } from "./material-resolution";

type ExistingPriceBookItem = PriceBookImportValueRecord & {
  id: number;
  isDefault: boolean;
  isContractorOwned: boolean;
};

const IDENTIFIER_FIELDS = [
  "supplierSku",
  "upc",
  "manufacturerPartNumber",
] as const;

type IdentifierField = (typeof IDENTIFIER_FIELDS)[number];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizePriceBookIdentifier(value: string | null) {
  return value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
}

function nullable(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: string | undefined) {
  const cleaned = value?.replace(/[$,\s]/g, "").trim() ?? "";
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalSourceDate(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!isoMatch && !usMatch) return null;
  const year = Number(isoMatch?.[1] ?? usMatch?.[3]);
  const month = Number(isoMatch?.[2] ?? usMatch?.[1]);
  const day = Number(isoMatch?.[3] ?? usMatch?.[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function splitCsvLine(line: string) {
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
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  // Supplier exports may contain a title, date, and account notes before the table.
  const headerIndex = lines.findIndex((line) => {
    const headers = splitCsvLine(line).map(normalizeHeader);
    return headers.some((h) => ["item", "description", "product", "productdescription", "name"].includes(h))
      && headers.some((h) => ["unitcost", "cost", "price", "customerprice", "customerpriceperunit", "netprice"].includes(h));
  });
  const preamble = lines.slice(0, Math.max(0, headerIndex)).join("\n");
  const northeast = /NORTHEAST ELECTRICAL/i.test(preamble);
  const priceDate = /Price Sheet as of (\d{2})\/(\d{2})\/(\d{2}|\d{4})\b/i.exec(preamble);
  const sourceDate = priceDate
    ? `${priceDate[1]}/${priceDate[2]}/${priceDate[3].length === 2 ? `20${priceDate[3]}` : priceDate[3]}`
    : null;
  if (headerIndex < 0) return { headers: [], rows: [] as { cells: string[]; rowNumber: number }[], northeast, sourceDate };
  const headers = splitCsvLine(lines[headerIndex]).map(normalizeHeader);
  const rows = lines
    .slice(headerIndex + 1)
    .map((line, index) => ({ cells: splitCsvLine(line), rowNumber: headerIndex + index + 2 }))
    .filter(({ cells }) => cells.some((value) => value.trim().length > 0))
    .filter(({ cells }) => !/^Price Sheet for:/i.test(cells[0]?.trim() ?? ""))
    .filter(({ cells }) => cells.map(normalizeHeader).join(",") !== headers.join(","));
  return { headers, rows, northeast, sourceDate };
}

function column(headers: string[], aliases: string[]) {
  const index = headers.findIndex((header) => aliases.includes(header));
  return index >= 0 ? index : null;
}

function cell(row: string[], index: number | null) {
  return index === null ? undefined : row[index];
}

function parseIncomingRow(
  headers: string[],
  row: string[],
  sourceDate: string | null,
  deferUnits = false,
): { incoming: PriceBookImportValueRecord; reason: string | null } {
  const category = nullable(
    cell(
      row,
      column(headers, ["category", "materialcategory", "productcategory"]),
    ),
  );
  const item = nullable(
    cell(row, ["item", "description", "product", "productdescription", "name"].map(normalizeHeader).map((value) => headers.indexOf(value)).find((index) => index >= 0) ?? null),
  );
  const unitValue = nullable(
    cell(row, column(headers, ["unit", "uom", "unitofmeasure", "sellunit"])),
  );
  const rawCost = parseNumber(
    cell(
      row,
      column(headers, [
        "unitcost",
        "cost",
        "price",
        "customerprice",
        "customerpriceperunit",
        "netprice",
      ]),
    ),
  );
  const packageQuantity = parseNumber(
    cell(row, column(headers, ["packagequantity", "packqty", "quantityperpackage"])),
  );
  const baseUnit = nullable(cell(row, column(headers, ["normalizedunit", "baseunit", "internalunit"])));
  const normalizedUnit = unitValue?.toLowerCase() ?? "";
  const isWireFamily =
    category?.toLowerCase().includes("conductor") ||
    /(?:wire|cable|thhn|xhhw|ser|nm-b)/i.test(item ?? "");
  let unit = unitValue ?? "";
  let unitCost = rawCost ?? 0;
  let reason: string | null = null;
  const rawSourceDate =
    nullable(cell(row, column(headers, ["sourcedate", "date", "pricedate"]))) ??
    sourceDate;
  const sourceDateValue = canonicalSourceDate(rawSourceDate);

  if (!item && !deferUnits) reason = "Missing item description.";
  else if (!category && !deferUnits) reason = "Missing category.";
  else if (!unitValue) reason = "Missing unit of measure.";
  else if (rawCost === null || rawCost < 0) {
    reason = "Missing or invalid customer price.";
  } else if (!deferUnits && (normalizedUnit === "m" || normalizedUnit === "per thousand feet")) {
    if (!isWireFamily) {
      reason = "The per-thousand unit is only safe for an explicit wire or cable row.";
    } else {
      unit = "ft";
      unitCost = rawCost / 1000;
    }
  } else if (!deferUnits && (normalizedUnit === "c" || normalizedUnit.includes("package"))) {
    if (!packageQuantity || packageQuantity <= 0 || (normalizedUnit === "c" && packageQuantity !== 100)) {
      reason =
        "Ambiguous package unit; include a positive package quantity before importing.";
    } else {
      unit = baseUnit ?? "ea";
      unitCost = rawCost / packageQuantity;
    }
  } else if (!deferUnits && !["ea", "each", "ft", "feet", "foot", "sheet", "set", "kit", "lot", "scope", "hour", "hr", "pair"].includes(normalizedUnit)) {
    reason = "Unknown supplier unit; verify the base unit and conversion before importing.";
  }
  if (!reason && !deferUnits && rawCost != null) {
    const converted = normalizeSupplierCost(rawCost, unitValue ?? "", unit, packageQuantity);
    if (!converted) reason = "Supplier unit cannot be safely normalized; confirm its base unit and package quantity.";
    else { unit = converted.normalizedUnit; unitCost = converted.normalizedUnitCost; }
  }
  if (!reason && rawSourceDate && !sourceDateValue) {
    reason =
      "Invalid price date; use an actual calendar date in YYYY-MM-DD or M/D/YYYY format.";
  }

  const incoming: PriceBookImportValueRecord = {
    category: category ?? "",
    item: item ?? "",
    unit,
    unitCost: Number(unitCost.toFixed(6)),
    supplierCost: rawCost,
    supplierUom: unitValue,
    normalizedUnit: reason || deferUnits ? null : unit,
    normalizedUnitCost: reason || deferUnits ? null : Number(unitCost.toFixed(6)),
    supplierUnitQuantity: reason || deferUnits ? null : rawCost && unitCost ? rawCost / unitCost : 1,
    supplier: nullable(cell(row, column(headers, ["supplier", "vendor"]))),
    manufacturer: nullable(
      cell(row, column(headers, ["manufacturer", "brand"])),
    ),
    manufacturerPartNumber: nullable(
      cell(row, column(headers, [
        "manufacturerpartnumber",
        "mpn",
        "partnumber",
        "model",
        "manufacturermodel",
      ])),
    ),
    supplierSku: nullable(
      cell(row, column(headers, ["suppliersku", "sku", "itemsku", "stockkeepingunit"])),
    ),
    upc: nullable(cell(row, column(headers, ["upc", "gtin", "barcode"]))),
    sourceDate: sourceDateValue,
    amperage: parseNumber(
      cell(row, column(headers, ["amperage", "amps", "amp"])),
    ),
    poleCount: parseNumber(
      cell(row, column(headers, ["polecount", "poles", "pole"])),
    ),
    protectionType: nullable(
      cell(row, column(headers, ["protectiontype", "protection"])),
    ),
  };

  return { incoming, reason };
}

function identifiers(value: PriceBookImportValueRecord) {
  return IDENTIFIER_FIELDS.flatMap((field) => {
    const normalized = normalizePriceBookIdentifier(value[field]);
    return normalized ? [{ field, value: normalized }] : [];
  });
}

function conflictingIdentifier(
  incoming: PriceBookImportValueRecord,
  existing: PriceBookImportValueRecord,
) {
  return IDENTIFIER_FIELDS.find((field) => {
    const incomingValue = normalizePriceBookIdentifier(incoming[field]);
    const existingValue = normalizePriceBookIdentifier(existing[field]);
    return incomingValue && existingValue && incomingValue !== existingValue;
  });
}

export function isOlderPriceBookSourceDate(
  incomingSourceDate: string | null,
  catalogSourceDate: string | null,
) {
  const incoming = canonicalSourceDate(incomingSourceDate);
  const catalog = canonicalSourceDate(catalogSourceDate);
  if (!incoming || !catalog) return false;
  return incoming < catalog;
}

function sameValue(
  left: PriceBookImportValueRecord,
  right: PriceBookImportValueRecord,
) {
  return (
    left.category === right.category &&
    left.item === right.item &&
    left.unit === right.unit &&
    left.unitCost === right.unitCost &&
    // Older previews did not retain raw pricing. Enrich metadata on the next
    // actual price update without turning every unchanged legacy row into an update.
    (left.supplierCost == null || (left.supplierCost === right.supplierCost &&
      left.supplierUom === right.supplierUom && left.normalizedUnit === right.normalizedUnit &&
      left.normalizedUnitCost === right.normalizedUnitCost)) &&
    left.supplier === right.supplier &&
    left.manufacturer === right.manufacturer &&
    left.manufacturerPartNumber === right.manufacturerPartNumber &&
    left.supplierSku === right.supplierSku &&
    left.upc === right.upc &&
    left.sourceDate === right.sourceDate &&
    left.amperage === right.amperage &&
    left.poleCount === right.poleCount &&
    left.protectionType === right.protectionType
  );
}

function importValue(value: PriceBookImportValueRecord): PriceBookImportValueRecord {
  return {
    category: value.category,
    item: value.item,
    unit: value.unit,
    unitCost: value.unitCost,
    supplierCost: value.supplierCost,
    supplierUom: value.supplierUom,
    normalizedUnit: value.normalizedUnit,
    normalizedUnitCost: value.normalizedUnitCost,
    supplierUnitQuantity: value.supplierUnitQuantity,
    supplier: value.supplier,
    manufacturer: value.manufacturer,
    manufacturerPartNumber: value.manufacturerPartNumber,
    supplierSku: value.supplierSku,
    upc: value.upc,
    sourceDate: value.sourceDate,
    amperage: value.amperage,
    poleCount: value.poleCount,
    protectionType: value.protectionType,
  };
}

function mergeMissingImportValues(
  incoming: PriceBookImportValueRecord,
  existing: PriceBookImportValueRecord,
): PriceBookImportValueRecord {
  return {
    ...incoming,
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

export function reportForImportRows(
  rows: PriceBookImportRowRecord[],
): PriceBookImportReportRecord {
  return rows.reduce(
    (report, row) => {
      if (row.action === "insert") report.inserted += 1;
      if (row.action === "update") report.updated += 1;
      if (row.action === "skip") report.skipped += 1;
      if (row.action === "unresolved") report.unresolved += 1;
      return report;
    },
    { inserted: 0, updated: 0, skipped: 0, unresolved: 0 },
  );
}

export function parsePriceBookImport(
  csv: string,
  existingItems: ExistingPriceBookItem[],
  sourceDate: string | null = null,
) {
  const { headers, rows: csvRows, northeast, sourceDate: fileDate } = parseCsv(csv);
  const rawNortheast = northeast && headers.includes("stocknumber");
  const identifierIndex = new Map<string, Set<ExistingPriceBookItem>>();
  for (const existing of existingItems) {
    for (const identifier of identifiers(existing)) {
      const key = `${identifier.field}:${identifier.value}`;
      const values = identifierIndex.get(key) ?? new Set<ExistingPriceBookItem>();
      values.add(existing);
      identifierIndex.set(key, values);
    }
  }
  const rows: PriceBookImportRowRecord[] = [];
  if (headers.length === 0) {
    rows.push({
      rowNumber: 0,
      action: "unresolved",
      status: "unresolved",
      stale: false,
      reason: "The file does not contain a CSV header row.",
      matchedItemId: null,
      incoming: {
        category: "",
        item: "",
        unit: "",
        unitCost: 0,
        supplier: null,
        manufacturer: null,
        manufacturerPartNumber: null,
        supplierSku: null,
        upc: null,
        sourceDate,
        amperage: null,
        poleCount: null,
        protectionType: null,
      },
      before: null,
    });
    return { rows, report: reportForImportRows(rows) };
  }

  for (const { cells: csvRow, rowNumber } of csvRows) {
    const { incoming, reason: parseReason } = parseIncomingRow(
      headers,
      csvRow,
      sourceDate ?? fileDate,
      rawNortheast,
    );
    if (rawNortheast) incoming.supplier = "Northeast Electrical";
    if (parseReason) {
      rows.push({
        rowNumber,
        action: "unresolved",
        status: "unresolved",
        stale: false,
        reason: parseReason,
        matchedItemId: null,
        incoming,
        before: null,
      });
      continue;
    }

    const incomingIdentifiers = identifiers(incoming);
    if (incomingIdentifiers.length === 0) {
      rows.push({
        rowNumber,
        action: "unresolved",
        status: "unresolved",
        stale: false,
        reason: "No exact SKU, UPC, or manufacturer part number was provided.",
        matchedItemId: null,
        incoming,
        before: null,
      });
      continue;
    }

    const matches = [...new Set(incomingIdentifiers.flatMap((identifier) =>
      [...(identifierIndex.get(`${identifier.field}:${identifier.value}`) ?? [])],
    ))];
    if (matches.length > 1) {
      rows.push({
        rowNumber,
        action: "unresolved",
        status: "unresolved",
        stale: false,
        reason:
          "Multiple catalog rows share an exact SKU, UPC, or manufacturer part number.",
        matchedItemId: null,
        incoming,
        before: null,
      });
      continue;
    }

    const match = matches[0];
    if (!incoming.item && !match) {
      rows.push({
        rowNumber, action: "unresolved", status: "unresolved", stale: false,
        reason: "Missing item description and no unique catalog match to supply it.",
        matchedItemId: null, incoming, before: null,
      });
      continue;
    }
    if (rawNortheast) {
      // The export's stock number is often truncated and shared by variants.
      // Match only SKU/UPC; do not turn that stock number into an exact MPN.
      const rawUnit = incoming.unit.toLowerCase();
      const canonicalUnit = match?.unit.toLowerCase();
      let unsafeUnit = false;
      if (rawUnit === "ea") {
        unsafeUnit = Boolean(match && canonicalUnit !== "ea" && canonicalUnit !== "each");
        incoming.unit = match?.unit ?? "ea";
      } else if (rawUnit === "m" && match && canonicalUnit === "ft"
        && /conductor|wire|cable|thhn|xhhw|ser|nm-b/i.test(`${match.category} ${match.item}`)) {
        incoming.unit = match.unit;
        incoming.unitCost = Number((incoming.unitCost / 1000).toFixed(6));
      } else if (rawUnit === "c" && match && (
        (match.supplierUom?.toLowerCase() === "c" && match.normalizedUnit && match.supplierUnitQuantity === 100) ||
        /\b100(?:[\s-]+)(?:unit|foot|feet|ft|count|pack)/i.test(match.item))) {
        incoming.unit = match.unit;
        incoming.unitCost = Number((incoming.unitCost / 100).toFixed(6));
      } else {
        unsafeUnit = true;
      }
      incoming.category = match?.category ?? "Supplier catalog";
      if (!unsafeUnit) {
        const conversion = normalizeSupplierCost(incoming.supplierCost ?? incoming.unitCost, rawUnit,
          incoming.unit, match?.supplierUnitQuantity);
        if (!conversion) unsafeUnit = true;
        else Object.assign(incoming, conversion, { unit: conversion.normalizedUnit, unitCost: conversion.normalizedUnitCost });
      }
      if (unsafeUnit) {
        rows.push({
          rowNumber, action: "unresolved", status: "unresolved", stale: false,
          reason: `Supplier unit "${rawUnit}" needs a verified each/foot or package conversion before importing. No price was selected.`,
          matchedItemId: match?.id ?? null, incoming, before: match ? importValue(match) : null,
        });
        continue;
      }
    }
    if (!match) {
      rows.push({
        rowNumber,
        action: "insert",
        status: "proposed",
        stale: false,
        reason: "No existing exact identifier matched; review as a new catalog row.",
        matchedItemId: null,
        incoming,
        before: null,
      });
      continue;
    }

    const conflict = conflictingIdentifier(incoming, match);
    if (conflict) {
      const label =
        conflict === "supplierSku"
          ? "supplier SKU"
          : conflict === "upc"
            ? "UPC"
            : "manufacturer part number";
      rows.push({
        rowNumber,
        action: "unresolved",
        status: "unresolved",
        stale: false,
        reason: `The supplied ${label} conflicts with the exact-matched catalog row.`,
        matchedItemId: match.id,
        incoming,
        before: importValue(match),
      });
      continue;
    }

    const mergedIncoming = mergeMissingImportValues(incoming, match);
    // Builders resolve canonical item names/categories, not supplier descriptions.
    // Updating a price must never silently disconnect a material from a builder.
    mergedIncoming.item = match.item;
    mergedIncoming.category = match.category;
    if (match.isContractorOwned) {
      rows.push({
        rowNumber,
        action: "skip",
        status: "skipped",
        stale: false,
        reason: "Catalog row is contractor-owned and cannot be overwritten by an import.",
        matchedItemId: match.id,
        incoming: mergedIncoming,
        before: importValue(match),
      });
      continue;
    }

    const isCurrent = sameValue(match, mergedIncoming);
    const stale = isOlderPriceBookSourceDate(
      incoming.sourceDate,
      match.sourceDate,
    );
    rows.push({
      rowNumber,
      action: isCurrent ? "skip" : "update",
      status: isCurrent ? "skipped" : "proposed",
      stale,
      reason: isCurrent
        ? "Exact match is already current; no change is needed."
        : stale
          ? `The supplier file is dated ${incoming.sourceDate}, older than the catalog price dated ${match.sourceDate}; acknowledge the stale-price warning before applying.`
          : "Exact identifier match; review the proposed catalog update.",
      matchedItemId: match.id,
      incoming: mergedIncoming,
      before: importValue(match),
    });
  }

  return { rows, report: reportForImportRows(rows) };
}

export function identifierFields() {
  return IDENTIFIER_FIELDS as readonly IdentifierField[];
}

export function exactImportMatches(
  incoming: PriceBookImportValueRecord,
  existingItems: ExistingPriceBookItem[],
) {
  const incomingIdentifiers = identifiers(incoming);
  return existingItems.filter((existing) =>
    identifiers(existing).some((candidate) =>
      incomingIdentifiers.some(
        (incomingIdentifier) =>
          incomingIdentifier.field === candidate.field &&
          incomingIdentifier.value === candidate.value,
      ),
    ),
  );
}
