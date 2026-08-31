import { useUser } from "@clerk/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  clearQuoteBuilderDraft,
  e2eDraftScope,
  readQuoteBuilderDraft,
  saveQuoteBuilderDraft,
  type QuoteBuilderDraftValues,
  type QuoteBuilderModule,
  type StoredQuoteBuilderDraft,
} from "@/lib/quote-builder-draft-storage"

type DraftSetters<T> = {
  setCustomerName: (value: string) => void
  setCustomerEmail: (value: string) => void
  setCustomerId: (value: number | undefined) => void
  setProjectName: (value: string) => void
  setProposalDescription: (value: string) => void
  setInputs: (value: T) => void
  setLaborOverride?: (value: string) => void
  setSellingPriceOverride?: (value: string) => void
  setTakeoffId?: (value: number | undefined) => void
}

export function useQuoteBuilderDraft<T>({
  module,
  ready,
  values,
  setters,
}: {
  module: QuoteBuilderModule
  ready: boolean
  values: QuoteBuilderDraftValues<T>
  setters: DraftSetters<T>
}) {
  const clerkUser = import.meta.env.VITE_E2E_AUTH === "true" ? null : useUser()
  const scope = clerkUser?.user?.id ?? e2eDraftScope()
  const storageKey = useMemo(
    () => (scope ? `${scope}:${module}` : null),
    [module, scope],
  )
  const serializedValues = JSON.stringify(values)
  const baselineRef = useRef<string | null>(null)
  const [pendingDraft, setPendingDraft] = useState<StoredQuoteBuilderDraft<T> | null>(null)
  const [isDraftStorageUnavailable, setIsDraftStorageUnavailable] = useState(false)

  useEffect(() => {
    baselineRef.current = null
    setPendingDraft(
      scope && ready ? readQuoteBuilderDraft<T>(module, scope) : null,
    )
  }, [module, ready, scope])

  useEffect(() => {
    if (!ready || !storageKey || baselineRef.current !== null) return
    baselineRef.current = serializedValues
  }, [ready, serializedValues, storageKey])

  useEffect(() => {
    if (!ready || !scope || !storageKey || baselineRef.current === null) return
    if (pendingDraft) return
    if (baselineRef.current === serializedValues) return

    const didSave = saveQuoteBuilderDraft(module, scope, values)
    setIsDraftStorageUnavailable(!didSave)
    baselineRef.current = serializedValues
    setPendingDraft(null)
  }, [module, pendingDraft, ready, scope, serializedValues, storageKey, values])

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return
    const draft = pendingDraft.values
    setters.setCustomerName(draft.customerName)
    setters.setCustomerEmail(draft.customerEmail)
    setters.setCustomerId(draft.customerId)
    setters.setProjectName(draft.projectName)
    setters.setProposalDescription(draft.proposalDescription)
    setters.setInputs(draft.inputs)
    setters.setLaborOverride?.(draft.laborOverride ?? "")
    setters.setSellingPriceOverride?.(draft.sellingPriceOverride ?? "")
    setters.setTakeoffId?.(draft.takeoffId)
    setPendingDraft(null)
  }, [pendingDraft, setters])

  const discardDraft = useCallback(() => {
    clearQuoteBuilderDraft(module, scope)
    baselineRef.current = serializedValues
    setPendingDraft(null)
  }, [module, scope, serializedValues])

  const clearDraft = useCallback(() => {
    clearQuoteBuilderDraft(module, scope)
    baselineRef.current = serializedValues
    setPendingDraft(null)
  }, [module, scope, serializedValues])

  return {
    draftRecovery: {
      isAvailable: pendingDraft !== null,
      savedAt: pendingDraft?.savedAt,
      isStorageUnavailable: isDraftStorageUnavailable,
      onRestore: restoreDraft,
      onDiscard: discardDraft,
    },
    clearDraft,
    scope,
  }
}