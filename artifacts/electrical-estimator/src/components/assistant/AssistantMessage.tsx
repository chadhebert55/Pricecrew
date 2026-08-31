import { Bot, User, Check, X, Loader2, FileBox } from "lucide-react";
import { 
  type AssistantMessage as AssistantMessageType,
  type AssistantPendingAction,
  useConfirmAssistantAction,
  useRejectAssistantAction,
  getListAssistantMessagesQueryKey
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface AssistantMessageProps {
  message: AssistantMessageType;
  conversationId: number;
}

// Linkify text helper
function Linkify({ text, isUser }: { text: string, isUser?: boolean }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a 
              key={i} 
              href={part} 
              target="_blank" 
              rel="noopener noreferrer"
              className={cn(
                "underline underline-offset-2 font-medium",
                isUser 
                  ? "text-primary-foreground/90 hover:text-primary-foreground" 
                  : "text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
              )}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function AssistantMessage({ message, conversationId }: AssistantMessageProps) {
  const isUser = message.role === "user";
  
  if (message.role === "tool") {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full flex items-center gap-2">
          <FileBox size={14} />
          <Linkify text={message.content} />
        </div>
      </div>
    );
  }

  const messagePendingActions = (message.metadata?.pendingActions as AssistantPendingAction[]) || [];

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 flex items-center justify-center shrink-0 mt-1">
          <Bot size={16} />
        </div>
      )}
      
      <div className={cn(
        "flex flex-col gap-2 max-w-[85%]",
        isUser ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "px-4 py-3 text-sm rounded-2xl whitespace-pre-wrap break-words",
          isUser 
            ? "bg-primary text-primary-foreground rounded-tr-sm" 
            : "bg-muted text-foreground rounded-tl-sm shadow-sm"
        )}>
          <Linkify text={message.content} isUser={isUser} />
        </div>
        
        {messagePendingActions.length > 0 && (
          <div className="flex flex-col gap-2 w-full mt-1">
            {messagePendingActions.map(action => (
              <PendingActionCard 
                key={action.id} 
                action={action} 
                conversationId={conversationId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingActionCard({ 
  action, 
  conversationId
}: { 
  action: AssistantPendingAction,
  conversationId: number
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const confirm = useConfirmAssistantAction({
    mutation: {
      onSuccess: () => {
        toast({ title: "Action confirmed" });
        queryClient.invalidateQueries({ queryKey: getListAssistantMessagesQueryKey(conversationId) });
        if (action.kind === "quote_create") {
          queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        } else if (action.kind === "price_book_import") {
          queryClient.invalidateQueries({ queryKey: ["/api/price-book"] });
        }
      },
      onError: (err) => {
        toast({ 
          title: "Confirmation failed", 
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive"
        });
      }
    }
  });

  const reject = useRejectAssistantAction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAssistantMessagesQueryKey(conversationId) });
      }
    }
  });

  const isPending = confirm.isPending || reject.isPending;

  if (action.status !== "pending") {
    return (
      <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm flex items-center justify-between">
        <span className="text-muted-foreground font-medium capitalize">
          {action.kind.replace("_", " ")}
        </span>
        <span className={cn(
          "text-xs px-2 py-1 rounded-full font-medium",
          action.status === "confirmed" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" :
          action.status === "rejected" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
          "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
        )}>
          {action.status}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border shadow-sm rounded-lg p-3 space-y-3 w-full min-w-[240px]">
      <div className="font-semibold text-sm capitalize flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-teal-500"></div>
        Pending {action.kind.replace("_", " ")}
      </div>
      
      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded max-h-32 overflow-y-auto font-mono">
        <pre>{JSON.stringify(action.summary, null, 2)}</pre>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button 
          size="sm" 
          variant="outline" 
          className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => reject.mutate({ id: action.id })}
          disabled={isPending}
        >
          {reject.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <X className="w-4 h-4 mr-1" />}
          Reject
        </Button>
        <Button 
          size="sm" 
          className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
          onClick={() => confirm.mutate({ id: action.id, data: {} })}
          disabled={isPending}
        >
          {confirm.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
          Confirm
        </Button>
      </div>
    </div>
  );
}
