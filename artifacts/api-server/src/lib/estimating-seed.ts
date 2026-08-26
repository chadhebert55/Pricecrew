import { and, eq } from "drizzle-orm";
import {
  companiesTable,
  companySettingsTable,
  customersTable,
  db,
  priceBookItemsTable,
  quotesTable,
  type AssemblyLineRecord,
  type EvChargerInputRecord,
  type PricingRecord,
} from "@workspace/db";

export const DEFAULT_COMPANY_ID = 1;

let seedPromise: Promise<void> | undefined;

const starterInputs: EvChargerInputRecord = {
  chargerQuantity: 1,
  chargerOutputAmps: 40,
  circuitAmps: "Auto (50A default)",
  chargerSupply: "Customer supplied",
  connection: "Hardwired",
  routeLength: 30,
  wiringMethod: "EMT",
  location: "Garage — indoor",
  panelManufacturer: "Square D",
  panelSpace: "2 spaces available",
  breakerRequirement: "New 2-pole breaker",
  access: "Clear access",
  permit: "Required",
  loadManagement: "Not required",
  disconnect: "Not required",
  surgeProtection: "Include",
  panelModifications: "None",
  difficulty: "Standard",
  notes: "Starter estimate uses default material and labor pricing.",
};

const starterAssembly: AssemblyLineRecord[] = [
  {
    id: "breaker-50a",
    category: "Protection",
    description: "2-pole 50A breaker (default cost)",
    quantity: 1,
    unit: "ea",
    unitCost: 52,
    extendedCost: 52,
    source: "Default price book",
  },
  {
    id: "wire-8",
    category: "Conductor",
    description: "#8 copper THHN — two hots",
    quantity: 60,
    unit: "ft",
    unitCost: 2.4,
    extendedCost: 144,
    source: "Default price book",
  },
  {
    id: "ground-10",
    category: "Conductor",
    description: "#10 copper grounding conductor",
    quantity: 30,
    unit: "ft",
    unitCost: 1.1,
    extendedCost: 33,
    source: "Default price book",
  },
  {
    id: "emt-1",
    category: "Raceway",
    description: "1 in. EMT raceway with fittings",
    quantity: 30,
    unit: "ft",
    unitCost: 5.25,
    extendedCost: 157.5,
    source: "Default price book",
  },
  {
    id: "surge",
    category: "Protection",
    description: "Whole-home surge protection",
    quantity: 1,
    unit: "ea",
    unitCost: 85,
    extendedCost: 85,
    source: "Default price book",
  },
];

const starterPricing: PricingRecord = {
  materialCost: 471.5,
  laborCost: 475,
  materialMarkup: 0.25,
  calculatedSellingPrice: 1420,
  finalSellingPrice: 1420,
  laborOverride: null,
  sellingPriceOverride: null,
  grossProfit: 473.5,
  grossMargin: 0.3335,
  pricingWarnings: [],
};

export function ensureEstimatorSeed(): Promise<void> {
  seedPromise ??= seedEstimatorData();
  return seedPromise;
}

async function seedEstimatorData(): Promise<void> {
  const [existingCompany] = await db.select().from(companiesTable).limit(1);
  const company =
    existingCompany ??
    (
      await db
        .insert(companiesTable)
        .values({ id: DEFAULT_COMPANY_ID, name: "Starter Electrical Co." })
        .returning()
    )[0];

  if (!company) {
    throw new Error("Unable to create starter estimating company");
  }

  const [existingSettings] = await db
    .select()
    .from(companySettingsTable)
    .where(eq(companySettingsTable.companyId, company.id));

  if (!existingSettings) {
    await db.insert(companySettingsTable).values({
      companyId: company.id,
      laborRate: 95,
      materialMarkup: 0.25,
      targetMargin: 0.4,
      defaultTaxRate: 0,
    });
  }

  const [existingCustomer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.companyId, company.id))
    .limit(1);

  const customer =
    existingCustomer ??
    (
      await db
        .insert(customersTable)
        .values({
          companyId: company.id,
          name: "Waverly Property Group",
          email: "projects@waverly.example",
        })
        .returning()
    )[0];

  const [existingPriceBookItem] = await db
    .select()
    .from(priceBookItemsTable)
    .where(eq(priceBookItemsTable.companyId, company.id))
    .limit(1);

  if (!existingPriceBookItem) {
    await db.insert(priceBookItemsTable).values([
      {
        companyId: company.id,
        category: "Protection",
        item: "2-pole 50A breaker",
        unit: "ea",
        unitCost: 52,
        isDefault: true,
      },
      {
        companyId: company.id,
        category: "Conductor",
        item: "#8 copper THHN",
        unit: "ft",
        unitCost: 2.4,
        isDefault: true,
      },
      {
        companyId: company.id,
        category: "Conductor",
        item: "#10 copper grounding conductor",
        unit: "ft",
        unitCost: 1.1,
        isDefault: true,
      },
      {
        companyId: company.id,
        category: "Raceway",
        item: "1 in. EMT with fittings",
        unit: "ft",
        unitCost: 5.25,
        isDefault: true,
      },
      {
        companyId: company.id,
        category: "Protection",
        item: "Whole-home surge protection",
        unit: "ea",
        unitCost: 85,
        isDefault: true,
      },
    ]);
  }

  const [existingSiemensBreaker] = await db
    .select()
    .from(priceBookItemsTable)
    .where(
      and(
        eq(priceBookItemsTable.companyId, company.id),
        eq(priceBookItemsTable.supplierSku, "1101170"),
      ),
    )
    .limit(1);

  const siemensBreaker = {
    companyId: company.id,
    category: "Protection",
    item: "Siemens / ITE QF250A 50A 2-pole GFCI breaker",
    unit: "ea",
    unitCost: 151.702,
    supplier: "Northeast Electrical",
    manufacturer: "Siemens",
    manufacturerPartNumber: "ITE QF250A",
    supplierSku: "1101170",
    sourceDate: "2026-08-25",
    amperage: 50,
    poleCount: 2,
    protectionType: "GFCI",
    isDefault: false,
  };

  if (existingSiemensBreaker) {
    await db
      .update(priceBookItemsTable)
      .set(siemensBreaker)
      .where(eq(priceBookItemsTable.id, existingSiemensBreaker.id));
  } else {
    await db.insert(priceBookItemsTable).values(siemensBreaker);
  }

  const maintainableItems = [
    { category: "Devices", item: "GFCI receptacle", unit: "ea", unitCost: 24 },
    { category: "Devices", item: "standard receptacle", unit: "ea", unitCost: 6 },
    { category: "Lighting", item: "vanity light allowance", unit: "ea", unitCost: 95 },
    { category: "Lighting", item: "recessed light", unit: "ea", unitCost: 38 },
    { category: "Ventilation", item: "exhaust fan", unit: "ea", unitCost: 145 },
    { category: "Ventilation", item: "fan/light", unit: "ea", unitCost: 210 },
    { category: "Ventilation", item: "fan/light/heat", unit: "ea", unitCost: 360 },
    { category: "Circuit", item: "heated floor circuit allowance", unit: "ea", unitCost: 195 },
    { category: "Devices", item: "single-pole switch", unit: "ea", unitCost: 9 },
    { category: "Circuit", item: "bathroom circuit materials", unit: "ea", unitCost: 135 },
    { category: "Protection", item: "bathroom circuit protection allowance", unit: "ea", unitCost: 52 },
    { category: "Rough-in", item: "single-gang box", unit: "ea", unitCost: 3.5 },
    { category: "Trim", item: "device plate", unit: "ea", unitCost: 1.25 },
    { category: "Conductor", item: "#12 NM-B cable", unit: "ft", unitCost: 0.95 },
    { category: "Circuit", item: "refrigerator circuit materials", unit: "ea", unitCost: 85 },
    { category: "Circuit", item: "dishwasher circuit materials", unit: "ea", unitCost: 85 },
    { category: "Circuit", item: "disposal circuit materials", unit: "ea", unitCost: 75 },
    { category: "Circuit", item: "gas range circuit materials", unit: "ea", unitCost: 65 },
    { category: "Circuit", item: "electric range circuit materials", unit: "ea", unitCost: 260 },
    { category: "Circuit", item: "additional dedicated circuit materials", unit: "ea", unitCost: 85 },
    { category: "Devices", item: "countertop GFCI receptacle", unit: "ea", unitCost: 24 },
    { category: "Devices", item: "USB receptacle", unit: "ea", unitCost: 22 },
    { category: "Lighting", item: "sink light", unit: "ea", unitCost: 38 },
    { category: "Lighting", item: "island pendant", unit: "ea", unitCost: 95 },
    { category: "Lighting", item: "undercabinet lighting", unit: "ea", unitCost: 120 },
    { category: "Lighting", item: "kitchen recessed light", unit: "ea", unitCost: 38 },
    { category: "Controls", item: "3-way switch pair", unit: "ea", unitCost: 26 },
    { category: "Controls", item: "dimmer switch", unit: "ea", unitCost: 28 },
  ];
  const companyPriceBook = await db
    .select({ item: priceBookItemsTable.item })
    .from(priceBookItemsTable)
    .where(eq(priceBookItemsTable.companyId, company.id));
  const existingItemNames = new Set(
    companyPriceBook.map(({ item }) => item.toLowerCase()),
  );

  for (const item of maintainableItems) {
    if (existingItemNames.has(item.item.toLowerCase())) continue;
    await db.insert(priceBookItemsTable).values({
      companyId: company.id,
      ...item,
      isDefault: true,
    });
  }

  const [existingQuote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.companyId, company.id))
    .limit(1);

  if (!existingQuote && customer) {
    await db.insert(quotesTable).values({
      companyId: company.id,
      customerId: customer.id,
      quoteNumber: "Q-1024",
      customerName: customer.name,
      customerEmail: customer.email,
      projectName: "Fleet charging installation",
      module: "EV Charger Builder",
      status: "ready",
      jobInputs: starterInputs,
      assembly: starterAssembly,
      pricing: starterPricing,
      proposalDescription:
        "Provide and install one customer-supplied EV charger on a new 50A circuit, including #8 copper conductors, raceway, circuit protection, surge protection, standard access, and permit coordination. Final field conditions and applicable code requirements will be verified before work begins.",
      total: starterPricing.finalSellingPrice,
      margin: starterPricing.grossMargin,
    });
  }
}