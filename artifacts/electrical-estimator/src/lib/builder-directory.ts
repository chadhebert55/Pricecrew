import { Zap, Construction, AlertTriangle, Waves, UtensilsCrossed, Lightbulb, Wrench, Clock, Shapes, House, HousePlus, type LucideIcon } from "lucide-react"

export const builderCategories = ["Residential Projects", "Service & Equipment", "Flexible Estimating"] as const
export type BuilderCategory = typeof builderCategories[number]
export type BuilderListing = {
  id: string
  trade: "electrical"
  category: BuilderCategory
  displayName: string
  description: string
  icon: LucideIcon
  route: string
  keywords: string[]
}

// Presentation metadata only. IDs and routes retain their existing meanings.
// All paid plans share this directory; there are no per-builder entitlements.
export const builderDirectory: BuilderListing[] = [
  { id: "new-house", trade: "electrical", category: "Residential Projects", displayName: "New House", description: "Complete new-home electrical estimating.", icon: House, route: "/quotes/new/new-house", keywords: ["home", "construction", "residential"] },
  { id: "addition", trade: "electrical", category: "Residential Projects", displayName: "Addition", description: "Estimate electrical work for residential additions.", icon: HousePlus, route: "/quotes/new/addition", keywords: ["extension", "remodel"] },
  { id: "kitchen", trade: "electrical", category: "Residential Projects", displayName: "Kitchen", description: "Appliance circuits, receptacles, lighting and controls.", icon: UtensilsCrossed, route: "/quotes/new/kitchen", keywords: ["remodel", "range", "countertop"] },
  { id: "bathroom", trade: "electrical", category: "Residential Projects", displayName: "Bathroom", description: "Receptacles, lighting, ventilation, controls and circuits.", icon: Waves, route: "/quotes/new/bathroom", keywords: ["bath", "fan", "remodel"] },
  { id: "recessed-lighting", trade: "electrical", category: "Residential Projects", displayName: "Recessed Lighting", description: "Plan and price recessed lighting installations.", icon: Lightbulb, route: "/quotes/new/recessed-lighting", keywords: ["wafer", "can lights", "downlights"] },
  { id: "service-call", trade: "electrical", category: "Service & Equipment", displayName: "Service Call", description: "Price service visits, repairs and small jobs.", icon: Wrench, route: "/quotes/new/service-call", keywords: ["repair", "troubleshooting", "maintenance"] },
  { id: "panel-swap", trade: "electrical", category: "Service & Equipment", displayName: "Panel Replacement", description: "Price panel replacements and subpanel installations.", icon: AlertTriangle, route: "/quotes/new/panel-replacement", keywords: ["breaker", "subpanel", "panel swap"] },
  { id: "service-upgrade", trade: "electrical", category: "Service & Equipment", displayName: "Service Upgrade", description: "Estimate residential and commercial service upgrades.", icon: Construction, route: "/quotes/new/service-upgrade", keywords: ["panel", "meter", "200a", "100a"] },
  { id: "ev-charger", trade: "electrical", category: "Service & Equipment", displayName: "EV Charger", description: "Estimate Level 2 EV charger installations.", icon: Zap, route: "/quotes/new/ev-charger", keywords: ["car", "vehicle", "charging", "electric vehicle"] },
  { id: "time-materials", trade: "electrical", category: "Flexible Estimating", displayName: "Time & Materials", description: "Estimate labor, materials and miscellaneous costs.", icon: Clock, route: "/quotes/new/time-materials", keywords: ["hourly", "t&m", "crew"] },
  { id: "custom", trade: "electrical", category: "Flexible Estimating", displayName: "Custom Quote", description: "Build a custom electrical scope from scratch.", icon: Shapes, route: "/quotes/new/custom", keywords: ["custom items", "flexible"] },
]

export function searchBuilders(builders: BuilderListing[], query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return builders.filter(builder => {
    const text = [builder.displayName, builder.description, builder.category, ...builder.keywords].join(" ").toLocaleLowerCase()
    return terms.every(term => text.includes(term))
  })
}
