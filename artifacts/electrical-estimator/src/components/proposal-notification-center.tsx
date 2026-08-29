import {
  getGetNotificationsQueryKey,
  useGetNotifications,
  useMarkNotificationRead,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Bell, CheckCircle2, XCircle } from "lucide-react"
import { Link } from "wouter"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const notificationDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function ProposalNotificationCenter() {
  const queryClient = useQueryClient()
  const notificationsQuery = useGetNotifications({
    query: {
      queryKey: getGetNotificationsQueryKey(),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  })
  const markRead = useMarkNotificationRead({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getGetNotificationsQueryKey(),
        }),
    },
  })
  const notifications = notificationsQuery.data?.notifications ?? []
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0
              ? `Proposal notifications, ${unreadCount} unread`
              : "Proposal notifications"
          }
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell size={18} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))]">
        <DropdownMenuLabel className="flex items-center justify-between gap-3">
          <span>Proposal decisions</span>
          <span className="text-xs font-normal text-muted-foreground">
            {unreadCount} unread
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notificationsQuery.isError ? (
          <p className="px-2 py-5 text-center text-sm text-destructive">
            Notifications could not be loaded.
          </p>
        ) : notifications.length === 0 ? (
          <p className="px-2 py-5 text-center text-sm text-muted-foreground">
            No customer decisions yet.
          </p>
        ) : (
          notifications.map((notification) => {
            const accepted = notification.decision === "accepted"
            const revisionLabel =
              notification.revisionNumber > 0
                ? `Rev ${notification.revisionNumber}`
                : "Original"
            return (
              <DropdownMenuItem
                key={notification.id}
                asChild
                onSelect={() => {
                  if (!notification.readAt) {
                    markRead.mutate({ id: notification.id })
                  }
                }}
              >
                <Link
                  href={`/quotes/${notification.quoteId}`}
                  className={`flex cursor-pointer items-start gap-3 py-3 ${
                    notification.readAt ? "opacity-75" : "bg-muted/60"
                  }`}
                >
                  {accepted ? (
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-emerald-600"
                    />
                  ) : (
                    <XCircle
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-destructive"
                    />
                  )}
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-sm font-semibold capitalize">
                      Proposal {notification.decision}
                    </span>
                    <span className="block truncate text-xs">
                      {notification.quoteNumber} · {notification.customerName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {notification.projectName} · {revisionLabel} ·{" "}
                      {notificationDate.format(
                        new Date(notification.createdAt),
                      )}
                    </span>
                  </span>
                  {!notification.readAt ? (
                    <span
                      aria-label="Unread"
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
                    />
                  ) : null}
                </Link>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}