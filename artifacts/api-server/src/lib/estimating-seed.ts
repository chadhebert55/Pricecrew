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
export const USER_VERIFIED_4_0_SER_SEED_COST = 4.4198;

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
      evLaborAdjustmentHours: 0,
      bathroomLaborAdjustmentHours: 0,
      kitchenLaborAdjustmentHours: 0,
      additionLaborAdjustmentHours: 0,
      recessedLightingLaborAdjustmentHours: 0,
      serviceUpgradeCrewSize: 2,
      serviceUpgradeHoursPerPerson: 16,
      panelReplacementCrewSize: 2,
      panelReplacementHoursPerPerson: 10,
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
  const needcoSourceDate = "2026-08-27";
  const additionalServiceItems: SeedPriceBookItem[] = [
    ...([100, 150, 200] as const).map((amperage) => ({
      category: "Equipment",
      item: `${amperage}A meter-main with built-in outdoor disconnect`,
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    })),
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
    ...(["Siemens", "Eaton", "Square D"] as const).flatMap((manufacturer) =>
      ([
        [15, 1, "Standard"],
        [20, 1, "Standard"],
        [30, 2, "Standard"],
        [40, 2, "Standard"],
        [50, 2, "Standard"],
        [60, 2, "Standard"],
        [15, 1, "AFCI"],
        [20, 1, "AFCI"],
        [15, 1, "GFCI"],
        [20, 1, "GFCI"],
        [15, 1, "Dual Function"],
        [20, 1, "Dual Function"],
        [30, 2, "GFCI"],
        [40, 2, "GFCI"],
        [50, 2, "GFCI"],
        [60, 2, "GFCI"],
      ] as const).map(([amperage, poleCount, protectionType]) => ({
        category: "Protection",
        item: `${manufacturer} ${amperage}A ${poleCount}-pole ${protectionType} breaker`,
        unit: "ea",
        unitCost: 0,
        supplier: "Company default — set current cost",
        manufacturer,
        sourceDate,
        amperage,
        poleCount,
        protectionType,
        isDefault: false,
      })),
    ),
  ];
  const additionalPanelReplacementItems: SeedPriceBookItem[] = [
    ...(["Siemens", "Eaton", "Square D"] as const).flatMap((manufacturer) =>
      ([100, 150, 200] as const).map((amperage) => ({
        category: "Panel",
        item: `${manufacturer} ${amperage}A panel replacement enclosure`,
        unit: "ea",
        unitCost: 0,
        supplier: "Company default — set current cost",
        manufacturer,
        sourceDate,
        isDefault: false,
      })),
    ),
    ...(["Siemens", "Eaton", "Square D"] as const).map((manufacturer) => ({
      category: "Panel",
      item: `${manufacturer} panel filler plate`,
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer,
      sourceDate,
      isDefault: false,
    })),
    ...[
      ["Panel", "panel knockout seal", "ea"],
      ["Raceway", "panel replacement feeder raceway", "ft"],
      ["Raceway", "panel replacement feeder raceway fittings", "ea"],
      ["Allowance", "panel replacement permit allowance", "allowance"],
      ["Allowance", "panel replacement inspection allowance", "allowance"],
      ["Allowance", "panel replacement miscellaneous allowance", "allowance"],
      ["Conductor", "other configured feeder conductor", "ft"],
    ].map(([category, item, unit]) => ({
      category,
      item,
      unit,
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    })),
  ];
  let verifiedItems: SeedPriceBookItem[] = [
    ...[
      ["Equipment", "Milbank U3990-XL-200 200A meter-main — SKU 304898", "ea", 441.525, "Milbank", "U3990-XL-200", "304898", 200],
      ["Panel", "Siemens PN4040B1200C 200A 40-space panel — SKU 1552599", "ea", 294.625, "Siemens", "PN4040B1200C", "1552599", 200],
      ["Rough-in", "Pass & Seymour S1-18-W 1-gang box — SKU 18134", "ea", 2.4769, "Pass & Seymour", "S1-18-W", "18134", undefined],
      ["Controls", "Pass & Seymour TM870-W 15A single-pole switch — SKU 3211", "ea", 1.85, "Pass & Seymour", "TM870-W", "3211", 15],
      ["Controls", "Pass & Seymour TM873-W 15A 3-way switch — SKU 32128", "ea", 2.25, "Pass & Seymour", "TM873-W", "32128", 15],
      ["Controls", "Lutron DVCL-153P-WH Diva LED+ dimmer — SKU 607393", "ea", 30.28, "Lutron", "DVCL-153P-WH", "607393", 15],
    ].map<SeedPriceBookItem>(([category, item, unit, unitCost, manufacturer, manufacturerPartNumber, supplierSku, amperage]) => ({
      category: String(category),
      item: String(item),
      unit: String(unit),
      unitCost: Number(unitCost),
      supplier: "Northeast Electrical",
      manufacturer: String(manufacturer),
      manufacturerPartNumber: String(manufacturerPartNumber),
      supplierSku: String(supplierSku),
      amperage: typeof amperage === "number" ? amperage : undefined,
      sourceDate: needcoSourceDate,
      isDefault: false,
    })),
    {
      category: "Lighting",
      item: "Juno WF4DREGSMAL 4-inch regressed wafer light",
      unit: "ea",
      unitCost: 30.605,
      supplier: "Company verified cost",
      manufacturer: "Juno",
      manufacturerPartNumber: "WF4DREGSMAL",
      sourceDate: needcoSourceDate,
      isDefault: false,
    },
    {
      category: "Lighting",
      item: "Juno WF6-DREG 6-inch regressed wafer light",
      unit: "ea",
      unitCost: 34.006,
      supplier: "Company verified cost",
      manufacturer: "Juno",
      manufacturerPartNumber: "WF6-DREG",
      sourceDate: needcoSourceDate,
      isDefault: false,
    },
    ...[
      ["Equipment", "Siemens MC0816B1200 200A meter-load-center — SKU 132873", "ea", 523.989, "Siemens", "MC0816B1200", "132873", 200, "78364351070"],
      ["Panel", "Square D HOM612L100R 100A 6-space MLO load center — SKU 79511", "ea", 151.625, "Square D", "HOM612L100R", "79511", 100, "78590106120"],
      ["Conductor", "Wia 4/0 aluminum SER — SKU 28551", "ft", 4.419839, "Wia.", "WIA. SER 4/0-4/", "28551", undefined, "98012058495"],
      ["Conductor", "Wia 4/0 aluminum SER — SKU 79651", "ft", 8.826428, "Wia.", "WIA. SER 4/0-4/", "79651", undefined, "980120S0029"],
      ["Conductor", "Wia 4/0 aluminum SER — SKU 1266468", "ft", 3.30776, "Wia.", "WIA. SER 4/0-4/", "1266468", undefined, "980120S4953"],
      ["Conductor", "Wia 4/0 aluminum SER — SKU 239663", "ft", 5.050638, "Wia.", "WIA. SER 4/0-4/", "239663", undefined, "98012058496"],
      ["Conductor", "Wia 4/0 aluminum SER — SKU 300640", "ft", 4.419839, "Wia.", "WIA. SER 4/0-4/", "300640", undefined, "98012058499"],
      ["Grounding", "GE TGK12 12-hole ground bar — SKU 17742", "ea", 25.929, "GE", "TGK12", "17742", undefined, "78316415846"],
      ["Grounding", "Siemens ECGB20 20-position ground bar — SKU 35113", "ea", 20.733, "Siemens", "ECGB20", "35113", undefined, "78364345239"],
      ["Grounding", "Square D PK3GTA1 ground bar — SKU 86163", "ea", 17.669, "Square D", "PK3GTA1", "86163", undefined, "78590115693"],
      ["Grounding", "Erico 615880 5/8x8ft copper ground rod — SKU 160523", "ea", 25.313, "Erico", "615880", "160523", undefined, "78285630609"],
      ["Grounding", "Erico CP58 5/8 ground rod clamp — SKU 31589", "ea", 6.092, "Erico", "CP58", "31589", undefined, "78285630703"],
      ["Raceway", "Siemens ECHS200 2-inch load-center rain hub — SKU 26750", "ea", 11.954, "Siemens", "ECHS200", "26750", undefined, "78364345512"],
      ["Raceway", "PVCFIT 200P40-20F 2-inch Sch40 PVC conduit 10-ft stick — SKU 8891", "ft", 1.12886, "Pvcfit", "PVCFIT 200P40-20F", "8891", undefined, "98006006026"],
      ["Raceway", "PVCFIT 200P WH 2-inch PVC service weatherhead — SKU 512902", "ea", 15.70706, "Pvcfit", "PVCFIT 200P WH", "512902", undefined, "98006006613"],
      ["Raceway", "PVCFIT 200P EC 2-inch PVC expansion coupling — SKU 15350", "ea", 23.68549, "Pvcfit", "PVCFIT 200P EC", "15350", undefined, "98006006126"],
      ["Raceway", "PVCFIT 200P PS 2-inch two-hole PVC conduit strap — SKU 152755", "ea", 0.67005, "Pvcfit", "PVCFIT 200P PS", "152755", undefined, "98006006946"],
      ["Raceway", "PVCFIT 2-inch LB — 100-count confirmed package — SKU 25807", "ea", 16.62609, "PVCFIT", undefined, "25807", undefined, "98006006546"],
      ["Raceway", "PVCFIT 2-inch 90 Sch40 elbow — 100-count confirmed package — SKU 18745", "ea", 5.1391, "PVCFIT", undefined, "18745", undefined, "98006006046"],
      ["Raceway", "PVCFIT 200P CP 2-inch PVC conduit coupling — SKU 26466", "ea", 0.84149, "Pvcfit", "PVCFIT 200P CP", "26466", undefined, "98006006106"],
      ["Raceway", "PVC 3/4-inch Sch40 conduit — 100-foot confirmed package — SKU 9871", "ft", 0.36399, "PVC", undefined, "9871", undefined, "98006006002"],
      ["Raceway", "Ocal CPL3/4-G 3/4-inch coupling — SKU 30952", "ea", 22.144, "Ocal", "CPL3/4-G", "30952", undefined, "70450836255"],
      ["Normal Stock", "AGP DS1 1lb duct seal — SKU 1009903", "ea", 3.801, "AGP", "DS1", "1009903", undefined, "78073020001"],
      ["Normal Stock", "PVCFIT clear quart primer — 100-count confirmed package — SKU 152609", "ea", 18.82768, "PVCFIT", undefined, "152609", undefined, "98006022982"],
      ["Normal Stock", "PVCFIT clear quart cement — 100-count confirmed package — SKU 152791", "ea", 20.41201, "PVCFIT", undefined, "152791", undefined, "980060S0191"],
      ["Normal Stock", "Ideal 30-026 4oz anti-oxidant — SKU 32650", "ea", 14.55, "Ideal", "30-026", "32650", undefined, "78325030026"],
      ["Normal Stock", "3M 69 3/4x66ft electrical tape — SKU 21719", "ea", 34.908, "3M", "69", "21719", undefined, "05400709910"],
    ].map<SeedPriceBookItem>(([category, item, unit, unitCost, manufacturer, manufacturerPartNumber, supplierSku, amperage, upc]) => ({
      category: String(category), item: String(item), unit: String(unit), unitCost: Number(unitCost),
      supplier: "Northeast Electrical", manufacturer: String(manufacturer),
      manufacturerPartNumber: manufacturerPartNumber ? String(manufacturerPartNumber) : undefined,
      supplierSku: supplierSku ? String(supplierSku) : undefined,
      upc: upc ? String(upc) : undefined,
      amperage: typeof amperage === "number" ? amperage : undefined,
      sourceDate, isDefault: false,
    })),
    ...additionalServiceItems,
    ...additionalPanelReplacementItems,
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
      unitCost: 0,
      supplier: "Company default — set current cost",
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
      unitCost: 0,
      supplier: "Company default — set current cost",
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
      unitCost: 0,
      supplier: "Company default — set current cost",
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
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Lutron",
      sourceDate: controlSourceDate,
      isDefault: false,
    },
    {
      category: "Trim",
      item: "Legrand radiant RWP26WCC10 1-gang screwless wall plate",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
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
      unitCost: 0,
      supplier: "Company default — set current cost",
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
      unitCost: 8.673,
      supplier: "Northeast Electrical",
      manufacturer: "Siemens",
      manufacturerPartNumber: "ITE Q115",
      supplierSku: "17237",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Siemens Q115DF 15A 1-pole dual-function breaker",
      unit: "ea",
      unitCost: 69.239,
      supplier: "Northeast Electrical",
      manufacturer: "Siemens",
      manufacturerPartNumber: "ITE Q115DF",
      supplierSku: "938243",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "Dual Function",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Eaton BR115 15A 1-pole standard breaker",
      unit: "ea",
      unitCost: 19.647,
      supplier: "Northeast Electrical",
      manufacturer: "Eaton",
      manufacturerPartNumber: "C-H BR115",
      supplierSku: "20956",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Eaton BRN115AF 15A 1-pole AFCI breaker",
      unit: "ea",
      unitCost: 113.411,
      supplier: "Northeast Electrical",
      manufacturer: "Eaton",
      manufacturerPartNumber: "C-H BRN115AF",
      supplierSku: "1319470",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "AFCI",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Eaton BRN115DF 15A 1-pole dual-function breaker",
      unit: "ea",
      unitCost: 166.124,
      supplier: "Northeast Electrical",
      manufacturer: "Eaton",
      manufacturerPartNumber: "C-H BRN115DF",
      supplierSku: "1366627",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "Dual Function",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D Homeline HOM115 15A 1-pole standard breaker",
      unit: "ea",
      unitCost: 13.321,
      supplier: "Northeast Electrical",
      manufacturer: "Square D",
      manufacturerPartNumber: "SQD HOM115",
      supplierSku: "15367",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "Standard",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D Homeline HOM115GFI 15A 1-pole GFCI breaker",
      unit: "ea",
      unitCost: 133.568,
      supplier: "Northeast Electrical",
      manufacturer: "Square D",
      manufacturerPartNumber: "SQD HOM115GFI",
      supplierSku: "8508",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "GFCI",
      isDefault: false,
    },
    {
      category: "Ventilation",
      item: "Panasonic FV-0511VF1 exhaust fan",
      unit: "ea",
      unitCost: 136,
      supplier: "Company baseline — edit current cost",
      manufacturer: "Panasonic",
      manufacturerPartNumber: "FV-0511VF1",
      supplierSku: "1697956",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Ventilation",
      item: "Contractor-supplied bathroom fan/light combination",
      unit: "ea",
      unitCost: 210,
      supplier: "Company baseline — edit current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Ventilation",
      item: "Contractor-supplied bathroom fan/light/heat combination",
      unit: "ea",
      unitCost: 360,
      supplier: "Company baseline — edit current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Equipment",
      item: "Contractor-supplied ceiling fan",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Circuit",
      item: "Bathroom 15A circuit box and device materials",
      unit: "package",
      unitCost: 35,
      supplier: "Company baseline — edit current cost",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Siemens Q115AFC 15A 1-pole AFCI breaker",
      unit: "ea",
      unitCost: 44,
      supplier: "Company baseline — edit current cost",
      manufacturer: "Siemens",
      manufacturerPartNumber: "Q115AFC",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "AFCI",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D Homeline HOM115CAFIC 15A 1-pole AFCI breaker",
      unit: "ea",
      unitCost: 70,
      supplier: "Company baseline — edit current cost",
      manufacturer: "Square D",
      manufacturerPartNumber: "HOM115CAFIC",
      sourceDate,
      amperage: 15,
      poleCount: 1,
      protectionType: "AFCI",
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Siemens Q120 20A 1-pole standard breaker",
      unit: "ea",
      unitCost: 8.673,
      supplier: "Northeast Electrical",
      manufacturer: "Siemens",
      manufacturerPartNumber: "ITE Q120",
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
      manufacturerPartNumber: "ITE Q120DF",
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
      manufacturerPartNumber: "ITE QF120A",
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
      manufacturerPartNumber: "C-H BR120",
      supplierSku: "24858",
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
      manufacturerPartNumber: "C-H BRN120AF",
      supplierSku: "1319471",
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
      manufacturerPartNumber: "C-H BRN120DF",
      supplierSku: "1365961",
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
      manufacturerPartNumber: "SQD HOM120",
      supplierSku: "2015",
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
      manufacturerPartNumber: "SQD HOM120GFI",
      supplierSku: "87413",
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
      manufacturerPartNumber: "SQD HOM120PAFGF",
      supplierSku: "237119",
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
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Juno",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Lighting",
      item: "Juno 6-inch regressed wafer light",
      unit: "ea",
      unitCost: 0,
      supplier: "Company default — set current cost",
      manufacturer: "Juno",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "8/3 NM-B cable",
      unit: "ft",
      unitCost: 2.682868,
      supplier: "Northeast Electrical",
      manufacturer: "Wic.",
      manufacturerPartNumber: "WIC. ROMEX 8/3",
      supplierSku: "19117",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "8/2 NM-B cable",
      unit: "ft",
      unitCost: 1.89096,
      supplier: "Northeast Electrical",
      manufacturer: "Wic.",
      manufacturerPartNumber: "WIC. ROMEX 8/2",
      supplierSku: "22923",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "6/3 NM-B cable",
      unit: "ft",
      unitCost: 3.921784,
      supplier: "Northeast Electrical",
      manufacturer: "Wic.",
      manufacturerPartNumber: "WIC. ROMEX 6/3",
      supplierSku: "25138",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "12/2 NM-B cable",
      unit: "ft",
      unitCost: 0.562271,
      supplier: "Northeast Electrical",
      manufacturer: "Wic.",
      manufacturerPartNumber: "WIC. ROMEX 12/2",
      supplierSku: "3873",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "14/2 NM-B cable",
      unit: "ft",
      unitCost: 0.379697,
      supplier: "Northeast Electrical",
      manufacturer: "Wic.",
      manufacturerPartNumber: "WIC. ROMEX 14/2",
      supplierSku: "27892",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "14/3 NM-B cable",
      unit: "ft",
      unitCost: 0.53995,
      supplier: "Northeast Electrical",
      manufacturer: "Wic.",
      manufacturerPartNumber: "WIC. ROMEX 14/3",
      supplierSku: "10802",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "#8 copper THHN",
      unit: "ft",
      unitCost: 0.700684,
      supplier: "Northeast Electrical",
      manufacturer: "Wic.",
      manufacturerPartNumber: "WIC. THHN 8 STR",
      supplierSku: "61161",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "1/0 aluminum XHHW conductor",
      unit: "ft",
      unitCost: 0.730841,
      supplier: "Northeast Electrical",
      manufacturer: "Wia.",
      manufacturerPartNumber: "WIA. XHHW 1/0 S",
      supplierSku: "1020694",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "3/0 aluminum XHHW conductor",
      unit: "ft",
      unitCost: 1.072337,
      supplier: "Northeast Electrical",
      manufacturer: "Wia.",
      manufacturerPartNumber: "WIA. XHHW 3/0 S",
      supplierSku: "1005949",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "4/0 aluminum XHHW conductor",
      unit: "ft",
      unitCost: 1.191903,
      supplier: "Northeast Electrical",
      manufacturer: "Wia.",
      manufacturerPartNumber: "WIA. XHHW 4/0 S",
      supplierSku: "392124",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "1/0 aluminum SER cable",
      unit: "ft",
      unitCost: 2.631865,
      supplier: "Northeast Electrical",
      manufacturer: "Wia.",
      manufacturerPartNumber: "WIA. SER 1/0-1/",
      supplierSku: "295793",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Conductor",
      item: "3/0 aluminum SER cable",
      unit: "ft",
      unitCost: 3.930704,
      supplier: "Northeast Electrical",
      manufacturer: "Wia.",
      manufacturerPartNumber: "WIA. SER 3/0-3/",
      supplierSku: "239619",
      sourceDate,
      isDefault: false,
    },
    {
      category: "Protection",
      item: "Square D 50A 2-pole GFCI breaker",
      unit: "ea",
      unitCost: 278.491,
      supplier: "Northeast Electrical",
      manufacturer: "Square D",
      manufacturerPartNumber: "SQD HOM250GFI",
      supplierSku: "87379",
      sourceDate,
      amperage: 50,
      poleCount: 2,
      protectionType: "GFCI",
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
      unitCost: USER_VERIFIED_4_0_SER_SEED_COST,
      supplier: "Company verified cost",
      sourceDate: needcoSourceDate,
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
      unitCost: 15.1108,
      supplier: "Northeast Electrical",
      manufacturer: "Madison",
      manufacturerPartNumber: "MEIBB",
      supplierSku: "1054291",
      sourceDate: needcoSourceDate,
      isDefault: false,
    },
    {
      category: "Grounding",
      item: "#8 solid grounding conductor",
      unit: "ft",
      unitCost: 0.6337,
      supplier: "Northeast Electrical",
      supplierSku: "21465",
      sourceDate: needcoSourceDate,
      isDefault: false,
    },
    {
      category: "Bonding",
      item: "#4 green bonding conductor",
      unit: "ft",
      unitCost: 1.7836,
      supplier: "Northeast Electrical",
      supplierSku: "77344",
      sourceDate: needcoSourceDate,
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
    ...([
      ["service duct seal", "ea"],
      ["PVC primer", "ea"],
      ["PVC glue", "ea"],
      ["anti-oxidation compound", "ea"],
      ["electrical tape", "roll"],
      ["other existing-circuit breaker", "ea"],
    ] as const).map(([item, unit]) => ({
      category: "Normal Stock",
      item,
      unit,
      unitCost: 0,
      supplier: "Company default — set current cost",
      sourceDate,
      isDefault: false,
    })),
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
      item: "service upgrade utility coordination allowance",
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

  // UPCs are transcribed from the uploaded Northeast Electrical Supplier Catalog.
  // Keep this keyed to the supplier SKU so seed metadata stays tied to its source.
  const northeastUpcs: Record<string, string> = {
    "132873": "78364351070", "79511": "78590106120",
    "28551": "98012058495", "79651": "980120S0029", "1266468": "980120S4953", "239663": "98012058496", "300640": "98012058499",
    "17742": "78316415846", "35113": "78364345239", "86163": "78590115693", "160523": "78285630609", "31589": "78285630703",
    "26750": "78364345512", "8891": "98006006026", "512902": "98006006613", "15350": "98006006126", "152755": "98006006946", "25807": "98006006546", "18745": "98006006046", "26466": "98006006106",
    "9871": "98006006002", "30952": "70450836255", "1009903": "78073020001", "152609": "98006022982", "152791": "980060S0191", "32650": "78325030026", "21719": "05400709910",
    "1101170": "88762121675",
    "243085": "78500724027",
    "1003404": "78500703646",
    "1020717": "78500703610",
    "17237": "78364314818",
    "938243": "88762181730",
    "20956": "78667636205",
    "1319470": "78668904088",
    "1366627": "78668905967",
    "15367": "78590106520",
    "8508": "78590106536",
    "1697956": "88517037546",
    "2149": "78364314819",
    "942105": "88762181732",
    "1098885": "88762121655",
    "24858": "78667636210",
    "1319471": "78668904089",
    "1365961": "78668905969",
    "2015": "78590106521",
    "87413": "78590106537",
    "237119": "78590177821",
    "19117": "98010026338",
    "22923": "98010026315",
    "25138": "98010026371",
    "3873": "98010026305",
    "27892": "98010026300",
    "10802": "98010026350",
    "61161": "98010023129",
    "1020694": "980120S4718",
    "1005949": "980120S0164",
    "392124": "980120S0174",
    "295793": "980120S0025",
    "239619": "980120S0034",
    "87379": "78590178357",
  };
  verifiedItems = verifiedItems.map((item) => ({
    ...item,
    upc: item.supplierSku ? northeastUpcs[item.supplierSku] : undefined,
  }));

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

  const priorCableCosts: Record<string, number> = {
    "12/2 NM-B cable": 0.56,
    "14/2 NM-B cable": 0.37,
    "14/3 NM-B cable": 0.53,
  };
  const prior15ABreakerPartNumbers: Record<string, string> = {
    "Siemens Q115 15A 1-pole standard breaker": "Q115",
    "Eaton BR115 15A 1-pole standard breaker": "BR115",
    "Square D Homeline HOM115 15A 1-pole standard breaker": "HOM115",
  };
  const priorUnverifiedSystemRows: Record<
    string,
    {
      item?: string;
      legacyItems?: string[];
      unitCost: number;
      supplier: string;
      sourceDate: string;
      manufacturer?: string | null;
      manufacturerPartNumber: string | null;
      supplierSku: string | null;
    }
  > = {
    "Panasonic FV-0511VF1 exhaust fan": {
      unitCost: 119.291,
      supplier: "Northeast Electrical",
      sourceDate,
      manufacturer: "Panasonic",
      manufacturerPartNumber: "FV-0511VF1",
      supplierSku: "1697956",
    },
    "Legrand radiant TM870WCC10 15A single-pole switch": {
      unitCost: 4.55,
      supplier: "Legrand",
      sourceDate: controlSourceDate,
      manufacturerPartNumber: "TM870WCC10",
      supplierSku: "TM870WCC10",
    },
    "Legrand radiant TM873WCC10 15A 3-way switch": {
      unitCost: 6.83,
      supplier: "Legrand",
      sourceDate: controlSourceDate,
      manufacturerPartNumber: "TM873WCC10",
      supplierSku: "TM873WCC10",
    },
    "Legrand radiant RHL153PWPW LED dimmer with wall plate": {
      unitCost: 36.75,
      supplier: "Legrand",
      sourceDate: controlSourceDate,
      manufacturerPartNumber: "RHL153PWPW",
      supplierSku: "RHL153PWPW",
    },
    "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote combo-pack": {
      unitCost: 85,
      supplier: "Lutron",
      sourceDate: controlSourceDate,
      manufacturerPartNumber: null,
      supplierSku: null,
    },
    "Legrand radiant RWP26WCC10 1-gang screwless wall plate": {
      unitCost: 4.63,
      supplier: "Legrand",
      sourceDate: controlSourceDate,
      manufacturerPartNumber: "RWP26WCC10",
      supplierSku: "RWP26WCC10",
    },
    "Carlon B114R-UPC 14 cu. in. single-gang old-work box": {
      unitCost: 3.28,
      supplier: "Electrical Parts",
      sourceDate: controlSourceDate,
      manufacturerPartNumber: "B114R-UPC",
      supplierSku: null,
    },
    "Juno 4-inch regressed wafer light": {
      unitCost: 29,
      supplier: "Northeast Electrical",
      sourceDate,
      manufacturerPartNumber: null,
      supplierSku: null,
    },
    "Juno 6-inch regressed wafer light": {
      unitCost: 32,
      supplier: "Northeast Electrical",
      sourceDate,
      manufacturerPartNumber: null,
      supplierSku: null,
    },
    "Whole-home surge protection": {
      unitCost: 143,
      supplier: "Company verified cost",
      sourceDate,
      manufacturerPartNumber: null,
      supplierSku: null,
    },
    "PVCFIT 200P40-20F 2-inch Sch40 PVC conduit 10-ft stick — SKU 8891": {
      item: "PVCFIT 2-inch Sch40 PVC conduit — 100-foot confirmed package — SKU 8891",
      legacyItems: [
        "PVCFIT 200P40-20F 2-inch Sch40 PVC conduit 20-ft stick — SKU 8891",
      ],
      unitCost: 1.12886,
      supplier: "Northeast Electrical",
      sourceDate,
      manufacturer: "PVCFIT",
      manufacturerPartNumber: null,
      supplierSku: "8891",
    },
    "PVCFIT 200P WH 2-inch PVC service weatherhead — SKU 512902": {
      item: "PVCFIT 2-inch weatherhead — 100-count confirmed package — SKU 512902",
      unitCost: 15.70706,
      supplier: "Northeast Electrical",
      sourceDate,
      manufacturer: "PVCFIT",
      manufacturerPartNumber: null,
      supplierSku: "512902",
    },
    "PVCFIT 200P CP 2-inch PVC conduit coupling — SKU 26466": {
      item: "PVCFIT 2-inch coupling — 100-count confirmed package — SKU 26466",
      unitCost: 0.84149,
      supplier: "Northeast Electrical",
      sourceDate,
      manufacturer: "PVCFIT",
      manufacturerPartNumber: null,
      supplierSku: "26466",
    },
  };
  const isKnownPriorSystemSeed = (
    existing: typeof priceBookItemsTable.$inferSelect,
    replacement: SeedPriceBookItem,
  ) => {
    const priorUnverified = priorUnverifiedSystemRows[replacement.item];
    const isUntouchedPriorTenFootCorrection =
      replacement.supplierSku === "8891" &&
      existing.item ===
        "PVCFIT 200P40-20F 2-inch Sch40 PVC conduit 20-ft stick — SKU 8891" &&
      existing.category === replacement.category &&
      existing.unit === replacement.unit &&
      existing.unitCost === replacement.unitCost &&
      existing.supplier === (replacement.supplier ?? null) &&
      existing.manufacturer === (replacement.manufacturer ?? null) &&
      existing.manufacturerPartNumber ===
        (replacement.manufacturerPartNumber ?? null) &&
      existing.supplierSku === replacement.supplierSku &&
      existing.upc === (replacement.upc ?? null) &&
      existing.sourceDate === (replacement.sourceDate ?? null) &&
      existing.isDefault === replacement.isDefault;
    return (
      isUntouchedPriorTenFootCorrection ||
      (existing.unitCost === 0 &&
        existing.supplier === "Company default — set current cost" &&
        existing.sourceDate === sourceDate &&
        existing.manufacturerPartNumber === null &&
        existing.supplierSku === null) ||
      (existing.unitCost === priorCableCosts[replacement.item] &&
        existing.supplier === "Northeast Electrical" &&
        existing.sourceDate === sourceDate &&
        existing.manufacturer === null &&
        existing.manufacturerPartNumber === null &&
        existing.supplierSku === null) ||
      (existing.unitCost === 0 &&
        existing.supplier === "Company default — set current cost" &&
        existing.sourceDate === controlSourceDate &&
        existing.manufacturerPartNumber ===
          prior15ABreakerPartNumbers[replacement.item] &&
        existing.supplierSku === prior15ABreakerPartNumbers[replacement.item]) ||
      (priorUnverified !== undefined &&
        (priorUnverified.item === undefined ||
          existing.item === priorUnverified.item ||
          priorUnverified.legacyItems?.includes(existing.item) === true) &&
        existing.unitCost === priorUnverified.unitCost &&
        existing.supplier === priorUnverified.supplier &&
        existing.sourceDate === priorUnverified.sourceDate &&
        (priorUnverified.manufacturer === undefined ||
          existing.manufacturer === priorUnverified.manufacturer) &&
        existing.manufacturerPartNumber ===
          priorUnverified.manufacturerPartNumber &&
        existing.supplierSku === priorUnverified.supplierSku)
    );
  };
  const isUntouchedSeedMissingUpc = (
    existing: typeof priceBookItemsTable.$inferSelect,
    replacement: SeedPriceBookItem,
  ) =>
    replacement.upc !== undefined &&
    existing.upc === null &&
    existing.category === replacement.category &&
    existing.item === replacement.item &&
    existing.unit === replacement.unit &&
    existing.unitCost === replacement.unitCost &&
    existing.supplier === (replacement.supplier ?? null) &&
    existing.manufacturer === (replacement.manufacturer ?? null) &&
    existing.manufacturerPartNumber ===
      (replacement.manufacturerPartNumber ?? null) &&
    existing.supplierSku === (replacement.supplierSku ?? null) &&
    existing.sourceDate === (replacement.sourceDate ?? null) &&
    existing.amperage === (replacement.amperage ?? null) &&
    existing.poleCount === (replacement.poleCount ?? null) &&
    existing.protectionType === (replacement.protectionType ?? null) &&
    existing.isDefault === replacement.isDefault;

  for (const item of verifiedItems) {
    const [itemMatch] = await database
      .select()
      .from(priceBookItemsTable)
      .where(
        and(
          eq(priceBookItemsTable.companyId, company.id),
          eq(priceBookItemsTable.item, item.item),
        ),
      )
      .limit(1);
    const [skuMatch] =
      itemMatch || !item.supplierSku
        ? []
        : await database
            .select()
            .from(priceBookItemsTable)
            .where(
              and(
                eq(priceBookItemsTable.companyId, company.id),
                eq(priceBookItemsTable.supplierSku, item.supplierSku),
              ),
            )
            .limit(1);
    const existing = itemMatch ?? skuMatch;
    if (!existing) {
      await database.insert(priceBookItemsTable).values({
        companyId: company.id,
        ...item,
      });
    } else if (
      isKnownPriorSystemSeed(existing, item) ||
      isUntouchedSeedMissingUpc(existing, item)
    ) {
      await database
        .update(priceBookItemsTable)
        .set(item)
        .where(eq(priceBookItemsTable.id, existing.id));
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

  // This is metadata on the one recognizable starter fixture, not a rewrite of
  // any saved estimate snapshot. It also upgrades databases seeded before the
  // marker was introduced.
  if (
    existingQuote &&
    existingQuote.quoteNumber === "Q-1024" &&
    existingQuote.projectName === "Fleet charging installation" &&
    existingQuote.module === "EV Charger Builder" &&
    !existingQuote.isDemo
  ) {
    await database
      .update(quotesTable)
      .set({ isDemo: true })
      .where(eq(quotesTable.id, existingQuote.id));
  }

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
      isDemo: true,
    });
  }
}