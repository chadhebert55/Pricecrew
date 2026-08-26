import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type LaborRateType = "residential" | "commercial";
export type CableType = "12/2 NM-B" | "14/2 NM-B" | "14/3 NM-B";
export type RecessedLightSize = "4-inch" | "6-inch";

export type EvChargerInputRecord = {
  chargerQuantity: number;
  chargerOutputAmps: number;
  circuitAmps: string;
  chargerSupply: string;
  connection: string;
  routeLength: number;
  wiringMethod: string;
  location: string;
  panelManufacturer: string;
  panelSpace: string;
  breakerRequirement: string;
  access: string;
  permit: string;
  loadManagement: string;
  disconnect: string;
  surgeProtection: string;
  panelModifications: string;
  difficulty: string;
  notes: string;
  laborRateType?: LaborRateType;
};

export type BathroomInputRecord = {
  gfciReceptacles: number;
  additionalReceptacles: number;
  vanityLights: number;
  recessedLights: number;
  exhaustFans: number;
  fanLights: number;
  fanLightHeatUnits: number;
  heatedFloorCircuit: boolean;
  additionalSwitches: number;
  routeLength?: number;
  circuitOption: string;
  customerSuppliedFixtures: boolean;
  notes: string;
  laborRateType?: LaborRateType;
  panelManufacturer?: string;
  breakerAmperage?: number;
  breakerPoleCount?: number;
  breakerProtectionType?: string;
  gfciAmperage?: number;
  recessedLightSize?: RecessedLightSize;
  cableType?: CableType;
};

export type KitchenInputRecord = {
  refrigeratorCircuits: number;
  dishwasherCircuits: number;
  disposalCircuits: number;
  gasRangeCircuits: number;
  electricRangeCircuits: number;
  countertopReceptacles: number;
  sinkLights: number;
  islandPendants: number;
  undercabinetLighting: number;
  recessedLights: number;
  threeWayOptions: number;
  fourWayLocations?: number;
  fourWayCableFootage?: number;
  fourWayLaborHoursPerLocation?: number;
  dimmers: number;
  usbReceptacles: number;
  additionalDedicatedCircuits: number;
  routeLength: number;
  includeLightingCircuit?: boolean;
  lightingCircuitAmperage?: number;
  lightingCircuitFootage?: number;
  lightingCircuitLaborHours?: number;
  smallApplianceCircuit1?: boolean;
  smallApplianceCircuit1Footage?: number;
  smallApplianceCircuit1LaborHours?: number;
  smallApplianceCircuit2?: boolean;
  smallApplianceCircuit2Footage?: number;
  smallApplianceCircuit2LaborHours?: number;
  microwaveCircuit?: boolean;
  microwaveCircuitFootage?: number;
  microwaveCircuitLaborHours?: number;
  smallApplianceCircuits?: number;
  microwaveCircuits?: number;
  applianceHomeRun12_2Length?: number;
  applianceCircuitAmperage?: number;
  applianceCircuitCableType?: CableType;
  applianceCircuitProtectionType?: string;
  customerSuppliedFixtures: boolean;
  notes: string;
  laborRateType?: LaborRateType;
  panelManufacturer?: string;
  breakerAmperage?: number;
  breakerPoleCount?: number;
  breakerProtectionType?: string;
  recessedLightSize?: RecessedLightSize;
  cableType?: CableType;
};

export type RecessedLightingInputRecord = {
  roomLength: number;
  roomWidth: number;
  fixtureQuantity: number;
  fixtureSize: RecessedLightSize;
  wiringOption: string;
  circuitOption: string;
  switchingMethod?:
    | "Single-pole"
    | "Traditional 3-way"
    | "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote";
  traditionalThreeWayFootage?: number;
  switchType: string;
  dimmerSelection: string;
  customerSuppliedFixtures: boolean;
  ceilingHeight: string;
  accessDifficulty: string;
  laborAdjustmentHours: number;
  wireRunLength: number;
  wiringAllowanceFeet: number;
  additionalSwitches: number;
  additionalLights: number;
  notes: string;
  laborRateType?: LaborRateType;
  panelManufacturer: string;
  breakerAmperage: number;
  breakerPoleCount: number;
  breakerProtectionType: string;
  cableType: CableType;
};

export type QuoteJobInputsRecord =
  | EvChargerInputRecord
  | BathroomInputRecord
  | KitchenInputRecord
  | RecessedLightingInputRecord;

export type AssemblyLineRecord = {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  extendedCost: number;
  source: string;
};

export type PricingRecord = {
  materialCost: number;
  laborCost: number;
  materialMarkup: number;
  calculatedSellingPrice: number;
  finalSellingPrice: number;
  laborOverride: number | null;
  sellingPriceOverride: number | null;
  grossProfit: number;
  grossMargin: number;
  pricingWarnings: string[];
  laborSellRate?: number;
  laborSellAmount?: number;
  laborRateType?: LaborRateType;
};

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const companySettingsTable = pgTable(
  "company_settings",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id),
    laborRate: numeric("labor_rate", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(95),
    residentialLaborSellRate: numeric("residential_labor_sell_rate", {
      precision: 10,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(150),
    commercialLaborSellRate: numeric("commercial_labor_sell_rate", {
      precision: 10,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(165),
    loadedLaborCost: numeric("loaded_labor_cost", {
      precision: 10,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(65),
    materialMarkup: numeric("material_markup", {
      precision: 6,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0.25),
    targetMargin: numeric("target_margin", {
      precision: 6,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0.4),
    defaultTaxRate: numeric("default_tax_rate", {
      precision: 6,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("company_settings_company_id_unique").on(table.companyId)],
);

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  name: text("name").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const priceBookItemsTable = pgTable("price_book_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  category: text("category").notNull(),
  item: text("item").notNull(),
  unit: text("unit").notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 3, mode: "number" })
    .notNull(),
  supplier: text("supplier"),
  manufacturer: text("manufacturer"),
  manufacturerPartNumber: text("manufacturer_part_number"),
  supplierSku: text("supplier_sku"),
  sourceDate: text("source_date"),
  amperage: integer("amperage"),
  poleCount: integer("pole_count"),
  protectionType: text("protection_type"),
  isDefault: boolean("is_default").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  quoteNumber: text("quote_number").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  projectName: text("project_name").notNull(),
  module: text("module").notNull(),
  status: text("status").notNull().default("draft"),
  jobInputs: jsonb("job_inputs").$type<QuoteJobInputsRecord>().notNull(),
  assembly: jsonb("assembly").$type<AssemblyLineRecord[]>().notNull(),
  pricing: jsonb("pricing").$type<PricingRecord>().notNull(),
  proposalDescription: text("proposal_description").notNull(),
  total: numeric("total", { precision: 12, scale: 2, mode: "number" })
    .notNull(),
  margin: numeric("margin", { precision: 6, scale: 4, mode: "number" })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});