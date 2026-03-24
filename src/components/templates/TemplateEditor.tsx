"use client"

import { useCallback, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { VariableInserter } from "@/components/templates/VariableInserter"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import type { Template } from "@/types/database"
import type { TemplateCategory } from "@/hooks/useTemplates"

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  connection_request: "Connection Request",
  message: "Message",
  follow_up: "Follow-up",
}

interface TemplateEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: Template | null
  onSave: (data: {
    name: string
    category: TemplateCategory
    body: string
  }) => Promise<void>
  saving: boolean
}

export function TemplateEditor({
  open,
  onOpenChange,
  template,
  onSave,
  saving,
}: TemplateEditorProps) {
  const [name, setName] = useState(template?.name ?? "")
  const [category, setCategory] = useState<TemplateCategory>(
    (template?.category as TemplateCategory) ?? "message"
  )
  const [body, setBody] = useState(template?.body ?? "")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isEditing = template !== null
  const charLimit = category === "connection_request" ? 300 : null
  const isOverLimit = charLimit !== null && body.length > charLimit

  // Extract variables from body
  const detectedVariables = [...new Set(
    (body.match(/\{\{(\w+)\}\}/g) ?? []).map((v) => v.replace(/\{\{|\}\}/g, ""))
  )]

  // Reset form when template changes
  const resetForm = useCallback((t: Template | null) => {
    setName(t?.name ?? "")
    setCategory((t?.category as TemplateCategory) ?? "message")
    setBody(t?.body ?? "")
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        resetForm(template)
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetForm, template]
  )

  const handleInsertVariable = useCallback((variable: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setBody((prev) => prev + variable)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = body.slice(0, start)
    const after = body.slice(end)
    const newBody = before + variable + after
    setBody(newBody)

    // Restore cursor after the inserted variable
    requestAnimationFrame(() => {
      const cursorPos = start + variable.length
      textarea.focus()
      textarea.setSelectionRange(cursorPos, cursorPos)
    })
  }, [body])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !body.trim() || isOverLimit) return
    await onSave({ name: name.trim(), category, body })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Template" : "New Template"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update your message template."
              : "Create a reusable message template with personalization variables."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              placeholder="e.g. Initial Outreach — Oncologist"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Category */}
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(val) => setCategory(val as TemplateCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="connection_request">
                  Connection Request
                </SelectItem>
                <SelectItem value="message">
                  Message
                </SelectItem>
                <SelectItem value="follow_up">
                  Follow-up
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Body with variable inserter */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="template-body">Body</Label>
              <VariableInserter onInsert={handleInsertVariable} />
            </div>
            <Textarea
              ref={textareaRef}
              id="template-body"
              placeholder="Hi {{first_name}}, I came across your work at {{company}}..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-40"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-1">
                {detectedVariables.length > 0 ? (
                  detectedVariables.map((v) => (
                    <Badge key={v} variant="secondary" className="text-[10px]">
                      {v}
                    </Badge>
                  ))
                ) : (
                  <span>No variables detected</span>
                )}
              </div>
              <span className={isOverLimit ? "text-destructive font-medium" : ""}>
                {body.length}
                {charLimit !== null && `/${charLimit}`}
              </span>
            </div>
            {isOverLimit && (
              <p className="text-xs text-destructive">
                Connection requests are limited to {charLimit} characters.
              </p>
            )}
          </div>

          {/* Preview */}
          {body.trim() && (
            <div className="grid gap-1.5">
              <Label>Preview</Label>
              <div className="rounded-lg border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                {body
                  .replace(/\{\{first_name\}\}/g, "Rahul")
                  .replace(/\{\{last_name\}\}/g, "Sharma")
                  .replace(/\{\{company\}\}/g, "Apollo Hospitals")
                  .replace(/\{\{specialty\}\}/g, "Medical Oncology")
                  .replace(/\{\{city\}\}/g, "Mumbai")
                  .replace(/\{\{title\}\}/g, "Consultant Medical Oncologist")}
              </div>
            </div>
          )}
        </form>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !body.trim() || isOverLimit}
          >
            {saving ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
