"use client"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { BracesIcon } from "lucide-react"
import { useState } from "react"

import { SELECTABLE_TEMPLATE_VARIABLES } from "@/constants/templateVariables"

interface VariableInserterProps {
  onInsert: (variable: string) => void
}

export function VariableInserter({ onInsert }: VariableInserterProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" type="button" />
        }
      >
        <BracesIcon className="size-3.5" />
        Insert Variable
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="grid gap-0.5">
          {SELECTABLE_TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.name}
              type="button"
              className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm hover:bg-muted transition-colors text-left"
              onClick={() => {
                onInsert(`{{${v.name}}}`)
                setOpen(false)
              }}
            >
              <span className="font-medium">{v.label}</span>
              <code className="text-xs text-muted-foreground">
                {`{{${v.name}}}`}
              </code>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
