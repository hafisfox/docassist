"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LeadDetail } from "@/components/leads/LeadDetail";
import { LeadTimeline } from "@/components/leads/LeadTimeline";
import { LeadQuickActions } from "@/components/leads/LeadQuickActions";
import { useLeadDetail } from "@/hooks/useLeadDetail";
import type { LeadStatus } from "@/types/database";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LeadDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const {
    lead,
    activities,
    messages,
    loading,
    error,
    updateLead,
  } = useLeadDetail(id);

  async function handleChangeStatus(status: LeadStatus) {
    try {
      await updateLead({ status });
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function handleSendMessage(text: string) {
    try {
      const res = await fetch("/api/linkedin/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: id, text }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send message");
      }
      toast.success("Message sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  async function handleEnrichProfile() {
    try {
      const res = await fetch(`/api/leads/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to enrich profile");
      }
      toast.success("Profile enrichment started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enrich profile");
    }
  }

  function handleAddToCampaign() {
    toast.info("Campaign selection coming soon");
  }

  async function handleUpdateTags(tags: string[]) {
    try {
      await updateLead({ tags });
    } catch {
      toast.error("Failed to update tags");
    }
  }

  async function handleUpdateNotes(notes: string) {
    try {
      await updateLead({ notes });
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    }
  }

  async function handleAddNote(note: string) {
    const existing = lead?.notes ?? "";
    const separator = existing ? "\n\n" : "";
    const timestamp = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const updated = `${existing}${separator}[${timestamp}] ${note}`;

    try {
      await updateLead({ notes: updated });
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/leads")}
        >
          <ArrowLeftIcon className="mr-1 size-4" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">
          {loading ? "Loading..." : lead?.full_name ?? "Lead Not Found"}
        </h1>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Three-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Profile Card */}
        <div className="lg:col-span-3">
          <LeadDetail
            lead={lead}
            loading={loading}
            onUpdateTags={handleUpdateTags}
            onUpdateNotes={handleUpdateNotes}
          />
        </div>

        {/* Middle: Activity Timeline */}
        <div className="lg:col-span-6">
          <LeadTimeline
            activities={activities}
            messages={messages}
            loading={loading}
          />
        </div>

        {/* Right: Quick Actions */}
        <div className="lg:col-span-3">
          <LeadQuickActions
            lead={lead}
            loading={loading}
            onChangeStatus={handleChangeStatus}
            onSendMessage={handleSendMessage}
            onEnrichProfile={handleEnrichProfile}
            onAddToCampaign={handleAddToCampaign}
            onAddNote={handleAddNote}
          />
        </div>
      </div>
    </div>
  );
}
