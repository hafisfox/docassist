"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboardIcon,
  UsersIcon,
  GitBranchIcon,
  FileTextIcon,
  MegaphoneIcon,
  InboxIcon,
  BarChart2Icon,
  SettingsIcon,
  SearchIcon,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon, shortcut: "G D" },
  { label: "Leads", href: "/leads", icon: UsersIcon, shortcut: "G L" },
  { label: "Campaigns", href: "/campaigns", icon: MegaphoneIcon, shortcut: "G C" },
  { label: "Sequences", href: "/sequences", icon: GitBranchIcon, shortcut: "G S" },
  { label: "Inbox", href: "/inbox", icon: InboxIcon, shortcut: "G I" },
  { label: "Templates", href: "/templates", icon: FileTextIcon, shortcut: "G T" },
  { label: "Analytics", href: "/analytics", icon: BarChart2Icon, shortcut: "G A" },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
] as const;

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router]
  );

  const handleSearchLeads = useCallback(() => {
    if (!search.trim()) return;
    onOpenChange(false);
    router.push(`/leads?search=${encodeURIComponent(search.trim())}`);
  }, [search, onOpenChange, router]);

  // Reset search when closed
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Global Search">
      <Command shouldFilter={true}>
        <CommandInput
          placeholder="Search leads or navigate..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {search.trim() && (
            <CommandGroup heading="Search">
              <CommandItem onSelect={handleSearchLeads} value={`search-leads-${search}`}>
                <SearchIcon />
                Search leads for &quot;{search}&quot;
              </CommandItem>
            </CommandGroup>
          )}

          <CommandGroup heading="Navigate">
            {NAV_ITEMS.map(({ label, href, icon: Icon, shortcut }) => (
              <CommandItem key={href} onSelect={() => navigate(href)} value={label}>
                <Icon />
                {label}
                {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
