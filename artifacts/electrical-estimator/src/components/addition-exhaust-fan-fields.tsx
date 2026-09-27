import type { AdditionBathroomExhaust } from "@workspace/api-client-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const empty: AdditionBathroomExhaust = {
  quantity: 0, customerSupplied: false, control: "Standard switch", cableType: "12/2 NM-B",
}

export function AdditionExhaustFanFields({ value, onChange }: {
  value?: AdditionBathroomExhaust
  onChange: (value: AdditionBathroomExhaust) => void
}) {
  const scope = value ?? empty
  const set = <K extends keyof AdditionBathroomExhaust>(key: K, value: AdditionBathroomExhaust[K]) =>
    onChange({ ...scope, [key]: value })
  const selectClass = "flex min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
  return <section aria-labelledby="addition-bathroom-heading" className="space-y-4">
    <h3 id="addition-bathroom-heading" className="border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Bathroom exhaust fans</h3>
    <p className="text-sm text-muted-foreground">For an addition with a bathroom, add exhaust-only fans here. Configure bathroom receptacles, lighting and required circuits in the existing sections; they are not inferred from the fan count.</p>
    <div className="max-w-sm space-y-2">
      <Label htmlFor="addition-exhaust-quantity">Bathroom exhaust fan quantity</Label>
      <Input id="addition-exhaust-quantity" type="number" min="0" step="1" value={scope.quantity}
        onChange={e => set("quantity", Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
    </div>
    {scope.quantity > 0 && <div className="space-y-4 rounded-lg border bg-muted/15 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="addition-exhaust-supply">Exhaust fan supplied by</Label>
          <select id="addition-exhaust-supply" className={selectClass} value={scope.customerSupplied ? "customer" : "contractor"}
            onChange={e => set("customerSupplied", e.target.value === "customer")}>
            <option value="contractor">Contractor</option><option value="customer">Customer / GC</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="addition-exhaust-control">One control per exhaust fan</Label>
          <select id="addition-exhaust-control" className={selectClass} value={scope.control}
            onChange={e => set("control", e.target.value as AdditionBathroomExhaust["control"])}>
            <option>Standard switch</option><option>Timer switch</option><option>Humidity-sensing control</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="addition-exhaust-wire">Additional fan wiring (total FT)</Label>
          <Input id="addition-exhaust-wire" type="number" min="0" value={scope.wiringLength ?? ""}
            placeholder="Enter measured footage"
            onChange={e => set("wiringLength", e.target.value.trim() === "" ? undefined : Math.max(0, Number(e.target.value) || 0))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="addition-exhaust-cable">Fan wiring cable</Label>
          <select id="addition-exhaust-cable" className={selectClass} value={scope.cableType}
            onChange={e => set("cableType", e.target.value as AdditionBathroomExhaust["cableType"])}>
            <option>12/2 NM-B</option><option>14/2 NM-B</option><option>14/3 NM-B</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Wiring is total additional in-room / switch-leg footage, not per fan. Do not repeat footage already in the common route or circuit home runs. Each fan adds its own control, control box and plate; exclude those from the general switch count.</p>
      <p className="text-xs text-muted-foreground">Uses the Bathroom exhaust-fan assembly and installation labor. Confirm circuit assignment, cable suitability, mounting and termination requirements. No fan/light/heat combination or ductwork is inferred.</p>
      {scope.customerSupplied
        ? <p className="text-sm">Customer-supplied exhaust fan: $0 equipment purchase. Wiring, control, box, plate and installation labor remain included.</p>
        : <details className="rounded border p-3">
            <summary className="cursor-pointer text-sm">Advanced exhaust-fan equipment cost</summary>
            <div className="mt-3 space-y-2">
              <Label htmlFor="addition-exhaust-cost">Exhaust fan unit-cost override ($)</Label>
              <Input id="addition-exhaust-cost" type="number" min="0" step="0.01" value={scope.materialCostOverride ?? ""}
                placeholder="Use verified company Price Book"
                onChange={e => set("materialCostOverride", e.target.value.trim() === "" ? undefined : Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </details>}
    </div>}
  </section>
}
