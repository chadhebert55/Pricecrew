import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
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
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertCircle, CheckCircle2 } from "lucide-react"

interface OnboardingProps {
  initialCompanyName?: string
  initialTrade?: CompanyTrade
  onComplete: (profile: CompanyProfile) => void
  onGoToPriceBook?: (profile: CompanyProfile) => void
}

export function Onboarding({
  initialCompanyName = "",
  initialTrade,
  onComplete,
  onGoToPriceBook,
}: OnboardingProps) {
  const [step, setStep] = useState(1)
  const [companyName, setCompanyName] = useState(initialCompanyName || "My Company")
  const [trade, setTrade] = useState<CompanyTrade | undefined>(initialTrade)
  const [priceBookChoice, setPriceBookChoice] = useState<"import" | "empty" | "skip">()
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const updateProfile = useUpdateCompanyProfile()
  const updateOnboarding = useUpdateCompanyOnboarding()

  const totalSteps = 4
  const progress = (step / totalSteps) * 100

  const handleNextStep1 = () => {
    if (!companyName.trim()) {
      setError("Company name is required")
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

  const handleNextStep3 = () => {
    if (!priceBookChoice) {
      setError("Please choose how to set up your price book")
      return
    }
    setError(null)
    setStep(4)
  }

  const handleFinish = async () => {
    setError(null)
    try {
      await updateProfile.mutateAsync({
        data: {
          companyName,
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/30 p-4">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to PriceCrew</h1>
          <p className="text-muted-foreground">Let's set up your estimating workspace.</p>
        </div>

        <Progress value={progress} className="h-2" data-testid="onboarding-progress" />

        <Card className="shadow-lg border-border/50">
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle>Company Name</CardTitle>
                <CardDescription>What should we call your workspace?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="company-name"
                    data-testid="input-company-name"
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder="My Company"
                    autoFocus
                  />
                  {error && <p className="text-sm text-destructive" data-testid="error-message">{error}</p>}
                </div>
                <div className="flex justify-end">
                  <Button data-testid="btn-next" onClick={handleNextStep1}>Continue</Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle>Primary Trade</CardTitle>
                <CardDescription>We'll configure your initial settings based on your trade.</CardDescription>
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
                      <p className="text-sm text-muted-foreground mt-1">We'll initialize your workspace with starter assemblies for panels, services, and circuits.</p>
                    </div>
                  </div>
                )}
                
                {trade && trade !== CompanyTrade.Electrical && (
                   <div className="rounded-md bg-muted/50 p-4 border flex gap-3">
                    <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm">Blank workspace</h4>
                      <p className="text-sm text-muted-foreground mt-1">We don't have built-in assemblies for {trade} yet, but you can build custom quotes right away.</p>
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-destructive" data-testid="error-message">{error}</p>}
                
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)} data-testid="btn-back">Back</Button>
                  <Button onClick={handleNextStep2} data-testid="btn-next">Continue</Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle>Price Book</CardTitle>
                <CardDescription>How would you like to build your material and labor catalog?</CardDescription>
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
                    <div className={priceBookChoice === "import" ? "text-primary-foreground/90" : "text-muted-foreground"}>
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
                    <div className={priceBookChoice === "empty" ? "text-primary-foreground/90" : "text-muted-foreground"}>
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
                    <div className={priceBookChoice === "skip" ? "text-primary-foreground/90" : "text-muted-foreground"}>
                      Skip the price book for now and jump straight to quoting.
                    </div>
                  </Button>
                </div>

                {error && <p className="text-sm text-destructive" data-testid="error-message">{error}</p>}
                
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(2)} data-testid="btn-back">Back</Button>
                  <Button onClick={handleNextStep3} data-testid="btn-next">Continue</Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 4 && (
            <>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Invite Crew</CardTitle>
                  <Badge variant="secondary" className="font-normal">Coming soon</Badge>
                </div>
                <CardDescription>Collaborate with your team on estimates and price books.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg bg-muted/20 text-center">
                  <p className="text-muted-foreground">Team invitations are currently under development.</p>
                  <p className="text-sm text-muted-foreground mt-2">You can invite your crew from the Settings page later.</p>
                </div>

                {error && <p className="text-sm text-destructive" data-testid="error-message">{error}</p>}
                
                <div className="flex justify-between">
                  <Button 
                    variant="ghost" 
                    onClick={() => setStep(3)} 
                    disabled={updateProfile.isPending || updateOnboarding.isPending}
                    data-testid="btn-back"
                  >
                    Back
                  </Button>
                  <Button 
                    onClick={handleFinish} 
                    disabled={updateProfile.isPending || updateOnboarding.isPending}
                    data-testid="btn-finish"
                  >
                    {updateProfile.isPending || updateOnboarding.isPending ? "Saving..." : (priceBookChoice === "import" ? "Finish & Import CSV" : "Finish & Go to Dashboard")}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

export default Onboarding
