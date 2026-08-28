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

test("Jobber CSV uses current headers, preserves the saved override total, and leaves unsnapshotted values blank", () => {
  const result = buildJobberQuoteCsv(savedQuote(), validMapping);
  assert.deepEqual(result.issues, []);
  assert.ok(result.csv);

  const [headers, values] = parseCsvRows(result.csv);
  assert.ok(headers);
  assert.ok(values);
  assert.equal(headers.length, JOBBER_QUOTE_HEADERS.length + 70);
  assert.equal(values.length, headers.length);
  assert.deepEqual(JOBBER_QUOTE_HEADERS, officialJobberBaseHeaders);
  assert.deepEqual(
    headers.slice(0, officialJobberBaseHeaders.length),
    [...officialJobberBaseHeaders],
  );
  assert.equal(
    headers.at(-2),
    "Line Item 10 UNIT Cost",
  );
  assert.equal(
    headers.at(-1),
    "Line Item 10 Taxable (True/False)",
  );

  const valueFor = (header: string) => values[headers.indexOf(header)];
  assert.equal(valueFor("Quote Status (Draft/Awaiting Response/Approved)"), "Awaiting Response");
  assert.equal(valueFor("Quote Message"), "Install safely,\r\nthen test.");
  assert.equal(valueFor("Quote Discount Type (Unit/Percentage)"), "");
  assert.equal(valueFor("Quote Discount Amount (Unit/Percentage)"), "");
  assert.equal(valueFor("Quote New Tax Rate (Percentage)"), "");
  assert.equal(valueFor("Tax Method (Inclusive/Exclusive)"), "");
  assert.equal(valueFor("Line Item 1 UNIT Price"), "");
  assert.equal(valueFor("Line Item 1 UNIT Cost"), "12.34");
  assert.match(valueFor("Line Item 1 Description") ?? "", /Saved extended cost: \$37\.02/);
  assert.equal(valueFor("Line Item 2 Name"), "Saved quote total");
  assert.equal(valueFor("Line Item 2 UNIT Price"), "2345.67");
  assert.equal(valueFor("Line Item 2 UNIT Cost"), "");
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