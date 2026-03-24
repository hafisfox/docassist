"use client"

import { LinkedInSearchPanel } from "@/components/leads/LinkedInSearchPanel"
import { LeadImportModal } from "@/components/leads/LeadImportModal"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon, SearchIcon, FileUpIcon } from "lucide-react"
import { useRouter } from "next/navigation"

export default function LeadImportPage() {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push("/leads")}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Import Leads</h1>
          <p className="text-sm text-muted-foreground">
            Search LinkedIn or upload a CSV file to add leads
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="linkedin">
        <TabsList>
          <TabsTrigger value="linkedin">
            <SearchIcon className="size-3.5" />
            LinkedIn Search
          </TabsTrigger>
          <TabsTrigger value="csv">
            <FileUpIcon className="size-3.5" />
            CSV Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="linkedin">
          <LinkedInSearchPanel />
        </TabsContent>

        <TabsContent value="csv">
          <div className="mx-auto max-w-3xl py-4">
            <LeadImportModal />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
