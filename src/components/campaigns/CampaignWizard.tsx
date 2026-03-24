"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useCampaigns } from "@/hooks/useCampaigns"
import { useSequences, type SequenceWithMeta } from "@/hooks/useSequences"
import { useLeads } from "@/hooks/useLeads"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import type { Lead, IcpSegment } from "@/types/database"
import type { CreateCampaignInput } from "@/lib/validators"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RocketIcon,
  SearchIcon,
  LayersIcon,
  UsersIcon,
} from "lucide-react"

const STEPS = [
  "Name & Description",
  "Select Sequence",
  "Add Leads",
  "Daily Limits",
  "Review & Launch",
] as const

const ICP_SEGMENT_LABELS: Record<IcpSegment, string> = {
  high_volume_chemo: "High-Volume Chemo Clinics",
  precision_oncology: "Precision Oncology Centers",
  insurance_heavy_urban: "Insurance-Heavy Urban Practices",
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          {i > 0 && (
            <div className={`mx-1 h-px w-6 ${i <= currentStep ? "bg-primary" : "bg-border"}`} />
          )}
          <div className="flex items-center gap-1.5">
            <div
              className={`flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                i < currentStep
                  ? "bg-primary text-primary-foreground"
                  : i === currentStep
                    ? "border-2 border-primary text-primary"
                    : "border border-border text-muted-foreground"
              }`}
            >
              {i < currentStep ? <CheckIcon className="size-3.5" /> : i + 1}
            </div>
            <span
              className={`hidden text-xs sm:inline ${
                i === currentStep ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Step 1: Name & Description ───────────────────────────────────────────

function StepNameDescription({
  name,
  description,
  onChange,
}: {
  name: string
  description: string
  onChange: (field: "name" | "description", value: string) => void
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="campaign-name">Campaign Name</Label>
        <Input
          id="campaign-name"
          placeholder="e.g. Mumbai Oncologists — Q1 2026"
          value={name}
          onChange={(e) => onChange("name", e.target.value)}
          maxLength={100}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="campaign-description">Description (optional)</Label>
        <Textarea
          id="campaign-description"
          placeholder="Describe the campaign goal and target audience..."
          value={description}
          onChange={(e) => onChange("description", e.target.value)}
          maxLength={500}
          className="min-h-24"
        />
      </div>
    </div>
  )
}

// ─── Step 2: Select Sequence ──────────────────────────────────────────────

function StepSelectSequence({
  sequences,
  loading,
  selectedId,
  onSelect,
}: {
  sequences: SequenceWithMeta[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  if (sequences.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <LayersIcon className="size-8" />
        <p className="text-sm">No sequences found. Create a sequence first.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {sequences.map((seq) => (
        <Card
          key={seq.id}
          className={`cursor-pointer p-3 transition-all ${
            selectedId === seq.id
              ? "ring-2 ring-primary"
              : "hover:shadow-sm"
          }`}
          onClick={() => onSelect(selectedId === seq.id ? null : seq.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-sm font-medium">{seq.name}</h4>
              {seq.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {seq.description}
                </p>
              )}
            </div>
            {selectedId === seq.id && (
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CheckIcon className="size-3" />
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <LayersIcon className="size-3" />
            {seq.step_count} step{seq.step_count !== 1 ? "s" : ""}
          </div>
        </Card>
      ))}
    </div>
  )
}

// ─── Step 3: Add Leads ────────────────────────────────────────────────────

function StepAddLeads({
  leads,
  loading,
  selectedLeadIds,
  onToggleLead,
  onToggleAll,
  onSearch,
}: {
  leads: Lead[]
  loading: boolean
  selectedLeadIds: Set<string>
  onToggleLead: (id: string) => void
  onToggleAll: () => void
  onSearch: (search: string) => void
}) {
  const [searchValue, setSearchValue] = useState("")

  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value)
      onSearch(value)
    },
    [onSearch],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search leads by name, company, title..."
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Badge variant="secondary" className="shrink-0">
          {selectedLeadIds.size} selected
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <UsersIcon className="size-8" />
          <p className="text-sm">No leads found. Import leads first.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          {/* Select all header */}
          <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
            <Checkbox
              checked={selectedLeadIds.size === leads.length && leads.length > 0}
              onCheckedChange={onToggleAll}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {selectedLeadIds.size === leads.length ? "Deselect all" : "Select all"} ({leads.length})
            </span>
          </div>

          {/* Lead rows */}
          <div className="max-h-80 overflow-y-auto">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/30"
                onClick={() => onToggleLead(lead.id)}
              >
                <Checkbox
                  checked={selectedLeadIds.has(lead.id)}
                  onCheckedChange={() => onToggleLead(lead.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {lead.first_name} {lead.last_name}
                    </span>
                    {lead.icp_segment && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {ICP_SEGMENT_LABELS[lead.icp_segment]}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[lead.job_title, lead.company, lead.location]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step 4: Daily Limits ─────────────────────────────────────────────────

function StepDailyLimits({
  dailyInviteLimit,
  dailyMessageLimit,
  onChange,
}: {
  dailyInviteLimit: number
  dailyMessageLimit: number
  onChange: (field: "dailyInviteLimit" | "dailyMessageLimit", value: number) => void
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <Label htmlFor="daily-invites">Daily Invite Limit</Label>
        <Input
          id="daily-invites"
          type="number"
          min={1}
          max={25}
          value={dailyInviteLimit}
          onChange={(e) => onChange("dailyInviteLimit", Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          Max 25/day recommended (LinkedIn allows ~100/week)
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="daily-messages">Daily Message Limit</Label>
        <Input
          id="daily-messages"
          type="number"
          min={1}
          max={150}
          value={dailyMessageLimit}
          onChange={(e) => onChange("dailyMessageLimit", Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          Max 150/day recommended to stay within LinkedIn limits
        </p>
      </div>
    </div>
  )
}

// ─── Step 5: Review ───────────────────────────────────────────────────────

function StepReview({
  name,
  description,
  sequence,
  selectedLeadCount,
  dailyInviteLimit,
  dailyMessageLimit,
}: {
  name: string
  description: string
  sequence: SequenceWithMeta | null
  selectedLeadCount: number
  dailyInviteLimit: number
  dailyMessageLimit: number
}) {
  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <h4 className="text-xs font-medium uppercase text-muted-foreground">Campaign</h4>
        <p className="mt-1 text-sm font-medium">{name}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </Card>

      <Card className="p-4">
        <h4 className="text-xs font-medium uppercase text-muted-foreground">Sequence</h4>
        {sequence ? (
          <div className="mt-1">
            <p className="text-sm font-medium">{sequence.name}</p>
            <p className="text-xs text-muted-foreground">
              {sequence.step_count} step{sequence.step_count !== 1 ? "s" : ""}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No sequence selected</p>
        )}
      </Card>

      <Card className="p-4">
        <h4 className="text-xs font-medium uppercase text-muted-foreground">Leads</h4>
        <p className="mt-1 text-sm font-medium">{selectedLeadCount} lead{selectedLeadCount !== 1 ? "s" : ""}</p>
      </Card>

      <Card className="p-4">
        <h4 className="text-xs font-medium uppercase text-muted-foreground">Daily Limits</h4>
        <div className="mt-1 flex gap-6 text-sm">
          <span>
            <span className="font-medium">{dailyInviteLimit}</span> invites/day
          </span>
          <span>
            <span className="font-medium">{dailyMessageLimit}</span> messages/day
          </span>
        </div>
      </Card>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────

export function CampaignWizard() {
  const router = useRouter()
  const { createCampaign, updateCampaign } = useCampaigns()
  const { sequences, loading: seqLoading, fetchSequences } = useSequences()
  const { leads, loading: leadsLoading, fetchLeads } = useLeads()

  const [currentStep, setCurrentStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null)
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [dailyInviteLimit, setDailyInviteLimit] = useState(15)
  const [dailyMessageLimit, setDailyMessageLimit] = useState(50)

  // Load sequences on step 2
  useEffect(() => {
    if (currentStep === 1) {
      fetchSequences()
    }
  }, [currentStep, fetchSequences])

  // Load leads on step 3
  useEffect(() => {
    if (currentStep === 2) {
      fetchLeads({ limit: 100 })
    }
  }, [currentStep, fetchLeads])

  const handleNameChange = useCallback((field: "name" | "description", value: string) => {
    if (field === "name") setName(value)
    else setDescription(value)
  }, [])

  const handleLimitsChange = useCallback(
    (field: "dailyInviteLimit" | "dailyMessageLimit", value: number) => {
      if (field === "dailyInviteLimit") setDailyInviteLimit(value)
      else setDailyMessageLimit(value)
    },
    [],
  )

  const handleToggleLead = useCallback((id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleToggleAll = useCallback(() => {
    setSelectedLeadIds((prev) => {
      if (prev.size === leads.length) return new Set()
      return new Set(leads.map((l) => l.id))
    })
  }, [leads])

  const handleLeadSearch = useCallback(
    (search: string) => {
      fetchLeads({ search: search || undefined, limit: 100 })
    },
    [fetchLeads],
  )

  const selectedSequence = sequences.find((s) => s.id === selectedSequenceId) ?? null

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 0:
        return name.trim().length > 0
      case 1:
        return true // sequence is optional
      case 2:
        return true // leads can be added later
      case 3:
        return dailyInviteLimit >= 1 && dailyMessageLimit >= 1
      case 4:
        return name.trim().length > 0
      default:
        return false
    }
  }

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
    }
  }, [currentStep])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
    }
  }, [currentStep])

  const handleLaunch = useCallback(async () => {
    setSubmitting(true)

    try {
      const input: CreateCampaignInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        sequence_id: selectedSequenceId ?? undefined,
        daily_invite_limit: dailyInviteLimit,
        daily_message_limit: dailyMessageLimit,
      }

      const campaign = await createCampaign(input)

      // Assign leads if selected
      if (selectedLeadIds.size > 0) {
        await updateCampaign(campaign.id, {
          lead_ids: Array.from(selectedLeadIds),
        })
      }

      toast.success("Campaign created successfully")
      router.push(`/campaigns/${campaign.id}`)
    } catch {
      toast.error("Failed to create campaign")
    } finally {
      setSubmitting(false)
    }
  }, [
    name,
    description,
    selectedSequenceId,
    dailyInviteLimit,
    dailyMessageLimit,
    selectedLeadIds,
    createCampaign,
    updateCampaign,
    router,
  ])

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      <StepIndicator currentStep={currentStep} />

      {/* Step content */}
      <div className="min-h-[300px]">
        {currentStep === 0 && (
          <StepNameDescription
            name={name}
            description={description}
            onChange={handleNameChange}
          />
        )}
        {currentStep === 1 && (
          <StepSelectSequence
            sequences={sequences}
            loading={seqLoading}
            selectedId={selectedSequenceId}
            onSelect={setSelectedSequenceId}
          />
        )}
        {currentStep === 2 && (
          <StepAddLeads
            leads={leads}
            loading={leadsLoading}
            selectedLeadIds={selectedLeadIds}
            onToggleLead={handleToggleLead}
            onToggleAll={handleToggleAll}
            onSearch={handleLeadSearch}
          />
        )}
        {currentStep === 3 && (
          <StepDailyLimits
            dailyInviteLimit={dailyInviteLimit}
            dailyMessageLimit={dailyMessageLimit}
            onChange={handleLimitsChange}
          />
        )}
        {currentStep === 4 && (
          <StepReview
            name={name}
            description={description}
            sequence={selectedSequence}
            selectedLeadCount={selectedLeadIds.size}
            dailyInviteLimit={dailyInviteLimit}
            dailyMessageLimit={dailyMessageLimit}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          <ChevronLeftIcon className="size-4" />
          Back
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button
            size="sm"
            onClick={handleNext}
            disabled={!canProceed()}
          >
            Next
            <ChevronRightIcon className="size-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleLaunch}
            disabled={submitting || !canProceed()}
          >
            {submitting ? "Creating..." : "Launch Campaign"}
            {!submitting && <RocketIcon className="size-4" />}
          </Button>
        )}
      </div>
    </div>
  )
}
