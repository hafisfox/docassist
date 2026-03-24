"use client"

import { useRouter } from "next/navigation"
import type { Lead } from "@/types/database"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDistanceToNow } from "date-fns"
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  MoreHorizontalIcon,
  ExternalLinkIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react"

interface LeadTableProps {
  leads: Lead[]
  loading: boolean
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  sortBy: string
  sortOrder: "asc" | "desc"
  onSort: (column: string) => void
  onDelete: (lead: Lead) => void
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function SortableHeader({
  column,
  label,
  currentSortBy,
  currentSortOrder,
  onSort,
}: {
  column: string
  label: string
  currentSortBy: string
  currentSortOrder: "asc" | "desc"
  onSort: (column: string) => void
}) {
  const isActive = currentSortBy === column

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => onSort(column)}
    >
      {label}
      {isActive ? (
        currentSortOrder === "asc" ? (
          <ArrowUpIcon className="size-3.5" />
        ) : (
          <ArrowDownIcon className="size-3.5" />
        )
      ) : (
        <ArrowUpDownIcon className="size-3.5 opacity-50" />
      )}
    </button>
  )
}

function LoadingSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Skeleton className="h-4 w-4" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-24" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-20" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-20" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-20" />
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-4" />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-28" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-6 w-6" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function LeadTable({
  leads,
  loading,
  selectedIds,
  onSelectionChange,
  sortBy,
  sortOrder,
  onSort,
  onDelete,
}: LeadTableProps) {
  const router = useRouter()

  const allSelected =
    leads.length > 0 && leads.every((l) => selectedIds.has(l.id))
  const someSelected = leads.some((l) => selectedIds.has(l.id))

  const toggleAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(new Set(leads.map((l) => l.id)))
    } else {
      onSelectionChange(new Set())
    }
  }

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds)
    if (checked) {
      next.add(id)
    } else {
      next.delete(id)
    }
    onSelectionChange(next)
  }

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onCheckedChange={(checked) => toggleAll(checked as boolean)}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column="first_name"
              label="Name"
              currentSortBy={sortBy}
              currentSortOrder={sortOrder}
              onSort={onSort}
            />
          </TableHead>
          <TableHead>Title</TableHead>
          <TableHead>
            <SortableHeader
              column="company"
              label="Company"
              currentSortBy={sortBy}
              currentSortOrder={sortOrder}
              onSort={onSort}
            />
          </TableHead>
          <TableHead>Location</TableHead>
          <TableHead>
            <SortableHeader
              column="status"
              label="Status"
              currentSortBy={sortBy}
              currentSortOrder={sortOrder}
              onSort={onSort}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column="last_contacted_at"
              label="Last Contacted"
              currentSortBy={sortBy}
              currentSortOrder={sortOrder}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow
            key={lead.id}
            data-state={selectedIds.has(lead.id) ? "selected" : undefined}
            className="cursor-pointer"
            onClick={() => router.push(`/leads/${lead.id}`)}
          >
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedIds.has(lead.id)}
                onCheckedChange={(checked) =>
                  toggleOne(lead.id, checked as boolean)
                }
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  {lead.linkedin_profile_picture_url && (
                    <AvatarImage
                      src={lead.linkedin_profile_picture_url}
                      alt={lead.full_name}
                    />
                  )}
                  <AvatarFallback>
                    {getInitials(lead.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-medium">{lead.full_name}</div>
                  {lead.headline && (
                    <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {lead.headline}
                    </div>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground">
                {lead.job_title || "\u2014"}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground">
                {lead.company || "\u2014"}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground">
                {lead.location || "\u2014"}
              </span>
            </TableCell>
            <TableCell>
              <StatusBadge type="lead" status={lead.status} />
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground">
                {lead.last_contacted_at
                  ? formatDistanceToNow(new Date(lead.last_contacted_at), {
                      addSuffix: true,
                    })
                  : "Never"}
              </span>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-xs" />}
                >
                  <MoreHorizontalIcon />
                  <span className="sr-only">Actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <ExternalLinkIcon />
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push(`/leads/${lead.id}/edit`)}
                  >
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(lead)}
                  >
                    <TrashIcon />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export { LeadTable }
