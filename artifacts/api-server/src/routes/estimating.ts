import { and, desc, eq, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  CreateQuoteBody,
  CreateQuoteResponse,
  CreateCustomerBody,
  CreateCustomerResponse,
  GetCustomerParams,
  GetCustomerResponse,
  GetDashboardSummaryResponse,
  GetCustomerProposalParams,
  GetCustomerProposalResponse,
  GetQuoteParams,
  GetQuoteResponse,
  GetSettingsResponse,
  ListPriceBookItemsResponse,
  ListQuotesQueryParams,
  ListQuotesResponse,
  ListCustomersQueryParams,
  ListCustomersResponse,
  PreviewQuoteBody,
  PreviewQuoteResponse,
  UpdatePriceBookItemBody,
  UpdatePriceBookItemParams,
  UpdatePriceBookItemResponse,
  UpdateQuoteBody,
  UpdateQuoteParams,
  UpdateQuoteResponse,
  UpdateCustomerBody,
  UpdateCustomerParams,
  UpdateCustomerResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import {
  companiesTable,
  companySettingsTable,
  customersTable,
  db,
  priceBookItemsTable,
  quotesTable,
  type BathroomInputRecord,
  type CustomInputRecord,
  type EvChargerInputRecord,
  type KitchenInputRecord,
  type PanelReplacementInputRecord,
  type PricingRecord,
  type QuoteJobInputsRecord,
  type RecessedLightingInputRecord,
  type ServiceCallInputRecord,
  type ServiceUpgradeInputRecord,
  type TimeMaterialsInputRecord,
} from "@workspace/db";
import { DEFAULT_COMPANY_ID, ensureEstimatorSeed } from "../lib/estimating-seed";
import {
  calculateBathroomEstimate,
  calculateCustomEstimate,
  calculateEvChargerEstimate,
  calculateKitchenEstimate,
  calculatePanelReplacementEstimate,
  calculateRecessedLightingEstimate,
  calculateServiceCallEstimate,
  calculateServiceUpgradeEstimate,
  calculateTimeMaterialsEstimate,
  normalizePricingWarnings,
} from "../lib/estimating-engine";

const router: IRouter = Router();

type QuoteStatus = "draft" | "ready";
type EstimateModule =
  | "EV_CHARGER"
  | "BATHROOM"
  | "KITCHEN"
  | "RECESSED_LIGHTING"
  | "SERVICE_UPGRADE"
  | "PANEL_REPLACEMENT"
  | "SERVICE_CALL"
  | "TIME_MATERIALS"
  | "CUSTOM";

function normalizeQuoteStatus(status: string): QuoteStatus {
  return status.toLowerCase() === "ready" ? "ready" : "draft";
}

function serializePricing(pricing: PricingRecord): PricingRecord {
  return {
    ...pricing,
    pricingWarnings: normalizePricingWarnings(pricing.pricingWarnings),
  };
}

export const MAX_OVERRIDE_VALUE = 999999999.99;

export function validateOverrideValues(values: {
  laborOverride?: number | null;
  sellingPriceOverride?: number | null;
}) {
  return [values.laborOverride, values.sellingPriceOverride].every(
    (value) =>
      value === undefined ||
      value === null ||
      (Number.isFinite(value) &&
        value >= 0 &&
        value <= MAX_OVERRIDE_VALUE),
  );
}

export function formatQuoteNumber(companyId: number, quoteId: number) {
  return `Q-${companyId}-${String(quoteId).padStart(6, "0")}`;
}

function serializeQuote(quote: typeof quotesTable.$inferSelect) {
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail,
    projectName: quote.projectName,
    module: quote.module,
    status: normalizeQuoteStatus(quote.status),
    total: quote.total,
    margin: quote.margin,
    updatedAt: quote.updatedAt.toISOString(),
    createdAt: quote.createdAt.toISOString(),
    jobInputs: quote.jobInputs,
    assembly: quote.assembly,
    pricing: serializePricing(quote.pricing),
    proposalDescription: quote.proposalDescription,
  };
}

function serializeQuoteSummary(quote: typeof quotesTable.$inferSelect) {
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    customerName: quote.customerName,
    projectName: quote.projectName,
    module: quote.module,
    status: normalizeQuoteStatus(quote.status),
    total: quote.total,
    margin: quote.margin,
    updatedAt: quote.updatedAt.toISOString(),
  };
}

function normalizeCustomerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeCustomerEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase();
  return normalized || null;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueConstraintError(error.cause);
}

async function customerByNormalizedEmail(email: string) {
  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.companyId, DEFAULT_COMPANY_ID));
  return customers.find(
    (customer) => normalizeCustomerEmail(customer.email) === email,
  );
}

function serializeCustomerSummary(
  customer: typeof customersTable.$inferSelect,
  quotes: Array<typeof quotesTable.$inferSelect>,
) {
  const customerQuotes = quotes.filter((quote) => quote.customerId === customer.id);
  const latestQuote = customerQuotes.reduce<typeof quotesTable.$inferSelect | null>(
    (latest, quote) =>
      !latest || quote.updatedAt > latest.updatedAt ? quote : latest,
    null,
  );

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    quoteCount: customerQuotes.length,
    totalQuoted: Number(
      customerQuotes.reduce((sum, quote) => sum + quote.total, 0).toFixed(2),
    ),
    latestQuoteAt: latestQuote?.updatedAt.toISOString() ?? null,
    createdAt: customer.createdAt.toISOString(),
  };
}

export function matchCustomerForQuote(
  customers: Array<typeof customersTable.$inferSelect>,
  input: { name: string; email?: string | null },
) {
  const normalizedName = normalizeCustomerName(input.name);
  const normalizedEmail = normalizeCustomerEmail(input.email);

  if (normalizedEmail) {
    const emailMatch = customers.find(
      (customer) => normalizeCustomerEmail(customer.email) === normalizedEmail,
    );
    if (emailMatch) return { customer: emailMatch, shouldSetEmail: false };

    const nameOnlyMatches = customers.filter(
      (customer) =>
        normalizeCustomerName(customer.name) === normalizedName &&
        normalizeCustomerEmail(customer.email) === null,
    );
    if (nameOnlyMatches.length === 1) {
      return { customer: nameOnlyMatches[0], shouldSetEmail: true };
    }
    return null;
  }

  const nameOnlyMatches = customers.filter(
    (customer) =>
      normalizeCustomerName(customer.name) === normalizedName &&
      normalizeCustomerEmail(customer.email) === null,
  );
  return nameOnlyMatches.length === 1
    ? { customer: nameOnlyMatches[0], shouldSetEmail: false }
    : null;
}

async function findOrCreateCustomer(input: {
  name: string;
  email?: string | null;
}) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = normalizeCustomerEmail(input.email);
  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.companyId, DEFAULT_COMPANY_ID));
  const match = matchCustomerForQuote(customers, { name, email });

  if (match?.customer) {
    if (match.shouldSetEmail && email) {
      let updated: typeof customersTable.$inferSelect | undefined;
      try {
        [updated] = await db
          .update(customersTable)
          .set({ email })
          .where(
            and(
              eq(customersTable.id, match.customer.id),
              eq(customersTable.companyId, DEFAULT_COMPANY_ID),
              isNull(customersTable.email),
            ),
          )
          .returning();
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const concurrentEmailMatch = await customerByNormalizedEmail(email);
          if (concurrentEmailMatch) return concurrentEmailMatch;
        }
        throw error;
      }
      if (updated) return updated;
      const concurrentEmailMatch = await customerByNormalizedEmail(email);
      if (concurrentEmailMatch) return concurrentEmailMatch;
    }
    if (!match.shouldSetEmail) return match.customer;
  }

  try {
    const [customer] = await db
      .insert(customersTable)
      .values({
        companyId: DEFAULT_COMPANY_ID,
        name,
        email,
      })
      .returning();
    if (!customer) throw new Error("Unable to create customer");
    return customer;
  } catch (error) {
    if (email && isUniqueConstraintError(error)) {
      const concurrentEmailMatch = await customerByNormalizedEmail(email);
      if (concurrentEmailMatch) return concurrentEmailMatch;
    }
    throw error;
  }
}

function proposalSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  return secret;
}

export function createProposalShareToken(
  quoteId: number,
  updatedAt: Date,
) {
  const payload = `${quoteId}.${updatedAt.getTime()}`;
  const signature = createHmac("sha256", proposalSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function parseProposalShareToken(token: string) {
  const [idText, timestampText, signature, ...extra] = token.split(".");
  const quoteId = Number(idText);
  const timestamp = Number(timestampText);
  if (
    extra.length > 0 ||
    !Number.isSafeInteger(quoteId) ||
    quoteId < 1 ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 1 ||
    !signature
  ) {
    return null;
  }
  const payload = `${quoteId}.${timestamp}`;
  const expected = createHmac("sha256", proposalSecret())
    .update(payload)
    .digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }
  return { quoteId, timestamp };
}

export function customerMaterialDescription(description: string) {
  const rules: Array<[RegExp, string]> = [
    [/^Milbank .*200A meter-main.*$/i, "200A meter-main with built-in disconnect"],
    [/^Siemens .*200A .*panel.*$/i, "200A Siemens panel"],
    [/^Square D .*100A .*load center.*$/i, "100A Square D panel"],
    [/^.*intersystem bonding (?:terminal|connector).*$/i, "Intersystem bonding connector"],
    [/^#8 solid grounding conductor$/i, "#8 bare copper"],
    [/^#4 green bonding conductor$/i, "#4 green copper"],
    [/^.*Pass & Seymour.*traditional 3-way switches.*$/i, "3-way switches"],
    [/^.*Pass & Seymour.*single-pole switches?.*$/i, "Single-pole switch"],
    [/^.*Pass & Seymour.*GFCI.*$/i, "GFCI receptacle"],
    [/^.*Pass & Seymour.*duplex receptacle.*$/i, "Tamper-resistant receptacle"],
    [/^.*Legrand radiant.*single-pole switch.*$/i, "Single-pole switch"],
    [/^.*Lutron.*dimmer.*$/i, "Dimmer"],
    [/^.*Juno.*4-inch.*(?:wafer|light).*$/i, "4-inch recessed light"],
    [/^.*Juno.*6-inch.*(?:wafer|light).*$/i, "6-inch recessed light"],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(description)) return replacement;
  }
  if (/\bbreaker\b/i.test(description)) {
    const breaker = description.match(
      /(\d+A).*?(\d)-pole.*?(standard|GFCI|AFCI|dual-function).*?breaker/i,
    );
    return breaker
      ? `${breaker[1]} ${breaker[2]}-pole ${breaker[3]} breaker`
      : "Circuit breaker";
  }
  return description;
}

export function withProfit(
  pricing: PricingRecord,
  overrides: {
    laborOverride?: number | null;
    sellingPriceOverride?: number | null;
  } = {},
): PricingRecord {
  const laborOverride =
    overrides.laborOverride !== undefined
      ? overrides.laborOverride
      : pricing.laborOverride;
  const sellingPriceOverride =
    overrides.sellingPriceOverride !== undefined
      ? overrides.sellingPriceOverride
      : pricing.sellingPriceOverride;
  const effectiveLabor = laborOverride ?? pricing.laborCost;
  const finalSellingPrice =
    sellingPriceOverride ?? pricing.calculatedSellingPrice;
  const grossProfit = Number(
    (finalSellingPrice - pricing.materialCost - effectiveLabor).toFixed(2),
  );

  return {
    ...pricing,
    finalSellingPrice,
    laborOverride,
    sellingPriceOverride,
    grossProfit,
    grossMargin:
      finalSellingPrice > 0
        ? Number((grossProfit / finalSellingPrice).toFixed(4))
        : 0,
    pricingWarnings: pricing.pricingWarnings ?? [],
  };
}

export function pricingForQuoteUpdate(
  pricing: PricingRecord,
  update: {
    laborOverride?: number | null;
    sellingPriceOverride?: number | null;
  },
) {
  if (
    !("laborOverride" in update) &&
    !("sellingPriceOverride" in update)
  ) {
    return pricing;
  }

  return withProfit(pricing, {
    ...("laborOverride" in update
      ? { laborOverride: update.laborOverride }
      : {}),
    ...("sellingPriceOverride" in update
      ? { sellingPriceOverride: update.sellingPriceOverride }
      : {}),
  });
}

export function hasBlockingPricingWarnings(
  warnings: PricingRecord["pricingWarnings"],
) {
  return warnings.some((warning) =>
    typeof warning === "string"
      ? warning.startsWith("No verified price is available")
      : warning.severity === "error",
  );
}

async function companySettings() {
  await ensureEstimatorSeed();
  const [settings] = await db
    .select()
    .from(companySettingsTable)
    .where(eq(companySettingsTable.companyId, DEFAULT_COMPANY_ID));

  if (!settings) {
    throw new Error("Starter company settings were not initialized");
  }

  return settings;
}

async function calculateEstimate(
  module: EstimateModule,
  jobInputs: QuoteJobInputsRecord,
) {
  const settings = await companySettings();
  const priceBook = await db
    .select({
      category: priceBookItemsTable.category,
      item: priceBookItemsTable.item,
      unitCost: priceBookItemsTable.unitCost,
      supplier: priceBookItemsTable.supplier,
      manufacturer: priceBookItemsTable.manufacturer,
      manufacturerPartNumber: priceBookItemsTable.manufacturerPartNumber,
      supplierSku: priceBookItemsTable.supplierSku,
      upc: priceBookItemsTable.upc,
      sourceDate: priceBookItemsTable.sourceDate,
      amperage: priceBookItemsTable.amperage,
      poleCount: priceBookItemsTable.poleCount,
      protectionType: priceBookItemsTable.protectionType,
      isDefault: priceBookItemsTable.isDefault,
    })
    .from(priceBookItemsTable)
    .where(eq(priceBookItemsTable.companyId, DEFAULT_COMPANY_ID));

  if (module === "BATHROOM" && isBathroomInput(jobInputs)) {
    return calculateBathroomEstimate(jobInputs, settings, priceBook);
  }
  if (module === "KITCHEN" && isKitchenInput(jobInputs)) {
    return calculateKitchenEstimate(jobInputs, settings, priceBook);
  }
  if (module === "EV_CHARGER" && isEvInput(jobInputs)) {
    return calculateEvChargerEstimate(jobInputs, settings, priceBook);
  }
  if (module === "RECESSED_LIGHTING" && isRecessedLightingInput(jobInputs)) {
    return calculateRecessedLightingEstimate(jobInputs, settings, priceBook);
  }
  if (module === "SERVICE_UPGRADE" && isServiceUpgradeInput(jobInputs)) {
    return calculateServiceUpgradeEstimate(jobInputs, settings, priceBook);
  }
  if (module === "PANEL_REPLACEMENT" && isPanelReplacementInput(jobInputs)) {
    return calculatePanelReplacementEstimate(jobInputs, settings, priceBook);
  }
  if (module === "SERVICE_CALL" && isServiceCallInput(jobInputs)) {
    return calculateServiceCallEstimate(jobInputs, settings, priceBook);
  }
  if (module === "TIME_MATERIALS" && isTimeMaterialsInput(jobInputs)) {
    return calculateTimeMaterialsEstimate(jobInputs, settings, priceBook);
  }
  if (module === "CUSTOM" && isCustomInput(jobInputs)) {
    return calculateCustomEstimate(jobInputs, settings, priceBook);
  }
  throw new Error(`Job inputs do not match module ${module}`);
}

function isEvInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is EvChargerInputRecord {
  return "chargerQuantity" in jobInputs && "panelManufacturer" in jobInputs;
}

function isBathroomInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is BathroomInputRecord {
  return "gfciReceptacles" in jobInputs && "circuitOption" in jobInputs;
}

function isKitchenInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is KitchenInputRecord {
  return "refrigeratorCircuits" in jobInputs && "countertopReceptacles" in jobInputs;
}

function isRecessedLightingInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is RecessedLightingInputRecord {
  return "roomLength" in jobInputs && "fixtureQuantity" in jobInputs;
}

function isServiceUpgradeInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is ServiceUpgradeInputRecord {
  return "serviceSize" in jobInputs && "crewHours" in jobInputs;
}

function isPanelReplacementInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is PanelReplacementInputRecord {
  return "replacementType" in jobInputs && "feederConductor" in jobInputs;
}

function isServiceCallInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is ServiceCallInputRecord {
  return "visitQuantity" in jobInputs && "trReceptacleReplacementQuantity" in jobInputs;
}

function isTimeMaterialsInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is TimeMaterialsInputRecord {
  return "serviceType" in jobInputs && "laborSellRate" in jobInputs;
}

function isCustomInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is CustomInputRecord {
  return "laborHours" in jobInputs && "materials" in jobInputs;
}

function moduleMatchesInputs(
  module: EstimateModule,
  jobInputs: QuoteJobInputsRecord,
) {
  return (
    (module === "EV_CHARGER" && isEvInput(jobInputs)) ||
    (module === "BATHROOM" && isBathroomInput(jobInputs)) ||
    (module === "KITCHEN" && isKitchenInput(jobInputs)) ||
    (module === "RECESSED_LIGHTING" && isRecessedLightingInput(jobInputs))
    || (module === "SERVICE_UPGRADE" && isServiceUpgradeInput(jobInputs))
    || (module === "PANEL_REPLACEMENT" && isPanelReplacementInput(jobInputs))
    || (module === "SERVICE_CALL" && isServiceCallInput(jobInputs))
    || (module === "TIME_MATERIALS" && isTimeMaterialsInput(jobInputs))
    || (module === "CUSTOM" && isCustomInput(jobInputs))
  );
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const quotes = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.companyId, DEFAULT_COMPANY_ID))
    .orderBy(desc(quotesTable.updatedAt));

  const totalQuoted = quotes.reduce((sum, quote) => sum + quote.total, 0);
  const averageMargin =
    quotes.length > 0
      ? quotes.reduce((sum, quote) => sum + quote.margin, 0) / quotes.length
      : 0;
  const data = GetDashboardSummaryResponse.parse({
    totalQuotes: quotes.length,
    draftQuotes: quotes.filter(
      (quote) => normalizeQuoteStatus(quote.status) === "draft",
    ).length,
    readyQuotes: quotes.filter(
      (quote) => normalizeQuoteStatus(quote.status) === "ready",
    ).length,
    totalQuoted,
    averageMargin,
    recentQuotes: quotes.slice(0, 5).map(serializeQuoteSummary),
  });
  req.log.info({ quoteCount: quotes.length }, "Loaded dashboard summary");
  res.json(data);
});

router.get("/customers", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const parsedQuery = ListCustomersQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const [customers, quotes] = await Promise.all([
    db
      .select()
      .from(customersTable)
      .where(eq(customersTable.companyId, DEFAULT_COMPANY_ID))
      .orderBy(customersTable.name),
    db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.companyId, DEFAULT_COMPANY_ID)),
  ]);
  const search = parsedQuery.data.search?.trim().toLocaleLowerCase();
  const filtered = search
    ? customers.filter(
        (customer) =>
          customer.name.toLocaleLowerCase().includes(search) ||
          customer.email?.toLocaleLowerCase().includes(search),
      )
    : customers;

  res.json(
    ListCustomersResponse.parse(
      filtered.map((customer) => serializeCustomerSummary(customer, quotes)),
    ),
  );
});

router.post("/customers", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = normalizeCustomerEmail(parsed.data.email);
  if (email) {
    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.companyId, DEFAULT_COMPANY_ID));
    if (
      customers.some(
        (customer) => normalizeCustomerEmail(customer.email) === email,
      )
    ) {
      res.status(409).json({ error: "A customer with this email already exists." });
      return;
    }
  }

  let customer: typeof customersTable.$inferSelect | undefined;
  try {
    [customer] = await db
      .insert(customersTable)
      .values({
        companyId: DEFAULT_COMPANY_ID,
        name: parsed.data.name.trim().replace(/\s+/g, " "),
        email,
      })
      .returning();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A customer with this email already exists." });
      return;
    }
    throw error;
  }
  if (!customer) throw new Error("Unable to create customer");

  req.log.info({ customerId: customer.id }, "Created customer");
  res
    .status(201)
    .json(CreateCustomerResponse.parse(serializeCustomerSummary(customer, [])));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [customer] = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, params.data.id),
        eq(customersTable.companyId, DEFAULT_COMPANY_ID),
      ),
    );
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.customerId, customer.id),
        eq(quotesTable.companyId, DEFAULT_COMPANY_ID),
      ),
    )
    .orderBy(desc(quotesTable.updatedAt));

  res.json(
    GetCustomerResponse.parse({
      ...serializeCustomerSummary(customer, quotes),
      quotes: quotes.map(serializeQuoteSummary),
    }),
  );
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const params = UpdateCustomerParams.safeParse(req.params);
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, params.data.id),
        eq(customersTable.companyId, DEFAULT_COMPANY_ID),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const email =
    "email" in parsed.data
      ? normalizeCustomerEmail(parsed.data.email)
      : existing.email;
  if (email) {
    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.companyId, DEFAULT_COMPANY_ID));
    const conflict = customers.find(
      (customer) =>
        customer.id !== existing.id &&
        normalizeCustomerEmail(customer.email) === email,
    );
    if (conflict) {
      res.status(409).json({ error: "A customer with this email already exists." });
      return;
    }
  }

  let customer: typeof customersTable.$inferSelect | undefined;
  try {
    [customer] = await db
      .update(customersTable)
      .set({
        name:
          parsed.data.name?.trim().replace(/\s+/g, " ") ?? existing.name,
        email,
      })
      .where(
        and(
          eq(customersTable.id, existing.id),
          eq(customersTable.companyId, DEFAULT_COMPANY_ID),
        ),
      )
      .returning();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A customer with this email already exists." });
      return;
    }
    throw error;
  }
  if (!customer) throw new Error("Unable to update customer");

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.customerId, customer.id),
        eq(quotesTable.companyId, DEFAULT_COMPANY_ID),
      ),
    );
  req.log.info({ customerId: customer.id }, "Updated customer");
  res.json(
    UpdateCustomerResponse.parse(serializeCustomerSummary(customer, quotes)),
  );
});

router.get("/quotes", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const parsedQuery = ListQuotesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    req.log.warn({ errors: parsedQuery.error.message }, "Invalid quote filter");
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const allQuotes = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.companyId, DEFAULT_COMPANY_ID))
    .orderBy(desc(quotesTable.updatedAt));
  const filteredQuotes = parsedQuery.data.status
    ? allQuotes.filter(
        (quote) =>
          normalizeQuoteStatus(quote.status) === parsedQuery.data.status,
      )
    : allQuotes;

  res.json(ListQuotesResponse.parse(filteredQuotes.map(serializeQuoteSummary)));
});

router.post("/quotes", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid new quote");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!validateOverrideValues(parsed.data)) {
    res.status(400).json({
      error:
        "Override values must be finite, non-negative, and within the supported amount range.",
    });
    return;
  }
  if (!moduleMatchesInputs(parsed.data.module, parsed.data.jobInputs)) {
    res.status(400).json({
      error: `Job inputs do not match module ${parsed.data.module}`,
    });
    return;
  }

  const estimate = await calculateEstimate(
    parsed.data.module,
    parsed.data.jobInputs,
  );

  const customer = await findOrCreateCustomer({
    name: parsed.data.customerName,
    email: parsed.data.customerEmail,
  });

  const pricing = withProfit(estimate.pricing, {
    laborOverride: parsed.data.laborOverride,
    sellingPriceOverride: parsed.data.sellingPriceOverride,
  });
  const quote = await db.transaction(async (tx) => {
    const [pendingQuote] = await tx
      .insert(quotesTable)
      .values({
        companyId: DEFAULT_COMPANY_ID,
        customerId: customer?.id,
        quoteNumber: `PENDING-${randomUUID()}`,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        projectName: parsed.data.projectName,
        module: parsed.data.module,
        status: "draft",
        jobInputs: parsed.data.jobInputs,
        assembly: estimate.assembly,
        pricing,
        proposalDescription: parsed.data.proposalDescription,
        total: pricing.finalSellingPrice,
        margin: pricing.grossMargin,
      })
      .returning();

    if (!pendingQuote) {
      return undefined;
    }

    const [numberedQuote] = await tx
      .update(quotesTable)
      .set({
        quoteNumber: formatQuoteNumber(
          DEFAULT_COMPANY_ID,
          pendingQuote.id,
        ),
      })
      .where(
        and(
          eq(quotesTable.id, pendingQuote.id),
          eq(quotesTable.companyId, DEFAULT_COMPANY_ID),
        ),
      )
      .returning();

    return numberedQuote;
  });

  if (!quote) {
    throw new Error("Unable to create quote");
  }

  req.log.info({ quoteId: quote.id }, "Created quote");
  res.status(201).json(CreateQuoteResponse.parse(serializeQuote(quote)));
});

router.post("/quotes/preview", async (req, res): Promise<void> => {
  const parsed = PreviewQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid quote preview");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!validateOverrideValues(parsed.data)) {
    res.status(400).json({
      error:
        "Override values must be finite, non-negative, and within the supported amount range.",
    });
    return;
  }
  if (!moduleMatchesInputs(parsed.data.module, parsed.data.jobInputs)) {
    res.status(400).json({
      error: `Job inputs do not match module ${parsed.data.module}`,
    });
    return;
  }

  const estimate = await calculateEstimate(
    parsed.data.module,
    parsed.data.jobInputs,
  );
  res.json(
    PreviewQuoteResponse.parse({
      ...estimate,
      pricing: withProfit(estimate.pricing, {
        laborOverride: parsed.data.laborOverride,
        sellingPriceOverride: parsed.data.sellingPriceOverride,
      }),
    }),
  );
});

router.get("/proposals/:token", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const params = GetCustomerProposalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(
      eq(
        quotesTable.id,
        parseProposalShareToken(params.data.token)?.quoteId ?? -1,
      ),
    );
  const tokenData = parseProposalShareToken(params.data.token);
  if (
    !quote ||
    quote.companyId !== DEFAULT_COMPANY_ID ||
    normalizeQuoteStatus(quote.status) !== "ready" ||
    !tokenData ||
    quote.updatedAt.getTime() !== tokenData.timestamp
  ) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  res.json(
    GetCustomerProposalResponse.parse({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
      projectName: quote.projectName,
      status: normalizeQuoteStatus(quote.status),
      proposalDescription: quote.proposalDescription,
      createdAt: quote.createdAt.toISOString(),
      finalSellingPrice: quote.pricing.finalSellingPrice,
      scope: quote.assembly.map((line) => ({
        id: line.id,
        description: customerMaterialDescription(line.description),
        quantity: line.quantity,
        unit: line.unit,
      })),
    }),
  );
});

router.get("/quotes/:id", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const params = GetQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, params.data.id));

  if (!quote || quote.companyId !== DEFAULT_COMPANY_ID) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.json(GetQuoteResponse.parse(serializeQuote(quote)));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const params = UpdateQuoteParams.safeParse(req.params);
  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!validateOverrideValues(parsed.data)) {
    res.status(400).json({
      error:
        "Override values must be finite, non-negative, and within the supported amount range.",
    });
    return;
  }

  const [existingQuote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, params.data.id));
  if (!existingQuote || existingQuote.companyId !== DEFAULT_COMPANY_ID) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  if (
    parsed.data.status === "ready" &&
    hasBlockingPricingWarnings(existingQuote.pricing.pricingWarnings)
  ) {
    res.status(409).json({
      error:
        "Resolve all missing or invalid material prices before marking this quote ready.",
    });
    return;
  }

  const pricing = pricingForQuoteUpdate(existingQuote.pricing, parsed.data);
  const [quote] = await db
    .update(quotesTable)
    .set({
      status: parsed.data.status ?? normalizeQuoteStatus(existingQuote.status),
      pricing,
      proposalDescription: parsed.data.proposalDescription,
      total: pricing.finalSellingPrice,
      margin: pricing.grossMargin,
    })
    .where(
      and(
        eq(quotesTable.id, existingQuote.id),
        eq(quotesTable.companyId, DEFAULT_COMPANY_ID),
      ),
    )
    .returning();

  if (!quote) {
    throw new Error("Unable to update quote");
  }

  req.log.info({ quoteId: quote.id }, "Updated quote");
  res.json(
    UpdateQuoteResponse.parse({
      ...serializeQuote(quote),
      proposalShareToken:
        normalizeQuoteStatus(quote.status) === "ready"
          ? createProposalShareToken(quote.id, quote.updatedAt)
          : null,
    }),
  );
});

router.get("/price-book", async (_req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const items = await db
    .select()
    .from(priceBookItemsTable)
    .where(eq(priceBookItemsTable.companyId, DEFAULT_COMPANY_ID))
    .orderBy(priceBookItemsTable.category, priceBookItemsTable.item);

  res.json(
    ListPriceBookItemsResponse.parse(
      items.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      })),
    ),
  );
});

router.patch("/price-book/:id", async (req, res): Promise<void> => {
  await ensureEstimatorSeed();
  const params = UpdatePriceBookItemParams.safeParse(req.params);
  const parsed = UpdatePriceBookItemBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(priceBookItemsTable)
    .set({ unitCost: parsed.data.unitCost, isDefault: false })
    .where(
      and(
        eq(priceBookItemsTable.id, params.data.id),
        eq(priceBookItemsTable.companyId, DEFAULT_COMPANY_ID),
      ),
    )
    .returning();

  if (!item) {
    res.status(404).json({ error: "Price book item not found" });
    return;
  }

  res.json(
    UpdatePriceBookItemResponse.parse({
      ...item,
      updatedAt: item.updatedAt.toISOString(),
    }),
  );
});

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await companySettings();
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, DEFAULT_COMPANY_ID));

  res.json(
    GetSettingsResponse.parse({
      companyName: company?.name ?? "Starter Electrical Co.",
      laborRate: settings.residentialLaborSellRate,
      residentialLaborSellRate: settings.residentialLaborSellRate,
      commercialLaborSellRate: settings.commercialLaborSellRate,
      loadedLaborCost: settings.loadedLaborCost,
      materialMarkup: settings.materialMarkup,
      targetMargin: settings.targetMargin,
      defaultTaxRate: settings.defaultTaxRate,
      evLaborAdjustmentHours: settings.evLaborAdjustmentHours,
      evDefaultCableType: settings.evDefaultCableType,
      bathroomLaborAdjustmentHours: settings.bathroomLaborAdjustmentHours,
      kitchenLaborAdjustmentHours: settings.kitchenLaborAdjustmentHours,
      recessedLightingLaborAdjustmentHours:
        settings.recessedLightingLaborAdjustmentHours,
      serviceUpgradeCrewSize: settings.serviceUpgradeCrewSize,
      serviceUpgradeHoursPerPerson: settings.serviceUpgradeHoursPerPerson,
      panelReplacementCrewSize: settings.panelReplacementCrewSize,
      panelReplacementHoursPerPerson: settings.panelReplacementHoursPerPerson,
    }),
  );
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const currentSettings = await companySettings();
  const residentialLaborSellRate =
    parsed.data.residentialLaborSellRate ??
    parsed.data.laborRate ??
    currentSettings.residentialLaborSellRate;
  if (parsed.data.companyName !== undefined) {
    await db
      .update(companiesTable)
      .set({ name: parsed.data.companyName })
      .where(eq(companiesTable.id, DEFAULT_COMPANY_ID));
  }

  const [settings] = await db
    .update(companySettingsTable)
    .set({
      laborRate: residentialLaborSellRate,
      residentialLaborSellRate,
      commercialLaborSellRate:
        parsed.data.commercialLaborSellRate ??
        currentSettings.commercialLaborSellRate,
      loadedLaborCost:
        parsed.data.loadedLaborCost ?? currentSettings.loadedLaborCost,
      materialMarkup: parsed.data.materialMarkup ?? currentSettings.materialMarkup,
      targetMargin: parsed.data.targetMargin ?? currentSettings.targetMargin,
      defaultTaxRate: parsed.data.defaultTaxRate ?? currentSettings.defaultTaxRate,
      evLaborAdjustmentHours:
        parsed.data.evLaborAdjustmentHours ??
        currentSettings.evLaborAdjustmentHours,
      evDefaultCableType:
        parsed.data.evDefaultCableType ?? currentSettings.evDefaultCableType,
      bathroomLaborAdjustmentHours:
        parsed.data.bathroomLaborAdjustmentHours ??
        currentSettings.bathroomLaborAdjustmentHours,
      kitchenLaborAdjustmentHours:
        parsed.data.kitchenLaborAdjustmentHours ??
        currentSettings.kitchenLaborAdjustmentHours,
      recessedLightingLaborAdjustmentHours:
        parsed.data.recessedLightingLaborAdjustmentHours ??
        currentSettings.recessedLightingLaborAdjustmentHours,
      serviceUpgradeCrewSize:
        parsed.data.serviceUpgradeCrewSize ??
        currentSettings.serviceUpgradeCrewSize,
      serviceUpgradeHoursPerPerson:
        parsed.data.serviceUpgradeHoursPerPerson ??
        currentSettings.serviceUpgradeHoursPerPerson,
      panelReplacementCrewSize:
        parsed.data.panelReplacementCrewSize ??
        currentSettings.panelReplacementCrewSize,
      panelReplacementHoursPerPerson:
        parsed.data.panelReplacementHoursPerPerson ??
        currentSettings.panelReplacementHoursPerPerson,
    })
    .where(eq(companySettingsTable.id, currentSettings.id))
    .returning();
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, DEFAULT_COMPANY_ID));

  if (!settings) {
    throw new Error("Unable to update company settings");
  }

  req.log.info("Updated company estimating settings");
  res.json(
    UpdateSettingsResponse.parse({
      companyName: company?.name ?? "Starter Electrical Co.",
      laborRate: settings.residentialLaborSellRate,
      residentialLaborSellRate: settings.residentialLaborSellRate,
      commercialLaborSellRate: settings.commercialLaborSellRate,
      loadedLaborCost: settings.loadedLaborCost,
      materialMarkup: settings.materialMarkup,
      targetMargin: settings.targetMargin,
      defaultTaxRate: settings.defaultTaxRate,
      evLaborAdjustmentHours: settings.evLaborAdjustmentHours,
      evDefaultCableType: settings.evDefaultCableType,
      bathroomLaborAdjustmentHours: settings.bathroomLaborAdjustmentHours,
      kitchenLaborAdjustmentHours: settings.kitchenLaborAdjustmentHours,
      recessedLightingLaborAdjustmentHours:
        settings.recessedLightingLaborAdjustmentHours,
      serviceUpgradeCrewSize: settings.serviceUpgradeCrewSize,
      serviceUpgradeHoursPerPerson: settings.serviceUpgradeHoursPerPerson,
      panelReplacementCrewSize: settings.panelReplacementCrewSize,
      panelReplacementHoursPerPerson: settings.panelReplacementHoursPerPerson,
    }),
  );
});

export default router;