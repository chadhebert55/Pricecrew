import { useState } from "react";
import { useAuth } from "@clerk/react";
import { MessageCircle } from "lucide-react";
import { AssistantWindow } from "./AssistantWindow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

export function AssistantWidget() {
  const { userId } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!userId) return null;

  return (
    <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <AssistantWindow userId={userId} onClose={() => setIsOpen(false)} />
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <Button
              onClick={() => setIsOpen(true)}
              className={cn(
                "h-14 w-14 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 bg-teal-600 hover:bg-teal-700 text-white border-none",
              )}
              aria-label="Open PriceCrew Assistant"
            >
              <MessageCircle size={28} />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
