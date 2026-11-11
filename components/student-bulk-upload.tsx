"use client";

// ============================================================
// Bulk student registration — CSV upload for the department's Users page.
//
// WHY: the console creates one account at a time; a new intake is dozens of
// students. The sheet is STUDENTS ONLY (the role is not a column — that is the
// whole point), and both `email` and `password` may be left blank:
//   • email   → derived from the SR code (23-93627@g.batstate-u.edu.ph), which
//               is exactly the rule the registration form enforces;
//   • password→ a temporary one is generated, shown in the result and offered
//               as a download so the office can hand it out.
//
// Everything is validated again on the SERVER (bulkCreateStudents → createUser),
// so a hand-edited file can never create something the single-user dialog would
// have refused.
// ============================================================

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  bulkCreateStudents,
  type BulkStudentInput,
  type BulkStudentResult,
} from "@/server/actions/department";
import { downloadCsv, normaliseHeader, parseCsv, toCsv } from "@/lib/csv";

const TEMPLATE_HEADERS = [
  "sr_code",
  "first_name",
  "middle_initial",
  "last_name",
  "suffix",
  "email",
  "password",
];

const TEMPLATE_SAMPLE_ROWS = [
  // email + password left blank on purpose: both are optional.
  ["23-93627", "Juan", "M", "Dela Cruz", "", "", ""],
  ["23-93628", "Maria", "", "Santos", "", "23-93628@g.batstate-u.edu.ph", ""],
];

/** Read a field by any of its accepted header spellings. */
function field(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const key = normaliseHeader(name);
    if (row[key]) return row[key];
  }
  return "";
}

export default function StudentBulkUpload({
  onDone,
}: {
  /** Called after a successful batch so the parent can refetch the list. */
  onDone?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BulkStudentInput[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<BulkStudentResult[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]);
    setResults(null);
    setParseError(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadTemplate() {
    // A comment row is not possible in CSV, so the instructions live in the
    // dialog; the file is just headers + two sample rows.
    downloadCsv(
      "student-registration-template.csv",
      toCsv(TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROWS),
    );
  }

  async function handleFile(file: File | undefined) {
    setResults(null);
    setParseError(null);
    setRows([]);
    if (!file) return;

    if (!/\.csv$/i.test(file.name)) {
      setParseError("Please choose a .csv file (the template is CSV).");
      return;
    }

    const text = await file.text();
    const { headers, rows: records, lines } = parseCsv(text);

    if (records.length === 0) {
      setParseError("That file has no rows below the header.");
      return;
    }
    if (!headers.includes("sr_code") && !headers.includes("srcode")) {
      setParseError(
        `Missing an "sr_code" column. Expected headers: ${TEMPLATE_HEADERS.join(", ")}.`,
      );
      return;
    }

    const parsed: BulkStudentInput[] = records.map((row, index) => ({
      line: lines[index] ?? index + 2,
      srCode: field(row, "sr_code", "srcode", "sr code"),
      firstName: field(row, "first_name", "firstname", "given_name"),
      middleInitial: field(row, "middle_initial", "middleinitial", "mi", "middle"),
      lastName: field(row, "last_name", "lastname", "surname"),
      suffix: field(row, "suffix"),
      email: field(row, "email", "email_address"),
      password: field(row, "password", "temp_password"),
    }));

    setFileName(file.name);
    setRows(parsed);
  }

  async function handleUpload() {
    if (rows.length === 0) return;
    setUploading(true);
    try {
      const response = await bulkCreateStudents(rows);
      if (!response.success) {
        toast.error(response.error);
        setParseError(response.error);
        return;
      }
      setResults(response.data.results);
      toast.success(
        `${response.data.created} student${response.data.created === 1 ? "" : "s"} created${
          response.data.failed > 0 ? `, ${response.data.failed} failed` : ""
        }.`,
      );
      await onDone?.();
      // Let the user read the report before the list behind the dialog changes.
    } catch (error) {
      console.error("[bulk-upload] failed:", error);
      toast.error("The upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function downloadResults() {
    if (!results) return;
    downloadCsv(
      "student-registration-results.csv",
      toCsv(
        ["line", "sr_code", "name", "email", "status", "password", "error"],
        results.map((r) => [
          r.line,
          r.srCode,
          r.name,
          r.email,
          r.status,
          r.status === "created" ? r.password ?? "" : "",
          r.error ?? "",
        ]),
      ),
    );
  }

  const createdCount = results?.filter((r) => r.status === "created").length ?? 0;
  const failedCount = results ? results.length - createdCount : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Bulk upload (CSV)
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 text-[#8B1A1A]" />
            Register students from a CSV
          </DialogTitle>
          <DialogDescription>
            One row per student. The Role is always <strong>Student</strong>{" "}
            — there is no role column. Leave <code>email</code> blank to derive it
            from the SR code, and <code>password</code> blank to generate a
            temporary one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 1. Template */}
          <div className="rounded-lg border bg-gray-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[#333]">Template</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Headers: <span className="font-mono">{TEMPLATE_HEADERS.join(", ")}</span>
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                <Download className="h-3.5 w-3.5" />
                Download CSV template
              </Button>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
              <li>
                <code>sr_code</code> — 23-93627 (a bare 2393627 is accepted and
                dashed for you).
              </li>
              <li>
                <code>middle_initial</code> and <code>suffix</code> are optional.
              </li>
              <li>
                If you fill <code>email</code>, its local part must equal the SR
                code — the same rule the registration form enforces.
              </li>
            </ul>
          </div>

          {/* 2. File */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#333]" htmlFor="bulk-csv">
              CSV file
            </label>
            <input
              id="bulk-csv"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void handleFile(e.target.files?.[0])}
              className="block w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#8B1A1A] file:px-3 file:py-1.5 file:text-white hover:file:bg-[#a02020]"
            />
            {fileName && rows.length > 0 && !results && (
              <p className="text-xs text-gray-500">
                <span className="font-medium text-[#333]">{fileName}</span> —{" "}
                {rows.length} row{rows.length === 1 ? "" : "s"} ready. First:{" "}
                {rows[0].firstName} {rows[0].lastName} ({rows[0].srCode || "no SR code"}).
              </p>
            )}
            {parseError && (
              <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {parseError}
              </p>
            )}
          </div>

          {/* 3. Report */}
          {results && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-semibold text-green-700">{createdCount} created</span>
                  {failedCount > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-red-600">{failedCount} failed</span>
                    </>
                  )}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={downloadResults} className="gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Download results (with passwords)
                </Button>
              </div>

              <div className="max-h-64 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-2 py-1.5">Line</th>
                      <th className="px-2 py-1.5">SR Code</th>
                      <th className="px-2 py-1.5">Name</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {results.map((r) => (
                      <tr key={`${r.line}-${r.email}`}>
                        <td className="px-2 py-1.5 text-gray-500">{r.line}</td>
                        <td className="px-2 py-1.5 font-mono">{r.srCode}</td>
                        <td className="px-2 py-1.5 text-[#333]">{r.name}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`rounded-full border px-1.5 py-0.5 font-semibold uppercase ${
                              r.status === "created"
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-red-200 bg-red-50 text-red-700"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-gray-500">
                          {r.status === "created" ? (
                            <span className="font-mono text-[11px]">{r.password}</span>
                          ) : (
                            r.error
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400">
                Hand the temporary passwords out securely — students can change
                them from their profile page once signed in.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploading || rows.length === 0 || !!results}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating accounts…
              </>
            ) : (
              `Create ${rows.length || ""} account${rows.length === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
