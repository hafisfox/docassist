"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { Settings } from "@/types/database";
import {
  Wifi,
  WifiOff,
  Copy,
  Check,
  Save,
  Loader2,
  Activity,
  Clock,
  Shield,
  Link,
  Zap,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  XCircle,
} from "lucide-react";
import { useCircuitBreaker } from "@/hooks/useCircuitBreaker";
import { useAccountHealth } from "@/hooks/useAccountHealth";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "UTC",
] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const {
    status: cbStatus,
    loading: cbLoading,
    resetting: cbResetting,
    refetch: cbRefetch,
    reset: cbReset,
  } = useCircuitBreaker();
  const { health, loading: healthLoading, refetch: healthRefetch } = useAccountHealth();

  // Form state
  const [unipileAccountId, setUnipileAccountId] = useState("");
  const [maxDailyInvites, setMaxDailyInvites] = useState(25);
  const [maxDailyMessages, setMaxDailyMessages] = useState(50);
  const [maxDailyProfileViews, setMaxDailyProfileViews] = useState(80);
  const [outreachStartHour, setOutreachStartHour] = useState(9);
  const [outreachEndHour, setOutreachEndHour] = useState(18);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [minDelaySeconds, setMinDelaySeconds] = useState(30);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(120);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/unipile`
      : "";

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data: Settings = await res.json();
      setSettings(data);
      setUnipileAccountId(data.unipile_account_id ?? "");
      setMaxDailyInvites(data.max_daily_invites);
      setMaxDailyMessages(data.max_daily_messages);
      setMaxDailyProfileViews(data.max_daily_profile_views);
      setOutreachStartHour(data.outreach_start_hour);
      setOutreachEndHour(data.outreach_end_hour);
      setTimezone(data.timezone);
      setMinDelaySeconds(data.min_delay_seconds);
      setMaxDelaySeconds(data.max_delay_seconds);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unipile_account_id: unipileAccountId || null,
          max_daily_invites: maxDailyInvites,
          max_daily_messages: maxDailyMessages,
          max_daily_profile_views: maxDailyProfileViews,
          outreach_start_hour: outreachStartHour,
          outreach_end_hour: outreachEndHour,
          timezone,
          min_delay_seconds: minDelaySeconds,
          max_delay_seconds: maxDelaySeconds,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save settings");
      }

      const updated: Settings = await res.json();
      setSettings(updated);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save settings"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!unipileAccountId) {
      toast.error("Enter a Unipile Account ID first");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/linkedin/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: unipileAccountId }),
      });
      const data = await res.json();
      if (res.ok && data.connected) {
        toast.success("Connection successful! LinkedIn account is connected.");
        setSettings((prev) =>
          prev ? { ...prev, unipile_account_status: "connected" } : prev
        );
      } else {
        toast.error(data.error ?? "Connection failed. Check your Account ID.");
        setSettings((prev) =>
          prev ? { ...prev, unipile_account_status: "error" } : prev
        );
      }
    } catch {
      toast.error("Connection test failed. Please try again.");
    } finally {
      setTesting(false);
    }
  }

  function handleCopyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("Webhook URL copied");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Skeleton className="mb-2 h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your LinkedIn outreach configuration and account settings.
        </p>
      </div>

      {/* ─── Unipile Connection ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="size-4" />
            Unipile Connection
          </CardTitle>
          <CardDescription>
            Connect your LinkedIn account through Unipile to enable outreach
            automation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unipile-account-id">Account ID</Label>
            <Input
              id="unipile-account-id"
              placeholder="Enter your Unipile account ID"
              value={unipileAccountId}
              onChange={(e) => setUnipileAccountId(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {settings?.unipile_account_status === "connected" ? (
                <Badge variant="default" className="gap-1">
                  <Wifi className="size-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <WifiOff className="size-3" />
                  Not Connected
                </Badge>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || !unipileAccountId}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wifi className="size-4" />
              )}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Daily Limits ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-4" />
            Daily Limits
          </CardTitle>
          <CardDescription>
            Set safety limits to stay within LinkedIn&apos;s acceptable usage
            thresholds. Lower limits reduce the risk of account restrictions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="max-invites">Max Daily Invites</Label>
              <span className="text-sm font-medium tabular-nums">
                {maxDailyInvites}
              </span>
            </div>
            <Input
              id="max-invites"
              type="range"
              min={1}
              max={25}
              value={maxDailyInvites}
              onChange={(e) => setMaxDailyInvites(Number(e.target.value))}
              className="h-2 cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              LinkedIn allows ~100/week. Recommended: 15-25/day.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="max-messages">Max Daily Messages</Label>
              <span className="text-sm font-medium tabular-nums">
                {maxDailyMessages}
              </span>
            </div>
            <Input
              id="max-messages"
              type="range"
              min={1}
              max={150}
              value={maxDailyMessages}
              onChange={(e) => setMaxDailyMessages(Number(e.target.value))}
              className="h-2 cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              LinkedIn allows ~150/day. Recommended: 30-50/day.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="max-views">Max Daily Profile Views</Label>
              <span className="text-sm font-medium tabular-nums">
                {maxDailyProfileViews}
              </span>
            </div>
            <Input
              id="max-views"
              type="range"
              min={1}
              max={80}
              value={maxDailyProfileViews}
              onChange={(e) => setMaxDailyProfileViews(Number(e.target.value))}
              className="h-2 cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              LinkedIn allows ~80/day. Recommended: 40-60/day.
            </p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min-delay">Min Delay (seconds)</Label>
              <Input
                id="min-delay"
                type="number"
                min={10}
                max={300}
                value={minDelaySeconds}
                onChange={(e) => setMinDelaySeconds(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-delay">Max Delay (seconds)</Label>
              <Input
                id="max-delay"
                type="number"
                min={30}
                max={600}
                value={maxDelaySeconds}
                onChange={(e) => setMaxDelaySeconds(Number(e.target.value))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Random delay between LinkedIn actions to mimic human behavior.
          </p>
        </CardContent>
      </Card>

      {/* ─── Working Hours ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            Working Hours
          </CardTitle>
          <CardDescription>
            Outreach actions will only be executed during these hours to appear
            natural.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Hour</Label>
              <Select
                value={outreachStartHour}
                onValueChange={(val) => setOutreachStartHour(val as number)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {formatHour(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>End Hour</Label>
              <Select
                value={outreachEndHour}
                onValueChange={(val) => setOutreachEndHour(val as number)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {formatHour(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select
              value={timezone}
              onValueChange={(val) => setTimezone(val as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── Webhook URL ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            Webhook URL
          </CardTitle>
          <CardDescription>
            Add this URL in your Unipile dashboard to receive real-time events
            (new messages, accepted invitations).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={webhookUrl}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyWebhook}
            >
              {copied ? (
                <Check className="size-4 text-green-600" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Account Health ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4" />
                Account Health
              </CardTitle>
              <CardDescription className="mt-1">
                LinkedIn account status, daily usage counters, and error
                monitoring.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={healthRefetch}
              disabled={healthLoading}
              aria-label="Refresh health data"
            >
              <RefreshCw
                className={`size-4 ${healthLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Daily counters */}
          {settings ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Invites Today</p>
                <p className="text-xl font-bold tabular-nums">
                  {settings.invites_sent_today}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{maxDailyInvites}
                  </span>
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Messages Today</p>
                <p className="text-xl font-bold tabular-nums">
                  {settings.messages_sent_today}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{maxDailyMessages}
                  </span>
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Counters Reset
                </p>
                <p className="text-sm font-medium">
                  {new Date(settings.counters_reset_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No data available yet. Save your settings to get started.
            </p>
          )}

          <Separator />

          {/* Acceptance rate + error count from health endpoint */}
          {healthLoading && !health ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : health ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {/* Acceptance rate */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    Invite Acceptance Rate
                  </p>
                  {health.account_health.acceptance_rate !== null ? (
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`text-xl font-bold tabular-nums ${
                          health.account_health.acceptance_rate_warning
                            ? "text-orange-600"
                            : "text-foreground"
                        }`}
                      >
                        {health.account_health.acceptance_rate}%
                      </p>
                      {health.account_health.acceptance_rate_warning ? (
                        <TrendingDown className="size-4 text-orange-500" />
                      ) : (
                        <TrendingUp className="size-4 text-green-500" />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      —{" "}
                      <span className="text-xs">
                        (need {health.account_health.invites_sent_total > 0
                          ? `${20 - health.account_health.invites_sent_total} more`
                          : "20+"}{" "}
                        invites)
                      </span>
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {health.account_health.invites_accepted_total}/
                    {health.account_health.invites_sent_total} accepted
                  </p>
                </div>

                {/* LinkedIn account age */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    LinkedIn Account Age
                  </p>
                  <p className="text-sm font-medium text-muted-foreground">
                    Not tracked
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Verify in LinkedIn settings
                  </p>
                </div>

                {/* Recent errors */}
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    Errors (last 7d)
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p
                      className={`text-xl font-bold tabular-nums ${
                        health.account_health.recent_error_count > 0
                          ? "text-destructive"
                          : "text-foreground"
                      }`}
                    >
                      {health.account_health.recent_error_count}
                    </p>
                    {health.account_health.recent_error_count > 0 ? (
                      <XCircle className="size-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="size-4 text-green-500" />
                    )}
                  </div>
                </div>
              </div>

              {/* Warning if acceptance rate is low */}
              {health.account_health.acceptance_rate_warning && (
                <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    <span className="font-medium">
                      Acceptance rate below 20%.
                    </span>{" "}
                    Active campaigns were automatically paused. Review your ICP
                    targeting and connection request message quality before
                    reactivating.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ─── Circuit Breaker ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            Unipile Circuit Breaker
          </CardTitle>
          <CardDescription>
            Automatically pauses outreach when the Unipile API fails{" "}
            consecutively. Recovers after 30 minutes via a test call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cbLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading status…
            </div>
          ) : cbStatus ? (
            <>
              {/* State badge + description */}
              <div className="flex items-center gap-3">
                {cbStatus.state === "CLOSED" && (
                  <Badge className="gap-1.5 bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="size-3" />
                    CLOSED — Healthy
                  </Badge>
                )}
                {cbStatus.state === "OPEN" && (
                  <Badge variant="destructive" className="gap-1.5">
                    <AlertTriangle className="size-3" />
                    OPEN — Blocking requests
                  </Badge>
                )}
                {cbStatus.state === "HALF_OPEN" && (
                  <Badge className="gap-1.5 bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <RefreshCw className="size-3" />
                    HALF_OPEN — Testing recovery
                  </Badge>
                )}
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Failures</p>
                  <p className="text-xl font-bold tabular-nums">
                    {cbStatus.failures}
                    <span className="text-sm font-normal text-muted-foreground">/3</span>
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">State</p>
                  <p className="text-sm font-medium">{cbStatus.state}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Last Failure</p>
                  <p className="text-sm font-medium">
                    {cbStatus.lastFailureAt
                      ? new Date(cbStatus.lastFailureAt).toLocaleTimeString()
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Next Retry</p>
                  <p className="text-sm font-medium">
                    {cbStatus.nextRetryAt
                      ? new Date(cbStatus.nextRetryAt).toLocaleTimeString()
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cbRefetch}
                  disabled={cbLoading}
                >
                  <RefreshCw className="size-4" />
                  Refresh
                </Button>
                {cbStatus.state !== "CLOSED" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      await cbReset();
                      toast.success("Circuit breaker reset to CLOSED");
                    }}
                    disabled={cbResetting}
                  >
                    {cbResetting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Zap className="size-4" />
                    )}
                    {cbResetting ? "Resetting…" : "Force Reset to CLOSED"}
                  </Button>
                )}
              </div>

              {cbStatus.state === "OPEN" && (
                <p className="text-xs text-muted-foreground">
                  All active campaigns were automatically paused when the circuit
                  opened. After resetting, re-activate your campaigns manually.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unable to load circuit breaker status.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─── Save Button ───────────────────────────────────────── */}
      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
