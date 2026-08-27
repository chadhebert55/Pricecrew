import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Zap, Construction, AlertTriangle, ArrowRight, Waves, UtensilsCrossed, Lightbulb, Wrench, Clock } from "lucide-react"
import { Link } from "wouter"

export function Builders() {
  const modules = [
    {
      id: "service-call",
      title: "Service Call",
      description: "Build residential or commercial service visits with common device replacements, adjustable labor, verified materials, and visible pricing warnings.",
      icon: Wrench,
      status: "live",
      href: "/quotes/new/service-call"
    },
    {
      id: "time-materials",
      title: "Time & Materials",
      description: "Estimate adjustable crew hours, labor rates, loaded costs, margin targets, and miscellaneous material lines.",
      icon: Clock,
      status: "live",
      href: "/quotes/new/time-materials"
    },
    {
      id: "bathroom",
      title: "Bathroom Electrical",
      description: "Build bathroom scopes with receptacles, lighting, ventilation, switching, heated floors, circuit options, and editable overrides.",
      icon: Waves,
      status: "live",
      href: "/quotes/new/bathroom"
    },
    {
      id: "ev-charger",
      title: "EV Charger Installation",
      description: "Complete builder for Level 2 EV charging circuits, including wire sizing, conduit routing, and panel capacity checks.",
      icon: Zap,
      status: "live",
      href: "/quotes/new"
    },
    {
      id: "kitchen",
      title: "Kitchen Electrical",
      description: "Build appliance circuits, countertop receptacles, lighting, controls, and route-based kitchen wiring.",
      icon: UtensilsCrossed,
      status: "live",
      href: "/quotes/new/kitchen"
    },
    {
      id: "recessed-lighting",
      title: "Recessed Lighting",
      description: "Plan room spacing, fixture quantities, switching, wiring, circuit protection, access, and labor with verified Juno fixture pricing.",
      icon: Lightbulb,
      status: "live",
      href: "/quotes/new/recessed-lighting"
    },
    {
      id: "service-upgrade",
      title: "Service Upgrade",
      description: "100A to 200A residential and commercial service upgrades. Includes mast, meter main, and grounding.",
      icon: Construction,
      status: "live",
      href: "/quotes/new/service-upgrade"
    },
    {
      id: "panel-swap",
      title: "Panel Replacement",
      description: "Like-for-like panel swaps or sub-panel additions with AFCI/GFCI requirements.",
      icon: AlertTriangle,
      status: "live",
      href: "/quotes/new/panel-replacement"
    }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Estimating Builders</h1>
        <p className="text-muted-foreground mt-1">Parametric estimating modules designed for speed and accuracy.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((mod) => (
          <Card key={mod.id} className={`flex flex-col ${mod.status === 'upcoming' ? 'opacity-70 bg-muted/30' : 'border-primary shadow-sm hover:shadow-md transition-shadow'}`}>
            <CardHeader>
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-lg ${mod.status === 'live' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <mod.icon size={24} />
                </div>
                <Badge variant={mod.status === 'live' ? 'default' : 'outline'}>
                  {mod.status === 'live' ? 'ACTIVE' : 'UPCOMING'}
                </Badge>
              </div>
              <CardTitle>{mod.title}</CardTitle>
              <CardDescription className="h-12">{mod.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex items-end pt-4">
              {mod.status === 'live' ? (
                <Link href={mod.href} className="w-full">
                  <Button className="w-full gap-2">
                    Use Builder
                    <ArrowRight size={16} />
                  </Button>
                </Link>
              ) : (
                <Button variant="secondary" className="w-full" disabled>
                  In Development
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
