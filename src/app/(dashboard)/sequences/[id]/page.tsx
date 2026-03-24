"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSequences, type SequenceWithMeta } from "@/hooks/useSequences"
import type { SequenceStep, SequenceStepType } from "@/types/database"
import { SequenceBuilder } from "@/components/sequences/SequenceBuilder"
import { StepEditor } from "@/components/sequences/StepEditor"
import { SequencePreview } from "@/components/sequences/SequencePreview"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  SaveIcon,
  EyeIcon,
  WrenchIcon,
  PencilIcon,
  CheckIcon,
} from "lucide-react"

/** Local step type used while editing (may not have an id yet) */
export interface LocalStep {
  id: string // local-only ID for dnd-kit, not necessarily a DB id
  step_order: number
  step_type: SequenceStepType
  template_id: string | null
  message_body: string | null
  delay_hours: number | null
  delay_days: number | null
  condition_field: string | null
  condition_value: string | null
  on_true_step: number | null
  on_false_step: number | null
}

let nextLocalId = 0
export function createLocalId(): string {
  return `local-${Date.now()}-${nextLocalId++}`
}

function toLocalStep(step: SequenceStep): LocalStep {
  return {
    id: step.id,
    step_order: step.step_order,
    step_type: step.step_type,
    template_id: step.template_id,
    message_body: step.message_body,
    delay_hours: step.delay_hours,
    delay_days: step.delay_days,
    condition_field: step.condition_field,
    condition_value: step.condition_value,
    on_true_step: step.on_true_step,
    on_false_step: step.on_false_step,
  }
}

export function createDefaultStep(type: SequenceStepType, order: number): LocalStep {
  return {
    id: createLocalId(),
    step_order: order,
    step_type: type,
    template_id: null,
    message_body: null,
    delay_hours: type === "delay" ? 0 : null,
    delay_days: type === "delay" ? 1 : null,
    condition_field: null,
    condition_value: null,
    on_true_step: null,
    on_false_step: null,
  }
}

export default function SequenceBuilderPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { fetchSequence, updateSequence } = useSequences()

  const [sequence, setSequence] = useState<SequenceWithMeta | null>(null)
  const [steps, setSteps] = useState<LocalStep[]>([])
  const [name, setName] = useState("")
  const [editingName, setEditingName] = useState(false)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null

  // Load sequence
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const seq = await fetchSequence(params.id)
        if (cancelled) return
        setSequence(seq)
        setName(seq.name)
        setSteps((seq.steps ?? []).map(toLocalStep))
      } catch {
        toast.error("Failed to load sequence")
        router.push("/sequences")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [params.id, fetchSequence, router])

  const handleAddStep = useCallback((type: SequenceStepType, afterIndex: number) => {
    setSteps((prev) => {
      const newStep = createDefaultStep(type, afterIndex + 1)
      const next = [...prev]
      next.splice(afterIndex + 1, 0, newStep)
      // Re-number
      return next.map((s, i) => ({ ...s, step_order: i }))
    })
    setDirty(true)
  }, [])

  const handleRemoveStep = useCallback((stepId: string) => {
    setSteps((prev) => {
      const next = prev.filter((s) => s.id !== stepId)
      return next.map((s, i) => ({ ...s, step_order: i }))
    })
    setSelectedStepId((prev) => (prev === stepId ? null : prev))
    setDirty(true)
  }, [])

  const handleReorderSteps = useCallback((reordered: LocalStep[]) => {
    setSteps(reordered.map((s, i) => ({ ...s, step_order: i })))
    setDirty(true)
  }, [])

  const handleUpdateStep = useCallback((stepId: string, updates: Partial<LocalStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, ...updates } : s)),
    )
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!sequence) return
    setSaving(true)
    try {
      const stepsPayload = steps.map((s) => ({
        step_order: s.step_order,
        step_type: s.step_type,
        template_id: s.template_id,
        message_body: s.message_body,
        delay_hours: s.delay_hours,
        delay_days: s.delay_days,
        condition_field: s.condition_field,
        condition_value: s.condition_value,
        on_true_step: s.on_true_step,
        on_false_step: s.on_false_step,
      }))
      const updated = await updateSequence(sequence.id, {
        name,
        steps: stepsPayload,
      })
      setSequence(updated)
      setSteps((updated.steps ?? []).map(toLocalStep))
      setDirty(false)
      toast.success("Sequence saved")
    } catch {
      toast.error("Failed to save sequence")
    } finally {
      setSaving(false)
    }
  }, [sequence, name, steps, updateSequence])

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-[600px] rounded-xl" />
      </div>
    )
  }

  if (!sequence) return null

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push("/sequences")}
          >
            <ArrowLeftIcon className="size-4" />
            <span className="sr-only">Back</span>
          </Button>

          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setDirty(true)
                }}
                className="h-8 w-64 text-lg font-semibold"
                maxLength={100}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") setEditingName(false)
                  if (e.key === "Escape") {
                    setName(sequence.name)
                    setEditingName(false)
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditingName(false)}
              >
                <CheckIcon className="size-3.5" />
              </Button>
            </div>
          ) : (
            <button
              className="group flex items-center gap-2"
              onClick={() => setEditingName(true)}
            >
              <h1 className="text-lg font-semibold">{name}</h1>
              <PencilIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          <SaveIcon className="size-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Builder / Preview Tabs */}
      <Tabs defaultValue="builder" className="flex-1">
        <TabsList>
          <TabsTrigger value="builder">
            <WrenchIcon className="mr-1.5 size-3.5" />
            Builder
          </TabsTrigger>
          <TabsTrigger value="preview">
            <EyeIcon className="mr-1.5 size-3.5" />
            Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            {/* Timeline */}
            <SequenceBuilder
              steps={steps}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
              onAddStep={handleAddStep}
              onRemoveStep={handleRemoveStep}
              onReorderSteps={handleReorderSteps}
            />

            {/* Step Editor Sidebar */}
            <div className="rounded-xl border bg-card p-4">
              {selectedStep ? (
                <StepEditor
                  step={selectedStep}
                  onUpdate={(updates) =>
                    handleUpdateStep(selectedStep.id, updates)
                  }
                  onRemove={() => handleRemoveStep(selectedStep.id)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                  <WrenchIcon className="size-8" />
                  <p className="text-sm">Select a step to edit its details</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <SequencePreview steps={steps} sequenceName={name} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
