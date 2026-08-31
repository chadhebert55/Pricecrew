import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { QuoteExportMapping } from "@workspace/api-zod";
import {
  buildHousecallProQuoteCsv,
  buildJobberQuoteCsv,
  buildQuickBooksQuoteCsv,
  HOUSECALL_PRO_JOB_HEADERS,
  JOBBER_QUOTE_HEADERS,
  MAX_JOBBER_ASSEMBLY_LINES,
  preflightHousecallProQuoteExport,
  preflightJobberQuoteExport,
  preflightQuickBooksQuoteExport,
  QUICKBOOKS_INVOICE_HEADERS,
} from "./quote-export";

type SavedQuote = Parameters<typeof buildJobberQuoteCsv>[0];

function savedQuote(overrides: Partial<SavedQuote> = {}): SavedQuote {
  const finalSellingPrice = 2345.67;
  return {
    id: 42,
    companyId: 7,
    customerId: null,
    quoteNumber: "Q-0042",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    projectName: "Kitchen, lighting \"upgrade\"",
    module: "KITCHEN",
    status: "ready",
    jobInputs: { notes: "snapshot only" },
    assembly: [
      {
        id: "wire",
        category: "Material",
        description: "12/2 copper cable",
        quantity: 3,
        unit: "ft",
        unitCost: 12.34,
        extendedCost: 37.02,
        source: "Saved supplier quote",
      },
    ],
    pricing: {
      materialCost: 37.02,
      laborCost: 100,
      materialMarkup: 0.2,
      calculatedSellingPrice: 300,
      finalSellingPrice,
      laborOverride: null,
      sellingPriceOverride: finalSellingPrice,
      grossProfit: 2208.65,
      grossMargin: 0.94,
      pricingWarnings: [],
    },
    proposalDescription: "Install safely,\r\nthen test.",
    total: finalSellingPrice,
    margin: 0.94,
    sourceQuoteId: null,
    revisionNumber: 0,
    createdAt: new Date("2026-08-01T12:00:00Z"),
    updatedAt: new Date("2026-08-02T12:00:00Z"),
    ...overrides,
  } as SavedQuote;
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\r" || character === "\n") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  return rows;
}

const validMapping: QuoteExportMapping = {
  propertyStreet1: "123 Main St",
  propertyCity: "Boston",
  propertyStateProvince: "MA",
  propertyZipPostalCode: "02108",
  propertyCountry: "United States",
};

type JobberImportFixture = {
  provider: string;
  document: string;
  format: string;
  contractVersion: number;
  source: string;
  reviewedOn: string;
  maxLineItems: number;
  baseHeaders: string[];
  lineItemHeaderTemplates: string[];
  requiredMappings: Array<{ name: string; headers: string[] }>;
  lineItemRules: {
    categories: string[];
    requiredFields: string[];
    savedTotalName: string;
  };
};

const jobberImportFixture = JSON.parse(
  readFileSync(
    new URL("./jobber-quote-import.fixture.json", import.meta.url),
    "utf8",
  ),
) as JobberImportFixture;

function jobberLineHeaders(lineNumber: number) {
  return jobberImportFixture.lineItemHeaderTemplates.map((header) =>
    header.replace("{lineNumber}", String(lineNumber)),
  );
}

function assertJobberImportCompatibility(
  csv: string,
  expected: {
    assembly: Array<{
      description: string;
      category: string;
      quantity: number;
      unitCost: number;
      unit: string;
      source: string;
      extendedCost: number;
    }>;
    finalSellingPrice: number;
  },
) {
  const [headers, values] = parseCsvRows(csv);
  assert.ok(headers, "Jobber import incompatible: CSV has no header row.");
  assert.ok(values, "Jobber import incompatible: CSV has no data row.");
  const expectedHeaders = [
    ...jobberImportFixture.baseHeaders,
    ...Array.from({ length: jobberImportFixture.maxLineItems }, (_, index) =>
      jobberLineHeaders(index + 1),
    ).flat(),
  ];
  assert.equal(
    headers.length,
    expectedHeaders.length,
    `Jobber import incompatible: expected ${expectedHeaders.length} headers from the ${jobberImportFixture.source} (contract v${jobberImportFixture.contractVersion}), received ${headers.length}.`,
  );
  headers.forEach((header, index) => {
    assert.equal(
      header,
      expectedHeaders[index],
      `Jobber import incompatible header at column ${index + 1}: expected "${expectedHeaders[index]}", received "${header}".`,
    );
  });
  assert.equal(
    values.length,
    headers.length,
    "Jobber import incompatible: data row width does not match the provider header row.",
  );

  const valueFor = (header: string) => values[headers.indexOf(header)] ?? "";
  for (const requirement of jobberImportFixture.requiredMappings) {
    const presentHeaders = requirement.headers.filter((header) =>
      headers.includes(header),
    );
    assert.ok(
      presentHeaders.length > 0,
      `Jobber import incompatible field "${requirement.name}": none of the required headers (${requirement.headers.join(", ")}) are present.`,
    );
    assert.ok(
      presentHeaders.some((header) => valueFor(header).trim().length > 0),
      `Jobber import incompatible field "${requirement.name}": at least one of ${presentHeaders.join(", ")} must contain a mapped value.`,
    );
  }

  const lineItemWidth = jobberImportFixture.lineItemHeaderTemplates.length;
  const lineItemValues = (lineNumber: number) =>
    values.slice(
      jobberImportFixture.baseHeaders.length + (lineNumber - 1) * lineItemWidth,
      jobberImportFixture.baseHeaders.length + lineNumber * lineItemWidth,
    );
  const lineItemValueFor = (lineNumber: number, field: string) =>
    lineItemValues(lineNumber)[
      jobberLineHeaders(lineNumber).findIndex((header) =>
        header.includes(` ${field}`),
      )
    ] ?? "";
  const expectedLine = (lineNumber: number) => {
    const line = expected.assembly[lineNumber - 1]!;
    return [
      "Product",
      line.description,
      `Saved assembly category: ${line.category}; Unit: ${line.unit}; Source: ${line.source}; Saved extended cost: $${line.extendedCost.toFixed(2)}`,
      String(line.quantity),
      "",
      line.unitCost.toFixed(2),
      "",
    ];
  };

  expected.assembly.forEach((line, index) => {
    const lineNumber = index + 1;
    const category = lineItemValueFor(lineNumber, "Category");
    assert.ok(
      jobberImportFixture.lineItemRules.categories.includes(category),
      `Jobber import incompatible field "Line Item ${lineNumber} Category": "${category}" is not a documented Jobber category.`,
    );
    assert.deepEqual(
      lineItemValues(lineNumber),
      expectedLine(lineNumber),
      `Jobber import incompatible line item ${lineNumber}: saved assembly fields are not in the documented columns.`,
    );
    for (const requiredField of jobberImportFixture.lineItemRules
      .requiredFields) {
      assert.ok(
        lineItemValueFor(lineNumber, requiredField).trim().length > 0,
        `Jobber import incompatible field "Line Item ${lineNumber} ${requiredField}": saved assembly value is blank.`,
      );
    }
  });

  const totalLineNumber = expected.assembly.length + 1;
  assert.deepEqual(
    lineItemValues(totalLineNumber),
    [
      "Service",
      jobberImportFixture.lineItemRules.savedTotalName,
      "Exact saved final selling price; assembly rows preserve saved costs without per-line selling prices.",
      "1",
      expected.finalSellingPrice.toFixed(2),
      "",
      "",
    ],
    `Jobber import incompatible field "Line Item ${totalLineNumber}": the exact saved total must follow the saved assembly rows.`,
  );
  for (
    let lineNumber = totalLineNumber + 1;
    lineNumber <= jobberImportFixture.maxLineItems;
    lineNumber += 1
  ) {
    assert.deepEqual(
      lineItemValues(lineNumber),
      ["", "", "", "", "", "", ""],
      `Jobber import incompatible line item ${lineNumber}: unexpected data appears after the saved total row.`,
    );
  }
}

test("Jobber CSV locks documented columns, assembly rows, and the saved total row", () => {
  const result = buildJobberQuoteCsv(
    savedQuote({
      assembly: [
        ...savedQuote().assembly,
        {
          id: "receptacle",
          category: "Devices",
          description: "Duplex receptacle",
          quantity: 4,
          unit: "ea",
          unitCost: 8.5,
          extendedCost: 34,
          source: "Saved catalog",
        },
      ],
    }),
    validMapping,
  );
  assert.deepEqual(result.issues, []);
  assert.ok(result.csv);

  const [headers, values] = parseCsvRows(result.csv);
  assert.ok(headers);
  assert.ok(values);
  assert.deepEqual(JOBBER_QUOTE_HEADERS, jobberImportFixture.baseHeaders);
  assertJobberImportCompatibility(result.csv, {
    assembly: [
      ...savedQuote().assembly,
      {
        id: "receptacle",
        category: "Devices",
        description: "Duplex receptacle",
        quantity: 4,
        unit: "ea",
        unitCost: 8.5,
        extendedCost: 34,
        source: "Saved catalog",
      },
    ],
    finalSellingPrice: 2345.67,
  });

  const valueFor = (header: string) => values[headers.indexOf(header)];
  assert.equal(
    valueFor("Quote Status (Draft/Awaiting Response/Approved)"),
    "Awaiting Response",
  );
  assert.equal(valueFor("Quote Message"), "Install safely,\r\nthen test.");
  assert.equal(valueFor("Quote Discount Type (Unit/Percentage)"), "");
  assert.equal(valueFor("Quote Discount Amount (Unit/Percentage)"), "");
  assert.equal(valueFor("Quote New Tax Rate (Percentage)"), "");
  assert.equal(valueFor("Tax Method (Inclusive/Exclusive)"), "");
});

test("Jobber CSV escapes delimiters and neutralizes spreadsheet formulas", () => {
  const result = buildJobberQuoteCsv(
    savedQuote({ projectName: " =HYPERLINK(\"bad\")" }),
    { ...validMapping, clientCompanyName: "@Danger, Inc." },
  );
  assert.ok(result.csv);
  const [headers, values] = parseCsvRows(result.csv);
  assert.ok(headers);
  assert.ok(values);
  assert.equal(
    values[headers.indexOf("Quote Title")],
    "' =HYPERLINK(\"bad\")",
  );
  assert.equal(
    values[headers.indexOf("Client Company Name")],
    "'@Danger, Inc.",
  );
});

test("Jobber mapping supports explicit email clearing and consistent display identity", () => {
  const result = buildJobberQuoteCsv(savedQuote(), {
    ...validMapping,
    clientFirstName: "Grace",
    clientLastName: "Hopper",
    clientEmail: "",
  });
  assert.ok(result.csv);
  const [headers, values] = parseCsvRows(result.csv);
  assert.ok(headers);
  assert.ok(values);
  assert.equal(values[headers.indexOf("Client Email")], "");
  assert.equal(
    values[headers.indexOf("Client Full Name (Display Only)")],
    "Grace Hopper",
  );
});

test("Jobber preflight returns actionable identity, property, quote, and pricing issues", () => {
  const quote = savedQuote({
    customerName: " ",
    customerEmail: "not-an-email",
    total: 1,
  });
  const issues = preflightJobberQuoteExport(quote, {});
  const codes = new Set(issues.map((entry) => entry.code));
  assert.ok(codes.has("CLIENT_IDENTITY_REQUIRED"));
  assert.ok(codes.has("CLIENT_EMAIL_INVALID"));
  assert.ok(codes.has("PROPERTY_REQUIRED"));
  assert.ok(codes.has("SAVED_TOTAL_MISMATCH"));
  assert.ok(issues.every((entry) => entry.field && entry.message));
});

test("all exports block active zero-cost materials unless intentionally excluded", () => {
  const zeroCostLine = {
    ...savedQuote().assembly[0]!,
    description: "Customer-selected fixture",
    unitCost: 0,
    extendedCost: 0,
  };
  const unresolved = savedQuote({ assembly: [zeroCostLine] });
  const preflights = [
    preflightJobberQuoteExport(unresolved, validMapping),
    preflightQuickBooksQuoteExport(unresolved, {
      quickBooksCustomer: "Ada Lovelace",
      quickBooksInvoiceDate: "2026-08-30",
      quickBooksDueDate: "2026-08-30",
    }),
    preflightHousecallProQuoteExport(unresolved, {}),
  ];
  for (const issues of preflights) {
    assert.ok(issues.some((entry) => entry.code === "UNRESOLVED_MATERIAL_COST"));
  }

  const intentionallyExcluded = savedQuote({
    assembly: [{
      ...zeroCostLine,
      intentionalExclusionReason: "Customer is purchasing this fixture directly.",
    }],
  });
  assert.equal(
    preflightJobberQuoteExport(intentionallyExcluded, validMapping).some(
      (entry) => entry.code === "UNRESOLVED_MATERIAL_COST",
    ),
    false,
  );
});

test("all exports block saved error-level pricing warnings", () => {
  const quote = savedQuote({
    pricing: {
      ...savedQuote().pricing,
      pricingWarnings: [{
        code: "MISSING_CATALOG_PRICE",
        severity: "error",
        category: "missing-price",
        message: "A required catalog price is missing.",
        source: "Saved quote pricing snapshot",
        context: {},
      }],
    },
  });
  assert.ok(
    preflightJobberQuoteExport(quote, validMapping).some(
      (entry) => entry.code === "BLOCKING_PRICING_WARNINGS",
    ),
  );
  assert.ok(
    preflightQuickBooksQuoteExport(quote, {
      quickBooksCustomer: "Ada Lovelace",
      quickBooksInvoiceDate: "2026-08-30",
      quickBooksDueDate: "2026-08-30",
    }).some((entry) => entry.code === "BLOCKING_PRICING_WARNINGS"),
  );
});

test("Jobber preflight enforces the available assembly-line limit and line constraints", () => {
  const templateLine = savedQuote().assembly[0]!;
  const assembly = Array.from(
    { length: MAX_JOBBER_ASSEMBLY_LINES + 1 },
    (_, index) => ({
      ...templateLine,
      id: `line-${index}`,
      quantity: index === 0 ? 0 : 1,
    }),
  );
  const issues = preflightJobberQuoteExport(savedQuote({ assembly }), validMapping);
  assert.ok(issues.some((entry) => entry.code === "LINE_ITEM_LIMIT"));
  assert.ok(issues.some((entry) => entry.code === "LINE_QUANTITY_INVALID"));
});

test("QuickBooks Online V1 invoice CSV locks official required headers and preserves the saved override total", () => {
  const result = buildQuickBooksQuoteCsv(savedQuote(), {
    quickBooksCustomer: "Ada Lovelace",
    quickBooksInvoiceDate: "2026-08-02",
    quickBooksDueDate: "2026-09-01",
  });
  assert.deepEqual(result.issues, []);
  assert.ok(result.csv);
  const [headers, values] = parseCsvRows(result.csv);
  assert.deepEqual(headers, [...QUICKBOOKS_INVOICE_HEADERS]);
  assert.deepEqual(headers, [
    "Invoice number",
    "Customer",
    "Invoice date",
    "Due date",
    "Item amount",
  ]);
  assert.equal(values?.[headers!.indexOf("Item amount")], "2345.67");
  assert.equal(values?.[headers!.indexOf("Customer")], "Ada Lovelace");
});

test("QuickBooks Online preflight requires documented customer and date mappings", () => {
  const issues = preflightQuickBooksQuoteExport(
    savedQuote({ customerName: " " }),
    {
      quickBooksInvoiceDate: "2026-08-03",
      quickBooksDueDate: "2026-08-02",
    },
  );
  const codes = new Set(issues.map((entry) => entry.code));
  assert.ok(codes.has("QUICKBOOKS_CUSTOMER_REQUIRED"));
  assert.ok(codes.has("QUICKBOOKS_DUE_DATE_BEFORE_INVOICE"));
});

test("Housecall Pro V1 jobs CSV locks documented headers and accepted customer type while preserving the saved total", () => {
  const result = buildHousecallProQuoteCsv(savedQuote(), {
    clientCompanyName: "Analytical Engines LLC",
    clientEmail: "ada@example.com",
    housecallCustomerId: "customer-42",
    housecallJobId: "job-42",
    propertyStreet1: "123 Main St",
    propertyCity: "Boston",
    propertyStateProvince: "MA",
    propertyZipPostalCode: "02108",
  });
  assert.deepEqual(result.issues, []);
  assert.ok(result.csv);
  const [headers, values] = parseCsvRows(result.csv);
  assert.deepEqual(headers, [...HOUSECALL_PRO_JOB_HEADERS]);
  assert.equal(values?.[headers!.indexOf("Type")], "business");
  assert.equal(values?.[headers!.indexOf("Subtotal")], "2345.67");
  assert.equal(values?.[headers!.indexOf("Tax")], "");
  assert.equal(values?.[headers!.indexOf("Payment amount")], "");
});

test("Housecall Pro preflight enforces documented identity, ID, and phone constraints", () => {
  const issues = preflightHousecallProQuoteExport(
    savedQuote({ customerName: " ", customerEmail: null }),
    {
      housecallCustomerId: "x".repeat(192),
      clientMobilePhone: "123",
    },
  );
  const codes = new Set(issues.map((entry) => entry.code));
  assert.ok(codes.has("HOUSECALL_CUSTOMER_ID_TOO_LONG"));
  assert.ok(codes.has("HOUSECALL_PHONE_INVALID"));
});