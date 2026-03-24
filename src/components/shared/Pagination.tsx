"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

interface PaginationProps {
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
}

function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const clampedPage = Math.min(page, totalPages)

  const getVisiblePages = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const pages: (number | "ellipsis")[] = [1]

    if (clampedPage > 3) {
      pages.push("ellipsis")
    }

    const start = Math.max(2, clampedPage - 1)
    const end = Math.min(totalPages - 1, clampedPage + 1)

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (clampedPage < totalPages - 2) {
      pages.push("ellipsis")
    }

    pages.push(totalPages)
    return pages
  }

  const rangeStart = totalItems === 0 ? 0 : (clampedPage - 1) * pageSize + 1
  const rangeEnd = Math.min(clampedPage * pageSize, totalItems)

  return (
    <div
      data-slot="pagination"
      className={cn(
        "flex flex-col items-center justify-between gap-3 sm:flex-row",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {rangeStart}–{rangeEnd} of {totalItems}
        </span>
        <Select
          value={pageSize}
          onValueChange={(value) => {
            onPageSizeChange(value as number)
            onPageChange(1)
          }}
        >
          <SelectTrigger size="sm" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={size}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(clampedPage - 1)}
          disabled={clampedPage <= 1}
        >
          <ChevronLeftIcon />
          <span className="sr-only">Previous page</span>
        </Button>

        {getVisiblePages().map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="flex size-7 items-center justify-center text-sm text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <Button
              key={item}
              variant={item === clampedPage ? "default" : "outline"}
              size="icon-sm"
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(clampedPage + 1)}
          disabled={clampedPage >= totalPages}
        >
          <ChevronRightIcon />
          <span className="sr-only">Next page</span>
        </Button>
      </div>
    </div>
  )
}

export { Pagination }
