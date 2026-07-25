import { useEffect, useState, useRef } from "react";
import { Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle, X } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { formatDateInput } from "../../lib/utils";
import type { Subject, Student } from "../../lib/types";

interface StudentWithProfile extends Student {
  profiles: { name: string } | null;
}

interface ImportRow {
  roll_number: string;
  date: string;
  status: string;
  student_id?: string;
  error?: string;
}

export function ExcelUpload() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [students, setStudents] = useState<StudentWithProfile[]>([]);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; errors: number; duplicates: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSubjects();
  }, []);

  useEffect(() => {
    if (selectedSubject) loadStudents();
  }, [selectedSubject]);

  async function loadSubjects() {
    if (!profile) return;
    const { data } = await supabase
      .from("subjects")
      .select("id, name, code, semester, department_id")
      .eq("teacher_id", profile.id)
      .order("name");
    setSubjects((data || []) as unknown as Subject[]);
    if (data && data.length > 0) setSelectedSubject(data[0].id);
  }

  async function loadStudents() {
    const subject = subjects.find((s) => s.id === selectedSubject);
    let query = supabase.from("students").select("id, roll_number, department_id, semester, profiles(name)").order("roll_number");
    if (subject?.department_id) query = query.eq("department_id", subject.department_id);
    if (subject?.semester) query = query.eq("semester", subject.semester);
    const { data } = await query;
    setStudents((data || []) as unknown as StudentWithProfile[]);
  }

  function handleFile(file: File) {
    if (!selectedSubject) {
      showToast("error", "Please select a subject first");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        const studentMap = new Map(students.map((s) => [s.roll_number.toLowerCase(), s]));

        const parsed: ImportRow[] = rows.map((row) => {
          const rollNumber = String(row["roll_number"] || row["Roll Number"] || row["Roll No"] || row["roll no"] || "").trim();
          const dateStr = String(row["date"] || row["Date"] || "").trim();
          const status = String(row["status"] || row["Status"] || row["attendance"] || row["Attendance"] || "").trim().toLowerCase();

          const errors: string[] = [];
          if (!rollNumber) errors.push("Missing roll number");
          if (!dateStr) errors.push("Missing date");
          if (!status) errors.push("Missing status");
          if (status && !["present", "absent", "p", "a"].includes(status)) errors.push("Invalid status (use present/absent)");

          const student = studentMap.get(rollNumber.toLowerCase());
          if (!student) errors.push(`Student "${rollNumber}" not found`);

          // Parse date
          let parsedDate = dateStr;
          if (dateStr) {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
              parsedDate = formatDateInput(d);
            }
          }

          const normalizedStatus = status === "p" ? "present" : status === "a" ? "absent" : status;

          return {
            roll_number: rollNumber,
            date: parsedDate,
            status: normalizedStatus,
            student_id: student?.id,
            error: errors.length > 0 ? errors.join("; ") : undefined,
          };
        });

        setParsedRows(parsed);
        setImportResults(null);
        showToast("info", `${parsed.length} rows parsed. Review before importing.`);
      } catch {
        showToast("error", "Failed to parse Excel file. Please check the format.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadTemplate() {
    const template = students.map((s) => ({
      roll_number: s.roll_number,
      name: s.profiles?.name || "",
      date: formatDateInput(new Date()),
      status: "present",
    }));
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Template");
    XLSX.writeFile(wb, "attendance_template.xlsx");
    showToast("success", "Template downloaded");
  }

  async function handleImport() {
    if (!selectedSubject || parsedRows.length === 0) return;
    setImporting(true);
    setImportResults(null);

    const validRows = parsedRows.filter((r) => !r.error && r.student_id);
    const invalidRows = parsedRows.filter((r) => r.error);

    // Check for duplicates within the file
    const seen = new Set<string>();
    const duplicates: ImportRow[] = [];
    const toInsert: { student_id: string; subject_id: string; date: string; status: string }[] = [];

    for (const row of validRows) {
      const key = `${row.student_id}-${row.date}`;
      if (seen.has(key)) {
        duplicates.push(row);
      } else {
        seen.add(key);
        toInsert.push({
          student_id: row.student_id!,
          subject_id: selectedSubject,
          date: row.date,
          status: row.status,
        });
      }
    }

    // Check existing attendance in DB
    const dates = [...new Set(toInsert.map((r) => r.date))];
    const { data: existing } = await supabase
      .from("attendance")
      .select("student_id, date")
      .eq("subject_id", selectedSubject)
      .in("date", dates);

    const existingSet = new Set((existing || []).map((e) => `${e.student_id}-${e.date}`));
    const newRecords = toInsert.filter((r) => !existingSet.has(`${r.student_id}-${r.date}`));
    const dbDuplicates = toInsert.filter((r) => existingSet.has(`${r.student_id}-${r.date}`));

    let successCount = 0;
    let errorCount = 0;

    if (newRecords.length > 0) {
      const { error } = await supabase.from("attendance").insert(newRecords);
      if (error) {
        errorCount = newRecords.length;
      } else {
        successCount = newRecords.length;
      }
    }

    // Log to audit
    await supabase.from("audit_logs").insert({
      user_id: profile?.id,
      action: "excel_upload",
      details: `Imported ${successCount} attendance records for subject`,
    });

    setImportResults({
      success: successCount,
      errors: errorCount + invalidRows.length,
      duplicates: duplicates.length + dbDuplicates.length,
    });

    if (successCount > 0) {
      showToast("success", `${successCount} records imported successfully`);
    }
    if (errorCount > 0 || invalidRows.length > 0) {
      showToast("error", `${errorCount + invalidRows.length} records failed`);
    }
    if (duplicates.length + dbDuplicates.length > 0) {
      showToast("info", `${duplicates.length + dbDuplicates.length} duplicates skipped`);
    }

    setImporting(false);
  }

  const validCount = parsedRows.filter((r) => !r.error).length;
  const errorCount = parsedRows.filter((r) => r.error).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Excel Upload</h1>
        <p className="text-slate-500 mt-1">Bulk import attendance from an Excel file</p>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <Select label="Subject" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
            <option value="">Select a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download size={16} /> Download Template
          </Button>
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
            dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
              <FileSpreadsheet size={28} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">
                Drop your Excel file here or click to browse
              </p>
              <p className="text-xs text-slate-500 mt-1">Supports .xlsx and .xls formats</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Import results */}
      {importResults && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <CheckCircle size={24} className="text-emerald-600" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{importResults.success}</p>
              <p className="text-sm text-slate-500">Imported</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <X size={24} className="text-rose-600" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{importResults.errors}</p>
              <p className="text-sm text-slate-500">Errors</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <AlertCircle size={24} className="text-amber-600" />
            <div>
              <p className="text-2xl font-bold text-slate-900">{importResults.duplicates}</p>
              <p className="text-sm text-slate-500">Duplicates</p>
            </div>
          </Card>
        </div>
      )}

      {/* Parsed data preview */}
      {parsedRows.length > 0 && (
        <Card>
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900">Preview</h3>
              <Badge variant="success">{validCount} Valid</Badge>
              {errorCount > 0 && <Badge variant="danger">{errorCount} Errors</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setParsedRows([]); setImportResults(null); }}>
                Clear
              </Button>
              <Button size="sm" onClick={handleImport} disabled={importing || validCount === 0}>
                <Upload size={16} /> {importing ? "Importing..." : `Import ${validCount} Records`}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Roll No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedRows.map((row, i) => (
                  <tr key={i} className={row.error ? "bg-rose-50" : "hover:bg-slate-50"}>
                    <td className="px-4 py-3 text-sm text-slate-900 font-mono">{row.roll_number || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{row.date || "—"}</td>
                    <td className="px-4 py-3">
                      {row.status && (
                        <Badge variant={row.status === "present" ? "success" : "danger"}>{row.status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {row.error ? (
                        <span className="text-rose-600 text-xs">{row.error}</span>
                      ) : (
                        <span className="text-emerald-600 text-xs flex items-center gap-1">
                          <CheckCircle size={14} /> Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
