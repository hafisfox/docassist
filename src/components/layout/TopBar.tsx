"use client";

import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/leads": "Leads",
  "/campaigns": "Campaigns",
  "/sequences": "Sequences",
  "/inbox": "Inbox",
  "/templates": "Templates",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];

  // Match nested routes (e.g. /leads/123 → "Leads")
  const base = "/" + pathname.split("/")[1];
  return pageTitles[base] ?? "Dashboard";
}

interface TopBarProps {
  onMobileMenuOpen: () => void;
  onSearchOpen?: () => void;
}

export function TopBar({ onMobileMenuOpen, onSearchOpen }: TopBarProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={onMobileMenuOpen}
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </Button>

      {/* Page title */}
      <h1 className="font-heading text-base font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {/* Search trigger */}
        {onSearchOpen && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSearchOpen}
            className="hidden items-center gap-2 text-muted-foreground md:flex"
            aria-label="Search (Cmd+K)"
          >
            <Search className="size-3.5" />
            <span className="text-xs">Search...</span>
            <kbd className="pointer-events-none ml-1 hidden select-none rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] lg:inline-flex">
              ⌘K
            </kbd>
          </Button>
        )}

        {/* Notification bell */}
        <Button variant="ghost" size="icon-sm" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="User menu"
              />
            }
          >
            <Avatar size="sm">
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuItem>
              <User className="size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
