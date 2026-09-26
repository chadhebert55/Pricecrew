import type { AssemblyLine } from "@workspace/api-client-react"
import { hasUnresolvedMaterialCost } from "@workspace/api-zod/pricing-readiness"

export function MaterialResolution({line}: {line: AssemblyLine}) {
  const snapshot = line.materialSnapshot
  if (line.resolutionStatus === "CUSTOMER_SUPPLIED" || /customer.supplied/i.test(line.intentionalExclusionReason ?? ""))
    return <span className="text-xs font-semibold text-muted-foreground">CUSTOMER SUPPLIED · installation remains included</span>
  if (hasUnresolvedMaterialCost(line)) return <div className="mt-1 space-y-1 text-xs text-amber-500">
    <p>{line.resolutionStatus === "UNRESOLVED_UOM" ? "Supplier unit conversion needs review"
      : line.resolutionStatus === "UNRESOLVED_AMBIGUOUS" ? "Equally valid catalog matches need a company preference"
      : "Needs company material selection"}</p>
    <a className="underline" href={`/price-book?material=${encodeURIComponent(line.materialRequestKey ?? snapshot?.requestKey ?? line.description)}`}>
      Select Catalog Item
    </a>
  </div>
  if (!snapshot) return <span className="text-xs text-muted-foreground">{line.source}</span>
  return <div className="mt-1 text-xs text-muted-foreground">
    <p>{snapshot.manufacturer} {snapshot.manufacturerPartNumber}</p>
    <p>{snapshot.resolutionStatus === "RESOLVED_COMPANY_PREFERRED" ? "Company preferred" :
      snapshot.resolutionStatus === "RESOLVED_APPROVED_ALTERNATE" ? "Approved alternate" :
      snapshot.resolutionStatus === "MANUAL_OVERRIDE" ? "Company price override" : "Catalog matched"} · {snapshot.supplier ?? "Company Price Book"}</p>
    <p>${line.unitCost.toFixed(2)} / {line.unit}</p>
    <details className="mt-1"><summary className="cursor-pointer">Price snapshot</summary>
      <p>Catalog #{snapshot.catalogId ?? "not recorded"} · SKU {snapshot.supplierSku ?? "not recorded"} · Price date {snapshot.sourceDate ?? "not recorded"}</p>
      <p>{snapshot.supplierCost != null ? `Supplier: ${snapshot.supplierCost} / ${snapshot.supplierUom}` : "Legacy canonical cost; raw supplier basis not recorded"} · Internal: {snapshot.normalizedUnitCost} / {snapshot.normalizedUnit}</p>
    </details>
  </div>
}

export function MaterialSummary({assembly}: {assembly: AssemblyLine[]}) {
  const active = assembly.filter(l=>l.quantity > 0)
  const unresolved = active.filter(hasUnresolvedMaterialCost).length
  const supplied = active.filter(l=>l.resolutionStatus === "CUSTOMER_SUPPLIED" || /customer.supplied/i.test(l.intentionalExclusionReason ?? "")).length
  return <p className="text-xs text-muted-foreground">Materials: {active.length-unresolved-supplied} resolved / included · {supplied} customer supplied · {unresolved} need review</p>
}
