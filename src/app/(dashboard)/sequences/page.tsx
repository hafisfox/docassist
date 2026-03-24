"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSequences, type SequenceWithMeta } from "@/hooks/useSequences"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  GitBranchIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  LayersIcon,
  UsersIcon,
  StarIcon,
} from "lucide-react"

const STEP_TYPE_LABELS: Record<string, string> = {
  connection_request: "Connection Request",
  wait_for_acceptance: "Wait for Acceptance",
  message: "Message",
  delay: "Delay",
  condition: "Condition",
}

function SequenceCard({
  sequence,
  onClick,
  onDelete,
}: {
  sequence: SequenceWithMeta
  onClick: () => void
  onDelete: (s: SequenceWithMeta) => void
}) {
  return (
    <Card
      className="group flex cursor-pointer flex-col gap-3 p-4 transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium">{sequence.name}</h3>
            {sequence.is_default && (
              <StarIcon className="size-3.5 shrink-0 fill-amber-500 text-amber-500" />
            )}
          </div>
          {sequence.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {sequence.description}
            </p>
          )}
        </div>
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(sequence)
            }}
          >
            <TrashIcon className="size-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <LayersIcon className="size-3.5" />
          {sequence.step_count} step{sequence.step_count !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <UsersIcon className="size-3.5" />
          {sequence.usage_count} enrolled
        </span>
      </div>
    </Card>
  )
}

function SequencesContent() {
  const router = useRouter()
  const {
    sequences,
    loading,
    error,
    fetchSequences,
    createSequence,
    deleteSequence,
  } = useSequences()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SequenceWithMeta | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchSequences()
  }, [fetchSequences])

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const seq = await createSequence({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      })
      toast.success("Sequence created")
      setCreateOpen(false)
      setNewName("")
      setNewDescription("")
      router.push(`/sequences/${seq.id}`)
    } catch {
      toast.error("Failed to create sequence")
    } finally {
      setCreating(false)
    }
  }, [newName, newDescription, createSequence, router])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSequence(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch {
      toast.error("Failed to delete sequence")
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, deleteSequence])

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Sequences</h1>
          <p className="text-sm text-muted-foreground">
            {sequences.length > 0
              ? `${sequences.length} sequence${sequences.length !== 1 ? "s" : ""}`
              : "Build multi-step outreach sequences"}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-3.5" />
          New Sequence
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <EmptyState
          icon={<GitBranchIcon />}
          title="No sequences yet"
          description="Create your first outreach sequence to automate multi-step LinkedIn campaigns."
          action={{ label: "New Sequence", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sequences.map((seq) => (
            <SequenceCard
              key={seq.id}
              sequence={seq}
              onClick={() => router.push(`/sequences/${seq.id}`)}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Sequence</DialogTitle>
            <DialogDescription>
              Create a multi-step outreach sequence for LinkedIn campaigns.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="seq-name">Name</Label>
              <Input
                id="seq-name"
                placeholder="e.g. Oncologist Outreach — Phase 1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={100}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seq-description">Description (optional)</Label>
              <Textarea
                id="seq-description"
                placeholder="Describe this sequence..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={500}
                className="min-h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete sequence"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will also remove all steps. This action cannot be undone.`}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  )
}

function SequencesPageFallback() {
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
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function SequencesPage() {
  return (
    <Suspense fallback={<SequencesPageFallback />}>
      <SequencesContent />
    </Suspense>
  )
}
