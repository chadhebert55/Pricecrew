import assert from "node:assert/strict";
import test from "node:test";
import type { AdditionInputRecord, EvChargerInputRecord } from "@workspace/db";
import {
  calculateAdditionEstimate,
  calculateEvChargerEstimate,
  auditPriceBookItem,
  type PriceBookItem,
} from "./estimating-engine";
import {
  NEMA_1450,
  STACKED_CONTROL,
  STACKED_PLATE,
} from "@workspace/api-zod/catalog-components";
const settings = {
  residentialLaborSellRate: 150,
  commercialLaborSellRate: 165,
  loadedLaborCost: 65,
  materialMarkup: 0.25,
  targetMargin: 0.4,
};
const base: AdditionInputRecord = {
  additionScopeVersion: 2,
  length: 20,
  width: 16,
  receptacles: 0,
  switches: 0,
  dimmers: 0,
  recessedLights: 0,
  ceilingFans: 0,
  customerSuppliedFans: true,
  circuitCount: 0,
  routeLength: 0,
  homeRunLength: 50,
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "AFCI",
  cableType: "12/2 NM-B",
  crewSize: 2,
  crewHours: 6,
  notes: "",
};
const row = (
  id: number,
  item: string,
  cost: number,
  extra: Partial<PriceBookItem> = {},
): PriceBookItem => ({
  id,
  item,
  unitCost: cost,
  category: "Controls",
  unit: "ea",
  manufacturer: "QA",
  manufacturerPartNumber: `QA-${id}`,
  supplier: "Synthetic",
  sourceDate: "2026-09-29",
  supplierSku: `QA-SKU-${id}`,
  upc: null,
  amperage: null,
  poleCount: null,
  protectionType: null,
  isDefault: false,
  ...extra,
});
const qualified = (
  id: number,
  requestKey: string,
  kind: string,
  cost: number,
  plateOpening?: "duplex" | "decorator",
) =>
  row(id, `Synthetic selected product ${id}`, cost, {
    materialPreferences: [
      {
        requestKey,
        kind: "exact",
        verifiedComponent: {
          kind,
          manufacturer: "QA",
          manufacturerPartNumber: `QA-${id}`,
          source:
            "Synthetic fixture specification, not a real product qualification",
          ...(plateOpening ? { plateOpening } : {}),
        },
      },
    ],
  });
const errors = (r: ReturnType<typeof calculateAdditionEstimate>) =>
  r.pricing.pricingWarnings.filter(
    (w) => typeof w !== "string" && w.severity === "error",
  );
const calc = (
  patch: Partial<AdditionInputRecord> = {},
  book: PriceBookItem[] = [],
) => calculateAdditionEstimate({ ...base, ...patch }, settings, book);
test("subpanel person-hours are required for selected 60A/100A and ignored for None", () => {
  assert.deepEqual(calc({ subpanelLaborHours: 12 }), calc());
  for (const subpanelOption of ["60A Subpanel", "100A Subpanel"] as const) {
    for (const subpanelLaborHours of [undefined, 0])
      assert.ok(
        errors(calc({ subpanelOption, subpanelLaborHours })).some(
          (w) =>
            typeof w !== "string" &&
            w.code === "ADDITION_SUBPANEL_LABOR_REQUIRED",
        ),
      );
    const r = calc({ subpanelOption, subpanelLaborHours: 12 });
    assert.equal(r.pricing.finalLaborHours, 24); // Existing 2*6 project hours plus 12, not 6 or 24 added.
    assert.equal(r.pricing.laborCost, 1560);
    assert.equal(r.pricing.laborSellAmount, 3600);
    assert.ok(
      !errors(r).some(
        (w) =>
          typeof w !== "string" &&
          w.code === "ADDITION_SUBPANEL_LABOR_REQUIRED",
      ),
    );
  }
});
test("legacy subpanel estimate retains its pre-version labor calculation", () => {
  const r = calc({
    additionScopeVersion: undefined,
    subpanelOption: "60A Subpanel",
  });
  assert.equal(r.pricing.finalLaborHours, 12);
  assert.ok(
    !errors(r).some(
      (w) =>
        typeof w !== "string" && w.code === "ADDITION_SUBPANEL_LABOR_REQUIRED",
    ),
  );
});
test("priced legacy subpanel components and labor do not certify a complete compatible installation", () => {
  const r = calc(
    {
      subpanelOption: "60A Subpanel",
      subpanelLaborHours: 12,
      feederDistance: 40,
    },
    [
      row(31, "#6 copper SER cable", 3, { category: "Conductor", unit: "ft" }),
      row(32, "60A subpanel load center", 100, { category: "Panel" }),
      row(33, "Synthetic Siemens 60A breaker", 20, {
        manufacturer: "Siemens",
        amperage: 60,
        poleCount: 2,
        protectionType: "Standard",
      }),
    ],
  );
  assert.ok(
    errors(r).some(
      (w) =>
        typeof w !== "string" &&
        w.code === "ADDITION_SUBPANEL_SCOPE_UNQUALIFIED",
    ),
  );
  assert.equal(r.pricing.finalLaborHours, 24);
});
const fan = {
  quantity: 2,
  customerSupplied: true,
  control: "Stacked single-pole/single-pole" as const,
  cableType: "14/3 NM-B" as const,
  wiringLength: 30,
  stackedWiringVerified: true,
  verifiedControlQuantity: 2,
};
const book = [
  qualified(
    1,
    STACKED_CONTROL,
    "Stacked single-pole/single-pole",
    20,
    "duplex",
  ),
  qualified(2, STACKED_PLATE, "Matching white wall plate", 3, "duplex"),
  row(3, "Pass & Seymour S1-18-W 1-gang box — SKU 18134", 2, {
    category: "Rough-in",
  }),
  row(4, "14/3 NM-B cable", 1, { category: "Conductor", unit: "ft" }),
  row(5, "Pass & Seymour TM870-W 15A single-pole switch — SKU 3211", 2),
  row(6, "Legrand radiant RWP26WCC10 1-gang screwless wall plate", 3, {
    category: "Trim",
  }),
];
test("stacked one-yoke control uses existing single-pole labor exactly once and qualified matching plate", () => {
  const r = calc({ bathroomExhaust: fan }, book),
    single = calc(
      { bathroomExhaust: { ...fan, control: "Standard switch" } },
      book,
    );
  assert.equal(r.pricing.finalLaborHours, single.pricing.finalLaborHours);
  assert.equal(r.pricing.finalLaborHours, 18.5);
  assert.equal(
    r.assembly.find((l) => l.id === "addition-exhaust-controls")?.quantity,
    2,
  );
  assert.equal(
    r.assembly.find((l) => l.id === "addition-exhaust-controls")
      ?.materialSnapshot?.catalogId,
    1,
  );
  assert.equal(
    r.assembly.find((l) => l.id === "addition-exhaust-plates")?.materialSnapshot
      ?.catalogId,
    2,
  );
  assert.equal(
    r.assembly.find((l) => l.id === "addition-exhaust-fans")?.extendedCost,
    0,
  );
  assert.equal(errors(r).length, 0);
});
test("stacked missing product, plate, proof, price, matching opening or wiring remains blocked", () => {
  for (const missing of [1, 2, 3, 4])
    assert.ok(
      errors(
        calc(
          { bathroomExhaust: fan },
          book.filter((x) => x.id !== missing),
        ),
      ).length,
    );
  for (const invalid of [undefined, false])
    assert.ok(
      errors(
        calc(
          { bathroomExhaust: { ...fan, stackedWiringVerified: invalid } },
          book,
        ),
      ).length,
    );
  assert.ok(
    errors(
      calc({ bathroomExhaust: { ...fan, verifiedControlQuantity: 1 } }, book),
    ).length,
  );
  assert.ok(
    errors(
      calc(
        { bathroomExhaust: fan },
        book.map((x) =>
          x.id === 2
            ? qualified(
                2,
                STACKED_PLATE,
                "Matching white wall plate",
                3,
                "decorator",
              )
            : x,
        ),
      ),
    ).length,
  );
  assert.ok(
    errors(
      calc(
        { bathroomExhaust: fan },
        book.map((x) =>
          x.id === 1 ? { ...x, materialPreferences: [], unitCost: 0 } : x,
        ),
      ),
    ).length,
  );
});
test("unselected exhaust control remains blocked, rather than defaulting to a switch", () => {
  assert.ok(
    errors(
      calc({ bathroomExhaust: { ...fan, control: "Not selected" } }, book),
    ).some(
      (w) =>
        typeof w !== "string" && w.code === "ADDITION_EXHAUST_CONTROL_REQUIRED",
    ),
  );
});
const ev = {
  chargerQuantity: 1,
  chargerSupply: "Customer Provided",
  connection: "NEMA 14-50 receptacle",
  wiringMethod: "Romex",
  cableType: "6/3 NM-B",
  routeLength: 30,
  panelManufacturer: "Siemens",
  circuitAmps: "50",
  breakerRequirement: "GFCI",
  difficulty: "Normal",
  access: "Open",
  loadManagement: "None",
  disconnect: "Not Required",
  surgeProtection: "None",
  panelModifications: "None",
  permit: "Not Required",
  laborAdjustmentHours: 0,
} as EvChargerInputRecord;
const evCalc = (
  rows: PriceBookItem[],
  patch: Partial<EvChargerInputRecord> = {},
) => calculateEvChargerEstimate({ ...ev, ...patch }, settings, rows);
test("NEMA requires explicit identity-bound product qualification, not display name or bare preference", () => {
  for (const product of [
    row(7, NEMA_1450, 40),
    row(7, "Similar receptacle", 40, {
      materialPreferences: [{ requestKey: NEMA_1450, kind: "exact" }],
    }),
  ]) {
    assert.equal(
      evCalc([product]).assembly.find((l) => l.id === "receptacle")?.unitCost,
      0,
    );
  }
  const product = qualified(7, NEMA_1450, "NEMA 14-50R", 40);
  const r = evCalc([product]);
  assert.equal(
    r.assembly.find((l) => l.id === "receptacle")?.materialSnapshot?.catalogId,
    7,
  );
  assert.equal(r.assembly.find((l) => l.id === "receptacle")?.unitCost, 40);
  assert.equal(
    evCalc([{ ...product, manufacturerPartNumber: "CHANGED" }]).assembly.find(
      (l) => l.id === "receptacle",
    )?.unitCost,
    0,
  );
  assert.equal(
    evCalc([product, { ...product, id: 8 }]).assembly.find(
      (l) => l.id === "receptacle",
    )?.unitCost,
    0,
  );
});
test("NEMA qualification cannot bypass a conductor assembly without a represented neutral", () => {
  for (const wiringMethod of [
    "EMT Conduit",
    "PVC Conduit",
    "Romex",
    "SER Cable",
  ]) {
    const r = evCalc([qualified(7, NEMA_1450, "NEMA 14-50R", 40)], {
      wiringMethod,
      cableType: "8/2 NM-B",
    });
    assert.ok(
      r.pricing.pricingWarnings.some(
        (w) => typeof w !== "string" && w.code === "EV_NEUTRAL_SCOPE_REQUIRED",
      ),
    );
  }
});
test("unresolved EV requests retain exact semantic catalog keys rather than display descriptions", () => {
  const r = evCalc([]);
  assert.equal(
    r.assembly.find((l) => l.id === "receptacle")?.materialRequestKey,
    NEMA_1450,
  );
  assert.equal(
    r.assembly.find((l) => l.id === "cable")?.materialRequestKey,
    "6/3 NM-B cable",
  );
  assert.equal(
    r.assembly.find((l) => l.category === "Protection")?.materialRequestKey,
    "Siemens 50A 2-pole GFCI breaker",
  );
});
test("mapped EV and stacked products remain discoverable by builder regardless of product display name", () => {
  assert.ok(auditPriceBookItem(qualified(20,NEMA_1450,"NEMA 14-50R",45)).builders.includes("EV Charger"));
  assert.ok(auditPriceBookItem(qualified(21,STACKED_CONTROL,"Stacked single-pole/single-pole",20,"duplex")).builders.includes("Addition"));
});
