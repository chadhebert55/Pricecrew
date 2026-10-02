import type { AdditionInputs } from "@workspace/api-client-react";
import {
  defaultBathroomRoom,
  defaultLaundryRoom,
  requiredRoomCircuits,
  roomCircuitSuggestion,
} from "@workspace/api-zod/addition-rooms";
import { BuilderSection, NumberField, SelectField } from "./remodel-builder";
import { AdditionExhaustFanFields } from "./addition-exhaust-fan-fields";
export function AdditionRoomFields({
  inputs: i,
  onChange,
}: {
  inputs: AdditionInputs;
  onChange: (i: AdditionInputs) => void;
}) {
  const bath =
    i.bathroomRoom?.enabled ?? Number(i.bathroomExhaust?.quantity) > 0;
  const laundry = !!i.laundryRoom?.enabled;
  const change = (next: AdditionInputs) => {
    const roles = requiredRoomCircuits(next.bathroomRoom, next.laundryRoom);
    // Only user room edits synchronize suggestions. Restore/preview never rebuild rows.
    const rows = (next.circuitEntries ?? []).filter(
      (c) => !c.roomCircuitRole || roles.includes(c.roomCircuitRole),
    );
    for (const role of roles)
      if (!rows.some((c) => c.roomCircuitRole === role))
        rows.push({
          ...roomCircuitSuggestion(role),
          quantity:
            role === "laundry-washer" ? next.laundryRoom!.washerCircuits : 1,
        });
    onChange({
      ...next,
      circuitEntries: rows.map((c) =>
        c.roomCircuitRole === "laundry-washer" &&
        c.quantity !== next.laundryRoom?.washerCircuits
          ? {
              ...c,
              quantity: next.laundryRoom!.washerCircuits,
              roomCircuitReviewed: false,
            }
          : c,
      ),
    });
  };
  const checkbox = (
    id: string,
    label: string,
    checked: boolean,
    onChange: (b: boolean) => void,
  ) => (
    <label className="flex items-start gap-3 text-sm" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
  return (
    <BuilderSection
      title="Common Rooms"
      summary={
        [bath ? "Bathroom" : "", laundry ? "Laundry" : ""]
          .filter(Boolean)
          .join(" · ") || "None"
      }
      open
    >
      <div className="flex flex-wrap gap-6">
        {checkbox("addition-room-bathroom", "Bathroom", bath, (enabled) =>
          change({
            ...i,
            bathroomRoom: {
              ...(i.bathroomRoom ?? defaultBathroomRoom),
              enabled,
            },
            bathroomExhaust: i.bathroomExhaust ?? {
              quantity: 1,
              customerSupplied: false,
              control: "Not selected",
              cableType: "12/2 NM-B",
            },
          }),
        )}
        {checkbox("addition-room-laundry", "Laundry", laundry, (enabled) =>
          change({
            ...i,
            laundryRoom: { ...(i.laundryRoom ?? defaultLaundryRoom), enabled },
          }),
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Room quantities are additional to general devices above. Do not enter
        the same device twice. Suggested circuits appear only in the main
        schedule; review each before customer-ready status.
      </p>
      {bath && (
        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="font-semibold">Bathroom Electrical</h3>
          {i.bathroomRoom?.enabled && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["gfciReceptacles", "Primary GFCI receptacles"],
                    [
                      "additionalReceptacles",
                      "Additional downstream receptacles",
                    ],
                    ["vanityLights", "Vanity lights"],
                    ["recessedLights", "Bathroom recessed lights"],
                    ["showerLights", "Shower / wet-location lights"],
                    ["switches", "Separate bathroom lighting switches"],
                  ] as const
                ).map(([key, label]) => (
                  <NumberField
                    key={key}
                    id={`addition-bathroom-${key}`}
                    label={label}
                    quantity
                    value={i.bathroomRoom![key]}
                    onChange={(value) =>
                      onChange({
                        ...i,
                        bathroomRoom: { ...i.bathroomRoom!, [key]: value },
                      })
                    }
                  />
                ))}
              </div>
              {checkbox(
                "addition-bathroom-supplied",
                "Customer supplies vanity/decorative fixtures",
                i.bathroomRoom.customerSuppliedFixtures,
                (value) =>
                  onChange({
                    ...i,
                    bathroomRoom: {
                      ...i.bathroomRoom!,
                      customerSuppliedFixtures: value,
                    },
                  }),
              )}
              {checkbox(
                "addition-bathroom-recessed-supplied",
                "Customer supplies recessed / wet-location fixtures",
                i.bathroomRoom.customerSuppliedRecessedLights,
                (value) =>
                  onChange({
                    ...i,
                    bathroomRoom: {
                      ...i.bathroomRoom!,
                      customerSuppliedRecessedLights: value,
                    },
                  }),
              )}
            </>
          )}
          <AdditionExhaustFanFields
            value={i.bathroomExhaust}
            onChange={(bathroomExhaust) => onChange({ ...i, bathroomExhaust })}
          />
        </div>
      )}
      {laundry && (
        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="font-semibold">Laundry Electrical</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["washerCircuits", "Washer / laundry circuits"],
                ["generalReceptacles", "Laundry general receptacles"],
                ["lightingLocations", "Laundry lighting locations"],
                ["switches", "Laundry switches"],
                ["recessedLights", "Laundry recessed lights"],
              ] as const
            ).map(([key, label]) => (
              <NumberField
                key={key}
                id={`addition-laundry-${key}`}
                label={label}
                quantity
                value={i.laundryRoom![key]}
                onChange={(value) =>
                  change({
                    ...i,
                    laundryRoom: { ...i.laundryRoom!, [key]: value },
                  })
                }
              />
            ))}
            <SelectField
              id="addition-laundry-dryer"
              label="Dryer type"
              value={i.laundryRoom!.dryerType}
              options={["None", "Gas", "Electric"]}
              onChange={(value) =>
                change({
                  ...i,
                  laundryRoom: {
                    ...i.laundryRoom!,
                    dryerType: value as "None" | "Gas" | "Electric",
                  },
                })
              }
            />
          </div>
          {checkbox(
            "addition-laundry-supplied",
            "Customer supplies laundry decorative fixtures",
            i.laundryRoom!.customerSuppliedFixtures,
            (value) =>
              onChange({
                ...i,
                laundryRoom: {
                  ...i.laundryRoom!,
                  customerSuppliedFixtures: value,
                },
              }),
          )}
          <p className="text-xs text-muted-foreground">
            Gas does not add an electric-dryer circuit. Appliance connection
            devices and installation suitability require qualification
            independently of the scheduled breaker and cable.
          </p>
        </div>
      )}
    </BuilderSection>
  );
}
