import { useState } from "react"
import {
  useUpdateCompanyProfile,
  useUpdateCompanyOnboarding,
  CompanyTrade,
  type CompanyProfile,
} from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, AlertCircle } from "lucide-react"

interface OnboardingProps {
  initialCompanyName?: string
  initialTrade?: CompanyTrade
  onComplete: (profile: CompanyProfile) => void
  onGoToPriceBook?: (profile: CompanyProfile) => void
  /**
   * Optional sign-out handler. Omitted from the E2E harness (Clerk isn't in
   * the tree). When absent, the sign-out link isn't rendered.
   */
  onSignOut?: () => void
}

// The auto-provisioner assigns a placeholder company name for brand-new users.
// We must not accept it as the real value; require the user to type their own.
const PLACEHOLDER_COMPANY_NAME = "My Company"

export function Onboarding({
  initialCompanyName = "",
  initialTrade,
  onComplete,
  onGoToPriceBook,
  onSignOut,
}: OnboardingProps) {
  const [step, setStep] = useState(1)
  const [companyName, setCompanyName] = useState(
    initialCompanyName && initialCompanyName !== PLACEHOLDER_COMPANY_NAME
      ? initialCompanyName
      : "",
  )
  const [trade, setTrade] = useState<CompanyTrade | undefined>(initialTrade)
  const [priceBookChoice, setPriceBookChoice] = useState<"import" | "empty" | "skip">()
  const [error, setError] = useState<string | null>(null)

  const updateProfile = useUpdateCompanyProfile()
  const updateOnboarding = useUpdateCompanyOnboarding()

  const totalSteps = 3
  // Show progress as "step N-1 complete" so we never read 100% before Finish.
  const progress = ((step - 1) / totalSteps) * 100

  const handleNextStep1 = () => {
    const trimmed = companyName.trim()
    if (!trimmed) {
      setError("Company name is required")
      return
    }
    if (trimmed.toLowerCase() === PLACEHOLDER_COMPANY_NAME.toLowerCase()) {
      setError("Please enter your real company name")
      return
    }
    setError(null)
    setStep(2)
  }

  const handleNextStep2 = () => {
    if (!trade) {
      setError("Please select a primary trade")
      return
    }
    setError(null)
    setStep(3)
  }

  const handleFinish = async () => {
    if (!priceBookChoice) {
      setError("Please choose how to set up your price book")
      return
    }
    setError(null)
    try {
      await updateProfile.mutateAsync({
        data: {
          companyName: companyName.trim(),
          trade,
        },
      })

      const updatedProfile = await updateOnboarding.mutateAsync({
        data: {
          onboardingCompleted: true,
        },
      })

      if (priceBookChoice === "import" && onGoToPriceBook) {
        onGoToPriceBook(updatedProfile)
      } else {
        onComplete(updatedProfile)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save onboarding settings")
    }
  }

  const isSaving = updateProfile.isPending || updateOnboarding.isPending

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/30 p-4">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex-1" />
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Welcome to PriceCrew</h1>
            <p className="text-muted-foreground">Let's set up your estimating workspace.</p>
          </div>
          <div className="flex-1 flex justify-end">
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                data-testid="btn-sign-out"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        <Progress value={progress} className="h-2" data-testid="onboarding-progress" />

        <Card className="shadow-lg border-border/50">
          {step === 1 && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleNextStep1()
              }}
            >
              <CardHeader>
                <CardTitle>Company Name</CardTitle>
                <CardDescription>What should we call your workspace?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="company-name">
                    Company Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="company-name"
                    data-testid="input-company-name"
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder="e.g. Chad Hebert Electric"
                    autoFocus
                  />
                  {error && (
                    <p
                      className="text-sm text-destructive"
                      role="alert"
                      data-testid="error-message"
                    >
                      {error}
                    </p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button type="submit" data-testid="btn-next">
                    Continue
                  </Button>
                </div>
              </CardContent>
            </form>
          )}

          {step === 2 && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleNextStep2()
              }}
            >
              <CardHeader>
                <CardTitle>Primary Trade</CardTitle>
                <CardDescription>
                  We'll configure your initial settings based on your trade.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(Object.values(CompanyTrade) as CompanyTrade[]).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={trade === t ? "default" : "outline"}
                      className="h-auto py-4 px-6 justify-start text-left font-medium"
                      data-testid={`trade-option-${t}`}
                      onClick={() => {
                        setTrade(t)
                        if (error) setError(null)
                      }}
                    >
                      {t}
                    </Button>
                  ))}
                </div>

                {trade === CompanyTrade.Electrical && (
                  <div className="rounded-md bg-muted/50 p-4 border flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm">Electrical templates included</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        We'll initialize your workspace with starter assemblies for panels,
                        services, and circuits.
                      </p>
                    </div>
                  </div>
                )}

                {trade && trade !== CompanyTrade.Electrical && (
                  <div className="rounded-md bg-muted/50 p-4 border flex gap-3">
                    <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm">Blank workspace</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        We don't have built-in assemblies for {trade} yet, but you can start
                        from the Builders page and build custom quotes right away.
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <p
                    className="text-sm text-destructive"
                    role="alert"
                    data-testid="error-message"
                  >
                    {error}
                  </p>
                )}

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(1)}
                    data-testid="btn-back"
                  >
                    Back
                  </Button>
                  <Button type="submit" data-testid="btn-next">
                    Continue
                  </Button>
                </div>
              </CardContent>
            </form>
          )}

          {step === 3 && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleFinish()
              }}
            >
              <CardHeader>
                <CardTitle>Price Book</CardTitle>
                <CardDescription>
                  How would you like to build your material and labor catalog?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant={priceBookChoice === "import" ? "default" : "outline"}
                    className="w-full h-auto py-6 px-6 justify-start text-left flex-col items-start gap-2 whitespace-normal"
                    data-testid="pricebook-option-import"
                    onClick={() => {
                      setPriceBookChoice("import")
                      if (error) setError(null)
                    }}
                  >
                    <div className="font-semibold text-base">Import from CSV</div>
                    <div
                      className={
                        priceBookChoice === "import"
                          ? "text-primary-foreground/90"
                          : "text-muted-foreground"
                      }
                    >
                      Upload your existing catalog from another tool or spreadsheet.
                    </div>
                  </Button>

                  <Button
                    type="button"
                    variant={priceBookChoice === "empty" ? "default" : "outline"}
                    className="w-full h-auto py-6 px-6 justify-start text-left flex-col items-start gap-2 whitespace-normal"
                    data-testid="pricebook-option-empty"
                    onClick={() => {
                      setPriceBookChoice("empty")
                      if (error) setError(null)
                    }}
                  >
                    <div className="font-semibold text-base">Start from scratch</div>
                    <div
                      className={
                        priceBookChoice === "empty"
                          ? "text-primary-foreground/90"
                          : "text-muted-foreground"
                      }
                    >
                      Build your catalog item by item as you quote.
                    </div>
                  </Button>

                  <Button
                    type="button"
                    variant={priceBookChoice === "skip" ? "default" : "outline"}
                    className="w-full h-auto py-6 px-6 justify-start text-left flex-col items-start gap-2 whitespace-normal"
                    data-testid="pricebook-option-skip"
                    onClick={() => {
                      setPriceBookChoice("skip")
                      if (error) setError(null)
                    }}
                  >
                    <div className="font-semibold text-base">Decide later</div>
                    <div
                      className={
                        priceBookChoice === "skip"
                          ? "text-primary-foreground/90"
                          : "text-muted-foreground"
                      }
                    >
                      Skip the price book for now and jump straight to quoting.
                    </div>
                  </Button>
                </div>

                {error && (
                  <p
                    className="text-sm text-destructive"
                    role="alert"
                    data-testid="error-message"
                  >
                    {error}
                  </p>
                )}

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(2)}
                    disabled={isSaving}
                    data-testid="btn-back"
                  >
                    Back
                  </Button>
                  <Button type="submit" disabled={isSaving} data-testid="btn-finish">
                    {isSaving
                      ? "Saving..."
                      : priceBookChoice === "import"
                      ? "Finish & Import CSV"
                      : "Finish & Go to Dashboard"}
                  </Button>
                </div>
              </CardContent>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}

export default Onboarding
