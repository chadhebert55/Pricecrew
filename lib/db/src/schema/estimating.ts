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
import { sql } from "drizzle-orm";

export type LaborRateType = "residential" | "commercial";
export type CableType = "12/2 NM-B" | "14/2 NM-B" | "14/3 NM-B";
export type EvCableType = "8/3 NM-B" | "8/2 NM-B" | "6/3 NM-B" | "8/2 SER";
export type RecessedLightSize = "4-inch" | "6-inch";
export type ServiceUpgradeServiceSize = "100A" | "150A" | "200A";
export type ServiceUpgradePanelManufacturer = "Siemens" | "Eaton" | "Square D";
export type PanelReplacementType =
  | "Like-for-like panel replacement"
  | "Subpanel addition";
export type PanelReplacementPanelManufacturer = "Siemens" | "Eaton" | "Square D";
export type PanelReplacementFeederConductor =
  | "1/0 aluminum XHHW conductor"
  | "3/0 aluminum XHHW conductor"
  | "4/0 aluminum XHHW conductor"
  | "1/0 copper service conductor alternative"
  | "2/0 copper service conductor alternative"
  | "Other configured feeder conductor";

export type ServiceCallServiceType =
  | "Diagnostic service call"
  | "Residential standard service visit"
  | "Commercial standard service visit";

export type TimeMaterialsServiceType =
  | "General time and materials"
  | "Residential time and materials"
  | "Commercial time and materials";

export type MiscellaneousMaterialInput = {
  id: string;
  description: string;
  cost: number;
};

export type EvChargerInputRecord = {
  chargerQuantity: number;
  chargerOutputAmps: number;
  circuitAmps: string;
  chargerSupply: string;
  connection: string;
  routeLength: number;
  wiringMethod: string;
  cableType?: EvCableType;
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
  laborAdjustmentHours?: number;
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
  laborAdjustmentHours?: number;
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
  breaker15AQuantity?: number;
  breaker15AProtectionType?: string;
  breaker20AQuantity?: number;
  breaker20AProtectionType?: string;
  customerSuppliedFixtures: boolean;
  notes: string;
  laborRateType?: LaborRateType;
  panelManufacturer?: string;
  breakerAmperage?: number;
  breakerPoleCount?: number;
  breakerProtectionType?: string;
  recessedLightSize?: RecessedLightSize;
  cableType?: CableType;
  laborAdjustmentHours?: number;
};

export type RecessedLightingInputRecord = {
  roomLength: number;
  roomWidth: number;
  fixtureQuantity: number;
  fixtureSize: RecessedLightSize;
  wiringOption: string;
  circuitOption: string;
  switchType: string;
  switchingMethod?:
    | "single-pole"
    | "traditional-3-way"
    | "smart-3-way"
    | "Single-pole"
    | "Traditional 3-way"
    | "Lutron Diva Smart Dimmer 3-way kit with Pico paddle remote";
  traditionalThreeWayFootage?: number;
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

export type ServiceUpgradeInputRecord = {
  /**
   * Optional canonical price-book item names.  These deliberately remain
   * strings (rather than price-book ids) so a saved quote is portable.
   */
  exactCatalogParts?: ExactCatalogPartSelectors;
  serviceSize: ServiceUpgradeServiceSize;
  serviceConfiguration: string;
  serviceDisconnect: string;
  panelManufacturer: ServiceUpgradePanelManufacturer;
  breakerAmperage: number;
  breakerPoleCount: number;
  breakerProtectionType: string;
  meterDisconnectEquipment: string;
  surgeProtection: string;
  includeOverheadMast: boolean;
  mastFootage: number;
  weatherheadQuantity: number;
  mastExpansionCouplingQuantity?: number;
  mastStrapQuantity?: number;
  hubQuantity: number;
  lbQuantity: number;
  ninetyQuantity: number;
  couplingQuantity: number;
  mastRelatedPartsQuantity: number;
  mastConductor: string;
  mastConductorQuantity: number;
  mastConductorFootage: number;
  serviceToPanelConductor: string;
  serviceToPanelFootage: number;
  groundBarQuantity: number;
  groundRodQuantity: number;
  acornClampQuantity: number;
  intersystemBondingQuantity: number;
  groundingConductorFootage: number;
  bondingConductorFootage: number;
  pvcThreeQuarterFootage: number;
  pvcThreeQuarterFittingsQuantity: number;
  waterMeterBondingQuantity: number;
  waterMeterBondingFootage: number;
  fourSquareBoxQuantity: number;
  receptacle20AQuantity: number;
  receptaclePlateQuantity: number;
  plywoodQuantity: number;
  studsQuantity: number;
  ductSealQuantity?: number;
  pvcPrimerQuantity?: number;
  pvcGlueQuantity?: number;
  antiOxidantQuantity?: number;
  electricalTapeQuantity?: number;
  permitAllowance: number;
  inspectionAllowance: number;
  utilityCoordinationAllowance?: number;
  miscellaneousAllowance: number;
  crewSize: number;
  crewHours: number;
  relocationLaborHours?: number;
  accessDifficultyLaborHours?: number;
  groundingReworkLaborHours?: number;
  feederDistanceLaborHours?: number;
  serviceConditionLaborHours?: number;
  utilityCoordinationLaborHours?: number;
  generalLaborAdjustmentHours?: number;
  laborAdjustmentHours?: number;
  existingBreakers?: Array<{
    amperage: number;
    poleCount: number;
    protectionType: string;
    quantity: number;
  }>;
  existingOtherBreakerQuantity?: number;
  laborRateType?: LaborRateType;
  notes: string;
};

export type PanelReplacementInputRecord = {
  exactCatalogParts?: ExactCatalogPartSelectors;
  replacementType: PanelReplacementType;
  panelManufacturer: PanelReplacementPanelManufacturer;
  panelAmperage: 100 | 150 | 200;
  panelSpaceCount: number;
  breakerAmperage: number;
  breakerPoleCount: number;
  breakerProtectionType: string;
  feederConductor: PanelReplacementFeederConductor;
  feederLength: number;
  feederConductorQuantity: number;
  feederRacewayFootage: number;
  feederRacewayFittingsQuantity: number;
  groundBarQuantity: number;
  groundRodQuantity: number;
  groundingConductorFootage: number;
  bondingConductorFootage: number;
  existingBreakers?: Array<{
    amperage: number;
    poleCount: number;
    protectionType: string;
    quantity: number;
  }>;
  existingOtherBreakerQuantity?: number;
  fillerPlateQuantity: number;
  knockoutSealQuantity: number;
  plywoodQuantity: number;
  studsQuantity: number;
  antiOxidantQuantity: number;
  electricalTapeQuantity: number;
  permitAllowance: number;
  inspectionAllowance: number;
  miscellaneousAllowance: number;
  crewSize: number;
  crewHours: number;
  panelRemovalLaborHours?: number;
  feederInstallationLaborHours?: number;
  groundingLaborHours?: number;
  accessDifficultyLaborHours?: number;
  generalLaborAdjustmentHours?: number;
  laborAdjustmentHours?: number;
  laborRateType?: LaborRateType;
  notes: string;
};

export type ServiceCallInputRecord = {
  serviceType: ServiceCallServiceType;
  visitQuantity: number;
  receptacleReplacementQuantity: number;
  trReceptacleReplacementQuantity: number;
  switchReplacementQuantity: number;
  gfciReplacementQuantity: number;
  crewSize: number;
  crewHours: number;
  laborRateType: LaborRateType;
  materialMarkup: number;
  targetMargin: number;
  miscellaneousMaterials: MiscellaneousMaterialInput[];
  notes: string;
};

export type TimeMaterialsInputRecord = {
  serviceType: TimeMaterialsServiceType;
  crewSize: number;
  crewHours: number;
  laborRateType: LaborRateType;
  laborSellRate: number;
  loadedLaborCost: number;
  materialMarkup: number;
  targetMargin: number;
  miscellaneousMaterials: MiscellaneousMaterialInput[];
  notes: string;
};

export type CustomMaterialInput = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
};

export type CustomInputRecord = {
  laborHours: number;
  laborRateType: LaborRateType;
  laborSellRate: number;
  loadedLaborCost: number;
  materialMarkup: number;
  targetMargin: number;
  materials: CustomMaterialInput[];
  miscellaneousMaterials: MiscellaneousMaterialInput[];
  notes: string;
};

export type ExactCatalogPartSelectors = {
  meterDisconnect?: string;
  servicePanel?: string;
  mastRaceway?: string;
  mastWeatherhead?: string;
  mastExpansionCoupling?: string;
  mastStrap?: string;
  mastHub?: string;
  mastLb?: string;
  mastNinety?: string;
  mastCoupling?: string;
  serviceToPanelConductor?: string;
  serviceToPanelRaceway?: string;
  groundBar?: string;
  groundRod?: string;
  acornClamp?: string;
  groundingRaceway?: string;
  groundingRacewayFitting?: string;
  feederRaceway?: string;
  feederRacewayFitting?: string;
  ductSeal?: string;
  pvcPrimer?: string;
  pvcGlue?: string;
  antiOxidant?: string;
  electricalTape?: string;
  panelProduct?: string;
};

export type QuoteJobInputsRecord =
  | EvChargerInputRecord
  | BathroomInputRecord
  | KitchenInputRecord
  | RecessedLightingInputRecord
  | ServiceUpgradeInputRecord
  | PanelReplacementInputRecord
  | ServiceCallInputRecord
  | TimeMaterialsInputRecord
  | CustomInputRecord;

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

export type PricingWarningSeverity = "info" | "warning" | "error";

export type PricingWarningCategory =
  | "missing-price"
  | "rule"
  | "field-verification"
  | "planning"
  | "compatibility"
  | "legacy";

export type PricingWarningContext = Record<
  string,
  string | number | boolean | null
>;

export type PricingWarningRecord = {
  code: string;
  severity: PricingWarningSeverity;
  category: PricingWarningCategory;
  source: string;
  message: string;
  context: PricingWarningContext;
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
  pricingWarnings: Array<PricingWarningRecord | string>;
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
    evLaborAdjustmentHours: numeric("ev_labor_adjustment_hours", {
      precision: 8,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    evDefaultCableType: text("ev_default_cable_type")
      .$type<EvCableType>()
      .notNull()
      .default("8/3 NM-B"),
    bathroomLaborAdjustmentHours: numeric("bathroom_labor_adjustment_hours", {
      precision: 8,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    kitchenLaborAdjustmentHours: numeric("kitchen_labor_adjustment_hours", {
      precision: 8,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(0),
    recessedLightingLaborAdjustmentHours: numeric(
      "recessed_lighting_labor_adjustment_hours",
      { precision: 8, scale: 2, mode: "number" },
    )
      .notNull()
      .default(0),
    serviceUpgradeCrewSize: numeric("service_upgrade_crew_size", {
      precision: 5,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(2),
    serviceUpgradeHoursPerPerson: numeric(
      "service_upgrade_hours_per_person",
      { precision: 8, scale: 2, mode: "number" },
    )
      .notNull()
      .default(16),
    panelReplacementCrewSize: numeric("panel_replacement_crew_size", {
      precision: 5,
      scale: 2,
      mode: "number",
    })
      .notNull()
      .default(2),
    panelReplacementHoursPerPerson: numeric(
      "panel_replacement_hours_per_person",
      { precision: 8, scale: 2, mode: "number" },
    )
      .notNull()
      .default(10),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("company_settings_company_id_unique").on(table.companyId)],
);

export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id),
    name: text("name").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customers_company_normalized_email_unique").on(
      table.companyId,
      sql`lower(nullif(btrim(${table.email}), ''))`,
    ),
  ],
);

export const priceBookItemsTable = pgTable("price_book_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id),
  category: text("category").notNull(),
  item: text("item").notNull(),
  unit: text("unit").notNull(),
  unitCost: numeric("unit_cost", { precision: 15, scale: 6, mode: "number" })
    .notNull(),
  supplier: text("supplier"),
  manufacturer: text("manufacturer"),
  manufacturerPartNumber: text("manufacturer_part_number"),
  supplierSku: text("supplier_sku"),
  upc: text("upc"),
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
