import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateQuoteBody,
  CreateQuoteResponse,
  GetDashboardSummaryResponse,
  GetQuoteParams,
  GetQuoteResponse,
  GetSettingsResponse,
  ListPriceBookItemsResponse,
  ListQuotesQueryParams,
  ListQuotesResponse,
  PreviewQuoteBody,
  PreviewQuoteResponse,
  UpdatePriceBookItemBody,
  UpdatePriceBookItemParams,
  UpdatePriceBookItemResponse,
  UpdateQuoteBody,
  UpdateQuoteParams,
  UpdateQuoteResponse,
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
  type EvChargerInputRecord,
  type KitchenInputRecord,
  type PricingRecord,
  type QuoteJobInputsRecord,
} from "@workspace/db";
import { DEFAULT_COMPANY_ID, ensureEstimatorSeed } from "../lib/estimating-seed";
import {
  calculateBathroomEstimate,
  calculateEvChargerEstimate,
  calculateKitchenEstimate,
} from "../lib/estimating-engine";

const router: IRouter = Router();

type QuoteStatus = "draft" | "ready";
type EstimateModule = "EV_CHARGER" | "BATHROOM" | "KITCHEN";

function normalizeQuoteStatus(status: string): QuoteStatus {
  return status.toLowerCase() === "ready" ? "ready" : "draft";
}

function serializePricing(pricing: PricingRecord): PricingRecord {
  return {
    ...pricing,
    pricingWarnings: pricing.pricingWarnings ?? [],
  };
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

function withProfit(
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
      item: priceBookItemsTable.item,
      unitCost: priceBookItemsTable.unitCost,
      supplier: priceBookItemsTable.supplier,
      manufacturer: priceBookItemsTable.manufacturer,
      manufacturerPartNumber: priceBookItemsTable.manufacturerPartNumber,
      supplierSku: priceBookItemsTable.supplierSku,
      sourceDate: priceBookItemsTable.sourceDate,
      amperage: priceBookItemsTable.amperage,
      poleCount: priceBookItemsTable.poleCount,
      protectionType: priceBookItemsTable.protectionType,
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

function moduleMatchesInputs(
  module: EstimateModule,
  jobInputs: QuoteJobInputsRecord,
) {
  return (
    (module === "EV_CHARGER" && isEvInput(jobInputs)) ||
    (module === "BATHROOM" && isBathroomInput(jobInputs)) ||
    (module === "KITCHEN" && isKitchenInput(jobInputs))
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

  const existingCustomers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.companyId, DEFAULT_COMPANY_ID));
  const customer =
    existingCustomers.find(
      (candidate) =>
        candidate.name.toLowerCase() === parsed.data.customerName.toLowerCase(),
    ) ??
    (
      await db
        .insert(customersTable)
        .values({
          companyId: DEFAULT_COMPANY_ID,
          name: parsed.data.customerName,
          email: parsed.data.customerEmail,
        })
        .returning()
    )[0];

  const quotes = await db
    .select({ id: quotesTable.id })
    .from(quotesTable)
    .where(eq(quotesTable.companyId, DEFAULT_COMPANY_ID));
  const pricing = withProfit(estimate.pricing, {
    laborOverride: parsed.data.laborOverride,
    sellingPriceOverride: parsed.data.sellingPriceOverride,
  });
  const [quote] = await db
    .insert(quotesTable)
    .values({
      companyId: DEFAULT_COMPANY_ID,
      customerId: customer?.id,
      quoteNumber: `Q-${1024 + quotes.length + 1}`,
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

  const [existingQuote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, params.data.id));
  if (!existingQuote || existingQuote.companyId !== DEFAULT_COMPANY_ID) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  const pricing = withProfit(serializePricing(existingQuote.pricing), {
    ...("laborOverride" in parsed.data
      ? { laborOverride: parsed.data.laborOverride }
      : {}),
    ...("sellingPriceOverride" in parsed.data
      ? { sellingPriceOverride: parsed.data.sellingPriceOverride }
      : {}),
  });
  const [quote] = await db
    .update(quotesTable)
    .set({
      status: parsed.data.status ?? normalizeQuoteStatus(existingQuote.status),
      pricing,
      proposalDescription: parsed.data.proposalDescription,
      total: pricing.finalSellingPrice,
      margin: pricing.grossMargin,
    })
    .where(eq(quotesTable.id, existingQuote.id))
    .returning();

  if (!quote) {
    throw new Error("Unable to update quote");
  }

  req.log.info({ quoteId: quote.id }, "Updated quote");
  res.json(UpdateQuoteResponse.parse(serializeQuote(quote)));
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
    .set({ unitCost: parsed.data.unitCost })
    .where(eq(priceBookItemsTable.id, params.data.id))
    .returning();

  if (!item || item.companyId !== DEFAULT_COMPANY_ID) {
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
      residentialLaborSellRate: settings.residentialLaborSellRate,
      commercialLaborSellRate: settings.commercialLaborSellRate,
      loadedLaborCost: settings.loadedLaborCost,
      materialMarkup: settings.materialMarkup,
      targetMargin: settings.targetMargin,
      defaultTaxRate: settings.defaultTaxRate,
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
  if (parsed.data.companyName !== undefined) {
    await db
      .update(companiesTable)
      .set({ name: parsed.data.companyName })
      .where(eq(companiesTable.id, DEFAULT_COMPANY_ID));
  }

  const [settings] = await db
    .update(companySettingsTable)
    .set({
      residentialLaborSellRate:
        parsed.data.residentialLaborSellRate ??
        currentSettings.residentialLaborSellRate,
      commercialLaborSellRate:
        parsed.data.commercialLaborSellRate ??
        currentSettings.commercialLaborSellRate,
      loadedLaborCost:
        parsed.data.loadedLaborCost ?? currentSettings.loadedLaborCost,
      materialMarkup: parsed.data.materialMarkup ?? currentSettings.materialMarkup,
      targetMargin: parsed.data.targetMargin ?? currentSettings.targetMargin,
      defaultTaxRate: parsed.data.defaultTaxRate ?? currentSettings.defaultTaxRate,
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
      residentialLaborSellRate: settings.residentialLaborSellRate,
      commercialLaborSellRate: settings.commercialLaborSellRate,
      loadedLaborCost: settings.loadedLaborCost,
      materialMarkup: settings.materialMarkup,
      targetMargin: settings.targetMargin,
      defaultTaxRate: settings.defaultTaxRate,
    }),
  );
});

export default router;