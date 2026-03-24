"use client"

import { Card } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import type { CampaignWithMeta } from "@/hooks/useCampaigns"
import {
  UsersIcon,
  SendIcon,
  UserCheckIcon,
  MessageSquareIcon,
} from "lucide-react"

function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%"
  return `${Math.round((numerator / denominator) * 100)}%`
}

interface CampaignCardProps {
  campaign: CampaignWithMeta
  onClick: () => void
}

export function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  return (
    <Card
      className="group flex cursor-pointer flex-col gap-4 p-4 transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{campaign.name}</h3>
          {campaign.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {campaign.description}
            </p>
          )}
        </div>
        <StatusBadge type="campaign" status={campaign.status} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UsersIcon className="size-3.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">{campaign.lead_count}</span> leads
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SendIcon className="size-3.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">{campaign.invites_sent}</span> invites
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserCheckIcon className="size-3.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">
              {formatRate(campaign.invites_accepted, campaign.invites_sent)}
            </span>{" "}
            accepted
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquareIcon className="size-3.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">{campaign.replies_received}</span> replies
          </span>
        </div>
      </div>
    </Card>
  )
}
