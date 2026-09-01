import { useState, useRef, useEffect } from "react";
import { Maximize2, Minimize2, X, Send, Plus, Paperclip, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { 
  useListAssistantConversations, 
  useCreateAssistantConversation, 
  useListAssistantMessages,
  useSendAssistantMessage,
  useRequestAssistantUploadUrl,
  useCreateAssistantImportReview,
  getListAssistantConversationsQueryKey,
  getListAssistantMessagesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AssistantMessage } from "./AssistantMessage";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface AssistantWindowProps {
  userId: string;
  onClose: () => void;
}

export function AssistantWindow({ userId, onClose }: AssistantWindowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const convQueryKey = [...getListAssistantConversationsQueryKey(), userId] as const;
  const { data: conversations, isLoading: isLoadingConvs } = useListAssistantConversations({
    query: { queryKey: convQueryKey }
  });

  useEffect(() => {
    setActiveConversationId(null);
  }, [userId]);

  const createConv = useCreateAssistantConversation({
    mutation: {
      onSuccess: (newConv) => {
        queryClient.setQueryData<typeof conversations>(
          convQueryKey,
          (old) => old ? [newConv, ...old] : [newConv],
        );
        setActiveConversationId(newConv.id);
      }
    }
  });

  useEffect(() => {
    if (!activeConversationId && conversations && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  const handleNewChat = () => {
    createConv.mutate({ data: { title: "New Conversation" } });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex flex-col bg-card border border-border shadow-2xl overflow-hidden transition-all duration-300 ease-in-out origin-bottom-right rounded-xl",
        isExpanded
          ? "fixed inset-4 sm:inset-6 md:inset-12 z-50 h-auto w-auto"
          : "w-[calc(100vw-32px)] sm:w-[400px] h-[550px] max-h-[calc(100vh-80px)]"
      )}
      role="dialog"
      aria-label="PriceCrew Assistant"
      aria-modal={isExpanded}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-teal-600 text-white shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={20} />
          <span className="font-semibold tracking-tight">PriceCrew Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {activeConversationId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-teal-700"
              onClick={handleNewChat}
              disabled={createConv.isPending}
              title="New Chat"
              aria-label="New Chat"
            >
              <Plus size={16} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-teal-700"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Minimize" : "Expand"}
            aria-label={isExpanded ? "Minimize" : "Expand"}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-teal-700"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-background relative">
        {isExpanded && (
          <div className="w-64 shrink-0 border-r border-border bg-muted/30 hidden md:flex flex-col">
            <div className="p-4 border-b border-border font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Conversations
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {isLoadingConvs ? (
                  <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
                ) : conversations?.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setActiveConversationId(c.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors",
                      activeConversationId === c.id 
                        ? "bg-teal-50 text-teal-900 font-medium dark:bg-teal-900/20 dark:text-teal-100" 
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    {c.title || "Conversation"}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {activeConversationId ? (
            <ChatView 
              conversationId={activeConversationId} 
              userId={userId} 
              isExpanded={isExpanded}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900/30 text-teal-600 rounded-full flex items-center justify-center mb-2">
                <Bot size={32} />
              </div>
              <h3 className="font-semibold text-lg">How can I help?</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Ask about pricing, create a quote, or upload a price book for review.
              </p>
              <Button 
                onClick={handleNewChat} 
                disabled={createConv.isPending || isLoadingConvs}
                className="bg-teal-600 hover:bg-teal-700 text-white mt-4"
              >
                {createConv.isPending ? <Loader2 className="animate-spin mr-2" size={16} /> : <Plus className="mr-2" size={16} />}
                Start a conversation
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ChatView({ conversationId, userId, isExpanded }: { conversationId: number, userId: string, isExpanded: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const msgQueryKey = [...getListAssistantMessagesQueryKey(conversationId), userId] as const;
  const { data: messagesResponse, isLoading } = useListAssistantMessages(conversationId, {
    query: { queryKey: msgQueryKey, refetchInterval: 3000 } // Auto-refresh for background completion
  });
  
  const sendMessage = useSendAssistantMessage({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData<typeof messagesResponse>(msgQueryKey, (old) => {
          const newMsg = {
            ...data.message,
            metadata: {
              ...data.message.metadata,
              pendingActions: data.pendingActions
            }
          };
          if (!old) return [newMsg];
          return [...old, newMsg];
        });
        void queryClient.invalidateQueries({ queryKey: msgQueryKey });
      }
    }
  });

  const requestUpload = useRequestAssistantUploadUrl();
  const createReview = useCreateAssistantImportReview();

  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesResponse, isUploading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending || isUploading) return;
    
    const userMsgContent = input;
    setInput("");
    
    sendMessage.mutate({ 
      id: conversationId,
      data: { content: userMsgContent }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 25MB", variant: "destructive" });
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(10);
      
       const extension = file.name.split(".").pop()?.toLowerCase();
       const contentType = file.type || (
         extension === "csv" ? "text/csv" :
         extension === "pdf" ? "application/pdf" :
         extension === "xls" ? "application/vnd.ms-excel" :
         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
       );
       const { uploadURL, objectPath } = await requestUpload.mutateAsync({
         data: { conversationId, fileName: file.name, contentType, fileSize: file.size }
      });
      
      setUploadProgress(40);

      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(40 + (event.loaded / event.total) * 40);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", uploadURL, true);
         xhr.setRequestHeader("Content-Type", contentType);
        xhr.send(file);
      });

      setUploadProgress(90);

      await createReview.mutateAsync({
        data: {
          conversationId,
          fileName: file.name,
          objectPath
        }
      });
      
      queryClient.invalidateQueries({ queryKey: msgQueryKey });
      toast({ title: "File uploaded successfully", description: "The assistant is reviewing your file." });
      
    } catch (err) {
      toast({ 
        title: "Upload failed", 
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {isLoading && !messagesResponse ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : messagesResponse?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm space-y-2">
            <p>No messages yet.</p>
          </div>
        ) : (
          messagesResponse?.map(msg => (
            <AssistantMessage 
              key={msg.id} 
              message={msg} 
              conversationId={conversationId}
            />
          ))
        )}
        {(sendMessage.isPending || isUploading) && (
          <div className="flex justify-start">
            <div className="bg-muted px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] flex items-center gap-3">
              <Loader2 className="animate-spin text-muted-foreground" size={16} />
              <span className="text-sm text-muted-foreground">
                {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : "Thinking..."}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="p-3 bg-card border-t border-border shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            className="hidden" 
            accept=".csv,.xls,.xlsx,.pdf"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sendMessage.isPending || isUploading}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded-full"
            title="Upload file (CSV, XLS, XLSX, PDF)"
            aria-label="Upload a price book file"
          >
            <Paperclip size={20} />
          </Button>
          
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a question or request a quote..."
            className="flex-1 focus-visible:ring-teal-600 rounded-full px-4 bg-muted border-transparent"
            disabled={sendMessage.isPending || isUploading}
            aria-label="Message the assistant"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || sendMessage.isPending || isUploading}
            className="rounded-full bg-teal-600 hover:bg-teal-700 text-white shrink-0"
            aria-label="Send message"
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </>
  );
}
