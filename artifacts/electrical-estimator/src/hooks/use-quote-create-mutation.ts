import { useCreateQuote } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"

/** Standard visible feedback for every quote builder while preserving its local form on errors. */
export function useQuoteCreateMutation() {
  const { toast } = useToast()
  return useCreateQuote({
    mutation: {
      onSuccess: () => toast({ title: "Quote created", description: "The quote was saved successfully." }),
      onError: (error) => toast({
        variant: "destructive",
        title: "Could not create quote",
        description: error instanceof Error ? error.message : "The quote was not saved. Your form entries are still available.",
      }),
    },
  })
}