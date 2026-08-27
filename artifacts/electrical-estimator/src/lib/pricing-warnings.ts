import type { PricingWarning } from "@workspace/api-client-react"

type DisplayableWarning = PricingWarning | string

export function pricingWarningMessage(warning: DisplayableWarning) {
  return typeof warning === "string" ? warning : warning.message
}

export function pricingWarningKey(warning: DisplayableWarning, index: number) {
  return typeof warning === "string"
    ? `legacy-${index}-${warning}`
    : `${warning.code}-${index}-${warning.message}`
}