import { useCreateQuote } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { useUser } from "@clerk/react"
import { clearQuoteBuilderDraft, e2eDraftScope } from "@/lib/quote-builder-draft-storage"

/** Standard visible feedback for every quote builder while preserving its local form on errors. */
export function useQuoteCreateMutation() {
  const { toast } = useToast()
  const clerkUser = import.meta.env.VITE_E2E_AUTH === "true" ? null : useUser()
  const scope = clerkUser?.user?.id ?? e2eDraftScope()
  return useCreateQuote({
    mutation: {
      onSuccess: (_quote, variables) => {
        clearQuoteBuilderDraft(variables.data.module, scope)
        toast({ title: "Quote created", description: "The quote was saved successfully." })
      },
      onError: (error) => toast({
        variant: "destructive",
        title: "Could not create quote",
        description: error instanceof Error ? error.message : "The quote was not saved. Your form entries are still available.",
      }),
    },
  })
}