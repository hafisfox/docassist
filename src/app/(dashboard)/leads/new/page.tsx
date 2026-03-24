"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ICP_SEGMENTS = [
  { value: "high_volume_chemo", label: "High-Volume Chemo Clinic" },
  { value: "precision_oncology", label: "Precision Oncology Center" },
  { value: "insurance_heavy_urban", label: "Insurance-Heavy Urban Practice" },
] as const;

type FormFields = {
  first_name: string;
  last_name: string;
  job_title: string;
  company: string;
  email: string;
  phone: string;
  headline: string;
  city: string;
  country: string;
  icp_segment: string;
  linkedin_profile_url: string;
  notes: string;
};

const EMPTY_FORM: FormFields = {
  first_name: "",
  last_name: "",
  job_title: "",
  company: "",
  email: "",
  phone: "",
  headline: "",
  city: "",
  country: "",
  icp_segment: "",
  linkedin_profile_url: "",
  notes: "",
};

export default function NewLeadPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);

  function set(field: keyof FormFields, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.first_name || !form.last_name) {
      toast.error("First name and last name are required");
      return;
    }

    // Build payload, omitting empty strings
    const payload: Record<string, string> = { source: "manual" };
    for (const [k, v] of Object.entries(form)) {
      if (v) payload[k] = v;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create lead");
      }

      toast.success(`${form.first_name} ${form.last_name} added`);
      router.push(`/leads/${data.lead.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

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
          <h1 className="text-xl font-semibold">Add Lead</h1>
          <p className="text-sm text-muted-foreground">
            Manually add a lead to your pipeline
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="first_name"
                value={form.first_name ?? ""}
                onChange={(e) => set("first_name", e.target.value)}
                placeholder="Rajesh"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="last_name"
                value={form.last_name ?? ""}
                onChange={(e) => set("last_name", e.target.value)}
                placeholder="Kumar"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job_title">Job Title</Label>
              <Input
                id="job_title"
                value={form.job_title ?? ""}
                onChange={(e) => set("job_title", e.target.value)}
                placeholder="Medical Oncologist"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company">Hospital / Organization</Label>
              <Input
                id="company"
                value={form.company ?? ""}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Apollo Hospitals"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                placeholder="dr.kumar@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                value={form.headline ?? ""}
                onChange={(e) => set("headline", e.target.value)}
                placeholder="Senior Consultant Medical Oncology at Apollo Hospitals"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location & Segmentation</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Mumbai"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value)}
                placeholder="India"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="icp_segment">ICP Segment</Label>
              <Select
                value={form.icp_segment ?? ""}
                onValueChange={(val) => set("icp_segment", val ?? "")}
              >
                <SelectTrigger id="icp_segment">
                  <SelectValue placeholder="Select segment..." />
                </SelectTrigger>
                <SelectContent>
                  {ICP_SEGMENTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">LinkedIn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="linkedin_profile_url">Profile URL</Label>
              <Input
                id="linkedin_profile_url"
                value={form.linkedin_profile_url ?? ""}
                onChange={(e) => set("linkedin_profile_url", e.target.value)}
                placeholder="https://www.linkedin.com/in/rajesh-kumar"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any context or notes about this lead..."
              rows={3}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/leads")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add Lead"}
          </Button>
        </div>
      </form>
    </div>
  );
}
