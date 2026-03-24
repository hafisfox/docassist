"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useCampaigns } from "@/hooks/useCampaigns"
import { CampaignCard } from "@/components/campaigns/CampaignCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MegaphoneIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import type { CampaignStatus } from "@/types/database"

const STATUS_OPTIONS: { value: CampaignStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
]

function CampaignsContent() {
  const router = useRouter()
  const { campaigns, loading, error, fetchCampaigns } = useCampaigns()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all")

  useEffect(() => {
    fetchCampaigns({
      search: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    })
  }, [fetchCampaigns, search, statusFilter])

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            {campaigns.length > 0
              ? `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""}`
              : "Create and manage outreach campaigns"}
          </p>
        </div>
        <Button size="sm" onClick={() => router.push("/campaigns/new")}>
          <PlusIcon className="size-3.5" />
          New Campaign
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as CampaignStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error state */}
      {error && (
        <ErrorState
          title="Failed to load campaigns"
          message={error}
          onRetry={() => fetchCampaigns({})}
        />
      )}

      {/* Content */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon />}
          title="No campaigns yet"
          description="Create your first campaign to start reaching out to oncologists on LinkedIn."
          action={{ label: "New Campaign", onClick: () => router.push("/campaigns/new") }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onClick={() => router.push(`/campaigns/${campaign.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignsPageFallback() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-7 w-36" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function CampaignsPage() {
  return (
    <ErrorBoundary section="Campaigns">
      <Suspense fallback={<CampaignsPageFallback />}>
        <CampaignsContent />
      </Suspense>
    </ErrorBoundary>
  )
}
