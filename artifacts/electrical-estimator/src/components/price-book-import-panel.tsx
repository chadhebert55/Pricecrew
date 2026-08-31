import {
  getListPriceBookImportsQueryKey,
  getListPriceBookItemsQueryKey,
  type PriceBookImport,
  useApplyPriceBookImport,
  usePreviewPriceBookImport,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Check, FileSpreadsheet, Upload } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please review the file and try again."
}

function money(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 3,
        maximumFractionDigits: 6,
      }).format(value)
}

const actionLabels = {
  insert: "Insert",
  update: "Update",
  skip: "Skipped",
  unresolved: "Unresolved",
} as const

type PriceBookImportPanelProps = {
  review: PriceBookImport | null
  onReviewChange: (review: PriceBookImport | null) => void
}

export function PriceBookImportPanel({
  review,
  onReviewChange,
}: PriceBookImportPanelProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [sourceDate, setSourceDate] = useState("")
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  useEffect(() => {
    setSelectedRows(
      new Set(
        review?.status === "review"
          ? review.rows
              .filter((row) => row.status === "proposed")
              .map((row) => row.rowNumber)
          : [],
      ),
    )
  }, [review?.id, review?.status])

  const previewImport = usePreviewPriceBookImport({
    mutation: {
      onSuccess: (result) => {
        onReviewChange(result)
        setSelectedRows(
          new Set(
            result.rows
              .filter((row) => row.status === "proposed")
              .map((row) => row.rowNumber),
          ),
        )
        void queryClient.invalidateQueries({
          queryKey: getListPriceBookImportsQueryKey(),
        })
        toast({
          title: "Import ready for review",
          description: "No price-book values have been changed yet.",
        })
      },
      onError: (error) =>
        toast({
          variant: "destructive",
          title: "Could not review this export",
          description: errorMessage(error),
        }),
    },
  })
  const applyImport = useApplyPriceBookImport({
    mutation: {
      onSuccess: (result) => {
        onReviewChange(result)
        setSelectedRows(new Set())
        void queryClient.invalidateQueries({
          queryKey: getListPriceBookItemsQueryKey(),
        })
        void queryClient.invalidateQueries({
          queryKey: getListPriceBookImportsQueryKey(),
        })
        toast({
          title: "Price book updated",
          description: "Only the selected exact-match changes were applied.",
        })
      },
      onError: (error) =>
        toast({
          variant: "destructive",
          title: "Could not apply this import",
          description: errorMessage(error),
        }),
    },
  })

  const preview = async () => {
    if (!file) return
    if (file.size > 5_000_000) {
      toast({
        variant: "destructive",
        title: "CSV is too large",
        description: "Use a Northeast customer-price CSV smaller than 5 MB.",
      })
      return
    }
    const csv = await file.text()
    previewImport.mutate({
      data: {
        fileName: file.name,
        csv,
        sourceDate: sourceDate || null,
      },
    })
  }

  const toggleRow = (rowNumber: number) => {
    setSelectedRows((current) => {
      const next = new Set(current)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  return (
    <Card data-testid="price-book-import-panel">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Northeast price update
            </CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Upload a customer-price CSV for a review-only comparison. Matches use exact
              supplier SKU, UPC, or manufacturer part number; no live supplier access or
              fuzzy matching is used.
            </CardDescription>
          </div>
          {review?.status === "applied" && (
            <Badge variant="success">
              <Check className="mr-1 h-3 w-3" />
              Applied
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="northeast-price-file">Northeast customer-price CSV</Label>
            <Input
              id="northeast-price-file"
              data-testid="northeast-price-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                onReviewChange(null)
                setSelectedRows(new Set())
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="northeast-source-date">Price date (optional)</Label>
            <Input
              id="northeast-source-date"
              data-testid="northeast-source-date"
              type="date"
              value={sourceDate}
              onChange={(event) => setSourceDate(event.target.value)}
            />
          </div>
          <Button
            type="button"
            data-testid="preview-price-book-import"
            onClick={() => void preview()}
            disabled={!file || previewImport.isPending}
          >
            <Upload className="mr-2 h-4 w-4" />
            {previewImport.isPending ? "Reviewing…" : "Review changes"}
          </Button>
        </div>

        {review && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                [
                  review.status === "review" ? "Proposed inserts" : "Inserted",
                  review.report.inserted,
                ],
                [
                  review.status === "review" ? "Proposed updates" : "Updated",
                  review.report.updated,
                ],
                ["Skipped", review.report.skipped],
                ["Unresolved", review.report.unresolved],
              ] as const).map(([label, count]) => (
                <div key={label} className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold">{count}</div>
                </div>
              ))}
            </div>

            {review.report.unresolved > 0 && (
              <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Unresolved rows remain unchanged. Their reasons are shown below so the
                  source export can be corrected without guessing.
                </p>
              </div>
            )}

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Use</TableHead>
                    <TableHead>Row</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Item / exact identity</TableHead>
                    <TableHead className="text-right">Before</TableHead>
                    <TableHead className="text-right">After</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {review.rows.map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={row.action === "unresolved" ? "bg-amber-50/60" : undefined}
                    >
                      <TableCell>
                        {row.status === "proposed" ? (
                          <input
                            type="checkbox"
                            aria-label={`Select CSV row ${row.rowNumber}`}
                            checked={selectedRows.has(row.rowNumber)}
                            onChange={() => toggleRow(row.rowNumber)}
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.action === "unresolved"
                              ? "warning"
                              : row.action === "skip"
                                ? "outline"
                                : row.status === "applied"
                                  ? "success"
                                  : "secondary"
                          }
                        >
                          {row.status === "applied" ? "Applied" : actionLabels[row.action]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.incoming.item || "Missing description"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {[
                            row.incoming.supplierSku
                              ? `SKU ${row.incoming.supplierSku}`
                              : null,
                            row.incoming.upc ? `UPC ${row.incoming.upc}` : null,
                            row.incoming.manufacturerPartNumber
                              ? `MPN ${row.incoming.manufacturerPartNumber}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No exact identifier"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {money(row.before?.unitCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {money(row.incoming.unitCost)}
                      </TableCell>
                      <TableCell className="max-w-md text-xs text-muted-foreground">
                        {row.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {review.status === "review" && (
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {selectedRows.size} exact-match change{selectedRows.size === 1 ? "" : "s"} selected.
                  Historical quotes are not recalculated.
                </p>
                <Button
                  type="button"
                  data-testid="apply-price-book-import"
                  disabled={selectedRows.size === 0 || applyImport.isPending}
                  onClick={() =>
                    applyImport.mutate({
                      id: review.id,
                      data: { selectedRows: Array.from(selectedRows) },
                    })
                  }
                >
                  {applyImport.isPending ? "Applying…" : "Apply selected changes"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}