import { useListPriceBookItems, type AdditionInputs } from "@workspace/api-client-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Scope = NonNullable<AdditionInputs["ceilingFanInstallation"]>
export function AdditionCeilingFanFields({ value, quantity, onChange }: {
  value?: Scope; quantity: number; onChange: (value: Scope) => void
}) {
  const catalog = useListPriceBookItems()
  const selectClass = "flex min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
  const confirmed = value?.verifiedFanQuantity === quantity
  const set = (patch: Partial<Scope>) => value && onChange({ ...value,
    ...(!confirmed ? {supportVerified:false,wiringVerified:false} : {}),
    verifiedFanQuantity:quantity, ...patch })
  return <section className="mt-4 space-y-4 rounded-lg border p-4" aria-label="Ceiling fan installation">
    <div className="space-y-2">
      <Label htmlFor="addition-fan-location">Ceiling fan installation condition (all selected fans)</Label>
      <select id="addition-fan-location" className={selectClass} value={value?.mode ?? ""}
        onChange={e => onChange({ mode:e.target.value as Scope["mode"], supportVerified:false, wiringVerified:false })}>
        <option value="" disabled>Select installation condition</option>
        <option value="new">New fan location / new support</option>
        <option value="reuse">Reuse existing fan location</option>
      </select>
    </div>
    {value?.mode === "new" && <>
      <div className="space-y-2">
        <Label htmlFor="addition-fan-support">Fan-rated support assembly from company Price Book</Label>
        <select id="addition-fan-support" className={selectClass} value={value.supportCatalogId ?? ""}
          onChange={e => {
            const item = catalog.data?.find(item => item.id === Number(e.target.value))
            set({supportCatalogId:item?.id, supportManufacturer:item?.manufacturer ?? undefined,
              supportPartNumber:item?.manufacturerPartNumber ?? undefined, supportVerified:false})
          }}>
          <option value="">Select verified product</option>
          {catalog.data?.filter(item => item.manufacturer && item.manufacturerPartNumber && ["ea","each","kit","set"].includes(item.unit))
            .map(item => <option key={item.id} value={item.id}>{item.item}</option>)}
        </select>
        {catalog.isError && <p role="alert" className="text-sm">Price Book could not load. <button type="button" className="underline" onClick={() => catalog.refetch()}>Retry</button></p>}
        <p className="text-xs text-muted-foreground">One complete assembly per fan. Catalog selection alone does not verify fan rating. No ordinary fixture box is automatically substituted; missing product identity or pricing stays Needs Review.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="addition-fan-wire">Additional fan wiring (total FT)</Label>
          <Input id="addition-fan-wire" type="number" min="0" value={value.wiringLength ?? ""}
            onChange={e => set({wiringLength:e.target.value === "" ? undefined : Math.max(0,Number(e.target.value)||0),wiringVerified:false})}/></div>
        <div className="space-y-2"><Label htmlFor="addition-fan-cable">Fan wiring cable</Label>
          <select id="addition-fan-cable" className={selectClass} value={value.cableType ?? ""}
            onChange={e => set({cableType:e.target.value as Scope["cableType"],wiringVerified:false})}>
            <option value="" disabled>Select cable</option><option>12/2 NM-B</option><option>14/2 NM-B</option><option>14/3 NM-B</option>
          </select></div>
      </div>
      <p className="text-sm">Includes one standard on/off switch, control box and plate per fan. Do not repeat these controls in the general switch count or repeat this wiring in the common route/circuit schedule.</p>
    </>}
    {value && <>
      <label className="flex items-start gap-3 text-sm">
        <input id="addition-fan-support-verified" type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed && value.supportVerified === true}
          onChange={e => set({supportVerified:e.target.checked})}/>
        <span>{value.mode === "reuse" ? "I verified every existing box/support is fan-rated and suitable for the selected fan."
          : "I verified this complete fan-rated support assembly is suitable for every fan and includes required mounting/termination hardware."}</span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input id="addition-fan-wiring-verified" type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed && value.wiringVerified === true}
          onChange={e => set({wiringVerified:e.target.checked})}/>
        <span>{value.mode === "reuse" ? "I verified existing wiring and switching/control are suitable for reuse."
          : "I confirmed the cable, measured footage and standard on/off control are suitable; any required job-specific extras are included in the estimate."}</span>
      </label>
      <p className="text-xs text-muted-foreground">Existing fan installation labor remains 1.75 person-hours per fan; new controls add the existing 0.4 person-hours each. Review project labor and the job-specific adjustment for access, support and wiring work. Mixed new/reuse locations require separate estimates for now.</p>
    </>}
  </section>
}
