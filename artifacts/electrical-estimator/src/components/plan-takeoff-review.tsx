import {
  type Takeoff,
  type TakeoffBuilderModule,
  type TakeoffItemStatus,
  getGetTakeoffQueryKey,
  useCreateTakeoff,
  useGetTakeoff,
  useRequestTakeoffUploadUrl,
  useReviewTakeoffItem,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Check, FileSearch, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

type PlanTakeoffReviewProps = {
  module: TakeoffBuilderModule
  baseInputs: Record<string, unknown>
  savedTakeoffId?: number
  onTakeoffApplied: (
    inputs: Record<string, unknown>,
    takeoffId: number | undefined,
  ) => void
  onCorrectionConfirmed?: (takeoff: Takeoff) => void
  onClose?: () => void
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data
    if (data && typeof data === "object" && "error" in data) {
      return String((data as { error: unknown }).error)
    }
  }
  return error instanceof Error ? error.message : "Please try again."
}

function isStaleReviewError(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false
  const data = (error as { data?: unknown }).data
  return Boolean(
    data &&
      typeof data === "object" &&
      "code" in data &&
      (data as { code?: unknown }).code === "TAKEOFF_REVIEW_STALE",
  )
}

function confidenceVariant(confidence: string) {
  return confidence === "high" ? "default" : confidence === "medium" ? "secondary" : "outline"
}

export function PlanTakeoffReview({
  module,
  baseInputs,
  savedTakeoffId,
  onTakeoffApplied,
  onCorrectionConfirmed,
  onClose,
}: PlanTakeoffReviewProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const isSavedReview = savedTakeoffId !== undefined
  const savedTakeoffQuery = useGetTakeoff(savedTakeoffId ?? 0, {
    query: {
      enabled: isSavedReview,
      queryKey: getGetTakeoffQueryKey(savedTakeoffId ?? 0),
    },
  })
  const [takeoff, setTakeoff] = useState<Takeoff | null>(null)
  const [failure, setFailure] = useState("")
  const [draftQuantities, setDraftQuantities] = useState<Record<number, string>>({})
  const [draftNotes, setDraftNotes] = useState<Record<number, string>>({})
  const [draftStatuses, setDraftStatuses] = useState<Record<number, TakeoffItemStatus>>({})
  const [reviewBaseline, setReviewBaseline] = useState<
    Record<number, { status: TakeoffItemStatus; approvedQuantity: number | null; reviewerNote: string | null }>
  >({})
  const [isConfirming, setIsConfirming] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [isReviewStale, setIsReviewStale] = useState(false)
  const [uploadedBaseInputs, setUploadedBaseInputs] = useState<Record<string, unknown> | null>(null)
  const requestUpload = useRequestTakeoffUploadUrl()
  const createTakeoff = useCreateTakeoff()
  const reviewItem = useReviewTakeoffItem()

  const resetReviewState = (savedTakeoff: Takeoff) => {
    setFailure("")
    setTakeoff(savedTakeoff)
    setUploadedBaseInputs(baseInputs)
    setDraftQuantities(
      Object.fromEntries(savedTakeoff.items.map((item) => [
        item.id,
        String(item.approvedQuantity ?? item.proposedQuantity),
      ])),
    )
    setDraftNotes(
      Object.fromEntries(savedTakeoff.items.map((item) => [item.id, item.reviewerNote ?? ""])),
    )
    setDraftStatuses(
      Object.fromEntries(savedTakeoff.items.map((item) => [item.id, item.status])),
    )
    setReviewBaseline(
      Object.fromEntries(savedTakeoff.items.map((item) => [
        item.id,
        {
          status: item.status,
          approvedQuantity: item.approvedQuantity,
          reviewerNote: item.reviewerNote,
        },
      ])),
    )
  }

  useEffect(() => {
    const savedTakeoff = savedTakeoffQuery.data
    if (!isSavedReview || !savedTakeoff) return
    resetReviewState(savedTakeoff)
    setIsReviewStale(false)
  }, [baseInputs, isSavedReview, savedTakeoffQuery.data])

  const isBusy =
    requestUpload.isPending ||
    createTakeoff.isPending ||
    savedTakeoffQuery.isLoading ||
    isConfirming ||
    isReloading

  const reloadSavedReview = async () => {
    if (!isSavedReview) return
    setIsReloading(true)
    try {
      const result = await savedTakeoffQuery.refetch()
      if (!result.data) throw new Error("The saved takeoff could not be reloaded.")
      resetReviewState(result.data)
      setIsReviewStale(false)
      toast({
        title: "Saved review reloaded",
        description: "The current takeoff decisions are ready for your review again.",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not reload saved review",
        description: errorMessage(error),
      })
    } finally {
      setIsReloading(false)
    }
  }

  const syncBuilder = (
    updated: Takeoff,
    baseline: Record<string, unknown>,
    reviewedFieldKey: string,
  ) => {
    const approvedCount = Object.keys(updated.approvedInputs).length
    const nextItem = updated.items.find((item) => item.fieldKey === reviewedFieldKey)
    onTakeoffApplied(
      {
        [reviewedFieldKey]:
          nextItem?.status === "accepted"
            ? nextItem.approvedQuantity
            : baseline[reviewedFieldKey],
      },
      approvedCount > 0 ? updated.id : undefined,
    )
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setFailure("")
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setFailure("Choose an electrical plan PDF. Other file types are not supported.")
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setFailure("This plan set is larger than 25 MB. Export a smaller PDF or split the plans.")
      return
    }
    const baseline = structuredClone(baseInputs)
    setUploadedBaseInputs(baseline)
    setTakeoff(null)
    onTakeoffApplied({}, undefined)
    try {
      const upload = await requestUpload.mutateAsync({
        data: {
          fileName: file.name,
          fileSize: file.size,
          contentType: "application/pdf",
        },
      })
      const uploadResponse = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      })
      if (!uploadResponse.ok) {
        throw new Error("The PDF upload did not finish. Check your connection and try again.")
      }
      const result = await createTakeoff.mutateAsync({
        data: {
          module,
          fileName: file.name,
          fileSize: file.size,
          contentType: "application/pdf",
          objectPath: upload.objectPath,
          baseInputs: baseline,
        },
      })
      setTakeoff(result)
      setDraftQuantities(
        Object.fromEntries(result.items.map((item) => [
          item.id,
          String(item.approvedQuantity ?? item.proposedQuantity),
        ])),
      )
      setDraftNotes(
        Object.fromEntries(result.items.map((item) => [item.id, item.reviewerNote ?? ""])),
      )
      toast({
        title: "Plan takeoff ready for review",
        description: `${result.items.length} proposed quantities were found. Nothing has changed pricing yet.`,
      })
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const updateItem = async (itemId: number, status: TakeoffItemStatus) => {
    if (!takeoff || !uploadedBaseInputs) return
    const item = takeoff.items.find((candidate) => candidate.id === itemId)
    if (!item) return
    const rawQuantity = draftQuantities[itemId] ?? ""
    const quantity = Number(rawQuantity)
    if (status === "accepted" && (!Number.isInteger(quantity) || quantity < 0)) {
      toast({
        variant: "destructive",
        title: "Enter a whole-number quantity",
        description: "Accepted takeoff quantities must be zero or greater.",
      })
      return
    }
    if (isSavedReview) {
      setDraftStatuses((current) => ({ ...current, [itemId]: status }))
      if (status === "accepted") {
        setDraftQuantities((current) => ({ ...current, [itemId]: rawQuantity }))
      }
      return
    }
    try {
      const updated = await reviewItem.mutateAsync({
        id: takeoff.id,
        itemId,
        data: {
          status,
          approvedQuantity: status === "accepted" ? quantity : null,
          reviewerNote: draftNotes[itemId]?.trim() || null,
          expectedStatus: item.status,
          expectedApprovedQuantity: item.approvedQuantity,
          expectedReviewerNote: item.reviewerNote,
        },
      })
      setTakeoff(updated)
      const reviewed = updated.items.find((item) => item.id === itemId)
      if (reviewed) syncBuilder(updated, uploadedBaseInputs, reviewed.fieldKey)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save takeoff decision",
        description: errorMessage(error),
      })
    }
  }

  const stagedChanges = takeoff?.items.filter((item) => {
    const baseline = reviewBaseline[item.id]
    const nextStatus = draftStatuses[item.id] ?? item.status
    const nextQuantity =
      nextStatus === "accepted"
        ? Number(draftQuantities[item.id] ?? item.approvedQuantity ?? item.proposedQuantity)
        : null
    const nextNote = draftNotes[item.id]?.trim() || null
    return (
      isSavedReview &&
      baseline &&
      (baseline.status !== nextStatus ||
        baseline.approvedQuantity !== nextQuantity ||
        baseline.reviewerNote !== nextNote)
    )
  }) ?? []

  const confirmCorrection = async () => {
    if (!takeoff || stagedChanges.length === 0) return
    for (const item of stagedChanges) {
      const nextStatus = draftStatuses[item.id] ?? item.status
      const quantity =
        nextStatus === "accepted"
          ? Number(draftQuantities[item.id] ?? item.approvedQuantity ?? item.proposedQuantity)
          : null
      if (
        nextStatus === "accepted" &&
        (quantity === null || !Number.isInteger(quantity) || quantity < 0)
      ) {
        toast({
          variant: "destructive",
          title: "Enter a whole-number quantity",
          description: "Accepted takeoff quantities must be zero or greater.",
        })
        return
      }
    }

    setIsConfirming(true)
    let updated = takeoff
    const nextBaseline = { ...reviewBaseline }
    try {
      for (const item of stagedChanges) {
        const nextStatus = draftStatuses[item.id] ?? item.status
        const nextQuantity =
          nextStatus === "accepted"
            ? Number(draftQuantities[item.id] ?? item.approvedQuantity ?? item.proposedQuantity)
            : null
        updated = await reviewItem.mutateAsync({
          id: updated.id,
          itemId: item.id,
          data: {
            status: nextStatus,
            approvedQuantity: nextQuantity,
            reviewerNote: draftNotes[item.id]?.trim() || null,
            expectedStatus: reviewBaseline[item.id].status,
            expectedApprovedQuantity: reviewBaseline[item.id].approvedQuantity,
            expectedReviewerNote: reviewBaseline[item.id].reviewerNote,
          },
        })
        const updatedItem = updated.items.find((candidate) => candidate.id === item.id)
        if (updatedItem) {
          nextBaseline[item.id] = {
            status: updatedItem.status,
            approvedQuantity: updatedItem.approvedQuantity,
            reviewerNote: updatedItem.reviewerNote,
          }
        }
        setTakeoff(updated)
      }
      setReviewBaseline(nextBaseline)
      queryClient.setQueryData(getGetTakeoffQueryKey(updated.id), updated)
      onCorrectionConfirmed?.(updated)
      toast({
        title: "Correction recorded",
        description: "The original quote snapshot is unchanged. This correction is now in the takeoff audit history.",
      })
    } catch (error) {
      const stale = isStaleReviewError(error)
      if (stale) {
        setIsReviewStale(true)
      } else {
        setReviewBaseline(nextBaseline)
        setTakeoff(updated)
        queryClient.setQueryData(getGetTakeoffQueryKey(updated.id), updated)
      }
      toast({
        variant: "destructive",
        title: stale ? "Saved review is stale" : "Correction only partially saved",
        description: stale
          ? "Your staged edits are still here. Reload the saved review to compare them with the latest decision."
          : errorMessage(error),
      })
    } finally {
      setIsConfirming(false)
    }
  }

  const acceptedCount = takeoff?.items.filter((item) => item.status === "accepted").length ?? 0
  const pendingCount = takeoff?.items.filter((item) => item.status === "pending").length ?? 0
  const unresolvedCount = takeoff?.items.filter((item) => item.status === "unresolved").length ?? 0

  return (
    <Card className="border-dashed border-primary/40 bg-primary/[0.03]" data-testid={`takeoff-${module.toLowerCase()}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="text-primary" size={20} />
              {isSavedReview ? "Propose Blueprint Correction" : "Blueprint Takeoff"}
            </CardTitle>
            <CardDescription className="mt-1">
              {isSavedReview
                ? "Review the saved approval again. Changes stay staged here until you confirm them, and the original quote snapshot remains unchanged."
                : "Upload a searchable or scanned electrical plan PDF. Scans are OCR&apos;d automatically, and every suggestion must be reviewed before it can enter this quote."}
            </CardDescription>
          </div>
          {takeoff && (
            <Badge variant="outline">
              {acceptedCount} approved · {pendingCount + unresolvedCount} need review
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isSavedReview && (
          <div className="rounded-md border bg-background/40 p-4">
            <Label htmlFor={`takeoff-file-${module}`}>Electrical plan PDF</Label>
            <Input
              ref={inputRef}
              id={`takeoff-file-${module}`}
              className="mt-2"
              type="file"
              accept=".pdf,application/pdf"
              disabled={isBusy}
              onChange={(event) => void handleFile(event.target.files?.[0])}
              data-testid={`input-takeoff-${module.toLowerCase()}`}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              PDF only, up to 25 MB. Automatic OCR is bounded to 12 scanned pages and 8 MB of rendered page images. Split larger sets by electrical sheets.
            </p>
            {isBusy && (
              <div className="mt-3 flex items-center gap-2 text-sm text-primary">
                <Loader2 className="animate-spin" size={16} />
                {requestUpload.isPending ? "Uploading plan..." : "Reading legends, schedules, and drawing notes..."}
              </div>
            )}
            {failure && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                <TriangleAlert className="mt-0.5 shrink-0" size={16} />
                <span>{failure}</span>
              </div>
            )}
          </div>
        )}
        {isSavedReview && savedTakeoffQuery.isLoading && (
          <div className="flex items-center gap-2 rounded-md border bg-background/40 p-4 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> Loading the saved blueprint review...
          </div>
        )}
        {isSavedReview && savedTakeoffQuery.isError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <TriangleAlert className="mt-0.5 shrink-0" size={16} />
            <span>{errorMessage(savedTakeoffQuery.error)}</span>
          </div>
        )}
        {isSavedReview && isReviewStale && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            role="alert"
            data-testid="alert-takeoff-review-stale"
          >
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" size={16} />
              <span>
                Another contractor saved a decision after you opened this review. Reload the saved review before confirming so neither correction is overwritten.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void reloadSavedReview()}
              disabled={isBusy}
              data-testid="button-reload-takeoff-review"
            >
              {isReloading ? <Loader2 className="animate-spin" size={15} /> : <RotateCcw size={15} />}
              {isReloading ? "Reloading..." : "Reload saved review"}
            </Button>
          </div>
        )}

        {takeoff && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <span className="font-semibold">{takeoff.fileName}</span>
                <span className="ml-2 text-muted-foreground">
                  {takeoff.pageCount ?? "Unknown"} pages · {takeoff.items.length} suggestions
                </span>
              </div>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-300">
                Unapproved items keep the builder’s prior value.
              </p>
            </div>

            {takeoff.items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border bg-background/70 p-4"
                data-testid={`takeoff-item-${item.fieldKey}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isSavedReview && (
                        <Badge variant="outline">
                          {stagedChanges.some((candidate) => candidate.id === item.id)
                            ? "staged correction"
                            : "saved decision"}
                        </Badge>
                      )}
                      <h4 className="font-semibold">{item.label}</h4>
                      <Badge variant={confidenceVariant(item.confidence)}>
                        {item.confidence} confidence
                      </Badge>
                      <Badge variant="outline">
                        {isSavedReview ? (draftStatuses[item.id] ?? item.status) : item.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.sourcePage ? `Page ${item.sourcePage}: ` : "Source: "}
                      “{item.sourceContext}”
                    </p>
                  </div>
                  <div className="w-28">
                    <Label className="text-xs" htmlFor={`takeoff-qty-${item.id}`}>Quantity</Label>
                    <Input
                      id={`takeoff-qty-${item.id}`}
                      data-testid={`takeoff-quantity-${item.fieldKey}`}
                      type="number"
                      min="0"
                      step="1"
                      value={draftQuantities[item.id] ?? ""}
                      onChange={(event) => setDraftQuantities((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))}
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                  <Textarea
                    data-testid={`takeoff-note-${item.fieldKey}`}
                    className="min-h-9"
                    value={draftNotes[item.id] ?? ""}
                    onChange={(event) => setDraftNotes((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))}
                    placeholder="Optional review note"
                    maxLength={1000}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void updateItem(item.id, "accepted")}
                      disabled={isBusy}
                    >
                      <Check size={15} /> {isSavedReview ? "Stage accept" : "Accept"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void updateItem(item.id, "unresolved")}
                      disabled={isBusy}
                    >
                      <RotateCcw size={15} /> {isSavedReview ? "Stage unresolved" : "Unresolved"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => void updateItem(item.id, "rejected")}
                      disabled={isBusy}
                    >
                      <X size={15} /> {isSavedReview ? "Stage reject" : "Reject"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-sm">
              {isSavedReview
                ? "These changes are staged locally. Confirm them below to append the new decisions to the takeoff audit; the quote’s original saved snapshot will not be rewritten."
                : acceptedCount > 0
                ? `${acceptedCount} approved ${acceptedCount === 1 ? "quantity is" : "quantities are"} now applied to the builder and will be recorded with this quote.`
                : "No takeoff quantities are approved. The quote still uses the builder values from before this upload."}
            </div>
            {isSavedReview && (
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                {onClose && (
                  <Button type="button" variant="outline" onClick={onClose} disabled={isConfirming}>
                    Close without saving
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => void confirmCorrection()}
                  disabled={isBusy || isReviewStale || stagedChanges.length === 0}
                  data-testid="button-confirm-takeoff-correction"
                >
                  {isConfirming ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                  {isConfirming ? "Recording..." : "Confirm and record correction"}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}