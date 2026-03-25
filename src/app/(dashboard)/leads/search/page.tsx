"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { LinkedInSearchPanel } from "@/components/leads/LinkedInSearchPanel";

export default function LeadSearchPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push("/leads")}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Search LinkedIn</h1>
          <p className="text-sm text-muted-foreground">
            Find and add oncologists from LinkedIn to your leads
          </p>
        </div>
      </div>

      <ErrorBoundary section="LinkedIn Search">
        <LinkedInSearchPanel />
      </ErrorBoundary>
    </div>
  );
}
