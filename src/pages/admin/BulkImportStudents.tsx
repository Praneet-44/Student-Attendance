import { useEffect, useRef, useState } from "react";
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Users, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, ADMIN_FUNCTION_URL } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import type { Department } from "../../lib/types";

interface ParsedStudent {
  row: number;
  name: string;
  email: string;
  password: string;
  roll_number: string;
  department_code: string;
  semester: number;
  department_id?: string;
  errors: string[];
}

interface ImportResult {
  row: number;
  email: string;
  success: boolean;
  error?: string;
}

const REQUIRED_COLUMNS = ["name", "email", "password", "roll_number", "department_code", "semester"];

export function BulkImportStudents() {
  const { showToast } = useToast();
  const { session } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    supabase
      .from("departments")
      .select("id, name, code")
      .order("name")
      .then(({ data }) => setDepartments(data || []));
  }, []);

  // ── Template Download ────────────────────────────────────────────────────────
  function downloadTemplate() {
    const sampleRows = [
      {
        name: "Alice Johnson",
        email: "alice@university.edu",
        password: "password123",
        roll_number: "CS2024001",
        department_code: "CSE",
        semester: 1,
      },
      {
        name: "Bob Smith",
        email: "bob@university.edu",
        password: "password123",
        roll_number: "CS2024002",
        department_code: "CSE",
        semester: 1,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);

    // Column widths
    ws["!cols"] = [
      { wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");

    // Add department reference sheet
    const deptData = departments.length
      ? departments.map((d) => ({ Department_Name: d.name, Code_to_use: d.code }))
      : [{ Department_Name: "Computer Science & Engineering", Code_to_use: "CSE" }];
    const wsRef = XLSX.utils.json_to_sheet(deptData);
    XLSX.utils.book_append_sheet(wb, wsRef, "Department Codes");

    XLSX.writeFile(wb, "student_bulk_import_template.xlsx");
    showToast("success", "Template downloaded");
  }

  // ── File Parsing ─────────────────────────────────────────────────────────────
  function handleFile(file: File) {
    if (!file) return;
    setFileName(file.name);
    setResults([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        if (rows.length === 0) {
          showToast("error", "The file is empty.");
          return;
        }

        // Validate headers
        const firstRow = rows[0];
        const missing = REQUIRED_COLUMNS.filter(
          (col) => !(col in firstRow) && !(col.charAt(0).toUpperCase() + col.slice(1) in firstRow)
        );
        if (missing.length > 0) {
          showToast("error", `Missing columns: ${missing.join(", ")}`);
          return;
        }

        const deptMap = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));

        const parsed: ParsedStudent[] = rows.map((row, i) => {
          const get = (key: string) => {
            const val = row[key] ?? row[key.charAt(0).toUpperCase() + key.slice(1)];
            return val !== undefined && val !== null ? String(val).trim() : "";
          };

          const name = get("name");
          const email = get("email");
          const password = get("password");
          const roll_number = get("roll_number");
          const department_code = get("department_code").toUpperCase();
          const semRaw = row["semester"] ?? row["Semester"];
          const semester = semRaw ? parseInt(String(semRaw)) : NaN;

          const errors: string[] = [];
          if (!name) errors.push("Name is required");
          if (!email) errors.push("Email is required");
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email format");
          if (!password) errors.push("Password is required");
          else if (password.length < 6) errors.push("Password must be ≥ 6 characters");
          if (!roll_number) errors.push("Roll number is required");
          if (!department_code) errors.push("department_code is required");
          else if (!deptMap.has(department_code)) errors.push(`Unknown dept code: ${department_code}`);
          if (!semRaw) errors.push("Semester is required");
          else if (isNaN(semester) || semester < 1 || semester > 12) errors.push("Semester must be 1–12");

          return {
            row: i + 1,
            name,
            email,
            password,
            roll_number,
            department_code,
            semester: isNaN(semester) ? 1 : semester,
            department_id: deptMap.get(department_code),
            errors,
          };
        });

        setParsedStudents(parsed);
        const errCount = parsed.filter((p) => p.errors.length > 0).length;
        if (errCount > 0) {
          showToast("info", `${parsed.length} rows parsed — ${errCount} have errors. Fix before importing.`);
        } else {
          showToast("success", `${parsed.length} rows parsed and ready to import.`);
        }
      } catch {
        showToast("error", "Failed to parse Excel file. Check the format.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  async function handleImport() {
    const valid = parsedStudents.filter((s) => s.errors.length === 0);
    if (valid.length === 0) return;

    setImporting(true);
    setImportProgress(0);
    setResults([]);

    // Send in batches of 20 so we can show progress
    const BATCH = 20;
    const allResults: ImportResult[] = [];

    for (let start = 0; start < valid.length; start += BATCH) {
      const batch = valid.slice(start, start + BATCH).map((s) => ({
        name: s.name,
        email: s.email,
        password: s.password,
        roll_number: s.roll_number,
        department_id: s.department_id,
        semester: s.semester,
        role: "student" as const,
      }));

      try {
        const res = await fetch(`${ADMIN_FUNCTION_URL}/bulk-create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ students: batch }),
        });

        if (!res.ok) {
          // Whole batch failed
          const errData = await res.json().catch(() => ({}));
          batch.forEach((s, bi) =>
            allResults.push({
              row: start + bi + 1,
              email: s.email,
              success: false,
              error: errData?.error || "Batch request failed",
            })
          );
        } else {
          const data = await res.json();
          (data.results as ImportResult[]).forEach((r, bi) =>
            allResults.push({ ...r, row: start + bi + 1 })
          );
        }
      } catch (err) {
        batch.forEach((s, bi) =>
          allResults.push({
            row: start + bi + 1,
            email: s.email,
            success: false,
            error: err instanceof Error ? err.message : "Network error",
          })
        );
      }

      setImportProgress(Math.round(((start + BATCH) / valid.length) * 100));
    }

    setResults(allResults);
    setImporting(false);

    const ok = allResults.filter((r) => r.success).length;
    const fail = allResults.filter((r) => !r.success).length;
    if (ok > 0) showToast("success", `${ok} students imported successfully!`);
    if (fail > 0) showToast("error", `${fail} students failed. See results below.`);
  }

  // ── Derived State ────────────────────────────────────────────────────────────
  const validCount = parsedStudents.filter((s) => s.errors.length === 0).length;
  const errorCount = parsedStudents.filter((s) => s.errors.length > 0).length;
  const resultSuccess = results.filter((r) => r.success).length;
  const resultFail = results.filter((r) => !r.success).length;
  const hasResults = results.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Student Import</h1>
          <p className="text-slate-500 mt-1">
            Upload an Excel file to create multiple student accounts at once
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download size={16} /> Download Template
        </Button>
      </div>

      {/* Instructions card */}
      <Card className="p-5 bg-blue-50 border border-blue-100">
        <div className="flex gap-3">
          <div className="mt-0.5 text-blue-500 shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="space-y-1 text-sm text-blue-800">
            <p className="font-semibold">Required Excel columns:</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {REQUIRED_COLUMNS.map((col) => (
                <code key={col} className="px-2 py-0.5 bg-blue-100 rounded text-blue-700 font-mono text-xs">
                  {col}
                </code>
              ))}
            </div>
            <p className="text-xs text-blue-600 mt-2">
              Use the <strong>Download Template</strong> button for a pre-filled Excel file with
              correct column names and a department code reference sheet.
            </p>
          </div>
        </div>
      </Card>

      {/* Upload zone */}
      <Card className="p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            dragActive
              ? "border-blue-500 bg-blue-50"
              : fileName
              ? "border-emerald-400 bg-emerald-50"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <div className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              fileName ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
            }`}>
              <FileSpreadsheet size={28} />
            </div>
            <div>
              {fileName ? (
                <>
                  <p className="text-sm font-semibold text-emerald-700">{fileName}</p>
                  <p className="text-xs text-slate-500 mt-1">Click to replace file</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-900">
                    Drop your Excel file here or click to browse
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Supports .xlsx and .xls</p>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Parse preview */}
      {parsedStudents.length > 0 && !hasResults && (
        <Card>
          {/* Toolbar */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-900">Preview</h3>
              <Badge variant="success">{validCount} Ready</Badge>
              {errorCount > 0 && <Badge variant="danger">{errorCount} Errors</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setParsedStudents([]); setFileName(""); }}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importing || validCount === 0}
              >
                {importing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Importing… {importProgress}%
                  </>
                ) : (
                  <>
                    <Upload size={15} />
                    Import {validCount} Students
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          {importing && (
            <div className="px-5 py-2 bg-slate-50 border-b border-slate-200">
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Processing students… please wait
              </p>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Roll No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Sem</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedStudents.map((s) => (
                  <tr
                    key={s.row}
                    className={s.errors.length > 0 ? "bg-rose-50" : "hover:bg-slate-50"}
                  >
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{s.row}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{s.name || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.email || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{s.roll_number || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={s.department_id ? "info" : "warning"}>
                        {s.department_code || "?"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{s.semester}</td>
                    <td className="px-4 py-2.5">
                      {s.errors.length === 0 ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs">
                          <CheckCircle2 size={14} /> Ready
                        </span>
                      ) : (
                        <span className="text-rose-600 text-xs">{s.errors.join(" · ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Import Results */}
      {hasResults && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Users size={22} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{resultSuccess}</p>
                <p className="text-sm text-slate-500">Imported</p>
              </div>
            </Card>
            <Card className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center">
                <XCircle size={22} className="text-rose-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{resultFail}</p>
                <p className="text-sm text-slate-500">Failed</p>
              </div>
            </Card>
            <Card className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <FileSpreadsheet size={22} className="text-slate-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{results.length}</p>
                <p className="text-sm text-slate-500">Total Processed</p>
              </div>
            </Card>
          </div>

          {/* Failures detail (collapsible) */}
          {resultFail > 0 && (
            <Card>
              <button
                onClick={() => setShowErrors((v) => !v)}
                className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
              >
                <span className="flex items-center gap-2">
                  <XCircle size={16} /> {resultFail} Failed Rows — click to review
                </span>
                {showErrors ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showErrors && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Row</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results
                        .filter((r) => !r.success)
                        .map((r) => (
                          <tr key={r.row} className="bg-rose-50">
                            <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.row}</td>
                            <td className="px-4 py-2.5 text-slate-700">{r.email}</td>
                            <td className="px-4 py-2.5 text-rose-600 text-xs">{r.error}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Start over */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setParsedStudents([]);
                setResults([]);
                setFileName("");
                setImportProgress(0);
              }}
            >
              Import Another File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
