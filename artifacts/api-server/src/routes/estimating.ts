import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
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
  type PanelReplacementInputRecord,
  type PricingRecord,
  type QuoteJobInputsRecord,
  type RecessedLightingInputRecord,
  type ServiceUpgradeInputRecord,
} from "@workspace/db";
import { DEFAULT_COMPANY_ID, ensureEstimatorSeed } from "../lib/estimating-seed";
import {
  calculateBathroomEstimate,
  calculateEvChargerEstimate,
  calculateKitchenEstimate,
  calculatePanelReplacementEstimate,
  calculateRecessedLightingEstimate,
  calculateServiceUpgradeEstimate,
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
  | "PANEL_REPLACEMENT";

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
      bathroomLaborAdjustmentHours: settings.bathroomLaborAdjustmentHours,
      kitchenLaborAdjustmentHours: settings.kitchenLaborAdjustmentHours,
      recessedLightingLaborAdjustmentHours:
        settings.recessedLightingLaborAdjustmentHours,
      serviceUpgradeCrewSize: settings.serviceUpgradeCrewSize,
      serviceUpgradeHoursPerPerson: settings.serviceUpgradeHoursPerPerson,
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
      bathroomLaborAdjustmentHours: settings.bathroomLaborAdjustmentHours,
      kitchenLaborAdjustmentHours: settings.kitchenLaborAdjustmentHours,
      recessedLightingLaborAdjustmentHours:
        settings.recessedLightingLaborAdjustmentHours,
      serviceUpgradeCrewSize: settings.serviceUpgradeCrewSize,
      serviceUpgradeHoursPerPerson: settings.serviceUpgradeHoursPerPerson,
    }),
  );
});

export default router;