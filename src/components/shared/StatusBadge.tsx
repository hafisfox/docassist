import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { LeadStatus, CampaignStatus } from "@/types/database"

const leadStatusConfig: Record<
  LeadStatus,
  { label: string; className: string }
> = {
  new: {
    label: "New",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  enriched: {
    label: "Enriched",
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  },
  invite_sent: {
    label: "Invite Sent",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  invite_accepted: {
    label: "Accepted",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  invite_expired: {
    label: "Expired",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  },
  message_sent: {
    label: "Message Sent",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  replied: {
    label: "Replied",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  interested: {
    label: "Interested",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  not_interested: {
    label: "Not Interested",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  meeting_booked: {
    label: "Meeting Booked",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  converted: {
    label: "Converted",
    className: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  do_not_contact: {
    label: "Do Not Contact",
    className: "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
}

const campaignStatusConfig: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  },
  active: {
    label: "Active",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  paused: {
    label: "Paused",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  completed: {
    label: "Completed",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  archived: {
    label: "Archived",
    className: "bg-gray-200 text-gray-600 dark:bg-gray-900/40 dark:text-gray-500",
  },
}

type StatusBadgeProps =
  | { type: "lead"; status: LeadStatus; className?: string }
  | { type: "campaign"; status: CampaignStatus; className?: string }

function StatusBadge(props: StatusBadgeProps) {
  const config =
    props.type === "lead"
      ? leadStatusConfig[props.status]
      : campaignStatusConfig[props.status]

  return (
    <Badge
      data-slot="status-badge"
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        config.className,
        props.className
      )}
    >
      {config.label}
    </Badge>
  )
}

export { StatusBadge }
