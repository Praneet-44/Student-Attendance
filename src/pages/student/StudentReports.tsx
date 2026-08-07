import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Download, Filter } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { calculateStats, formatDate, getAttendanceColor } from "../../lib/utils";
import type { Attendance, Student } from "../../lib/types";
import { getDemoStudentData } from "../../lib/demoData";

interface AttendanceWithSubject extends Attendance {
  subjects: { name: string; code: string } | null;
}

interface StudentWithRelations extends Student {
  profiles: { name: string } | null;
  departments: { name: string; code: string } | null;
}

export function StudentReports() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [records, setRecords] = useState<AttendanceWithSubject[]>([]);
  const [studentInfo, setStudentInfo] = useState<StudentWithRelations | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ subject_id: "", month: "" });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!profile) return;
    setLoading(true);

    if (profile.id.startsWith("demo-")) {
      const { studentInfo: demoInfo, records: demoRecords } = getDemoStudentData();
      setStudentInfo(demoInfo as unknown as StudentWithRelations);
      const atts = demoRecords as unknown as AttendanceWithSubject[];
      setRecords(atts);
      const subjMap = new Map<string, { id: string; name: string; code: string }>();
      atts.forEach((a) => {
        if (a.subjects) subjMap.set(a.subject_id, { id: a.subject_id, name: a.subjects.name, code: a.subjects.code });
      });
      setSubjects(Array.from(subjMap.values()));
      setLoading(false);
      return;
    }

    try {
      const [studentRes, attRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, roll_number, department_id, semester, profiles(name), departments(name, code)")
          .eq("id", profile.id)
          .maybeSingle(),
        supabase
          .from("attendance")
          .select("id, student_id, subject_id, date, status, created_at, subjects(name, code)")
          .eq("student_id", profile.id)
          .order("date", { ascending: false }),
      ]);

      if (studentRes.error || !studentRes.data) {
        const { studentInfo: demoInfo, records: demoRecords } = getDemoStudentData();
        setStudentInfo(demoInfo as unknown as StudentWithRelations);
        const atts = demoRecords as unknown as AttendanceWithSubject[];
        setRecords(atts);
        const subjMap = new Map<string, { id: string; name: string; code: string }>();
        atts.forEach((a) => {
          if (a.subjects) subjMap.set(a.subject_id, { id: a.subject_id, name: a.subjects.name, code: a.subjects.code });
        });
        setSubjects(Array.from(subjMap.values()));
      } else {
        setStudentInfo(studentRes.data as unknown as StudentWithRelations);
        const atts = (attRes.data || []) as unknown as AttendanceWithSubject[];
        setRecords(atts);
        const subjMap = new Map<string, { id: string; name: string; code: string }>();
        atts.forEach((a) => {
          if (a.subjects) subjMap.set(a.subject_id, { id: a.subject_id, name: a.subjects.name, code: a.subjects.code });
        });
        setSubjects(Array.from(subjMap.values()));
      }
    } catch {
      const { studentInfo: demoInfo, records: demoRecords } = getDemoStudentData();
      setStudentInfo(demoInfo as unknown as StudentWithRelations);
      const atts = demoRecords as unknown as AttendanceWithSubject[];
      setRecords(atts);
      const subjMap = new Map<string, { id: string; name: string; code: string }>();
      atts.forEach((a) => {
        if (a.subjects) subjMap.set(a.subject_id, { id: a.subject_id, name: a.subjects.name, code: a.subjects.code });
      });
      setSubjects(Array.from(subjMap.values()));
    } finally {
      setLoading(false);
    }
  }

  const filtered = records.filter((r) => {
    if (filters.subject_id && r.subject_id !== filters.subject_id) return false;
    if (filters.month) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key !== filters.month) return false;
    }
    return true;
  });

  const stats = calculateStats(filtered);

  const monthOptions = (() => {
    const months = new Set<string>();
    records.forEach((r) => {
      const d = new Date(r.date);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(months).sort().reverse();
  })();

  function exportExcel() {
    const data = filtered.map((r) => ({
      "Date": formatDate(r.date),
      "Day": new Date(r.date).toLocaleDateString("en-US", { weekday: "long" }),
      "Subject": r.subjects?.name || "",
      "Code": r.subjects?.code || "",
      "Status": r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "My Attendance");
    XLSX.writeFile(wb, `my_attendance_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("success", "Excel report downloaded");
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("My Attendance Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Name: ${profile?.name}`, 14, 30);
    doc.text(`Roll No: ${studentInfo?.roll_number || "—"}`, 14, 36);
    if (studentInfo?.departments) {
      doc.text(`Department: ${studentInfo.departments.name}`, 14, 42);
    }
    doc.text(`Semester: ${studentInfo?.semester || 1}`, 14, 48);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 54);
    doc.text(`Total: ${stats.total} | Present: ${stats.present} | Absent: ${stats.absent} | Rate: ${stats.percentage}%`, 14, 60);

    autoTable(doc, {
      startY: 68,
      head: [["Date", "Day", "Subject", "Code", "Status"]],
      body: filtered.map((r) => [
        formatDate(r.date),
        new Date(r.date).toLocaleDateString("en-US", { weekday: "short" }),
        r.subjects?.name || "",
        r.subjects?.code || "",
        r.status,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.save(`my_attendance_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast("success", "PDF report downloaded");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Download Reports</h1>
        <p className="text-slate-500 mt-1">Export your attendance data</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-slate-500 text-sm font-medium">
          <Filter size={16} /> Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select label="Subject" value={filters.subject_id} onChange={(e) => setFilters({ ...filters, subject_id: e.target.value })}>
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>
          <Select label="Month" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}>
            <option value="">All Months</option>
            {monthOptions.map((m) => {
              const [y, mo] = m.split("-");
              const monthName = new Date(parseInt(y), parseInt(mo) - 1).toLocaleString("en-US", { month: "long" });
              return <option key={m} value={m}>{monthName} {y}</option>;
            })}
          </Select>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={exportExcel} className="flex-1">
              <FileSpreadsheet size={16} /> Excel
            </Button>
            <Button variant="outline" onClick={exportPDF} className="flex-1">
              <FileText size={16} /> PDF
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <p className="text-sm text-slate-500">Total Classes</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-slate-500">Present</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.present}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-slate-500">Absent</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{stats.absent}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-slate-500">Attendance Rate</p>
          <p className={`text-2xl font-bold mt-1 ${getAttendanceColor(stats.percentage)}`}>{stats.percentage}%</p>
        </Card>
      </div>

      {/* Download buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Excel Report</h3>
              <p className="text-sm text-slate-500">Download as .xlsx spreadsheet</p>
            </div>
          </div>
          <Button variant="outline" onClick={exportExcel} className="w-full">
            <Download size={16} /> Download Excel
          </Button>
        </Card>
        <Card className="p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
              <FileText size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">PDF Report</h3>
              <p className="text-sm text-slate-500">Download as PDF document</p>
            </div>
          </div>
          <Button variant="outline" onClick={exportPDF} className="w-full">
            <Download size={16} /> Download PDF
          </Button>
        </Card>
      </div>

      {/* Preview */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <h3 className="font-semibold text-slate-900">Preview</h3>
          <Badge variant="default">{filtered.length} records</Badge>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No records found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, 50).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.subjects?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.status === "present" ? "success" : "danger"}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 50 && (
              <div className="px-4 py-3 text-center text-sm text-slate-400 border-t border-slate-100">
                Showing 50 of {filtered.length} records. Export to see all.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
