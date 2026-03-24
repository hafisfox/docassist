"use client";

import { LogOut } from "lucide-react";
import { signout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signout}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut className="size-4" />
        Sign Out
      </Button>
    </form>
  );
}
