"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useLeads } from "@/hooks/useLeads"
import type { Lead, LeadStatus } from "@/types/database"
import { SearchInput } from "@/components/shared/SearchInput"
import { Pagination } from "@/components/shared/Pagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { ErrorState } from "@/components/shared/ErrorState"
import { LeadFilters } from "@/components/leads/LeadFilters"
import { LeadTable } from "@/components/leads/LeadTable"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  UsersIcon,
  PlusIcon,
  DownloadIcon,
  TrashIcon,
  TagIcon,
  FolderIcon,
  ChevronDownIcon,
} from "lucide-react"

// Statuses that make sense to set manually
const MANUAL_STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "enriched", label: "Enriched" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "meeting_booked", label: "Meeting Booked" },
  { value: "converted", label: "Converted" },
  { value: "do_not_contact", label: "Do Not Contact" },
]

function LeadsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Parse filters from URL
  const filters = useMemo(
    () => ({
      search: searchParams.get("search") || "",
      statuses: (searchParams.get("status") || "")
        .split(",")
        .filter(Boolean) as LeadStatus[],
      campaignId: searchParams.get("campaign_id") || "",
      icpSegment: searchParams.get("icp_segment") || "",
      location: searchParams.get("location") || "",
      hospitalType: searchParams.get("hospital_type") || "",
      sortBy: searchParams.get("sort_by") || "created_at",
      sortOrder: (searchParams.get("sort_order") || "desc") as "asc" | "desc",
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 25,
    }),
    [searchParams]
  )

  // Data fetching
  const { leads, pagination, loading, error, fetchLeads, deleteLead, bulkAction, exportLeads } =
    useLeads()

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Bulk delete confirmation
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  // Campaigns for filter dropdown and bulk "add to campaign"
  const [campaigns, setCampaigns] = useState<
    Array<{ id: string; name: string }>
  >([])

  // Update URL params helper
  const updateParams = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== 0
        ) {
          params.set(key, String(value))
        } else {
          params.delete(key)
        }
      })
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [searchParams, router, pathname]
  )

  // Rebuild API filters from current URL params (used to refetch after mutations)
  const searchParamsString = searchParams.toString()

  const buildApiFilters = useCallback(() => {
    const params = new URLSearchParams(searchParamsString)
    const apiFilters: Record<string, string | number> = {
      page: Number(params.get("page")) || 1,
      limit: Number(params.get("limit")) || 25,
      sort_by: params.get("sort_by") || "created_at",
      sort_order: params.get("sort_order") || "desc",
    }
    const search = params.get("search")
    const status = params.get("status")
    const campaignId = params.get("campaign_id")
    const icpSegment = params.get("icp_segment")
    const location = params.get("location")
    if (search) apiFilters.search = search
    if (status && !status.includes(",")) apiFilters.status = status
    if (campaignId) apiFilters.campaign_id = campaignId
    if (icpSegment) apiFilters.icp_segment = icpSegment
    if (location) apiFilters.location = location
    return apiFilters
  }, [searchParamsString])

  // Fetch leads whenever URL params change
  useEffect(() => {
    fetchLeads(buildApiFilters())
  }, [searchParamsString, fetchLeads, buildApiFilters])

  // Fetch campaigns on mount
  useEffect(() => {
    fetch("/api/campaigns")
      .then((res) => (res.ok ? res.json() : { campaigns: [] }))
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch(() => {})
  }, [])

  // Clear selection when leads data changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [leads])

  // ── Filter change handlers ───────────────────────────────────────────

  const handleSearch = useCallback(
    (value: string) => {
      updateParams({ search: value || undefined, page: undefined })
    },
    [updateParams]
  )

  const handleStatusChange = useCallback(
    (statuses: LeadStatus[]) => {
      updateParams({
        status: statuses.length > 0 ? statuses.join(",") : undefined,
        page: undefined,
      })
    },
    [updateParams]
  )

  const handleSort = useCallback(
    (column: string) => {
      if (filters.sortBy === column) {
        updateParams({
          sort_order: filters.sortOrder === "asc" ? "desc" : "asc",
        })
      } else {
        updateParams({ sort_by: column, sort_order: "asc" })
      }
    },
    [filters.sortBy, filters.sortOrder, updateParams]
  )

  const handlePageChange = useCallback(
    (page: number) => {
      updateParams({ page })
    },
    [updateParams]
  )

  const handlePageSizeChange = useCallback(
    (limit: number) => {
      updateParams({ limit, page: undefined })
    },
    [updateParams]
  )

  const handleClearFilters = useCallback(() => {
    router.push(pathname, { scroll: false })
  }, [router, pathname])

  // ── Single delete ────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteLead(deleteTarget.id)
      toast.success(`${deleteTarget.full_name} deleted`)
      setDeleteTarget(null)
    } catch {
      toast.error("Failed to delete lead")
    } finally {
      setDeleting(false)
    }
  }

  // ── Bulk action handlers ─────────────────────────────────────────────

  const handleBulkChangeStatus = async (status: LeadStatus) => {
    setBulkLoading(true)
    try {
      const result = await bulkAction(Array.from(selectedIds), "change_status", { status })
      toast.success(`${result.updated} lead${result.updated !== 1 ? "s" : ""} updated to "${status}"`)
      setSelectedIds(new Set())
      fetchLeads(buildApiFilters())
    } catch {
      toast.error("Failed to change status")
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkAddToCampaign = async (campaignId: string) => {
    setBulkLoading(true)
    try {
      const result = await bulkAction(Array.from(selectedIds), "add_to_campaign", { campaign_id: campaignId })
      const campaign = campaigns.find((c) => c.id === campaignId)
      toast.success(`${result.updated} lead${result.updated !== 1 ? "s" : ""} added to ${campaign?.name ?? "campaign"}`)
      setSelectedIds(new Set())
      fetchLeads(buildApiFilters())
    } catch {
      toast.error("Failed to add leads to campaign")
    } finally {
      setBulkLoading(false)
    }
  }

  const handleExportSelected = async () => {
    setBulkLoading(true)
    try {
      await exportLeads({ ids: Array.from(selectedIds) })
      toast.success("Export downloaded")
    } catch {
      toast.error("Export failed")
    } finally {
      setBulkLoading(false)
    }
  }

  const handleExportAll = async () => {
    try {
      await exportLeads({
        status: filters.statuses.length === 1 ? filters.statuses[0] : undefined,
        campaign_id: filters.campaignId || undefined,
        search: filters.search || undefined,
      })
      toast.success("Export downloaded")
    } catch {
      toast.error("Export failed")
    }
  }

  const handleBulkDelete = async () => {
    setBulkLoading(true)
    try {
      const result = await bulkAction(Array.from(selectedIds), "delete")
      toast.success(`${result.updated} lead${result.updated !== 1 ? "s" : ""} deleted`)
      setSelectedIds(new Set())
      setBulkDeleteConfirm(false)
      fetchLeads(buildApiFilters())
    } catch {
      toast.error("Failed to delete leads")
    } finally {
      setBulkLoading(false)
    }
  }

  // ── Computed values ──────────────────────────────────────────────────

  const activeFilterCount =
    filters.statuses.length +
    (filters.icpSegment ? 1 : 0) +
    (filters.location ? 1 : 0) +
    (filters.hospitalType ? 1 : 0) +
    (filters.campaignId ? 1 : 0)

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {pagination
              ? `${pagination.total} total leads`
              : "Manage your outreach leads"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAll}
          >
            <DownloadIcon className="size-3.5" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/leads/import")}
          >
            <DownloadIcon className="size-3.5" />
            Import Leads
          </Button>
          <Button size="sm" onClick={() => router.push("/leads/new")}>
            <PlusIcon className="size-3.5" />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3">
        <SearchInput
          value={filters.search}
          onChange={handleSearch}
          placeholder="Search leads by name, company, title..."
          className="max-w-sm"
        />
        <LeadFilters
          statuses={filters.statuses}
          icpSegment={filters.icpSegment}
          location={filters.location}
          hospitalType={filters.hospitalType}
          campaignId={filters.campaignId}
          campaigns={campaigns}
          onStatusChange={handleStatusChange}
          onIcpSegmentChange={(val) =>
            updateParams({ icp_segment: val || undefined, page: undefined })
          }
          onLocationChange={(val) =>
            updateParams({ location: val || undefined, page: undefined })
          }
          onHospitalTypeChange={(val) =>
            updateParams({ hospital_type: val || undefined, page: undefined })
          }
          onCampaignChange={(val) =>
            updateParams({ campaign_id: val || undefined, page: undefined })
          }
          onClearAll={handleClearFilters}
          activeFilterCount={activeFilterCount}
        />
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="ml-2 flex items-center gap-1.5">
            {/* Add to Campaign */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="xs" disabled={bulkLoading}>
                    <FolderIcon className="size-3" />
                    Add to Campaign
                    <ChevronDownIcon className="size-3" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start">
                {campaigns.length > 0 ? (
                  campaigns.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => handleBulkAddToCampaign(c.id)}
                    >
                      {c.name}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>No campaigns found</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Change Status */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="xs" disabled={bulkLoading}>
                    <TagIcon className="size-3" />
                    Change Status
                    <ChevronDownIcon className="size-3" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start">
                {MANUAL_STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => handleBulkChangeStatus(opt.value)}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export Selected */}
            <Button
              variant="outline"
              size="xs"
              onClick={handleExportSelected}
              disabled={bulkLoading}
            >
              <DownloadIcon className="size-3" />
              Export Selected
            </Button>

            {/* Delete */}
            <Button
              variant="destructive"
              size="xs"
              disabled={bulkLoading}
              onClick={() => setBulkDeleteConfirm(true)}
            >
              <TrashIcon className="size-3" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <ErrorState
          title="Failed to load leads"
          message={error}
          onRetry={() => fetchLeads({})}
        />
      )}

      {/* Table or Empty State */}
      {!loading && leads.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="No leads found"
          description={
            activeFilterCount > 0 || filters.search
              ? "Try adjusting your filters or search query."
              : "Get started by searching LinkedIn or adding leads manually."
          }
          action={
            activeFilterCount > 0 || filters.search
              ? { label: "Clear filters", onClick: handleClearFilters }
              : {
                  label: "Search LinkedIn",
                  onClick: () => router.push("/leads/search"),
                }
          }
        />
      ) : (
        <LeadTable
          leads={leads}
          loading={loading}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          sortBy={filters.sortBy}
          sortOrder={filters.sortOrder}
          onSort={handleSort}
          onDelete={setDeleteTarget}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <Pagination
          page={filters.page}
          pageSize={filters.limit}
          totalItems={pagination.total}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {/* Single Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete lead"
        description={`Are you sure you want to delete ${deleteTarget?.full_name}? This action cannot be undone.`}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel="Delete"
        loading={deleting}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteConfirm(false)
        }}
        title={`Delete ${selectedIds.size} lead${selectedIds.size !== 1 ? "s" : ""}`}
        description={`Are you sure you want to delete ${selectedIds.size} lead${selectedIds.size !== 1 ? "s" : ""}? They will be marked as Do Not Contact.`}
        onConfirm={handleBulkDelete}
        variant="destructive"
        confirmLabel="Delete All"
        loading={bulkLoading}
      />
    </div>
  )
}

function LeadsPageFallback() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-8 w-full max-w-xl" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export default function LeadsPage() {
  return (
    <ErrorBoundary section="Leads">
      <Suspense fallback={<LeadsPageFallback />}>
        <LeadsContent />
      </Suspense>
    </ErrorBoundary>
  )
}
