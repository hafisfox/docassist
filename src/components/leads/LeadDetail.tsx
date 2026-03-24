"use client";

import { useState } from "react";
import {
  MapPinIcon,
  BriefcaseIcon,
  BuildingIcon,
  ExternalLinkIcon,
  XIcon,
  PlusIcon,
  StarIcon,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead, IcpSegment } from "@/types/database";

interface LeadDetailProps {
  lead: Lead | null;
  loading: boolean;
  onUpdateTags: (tags: string[]) => void;
  onUpdateNotes: (notes: string) => void;
}

const icpSegmentLabels: Record<IcpSegment, string> = {
  high_volume_chemo: "High-Volume Chemo",
  precision_oncology: "Precision Oncology",
  insurance_heavy_urban: "Insurance-Heavy Urban",
};

const icpSegmentColors: Record<IcpSegment, string> = {
  high_volume_chemo: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  precision_oncology: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  insurance_heavy_urban: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

function LeadDetailSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );
}

function LeadDetail({ lead, loading, onUpdateTags, onUpdateNotes }: LeadDetailProps) {
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [notesChanged, setNotesChanged] = useState(false);

  if (loading || !lead) {
    return <LeadDetailSkeleton />;
  }

  const initials = `${lead.first_name?.[0] ?? ""}${lead.last_name?.[0] ?? ""}`.toUpperCase();
  const currentNotes = notes ?? lead.notes ?? "";

  function handleAddTag() {
    if (!lead) return;
    const tag = tagInput.trim();
    if (!tag || lead.tags.includes(tag)) return;
    onUpdateTags([...lead.tags, tag]);
    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    if (!lead) return;
    onUpdateTags(lead.tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }

  function handleSaveNotes() {
    onUpdateNotes(currentNotes);
    setNotesChanged(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar className="size-20">
            {lead.linkedin_profile_picture_url && (
              <AvatarImage
                src={lead.linkedin_profile_picture_url}
                alt={lead.full_name}
              />
            )}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-semibold">{lead.full_name}</h2>
            {lead.headline && (
              <p className="text-sm text-muted-foreground">{lead.headline}</p>
            )}
          </div>
          <StatusBadge type="lead" status={lead.status} />
        </div>

        {/* Details */}
        <div className="space-y-2.5 text-sm">
          {lead.job_title && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <BriefcaseIcon className="size-4 shrink-0" />
              <span>{lead.job_title}</span>
            </div>
          )}
          {lead.company && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <BuildingIcon className="size-4 shrink-0" />
              <span>{lead.company}</span>
            </div>
          )}
          {lead.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPinIcon className="size-4 shrink-0" />
              <span>{lead.location}</span>
            </div>
          )}
          {lead.linkedin_profile_url && (
            <div className="flex items-center gap-2">
              <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={lead.linkedin_profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                LinkedIn Profile
              </a>
            </div>
          )}
        </div>

        {/* ICP Segment + Score */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            ICP
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {lead.icp_segment && (
              <Badge
                variant="outline"
                className={`border-transparent font-medium ${icpSegmentColors[lead.icp_segment]}`}
              >
                {icpSegmentLabels[lead.icp_segment]}
              </Badge>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
              <span>Score: {lead.icp_score}/100</span>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="gap-1 pr-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={handleAddTag}
              disabled={!tagInput.trim()}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notes
          </h3>
          <Textarea
            placeholder="Add notes about this lead..."
            value={currentNotes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesChanged(true);
            }}
            className="min-h-20 text-sm"
          />
          {notesChanged && (
            <Button size="sm" onClick={handleSaveNotes}>
              Save Notes
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { LeadDetail };
