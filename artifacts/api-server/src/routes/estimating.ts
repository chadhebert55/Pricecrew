import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CreateQuoteBody,
  CreateQuoteResponse,
  CreateCustomerBody,
  CreateCustomerResponse,
  GetCustomerParams,
  GetCustomerResponse,
  DuplicateQuoteParams,
  DuplicateQuoteResponse,
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
  type AdditionInputRecord,
  type AssemblyLineRecord,
  type BathroomInputRecord,
  type CustomInputRecord,
  type DeliberateLossApproval,
  type EvChargerInputRecord,
  type KitchenInputRecord,
  type NewHouseInputRecord,
  type PanelReplacementInputRecord,
  type PricingRecord,
  type QuoteJobInputsRecord,
  type RecessedLightingInputRecord,
  type ServiceCallInputRecord,
  type ServiceUpgradeInputRecord,
  type TimeMaterialsInputRecord,
} from "@workspace/db";
import { ensureEstimatorSeed } from "../lib/estimating-seed";
import {
  isPublicProposalPath,
  requestCompanyId,
  requireEstimatorAuth,
} from "../middlewares/estimatorAuth";
import {
  calculateAdditionEstimate,
  calculateBathroomEstimate,
  calculateCustomEstimate,
  calculateEvChargerEstimate,
  calculateKitchenEstimate,
  calculateNewHouseEstimate,
  calculatePanelReplacementEstimate,
  calculateRecessedLightingEstimate,
  calculateServiceCallEstimate,
  calculateServiceUpgradeEstimate,
  calculateTimeMaterialsEstimate,
  auditPriceBookItem,
  normalizePricingWarnings,
} from "../lib/estimating-engine";

const router: IRouter = Router();

router.use((req, res, next) => {
  if (isPublicProposalPath(req)) {
    next();
    return;
  }
  void requireEstimatorAuth(req, res, next);
});

type QuoteStatus = "draft" | "ready";
type EstimateModule =
  | "EV_CHARGER"
  | "BATHROOM"
  | "KITCHEN"
  | "ADDITION"
  | "RECESSED_LIGHTING"
  | "SERVICE_UPGRADE"
  | "PANEL_REPLACEMENT"
  | "SERVICE_CALL"
  | "TIME_MATERIALS"
  | "CUSTOM"
  | "NEW_HOUSE";

export function normalizeEstimateModule(value: string): EstimateModule | null {
  const key = value.trim().toUpperCase().replace(/&/g, "AND").replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, EstimateModule> = {
    EVCHARGER: "EV_CHARGER",
    EVCHARGERBUILDER: "EV_CHARGER",
    BATHROOM: "BATHROOM",
    BATHROOMBUILDER: "BATHROOM",
    KITCHEN: "KITCHEN",
    KITCHENBUILDER: "KITCHEN",
    ADDITION: "ADDITION",
    ADDITIONBUILDER: "ADDITION",
    RECESSEDLIGHTING: "RECESSED_LIGHTING",
    RECESSEDLIGHTINGBUILDER: "RECESSED_LIGHTING",
    SERVICEUPGRADE: "SERVICE_UPGRADE",
    SERVICEUPGRADEBUILDER: "SERVICE_UPGRADE",
    PANELREPLACEMENT: "PANEL_REPLACEMENT",
    PANELREPLACEMENTBUILDER: "PANEL_REPLACEMENT",
    SERVICECALL: "SERVICE_CALL",
    SERVICECALLBUILDER: "SERVICE_CALL",
    TIMEANDMATERIALS: "TIME_MATERIALS",
    TIMEANDMATERIALSBUILDER: "TIME_MATERIALS",
    CUSTOM: "CUSTOM",
    CUSTOMBUILDER: "CUSTOM",
    CUSTOMITEMS: "CUSTOM",
    NEWHOUSE: "NEW_HOUSE",
    NEWHOUSEBUILDER: "NEW_HOUSE",
    CUSTOMITEMSBUILDER: "CUSTOM",
  };
  return aliases[key] ?? null;
}

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

export function formatQuoteNumber(
  sequenceOrLegacyCompanyId: number,
  legacySequence?: number,
) {
  // The optional second argument keeps internal callers compiled during the
  // additive migration; company IDs are deliberately never serialized.
  const sequence = legacySequence ?? sequenceOrLegacyCompanyId;
  return `Q-${String(sequence).padStart(6, "0")}`;
}

function serializeQuote(quote: typeof quotesTable.$inferSelect) {
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    customerId: quote.customerId,
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
    sourceQuoteId: quote.sourceQuoteId,
    revisionNumber: quote.revisionNumber,
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

async function customerByNormalizedEmail(companyId: number, email: string) {
  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.companyId, companyId));
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
  companyId: number;
  name: string;
  email?: string | null;
}) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = normalizeCustomerEmail(input.email);
  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.companyId, input.companyId));
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
              eq(customersTable.companyId, input.companyId),
              isNull(customersTable.email),
            ),
          )
          .returning();
      } catch (error) {
        if (isUniqueConstraintError(error)) {
           const concurrentEmailMatch = await customerByNormalizedEmail(
             input.companyId,
             email,
           );
          if (concurrentEmailMatch) return concurrentEmailMatch;
        }
        throw error;
      }
      if (updated) return updated;
       const concurrentEmailMatch = await customerByNormalizedEmail(
         input.companyId,
         email,
       );
      if (concurrentEmailMatch) return concurrentEmailMatch;
    }
    if (!match.shouldSetEmail) return match.customer;
  }

  try {
    const [customer] = await db
      .insert(customersTable)
      .values({
        companyId: input.companyId,
        name,
        email,
      })
      .returning();
    if (!customer) throw new Error("Unable to create customer");
    return customer;
  } catch (error) {
    if (email && isUniqueConstraintError(error)) {
       const concurrentEmailMatch = await customerByNormalizedEmail(
         input.companyId,
         email,
       );
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

/**
 * Produces proposal-safe scope wording.  Catalog rows are deliberately
 * fail-closed: a future supplier naming convention must not become public
 * merely because it does not resemble a SKU.  User-entered allowances remain
 * useful unless they look like a branded catalog description.
 */
export function customerMaterialDescription(
  description: string,
  line?: { id?: string; category?: string; source?: string },
) {
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
  const genericForCategory =
    line?.category?.toLocaleLowerCase().includes("labor")
      ? "Electrical labor"
      : line?.category?.toLocaleLowerCase().includes("permit")
        ? "Permit and inspection allowance"
        : "Electrical material";
  const catalogOrigin =
    Boolean(line?.source) &&
    !/customer supplied|allowance|custom|manual|labor/i.test(line?.source ?? "");
  // Catalog names, SKUs, URLs, supplier product codes, and unknown
  // supplier-origin descriptions are contractor-only.
  if (
    catalogOrigin ||
    /https?:\/\/|www\.|\b(?:sku|upc|model|part(?:\s*(?:no|number))?)\b/i.test(
      description,
    ) ||
    /[A-Z]{2,}[-\s]?\d{3,}|\b[A-Z0-9]{6,}\b/.test(description)
  ) {
    return genericForCategory;
  }
  // An initial capitalized vendor/brand token followed by a material is a
  // catalog-style name even when it has no URL or part number (for example,
  // “Acme Electrical conduit”). Keep ordinary human-entered scope useful.
  if (/^[A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,2}\s+(?:conduit|wire|cable|panel|breaker|receptacle|switch|fixture|fitting|material)s?$/.test(description) &&
      /^[A-Z]/.test(description)) {
    return genericForCategory;
  }
  return description.trim() || genericForCategory;
}

/** API percentage points -> fractional DB value, retaining legacy fraction clients. */
export function normalizePercentageSetting(value: number) {
  return value > 1 ? value / 100 : value;
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
  return normalizePricingWarnings(warnings).some(
    (warning) => warning.severity === "error",
  );
}

const LABOR_ADJUSTMENT_KEYS = new Set([
  "laborAdjustmentHours",
  "generalLaborAdjustmentHours",
  "relocationLaborHours",
  "accessDifficultyLaborHours",
  "groundingReworkLaborHours",
  "feederDistanceLaborHours",
  "serviceConditionLaborHours",
  "utilityCoordinationLaborHours",
  "panelRemovalLaborHours",
  "feederInstallationLaborHours",
  "groundingLaborHours",
]);

export function negativeLaborAdjustmentFields(
  jobInputs: QuoteJobInputsRecord | Record<string, unknown>,
) {
  return Object.entries(jobInputs)
    .filter(
      ([key, value]) =>
        LABOR_ADJUSTMENT_KEYS.has(key) &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value < 0,
    )
    .map(([key]) => key);
}

type DeliberateLossConfirmation = {
  confirmed: true;
  reason: string;
};

type ReadinessPolicyInput = {
  pricing: PricingRecord;
  assembly: AssemblyLineRecord[];
  jobInputs: QuoteJobInputsRecord | Record<string, unknown>;
  deliberateLossConfirmation?: DeliberateLossConfirmation;
  now?: Date;
};

type ReadinessPolicyResult =
  | { allowed: false; error: string }
  | {
      allowed: true;
      deliberateLossApproval: DeliberateLossApproval | null;
    };

function currentDeliberateLossApproval(
  pricing: PricingRecord,
  totalCost: number,
) {
  const approval = pricing.deliberateLossApproval;
  return Boolean(
    approval &&
      approval.reason.trim().length >= 10 &&
      approval.costAtConfirmation === totalCost &&
      approval.sellingPriceAtConfirmation === pricing.finalSellingPrice,
  );
}

export function evaluateCustomerReadyPricing({
  pricing,
  assembly,
  jobInputs,
  deliberateLossConfirmation,
  now = new Date(),
}: ReadinessPolicyInput): ReadinessPolicyResult {
  if (hasBlockingPricingWarnings(pricing.pricingWarnings)) {
    return {
      allowed: false,
      error:
        "Resolve all missing, unsafe, or invalid material prices before marking this quote ready.",
    };
  }

  if (negativeLaborAdjustmentFields(jobInputs).length > 0) {
    return {
      allowed: false,
      error:
        "Negative labor adjustments are not allowed on customer-ready quotes.",
    };
  }

  const unresolvedContractorMaterials = assembly.filter(
    (line) =>
      line.quantity > 0 &&
      line.unitCost <= 0 &&
      line.source.startsWith("Contractor-entered") &&
      (!line.intentionalExclusionReason ||
        line.intentionalExclusionReason.trim().length < 10),
  );
  if (unresolvedContractorMaterials.length > 0) {
    return {
      allowed: false,
      error:
        "Every active contractor-supplied material needs a cost or an intentional-exclusion reason before marking this quote ready.",
    };
  }

  const effectiveLaborCost = pricing.laborOverride ?? pricing.laborCost;
  const totalCost = Number(
    (pricing.materialCost + effectiveLaborCost).toFixed(2),
  );
  if (pricing.finalSellingPrice + 0.005 < totalCost) {
    if (currentDeliberateLossApproval(pricing, totalCost)) {
      return {
        allowed: true,
        deliberateLossApproval: pricing.deliberateLossApproval ?? null,
      };
    }

    const reason = deliberateLossConfirmation?.reason.trim() ?? "";
    if (
      deliberateLossConfirmation?.confirmed !== true ||
      reason.length < 10
    ) {
      return {
        allowed: false,
        error:
          "Selling price is below calculated cost. Confirm the deliberate loss and record a reason before marking this quote ready.",
      };
    }

    return {
      allowed: true,
      deliberateLossApproval: {
        reason,
        confirmedAt: now.toISOString(),
        costAtConfirmation: totalCost,
        sellingPriceAtConfirmation: pricing.finalSellingPrice,
      },
    };
  }

  return { allowed: true, deliberateLossApproval: null };
}

async function companySettings(companyId: number) {
  await ensureEstimatorSeed();
  const [settings] = await db
    .select()
    .from(companySettingsTable)
    .where(eq(companySettingsTable.companyId, companyId));

  if (!settings) {
    throw new Error("Starter company settings were not initialized");
  }

  return settings;
}

async function calculateEstimate(
  companyId: number,
  module: EstimateModule,
  jobInputs: QuoteJobInputsRecord,
) {
  const settings = await companySettings(companyId);
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
    .where(eq(priceBookItemsTable.companyId, companyId));

  if (module === "BATHROOM" && isBathroomInput(jobInputs)) {
    return calculateBathroomEstimate(jobInputs, settings, priceBook);
  }
  if (module === "KITCHEN" && isKitchenInput(jobInputs)) {
    return calculateKitchenEstimate(jobInputs, settings, priceBook);
  }
  if (module === "ADDITION" && isAdditionInput(jobInputs)) {
    return calculateAdditionEstimate(jobInputs, settings, priceBook);
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
  if (module === "NEW_HOUSE" && isNewHouseInput(jobInputs)) {
    return calculateNewHouseEstimate(jobInputs, settings, priceBook);
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

function isAdditionInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is AdditionInputRecord {
  return (
    "length" in jobInputs &&
    "ceilingFans" in jobInputs &&
    "circuitCount" in jobInputs
  );
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

function isNewHouseInput(
  jobInputs: QuoteJobInputsRecord,
): jobInputs is NewHouseInputRecord {
  return (
    "finishedSquareFootage" in jobInputs &&
    "commonBranchCircuitQuantity" in jobInputs
  );
}

function moduleMatchesInputs(
  module: EstimateModule,
  jobInputs: QuoteJobInputsRecord,
) {
  return (
    (module === "EV_CHARGER" && isEvInput(jobInputs)) ||
    (module === "BATHROOM" && isBathroomInput(jobInputs)) ||
    (module === "KITCHEN" && isKitchenInput(jobInputs)) ||
    (module === "ADDITION" && isAdditionInput(jobInputs)) ||
    (module === "RECESSED_LIGHTING" && isRecessedLightingInput(jobInputs))
    || (module === "SERVICE_UPGRADE" && isServiceUpgradeInput(jobInputs))
    || (module === "PANEL_REPLACEMENT" && isPanelReplacementInput(jobInputs))
    || (module === "SERVICE_CALL" && isServiceCallInput(jobInputs))
    || (module === "TIME_MATERIALS" && isTimeMaterialsInput(jobInputs))
    || (module === "CUSTOM" && isCustomInput(jobInputs))
    || (module === "NEW_HOUSE" && isNewHouseInput(jobInputs))
  );
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  await ensureEstimatorSeed();
  const quotes = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.companyId, companyId))
    .orderBy(desc(quotesTable.updatedAt));

  const operatingQuotes = quotes.filter((quote) => !quote.isDemo);
  const totalQuoted = operatingQuotes.reduce((sum, quote) => sum + quote.total, 0);
  const averageMargin =
    operatingQuotes.length > 0
      ? operatingQuotes.reduce((sum, quote) => sum + quote.margin, 0) / operatingQuotes.length
      : 0;
  const data = GetDashboardSummaryResponse.parse({
    totalQuotes: operatingQuotes.length,
    draftQuotes: operatingQuotes.filter(
      (quote) => normalizeQuoteStatus(quote.status) === "draft",
    ).length,
    readyQuotes: operatingQuotes.filter(
      (quote) => normalizeQuoteStatus(quote.status) === "ready",
    ).length,
    totalQuoted,
    draftPipelineValue: operatingQuotes
      .filter((quote) => normalizeQuoteStatus(quote.status) === "draft")
      .reduce((sum, quote) => sum + quote.total, 0),
    readyProposalValue: operatingQuotes
      .filter((quote) => normalizeQuoteStatus(quote.status) === "ready")
      .reduce((sum, quote) => sum + quote.total, 0),
    averageMargin,
    averageMarginQuoteSet: "All non-demo draft and ready quotes",
    recentQuotes: operatingQuotes.slice(0, 5).map(serializeQuoteSummary),
  });
  req.log.info({ quoteCount: quotes.length }, "Loaded dashboard summary");
  res.json(data);
});

router.get("/customers", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
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
      .where(eq(customersTable.companyId, companyId))
      .orderBy(customersTable.name),
    db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.companyId, companyId)),
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
  const companyId = requestCompanyId(req);
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
      .where(eq(customersTable.companyId, companyId));
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
        companyId,
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
  const companyId = requestCompanyId(req);
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
        eq(customersTable.companyId, companyId),
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
        eq(quotesTable.companyId, companyId),
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
  const companyId = requestCompanyId(req);
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
        eq(customersTable.companyId, companyId),
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
      .where(eq(customersTable.companyId, companyId));
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
          eq(customersTable.companyId, companyId),
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
        eq(quotesTable.companyId, companyId),
      ),
    );
  req.log.info({ customerId: customer.id }, "Updated customer");
  res.json(
    UpdateCustomerResponse.parse(serializeCustomerSummary(customer, quotes)),
  );
});

router.get("/quotes", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
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
    .where(eq(quotesTable.companyId, companyId))
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
  const companyId = requestCompanyId(req);
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
  const negativeLaborFields = negativeLaborAdjustmentFields(
    parsed.data.jobInputs,
  );
  if (negativeLaborFields.length > 0) {
    res.status(400).json({
      error: `Labor adjustments must be non-negative: ${negativeLaborFields.join(", ")}.`,
    });
    return;
  }

  let source: typeof quotesTable.$inferSelect | undefined;
  if (parsed.data.sourceQuoteId !== undefined) {
    [source] = await db
      .select()
      .from(quotesTable)
      .where(
        and(
          eq(quotesTable.id, parsed.data.sourceQuoteId),
          eq(quotesTable.companyId, companyId),
        ),
      );
    if (!source) {
      res.status(404).json({ error: "Source quote not found" });
      return;
    }
    if (normalizeEstimateModule(source.module) !== parsed.data.module) {
      res.status(400).json({ error: "Source quote module does not match this builder" });
      return;
    }
    if (
      parsed.data.customerId !== undefined &&
      parsed.data.customerId !== source.customerId
    ) {
      res.status(400).json({
        error: "A revision must retain the source quote customer",
      });
      return;
    }
  }

  const estimate = await calculateEstimate(
    companyId,
    parsed.data.module,
    parsed.data.jobInputs,
  );

  let customer: typeof customersTable.$inferSelect;
  let quoteCustomerName = parsed.data.customerName;
  let quoteCustomerEmail = parsed.data.customerEmail;
  const effectiveCustomerId = parsed.data.customerId ?? source?.customerId ?? undefined;
  if (effectiveCustomerId !== undefined) {
    const [selectedCustomer] = await db
      .select()
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, effectiveCustomerId),
          eq(customersTable.companyId, companyId),
        ),
      );
    if (!selectedCustomer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    customer = selectedCustomer;
    quoteCustomerName = selectedCustomer.name;
    quoteCustomerEmail = selectedCustomer.email;
  } else {
    customer = await findOrCreateCustomer({
      companyId,
      name: parsed.data.customerName,
      email: parsed.data.customerEmail,
    });
  }

  const pricing = withProfit(estimate.pricing, {
    laborOverride: parsed.data.laborOverride,
    sellingPriceOverride: parsed.data.sellingPriceOverride,
  });
  const quote = await db.transaction(async (tx) => {
    const [company] = await tx
      .update(companiesTable)
      .set({ nextQuoteSequence: sql`${companiesTable.nextQuoteSequence} + 1` })
      .where(eq(companiesTable.id, companyId))
      .returning({ nextQuoteSequence: companiesTable.nextQuoteSequence });
    if (!company) return undefined;
    const [newQuote] = await tx.insert(quotesTable).values({
      companyId,
      customerId: customer.id,
      quoteNumber: formatQuoteNumber(company.nextQuoteSequence - 1),
      // Selected customer identity is authoritative. Legacy create/match
      // continues to preserve the caller's immutable quote snapshot.
      customerName: quoteCustomerName,
      customerEmail: quoteCustomerEmail,
      projectName: parsed.data.projectName,
      module: parsed.data.module,
      status: "draft",
      jobInputs: parsed.data.jobInputs,
      assembly: estimate.assembly,
      pricing,
      proposalDescription: parsed.data.proposalDescription,
      total: pricing.finalSellingPrice,
      margin: pricing.grossMargin,
      sourceQuoteId: source?.id,
      revisionNumber: source ? source.revisionNumber + 1 : 0,
    }).returning();
    return newQuote;
  });

  if (!quote) {
    throw new Error("Unable to create quote");
  }

  req.log.info({ quoteId: quote.id }, "Created quote");
  res.status(201).json(CreateQuoteResponse.parse(serializeQuote(quote)));
});

router.post("/quotes/preview", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
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
  const negativeLaborFields = negativeLaborAdjustmentFields(
    parsed.data.jobInputs,
  );
  if (negativeLaborFields.length > 0) {
    res.status(400).json({
      error: `Labor adjustments must be non-negative: ${negativeLaborFields.join(", ")}.`,
    });
    return;
  }

  const estimate = await calculateEstimate(
    companyId,
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
    normalizeQuoteStatus(quote.status) !== "ready" ||
    !tokenData ||
    quote.updatedAt.getTime() !== tokenData.timestamp
  ) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }
  const [settings, company] = await Promise.all([
    db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, quote.companyId)).then(([row]) => row),
    db.select().from(companiesTable).where(eq(companiesTable.id, quote.companyId)).then(([row]) => row),
  ]);

  res.json(
    GetCustomerProposalResponse.parse({
      quoteNumber: quote.quoteNumber,
      customerName: quote.customerName,
      projectName: quote.projectName,
      status: normalizeQuoteStatus(quote.status),
      proposalDescription: quote.proposalDescription,
      createdAt: quote.createdAt.toISOString(),
      finalSellingPrice: quote.pricing.finalSellingPrice,
      scope: quote.assembly.map((line) => ({
        id: line.id,
        description: customerMaterialDescription(line.description, line),
        quantity: line.quantity,
        unit: line.unit,
      })),
      company: {
        displayName: company?.name ?? "Electrical Contractor",
        contactPhone: settings?.contactPhone ?? null,
        contactEmail: settings?.contactEmail ?? null,
        contactAddress: settings?.contactAddress ?? null,
        accentColor: settings?.proposalAccentColor ?? "#2563eb",
      },
      terms: settings?.proposalTerms ?? "",
    }),
  );
});

router.post("/quotes/:id/duplicate", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  await ensureEstimatorSeed();
  const params = DuplicateQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [source] = await db.select().from(quotesTable).where(and(
    eq(quotesTable.id, params.data.id),
    eq(quotesTable.companyId, companyId),
  ));
  if (!source) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  const draft = await db.transaction(async (tx) => {
    const [company] = await tx.update(companiesTable)
      .set({ nextQuoteSequence: sql`${companiesTable.nextQuoteSequence} + 1` })
      .where(eq(companiesTable.id, companyId))
      .returning({ nextQuoteSequence: companiesTable.nextQuoteSequence });
    if (!company) return undefined;
    const [quote] = await tx.insert(quotesTable).values({
      companyId,
      customerId: source.customerId,
      quoteNumber: formatQuoteNumber(company.nextQuoteSequence - 1),
      customerName: source.customerName,
      customerEmail: source.customerEmail,
      projectName: source.projectName,
      module: source.module,
      status: "draft",
      jobInputs: source.jobInputs,
      assembly: source.assembly,
      pricing: source.pricing,
      proposalDescription: source.proposalDescription,
      total: source.total,
      margin: source.margin,
      sourceQuoteId: source.id,
      revisionNumber: source.revisionNumber + 1,
    }).returning();
    return quote;
  });
  if (!draft) throw new Error("Unable to duplicate quote");
  res.status(201).json(DuplicateQuoteResponse.parse(serializeQuote(draft)));
});

router.get("/quotes/:id", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  await ensureEstimatorSeed();
  const params = GetQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.id, params.data.id),
        eq(quotesTable.companyId, companyId),
      ),
    );

  if (!quote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.json(GetQuoteResponse.parse(serializeQuote(quote)));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
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
    .where(
      and(
        eq(quotesTable.id, params.data.id),
        eq(quotesTable.companyId, companyId),
      ),
    );
  if (!existingQuote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  const targetStatus =
    parsed.data.status ?? normalizeQuoteStatus(existingQuote.status);
  let pricing = pricingForQuoteUpdate(existingQuote.pricing, parsed.data);
  if (targetStatus === "ready") {
    const readiness = evaluateCustomerReadyPricing({
      pricing,
      assembly: existingQuote.assembly,
      jobInputs: existingQuote.jobInputs,
      deliberateLossConfirmation: parsed.data.deliberateLossConfirmation,
    });
    if (!readiness.allowed) {
      res.status(409).json({ error: readiness.error });
      return;
    }
    pricing = {
      ...pricing,
      deliberateLossApproval: readiness.deliberateLossApproval,
    };
  } else if (pricing.deliberateLossApproval) {
    pricing = { ...pricing, deliberateLossApproval: null };
  }
  const [quote] = await db
    .update(quotesTable)
    .set({
      status: targetStatus,
      pricing,
      proposalDescription: parsed.data.proposalDescription,
      total: pricing.finalSellingPrice,
      margin: pricing.grossMargin,
    })
    .where(
      and(
        eq(quotesTable.id, existingQuote.id),
        eq(quotesTable.companyId, companyId),
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

router.get("/price-book", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  await ensureEstimatorSeed();
  const items = await db
    .select()
    .from(priceBookItemsTable)
    .where(eq(priceBookItemsTable.companyId, companyId))
    .orderBy(priceBookItemsTable.category, priceBookItemsTable.item);

  res.json(
    ListPriceBookItemsResponse.parse(
      items.map((item) => ({
        ...item,
        ...auditPriceBookItem(item),
        updatedAt: item.updatedAt.toISOString(),
      })),
    ),
  );
});

router.patch("/price-book/:id", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
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
        eq(priceBookItemsTable.companyId, companyId),
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
      ...auditPriceBookItem(item),
      updatedAt: item.updatedAt.toISOString(),
    }),
  );
});

router.get("/settings", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  const settings = await companySettings(companyId);
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));

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
      additionLaborAdjustmentHours: settings.additionLaborAdjustmentHours,
      recessedLightingLaborAdjustmentHours:
        settings.recessedLightingLaborAdjustmentHours,
      serviceUpgradeCrewSize: settings.serviceUpgradeCrewSize,
      serviceUpgradeHoursPerPerson: settings.serviceUpgradeHoursPerPerson,
      panelReplacementCrewSize: settings.panelReplacementCrewSize,
      panelReplacementHoursPerPerson: settings.panelReplacementHoursPerPerson,
      serviceCallVisitQuantity: settings.serviceCallVisitQuantity,
      serviceCallCrewSize: settings.serviceCallCrewSize,
      serviceCallHoursPerVisit: settings.serviceCallHoursPerVisit,
      timeMaterialsCrewSize: settings.timeMaterialsCrewSize,
      timeMaterialsHours: settings.timeMaterialsHours,
      timeMaterialsLaborRateType: settings.timeMaterialsLaborRateType,
      timeMaterialsLaborSellRate: settings.timeMaterialsLaborSellRate,
      timeMaterialsLoadedLaborCost: settings.timeMaterialsLoadedLaborCost,
      timeMaterialsMaterialMarkup: settings.timeMaterialsMaterialMarkup * 100,
      timeMaterialsTargetMargin: settings.timeMaterialsTargetMargin * 100,
      customLaborHours: settings.customLaborHours,
      customLaborRateType: settings.customLaborRateType,
      customLaborSellRate: settings.customLaborSellRate,
      customLoadedLaborCost: settings.customLoadedLaborCost,
      customMaterialMarkup: settings.customMaterialMarkup * 100,
      customTargetMargin: settings.customTargetMargin * 100,
      newHouseCrewSize: settings.newHouseCrewSize,
      newHouseHoursPerPerson: settings.newHouseHoursPerPerson,
      newHouseLaborAdjustmentHours: settings.newHouseLaborAdjustmentHours,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      contactAddress: settings.contactAddress,
      proposalAccentColor: settings.proposalAccentColor,
      proposalTerms: settings.proposalTerms,
    }),
  );
});

router.patch("/settings", async (req, res): Promise<void> => {
  const companyId = requestCompanyId(req);
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const currentSettings = await companySettings(companyId);
  const residentialLaborSellRate =
    parsed.data.residentialLaborSellRate ??
    parsed.data.laborRate ??
    currentSettings.residentialLaborSellRate;
  if (parsed.data.companyName !== undefined) {
    await db
      .update(companiesTable)
      .set({ name: parsed.data.companyName })
      .where(eq(companiesTable.id, companyId));
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
      additionLaborAdjustmentHours:
        parsed.data.additionLaborAdjustmentHours ??
        currentSettings.additionLaborAdjustmentHours,
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
      serviceCallVisitQuantity: parsed.data.serviceCallVisitQuantity ?? currentSettings.serviceCallVisitQuantity,
      serviceCallCrewSize: parsed.data.serviceCallCrewSize ?? currentSettings.serviceCallCrewSize,
      serviceCallHoursPerVisit: parsed.data.serviceCallHoursPerVisit ?? currentSettings.serviceCallHoursPerVisit,
      timeMaterialsCrewSize: parsed.data.timeMaterialsCrewSize ?? currentSettings.timeMaterialsCrewSize,
      timeMaterialsHours: parsed.data.timeMaterialsHours ?? currentSettings.timeMaterialsHours,
      timeMaterialsLaborRateType: parsed.data.timeMaterialsLaborRateType ?? currentSettings.timeMaterialsLaborRateType,
      timeMaterialsLaborSellRate: parsed.data.timeMaterialsLaborSellRate ?? currentSettings.timeMaterialsLaborSellRate,
      timeMaterialsLoadedLaborCost: parsed.data.timeMaterialsLoadedLaborCost ?? currentSettings.timeMaterialsLoadedLaborCost,
      timeMaterialsMaterialMarkup: parsed.data.timeMaterialsMaterialMarkup === undefined ? currentSettings.timeMaterialsMaterialMarkup : normalizePercentageSetting(parsed.data.timeMaterialsMaterialMarkup),
      timeMaterialsTargetMargin: parsed.data.timeMaterialsTargetMargin === undefined ? currentSettings.timeMaterialsTargetMargin : normalizePercentageSetting(parsed.data.timeMaterialsTargetMargin),
      customLaborHours: parsed.data.customLaborHours ?? currentSettings.customLaborHours,
      customLaborRateType: parsed.data.customLaborRateType ?? currentSettings.customLaborRateType,
      customLaborSellRate: parsed.data.customLaborSellRate ?? currentSettings.customLaborSellRate,
      customLoadedLaborCost: parsed.data.customLoadedLaborCost ?? currentSettings.customLoadedLaborCost,
      customMaterialMarkup: parsed.data.customMaterialMarkup === undefined ? currentSettings.customMaterialMarkup : normalizePercentageSetting(parsed.data.customMaterialMarkup),
      customTargetMargin: parsed.data.customTargetMargin === undefined ? currentSettings.customTargetMargin : normalizePercentageSetting(parsed.data.customTargetMargin),
      newHouseCrewSize: parsed.data.newHouseCrewSize ?? currentSettings.newHouseCrewSize,
      newHouseHoursPerPerson: parsed.data.newHouseHoursPerPerson ?? currentSettings.newHouseHoursPerPerson,
      newHouseLaborAdjustmentHours: parsed.data.newHouseLaborAdjustmentHours ?? currentSettings.newHouseLaborAdjustmentHours,
      contactPhone: "contactPhone" in parsed.data ? parsed.data.contactPhone : currentSettings.contactPhone,
      contactEmail: "contactEmail" in parsed.data ? parsed.data.contactEmail : currentSettings.contactEmail,
      contactAddress: "contactAddress" in parsed.data ? parsed.data.contactAddress : currentSettings.contactAddress,
      proposalAccentColor: parsed.data.proposalAccentColor ?? currentSettings.proposalAccentColor,
      proposalTerms: parsed.data.proposalTerms ?? currentSettings.proposalTerms,
    })
    .where(eq(companySettingsTable.id, currentSettings.id))
    .returning();
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));

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
      additionLaborAdjustmentHours: settings.additionLaborAdjustmentHours,
      recessedLightingLaborAdjustmentHours:
        settings.recessedLightingLaborAdjustmentHours,
      serviceUpgradeCrewSize: settings.serviceUpgradeCrewSize,
      serviceUpgradeHoursPerPerson: settings.serviceUpgradeHoursPerPerson,
      panelReplacementCrewSize: settings.panelReplacementCrewSize,
      panelReplacementHoursPerPerson: settings.panelReplacementHoursPerPerson,
      serviceCallVisitQuantity: settings.serviceCallVisitQuantity,
      serviceCallCrewSize: settings.serviceCallCrewSize,
      serviceCallHoursPerVisit: settings.serviceCallHoursPerVisit,
      timeMaterialsCrewSize: settings.timeMaterialsCrewSize,
      timeMaterialsHours: settings.timeMaterialsHours,
      timeMaterialsLaborRateType: settings.timeMaterialsLaborRateType,
      timeMaterialsLaborSellRate: settings.timeMaterialsLaborSellRate,
      timeMaterialsLoadedLaborCost: settings.timeMaterialsLoadedLaborCost,
      timeMaterialsMaterialMarkup: settings.timeMaterialsMaterialMarkup * 100,
      timeMaterialsTargetMargin: settings.timeMaterialsTargetMargin * 100,
      customLaborHours: settings.customLaborHours,
      customLaborRateType: settings.customLaborRateType,
      customLaborSellRate: settings.customLaborSellRate,
      customLoadedLaborCost: settings.customLoadedLaborCost,
      customMaterialMarkup: settings.customMaterialMarkup * 100,
      customTargetMargin: settings.customTargetMargin * 100,
      newHouseCrewSize: settings.newHouseCrewSize,
      newHouseHoursPerPerson: settings.newHouseHoursPerPerson,
      newHouseLaborAdjustmentHours: settings.newHouseLaborAdjustmentHours,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      contactAddress: settings.contactAddress,
      proposalAccentColor: settings.proposalAccentColor,
      proposalTerms: settings.proposalTerms,
    }),
  );
});

export default router;