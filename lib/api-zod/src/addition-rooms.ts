/** Scope only: no prices, supplier identities or code-compliance certification. */
export type RoomCircuitRole =
  | "bathroom-receptacles"
  | "bathroom-lighting"
  | "laundry-washer"
  | "laundry-dryer";
export type BathroomRoom = {
  enabled: boolean;
  gfciReceptacles: number;
  additionalReceptacles: number;
  vanityLights: number;
  recessedLights: number;
  showerLights: number;
  switches: number;
  customerSuppliedFixtures: boolean;
  customerSuppliedRecessedLights: boolean;
};
export type LaundryRoom = {
  enabled: boolean;
  washerCircuits: number;
  dryerType: "None" | "Gas" | "Electric";
  dryerConnectionMethod?: "Receptacle" | "Hardwired";
  generalReceptacles: number;
  lightingLocations: number;
  switches: number;
  recessedLights: number;
  customerSuppliedFixtures: boolean;
};
export const defaultBathroomRoom: BathroomRoom = {
  enabled: true,
  gfciReceptacles: 1,
  additionalReceptacles: 0,
  vanityLights: 1,
  recessedLights: 0,
  showerLights: 0,
  switches: 1,
  customerSuppliedFixtures: true,
  customerSuppliedRecessedLights: false,
};
export const defaultLaundryRoom: LaundryRoom = {
  enabled: true,
  washerCircuits: 1,
  dryerType: "None",
  generalReceptacles: 0,
  lightingLocations: 1,
  switches: 1,
  recessedLights: 0,
  customerSuppliedFixtures: true,
};
export function requiredRoomCircuits(
  bathroom?: BathroomRoom,
  laundry?: LaundryRoom,
): RoomCircuitRole[] {
  return [
    ...(bathroom?.enabled &&
    bathroom.gfciReceptacles + bathroom.additionalReceptacles > 0
      ? (["bathroom-receptacles"] as const)
      : []),
    ...(bathroom?.enabled ? (["bathroom-lighting"] as const) : []),
    ...(laundry?.enabled && laundry.washerCircuits > 0
      ? (["laundry-washer"] as const)
      : []),
    ...(laundry?.enabled && laundry.dryerType === "Electric"
      ? (["laundry-dryer"] as const)
      : []),
  ];
}
export function roomCircuitSuggestion(role: RoomCircuitRole) {
  const dryer = role === "laundry-dryer",
    lighting = role === "bathroom-lighting";
  return {
    roomCircuitRole: role,
    roomCircuitReviewed: false,
    label: {
      "bathroom-receptacles": "Bathroom — Receptacles",
      "bathroom-lighting": "Bathroom — Lighting/Fan",
      "laundry-washer": "Laundry — Washer",
      "laundry-dryer": "Laundry — Electric Dryer",
    }[role],
    amperage: dryer ? (30 as const) : lighting ? (15 as const) : (20 as const),
    poleCount: dryer ? (2 as const) : (1 as const),
    protectionType: dryer
      ? ("Standard" as const)
      : lighting
        ? ("AFCI" as const)
        : ("Dual Function" as const),
    cableType: dryer
      ? ("10/3 NM-B" as const)
      : lighting
        ? ("14/2 NM-B" as const)
        : ("12/2 NM-B" as const),
    quantity: 1,
  };
}
/** Existing Bathroom incremental allowances, shared with standalone Bathroom. */
export const bathroomDeviceHours = {
  gfci: 0.75,
  downstream: 0.55,
  vanity: 0.8,
  recessed: 0.9,
  shower: 0.9,
  switch: 0.5,
  exhaust: 2.25,
  fanLight: 2.5,
  fanLightHeat: 3.5,
} as const;
export function bathroomRoomLabor(room?: BathroomRoom) {
  return room?.enabled
    ? room.gfciReceptacles * bathroomDeviceHours.gfci +
        room.additionalReceptacles * bathroomDeviceHours.downstream +
        room.vanityLights * bathroomDeviceHours.vanity +
        room.recessedLights * bathroomDeviceHours.recessed +
        room.showerLights * bathroomDeviceHours.shower +
        room.switches * bathroomDeviceHours.switch
    : 0;
}
/** Laundry general devices use existing Addition allowances; decorative light uses shared fixture installation. */
export function laundryRoomLabor(room?: LaundryRoom) {
  return room?.enabled
    ? room.generalReceptacles * 0.45 +
        room.switches * 0.4 +
        room.recessedLights +
        room.lightingLocations * bathroomDeviceHours.vanity
    : 0;
}
export const additionFeederRequests = [
  "Addition 60A Aluminum SER feeder",
  "Addition 60A Copper SER feeder",
  "Addition 100A Aluminum SER feeder",
  "Addition 100A Copper SER feeder",
] as const;
