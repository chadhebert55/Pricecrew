import test from "node:test";
import assert from "node:assert/strict";
import type { AdditionInputRecord } from "@workspace/db";
import {
  defaultBathroomRoom,
  defaultLaundryRoom,
  roomCircuitSuggestion,
  requiredRoomCircuits,
  bathroomRoomLabor,
  laundryRoomLabor,
} from "@workspace/api-zod/addition-rooms";
import {
  calculateAdditionEstimate,
  type PriceBookItem,
} from "./estimating-engine";
import {customerWorkScope} from "./customer-work-scope";
const settings = {
  residentialLaborSellRate: 150,
  commercialLaborSellRate: 165,
  loadedLaborCost: 65,
  materialMarkup: 0.25,
  targetMargin: 0.4,
};
const base: AdditionInputRecord = {
  additionScopeVersion: 3,
  length: 20,
  width: 16,
  receptacles: 0,
  switches: 0,
  dimmers: 0,
  recessedLights: 0,
  ceilingFans: 0,
  customerSuppliedFans: true,
  circuitCount: 0,
  circuitEntries: [],
  routeLength: 0,
  homeRunLength: 50,
  panelManufacturer: "Siemens",
  breakerAmperage: 20,
  breakerPoleCount: 1,
  breakerProtectionType: "AFCI",
  cableType: "12/2 NM-B",
  crewSize: 2,
  crewHours: 8,
  notes: "",
};
const calc = (
  patch: Partial<AdditionInputRecord> = {},
  book: PriceBookItem[] = [],
) => calculateAdditionEstimate({ ...base, ...patch }, settings, book);
const codes = (r: ReturnType<typeof calc>) =>
  r.pricing.pricingWarnings.map((w) => (typeof w === "string" ? "" : w.code));
test("basic Addition without rooms preserves version 2 assembly and money", () => {
  assert.deepEqual(calc(), calc({ additionScopeVersion: 2 }));
});
test("bathroom devices add shared incremental labor without Bathroom setup or hidden circuits", () => {
  const room = defaultBathroomRoom,
    r = calc({ bathroomRoom: room });
  assert.equal(r.pricing.finalLaborHours, 16 + bathroomRoomLabor(room));
  assert.equal(
    r.assembly.find((l) => l.id === "addition-bathroom-gfci")?.quantity,
    1,
  );
  assert.equal(r.assembly.filter((l) => l.category === "Protection").length, 0);
  assert.ok(codes(r).includes("ADDITION_ROOM_SCOPE_REQUIRED"));
});
test("laundry gas adds no dryer circuit; electric circuit is visible only, never secretly generated", () => {
  const gas = { ...defaultLaundryRoom, dryerType: "Gas" as const },
    electric = { ...gas, dryerType: "Electric" as const };
  assert.deepEqual(requiredRoomCircuits(undefined, gas), ["laundry-washer"]);
  assert.deepEqual(requiredRoomCircuits(undefined, electric), [
    "laundry-washer",
    "laundry-dryer",
  ]);
  const r = calc({ laundryRoom: electric });
  assert.equal(r.pricing.finalLaborHours, 16 + laundryRoomLabor(electric));
  assert.equal(r.assembly.filter((l) => l.category === "Protection").length, 0);
});
test("bathroom and laundry circuit schedule and labor are charged once", () => {
  const bathroomRoom = defaultBathroomRoom,
    laundryRoom = { ...defaultLaundryRoom, dryerType: "Electric" as const };
  const circuitEntries = requiredRoomCircuits(bathroomRoom, laundryRoom).map(
    (role) => ({ ...roomCircuitSuggestion(role), roomCircuitReviewed: true }),
  );
  const r = calc({ bathroomRoom, laundryRoom, circuitEntries });
  assert.equal(r.assembly.filter((l) => l.category === "Protection").length, 4);
  assert.equal(
    r.pricing.finalLaborHours,
    16 +
      bathroomRoomLabor(bathroomRoom) +
      laundryRoomLabor(laundryRoom) +
      4 * 2.5,
  );
  assert.ok(
    !r.pricing.pricingWarnings.some(
      (w) => typeof w !== "string" && w.message.includes("assign and review"),
    ),
  );
  assert.ok(
    codes(
      calc({
        bathroomRoom,
        laundryRoom,
        circuitEntries: [...circuitEntries, circuitEntries[0]],
      }),
    ).includes("ADDITION_ROOM_SCOPE_REQUIRED"),
  );
});
test("per-circuit home runs use blank=50, explicit 75 and 30; in-room wiring allocated once", () => {
  const circuitEntries = [undefined, 75, 30].map((homeRunLength) => ({
    ...roomCircuitSuggestion("bathroom-receptacles"),
    roomCircuitRole: undefined,
    homeRunLength,
  }));
  const r = calc({ circuitEntries, routeLength: 20 });
  assert.deepEqual(
    r.assembly.filter((l) => l.category === "Conductor").map((l) => l.quantity),
    [70, 75, 30],
  );
});
test("explicit feeder material does not fall back to the legacy hard-coded conductor", () => {
  for (const subpanelOption of ["60A Subpanel", "100A Subpanel"] as const)
    for (const feederMaterial of ["Copper", "Aluminum"] as const) {
      const r = calc({
        subpanelOption,
        feederMaterial,
        feederDistance: 50,
        subpanelLaborHours: 12,
        laborAdjustmentHours: 2,
      });
      assert.equal(r.pricing.finalLaborHours, 30);
      assert.equal(
        r.assembly.find((l) => l.id === "addition-subpanel-feeder")
          ?.materialRequestKey,
        `Addition ${subpanelOption.startsWith("60") ? 60 : 100}A ${feederMaterial} SER feeder`,
      );
      assert.ok(codes(r).includes("ADDITION_SUBPANEL_SCOPE_UNQUALIFIED"));
    }
});
test("missing feeder material and blank or zero subpanel labor block; stale labor ignored without subpanel", () => {
  for (const subpanelLaborHours of [undefined, 0]) {
    const r = calc({ subpanelOption: "60A Subpanel", subpanelLaborHours });
    assert.ok(codes(r).includes("ADDITION_SUBPANEL_LABOR_REQUIRED"));
    assert.ok(codes(r).includes("ADDITION_SUBPANEL_FEEDER_REQUIRED"));
  }
  assert.deepEqual(calc({ subpanelLaborHours: 12 }), calc());
});
test("qualified size/material feeder mapping prices length once, other tuple and plain description cannot substitute", () => {
  const row = (
    material: "Copper" | "Aluminum",
    cost: number,
  ): PriceBookItem => ({
    id: material === "Copper" ? 901 : 902,
    item: `Synthetic ${material} cable`,
    unit: "ft",
    unitCost: cost,
    category: "Conductor",
    manufacturer: "QA",
    manufacturerPartNumber: `QA-${material}`,
    supplier: "Synthetic",
    supplierSku: `QA-${material}`,
    sourceDate: "2026-10-02",
    upc: null,
    amperage: null,
    poleCount: null,
    protectionType: null,
    isDefault: false,
    materialPreferences: [
      {
        requestKey: `Addition 60A ${material} SER feeder`,
        kind: "exact",
        verifiedComponent: {
          kind: "Qualified Addition SER feeder",
          manufacturer: "QA",
          manufacturerPartNumber: `QA-${material}`,
          source:
            "Synthetic suitability fixture only; not a real product qualification",
        },
      },
    ],
  });
  const book = [row("Copper", 4), row("Aluminum", 2)];
  const scope: Partial<AdditionInputRecord> = {
    subpanelOption: "60A Subpanel",
    subpanelLaborHours: 12,
    feederMaterial: "Copper",
    feederDistance: 50,
  };
  const copper = calc(scope, book),
    aluminum = calc({ ...scope, feederMaterial: "Aluminum" }, book),
    long = calc({ ...scope, feederDistance: 75 }, book);
  const feeder = (r: ReturnType<typeof calc>) =>
    r.assembly.find((l) => l.id === "addition-subpanel-feeder")!;
  assert.equal(feeder(copper).extendedCost, 200);
  assert.equal(feeder(aluminum).extendedCost, 100);
  assert.equal(feeder(long).extendedCost, 300);
  assert.equal(
    copper.pricing.finalLaborHours,
    aluminum.pricing.finalLaborHours,
  );
  assert.deepEqual(
    copper.assembly.filter((l) => l.id !== "addition-subpanel-feeder"),
    aluminum.assembly.filter((l) => l.id !== "addition-subpanel-feeder"),
  );
  assert.equal(
    feeder(calc({ ...scope, subpanelOption: "100A Subpanel" }, book)).unitCost,
    0,
  );
  assert.equal(
    feeder(
      calc(scope, [
        {
          ...book[0],
          item: "Addition 60A Copper SER feeder",
          materialPreferences: [],
        },
      ]),
    ).unitCost,
    0,
  );
});
test("disabled room ignores stale device/fan data; negative adjustment has an exact clamped labor trace", () => {
  const r = calc({
    bathroomRoom: { ...defaultBathroomRoom, enabled: false },
    laundryRoom: { ...defaultLaundryRoom, enabled: false },
    bathroomExhaust: {
      quantity: 1,
      control: "Standard switch",
      customerSupplied: true,
      cableType: "12/2 NM-B",
      wiringLength: 30,
    },
  });
  assert.deepEqual(r, calc());
  const adjusted = calc({ receptacles: 2, laborAdjustmentHours: -100 });
  assert.equal(adjusted.pricing.calculatedLaborHours, 16.9);
  assert.equal(adjusted.pricing.finalLaborHours, 0);
  assert.equal(
    Math.max(
      0,
      adjusted.pricing.calculatedLaborHours! +
        adjusted.pricing.manualLaborAdjustmentHours!,
    ),
    0,
  );
});
test("legacy proposal wording remains unchanged while version 3 describes selected rooms and feeder",()=>{
 const jobInputs:AdditionInputRecord={...base,additionScopeVersion:2,subpanelOption:"60A Subpanel",feederMaterial:"Aluminum",
  bathroomExhaust:{quantity:1,control:"Timer switch",customerSupplied:true,cableType:"12/2 NM-B",wiringLength:30}};
 const r=calculateAdditionEstimate(jobInputs,settings,[]);
 const historical=customerWorkScope("ADDITION",r.assembly,{inputs:jobInputs}).scope;
 assert.equal(historical.find(l=>l.id==="subpanel")?.description,"Subpanel installation");
 assert.equal(historical.find(l=>l.id==="exhaust-supplied")?.description,"Install customer-supplied bathroom exhaust fans");
 assert.ok(!historical.some(l=>l.id==="feeder"));
 const before=structuredClone(r);
 const current=customerWorkScope("ADDITION",r.assembly,{inputs:{...jobInputs,additionScopeVersion:3}}).scope;
 assert.equal(current.find(l=>l.id==="subpanel")?.description,"60A subpanel installation");
 assert.ok(current.some(l=>l.description.includes("countdown timer")));
 assert.deepEqual(r,before);
});
test("room proposal covers its exact device/support identities but still flags unknown saved work", () => {
  const inputs: AdditionInputRecord = {
    ...base,
    bathroomRoom: { ...defaultBathroomRoom, additionalReceptacles: 1, recessedLights: 1, showerLights: 1 },
    laundryRoom: { ...defaultLaundryRoom, generalReceptacles: 1, recessedLights: 1 },
  };
  const r = calculateAdditionEstimate(inputs, settings, []);
  const before = structuredClone(r);
  const scope = customerWorkScope("ADDITION", r.assembly, { inputs });
  assert.deepEqual(scope.reviewIssues, []);
  assert.ok(scope.scope.some(line => line.id === "bathroom-room"));
  assert.ok(scope.scope.some(line => line.id === "laundry-room"));
  const unknown = customerWorkScope("ADDITION", [
    ...r.assembly,
    { ...r.assembly[0], id: "addition-bathroom-unknown-equipment" },
  ], { inputs });
  assert.equal(unknown.reviewIssues.length, 1);
  assert.match(unknown.reviewIssues[0], /addition-bathroom-unknown-equipment/);
  assert.ok(r.pricing.pricingWarnings.length > 0, "material readiness must remain unresolved");
  assert.deepEqual(r, before, "proposal generation must not mutate estimate");
});
