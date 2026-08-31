import {
  type BillingPlan,
  type BillingPlanOption,
  useCreateBillingCheckout,
  useGetBilling,
} from "@workspace/api-client-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { CreditCard, ShieldCheck } from "lucide-react"

function PlanCard({
  plan,
  currentPlan,
  checkoutAvailable,
  isPending,
  onSelect,
}: {
  plan: BillingPlanOption
  currentPlan: BillingPlan | null
  checkoutAvailable: boolean
  isPending: boolean
  onSelect: (plan: BillingPlan) => void
}) {
  const isCurrent = currentPlan === plan.id

  return (
    <Card className={isCurrent ? "border-primary shadow-sm" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{plan.name}</CardTitle>
          {isCurrent && <Badge>Current plan</Badge>}
        </div>
        <CardDescription>{plan.description}.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold">${plan.amount}</span>
          <span className="text-muted-foreground">/{plan.interval}</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={isCurrent ? "outline" : "default"}
          disabled={isPending || isCurrent || !checkoutAvailable}
          onClick={() => onSelect(plan.id)}
          data-testid={`billing-select-${plan.id}`}
        >
          {isCurrent
            ? "Current plan"
            : isPending
              ? "Opening test checkout…"
              : `Select ${plan.name}`}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function Billing() {
  const { data: billing, isLoading, isError, error } = useGetBilling()
  const { toast } = useToast()
  
  const createCheckout = useCreateBillingCheckout({
    mutation: {
      onSuccess: (response) => {
        if (response.checkoutUrl) {
          window.location.href = response.checkoutUrl
        } else {
          toast({
            variant: "destructive",
            title: "Checkout unavailable",
            description: "No payment was processed. The checkout session could not be established."
          })
        }
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Checkout failed",
          description: err instanceof Error ? err.message : "No payment was processed. Please try again later."
        })
      }
    }
  })

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl animate-pulse">
        <div>
          <div className="h-9 w-48 bg-muted rounded mb-2"></div>
          <div className="h-5 w-96 bg-muted rounded"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-muted rounded-lg border"></div>
          <div className="h-64 bg-muted rounded-lg border"></div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-8 text-destructive max-w-4xl border border-destructive/20 rounded bg-destructive/5">
        <h2 className="text-lg font-semibold mb-2">Failed to load billing information</h2>
        <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
      </div>
    )
  }

  if (!billing) {
    return null
  }

  const selectPlan = (plan: BillingPlan) => {
    if (!billing.checkoutAvailable) {
      toast({
        variant: "destructive",
        title: "Test checkout unavailable",
        description: "No payment was processed.",
      })
      return
    }
    createCheckout.mutate({ data: { plan } })
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Billing</h1>
          <p className="mt-1 text-muted-foreground">
            Choose a PriceCrew plan. This development workspace accepts test checkout only.
          </p>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 py-1">
          <ShieldCheck size={14} />
          Test mode only
        </Badge>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <CreditCard size={20} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="font-semibold">
                {billing.currentPlan
                  ? billing.plans.find((plan) => plan.id === billing.currentPlan)?.name ?? billing.currentPlan
                  : "No active plan"}
              </p>
            </div>
          </div>
          <Badge variant={billing.checkoutAvailable ? "success" : "warning"}>
            {billing.checkoutAvailable ? "Test checkout ready" : "Setup needed"}
          </Badge>
        </CardContent>
      </Card>

      <div
        className={`rounded-md border p-4 text-sm ${
          billing.checkoutAvailable
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300"
            : "border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-300"
        }`}
        data-testid="billing-setup-state"
      >
        <p className="font-medium">
          {billing.checkoutAvailable ? "Stripe test checkout is connected" : "Stripe test checkout needs setup"}
        </p>
        <p className="mt-1">{billing.message} No real payment will be processed.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {billing.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currentPlan={billing.currentPlan}
            checkoutAvailable={billing.checkoutAvailable}
            isPending={createCheckout.isPending}
            onSelect={selectPlan}
          />
        ))}
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Plan limits and final marketing language have not been supplied in this project and should be verified before launch.
      </p>
    </div>
  )
}
