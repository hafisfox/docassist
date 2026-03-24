"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useLeads } from "@/hooks/useLeads"
import type { Lead, LeadStatus } from "@/types/database"
import { SearchInput } from "@/components/shared/SearchInput"
import { Pagination } from "@/components/shared/Pagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { LeadFilters } from "@/components/leads/LeadFilters"
import { LeadTable } from "@/components/leads/LeadTable"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  UsersIcon,
  PlusIcon,
  SearchIcon,
  DownloadIcon,
  TrashIcon,
  TagIcon,
  FolderIcon,
} from "lucide-react"

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
  const { leads, pagination, loading, error, fetchLeads, deleteLead } =
    useLeads()

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Campaigns for filter dropdown
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

  // Fetch leads whenever URL params change
  const searchParamsString = searchParams.toString()
  useEffect(() => {
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
    // Pass single status to API; multi-status requires API update
    if (status && !status.includes(",")) apiFilters.status = status
    if (campaignId) apiFilters.campaign_id = campaignId
    if (icpSegment) apiFilters.icp_segment = icpSegment
    if (location) apiFilters.location = location

    fetchLeads(apiFilters)
  }, [searchParamsString, fetchLeads])

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

  // ── Computed values ──────────────────────────────────────────────────

  const activeFilterCount =
    filters.statuses.length +
    (filters.icpSegment ? 1 : 0) +
    (filters.location ? 1 : 0) +
    (filters.hospitalType ? 1 : 0) +
    (filters.campaignId ? 1 : 0)

  const selectedLeads = leads.filter((l) => selectedIds.has(l.id))

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
            <Button variant="outline" size="xs">
              <FolderIcon className="size-3" />
              Add to Campaign
            </Button>
            <Button variant="outline" size="xs">
              <TagIcon className="size-3" />
              Change Status
            </Button>
            <Button variant="outline" size="xs">
              <DownloadIcon className="size-3" />
              Export Selected
            </Button>
            <Button
              variant="destructive"
              size="xs"
              onClick={() => {
                if (selectedLeads.length === 1) {
                  setDeleteTarget(selectedLeads[0])
                } else {
                  toast.info(
                    `Bulk delete for ${selectedIds.size} leads — coming soon`
                  )
                }
              }}
            >
              <TrashIcon className="size-3" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
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

      {/* Delete Confirmation */}
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
    <Suspense fallback={<LeadsPageFallback />}>
      <LeadsContent />
    </Suspense>
  )
}
