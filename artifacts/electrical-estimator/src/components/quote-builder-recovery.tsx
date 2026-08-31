import { Button } from "@/components/ui/button"
import { RotateCcw, Trash2 } from "lucide-react"

type SettingsState = {
  isLoading: boolean
  isError: boolean
  refetch: () => unknown
}

type RevisionState = {
  isRevision: boolean
  isLoading: boolean
  isError: boolean
  isInvalid: boolean
  errorMessage?: string
  retry: () => unknown
  startFresh: () => void
}

type DraftRecoveryState = {
  isAvailable: boolean
  savedAt?: string
  onRestore: () => void
  onDiscard: () => void
}

export function QuoteBuilderRecovery({
  settings,
  revision,
  draft,
}: {
  settings: SettingsState
  revision: RevisionState
  draft?: DraftRecoveryState
}) {
  return (
    <div className="space-y-3">
      {draft?.isAvailable && (
        <div
          role="status"
          data-testid="alert-quote-draft-available"
          className="space-y-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm"
        >
          <div>
            <p className="font-semibold">Unfinished quote found</p>
            <p className="mt-1 text-secondary-foreground/80">
              Restore the quote you were building before the connection dropped, or discard it and start fresh.
              {draft.savedAt && (
                <span className="block text-xs text-secondary-foreground/60">
                  Saved {new Date(draft.savedAt).toLocaleString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" data-testid="button-restore-quote-draft" onClick={draft.onRestore}>
              <RotateCcw size={14} className="mr-1.5" />
              Restore unfinished quote
            </Button>
            <Button type="button" variant="outline" size="sm" data-testid="button-discard-quote-draft" onClick={draft.onDiscard}>
              <Trash2 size={14} className="mr-1.5" />
              Discard draft
            </Button>
          </div>
        </div>
      )}
      {settings.isLoading && (
        <p role="status" data-testid="status-loading-settings" className="text-sm text-muted-foreground">
          Loading company settings…
        </p>
      )}
      {settings.isError && (
        <div role="alert" data-testid="alert-settings-error" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <span>Company settings could not be loaded. Retry to continue calculating quotes.</span>
          <Button type="button" variant="outline" size="sm" data-testid="button-retry-settings" onClick={() => { void settings.refetch() }}>
            Retry settings
          </Button>
        </div>
      )}
      {revision.isRevision && revision.isLoading && (
        <p role="status" data-testid="status-loading-revision" className="text-sm text-muted-foreground">
          Loading the saved quote for revision…
        </p>
      )}
      {revision.isRevision && revision.isError && (
        <div role="alert" data-testid="alert-revision-error" className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p>{revision.errorMessage ?? "The saved quote could not be loaded for revision."}</p>
          <div className="flex flex-wrap gap-2">
            {!revision.isInvalid && (
              <Button type="button" variant="outline" size="sm" data-testid="button-retry-revision" onClick={() => { void revision.retry() }}>
                Retry saved quote
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" data-testid="button-start-fresh-quote" onClick={revision.startFresh}>
              Start a new quote
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function QuotePreviewRecovery({
  isError,
  onRetry,
}: {
  isError: boolean
  onRetry?: () => void
}) {
  if (!isError) return null
  return (
    <div role="alert" data-testid="alert-preview-error" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <span>The estimate preview could not be calculated. The quote cannot be created until a current preview succeeds.</span>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" data-testid="button-retry-preview" onClick={onRetry}>
          Retry calculation
        </Button>
      )}
    </div>
  )
}