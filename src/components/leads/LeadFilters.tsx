"use client"

import type { LeadStatus, IcpSegment } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { TARGET_LOCATIONS } from "@/constants/icp"
import { ListFilterIcon, XIcon } from "lucide-react"

const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "enriched",
  "invite_sent",
  "invite_accepted",
  "invite_expired",
  "message_sent",
  "replied",
  "interested",
  "not_interested",
  "meeting_booked",
  "converted",
  "do_not_contact",
]

const ICP_SEGMENTS: { value: IcpSegment; label: string }[] = [
  { value: "high_volume_chemo", label: "High-Volume Chemo" },
  { value: "precision_oncology", label: "Precision Oncology" },
  { value: "insurance_heavy_urban", label: "Insurance-Heavy Urban" },
]

const HOSPITAL_TYPES = [
  { value: "corporate_chain", label: "Corporate Chain" },
  { value: "cancer_center", label: "Cancer Center" },
  { value: "uae_hospital", label: "UAE Hospital" },
]

interface Campaign {
  id: string
  name: string
}

interface LeadFiltersProps {
  statuses: LeadStatus[]
  icpSegment: string
  location: string
  hospitalType: string
  campaignId: string
  campaigns: Campaign[]
  onStatusChange: (statuses: LeadStatus[]) => void
  onIcpSegmentChange: (segment: string) => void
  onLocationChange: (location: string) => void
  onHospitalTypeChange: (type: string) => void
  onCampaignChange: (id: string) => void
  onClearAll: () => void
  activeFilterCount: number
}

function LeadFilters({
  statuses,
  icpSegment,
  location,
  hospitalType,
  campaignId,
  campaigns,
  onStatusChange,
  onIcpSegmentChange,
  onLocationChange,
  onHospitalTypeChange,
  onCampaignChange,
  onClearAll,
  activeFilterCount,
}: LeadFiltersProps) {
  const toggleStatus = (status: LeadStatus, checked: boolean) => {
    if (checked) {
      onStatusChange([...statuses, status])
    } else {
      onStatusChange(statuses.filter((s) => s !== status))
    }
  }

  return (
    <div data-slot="lead-filters" className="flex flex-wrap items-center gap-2">
      {/* Status Multi-Select */}
      <Popover>
        <PopoverTrigger
          render={<Button variant="outline" size="sm" />}
        >
          <ListFilterIcon className="size-3.5" />
          Status
          {statuses.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
              {statuses.length}
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1.5">
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {LEAD_STATUSES.map((status) => (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <Checkbox
                  checked={statuses.includes(status)}
                  onCheckedChange={(checked) =>
                    toggleStatus(status, checked as boolean)
                  }
                />
                <StatusBadge type="lead" status={status} />
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* ICP Segment */}
      <Select
        value={icpSegment || "__all__"}
        onValueChange={(val) =>
          onIcpSegmentChange(val === "__all__" ? "" : (val as string))
        }
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Segments</SelectItem>
          {ICP_SEGMENTS.map((seg) => (
            <SelectItem key={seg.value} value={seg.value}>
              {seg.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Location */}
      <Select
        value={location || "__all__"}
        onValueChange={(val) =>
          onLocationChange(val === "__all__" ? "" : (val as string))
        }
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Locations</SelectItem>
          {TARGET_LOCATIONS.map((loc) => (
            <SelectItem key={loc} value={loc}>
              {loc}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Hospital Type */}
      <Select
        value={hospitalType || "__all__"}
        onValueChange={(val) =>
          onHospitalTypeChange(val === "__all__" ? "" : (val as string))
        }
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Hospital Types</SelectItem>
          {HOSPITAL_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Campaign */}
      {campaigns.length > 0 && (
        <Select
          value={campaignId || "__all__"}
          onValueChange={(val) =>
            onCampaignChange(val === "__all__" ? "" : (val as string))
          }
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Clear All */}
      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          <XIcon className="size-3.5" />
          Clear all
        </Button>
      )}
    </div>
  )
}

export { LeadFilters }
