"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Papa from "papaparse"
import { useLeads } from "@/hooks/useLeads"
import type { CreateLeadInput } from "@/lib/validators"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  UploadIcon,
  FileSpreadsheetIcon,
  XIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  Loader2Icon,
} from "lucide-react"

const LEAD_FIELDS = [
  { value: "__skip__", label: "Skip this column" },
  { value: "first_name", label: "First Name", required: true },
  { value: "last_name", label: "Last Name", required: true },
  { value: "linkedin_profile_url", label: "LinkedIn Profile URL" },
  { value: "job_title", label: "Job Title" },
  { value: "company", label: "Company" },
  { value: "location", label: "Location" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "headline", label: "Headline" },
  { value: "specialty", label: "Specialty" },
  { value: "city", label: "City" },
  { value: "country", label: "Country" },
  { value: "notes", label: "Notes" },
] as const

type LeadFieldValue = (typeof LEAD_FIELDS)[number]["value"]

const FIELD_AUTO_MAP: Record<string, LeadFieldValue> = {
  first_name: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  last_name: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  linkedin_profile_url: "linkedin_profile_url",
  linkedin_url: "linkedin_profile_url",
  "linkedin url": "linkedin_profile_url",
  linkedin: "linkedin_profile_url",
  "profile url": "linkedin_profile_url",
  job_title: "job_title",
  title: "job_title",
  "job title": "job_title",
  position: "job_title",
  company: "company",
  organization: "company",
  "company name": "company",
  location: "location",
  city: "city",
  country: "country",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  headline: "headline",
  specialty: "specialty",
  speciality: "specialty",
  notes: "notes",
}

interface ParsedCSV {
  headers: string[]
  rows: string[][]
}

type ImportStep = "upload" | "mapping" | "preview" | "done"

interface ImportResult {
  imported: number
  total_requested: number
  failed?: Array<{ batch: number; error: string }>
}

export function LeadImportModal() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { bulkImport } = useLeads()

  const [step, setStep] = useState<ImportStep>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [csv, setCsv] = useState<ParsedCSV | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<number, LeadFieldValue>>({})
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const parseFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file")
      return
    }

    if (f.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10 MB")
      return
    }

    setFile(f)

    Papa.parse<string[]>(f, {
      skipEmptyLines: true,
      complete(results) {
        if (results.errors.length > 0) {
          toast.error(`CSV parsing error: ${results.errors[0].message}`)
          return
        }

        const [headers, ...rows] = results.data
        if (!headers || headers.length === 0) {
          toast.error("CSV file appears to be empty")
          return
        }

        if (rows.length === 0) {
          toast.error("CSV has headers but no data rows")
          return
        }

        setCsv({ headers, rows })

        // Auto-map columns
        const autoMapping: Record<number, LeadFieldValue> = {}
        const usedFields = new Set<LeadFieldValue>()
        headers.forEach((header, index) => {
          const normalized = header.toLowerCase().trim()
          const match = FIELD_AUTO_MAP[normalized]
          if (match && !usedFields.has(match)) {
            autoMapping[index] = match
            usedFields.add(match)
          }
        })
        setColumnMapping(autoMapping)
        setStep("mapping")
      },
    })
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) parseFile(droppedFile)
    },
    [parseFile]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0]
      if (selected) parseFile(selected)
    },
    [parseFile]
  )

  const updateMapping = useCallback(
    (columnIndex: number, field: LeadFieldValue) => {
      setColumnMapping((prev) => {
        const next = { ...prev }
        // Remove any other column that was mapped to this field (no duplicates)
        if (field !== "__skip__") {
          for (const [key, val] of Object.entries(next)) {
            if (val === field) {
              next[Number(key)] = "__skip__"
            }
          }
        }
        next[columnIndex] = field
        return next
      })
    },
    []
  )

  const requiredFieldsMapped = useMemo(() => {
    const mappedFields = new Set(Object.values(columnMapping))
    return mappedFields.has("first_name") && mappedFields.has("last_name")
  }, [columnMapping])

  const mappedLeads = useMemo((): CreateLeadInput[] => {
    if (!csv) return []

    return csv.rows
      .map((row) => {
        const lead: Record<string, string> = {}
        for (const [colIndex, field] of Object.entries(columnMapping)) {
          if (field === "__skip__") continue
          const value = row[Number(colIndex)]?.trim()
          if (value) {
            lead[field] = value
          }
        }

        if (!lead.first_name || !lead.last_name) return null

        return {
          first_name: lead.first_name,
          last_name: lead.last_name,
          linkedin_profile_url: lead.linkedin_profile_url,
          job_title: lead.job_title,
          company: lead.company,
          location: lead.location,
          email: lead.email,
          phone: lead.phone,
          headline: lead.headline,
          specialty: lead.specialty,
          city: lead.city,
          country: lead.country,
          notes: lead.notes,
          source: "csv_import",
        } as CreateLeadInput
      })
      .filter((l): l is CreateLeadInput => l !== null)
  }, [csv, columnMapping])

  const previewRows = useMemo(() => mappedLeads.slice(0, 5), [mappedLeads])

  const handleImport = async () => {
    if (mappedLeads.length === 0) {
      toast.error("No valid leads to import")
      return
    }

    if (mappedLeads.length > 500) {
      toast.error("Maximum 500 leads per import. Please split your CSV.")
      return
    }

    setImporting(true)
    try {
      const data = await bulkImport(mappedLeads)
      setResult(data)
      setStep("done")
      toast.success(`Successfully imported ${data.imported} leads`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to import leads"
      )
    } finally {
      setImporting(false)
    }
  }

  const handleReset = () => {
    setStep("upload")
    setFile(null)
    setCsv(null)
    setColumnMapping({})
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ── Upload step ─────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="space-y-4">
        <div
          className={`relative flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadIcon className="mb-3 size-10 text-muted-foreground" />
          <p className="text-sm font-medium">
            Drag and drop your CSV file here
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            or click to browse — max 10 MB, up to 500 rows
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        <div className="rounded-lg border bg-muted/50 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            Expected columns
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            first_name, last_name (required) + linkedin_profile_url, job_title,
            company, location, email, phone, headline, specialty, city, country,
            notes
          </p>
        </div>
      </div>
    )
  }

  // ── Mapping step ────────────────────────────────────────────────────
  if (step === "mapping" && csv) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{file?.name}</span>
            <span className="text-xs text-muted-foreground">
              ({csv.rows.length} rows, {csv.headers.length} columns)
            </span>
          </div>
          <Button variant="ghost" size="xs" onClick={handleReset}>
            <XIcon className="size-3" />
            Remove
          </Button>
        </div>

        {!requiredFieldsMapped && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
            <AlertCircleIcon className="size-4 shrink-0" />
            Map at least <strong>First Name</strong> and{" "}
            <strong>Last Name</strong> to continue.
          </div>
        )}

        <div className="max-h-[400px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">CSV Column</TableHead>
                <TableHead className="w-[200px]">Map to Field</TableHead>
                <TableHead>Sample Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {csv.headers.map((header, colIndex) => (
                <TableRow key={colIndex}>
                  <TableCell className="font-mono text-xs">{header}</TableCell>
                  <TableCell>
                    <Select
                      value={columnMapping[colIndex] ?? "__skip__"}
                      onValueChange={(val) =>
                        updateMapping(colIndex, val as LeadFieldValue)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                            {"required" in f && f.required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                    {csv.rows
                      .slice(0, 3)
                      .map((r) => r[colIndex])
                      .filter(Boolean)
                      .join(" | ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {mappedLeads.length} of {csv.rows.length} rows will be imported
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!requiredFieldsMapped}
              onClick={() => setStep("preview")}
            >
              Preview Import
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Preview step ────────────────────────────────────────────────────
  if (step === "preview") {
    const mappedFieldEntries = Object.entries(columnMapping).filter(
      ([, v]) => v !== "__skip__"
    )

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            Preview — first {Math.min(5, previewRows.length)} of{" "}
            {mappedLeads.length} leads
          </p>
        </div>

        <div className="max-h-[400px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {mappedFieldEntries.map(([, field]) => {
                  const def = LEAD_FIELDS.find((f) => f.value === field)
                  return (
                    <TableHead key={field} className="text-xs">
                      {def?.label ?? field}
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((lead, rowIndex) => (
                <TableRow key={rowIndex}>
                  {mappedFieldEntries.map(([, field]) => (
                    <TableCell key={field} className="text-xs">
                      {(lead as unknown as Record<string, string>)[field] ??
                        "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {mappedLeads.length} leads ready to import
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep("mapping")}
              disabled={importing}
            >
              Back
            </Button>
            <Button size="sm" onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Importing...
                </>
              ) : (
                <>Import {mappedLeads.length} Leads</>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Done step ───────────────────────────────────────────────────────
  if (step === "done" && result) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <CheckCircleIcon className="size-12 text-green-500" />
        <div className="text-center">
          <p className="text-lg font-semibold">Import Complete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.imported} of {result.total_requested} leads imported
            successfully
          </p>
          {result.failed && result.failed.length > 0 && (
            <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-left text-xs text-destructive">
              {result.failed.map((f, i) => (
                <p key={i}>
                  Batch {f.batch}: {f.error}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            Import Another
          </Button>
          <Button
            size="sm"
            onClick={() => (window.location.href = "/leads")}
          >
            View Leads
          </Button>
        </div>
      </div>
    )
  }

  return null
}
