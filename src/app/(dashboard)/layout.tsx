"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { CircuitBreakerBanner } from "@/components/layout/CircuitBreakerBanner";
import { AcceptanceRateWarningBanner } from "@/components/layout/AcceptanceRateWarningBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global real-time subscription: badge count + toast + event broadcast.
  // Path-aware toast suppression and auto-reset are handled inside the hook.
  const { unreadCount } = useRealtimeMessages();

  // Cmd+K (macOS) / Ctrl+K (Windows/Linux) opens the global search palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        inboxUnreadCount={unreadCount}
      />

      {/* Mobile navigation */}
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        inboxUnreadCount={unreadCount}
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          onMobileMenuOpen={() => setMobileNavOpen(true)}
          onSearchOpen={() => setSearchOpen(true)}
        />
        <CircuitBreakerBanner />
        <AcceptanceRateWarningBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      {/* Global search / command palette */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
