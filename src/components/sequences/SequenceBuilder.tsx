"use client"

import { useCallback, useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { SequenceStepType } from "@/types/database"
import type { LocalStep } from "@/app/(dashboard)/sequences/[id]/page"
import {
  GripVerticalIcon,
  PlusIcon,
  UserPlusIcon,
  ClockIcon,
  MessageSquareIcon,
  TimerIcon,
  GitBranchIcon,
  TrashIcon,
  HourglassIcon,
} from "lucide-react"

const STEP_TYPE_CONFIG: Record<
  SequenceStepType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  connection_request: {
    label: "Connection Request",
    icon: <UserPlusIcon className="size-4" />,
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
  },
  wait_for_acceptance: {
    label: "Wait for Acceptance",
    icon: <HourglassIcon className="size-4" />,
    color: "bg-amber-500/10 text-amber-600 border-amber-200",
  },
  message: {
    label: "Message",
    icon: <MessageSquareIcon className="size-4" />,
    color: "bg-green-500/10 text-green-600 border-green-200",
  },
  delay: {
    label: "Delay",
    icon: <TimerIcon className="size-4" />,
    color: "bg-purple-500/10 text-purple-600 border-purple-200",
  },
  condition: {
    label: "Condition",
    icon: <GitBranchIcon className="size-4" />,
    color: "bg-orange-500/10 text-orange-600 border-orange-200",
  },
}

const ADD_STEP_OPTIONS: { type: SequenceStepType; label: string; icon: React.ReactNode }[] = [
  { type: "connection_request", label: "Connection Request", icon: <UserPlusIcon className="size-4" /> },
  { type: "wait_for_acceptance", label: "Wait for Acceptance", icon: <HourglassIcon className="size-4" /> },
  { type: "message", label: "Message", icon: <MessageSquareIcon className="size-4" /> },
  { type: "delay", label: "Delay", icon: <TimerIcon className="size-4" /> },
  { type: "condition", label: "Condition", icon: <GitBranchIcon className="size-4" /> },
]

function getStepPreview(step: LocalStep): string {
  switch (step.step_type) {
    case "connection_request":
      return step.template_id
        ? "Using template"
        : step.message_body
          ? step.message_body.slice(0, 60) + (step.message_body.length > 60 ? "..." : "")
          : "No template selected"
    case "wait_for_acceptance":
      return "Waits until the connection request is accepted"
    case "message":
      return step.template_id
        ? "Using template"
        : step.message_body
          ? step.message_body.slice(0, 60) + (step.message_body.length > 60 ? "..." : "")
          : "No template selected"
    case "delay": {
      const parts: string[] = []
      if (step.delay_days) parts.push(`${step.delay_days} day${step.delay_days !== 1 ? "s" : ""}`)
      if (step.delay_hours) parts.push(`${step.delay_hours} hour${step.delay_hours !== 1 ? "s" : ""}`)
      return parts.length > 0 ? `Wait ${parts.join(" ")}` : "No delay configured"
    }
    case "condition":
      return step.condition_field
        ? `If ${step.condition_field} = ${step.condition_value ?? "?"}`
        : "No condition configured"
    default:
      return ""
  }
}

function AddStepButton({
  afterIndex,
  onAdd,
}: {
  afterIndex: number
  onAdd: (type: SequenceStepType, afterIndex: number) => void
}) {
  return (
    <div className="flex items-center justify-center py-1">
      <div className="h-6 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="absolute inline-flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          <PlusIcon className="size-3" />
          <span className="sr-only">Add step</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {ADD_STEP_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.type}
              onClick={() => onAdd(opt.type, afterIndex)}
            >
              {opt.icon}
              <span className="ml-2">{opt.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SortableStepCard({
  step,
  index,
  isSelected,
  onSelect,
  onRemove,
}: {
  step: LocalStep
  index: number
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const config = STEP_TYPE_CONFIG[step.step_type]
  const preview = getStepPreview(step)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-stretch gap-0 rounded-lg border bg-card transition-all",
        isSelected && "ring-2 ring-primary",
        isDragging && "z-10 shadow-lg opacity-90",
      )}
    >
      {/* Drag handle */}
      <button
        className="flex cursor-grab items-center px-2 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>

      {/* Main content — clickable */}
      <button
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left"
        onClick={onSelect}
      >
        {/* Step number + icon */}
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            config.color,
          )}
        >
          {config.icon}
        </div>

        {/* Label + preview */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-muted-foreground">
              STEP {index + 1}
            </span>
            <span className="text-xs font-medium">{config.label}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{preview}</p>
        </div>
      </button>

      {/* Delete button */}
      <button
        className="flex items-center px-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <TrashIcon className="size-3.5" />
      </button>
    </div>
  )
}

interface SequenceBuilderProps {
  steps: LocalStep[]
  selectedStepId: string | null
  onSelectStep: (id: string | null) => void
  onAddStep: (type: SequenceStepType, afterIndex: number) => void
  onRemoveStep: (stepId: string) => void
  onReorderSteps: (steps: LocalStep[]) => void
}

export function SequenceBuilder({
  steps,
  selectedStepId,
  onSelectStep,
  onAddStep,
  onRemoveStep,
  onReorderSteps,
}: SequenceBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = steps.findIndex((s) => s.id === active.id)
      const newIndex = steps.findIndex((s) => s.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = [...steps]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)
      onReorderSteps(reordered)
    },
    [steps, onReorderSteps],
  )

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      {/* Start marker */}
      <div className="mb-2 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <div className="size-2 rounded-full bg-green-500" />
          Sequence Start
        </div>
      </div>

      {/* Add button before first step */}
      <div className="relative flex flex-col items-center">
        <AddStepButton afterIndex={-1} onAdd={onAddStep} />
      </div>

      {/* Steps timeline */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={steps.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col">
            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col">
                {/* Connector line above (except first) */}
                {index > 0 && (
                  <div className="flex justify-center">
                    <div className="h-2 w-px bg-border" />
                  </div>
                )}

                <SortableStepCard
                  step={step}
                  index={index}
                  isSelected={selectedStepId === step.id}
                  onSelect={() =>
                    onSelectStep(selectedStepId === step.id ? null : step.id)
                  }
                  onRemove={() => onRemoveStep(step.id)}
                />

                {/* Add step button between steps */}
                <div className="relative flex flex-col items-center">
                  <AddStepButton afterIndex={index} onAdd={onAddStep} />
                </div>
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {steps.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <ClockIcon className="size-8" />
          <p className="text-sm">No steps yet. Click + to add your first step.</p>
        </div>
      )}

      {/* End marker */}
      <div className="mt-2 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <div className="size-2 rounded-full bg-red-500" />
          Sequence End
        </div>
      </div>
    </div>
  )
}
