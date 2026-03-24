"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useCampaigns, type CampaignWithMeta } from "@/hooks/useCampaigns"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import type { Lead, CampaignStatus } from "@/types/database"
import {
  ArrowLeftIcon,
  PlayIcon,
  PauseIcon,
  UsersIcon,
  SendIcon,
  UserCheckIcon,
  MessageSquareIcon,
  MessageCircleIcon,
  CalendarIcon,
  LayersIcon,
} from "lucide-react"

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  enriched: "Enriched",
  invite_sent: "Invite Sent",
  invite_accepted: "Accepted",
  invite_expired: "Expired",
  message_sent: "Message Sent",
  replied: "Replied",
  interested: "Interested",
  not_interested: "Not Interested",
  meeting_booked: "Meeting",
  converted: "Converted",
  do_not_contact: "DNC",
}

function StatCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subtext?: string
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {subtext && <p className="text-[10px] text-muted-foreground">{subtext}</p>}
      </div>
    </Card>
  )
}

function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%"
  return `${Math.round((numerator / denominator) * 100)}%`
}

function CampaignDetailContent() {
  const params = useParams()
  const router = useRouter()
  const { fetchCampaign, updateCampaign } = useCampaigns()

  const [campaign, setCampaign] = useState<CampaignWithMeta | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const campaignId = params.id as string

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await fetchCampaign(campaignId)
        setCampaign(data.campaign)
        setLeads(data.leads)
      } catch {
        toast.error("Failed to load campaign")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [campaignId, fetchCampaign])

  const handleToggleStatus = useCallback(async () => {
    if (!campaign) return
    setToggling(true)
    const nextStatus: CampaignStatus = campaign.status === "active" ? "paused" : "active"
    try {
      const updated = await updateCampaign(campaign.id, { status: nextStatus })
      setCampaign((prev) => (prev ? { ...prev, ...updated } : prev))
      toast.success(nextStatus === "active" ? "Campaign activated" : "Campaign paused")
    } catch {
      toast.error("Failed to update campaign")
    } finally {
      setToggling(false)
    }
  }, [campaign, updateCampaign])

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-7 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center gap-4 p-12 text-center">
        <p className="text-sm text-muted-foreground">Campaign not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/campaigns")}>
          Back to Campaigns
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push("/campaigns")}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{campaign.name}</h1>
              <StatusBadge type="campaign" status={campaign.status} />
            </div>
            {campaign.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{campaign.description}</p>
            )}
          </div>
        </div>

        {(campaign.status === "draft" || campaign.status === "active" || campaign.status === "paused") && (
          <Button
            size="sm"
            variant={campaign.status === "active" ? "outline" : "default"}
            onClick={handleToggleStatus}
            disabled={toggling}
          >
            {campaign.status === "active" ? (
              <>
                <PauseIcon className="size-3.5" />
                Pause
              </>
            ) : (
              <>
                <PlayIcon className="size-3.5" />
                {campaign.status === "draft" ? "Launch" : "Resume"}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={<UsersIcon className="size-5" />}
          label="Total Leads"
          value={campaign.lead_count}
        />
        <StatCard
          icon={<SendIcon className="size-5" />}
          label="Invites Sent"
          value={campaign.invites_sent}
        />
        <StatCard
          icon={<UserCheckIcon className="size-5" />}
          label="Acceptance Rate"
          value={formatRate(campaign.invites_accepted, campaign.invites_sent)}
          subtext={`${campaign.invites_accepted} accepted`}
        />
        <StatCard
          icon={<MessageSquareIcon className="size-5" />}
          label="Messages Sent"
          value={campaign.messages_sent}
        />
        <StatCard
          icon={<MessageCircleIcon className="size-5" />}
          label="Replies"
          value={campaign.replies_received}
          subtext={`${campaign.positive_replies} positive`}
        />
        <StatCard
          icon={<CalendarIcon className="size-5" />}
          label="Meetings Booked"
          value={campaign.meetings_booked}
        />
      </div>

      {/* Sequence info */}
      {campaign.sequence && (
        <Card className="flex items-center gap-3 p-4">
          <LayersIcon className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Sequence: {campaign.sequence.name}</p>
            {campaign.sequence.description && (
              <p className="text-xs text-muted-foreground">{campaign.sequence.description}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => router.push(`/sequences/${campaign.sequence_id}`)}
          >
            View
          </Button>
        </Card>
      )}

      {/* Lead table */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">
          Campaign Leads ({leads.length})
        </h2>
        {leads.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <UsersIcon className="size-8" />
            <p className="text-sm">No leads assigned to this campaign yet.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Title</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Company</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Location</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-muted/30"
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <td className="px-3 py-2 font-medium">
                      {lead.first_name} {lead.last_name}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{lead.job_title ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{lead.company ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{lead.location ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">
                        {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function CampaignDetailFallback() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

export default function CampaignDetailPage() {
  return (
    <Suspense fallback={<CampaignDetailFallback />}>
      <CampaignDetailContent />
    </Suspense>
  )
}
