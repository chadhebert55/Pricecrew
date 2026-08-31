import assert from "node:assert/strict";
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

const officialJobberBaseHeaders = [
  "Jobber Client ID",
  "Client Title",
  "Client First Name",
  "Client Last Name",
  "Client Full Name (Display Only)",
  "Client Company Name",
  "Client Is a Company? (True/False)",
  "Client Email",
  "Client Main Phone",
  "Client Home Phone",
  "Client Work Phone",
  "Client Mobile Phone",
  "Client Fax Phone",
  "Client Other Phone",
  "Client SMS Enabled Phone Number",
  "Jobber Property ID",
  "Property Street 1",
  "Property Street 2",
  "Property City",
  "Property State/Province",
  "Property Zip/Postal Code",
  "Property Country",
  "Billing Street 1",
  "Billing Street 2",
  "Billing City",
  "Billing State/Province",
  "Billing Zip/Postal Code",
  "Billing Country",
  "Client Receives Auto Visit Reminders? (True/False)",
  "Client Receives Auto Job Follow-ups? (True/False)",
  "Client Receives Auto Quote Follow-ups? (True/False)",
  "Client Receives Auto Invoice Follow-ups? (True/False)",
  "Client Receives Auto Review Requests? (True/False)",
  "Quote Number",
  "Quote Title",
  "Quote Status (Draft/Awaiting Response/Approved)",
  "Quote Message",
  "Quote Internal Note",
  "Quote Introduction Title",
  "Quote Introduction Body",
  "Quote Contract Disclaimer",
  "Quote Discount Type (Unit/Percentage)",
  "Quote Discount Amount (Unit/Percentage)",
  "Quote Deposit Type (Unit/Percentage)",
  "Quote Deposit Amount (Unit/Percentage)",
  "Quote New Tax Rate Name",
  "Quote New Tax Rate (Percentage)",
  "Quote Existing Tax Rate Name",
  "Tax Method (Inclusive/Exclusive)",
] as const;

const officialJobberLineHeaders = (lineNumber: number) => [
  `Line Item ${lineNumber} Category (Service/Product)`,
  `Line Item ${lineNumber} Name`,
  `Line Item ${lineNumber} Description`,
  `Line Item ${lineNumber} Quantity`,
  `Line Item ${lineNumber} UNIT Price`,
  `Line Item ${lineNumber} UNIT Cost`,
  `Line Item ${lineNumber} Taxable (True/False)`,
];

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
  const expectedHeaders = [
    ...officialJobberBaseHeaders,
    ...Array.from({ length: 10 }, (_, index) =>
      officialJobberLineHeaders(index + 1),
    ).flat(),
  ];
  assert.equal(headers.length, expectedHeaders.length);
  assert.equal(values.length, headers.length);
  assert.deepEqual(JOBBER_QUOTE_HEADERS, officialJobberBaseHeaders);
  assert.deepEqual(headers, expectedHeaders);

  const valueFor = (header: string) => values[headers.indexOf(header)];
  assert.equal(valueFor("Quote Status (Draft/Awaiting Response/Approved)"), "Awaiting Response");
  assert.equal(valueFor("Quote Message"), "Install safely,\r\nthen test.");
  assert.equal(valueFor("Quote Discount Type (Unit/Percentage)"), "");
  assert.equal(valueFor("Quote Discount Amount (Unit/Percentage)"), "");
  assert.equal(valueFor("Quote New Tax Rate (Percentage)"), "");
  assert.equal(valueFor("Tax Method (Inclusive/Exclusive)"), "");

  const lineItemWidth = officialJobberLineHeaders(1).length;
  const lineItemValues = (lineNumber: number) =>
    values.slice(
      officialJobberBaseHeaders.length + (lineNumber - 1) * lineItemWidth,
      officialJobberBaseHeaders.length + lineNumber * lineItemWidth,
    );
  assert.deepEqual(lineItemValues(1), [
    "Product",
    "12/2 copper cable",
    "Saved assembly category: Material; Unit: ft; Source: Saved supplier quote; Saved extended cost: $37.02",
    "3",
    "",
    "12.34",
    "",
  ]);
  assert.deepEqual(lineItemValues(2), [
    "Product",
    "Duplex receptacle",
    "Saved assembly category: Devices; Unit: ea; Source: Saved catalog; Saved extended cost: $34.00",
    "4",
    "",
    "8.50",
    "",
  ]);
  assert.deepEqual(lineItemValues(3), [
    "Service",
    "Saved quote total",
    "Exact saved final selling price; assembly rows preserve saved costs without per-line selling prices.",
    "1",
    "2345.67",
    "",
    "",
  ]);
  assert.deepEqual(lineItemValues(4), ["", "", "", "", "", "", ""]);
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