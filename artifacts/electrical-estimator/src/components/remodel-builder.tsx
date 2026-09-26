import type { AssemblyLine, PricingSummary } from "@workspace/api-client-react"
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness"
import { circuitAmperages, circuitCables, circuitProtections, circuitCompatibilityIssue, type RemodelCircuit } from "@workspace/api-zod/remodel-circuits"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { pricingWarningMessage } from "@/lib/pricing-warnings"
import type { ReactNode } from "react"
import { MaterialResolution, MaterialSummary } from "./material-resolution"

export const remodelSelectClass = "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
export function BuilderSection({ title, summary, children, open = false }: {title: string; summary?: string; children: ReactNode; open?: boolean}) {
  return <details open={open} className="group rounded-lg border bg-muted/10">
    <summary className="cursor-pointer p-4 font-semibold focus-visible:outline-primary">{title}{summary && <span className="mt-1 block text-xs font-normal text-muted-foreground">{summary}</span>}</summary>
    <div className="space-y-4 border-t p-4">{children}</div>
  </details>
}
export function NumberField({id, label, value, onChange, signed = false, help, quantity = false}: {id: string; label: string; value: number; onChange:(n:number)=>void; signed?:boolean; help?:string; quantity?:boolean}) {
  return <div className="min-w-0 space-y-1.5"><Label htmlFor={id}>{label}</Label>
    <Input id={id} type="number" min={signed ? undefined : 0} step={quantity ? 1 : "any"} value={value}
      onChange={e => { const n = Number(e.target.value) || 0; onChange(signed ? n : Math.max(0, quantity ? Math.floor(n) : n)) }} />
    {help && <p className="text-xs text-muted-foreground">{help}</p>}
  </div>
}
export function SelectField({id,label,value,options,onChange}: {id:string;label:string;value:string|number;options:readonly(string|number)[];onChange:(value:string)=>void}) {
  return <div className="min-w-0 space-y-1.5"><Label htmlFor={id}>{label}</Label><select id={id} className={remodelSelectClass} value={value} onChange={e=>onChange(e.target.value)}>
    {options.map(o=><option key={o} value={o}>{o === "Dual Function" ? "Dual Function AFCI + GFCI" : o}</option>)}
  </select></div>
}
export function CircuitFields({circuit, onChange, id, breakerOnly = false, defaultLength}: {circuit:RemodelCircuit;onChange:(c:RemodelCircuit)=>void;id:string;breakerOnly?:boolean;defaultLength?:number}) {
  const c = circuit
  const issue = !breakerOnly && c.quantity > 0 ? circuitCompatibilityIssue(c) : undefined
  return <div className="space-y-3 rounded-lg border p-3">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <NumberField id={`${id}-quantity`} label={c.label ? `${c.label} quantity` : "Quantity"} value={c.quantity} quantity onChange={quantity=>onChange({...c,quantity})}/>
      {c.quantity > 0 && <>
      <SelectField id={`${id}-amperage`} label="Breaker amperage" value={c.amperage} options={circuitAmperages} onChange={v=>onChange({...c,amperage:Number(v)})}/>
      <SelectField id={`${id}-poles`} label="Poles" value={c.poleCount} options={[1,2]} onChange={v=>onChange({...c,poleCount:Number(v)})}/>
      <SelectField id={`${id}-protection`} label="Protection" value={c.protectionType} options={circuitProtections} onChange={protectionType=>onChange({...c,protectionType})}/>
      {!breakerOnly && <>
        {["electricRangeCircuits", "wallOvenCircuits", "dishwasherCircuits", "disposalCircuits"].includes(c.key) &&
          <SelectField id={`${id}-connection`} label="Appliance connection" value={c.connectionMethod ?? (["dishwasherCircuits", "disposalCircuits"].includes(c.key) ? "Receptacle-connected" : "Unspecified")} options={["Unspecified", "Receptacle-connected", "Hardwired"]} onChange={v=>onChange({...c,connectionMethod:v as RemodelCircuit["connectionMethod"]})}/>}
        <SelectField id={`${id}-cable`} label="Circuit cable" value={c.cableType} options={circuitCables} onChange={cableType=>onChange({...c,cableType})}/>
        <div className="space-y-1.5"><Label htmlFor={`${id}-length`}>Home run (FT)</Label><Input id={`${id}-length`} type="number" min="0" step="any" value={c.routeLength ?? ""} placeholder={`Default: ${defaultLength ?? 0}`} onChange={e=>onChange({...c,routeLength:e.target.value === "" ? undefined : Math.max(0,Number(e.target.value)||0)})}/></div>
      </>}
      </>}
    </div>
    {!breakerOnly && c.quantity > 0 && <p className="text-xs text-muted-foreground">{c.cableType}: {c.routeLength ?? defaultLength ?? 0} FT × {c.quantity} circuits = {(c.routeLength ?? defaultLength ?? 0)*c.quantity} FT. {c.routeLength === undefined ? "Uses default home run." : "Uses this circuit's route."}</p>}
    {issue && <p role="alert" className="text-sm text-amber-500">{issue}</p>}
  </div>
}
export function pricingNeedsReview(pricing: PricingSummary | undefined, assembly: AssemblyLine[] = []) {
  return !pricing || assembly.some(hasUnresolvedMaterialCost) ||
    pricing.pricingWarnings.some(w=>typeof w === "string" || w.severity === "error") ||
    pricing.finalSellingPrice < pricing.materialCost + (pricing.laborOverride ?? pricing.laborCost)
}
export function LaborSummary({pricing}: {pricing?: PricingSummary}) {
  if (!pricing || pricing.finalLaborHours === undefined) return null
  return <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs" aria-label="Labor calculation">
    <span>Calculated Labor: {(pricing.calculatedLaborHours ?? 0).toFixed(1)} hrs</span>
    <span>Manual Adjustment: {(pricing.manualLaborAdjustmentHours ?? 0)>=0 ? "+" : ""}{(pricing.manualLaborAdjustmentHours ?? 0).toFixed(1)} hrs</span>
    <strong>Final Labor: {pricing.finalLaborHours.toFixed(1)} hrs</strong>
  </div>
}
export function PricingReview({pricing, assembly = []}: {pricing:PricingSummary;assembly?:AssemblyLine[]}) {
  const unresolved = assembly.filter(hasUnresolvedMaterialCost)
  const duplicate = pricing.pricingWarnings.filter(w=>pricingWarningMessage(w).startsWith("Duplicate Price Book"))
  const supplied = assembly.filter(l=>l.intentionalExclusionReason?.includes("Customer"))
  const blocked = pricingNeedsReview(pricing,assembly)
  return <>
    <div className={`rounded-md border p-3 ${blocked ? "border-amber-400/50" : "border-primary/50"}`}>
      <p className="text-sm font-semibold">Status: {blocked ? "Needs Review" : "Ready for quote review"}</p>
      {blocked && <p className="mt-1 text-xs">Incomplete or unsafe pricing cannot be sent to a customer.</p>}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm">Review Issues ({pricing.pricingWarnings.length})</summary>
        <ul className="mt-2 max-h-64 list-disc space-y-2 overflow-auto pl-4 text-xs">
          {pricing.pricingWarnings.map((w,i)=><li key={i}>{pricingWarningMessage(w)}</li>)}
          {pricing.finalSellingPrice < pricing.materialCost+(pricing.laborOverride ?? pricing.laborCost) && <li>Selling price is below cost; deliberate loss approval is required in quote review.</li>}
        </ul>
      </details>
      <p className="mt-2 text-xs">{unresolved.length} items need verified pricing · {duplicate.length} duplicate catalog matches · {supplied.length} customer-supplied items</p>
    </div>
    <div className="space-y-2 text-sm">
      {([["Material Cost",pricing.materialCost],["Loaded Internal Labor Cost",pricing.laborOverride ?? pricing.laborCost],["Customer Labor",pricing.laborSellAmount ?? 0],["Final Selling Price",pricing.finalSellingPrice],["Gross Profit",pricing.grossProfit]] as const).map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-2"><span>{label}</span><strong className={label==="Final Selling Price" ? "text-primary" : "font-mono"}>${value.toFixed(2)}</strong></div>)}
      <p className="text-xs">Gross Margin: {(pricing.grossMargin*100).toFixed(1)}%</p>
      <LaborSummary pricing={pricing}/>
    </div>
    <MaterialSummary assembly={assembly}/>
    <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm">Material takeoff ({assembly.length} lines)</summary><div className="mt-3 max-h-96 space-y-3 overflow-auto text-xs">
      {assembly.map((line,i)=><div key={`${line.id}-${i}`} className="flex justify-between gap-3"><div><p>{line.description} × {line.quantity} {line.unit}</p><MaterialResolution line={line}/></div><strong className="shrink-0">{line.resolutionStatus === "CUSTOMER_SUPPLIED" ? "Supplied" : `$${line.extendedCost.toFixed(2)}`}</strong></div>)}
    </div></details>
  </>
}
