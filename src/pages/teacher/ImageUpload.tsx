import { useEffect, useState, useRef } from "react";
import {
  ImageIcon, Upload, CheckCircle, AlertCircle, X,
  Camera, Eye, Trash2, UserCheck, UserX,
} from "lucide-react";
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

interface AttendanceRow {
  student_id: string;
  roll_number: string;
  name: string;
  status: "present" | "absent";
}

export function ImageUpload() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [students, setStudents] = useState<StudentWithProfile[]>([]);
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; duplicates: number; errors: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSubjects();
  }, []);

  useEffect(() => {
    if (selectedSubject) loadStudents();
  }, [selectedSubject]);

  // When students load, initialize rows with all-present default
  useEffect(() => {
    if (students.length > 0) {
      setRows(
        students.map((s) => ({
          student_id: s.id,
          roll_number: s.roll_number,
          name: s.profiles?.name || "—",
          status: "present",
        }))
      );
    }
  }, [students]);

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
    let query = supabase
      .from("students")
      .select("id, roll_number, department_id, semester, profiles(name)")
      .order("roll_number");
    if (subject?.department_id) query = query.eq("department_id", subject.department_id);
    if (subject?.semester) query = query.eq("semester", subject.semester);
    const { data } = await query;
    setStudents((data || []) as unknown as StudentWithProfile[]);
  }

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      showToast("error", "Please upload an image file (JPG, PNG, etc.)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("error", "Image size must be under 10MB");
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setStep(2);
    showToast("info", "Image uploaded! Review and adjust attendance below, then import.");
  }

  function toggleStatus(studentId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.student_id === studentId
          ? { ...r, status: r.status === "present" ? "absent" : "present" }
          : r
      )
    );
  }

  function markAll(status: "present" | "absent") {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  }

  function removeImage() {
    setImagePreview(null);
    setImageFile(null);
    setStep(1);
    setImportResults(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleImport() {
    if (!selectedSubject || rows.length === 0 || !date) return;
    setImporting(true);
    setImportResults(null);

    // Check existing attendance for that date
    const studentIds = rows.map((r) => r.student_id);
    const { data: existing } = await supabase
      .from("attendance")
      .select("student_id")
      .eq("subject_id", selectedSubject)
      .eq("date", date)
      .in("student_id", studentIds);

    const existingSet = new Set((existing || []).map((e) => e.student_id));
    const toInsert = rows
      .filter((r) => !existingSet.has(r.student_id))
      .map((r) => ({
        student_id: r.student_id,
        subject_id: selectedSubject,
        date,
        status: r.status,
      }));

    const duplicatesCount = rows.length - toInsert.length;
    let successCount = 0;
    let errorCount = 0;

    if (toInsert.length > 0) {
      const { error } = await supabase.from("attendance").insert(toInsert);
      if (error) {
        errorCount = toInsert.length;
        showToast("error", "Failed to import: " + error.message);
      } else {
        successCount = toInsert.length;
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: profile?.id,
      action: "image_upload",
      details: `Imported ${successCount} attendance records via image upload for date ${date}`,
    });

    setImportResults({ success: successCount, duplicates: duplicatesCount, errors: errorCount });

    if (successCount > 0) showToast("success", `${successCount} attendance records saved!`);
    if (duplicatesCount > 0) showToast("info", `${duplicatesCount} records already existed and were skipped.`);

    setImporting(false);
  }

  const presentCount = rows.filter((r) => r.status === "present").length;
  const absentCount = rows.filter((r) => r.status === "absent").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Image Upload</h1>
        <p className="text-slate-500 mt-1">Upload an attendance sheet photo and mark attendance</p>
      </div>

      {/* Step 1: Subject & Date selection */}
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <Select
            label="Subject"
            value={selectedSubject}
            onChange={(e) => { setSelectedSubject(e.target.value); setStep(1); removeImage(); }}
          >
            <option value="">Select a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Date</label>
            <input
              type="date"
              value={date}
              max={formatDateInput(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex-1">
              <UserCheck size={16} className="text-emerald-600" />
              <span className="text-sm font-medium text-slate-700">{students.length} students loaded</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Step 1: Image Upload Zone */}
      {step === 1 && (
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
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragActive
                ? "border-violet-500 bg-violet-50"
                : "border-slate-300 hover:border-violet-400 hover:bg-violet-50/40"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center">
                <Camera size={36} className="text-violet-500" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">
                  Upload Attendance Sheet Photo
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Drop an image here, click to browse, or tap to use camera
                </p>
                <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG, WEBP — max 10MB</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">
                  <ImageIcon size={12} /> Browse Photo
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                  <Camera size={12} /> Use Camera
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Image Preview + Attendance Table */}
      {step === 2 && imagePreview && (
        <>
          {/* Image Preview */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye size={18} className="text-slate-500" />
                <h3 className="font-semibold text-slate-900">Uploaded Image Preview</h3>
                <Badge variant="info">{imageFile?.name}</Badge>
              </div>
              <button
                onClick={removeImage}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 max-h-80 flex items-center justify-center">
              <img
                src={imagePreview}
                alt="Attendance sheet"
                className="max-w-full max-h-80 object-contain"
              />
            </div>
          </Card>

          {/* Attendance Roster */}
          <Card>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Mark Attendance</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review the image above and toggle attendance for each student
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
                  <UserCheck size={16} /> {presentCount} Present
                </span>
                <span className="flex items-center gap-1 text-sm text-rose-600 font-medium">
                  <UserX size={16} /> {absentCount} Absent
                </span>
                <Button variant="outline" size="sm" onClick={() => markAll("present")}>All Present</Button>
                <Button variant="outline" size="sm" onClick={() => markAll("absent")}>All Absent</Button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                <p className="text-sm">No students found for this subject</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Roll No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Toggle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, i) => (
                      <tr
                        key={row.student_id}
                        className={`transition-colors ${
                          row.status === "present" ? "hover:bg-emerald-50/50" : "bg-rose-50/40 hover:bg-rose-50"
                        }`}
                      >
                        <td className="px-4 py-3 text-sm text-slate-400">{i + 1}</td>
                        <td className="px-4 py-3 text-sm text-slate-900 font-mono">{row.roll_number}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                              row.status === "present"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                            }`}>
                              {row.name.charAt(0).toUpperCase()}
                            </div>
                            {row.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={row.status === "present" ? "success" : "danger"}>
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleStatus(row.student_id)}
                            className={`w-10 h-6 rounded-full transition-all duration-200 relative ${
                              row.status === "present" ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                          >
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${
                              row.status === "present" ? "left-4" : "left-0.5"
                            }`} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Import Results */}
            {importResults && (
              <div className="px-5 py-4 border-t border-slate-200 grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle size={20} className="text-emerald-600" />
                  <div>
                    <p className="text-lg font-bold text-slate-900">{importResults.success}</p>
                    <p className="text-xs text-slate-500">Imported</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle size={20} className="text-amber-500" />
                  <div>
                    <p className="text-lg font-bold text-slate-900">{importResults.duplicates}</p>
                    <p className="text-xs text-slate-500">Duplicates Skipped</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <X size={20} className="text-rose-600" />
                  <div>
                    <p className="text-lg font-bold text-slate-900">{importResults.errors}</p>
                    <p className="text-xs text-slate-500">Errors</p>
                  </div>
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-3">
              <Button variant="outline" onClick={removeImage}>
                <Trash2 size={16} /> Start Over
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || rows.length === 0 || !!importResults}
              >
                <Upload size={16} />
                {importing ? "Saving..." : importResults ? "Saved!" : `Save ${presentCount} Present, ${absentCount} Absent`}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
