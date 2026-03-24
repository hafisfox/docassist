"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  SearchIcon,
  UserPlusIcon,
  MapPinIcon,
  BriefcaseIcon,
  BuildingIcon,
  CheckIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  ICP_TITLES,
  TARGET_LOCATIONS,
  TARGET_HOSPITALS,
  LINKEDIN_SEARCH_FILTERS,
} from "@/constants/icp";
import type { UnipileSearchResultItem } from "@/lib/unipile/types";

interface SearchFormState {
  keywords: string;
  title: string;
  location: string;
  company: string;
}

interface SearchResult {
  items: UnipileSearchResultItem[];
  total_count: number;
  page: number;
  has_more: boolean;
}

const INITIAL_FORM: SearchFormState = {
  keywords: "",
  title: "",
  location: "",
  company: "",
};

function LinkedInSearchPanel() {
  const [form, setForm] = useState<SearchFormState>(INITIAL_FORM);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  const updateField = useCallback(
    (field: keyof SearchFormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const applyPreset = useCallback((presetKey: string) => {
    const preset = LINKEDIN_SEARCH_FILTERS[presetKey];
    if (!preset) return;

    setForm({
      keywords: preset.keywords ?? "",
      title: preset.titles[0] ?? "",
      location: preset.locations.join(", "),
      company: preset.companies?.join(", ") ?? "",
    });
  }, []);

  const hasSearchParams =
    form.keywords.trim() ||
    form.title.trim() ||
    form.location.trim() ||
    form.company.trim();

  const search = useCallback(
    async (page = 1) => {
      if (!hasSearchParams) {
        toast.error("Enter at least one search parameter");
        return;
      }

      setLoading(true);
      try {
        const body: Record<string, string | number> = {};
        if (form.keywords.trim()) body.keywords = form.keywords.trim();
        if (form.title.trim()) body.title = form.title.trim();
        if (form.location.trim()) body.location = form.location.trim();
        if (form.company.trim()) body.company = form.company.trim();
        if (page > 1) body.page = page;

        const res = await fetch("/api/linkedin/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Search failed" }));
          throw new Error(err.error ?? `Search failed (${res.status})`);
        }

        const data: SearchResult = await res.json();
        setResults(data);
        setCurrentPage(page);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred";
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [form, hasSearchParams],
  );

  const handleImport = useCallback(
    async (item: UnipileSearchResultItem) => {
      if (importedIds.has(item.provider_id)) return;

      setImportingIds((prev) => new Set(prev).add(item.provider_id));

      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: item.first_name,
            last_name: item.last_name,
            linkedin_public_id: item.public_identifier,
            headline: item.headline,
            company: item.current_company,
            location: item.location,
            source: "linkedin_search",
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Import failed" }));
          throw new Error(err.error ?? `Import failed (${res.status})`);
        }

        setImportedIds((prev) => new Set(prev).add(item.provider_id));
        toast.success(`${item.first_name} ${item.last_name} imported as lead`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to import lead";
        toast.error(message);
      } finally {
        setImportingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.provider_id);
          return next;
        });
      }
    },
    [importedIds],
  );

  return (
    <div data-slot="linkedin-search-panel" className="space-y-6">
      {/* ── Search Form ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4">
          {/* Preset selector */}
          <div className="space-y-1.5">
            <Label htmlFor="preset">Quick Preset</Label>
            <select
              id="preset"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) applyPreset(e.target.value);
              }}
            >
              <option value="">Select a preset...</option>
              {Object.entries(LINKEDIN_SEARCH_FILTERS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Search fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                placeholder="e.g. oncologist, medical oncology"
                value={form.keywords}
                onChange={(e) => updateField("keywords", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Job Title</Label>
              <Input
                id="title"
                list="icp-titles"
                placeholder="e.g. Medical Oncologist"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
              />
              <datalist id="icp-titles">
                {ICP_TITLES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                list="target-locations"
                placeholder="e.g. Mumbai, Delhi NCR"
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
              />
              <datalist id="target-locations">
                {TARGET_LOCATIONS.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company">Company / Hospital</Label>
              <Input
                id="company"
                list="target-hospitals"
                placeholder="e.g. Apollo Hospitals"
                value={form.company}
                onChange={(e) => updateField("company", e.target.value)}
              />
              <datalist id="target-hospitals">
                {TARGET_HOSPITALS.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => search(1)}
              disabled={loading || !hasSearchParams}
            >
              {loading ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <SearchIcon />
              )}
              {loading ? "Searching..." : "Search LinkedIn"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setForm(INITIAL_FORM);
                setResults(null);
                setCurrentPage(1);
              }}
              disabled={loading}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Results ────────────────────────────────────────────────── */}
      {loading && !results && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {results && results.items.length === 0 && (
        <EmptyState
          icon={<SearchIcon />}
          title="No results found"
          description="Try broadening your search criteria or using a different preset."
        />
      )}

      {results && results.items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {results.items.length} of {results.total_count} results
              {currentPage > 1 && ` (page ${currentPage})`}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.items.map((item) => {
              const isImporting = importingIds.has(item.provider_id);
              const isImported = importedIds.has(item.provider_id);

              return (
                <Card key={item.provider_id} size="sm">
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Avatar>
                        {item.profile_picture_url ? (
                          <AvatarImage
                            src={item.profile_picture_url}
                            alt={`${item.first_name} ${item.last_name}`}
                          />
                        ) : null}
                        <AvatarFallback>
                          {item.first_name[0]}
                          {item.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.first_name} {item.last_name}
                        </p>
                        {item.headline && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {item.headline}
                          </p>
                        )}
                      </div>
                      {item.connection_degree && (
                        <Badge variant="outline" className="shrink-0">
                          {item.connection_degree}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {item.current_company && (
                        <span className="inline-flex items-center gap-1">
                          <BuildingIcon className="size-3" />
                          <span className="truncate">{item.current_company}</span>
                        </span>
                      )}
                      {item.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPinIcon className="size-3" />
                          <span className="truncate">{item.location}</span>
                        </span>
                      )}
                    </div>

                    <Button
                      variant={isImported ? "secondary" : "outline"}
                      size="sm"
                      className="w-full"
                      disabled={isImporting || isImported}
                      onClick={() => handleImport(item)}
                    >
                      {isImported ? (
                        <>
                          <CheckIcon />
                          Imported
                        </>
                      ) : isImporting ? (
                        <>
                          <LoaderCircleIcon className="animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <UserPlusIcon />
                          Import as Lead
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {results.has_more && (
            <div className="flex justify-center gap-2">
              {currentPage > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => search(currentPage - 1)}
                >
                  Previous
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => search(currentPage + 1)}
              >
                {loading ? "Loading..." : "Next Page"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { LinkedInSearchPanel };
