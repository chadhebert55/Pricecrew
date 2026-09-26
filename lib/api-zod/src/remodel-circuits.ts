/** Shared quantities/configuration only. All catalog resolution and money remain server-side. */
export type RemodelCircuit = {
  key: string;
  label?: string;
  quantity: number;
  amperage: number;
  poleCount: number;
  protectionType: string;
  cableType: string;
  routeLength?: number;
};
export const circuitCables = ["14/2 NM-B", "14/3 NM-B", "12/2 NM-B", "12/3 NM-B", "10/2 NM-B", "10/3 NM-B", "8/3 NM-B", "6/3 NM-B", "4/3 NM-B"];
export const circuitProtections = ["Standard", "AFCI", "GFCI", "Dual Function"];
export const circuitAmperages = [15, 20, 30, 40, 50, 60];
export const kitchenCircuitFields = [
  ["refrigeratorCircuits", "Refrigerator"], ["dishwasherCircuits", "Dishwasher"],
  ["disposalCircuits", "Disposal"], ["gasRangeCircuits", "Gas range"],
  ["smallApplianceCircuits", "Small-appliance"], ["microwaveCircuits", "Microwave"],
  ["electricRangeCircuits", "Electric range"], ["wallOvenCircuits", "Wall oven"],
  ["additionalDedicatedCircuits", "Additional dedicated"],
] as const;
export function defaultCircuit(key = "custom", label = "", quantity = 0): RemodelCircuit {
  const heavy = key === "electricRangeCircuits" || key === "wallOvenCircuits";
  return { key, label, quantity, amperage: heavy ? 50 : 20, poleCount: heavy ? 2 : 1,
    protectionType: heavy ? "Standard" : "Dual Function", cableType: heavy ? "6/3 NM-B" : "12/2 NM-B" };
}
export function circuitCompatibilityIssue(c: RemodelCircuit): string | undefined {
  const gauge = Number(c.cableType.split("/")[0]);
  const maxAmps: Record<number, number> = {14: 15, 12: 20, 10: 30, 8: 40, 6: 55, 4: 70};
  if (!circuitCables.includes(c.cableType) || !maxAmps[gauge] || c.amperage > maxAmps[gauge])
    return `${c.amperage}A with ${c.cableType} is incompatible with the builder's conservative NM-B sizing assumptions.`;
  if (![1, 2].includes(c.poleCount) || (c.amperage > 20 && c.poleCount !== 2))
    return "Select a supported pole count; circuits above 20A require two poles in this builder.";
  if (c.poleCount === 2 && !["Standard", "GFCI"].includes(c.protectionType))
    return "Two-pole circuits support Standard or GFCI protection in this builder.";
  if (["electricRangeCircuits", "wallOvenCircuits"].includes(c.key) && (c.poleCount !== 2 || !c.cableType.includes("/3")))
    return "Range and wall oven assumptions require a two-pole breaker and a cable with neutral.";
  return undefined;
}
type KitchenPlanInput = {
  circuitConfigurations?: RemodelCircuit[];
  applianceHomeRun12_2Length?: number;
  includeLightingCircuit?: boolean;
  lightingCircuitFootage?: number;
  breaker15AProtectionType?: string;
  breaker20AProtectionType?: string;
  smallApplianceCircuit1?: boolean;
  smallApplianceCircuit2?: boolean;
  microwaveCircuit?: boolean;
} & Partial<Record<(typeof kitchenCircuitFields)[number][0], number>>;
export function kitchenCircuitPlan(inputs: KitchenPlanInput): RemodelCircuit[] {
  const rows = kitchenCircuitFields.map(([key, label]) => {
    const saved = inputs.circuitConfigurations?.find(c => c.key === key);
    const legacyQuantity = key === "smallApplianceCircuits"
      ? Number(!!inputs.smallApplianceCircuit1) + Number(!!inputs.smallApplianceCircuit2)
      : key === "microwaveCircuits" ? Number(!!inputs.microwaveCircuit) : 0;
    return { ...defaultCircuit(key, label), protectionType: inputs.breaker20AProtectionType ?? "Dual Function",
      ...(key === "electricRangeCircuits" || key === "wallOvenCircuits" ? {protectionType: "Standard"} : {}),
      ...saved, key, label, quantity: inputs[key] ?? legacyQuantity,
      routeLength: saved?.routeLength ?? inputs.applianceHomeRun12_2Length ?? 0 };
  });
  if (inputs.includeLightingCircuit) rows.push({
    ...defaultCircuit("lighting", "Lighting", 1), amperage: 15, cableType: "14/2 NM-B",
    protectionType: inputs.breaker15AProtectionType ?? "Dual Function",
    routeLength: inputs.lightingCircuitFootage ?? 0,
    ...inputs.circuitConfigurations?.find(c => c.key === "lighting"), quantity: 1,
  } as typeof rows[number]);
  return rows.filter(c => c.quantity > 0);
}
export function breakerRequirements(circuits: RemodelCircuit[]) {
  const grouped = new Map<string, RemodelCircuit>();
  for (const c of circuits.filter(c => c.quantity > 0)) {
    const key = `${c.amperage}-${c.poleCount}-${c.protectionType}`;
    const previous = grouped.get(key);
    grouped.set(key, { ...c, key, quantity: c.quantity + (previous?.quantity ?? 0) });
  }
  return [...grouped.values()];
}

export function bathroomCircuitPlan(inputs: {
  bathroomCircuits?: RemodelCircuit[]; routeLength?: number; heatedFloorCircuit?: boolean;
  heatedFloorCircuitKey?: string; heatedFloorConfiguration?: RemodelCircuit;
}): RemodelCircuit[] {
  const circuits = (inputs.bathroomCircuits ?? []).filter(c => c.quantity > 0)
    .map(c => ({...c, routeLength: c.routeLength ?? inputs.routeLength ?? 0}));
  if (inputs.heatedFloorCircuit && !inputs.heatedFloorCircuitKey) {
    circuits.push({...defaultCircuit("heated-floor", "Heated floor", 1), protectionType: "GFCI",
      ...inputs.heatedFloorConfiguration, key: "heated-floor", quantity: 1,
      routeLength: inputs.heatedFloorConfiguration?.routeLength ?? inputs.routeLength ?? 0});
  }
  return circuits;
}

export type LightingGroupPlan = {key:string;quantity:number;controlType:string;fourWayLocations?:number;travelerLength?:number};
export const lightingControls = ["Existing switch","Single-pole switch","Dimmer","Smart switch","3-way switching","3-way dimmer"];
export const lightingWiringScopes = ["Existing wiring / fixture replacement","Extend existing lighting circuit","New wiring from nearby source","New home run to panel"];
export function recessedWiringPlan(inputs: {
  fixtureQuantity:number;lightingGroups?:LightingGroupPlan[];wiringScope?:string;breakerAmperage:number;
  advancedCableType?:string;wireRunLength:number;fixtureSpacingFeet?:number;wireWastePercent?:number;wiringAllowanceFeet:number;
}) {
  const groups=inputs.lightingGroups ?? [{key:"main",quantity:inputs.fixtureQuantity,controlType:"Existing switch"}];
  const newWiring=inputs.wiringScope!==lightingWiringScopes[0];
  const homeRun=inputs.wiringScope===lightingWiringScopes[3];
  const cable=inputs.advancedCableType || (inputs.breakerAmperage===20?"12/2 NM-B":"14/2 NM-B");
  const route=newWiring?inputs.wireRunLength:0;
  const interconnect=newWiring?groups.reduce((s,g)=>s+Math.max(0,g.quantity-1)*(inputs.fixtureSpacingFeet??8),0):0;
  const manual=newWiring?inputs.wiringAllowanceFeet:0;
  const waste=newWiring?Math.ceil((route+interconnect)*(inputs.wireWastePercent??0)/100*100)/100:0;
  const total=Number((route+interconnect+manual+waste).toFixed(2));
  const travelerCable=inputs.breakerAmperage===20?"12/3 NM-B":"14/3 NM-B";
  const travelers=groups.filter(g=>g.quantity>0&&g.controlType.startsWith("3-way")).reduce((s,g)=>s+(g.travelerLength??0),0);
  return {groups,newWiring,homeRun,cable,route,interconnect,manual,waste,total,travelerCable,travelers};
}
