import {
  exportHousecallProQuoteCsv,
  exportJobberQuoteCsv,
  exportQuickBooksQuoteCsv,
  type QuoteExportMapping,
  type QuoteExportRequestDestination,
  type QuoteExportPreflightIssue,
  usePreflightQuoteExport,
} from "@workspace/api-client-react"
import { useEffect, useRef, useState } from "react"
import { Download, FileText, PlugZap, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

type QuoteExportCardProps = {
  quoteId: number
  customerName: string
  customerEmail: string | null | undefined
  isDirty: boolean
}

export function QuoteExportCard({
  quoteId,
  customerName,
  customerEmail,
  isDirty,
}: QuoteExportCardProps) {
  const { toast } = useToast()
  const preflightExport = usePreflightQuoteExport()
  const initializedForId = useRef<number | null>(null)
  const [mapping, setMapping] = useState<QuoteExportMapping>({})
  const [destination, setDestination] = useState<QuoteExportRequestDestination>("jobber")
  const [issues, setIssues] = useState<QuoteExportPreflightIssue[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initializedForId.current === quoteId) return
    initializedForId.current = quoteId
    const nameParts = customerName.trim().split(/\s+/).filter(Boolean)
    setMapping({
      clientFirstName: nameParts[0] || "",
      clientLastName: nameParts.slice(1).join(" "),
      clientEmail: customerEmail || "",
      propertyCountry: "United States",
      quickBooksInvoiceDate: new Date().toISOString().slice(0, 10),
      quickBooksDueDate: new Date().toISOString().slice(0, 10),
    })
    setIssues([])
  }, [customerEmail, customerName, quoteId])

  const updateMapping = (field: keyof QuoteExportMapping, value: string) => {
    setMapping((current) => ({ ...current, [field]: value }))
    setIssues([])
  }

  const handleExport = async () => {
    if (isDirty) {
      toast({
        variant: "destructive",
        title: "Save changes before exporting",
        description: "Exports always use the saved quote snapshot, so unsaved quote-detail edits are not included.",
      })
      return
    }

    const data = {
      destination,
      format: "csv" as const,
      mapping,
    }
    setBusy(true)
    try {
      const preflight = await preflightExport.mutateAsync({ id: quoteId, data })
      setIssues(preflight.issues)
      if (!preflight.ready) {
        document.getElementById("quote-integrations-exports")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
        return
      }

      const csv =
        destination === "quickbooks"
          ? await exportQuickBooksQuoteCsv(
              quoteId,
              { destination: "quickbooks", format: "csv", mapping },
              { responseType: "text" },
            )
          : destination === "housecall_pro"
            ? await exportHousecallProQuoteCsv(
                quoteId,
                { destination: "housecall_pro", format: "csv", mapping },
                { responseType: "text" },
              )
            : await exportJobberQuoteCsv(
                quoteId,
                { destination: "jobber", format: "csv", mapping },
                { responseType: "text" },
              )
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url
      link.download = preflight.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast({
        title: `${destinationLabel(destination)} CSV downloaded`,
        description: `The export preserves the saved quote total of $${preflight.quoteTotal?.toFixed(2) ?? "0.00"}.`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not export quote",
        description: error instanceof Error ? error.message : "Please review the export details and try again.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card id="quote-integrations-exports" className="scroll-mt-6 border-primary/30">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <PlugZap className="text-primary" size={20} />
              <CardTitle>Integrations &amp; Exports</CardTitle>
            </div>
            <CardDescription className="mt-2 max-w-3xl">
              Prepare a provider-friendly file from this saved quote. This is a download for import—not a direct sync, connection, or send action.
            </CardDescription>
          </div>
          <Button data-testid="button-download-quote-csv" onClick={handleExport} disabled={busy}>
            <Download size={16} className="mr-2" />
            {busy ? "Checking export..." : "Export Quote"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Destination</Label>
            <Select
              value={destination}
              onValueChange={(value) => {
                setDestination(value as QuoteExportRequestDestination)
                setIssues([])
              }}
            >
              <SelectTrigger data-testid="select-export-destination"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="jobber">Jobber quote import</SelectItem>
                <SelectItem value="quickbooks">QuickBooks Online invoice import</SelectItem>
                <SelectItem value="housecall_pro">Housecall Pro jobs import</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose the documented import layout used by your contractor platform.
            </p>
          </div>
          <ExportSelect label="Format" value="csv" option="CSV import file" testId="select-export-format" />
        </div>

        <Alert className={isDirty ? "border-amber-300 bg-amber-50 text-amber-950" : undefined}>
          <FileText size={16} />
          <AlertTitle>{isDirty ? "Save quote changes before export" : "Saved snapshot export"}</AlertTitle>
          <AlertDescription>
            {isDirty
              ? "Your unsaved quote-detail edits will not be exported. Save Changes, then export again."
              : "The CSV uses this saved assembly and exact final selling price. It does not rerun estimating or read live catalog pricing."}
          </AlertDescription>
        </Alert>

        {destination === "quickbooks" ? (
          <MappingSection
            title="QuickBooks invoice mapping"
            description="The customer must already exist in QuickBooks Online. Dates are required by its invoice importer."
            fields={[
              ["QuickBooks customer name", "quickBooksCustomer", "text"],
              ["Invoice date (YYYY-MM-DD)", "quickBooksInvoiceDate", "date"],
              ["Due date (YYYY-MM-DD)", "quickBooksDueDate", "date"],
            ]}
            mapping={mapping}
            onChange={updateMapping}
          />
        ) : (
          <>
            <MappingSection
              title={destination === "jobber" ? "Jobber client mapping" : "Housecall Pro customer mapping"}
              description={destination === "jobber"
                ? "Optional Jobber IDs take priority. Otherwise Jobber can match or create a client from the contact values below."
                : "An optional Housecall Pro Customer ID takes priority. Otherwise provide a name, company, or email."}
              fields={[
                ...(destination === "jobber"
                  ? [["Jobber Client ID", "jobberClientId", "text"] as FieldDefinition]
                  : [
                      ["Housecall Pro Customer ID", "housecallCustomerId", "text"] as FieldDefinition,
                      ["Housecall Pro Job ID", "housecallJobId", "text"] as FieldDefinition,
                    ]),
                ["Client first name", "clientFirstName", "text"],
                ["Client last name", "clientLastName", "text"],
                ["Client company name", "clientCompanyName", "text"],
                ["Client email", "clientEmail", "email"],
                [destination === "jobber" ? "Client main phone" : "Mobile number", destination === "jobber" ? "clientMainPhone" : "clientMobilePhone", "tel"],
              ]}
              mapping={mapping}
              onChange={updateMapping}
            />
            <MappingSection
              title={destination === "jobber" ? "Jobber property mapping" : "Housecall Pro service address"}
              description={destination === "jobber"
                ? "Provide an existing Jobber Property ID or at least Property Street 1 so Jobber can link or create the property."
                : "Address fields are optional and are combined into Housecall Pro's documented Service address field."}
              fields={[
                ...(destination === "jobber"
                  ? [["Jobber Property ID", "jobberPropertyId", "text"] as FieldDefinition]
                  : []),
                ["Property street 1", "propertyStreet1", "text"],
                ["Property street 2", "propertyStreet2", "text"],
                ["Property city", "propertyCity", "text"],
                ["State / province", "propertyStateProvince", "text"],
                ["ZIP / postal code", "propertyZipPostalCode", "text"],
                ["Property country", "propertyCountry", "text"],
              ]}
              mapping={mapping}
              onChange={updateMapping}
            />
          </>
        )}

        {issues.length > 0 && (
          <Alert variant="destructive" data-testid="alert-export-issues">
            <TriangleAlert size={16} />
            <AlertTitle>Resolve these items before download</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {issues.map((issue) => <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          {destination === "jobber"
            ? "Assembly rows keep saved quantities, units, sources, and costs with blank selling prices. A separate line carries the exact saved final selling price."
            : "This format uses one row carrying the exact saved final selling price; it does not distribute that amount across assembly rows."}{" "}
          Tax, discount, deposit, and taxable fields stay blank because they are not captured in the quote snapshot.
        </div>
      </CardContent>
    </Card>
  )
}

function ExportSelect({ label, value, option, testId }: { label: string; value: string; option: string; testId: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value}>
        <SelectTrigger data-testid={testId}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={value}>{option}</SelectItem></SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Uses the destination's documented import headers and accepted values.
      </p>
    </div>
  )
}

type FieldDefinition = [string, keyof QuoteExportMapping, "text" | "email" | "tel" | "date"]

function destinationLabel(destination: QuoteExportRequestDestination) {
  if (destination === "quickbooks") return "QuickBooks Online"
  if (destination === "housecall_pro") return "Housecall Pro"
  return "Jobber"
}

function MappingSection({
  title,
  description,
  fields,
  mapping,
  onChange,
}: {
  title: string
  description: string
  fields: FieldDefinition[]
  mapping: QuoteExportMapping
  onChange: (field: keyof QuoteExportMapping, value: string) => void
}) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([label, field, type]) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={`export-${field}`}>{label}</Label>
            <Input
              id={`export-${field}`}
              data-testid={`input-export-${field}`}
              type={type}
              value={mapping[field] ?? ""}
              onChange={(event) => onChange(field, event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}