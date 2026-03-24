"use client"

import { useCallback, useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTemplates, type TemplateCategory } from "@/hooks/useTemplates"
import type { Template } from "@/types/database"
import type { LocalStep } from "@/app/(dashboard)/sequences/[id]/page"
import {
  TrashIcon,
  UserPlusIcon,
  HourglassIcon,
  MessageSquareIcon,
  TimerIcon,
  GitBranchIcon,
  FileTextIcon,
  PencilIcon,
} from "lucide-react"

const STEP_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  connection_request: {
    label: "Connection Request",
    icon: <UserPlusIcon className="size-4" />,
    description: "Send a LinkedIn connection request with an optional message.",
  },
  wait_for_acceptance: {
    label: "Wait for Acceptance",
    icon: <HourglassIcon className="size-4" />,
    description: "Pause the sequence until the connection request is accepted.",
  },
  message: {
    label: "Message",
    icon: <MessageSquareIcon className="size-4" />,
    description: "Send a direct message to the lead (must be a connection).",
  },
  delay: {
    label: "Delay",
    icon: <TimerIcon className="size-4" />,
    description: "Wait for a specified amount of time before the next step.",
  },
  condition: {
    label: "Condition",
    icon: <GitBranchIcon className="size-4" />,
    description: "Branch the sequence based on a lead field value.",
  },
}

const CONDITION_FIELDS = [
  { value: "status", label: "Lead Status" },
  { value: "icp_segment", label: "ICP Segment" },
  { value: "company", label: "Company" },
  { value: "specialty", label: "Specialty" },
  { value: "location", label: "Location" },
  { value: "hospital_type", label: "Hospital Type" },
]

const CONDITION_STATUS_VALUES = [
  "invite_accepted",
  "replied",
  "interested",
  "not_interested",
  "message_sent",
]

function TemplatePicker({
  category,
  selectedId,
  onSelect,
}: {
  category: TemplateCategory
  selectedId: string | null
  onSelect: (templateId: string | null, body: string | null) => void
}) {
  const { templates, loading, fetchTemplates } = useTemplates()

  useEffect(() => {
    fetchTemplates(category)
  }, [category, fetchTemplates])

  const filtered = templates.filter((t) => t.category === category)
  const selected = filtered.find((t) => t.id === selectedId)

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <FileTextIcon className="size-3.5 text-muted-foreground" />
        <Label>Template</Label>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
          Loading templates...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
          No {category.replace("_", " ")} templates found. Create one in the Templates page.
        </div>
      ) : (
        <Select
          value={selectedId ?? "none"}
          onValueChange={(val) => {
            if (val === "none") {
              onSelect(null, null)
            } else {
              const tmpl = filtered.find((t) => t.id === val)
              onSelect(val, tmpl?.body ?? null)
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No template (custom message)</SelectItem>
            {filtered.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selected && (
        <div className="rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
          {selected.body.length > 200
            ? selected.body.slice(0, 200) + "..."
            : selected.body}
          <div className="mt-2 flex flex-wrap gap-1">
            {selected.variables.map((v) => (
              <Badge key={v} variant="secondary" className="text-[10px]">
                {`{{${v}}}`}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface StepEditorProps {
  step: LocalStep
  onUpdate: (updates: Partial<LocalStep>) => void
  onRemove: () => void
}

export function StepEditor({ step, onUpdate, onRemove }: StepEditorProps) {
  const config = STEP_TYPE_LABELS[step.step_type]

  const handleTemplateSelect = useCallback(
    (templateId: string | null, body: string | null) => {
      onUpdate({ template_id: templateId, message_body: body })
    },
    [onUpdate],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {config.icon}
          <div>
            <h3 className="text-sm font-medium">{config.label}</h3>
            <p className="text-xs text-muted-foreground">
              Step {step.step_order + 1}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <TrashIcon className="size-3.5" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{config.description}</p>

      <Separator />

      {/* Step-type-specific fields */}
      {step.step_type === "connection_request" && (
        <div className="flex flex-col gap-4">
          <TemplatePicker
            category="connection_request"
            selectedId={step.template_id}
            onSelect={handleTemplateSelect}
          />

          {!step.template_id && (
            <div className="grid gap-1.5">
              <Label htmlFor="step-message">Custom Message (optional, max 300 chars)</Label>
              <Textarea
                id="step-message"
                placeholder="Hi {{first_name}}, I came across your work at {{company}}..."
                value={step.message_body ?? ""}
                onChange={(e) => onUpdate({ message_body: e.target.value || null })}
                className="min-h-24"
                maxLength={300}
              />
              <span className="text-right text-[10px] text-muted-foreground">
                {(step.message_body ?? "").length}/300
              </span>
            </div>
          )}
        </div>
      )}

      {step.step_type === "wait_for_acceptance" && (
        <div className="rounded-lg border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
          <HourglassIcon className="mx-auto mb-2 size-6" />
          <p>This step pauses the sequence until the lead accepts the connection request.</p>
          <p className="mt-1 text-xs">No configuration needed.</p>
        </div>
      )}

      {step.step_type === "message" && (
        <div className="flex flex-col gap-4">
          <TemplatePicker
            category="message"
            selectedId={step.template_id}
            onSelect={handleTemplateSelect}
          />

          {!step.template_id && (
            <div className="grid gap-1.5">
              <Label htmlFor="step-msg-body">Custom Message</Label>
              <Textarea
                id="step-msg-body"
                placeholder="Hi {{first_name}}, following up on my previous message..."
                value={step.message_body ?? ""}
                onChange={(e) => onUpdate({ message_body: e.target.value || null })}
                className="min-h-32"
              />
            </div>
          )}
        </div>
      )}

      {step.step_type === "delay" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="delay-days">Days</Label>
              <Input
                id="delay-days"
                type="number"
                min={0}
                max={30}
                value={step.delay_days ?? 0}
                onChange={(e) =>
                  onUpdate({ delay_days: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="delay-hours">Hours</Label>
              <Input
                id="delay-hours"
                type="number"
                min={0}
                max={23}
                value={step.delay_hours ?? 0}
                onChange={(e) =>
                  onUpdate({ delay_hours: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Total wait time:{" "}
            {(() => {
              const days = step.delay_days ?? 0
              const hours = step.delay_hours ?? 0
              const parts: string[] = []
              if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`)
              if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`)
              return parts.length > 0 ? parts.join(" ") : "0 hours"
            })()}
          </p>
        </div>
      )}

      {step.step_type === "condition" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label>Condition Field</Label>
            <Select
              value={step.condition_field ?? ""}
              onValueChange={(val) => onUpdate({ condition_field: val || null })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a field" />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Expected Value</Label>
            {step.condition_field === "status" ? (
              <Select
                value={step.condition_value ?? ""}
                onValueChange={(val) => onUpdate({ condition_value: val || null })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_STATUS_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Enter expected value"
                value={step.condition_value ?? ""}
                onChange={(e) =>
                  onUpdate({ condition_value: e.target.value || null })
                }
              />
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>If True &rarr; Go to Step</Label>
              <Input
                type="number"
                min={1}
                placeholder="Step #"
                value={step.on_true_step != null ? step.on_true_step + 1 : ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  onUpdate({ on_true_step: isNaN(val) ? null : val - 1 })
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>If False &rarr; Go to Step</Label>
              <Input
                type="number"
                min={1}
                placeholder="Step #"
                value={step.on_false_step != null ? step.on_false_step + 1 : ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  onUpdate({ on_false_step: isNaN(val) ? null : val - 1 })
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave blank to continue to the next step sequentially.
          </p>
        </div>
      )}
    </div>
  )
}
