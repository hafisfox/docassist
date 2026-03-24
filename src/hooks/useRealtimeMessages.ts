"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Message } from "@/types/database";

/**
 * Subscribes to INSERT events on the messages table for the current user.
 *
 * On each new inbound message:
 * - Bumps `unreadCount` (auto-reset when pathname enters /inbox)
 * - Shows a toast with an "View inbox" action (suppressed when already on /inbox)
 * - Fires the custom window event `inbox:new-message` so inbox and thread
 *   components can react without duplicating the Supabase subscription
 */
export function useRealtimeMessages() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  const supabaseRef = useRef(createClient());
  // Keep a ref so the Realtime callback always reads the latest pathname
  // without needing to recreate the subscription on every navigation.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
    // Auto-reset badge when the user navigates to the inbox
    if (pathname.startsWith("/inbox")) {
      setUnreadCount(0);
    }
  }, [pathname]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function subscribe() {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      channel = supabase
        .channel("realtime-messages-global")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const message = payload.new as Message;
            if (message.direction !== "inbound") return;

            setUnreadCount((prev) => prev + 1);

            // Show toast only when the user is not already looking at the inbox
            if (!pathnameRef.current.startsWith("/inbox")) {
              const preview =
                message.message_text.length > 80
                  ? `${message.message_text.slice(0, 80)}…`
                  : message.message_text;

              toast("New message received", {
                description: preview,
                action: {
                  label: "View inbox",
                  onClick: () => {
                    window.location.href = "/inbox";
                  },
                },
              });
            }

            // Broadcast to inbox page + MessageThread via custom event
            window.dispatchEvent(
              new CustomEvent<Message>("inbox:new-message", { detail: message }),
            );
          },
        )
        .subscribe();
    }

    subscribe();

    return () => {
      if (channel) {
        supabaseRef.current.removeChannel(channel);
      }
    };
  }, []);

  const resetUnreadCount = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return { unreadCount, resetUnreadCount };
}
