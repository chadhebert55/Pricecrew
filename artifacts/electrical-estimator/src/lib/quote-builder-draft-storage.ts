export type QuoteBuilderModule =
  | "EV_CHARGER"
  | "BATHROOM"
  | "KITCHEN"
  | "RECESSED_LIGHTING"
  | "ADDITION"
  | "SERVICE_UPGRADE"
  | "PANEL_REPLACEMENT"
  | "SERVICE_CALL"
  | "TIME_MATERIALS"
  | "CUSTOM"
  | "NEW_HOUSE"

export type QuoteBuilderDraftValues<T> = {
  customerName: string
  customerEmail: string
  customerId?: number
  projectName: string
  proposalDescription: string
  inputs: T
  laborOverride?: string
  sellingPriceOverride?: string
  takeoffId?: number
}

export type StoredQuoteBuilderDraft<T> = {
  version: 1
  savedAt: string
  values: QuoteBuilderDraftValues<T>
}

const STORAGE_PREFIX = "electrical-estimator:quote-builder-draft:v1"

export function quoteBuilderDraftStorageKey(
  module: QuoteBuilderModule,
  scope: string,
) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope)}:${module}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isDraftValues(value: unknown): value is QuoteBuilderDraftValues<unknown> {
  return (
    isRecord(value) &&
    typeof value.customerName === "string" &&
    typeof value.customerEmail === "string" &&
    typeof value.projectName === "string" &&
    typeof value.proposalDescription === "string" &&
    isRecord(value.inputs) &&
    (value.laborOverride === undefined || typeof value.laborOverride === "string") &&
    (value.sellingPriceOverride === undefined || typeof value.sellingPriceOverride === "string")
  )
}

export function readQuoteBuilderDraft<T>(
  module: QuoteBuilderModule,
  scope: string | null,
): StoredQuoteBuilderDraft<T> | null {
  if (!scope || typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(quoteBuilderDraftStorageKey(module, scope))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      typeof parsed.savedAt !== "string" ||
      !isDraftValues(parsed.values)
    ) {
      return null
    }
    return parsed as StoredQuoteBuilderDraft<T>
  } catch {
    return null
  }
}

export function saveQuoteBuilderDraft<T>(
  module: QuoteBuilderModule,
  scope: string | null,
  values: QuoteBuilderDraftValues<T>,
): boolean {
  if (!scope || typeof window === "undefined") return false

  try {
    window.localStorage.setItem(
      quoteBuilderDraftStorageKey(module, scope),
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), values }),
    )
    return true
  } catch {
    return false
  }
}

export function clearQuoteBuilderDraft(
  module: QuoteBuilderModule,
  scope: string | null,
): void {
  if (!scope || typeof window === "undefined") return

  try {
    window.localStorage.removeItem(quoteBuilderDraftStorageKey(module, scope))
  } catch {
    // Storage can be unavailable in private browsing; there is nothing else to clear.
  }
}

export function e2eDraftScope(): string | null {
  if (import.meta.env.VITE_E2E_AUTH !== "true") return null
  return new URLSearchParams(window.location.search).get("draftScope") ?? "e2e"
}