"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useTemplates, type TemplateCategory } from "@/hooks/useTemplates"
import type { Template } from "@/types/database"
import { TemplateEditor } from "@/components/templates/TemplateEditor"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { toast } from "sonner"
import {
  FileTextIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  SparklesIcon,
} from "lucide-react"

const CATEGORIES: { value: TemplateCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "connection_request", label: "Connection Request" },
  { value: "message", label: "Message" },
  { value: "follow_up", label: "Follow-up" },
]

const CATEGORY_LABELS: Record<string, string> = {
  connection_request: "Connection Request",
  message: "Message",
  follow_up: "Follow-up",
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: Template
  onEdit: (t: Template) => void
  onDelete: (t: Template) => void
}) {
  const preview = template.body.length > 120
    ? template.body.slice(0, 120) + "..."
    : template.body

  return (
    <Card className="group flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium">
              {template.name}
            </h3>
            {template.is_ai_generated && (
              <SparklesIcon className="size-3.5 shrink-0 text-amber-500" />
            )}
          </div>
          <Badge variant="secondary" className="mt-1 text-[10px]">
            {CATEGORY_LABELS[template.category] ?? template.category}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(template)}
          >
            <PencilIcon className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(template)}
          >
            <TrashIcon className="size-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
        {preview}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-1">
          {template.variables.map((v) => (
            <Badge key={v} variant="outline" className="text-[10px]">
              {`{{${v}}}`}
            </Badge>
          ))}
        </div>
        {template.performance_score !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">
            Score: {template.performance_score}%
          </span>
        )}
      </div>
    </Card>
  )
}

function TemplatesContent() {
  const {
    templates,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useTemplates()

  const [activeTab, setActiveTab] = useState<TemplateCategory | "all">("all")
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch on mount and tab change
  useEffect(() => {
    const category = activeTab === "all" ? undefined : activeTab
    fetchTemplates(category)
  }, [activeTab, fetchTemplates])

  const handleCreate = useCallback(() => {
    setEditingTemplate(null)
    setEditorOpen(true)
  }, [])

  const handleEdit = useCallback((template: Template) => {
    setEditingTemplate(template)
    setEditorOpen(true)
  }, [])

  const handleSave = useCallback(
    async (data: { name: string; category: TemplateCategory; body: string }) => {
      setSaving(true)
      try {
        if (editingTemplate) {
          await updateTemplate(editingTemplate.id, data)
          toast.success("Template updated")
        } else {
          await createTemplate(data)
          toast.success("Template created")
        }
        setEditorOpen(false)
      } catch {
        toast.error(
          editingTemplate
            ? "Failed to update template"
            : "Failed to create template"
        )
      } finally {
        setSaving(false)
      }
    },
    [editingTemplate, createTemplate, updateTemplate]
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTemplate(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch {
      toast.error("Failed to delete template")
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, deleteTemplate])

  const filteredTemplates = templates

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Templates</h1>
          <p className="text-sm text-muted-foreground">
            {templates.length > 0
              ? `${templates.length} template${templates.length !== 1 ? "s" : ""}`
              : "Create reusable message templates for outreach"}
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <PlusIcon className="size-3.5" />
          New Template
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Category Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as TemplateCategory | "all")}
      >
        <TabsList>
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat.value} value={cat.value}>
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map((cat) => (
          <TabsContent key={cat.value} value={cat.value}>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <EmptyState
                icon={<FileTextIcon />}
                title="No templates yet"
                description={
                  cat.value === "all"
                    ? "Create your first message template to get started with outreach."
                    : `No ${cat.label.toLowerCase()} templates found. Create one to get started.`
                }
                action={{ label: "New Template", onClick: handleCreate }}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onEdit={handleEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Editor Side Panel */}
      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTemplate}
        onSave={handleSave}
        saving={saving}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete template"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  )
}

function TemplatesPageFallback() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-7 w-32" />
      </div>
      <Skeleton className="h-8 w-80" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<TemplatesPageFallback />}>
      <TemplatesContent />
    </Suspense>
  )
}
