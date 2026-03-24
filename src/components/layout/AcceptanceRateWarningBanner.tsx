"use client";

import { useState } from "react";
import { TrendingDown, X } from "lucide-react";
import { useAccountHealth } from "@/hooks/useAccountHealth";

/**
 * Shown when the overall invitation acceptance rate across campaigns drops
 * below 20% (with at least 20 invites sent). Any active campaigns are
 * automatically paused server-side by the health endpoint.
 */
export function AcceptanceRateWarningBanner() {
  const { health } = useAccountHealth();
  const [dismissed, setDismissed] = useState(false);

  if (!health?.account_health.acceptance_rate_warning || dismissed) return null;

  const { acceptance_rate, campaigns_auto_paused } = health.account_health;

  return (
    <div
      className="flex items-start gap-3 border-b border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300"
      role="alert"
    >
      <TrendingDown className="mt-0.5 size-4 shrink-0" />

      <div className="flex-1 space-y-0.5">
        <p className="font-semibold">
          Low acceptance rate ({acceptance_rate}%) — LinkedIn account health warning
        </p>
        <p className="text-xs opacity-80">
          Invitation acceptance rate dropped below 20%.
          {campaigns_auto_paused > 0 && (
            <>
              {" "}
              {campaigns_auto_paused}{" "}
              {campaigns_auto_paused === 1 ? "campaign was" : "campaigns were"}{" "}
              automatically paused to protect your LinkedIn account.
            </>
          )}{" "}
          Review your targeting and message quality, then re-activate campaigns
          manually.{" "}
          <a
            href="/settings"
            className="underline underline-offset-2 hover:opacity-70"
          >
            View Account Health in Settings
          </a>
        </p>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-orange-100 dark:hover:bg-orange-900/40"
        aria-label="Dismiss warning"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
