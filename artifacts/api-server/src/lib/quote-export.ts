import type {
  QuoteExportMapping,
  QuoteExportPreflightIssue,
} from "@workspace/api-zod";
import { quotesTable, type AssemblyLineRecord } from "@workspace/db";

export const JOBBER_DESTINATION = "jobber" as const;
export const JOBBER_CSV_FORMAT = "csv" as const;
export const JOBBER_CSV_VERSION = 1 as const;
export const QUICKBOOKS_DESTINATION = "quickbooks" as const;
export const QUICKBOOKS_CSV_FORMAT = "csv" as const;
export const QUICKBOOKS_INVOICE_CSV_VERSION = 1 as const;
export const HOUSECALL_PRO_DESTINATION = "housecall_pro" as const;
export const HOUSECALL_PRO_CSV_FORMAT = "csv" as const;
export const HOUSECALL_PRO_JOBS_CSV_VERSION = 1 as const;
export const MAX_JOBBER_LINE_ITEMS = 10;
export const MAX_JOBBER_ASSEMBLY_LINES = MAX_JOBBER_LINE_ITEMS - 1;

export const QUICKBOOKS_INVOICE_HEADERS = [
  "Invoice number",
  "Customer",
  "Invoice date",
  "Due date",
  "Item amount",
] as const;

export const HOUSECALL_PRO_JOB_HEADERS = [
  "Customer ID",
  "Display name",
  "First name",
  "Last name",
  "Company",
  "Service address",
  "Billing address",
  "Mobile number",
  "Home number",
  "Work number",
  "Emails",
  "Customer notes",
  "Tags",
  "Type",
  "Notifications enabled",
  "Is a contractor",
  "Invoice number",
  "Job ID",
  "First line item description",
  "Notes",
  "Subtotal",
  "Tax",
  "Payment amount",
  "Payment method type",
  "Payment notes",
] as const;

export const JOBBER_QUOTE_HEADERS = [
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

const JOBBER_LINE_HEADERS = (lineNumber: number) => [
  `Line Item ${lineNumber} Category (Service/Product)`,
  `Line Item ${lineNumber} Name`,
  `Line Item ${lineNumber} Description`,
  `Line Item ${lineNumber} Quantity`,
  `Line Item ${lineNumber} UNIT Price`,
  `Line Item ${lineNumber} UNIT Cost`,
  `Line Item ${lineNumber} Taxable (True/False)`,
];

type QuoteRecord = typeof quotesTable.$inferSelect;

type ResolvedMapping = {
  clientFirstName: string;
  clientLastName: string;
  clientCompanyName: string;
  clientIsCompany: string;
  clientDisplayName: string;
  clientEmail: string;
  jobberClientId: string;
  jobberPropertyId: string;
  quickBooksCustomer: string;
  quickBooksInvoiceDate: string;
  quickBooksDueDate: string;
  housecallCustomerId: string;
  housecallJobId: string;
  [key: string]: string;
};

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function mappingText(
  mapping: QuoteExportMapping,
  key: keyof QuoteExportMapping,
) {
  const value = mapping[key];
  return typeof value === "string" ? value.trim() : "";
}

function splitCustomerName(name: string) {
  const parts = text(name).split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? "",
    last: parts.slice(1).join(" "),
  };
}

function resolveMapping(
  quote: QuoteRecord,
  mapping: QuoteExportMapping,
): ResolvedMapping {
  const name = splitCustomerName(quote.customerName);
  const companyName = mappingText(mapping, "clientCompanyName");
  const firstName =
    mappingText(mapping, "clientFirstName") || (companyName ? "" : name.first);
  const lastName =
    mappingText(mapping, "clientLastName") || (companyName ? "" : name.last);
  const clientEmail = Object.prototype.hasOwnProperty.call(mapping, "clientEmail")
    ? mappingText(mapping, "clientEmail")
    : text(quote.customerEmail);
  const clientDisplayName =
    companyName || [firstName, lastName].filter(Boolean).join(" ");

  return {
    ...Object.fromEntries(
      Object.keys(mapping).map((key) => [
        key,
        mappingText(mapping, key as keyof QuoteExportMapping),
      ]),
    ),
    clientFirstName: firstName,
    clientLastName: lastName,
    clientCompanyName: companyName,
    clientIsCompany: companyName ? "TRUE" : firstName ? "FALSE" : "",
    clientDisplayName,
    clientEmail,
    jobberClientId: mappingText(mapping, "jobberClientId"),
    jobberPropertyId: mappingText(mapping, "jobberPropertyId"),
    quickBooksCustomer: mappingText(mapping, "quickBooksCustomer"),
    quickBooksInvoiceDate: mappingText(mapping, "quickBooksInvoiceDate"),
    quickBooksDueDate: mappingText(mapping, "quickBooksDueDate"),
    housecallCustomerId: mappingText(mapping, "housecallCustomerId"),
    housecallJobId: mappingText(mapping, "housecallJobId"),
  };
}

function issue(
  code: string,
  field: string,
  message: string,
): QuoteExportPreflightIssue {
  return { code, field, message };
}

function isFiniteAmount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function cents(value: number) {
  return Math.round(value * 100);
}

export function preflightJobberQuoteExport(
  quote: QuoteRecord,
  mapping: QuoteExportMapping,
): QuoteExportPreflightIssue[] {
  const resolved = resolveMapping(quote, mapping);
  const issues: QuoteExportPreflightIssue[] = [];

  if (
    !resolved.jobberClientId &&
    !resolved.clientFirstName &&
    !resolved.clientCompanyName
  ) {
    issues.push(
      issue(
        "CLIENT_IDENTITY_REQUIRED",
        "mapping.clientFirstName",
        "Provide a Jobber Client ID, a client first name, or a client company name.",
      ),
    );
  }
  if (
    resolved.clientEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolved.clientEmail)
  ) {
    issues.push(
      issue(
        "CLIENT_EMAIL_INVALID",
        "mapping.clientEmail",
        "Enter a valid client email address or clear this optional field.",
      ),
    );
  }
  if (!resolved.jobberPropertyId && !resolved.propertyStreet1) {
    issues.push(
      issue(
        "PROPERTY_REQUIRED",
        "mapping.propertyStreet1",
        "Provide a Jobber Property ID or Property Street 1 so Jobber can link the quote to a property.",
      ),
    );
  }
  if (!text(quote.quoteNumber)) {
    issues.push(
      issue(
        "QUOTE_NUMBER_REQUIRED",
        "quoteNumber",
        "The saved quote number is missing and must be repaired before export.",
      ),
    );
  }
  if (!text(quote.projectName)) {
    issues.push(
      issue(
        "QUOTE_TITLE_REQUIRED",
        "projectName",
        "The saved project name is missing and must be repaired before export.",
      ),
    );
  }
  const finalSellingPrice = quote.pricing?.finalSellingPrice;
  if (!isFiniteAmount(finalSellingPrice)) {
    issues.push(
      issue(
        "FINAL_PRICE_INVALID",
        "pricing.finalSellingPrice",
        "The saved final selling price is missing or invalid; save a valid quote before exporting.",
      ),
    );
  }
  if (!isFiniteAmount(quote.total)) {
    issues.push(
      issue(
        "QUOTE_TOTAL_INVALID",
        "total",
        "The saved quote total is missing or invalid; this quote cannot be exported safely.",
      ),
    );
  } else if (
    isFiniteAmount(finalSellingPrice) &&
    cents(quote.total) !== cents(finalSellingPrice)
  ) {
    issues.push(
      issue(
        "SAVED_TOTAL_MISMATCH",
        "total",
        "The saved quote total does not match its saved final selling price. No recalculation was performed; repair the quote before exporting.",
      ),
    );
  }
  if (!Array.isArray(quote.assembly)) {
    issues.push(
      issue(
        "ASSEMBLY_INVALID",
        "assembly",
        "The saved assembly is invalid and cannot be represented in a Jobber CSV.",
      ),
    );
    return issues;
  }
  if (quote.assembly.length > MAX_JOBBER_ASSEMBLY_LINES) {
    issues.push(
      issue(
        "LINE_ITEM_LIMIT",
        "assembly",
        `Jobber accepts at most ${MAX_JOBBER_LINE_ITEMS} line items. This export reserves one line for the exact saved quote total, so reduce the saved assembly to ${MAX_JOBBER_ASSEMBLY_LINES} lines.`,
      ),
    );
  }
  quote.assembly.forEach((line, index) => {
    if (!text(line.description)) {
      issues.push(
        issue(
          "LINE_DESCRIPTION_REQUIRED",
          `assembly[${index}].description`,
          `Assembly line ${index + 1} is missing a description.`,
        ),
      );
    }
    if (
      typeof line.quantity !== "number" ||
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0
    ) {
      issues.push(
        issue(
          "LINE_QUANTITY_INVALID",
          `assembly[${index}].quantity`,
          `Assembly line ${index + 1} must have a positive numeric quantity.`,
        ),
      );
    }
    if (!isFiniteAmount(line.unitCost) || !isFiniteAmount(line.extendedCost)) {
      issues.push(
        issue(
          "LINE_COST_INVALID",
          `assembly[${index}].unitCost`,
          `Assembly line ${index + 1} has a missing or invalid saved cost.`,
        ),
      );
    }
  });

  return issues;
}

function jobberCategory(line: AssemblyLineRecord) {
  return /labor|service|install/i.test(`${line.category} ${line.description}`)
    ? "Service"
    : "Product";
}

function savedAssemblyLine(line: AssemblyLineRecord) {
  return [
    jobberCategory(line),
    line.description,
    [
      `Saved assembly category: ${line.category || "Uncategorized"}`,
      `Unit: ${line.unit || "each"}`,
      `Source: ${line.source || "Saved quote snapshot"}`,
      `Saved extended cost: $${line.extendedCost.toFixed(2)}`,
    ].join("; "),
    line.quantity.toString(),
    "",
    line.unitCost.toFixed(2),
    "",
  ];
}

function savedTotalLine(quote: QuoteRecord) {
  return [
    "Service",
    "Saved quote total",
    "Exact saved final selling price; assembly rows preserve saved costs without per-line selling prices.",
    "1",
    quote.pricing.finalSellingPrice.toFixed(2),
    "",
    "",
  ];
}

function csvCell(value: string | number | null | undefined) {
  let normalized = value == null ? "" : String(value);
  // Quoting protects delimiters, while the apostrophe prevents spreadsheet
  // programs from evaluating imported text as a formula.
  if (/^\s*[=+\-@]/.test(normalized)) normalized = `'${normalized}`;
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function jobberCsvCell(value: string | number | null | undefined) {
  return csvCell(value);
}

export function buildJobberQuoteCsv(
  quote: QuoteRecord,
  mapping: QuoteExportMapping,
) {
  const issues = preflightJobberQuoteExport(quote, mapping);
  if (issues.length > 0) {
    return { issues, csv: null as string | null };
  }

  const resolved = resolveMapping(quote, mapping);
  const values: Array<string | number | null | undefined> = [
    resolved.jobberClientId,
    resolved.clientTitle,
    resolved.clientFirstName,
    resolved.clientLastName,
    resolved.clientDisplayName,
    resolved.clientCompanyName,
    resolved.clientIsCompany,
    resolved.clientEmail,
    resolved.clientMainPhone,
    resolved.clientHomePhone,
    resolved.clientWorkPhone,
    resolved.clientMobilePhone,
    resolved.clientFaxPhone,
    resolved.clientOtherPhone,
    resolved.clientSmsEnabledPhoneNumber,
    resolved.jobberPropertyId,
    resolved.propertyStreet1,
    resolved.propertyStreet2,
    resolved.propertyCity,
    resolved.propertyStateProvince,
    resolved.propertyZipPostalCode,
    resolved.propertyCountry,
    resolved.billingStreet1,
    resolved.billingStreet2,
    resolved.billingCity,
    resolved.billingStateProvince,
    resolved.billingZipPostalCode,
    resolved.billingCountry,
    "",
    "",
    "",
    "",
    "",
    quote.quoteNumber,
    quote.projectName,
    quote.status.toLowerCase() === "ready" ? "Awaiting Response" : "Draft",
    quote.proposalDescription,
    "",
    "",
    "",
    "",
    // Tax, discount, and deposit data are not captured in the saved snapshot.
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  const headers: string[] = [...JOBBER_QUOTE_HEADERS];
  for (let lineNumber = 1; lineNumber <= MAX_JOBBER_LINE_ITEMS; lineNumber += 1) {
    headers.push(...JOBBER_LINE_HEADERS(lineNumber));
    const line =
      lineNumber <= quote.assembly.length
        ? savedAssemblyLine(quote.assembly[lineNumber - 1]!)
        : lineNumber === quote.assembly.length + 1
          ? savedTotalLine(quote)
          : ["", "", "", "", "", "", ""];
    values.push(...line);
  }

  return {
    issues: [] as QuoteExportPreflightIssue[],
    csv:
      [headers, values]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n") + "\r\n",
  };
}

function savedQuoteIssues(quote: QuoteRecord) {
  const issues: QuoteExportPreflightIssue[] = [];
  if (!text(quote.quoteNumber)) {
    issues.push(
      issue(
        "QUOTE_NUMBER_REQUIRED",
        "quoteNumber",
        "The saved quote number is missing and must be repaired before export.",
      ),
    );
  }
  if (!text(quote.projectName)) {
    issues.push(
      issue(
        "QUOTE_TITLE_REQUIRED",
        "projectName",
        "The saved project name is missing and must be repaired before export.",
      ),
    );
  }
  const finalSellingPrice = quote.pricing?.finalSellingPrice;
  if (!isFiniteAmount(finalSellingPrice)) {
    issues.push(
      issue(
        "FINAL_PRICE_INVALID",
        "pricing.finalSellingPrice",
        "The saved final selling price is missing or invalid; save a valid quote before exporting.",
      ),
    );
  }
  if (!isFiniteAmount(quote.total)) {
    issues.push(
      issue(
        "QUOTE_TOTAL_INVALID",
        "total",
        "The saved quote total is missing or invalid; this quote cannot be exported safely.",
      ),
    );
  } else if (
    isFiniteAmount(finalSellingPrice) &&
    cents(quote.total) !== cents(finalSellingPrice)
  ) {
    issues.push(
      issue(
        "SAVED_TOTAL_MISMATCH",
        "total",
        "The saved quote total does not match its saved final selling price. No recalculation was performed; repair the quote before exporting.",
      ),
    );
  }
  return issues;
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function preflightQuickBooksQuoteExport(
  quote: QuoteRecord,
  mapping: QuoteExportMapping,
) {
  const resolved = resolveMapping(quote, mapping);
  const issues = savedQuoteIssues(quote);
  const customer = resolved.quickBooksCustomer || resolved.clientDisplayName;
  if (!customer) {
    issues.push(
      issue(
        "QUICKBOOKS_CUSTOMER_REQUIRED",
        "mapping.quickBooksCustomer",
        "Provide the QuickBooks customer name exactly as it appears in QuickBooks Online.",
      ),
    );
  }
  if (!validIsoDate(resolved.quickBooksInvoiceDate)) {
    issues.push(
      issue(
        "QUICKBOOKS_INVOICE_DATE_REQUIRED",
        "mapping.quickBooksInvoiceDate",
        "Provide an invoice date in YYYY-MM-DD format.",
      ),
    );
  }
  if (!validIsoDate(resolved.quickBooksDueDate)) {
    issues.push(
      issue(
        "QUICKBOOKS_DUE_DATE_REQUIRED",
        "mapping.quickBooksDueDate",
        "Provide a due date in YYYY-MM-DD format.",
      ),
    );
  }
  if (
    validIsoDate(resolved.quickBooksInvoiceDate) &&
    validIsoDate(resolved.quickBooksDueDate) &&
    resolved.quickBooksDueDate < resolved.quickBooksInvoiceDate
  ) {
    issues.push(
      issue(
        "QUICKBOOKS_DUE_DATE_BEFORE_INVOICE",
        "mapping.quickBooksDueDate",
        "The QuickBooks due date cannot be before the invoice date.",
      ),
    );
  }
  return issues;
}

export function buildQuickBooksQuoteCsv(
  quote: QuoteRecord,
  mapping: QuoteExportMapping,
) {
  const issues = preflightQuickBooksQuoteExport(quote, mapping);
  if (issues.length > 0) return { issues, csv: null as string | null };
  const resolved = resolveMapping(quote, mapping);
  const values = [
    quote.quoteNumber,
    resolved.quickBooksCustomer || resolved.clientDisplayName,
    resolved.quickBooksInvoiceDate,
    resolved.quickBooksDueDate,
    quote.pricing.finalSellingPrice.toFixed(2),
  ];
  return {
    issues: [] as QuoteExportPreflightIssue[],
    csv:
      [[...QUICKBOOKS_INVOICE_HEADERS], values]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n") + "\r\n",
  };
}

function combinedAddress(resolved: ResolvedMapping, prefix: "property" | "billing") {
  return [
    resolved[`${prefix}Street1`],
    resolved[`${prefix}Street2`],
    resolved[`${prefix}City`],
    resolved[`${prefix}StateProvince`],
    resolved[`${prefix}ZipPostalCode`],
    resolved[`${prefix}Country`],
  ]
    .filter(Boolean)
    .join(", ");
}

function validHousecallPhone(value: string) {
  if (!value) return true;
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

export function preflightHousecallProQuoteExport(
  quote: QuoteRecord,
  mapping: QuoteExportMapping,
) {
  const resolved = resolveMapping(quote, mapping);
  const issues = savedQuoteIssues(quote);
  if (
    !resolved.housecallCustomerId &&
    !resolved.clientDisplayName &&
    !resolved.clientEmail
  ) {
    issues.push(
      issue(
        "HOUSECALL_CUSTOMER_IDENTITY_REQUIRED",
        "mapping.clientFirstName",
        "Provide a Housecall Pro Customer ID, customer name, company, or email.",
      ),
    );
  }
  if (resolved.housecallCustomerId.length > 191) {
    issues.push(
      issue(
        "HOUSECALL_CUSTOMER_ID_TOO_LONG",
        "mapping.housecallCustomerId",
        "Housecall Pro Customer ID must be 191 characters or fewer.",
      ),
    );
  }
  if (resolved.housecallJobId.length > 191) {
    issues.push(
      issue(
        "HOUSECALL_JOB_ID_TOO_LONG",
        "mapping.housecallJobId",
        "Housecall Pro Job ID must be 191 characters or fewer.",
      ),
    );
  }
  if (resolved.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolved.clientEmail)) {
    issues.push(
      issue(
        "CLIENT_EMAIL_INVALID",
        "mapping.clientEmail",
        "Enter a valid customer email address or clear this optional field.",
      ),
    );
  }
  (
    [
      ["clientMobilePhone", resolved.clientMobilePhone],
      ["clientHomePhone", resolved.clientHomePhone],
      ["clientWorkPhone", resolved.clientWorkPhone],
    ] as const
  ).forEach(([field, value]) => {
    if (!validHousecallPhone(value)) {
      issues.push(
        issue(
          "HOUSECALL_PHONE_INVALID",
          `mapping.${field}`,
          "Housecall Pro phone numbers must contain 10 or 11 digits.",
        ),
      );
    }
  });
  return issues;
}

export function buildHousecallProQuoteCsv(
  quote: QuoteRecord,
  mapping: QuoteExportMapping,
) {
  const issues = preflightHousecallProQuoteExport(quote, mapping);
  if (issues.length > 0) return { issues, csv: null as string | null };
  const resolved = resolveMapping(quote, mapping);
  const values = [
    resolved.housecallCustomerId,
    resolved.clientDisplayName,
    resolved.clientFirstName,
    resolved.clientLastName,
    resolved.clientCompanyName,
    combinedAddress(resolved, "property"),
    combinedAddress(resolved, "billing"),
    resolved.clientMobilePhone,
    resolved.clientHomePhone,
    resolved.clientWorkPhone,
    resolved.clientEmail,
    "",
    "",
    resolved.clientCompanyName ? "business" : "homeowner",
    "",
    "",
    quote.quoteNumber,
    resolved.housecallJobId,
    quote.projectName,
    quote.proposalDescription,
    quote.pricing.finalSellingPrice.toFixed(2),
    "",
    "",
    "",
    "",
  ];
  return {
    issues: [] as QuoteExportPreflightIssue[],
    csv:
      [[...HOUSECALL_PRO_JOB_HEADERS], values]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n") + "\r\n",
  };
}

export function quoteExportFilename(
  quote: QuoteRecord,
  destination:
    | typeof JOBBER_DESTINATION
    | typeof QUICKBOOKS_DESTINATION
    | typeof HOUSECALL_PRO_DESTINATION = JOBBER_DESTINATION,
) {
  const safeQuoteNumber = quote.quoteNumber.replace(/[^a-z0-9_-]+/gi, "-");
  const provider =
    destination === HOUSECALL_PRO_DESTINATION ? "housecall-pro" : destination;
  return `quote-${safeQuoteNumber || quote.id}-${provider}.csv`;
}

export const QUOTE_EXPORT_ADAPTERS_V1 = {
  [JOBBER_DESTINATION]: {
    destination: JOBBER_DESTINATION,
    format: JOBBER_CSV_FORMAT,
    version: JOBBER_CSV_VERSION,
    headers: JOBBER_QUOTE_HEADERS,
    preflight: preflightJobberQuoteExport,
    build: buildJobberQuoteCsv,
  },
  [QUICKBOOKS_DESTINATION]: {
    destination: QUICKBOOKS_DESTINATION,
    format: QUICKBOOKS_CSV_FORMAT,
    version: QUICKBOOKS_INVOICE_CSV_VERSION,
    headers: QUICKBOOKS_INVOICE_HEADERS,
    preflight: preflightQuickBooksQuoteExport,
    build: buildQuickBooksQuoteCsv,
  },
  [HOUSECALL_PRO_DESTINATION]: {
    destination: HOUSECALL_PRO_DESTINATION,
    format: HOUSECALL_PRO_CSV_FORMAT,
    version: HOUSECALL_PRO_JOBS_CSV_VERSION,
    headers: HOUSECALL_PRO_JOB_HEADERS,
    preflight: preflightHousecallProQuoteExport,
    build: buildHousecallProQuoteCsv,
  },
} as const;