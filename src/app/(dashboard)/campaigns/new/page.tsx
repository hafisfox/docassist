"use client"

import { Suspense } from "react"
import { CampaignWizard } from "@/components/campaigns/CampaignWizard"
import { Skeleton } from "@/components/ui/skeleton"

function NewCampaignContent() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">New Campaign</h1>
        <p className="text-sm text-muted-foreground">
          Set up a new outreach campaign step by step
        </p>
      </div>
      <CampaignWizard />
    </div>
  )
}

function NewCampaignFallback() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<NewCampaignFallback />}>
      <NewCampaignContent />
    </Suspense>
  )
}
