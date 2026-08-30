import { Button } from "@/components/ui/button"

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

export function QuoteBuilderRecovery({
  settings,
  revision,
}: {
  settings: SettingsState
  revision: RevisionState
}) {
  return (
    <div className="space-y-3">
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