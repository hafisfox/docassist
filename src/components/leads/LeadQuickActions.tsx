"use client";

import { useState, useEffect } from "react";
import {
  SendIcon,
  SparklesIcon,
  MegaphoneIcon,
  SaveIcon,
  LoaderCircleIcon,
  UserPlusIcon,
} from "lucide-react";
import { SendConnectionDialog } from "@/components/leads/SendConnectionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead, LeadStatus } from "@/types/database";

interface LeadQuickActionsProps {
  lead: Lead | null;
  loading: boolean;
  onChangeStatus: (status: LeadStatus) => Promise<void>;
  onSendMessage: (text: string) => Promise<void>;
  onEnrichProfile: () => Promise<void>;
  onAddToCampaign: () => void;
  onAddNote: (note: string) => Promise<void>;
}

const statusOptions: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "enriched", label: "Enriched" },
  { value: "invite_sent", label: "Invite Sent" },
  { value: "invite_accepted", label: "Accepted" },
  { value: "invite_expired", label: "Expired" },
  { value: "message_sent", label: "Message Sent" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "meeting_booked", label: "Meeting Booked" },
  { value: "converted", label: "Converted" },
  { value: "do_not_contact", label: "Do Not Contact" },
];

function QuickActionsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );
}

function LeadQuickActions({
  lead,
  loading,
  onChangeStatus,
  onSendMessage,
  onEnrichProfile,
  onAddToCampaign,
  onAddNote,
}: LeadQuickActionsProps) {
  const [messageText, setMessageText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [remainingInvites, setRemainingInvites] = useState<number | null>(null);

  // Fetch remaining daily invite count to show on button
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { remaining_daily_invites?: number } | null) => {
        if (data?.remaining_daily_invites !== undefined) {
          setRemainingInvites(data.remaining_daily_invites);
        }
      })
      .catch(() => {});
  }, []);

  if (loading || !lead) {
    return <QuickActionsSkeleton />;
  }

  async function handleSendMessage() {
    if (!messageText.trim()) return;
    setSendingMessage(true);
    try {
      await onSendMessage(messageText.trim());
      setMessageText("");
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleStatusChange(value: string | null) {
    if (!value) return;
    setChangingStatus(true);
    try {
      await onChangeStatus(value as LeadStatus);
    } finally {
      setChangingStatus(false);
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    try {
      await onEnrichProfile();
    } finally {
      setEnriching(false);
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await onAddNote(noteText.trim());
      setNoteText("");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Send Message */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Send Message
            </Label>
            <Textarea
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="min-h-16 text-sm"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={!messageText.trim() || sendingMessage}
              onClick={handleSendMessage}
            >
              {sendingMessage ? (
                <LoaderCircleIcon className="mr-1.5 size-4 animate-spin" />
              ) : (
                <SendIcon className="mr-1.5 size-4" />
              )}
              Send Message
            </Button>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Change Status
            </Label>
            <Select
              value={lead.status}
              onValueChange={handleStatusChange}
              disabled={changingStatus}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            {/* ── Send Connection Request ── */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              disabled={
                (remainingInvites !== null && remainingInvites <= 0) ||
                lead.status === "invite_sent" ||
                lead.status === "invite_accepted" ||
                lead.status === "do_not_contact"
              }
              onClick={() => setConnectDialogOpen(true)}
            >
              <UserPlusIcon className="mr-1.5 size-4" />
              Connect
              {remainingInvites !== null && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {remainingInvites} left
                </span>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={onAddToCampaign}
            >
              <MegaphoneIcon className="mr-1.5 size-4" />
              Add to Campaign
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              disabled={enriching}
              onClick={handleEnrich}
            >
              {enriching ? (
                <LoaderCircleIcon className="mr-1.5 size-4 animate-spin" />
              ) : (
                <SparklesIcon className="mr-1.5 size-4" />
              )}
              Enrich Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Note */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add Note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            placeholder="Write a note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-16 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!noteText.trim() || savingNote}
            onClick={handleAddNote}
          >
            {savingNote ? (
              <LoaderCircleIcon className="mr-1.5 size-4 animate-spin" />
            ) : (
              <SaveIcon className="mr-1.5 size-4" />
            )}
            Save Note
          </Button>
        </CardContent>
      </Card>

      {/* Send Connection Request dialog */}
      <SendConnectionDialog
        lead={lead}
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        onSuccess={(remaining) => setRemainingInvites(remaining)}
      />
    </div>
  );
}

export { LeadQuickActions };
