"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { LocalStep } from "@/app/(dashboard)/sequences/[id]/page"
import {
  UserPlusIcon,
  HourglassIcon,
  MessageSquareIcon,
  TimerIcon,
  GitBranchIcon,
  CheckCircleIcon,
  PlayIcon,
} from "lucide-react"

const SAMPLE_DATA: Record<string, string> = {
  first_name: "Rahul",
  last_name: "Sharma",
  company: "Apollo Hospitals",
  specialty: "Medical Oncology",
  city: "Mumbai",
  title: "Consultant Medical Oncologist",
}

function fillVariables(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_DATA[key] ?? `{{${key}}}`)
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  connection_request: <UserPlusIcon className="size-4" />,
  wait_for_acceptance: <HourglassIcon className="size-4" />,
  message: <MessageSquareIcon className="size-4" />,
  delay: <TimerIcon className="size-4" />,
  condition: <GitBranchIcon className="size-4" />,
}

const STEP_COLORS: Record<string, string> = {
  connection_request: "bg-blue-500",
  wait_for_acceptance: "bg-amber-500",
  message: "bg-green-500",
  delay: "bg-purple-500",
  condition: "bg-orange-500",
}

const STEP_LABELS: Record<string, string> = {
  connection_request: "Connection Request",
  wait_for_acceptance: "Wait for Acceptance",
  message: "Message",
  delay: "Delay",
  condition: "Condition",
}

function PreviewStep({ step, index, isLast }: { step: LocalStep; index: number; isLast: boolean }) {
  const renderContent = () => {
    switch (step.step_type) {
      case "connection_request": {
        const body = step.message_body
          ? fillVariables(step.message_body)
          : null
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                LinkedIn Connection Request
              </Badge>
            </div>
            {body ? (
              <div className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap">
                {body}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No message attached — blank connection request
              </p>
            )}
          </div>
        )
      }

      case "wait_for_acceptance":
        return (
          <p className="text-sm text-muted-foreground">
            Sequence pauses here until{" "}
            <span className="font-medium text-foreground">{SAMPLE_DATA.first_name}</span>{" "}
            accepts the connection request.
          </p>
        )

      case "message": {
        const body = step.message_body
          ? fillVariables(step.message_body)
          : null
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                Direct Message
              </Badge>
            </div>
            {body ? (
              <div className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap">
                {body}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No message content — uses selected template at runtime
              </p>
            )}
          </div>
        )
      }

      case "delay": {
        const days = step.delay_days ?? 0
        const hours = step.delay_hours ?? 0
        const parts: string[] = []
        if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`)
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`)
        const label = parts.length > 0 ? parts.join(" and ") : "no delay configured"
        return (
          <p className="text-sm text-muted-foreground">
            Wait for <span className="font-medium text-foreground">{label}</span> before continuing.
          </p>
        )
      }

      case "condition":
        return (
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">If</span>{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {step.condition_field ?? "?"}
              </code>{" "}
              equals{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {step.condition_value ?? "?"}
              </code>
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="rounded border bg-green-500/5 p-2">
                True &rarr; {step.on_true_step != null ? `Step ${step.on_true_step + 1}` : "Next step"}
              </div>
              <div className="rounded border bg-red-500/5 p-2">
                False &rarr; {step.on_false_step != null ? `Step ${step.on_false_step + 1}` : "Next step"}
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex gap-4">
      {/* Timeline column */}
      <div className="flex flex-col items-center">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white ${STEP_COLORS[step.step_type]}`}
        >
          {STEP_ICONS[step.step_type]}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground">
            STEP {index + 1}
          </span>
          <h4 className="text-sm font-medium">{STEP_LABELS[step.step_type]}</h4>
        </div>
        {renderContent()}
      </div>
    </div>
  )
}

interface SequencePreviewProps {
  steps: LocalStep[]
  sequenceName: string
}

export function SequencePreview({ steps, sequenceName }: SequencePreviewProps) {
  if (steps.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <PlayIcon className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Add steps to your sequence to see a preview here.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-sm font-medium">{sequenceName}</h3>
        <p className="text-xs text-muted-foreground">
          Preview with sample lead:{" "}
          <span className="font-medium">
            {SAMPLE_DATA.first_name} {SAMPLE_DATA.last_name}
          </span>{" "}
          — {SAMPLE_DATA.title} at {SAMPLE_DATA.company}, {SAMPLE_DATA.city}
        </p>
      </div>

      <Separator className="mb-6" />

      {/* Start */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-green-500 text-white">
          <PlayIcon className="size-4" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          Lead enrolled in sequence
        </span>
      </div>

      {/* Steps */}
      {steps.map((step, index) => (
        <PreviewStep
          key={step.id}
          step={step}
          index={index}
          isLast={index === steps.length - 1}
        />
      ))}

      {/* End */}
      <div className="mt-2 flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CheckCircleIcon className="size-4" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          Sequence complete
        </span>
      </div>
    </Card>
  )
}
