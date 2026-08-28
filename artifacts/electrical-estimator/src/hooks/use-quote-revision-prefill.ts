import { getGetQuoteQueryKey, useGetQuote } from "@workspace/api-client-react"
import { useEffect, useRef } from "react"
import { canonicalQuoteModule } from "@/lib/quote-builder-routes"

type RevisionModule =
  | "EV_CHARGER" | "BATHROOM" | "KITCHEN" | "RECESSED_LIGHTING"
  | "SERVICE_UPGRADE" | "PANEL_REPLACEMENT" | "SERVICE_CALL"
  | "TIME_MATERIALS" | "CUSTOM"

type RevisionSetters<T> = {
  setCustomerName: (value: string) => void
  setCustomerEmail: (value: string) => void
  setCustomerId: (value: number | undefined) => void
  setProjectName: (value: string) => void
  setProposalDescription: (value: string) => void
  setInputs: (value: T) => void
  setSettingsLoaded: (value: boolean) => void
}

/**
 * Hydrates an editable builder from an immutable saved snapshot. The query
 * parameter survives reloads, while the one-shot guard never overwrites edits
 * after the initial revision prefill.
 */
export function useQuoteRevisionPrefill<T>(
  module: RevisionModule,
  setters: RevisionSetters<T>,
) {
  const reviseFromText = new URLSearchParams(window.location.search).get("reviseFrom")
  const reviseFrom = reviseFromText && /^\d+$/.test(reviseFromText)
    ? Number(reviseFromText)
    : undefined
  const { data: source, isLoading, isError } = useGetQuote(reviseFrom ?? 0, {
    query: { enabled: reviseFrom !== undefined, queryKey: getGetQuoteQueryKey(reviseFrom ?? 0) },
  })
  const appliedSourceId = useRef<number | null>(null)

  useEffect(() => {
    if (!source || canonicalQuoteModule(source.module) !== module || appliedSourceId.current === source.id) return
    appliedSourceId.current = source.id
    setters.setCustomerName(source.customerName)
    setters.setCustomerEmail(source.customerEmail ?? "")
    setters.setCustomerId(source.customerId ?? undefined)
    setters.setProjectName(source.projectName)
    setters.setProposalDescription(source.proposalDescription)
    setters.setInputs(source.jobInputs as T)
    // Revision snapshots own every builder input. Do not let an asynchronous
    // settings response overwrite them after this point.
    setters.setSettingsLoaded(true)
  }, [module, setters, source])

  return { source, sourceQuoteId: source?.id, isRevision: reviseFrom !== undefined, isLoading, isError }
}