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

export const SIEMENS_QF250A_SEED_COST = 151.702;

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

export async function seedEstimatorData(
  database: typeof db = db,
): Promise<void> {
  const [existingCompany] = await database
    .select()
    .from(companiesTable)
    .limit(1);
  const company =
    existingCompany ??
    (
      await database
        .insert(companiesTable)
        .values({ id: DEFAULT_COMPANY_ID, name: "Starter Electrical Co." })
        .returning()
    )[0];

  if (!company) {
    throw new Error("Unable to create starter estimating company");
  }

  const [existingSettings] = await database
    .select()
    .from(companySettingsTable)
    .where(eq(companySettingsTable.companyId, company.id));

  if (!existingSettings) {
    await database.insert(companySettingsTable).values({
      companyId: company.id,
      laborRate: 95,
      residentialLaborSellRate: 150,
      commercialLaborSellRate: 165,
      loadedLaborCost: 65,
      materialMarkup: 0.25,
      targetMargin: 0.4,
      defaultTaxRate: 0,
    });
  }

  const [existingCustomer] = await database
    .select()
    .from(customersTable)
    .where(eq(customersTable.companyId, company.id))
    .limit(1);

  const customer =
    existingCustomer ??
    (
      await database
        .insert(customersTable)
        .values({
          companyId: company.id,
          name: "Waverly Property Group",
          email: "projects@waverly.example",
        })
        .returning()
    )[0];

  const [existingPriceBookItem] = await database
    .select()
    .from(priceBookItemsTable)
    .where(eq(priceBookItemsTable.companyId, company.id))
    .limit(1);

  if (!existingPriceBookItem) {
    await database.insert(priceBookItemsTable).values([
      {
        companyId: company.id,
        category: "Protection",
        item: "Unverified allowance — generic 2-pole 50A breaker",
        unit: "ea",
        unitCost: 52,
        isDefault: true,
      },
      {
        companyId: company.id,
        category: "Conductor",
        item: "Unverified starter allowance — #8 copper THHN",
        unit: "ft",
        unitCost: 2.4,
        isDefault: true,
      },
      {
        companyId: company.id,
        category: "Conductor",
        item: "Unverified starter allowance — #10 copper grounding conductor",
        unit: "ft",
        unitCost: 1.1,
        isDefault: true,
      },
      {
        companyId: company.id,
        category: "Raceway",
        item: "Unverified starter allowance — 1 in. EMT with fittings",
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

  type SeedPriceBookItem = Omit<
    typeof priceBookItemsTable.$inferInsert,
    "id" | "companyId" | "updatedAt"
  >;
  const sourceDate = "2026-08-25";
  const controlSourceDate = "2026-08-26";
  const additionalServiceItems: SeedPriceBookItem[] = [
    ...([100, 150] as const).map((amperage) => ({
      category: "Equipment",
      item: `${amperage}A outdoor meter/disconnect`,
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    })),
    ...([
      ["Siemens", 100],
      ["Siemens", 150],
      ["Eaton", 100],
      ["Eaton", 150],
      ["Eaton", 200],
      ["Square D", 100],
      ["Square D", 150],
      ["Square D", 200],
    ] as const).map(([manufacturer, amperage]) => ({
      category: "Panel",
      item: `${manufacturer} ${amperage}A service panel`,
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer,
      sourceDate,
      isDefault: false,
    })),
    ...(["Siemens", "Eaton", "Square D"] as const).flatMap((manufacturer) =>
      ([100, 150, 200] as const).flatMap((amperage) =>
        (["Standard", "GFCI", "AFCI", "Dual Function"] as const).map(
          (protectionType) => ({
            category: "Protection",
            item: `${manufacturer} ${amperage}A 2-pole ${protectionType} breaker`,
            unit: "ea",
            unitCost: 0,
            supplier: "Company default — set current cost",
            manufacturer,
            sourceDate,
            amperage,
            poleCount: 2,
            protectionType,
            isDefault: false,
          }),
        ),
      ),
    ),
    ...[
      ["1/0 aluminum XHHW conductor", "ft"],
      ["3/0 aluminum XHHW conductor", "ft"],
      ["1/0 aluminum SER cable", "ft"],
      ["3/0 aluminum SER cable", "ft"],
      ["1/0 copper service conductor alternative", "ft"],
      ["2/0 copper service conductor alternative", "ft"],
    ].map(([item, unit]) => ({
      category: "Conductor",
      item,
      unit,
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    })),
  ];
  const verifiedItems: SeedPriceBookItem[] = [
    ...additionalServiceItems,
    {
      category: "Protection",
      item: "Siemens / ITE QF250A 50A 2-pole GFCI breaker",
      unit: "ea",
      unitCost: SIEMENS_QF250A_SEED_COST,
      supplier: "Northeast Electrical",
      manufacturer: "Siemens",
      manufacturerPartNumber: "ITE QF250A",
      supplierSku: "1101170",
      sourceDate,
      amperage: 50,
      poleCount: 2,
      protectionType: "GFCI",
      isDefault: false,
    },
    {
      category: "Devices",
      item: "Pass & Seymour 3232-TRW 15A TR duplex receptacle",
      unit: "ea",
      unitCost: 1,
      supplier: "Northeast Electrical",
      manufacturer: "Pass & Seymour",
      manufacturerPartNumber: "3232-TRW",
      supplierSku: "243085",
      sourceDate,
      amperage: 15,
      isDefault: false,
    },
    {
      category: "Devices",
      item: "Pass & Seymour 1597-TRWRW 15A TR self-test GFCI",
      unit: "ea",
      unitCost: 17.25,
      supplier: "Northeast Electrical",
      manufacturer: "Pass & Seymour",
      manufacturerPartNumber: "1597-TRWRW",
      supplierSku: "1003404",
      sourceDate,
      amperage: 15,
      protectionType: "GFCI",
      isDefault: false,
    },
    {
      category: "Devices",
      item: "Pass & Seymour 2097-TRWRW 20A TR self-test GFCI",
      unit: "ea",
      unitCost: 27.753,
      supplier: "Northeast Electrical",
      manufacturer: "Pass & Seymour",
      manufacturerPartNumber: "2097-TRWRW",
      supplierSku: "1020717",
      sourceDate,
      amperage: 20,
      protectionType: "GFCI",
      isDefault: false,
    },
    {
      category: "Controls",
      item: "Legrand radiant TM870WCC10 15A single-pole switch",
      unit: "ea",
      unitCost: 4.55,
      supplier: "Legrand",
      manufacturer: "Legrand",
      manufacturerPartNumber: "TM870WCC10",
      supplierSku: "TM870WCC10",
      sourceDate: controlSourceDate,
      amperage: 15,
      isDefault: false,
    },
    {
      category: "Controls",
      item: "Legrand radiant TM873WCC10 15A 3-way switch",
      unit: "ea",
      unitCost: 6.83,
      supplier: "Legrand",
      manufacturer: "Legrand",
      manufacturerPartNumber: "TM873WCC10",
      supplierSku: "TM873WCC10",
      sourceDate: controlSourceDate,
      amperage: 15,
      isDefault: false,
    },
    {
      category: "Controls",
      item: "Legrand radiant TM874WCC10 15A 4-way switch",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Legrand",
      manufacturerPartNumber: "TM874WCC10",
      supplierSku: "TM874WCC10",
      sourceDate: controlSourceDate,
      amperage: 15,
      isDefault: false,
    },
    {
      category: "Controls",
      item: "Legrand radiant RHL153PWPW LED dimmer with wall plate",
      unit: "ea",
      unitCost: 36.75,
      supplier: "Legrand",
      manufacturer: "Legrand",
      manufacturerPartNumber: "RHL153PWPW",
      supplierSku: "RHL153PWPW",
      sourceDate: controlSourceDate,
      isDefault: false,
    },
    {
      category: "Controls",
      item:
        "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote combo-pack",
      unit: "kit",
      unitCost: 85,
      supplier: "Lutron",
      manufacturer: "Lutron",
      sourceDate: controlSourceDate,
      isDefault: false,
    },
    {
      category: "Trim",
      item: "Legrand radiant RWP26WCC10 1-gang screwless wall plate",
      unit: "ea",
      unitCost: 4.63,
      supplier: "Legrand",
      manufacturer: "Legrand",
      manufacturerPartNumber: "RWP26WCC10",
      supplierSku: "RWP26WCC10",
      sourceDate: controlSourceDate,
      isDefault: false,
    },
    {
      category: "Rough-in",
      item: "Carlon B114R-UPC 14 cu. in. single-gang old-work box",
      unit: "ea",
      unitCost: 3.28,
      supplier: "Electrical Parts",
      manufacturer: "Carlon",
      manufacturerPartNumber: "B114R-UPC",
      sourceDate: controlSourceDate,
      isDefault: false,
    },
    {
      category: "Devices",
      item: "Kitchen small-appliance circuit device assumption",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate: controlSourceDate,
      isDefault: false,
    },
    {
      category: "Devices",
      item: "Kitchen microwave circuit device assumption",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate: controlSourceDate,
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Siemens Q115 15A 1-pole standard breaker",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Siemens",
      manufacturerPartNumber: "Q115",
      supplierSku: "Q115",
      sourceDate: controlSourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Eaton BR115 15A 1-pole standard breaker",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Eaton",
      manufacturerPartNumber: "BR115",
      supplierSku: "BR115",
      sourceDate: controlSourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D Homeline HOM115 15A 1-pole standard breaker",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Square D",
      manufacturerPartNumber: "HOM115",
      supplierSku: "HOM115",
      sourceDate: controlSourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Ventilation",
      item: "Panasonic FV-0511VF1 exhaust fan",
      unit: "ea",
      unitCost: 119.291,
      supplier: "Northeast Electrical",
      manufacturer: "Panasonic",
      manufacturerPartNumber: "FV-0511VF1",
      supplierSku: "1697956",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Siemens Q120 20A 1-pole standard breaker",
      unit: "ea",
      unitCost: 8.673,
      supplier: "Northeast Electrical",
      manufacturer: "Siemens",
      manufacturerPartNumber: "Q120",
      supplierSku: "2149",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Siemens Q120DF 20A 1-pole dual-function breaker",
      unit: "ea",
      unitCost: 69.239,
      supplier: "Northeast Electrical",
      manufacturer: "Siemens",
      manufacturerPartNumber: "Q120DF",
      supplierSku: "942105",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "Dual Function",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Siemens QF120A 20A 1-pole GFCI breaker",
      unit: "ea",
      unitCost: 71.027,
      supplier: "Northeast Electrical",
      manufacturer: "Siemens",
      manufacturerPartNumber: "QF120A",
      supplierSku: "1098885",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "GFCI",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Eaton BR120 20A 1-pole standard breaker",
      unit: "ea",
      unitCost: 23.137,
      supplier: "Northeast Electrical",
      manufacturer: "Eaton",
      manufacturerPartNumber: "BR120",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Eaton BRN120AF 20A 1-pole AFCI breaker",
      unit: "ea",
      unitCost: 121.398,
      supplier: "Northeast Electrical",
      manufacturer: "Eaton",
      manufacturerPartNumber: "BRN120AF",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "AFCI",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Eaton BRN120DF 20A 1-pole dual-function breaker",
      unit: "ea",
      unitCost: 158.137,
      supplier: "Northeast Electrical",
      manufacturer: "Eaton",
      manufacturerPartNumber: "BRN120DF",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "Dual Function",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D Homeline HOM120 20A 1-pole standard breaker",
      unit: "ea",
      unitCost: 13.321,
      supplier: "Northeast Electrical",
      manufacturer: "Square D",
      manufacturerPartNumber: "HOM120",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D Homeline HOM120GFI 20A 1-pole GFCI breaker",
      unit: "ea",
      unitCost: 133.651,
      supplier: "Northeast Electrical",
      manufacturer: "Square D",
      manufacturerPartNumber: "HOM120GFI",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "GFCI",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D Homeline HOM120PAFGF 20A 1-pole dual-function breaker",
      unit: "ea",
      unitCost: 152.012,
      supplier: "Northeast Electrical",
      manufacturer: "Square D",
      manufacturerPartNumber: "HOM120PAFGF",
      sourceDate,
      amperage: 20,
      poleCount: 1,
      protectionType: "Dual Function",
      isDefault: false,
    },
    {
      category: "Lighting",
      item: "Juno 4-inch regressed wafer light",
      unit: "ea",
      unitCost: 29,
      supplier: "Northeast Electrical",
      manufacturer: "Juno",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Lighting",
      item: "Juno 6-inch regressed wafer light",
      unit: "ea",
      unitCost: 32,
      supplier: "Northeast Electrical",
      manufacturer: "Juno",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "12/2 NM-B cable",
      unit: "ft",
      unitCost: 0.56,
      supplier: "Northeast Electrical",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "14/2 NM-B cable",
      unit: "ft",
      unitCost: 0.37,
      supplier: "Northeast Electrical",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "14/3 NM-B cable",
      unit: "ft",
      unitCost: 0.53,
      supplier: "Northeast Electrical",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Whole-home surge protection",
      unit: "ea",
      unitCost: 143,
      supplier: "Company verified cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Equipment",
      item: "200A outdoor meter/disconnect",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Equipment",
      item: "Outdoor service disconnect",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Equipment",
      item: "Indoor main disconnect",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Equipment",
      item: "Meter-main combination",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Panel",
      item: "Siemens 200A service panel",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Siemens",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Siemens 200A 2-pole standard breaker",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Siemens",
      sourceDate,
      amperage: 200,
      poleCount: 2,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Eaton 200A 2-pole standard breaker",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Eaton",
      sourceDate,
      amperage: 200,
      poleCount: 2,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D 200A 2-pole standard breaker",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Square D",
      sourceDate,
      amperage: 200,
      poleCount: 2,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "service upgrade surge protection",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "2-inch PVC mast raceway",
      unit: "ft",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "2-inch PVC weatherhead",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "2-inch PVC hub",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "2-inch PVC LB",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "2-inch PVC 90",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "2-inch PVC coupling",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "2-inch PVC mast related parts",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "4/0 aluminum XHHW conductor",
      unit: "ft",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "4/0 aluminum SER cable",
      unit: "ft",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "4/0 copper service conductor alternative",
      unit: "ft",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Grounding",
      item: "ground bar",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Grounding",
      item: "ground rod",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Grounding",
      item: "acorn clamp",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Bonding",
      item: "intersystem bonding terminal",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Grounding",
      item: "#8 solid grounding conductor",
      unit: "ft",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Bonding",
      item: "#4 green bonding conductor",
      unit: "ft",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "3/4-inch PVC raceway",
      unit: "ft",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Raceway",
      item: "3/4-inch PVC fittings",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Bonding",
      item: "water-meter bonding clamp",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Bonding",
      item: "#4 green water-meter bonding conductor",
      unit: "ft",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Devices",
      item: "4-square deep box",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Devices",
      item: "20A receptacle",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Trim",
      item: "20A receptacle plate",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Backing",
      item: "4x4x3/4 plywood",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Framing",
      item: "2x4x8 stud",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Allowance",
      item: "service upgrade permit allowance",
      unit: "allowance",
      unitCost: 0,
      supplier: "Company default — local amount required",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Allowance",
      item: "service upgrade inspection allowance",
      unit: "allowance",
      unitCost: 0,
      supplier: "Company default — local amount required",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Allowance",
      item: "service upgrade miscellaneous allowance",
      unit: "allowance",
      unitCost: 0,
      supplier: "Company default — local amount required",
      sourceDate,
      isDefault: false,
    },
  ];

  const legacySmartKitName =
    "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote";
  const canonicalSmartKitName =
    "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote combo-pack";
  const [canonicalSmartKit] = await database
    .select()
    .from(priceBookItemsTable)
    .where(
      and(
        eq(priceBookItemsTable.companyId, company.id),
        eq(priceBookItemsTable.item, canonicalSmartKitName),
      ),
    )
    .limit(1);
  if (!canonicalSmartKit) {
    const [legacySmartKit] = await database
      .select()
      .from(priceBookItemsTable)
      .where(
        and(
          eq(priceBookItemsTable.companyId, company.id),
          eq(priceBookItemsTable.item, legacySmartKitName),
        ),
      )
      .limit(1);
    if (legacySmartKit) {
      await database
        .update(priceBookItemsTable)
        .set({
          item: canonicalSmartKitName,
          supplier: "Lutron",
          manufacturer: "Lutron",
        })
        .where(eq(priceBookItemsTable.id, legacySmartKit.id));
    }
  }

  const [legacyStarterSurge] = await database
    .select()
    .from(priceBookItemsTable)
    .where(
      and(
        eq(priceBookItemsTable.companyId, company.id),
        eq(priceBookItemsTable.item, "Whole-home surge protection"),
      ),
    )
    .limit(1);
  if (legacyStarterSurge?.isDefault) {
    const verifiedSurge = verifiedItems.find(
      (item) => item.item === "Whole-home surge protection",
    );
    await database
      .update(priceBookItemsTable)
      .set(
        legacyStarterSurge.unitCost === 85 && verifiedSurge
          ? verifiedSurge
          : { isDefault: false },
      )
      .where(eq(priceBookItemsTable.id, legacyStarterSurge.id));
  }

  for (const item of verifiedItems) {
    const [existing] = item.supplierSku
      ? await database
          .select()
          .from(priceBookItemsTable)
          .where(
            and(
              eq(priceBookItemsTable.companyId, company.id),
              eq(priceBookItemsTable.supplierSku, item.supplierSku),
            ),
          )
          .limit(1)
      : await database
          .select()
          .from(priceBookItemsTable)
          .where(
            and(
              eq(priceBookItemsTable.companyId, company.id),
              eq(priceBookItemsTable.item, item.item),
            ),
          )
          .limit(1);
    if (!existing) {
      await database.insert(priceBookItemsTable).values({
        companyId: company.id,
        ...item,
      });
    }
  }

  const allowanceRenames = [
    ["2-pole 50A breaker", "Unverified allowance — generic 2-pole 50A breaker"],
    ["#8 copper THHN", "Unverified starter allowance — #8 copper THHN"],
    ["#10 copper grounding conductor", "Unverified starter allowance — #10 copper grounding conductor"],
    ["1 in. EMT with fittings", "Unverified starter allowance — 1 in. EMT with fittings"],
    ["GFCI receptacle", "Unverified allowance — generic GFCI receptacle"],
    ["standard receptacle", "Unverified allowance — generic standard receptacle"],
    ["vanity light allowance", "Unverified allowance — vanity light"],
    ["recessed light", "Unverified allowance — generic recessed light"],
    ["exhaust fan", "Unverified allowance — generic exhaust fan"],
    ["fan/light", "Unverified allowance — fan/light"],
    ["fan/light/heat", "Unverified allowance — fan/light/heat"],
    ["heated floor circuit allowance", "Unverified allowance — heated-floor circuit"],
    ["single-pole switch", "Unverified allowance — single-pole switch"],
    ["bathroom circuit materials", "Unverified allowance — bathroom circuit materials"],
    ["bathroom circuit protection allowance", "Unverified allowance — bathroom circuit protection"],
    ["single-gang box", "Unverified allowance — single-gang box"],
    ["device plate", "Unverified allowance — device plate"],
    ["#12 NM-B cable", "Unverified allowance — generic #12 NM-B cable"],
    ["refrigerator circuit materials", "Unverified allowance — refrigerator circuit materials"],
    ["dishwasher circuit materials", "Unverified allowance — dishwasher circuit materials"],
    ["disposal circuit materials", "Unverified allowance — disposal circuit materials"],
    ["gas range circuit materials", "Unverified allowance — gas range circuit materials"],
    ["electric range circuit materials", "Unverified allowance — electric range circuit materials"],
    ["additional dedicated circuit materials", "Unverified allowance — additional dedicated circuit materials"],
    ["countertop GFCI receptacle", "Unverified allowance — generic countertop GFCI receptacle"],
    ["USB receptacle", "Unverified allowance — USB receptacle"],
    ["sink light", "Unverified allowance — sink light"],
    ["island pendant", "Unverified allowance — island pendant"],
    ["undercabinet lighting", "Unverified allowance — undercabinet lighting"],
    ["kitchen recessed light", "Unverified allowance — generic kitchen recessed light"],
    ["3-way switch pair", "Unverified allowance — 3-way switch pair"],
    ["dimmer switch", "Unverified allowance — dimmer switch"],
  ] as const;

  for (const [oldName, newName] of allowanceRenames) {
    const [existing] = await database
      .select()
      .from(priceBookItemsTable)
      .where(
        and(
          eq(priceBookItemsTable.companyId, company.id),
          eq(priceBookItemsTable.item, oldName),
        ),
      )
      .limit(1);
    if (existing?.isDefault) {
      await database
        .update(priceBookItemsTable)
        .set({ item: newName })
        .where(eq(priceBookItemsTable.id, existing.id));
    }
  }

  const maintainableItems = [
    { category: "Devices", item: "Unverified allowance — generic GFCI receptacle", unit: "ea", unitCost: 24 },
    { category: "Devices", item: "Unverified allowance — generic standard receptacle", unit: "ea", unitCost: 6 },
    { category: "Lighting", item: "Unverified allowance — vanity light", unit: "ea", unitCost: 95 },
    { category: "Lighting", item: "Unverified allowance — generic recessed light", unit: "ea", unitCost: 38 },
    { category: "Ventilation", item: "Unverified allowance — generic exhaust fan", unit: "ea", unitCost: 145 },
    { category: "Ventilation", item: "Unverified allowance — fan/light", unit: "ea", unitCost: 210 },
    { category: "Ventilation", item: "Unverified allowance — fan/light/heat", unit: "ea", unitCost: 360 },
    { category: "Circuit", item: "Unverified allowance — heated-floor circuit", unit: "ea", unitCost: 195 },
    { category: "Devices", item: "Unverified allowance — single-pole switch", unit: "ea", unitCost: 9 },
    { category: "Circuit", item: "Unverified allowance — bathroom circuit materials", unit: "ea", unitCost: 135 },
    { category: "Protection", item: "Unverified allowance — bathroom circuit protection", unit: "ea", unitCost: 52 },
    { category: "Rough-in", item: "Unverified allowance — single-gang box", unit: "ea", unitCost: 3.5 },
    { category: "Trim", item: "Unverified allowance — device plate", unit: "ea", unitCost: 1.25 },
    { category: "Conductor", item: "Unverified allowance — generic #12 NM-B cable", unit: "ft", unitCost: 0.95 },
    { category: "Circuit", item: "Unverified allowance — refrigerator circuit materials", unit: "ea", unitCost: 85 },
    { category: "Circuit", item: "Unverified allowance — dishwasher circuit materials", unit: "ea", unitCost: 85 },
    { category: "Circuit", item: "Unverified allowance — disposal circuit materials", unit: "ea", unitCost: 75 },
    { category: "Circuit", item: "Unverified allowance — gas range circuit materials", unit: "ea", unitCost: 65 },
    { category: "Circuit", item: "Unverified allowance — electric range circuit materials", unit: "ea", unitCost: 260 },
    { category: "Circuit", item: "Unverified allowance — additional dedicated circuit materials", unit: "ea", unitCost: 85 },
    { category: "Devices", item: "Unverified allowance — generic countertop GFCI receptacle", unit: "ea", unitCost: 24 },
    { category: "Devices", item: "Unverified allowance — USB receptacle", unit: "ea", unitCost: 22 },
    { category: "Lighting", item: "Unverified allowance — sink light", unit: "ea", unitCost: 38 },
    { category: "Lighting", item: "Unverified allowance — island pendant", unit: "ea", unitCost: 95 },
    { category: "Lighting", item: "Unverified allowance — undercabinet lighting", unit: "ea", unitCost: 120 },
    { category: "Lighting", item: "Unverified allowance — generic kitchen recessed light", unit: "ea", unitCost: 38 },
    { category: "Controls", item: "Unverified allowance — 3-way switch pair", unit: "ea", unitCost: 26 },
    { category: "Controls", item: "Unverified allowance — dimmer switch", unit: "ea", unitCost: 28 },
  ];
  const companyPriceBook = await database
    .select({ item: priceBookItemsTable.item })
    .from(priceBookItemsTable)
    .where(eq(priceBookItemsTable.companyId, company.id));
  const existingItemNames = new Set(
    companyPriceBook.map(({ item }) => item.toLowerCase()),
  );

  for (const item of maintainableItems) {
    if (existingItemNames.has(item.item.toLowerCase())) continue;
    await database.insert(priceBookItemsTable).values({
      companyId: company.id,
      ...item,
      isDefault: true,
    });
  }

  const [existingQuote] = await database
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.companyId, company.id))
    .limit(1);

  if (!existingQuote && customer) {
    await database.insert(quotesTable).values({
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