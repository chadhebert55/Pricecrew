import type {
  PriceBookImportReportRecord,
  PriceBookImportRowRecord,
  PriceBookImportValueRecord,
} from "@workspace/db";

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
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerIndex < 0) return { headers: [], rows: [] as string[][] };
  const headers = splitCsvLine(lines[headerIndex]).map(normalizeHeader);
  const rows = lines
    .slice(headerIndex + 1)
    .filter((line) => line.trim().length > 0)
    .map(splitCsvLine);
  return { headers, rows };
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
  const normalizedUnit = unitValue?.toLowerCase() ?? "";
  const isWireFamily =
    category?.toLowerCase().includes("conductor") ||
    /(?:wire|cable|thhn|xhhw|ser|nm-b)/i.test(item ?? "");
  let unit = unitValue ?? "";
  let unitCost = rawCost ?? 0;
  let reason: string | null = null;

  if (!item) reason = "Missing item description.";
  else if (!category) reason = "Missing category.";
  else if (!unitValue) reason = "Missing unit of measure.";
  else if (rawCost === null || rawCost < 0) {
    reason = "Missing or invalid customer price.";
  } else if (normalizedUnit === "m" || normalizedUnit === "per thousand feet") {
    if (!isWireFamily) {
      reason = "The per-thousand unit is only safe for an explicit wire or cable row.";
    } else {
      unit = "ft";
      unitCost = rawCost / 1000;
    }
  } else if (normalizedUnit === "c" || normalizedUnit.includes("package")) {
    if (!packageQuantity || packageQuantity <= 0) {
      reason =
        "Ambiguous package unit; include a positive package quantity before importing.";
    } else {
      unitCost = rawCost / packageQuantity;
    }
  }

  const incoming: PriceBookImportValueRecord = {
    category: category ?? "",
    item: item ?? "",
    unit,
    unitCost: Number(unitCost.toFixed(6)),
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
    sourceDate:
      nullable(cell(row, column(headers, ["sourcedate", "date", "pricedate"]))) ??
      sourceDate,
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

function sameValue(
  left: PriceBookImportValueRecord,
  right: PriceBookImportValueRecord,
) {
  return (
    left.category === right.category &&
    left.item === right.item &&
    left.unit === right.unit &&
    left.unitCost === right.unitCost &&
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
  const { headers, rows: csvRows } = parseCsv(csv);
  const rows: PriceBookImportRowRecord[] = [];
  if (headers.length === 0) {
    rows.push({
      rowNumber: 0,
      action: "unresolved",
      status: "unresolved",
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

  for (const [index, csvRow] of csvRows.entries()) {
    const rowNumber = index + 2;
    const { incoming, reason: parseReason } = parseIncomingRow(
      headers,
      csvRow,
      sourceDate,
    );
    if (parseReason) {
      rows.push({
        rowNumber,
        action: "unresolved",
        status: "unresolved",
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
        reason: "No exact SKU, UPC, or manufacturer part number was provided.",
        matchedItemId: null,
        incoming,
        before: null,
      });
      continue;
    }

    const matches = existingItems.filter((existing) =>
      identifiers(existing).some((candidate) =>
        incomingIdentifiers.some(
          (incomingIdentifier) =>
            incomingIdentifier.field === candidate.field &&
            incomingIdentifier.value === candidate.value,
        ),
      ),
    );
    if (matches.length > 1) {
      rows.push({
        rowNumber,
        action: "unresolved",
        status: "unresolved",
        reason:
          "Multiple catalog rows share an exact SKU, UPC, or manufacturer part number.",
        matchedItemId: null,
        incoming,
        before: null,
      });
      continue;
    }

    const match = matches[0];
    if (!match) {
      rows.push({
        rowNumber,
        action: "insert",
        status: "proposed",
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
        reason: `The supplied ${label} conflicts with the exact-matched catalog row.`,
        matchedItemId: match.id,
        incoming,
        before: importValue(match),
      });
      continue;
    }

    const mergedIncoming = mergeMissingImportValues(incoming, match);
    if (match.isContractorOwned) {
      rows.push({
        rowNumber,
        action: "skip",
        status: "skipped",
        reason: "Catalog row is contractor-owned and cannot be overwritten by an import.",
        matchedItemId: match.id,
        incoming: mergedIncoming,
        before: importValue(match),
      });
      continue;
    }

    const isCurrent = sameValue(match, mergedIncoming);
    rows.push({
      rowNumber,
      action: isCurrent ? "skip" : "update",
      status: isCurrent ? "skipped" : "proposed",
      reason: isCurrent
        ? "Exact match is already current; no change is needed."
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