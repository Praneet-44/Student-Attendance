import { useEffect, useState } from "react";
import { FileBarChart, FileSpreadsheet, FileText, Filter } from "lucide-react";
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
import { calculateStats, formatDate } from "../../lib/utils";
import type { Attendance } from "../../lib/types";
import { DEMO_TEACHER_SUBJECTS, getDemoTeacherAttendance } from "../../lib/demoData";
import { getLocalCache, setLocalCache, withTimeout } from "../../lib/cache";

interface AttendanceWithRelations extends Attendance {
  subjects: { name: string; code: string } | null;
  students: { roll_number: string; profiles: { name: string } | null } | null;
}

export function TeacherReports() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [records, setRecords] = useState<AttendanceWithRelations[]>(() => getLocalCache("teacher_reports_records") || []);
  const [subjects, setSubjects] = useState<{ id: string; name: string; code: string }[]>(() => getLocalCache("teacher_reports_subjects") || []);
  const [loading, setLoading] = useState<boolean>(() => !getLocalCache("teacher_reports_subjects"));
  const [filters, setFilters] = useState({ subject_id: "", month: "" });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!profile) return;
    const hasCache = getLocalCache("teacher_reports_subjects") !== null;
    if (!hasCache) setLoading(true);

    if (profile.id.startsWith("demo-")) {
      const { todayAttendance, recentAttendance } = getDemoTeacherAttendance();
      setSubjects(DEMO_TEACHER_SUBJECTS);
      setRecords([...todayAttendance, ...recentAttendance] as unknown as AttendanceWithRelations[]);
      setLoading(false);
      return;
    }

    try {
      const { data: subs, error: subErr } = await withTimeout(
        supabase
          .from("subjects")
          .select("id, name, code")
          .eq("teacher_id", profile.id)
          .order("name"),
        1500
      );

      if (subErr || !subs || subs.length === 0) {
        if (!hasCache) {
          const { todayAttendance, recentAttendance } = getDemoTeacherAttendance();
          setSubjects(DEMO_TEACHER_SUBJECTS);
          setRecords([...todayAttendance, ...recentAttendance] as unknown as AttendanceWithRelations[]);
        }
      } else {
        setSubjects(subs);
        setLocalCache("teacher_reports_subjects", subs);
        const subjectIds = subs.map((s) => s.id);
        const { data: att } = await withTimeout(
          supabase
            .from("attendance")
            .select("id, student_id, subject_id, date, status, created_at, subjects(name, code), students(roll_number, profiles(name))")
            .in("subject_id", subjectIds)
            .order("date", { ascending: false })
            .limit(1000),
          1500
        );
        const fetchedRecords = (att || []) as unknown as AttendanceWithRelations[];
        setRecords(fetchedRecords);
        setLocalCache("teacher_reports_records", fetchedRecords);
      }
    } catch {
      if (!hasCache) {
        const { todayAttendance, recentAttendance } = getDemoTeacherAttendance();
        setSubjects(DEMO_TEACHER_SUBJECTS);
        setRecords([...todayAttendance, ...recentAttendance] as unknown as AttendanceWithRelations[]);
      }
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

  function exportExcel() {
    const data = filtered.map((r) => ({
      "Student Name": r.students?.profiles?.name || "",
      "Roll Number": r.students?.roll_number || "",
      "Subject": r.subjects?.name || "",
      "Date": formatDate(r.date),
      "Status": r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `teacher_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("success", "Excel report downloaded");
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Attendance Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Teacher: ${profile?.name}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);
    doc.text(`Total: ${stats.total} | Present: ${stats.present} | Absent: ${stats.absent} | Rate: ${stats.percentage}%`, 14, 40);

    autoTable(doc, {
      startY: 48,
      head: [["Student", "Roll No", "Subject", "Date", "Status"]],
      body: filtered.slice(0, 50).map((r) => [
        r.students?.profiles?.name || "",
        r.students?.roll_number || "",
        r.subjects?.name || "",
        formatDate(r.date),
        r.status,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.save(`teacher_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast("success", "PDF report downloaded");
  }

  const monthOptions = (() => {
    const months = new Set<string>();
    records.forEach((r) => {
      const d = new Date(r.date);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(months).sort().reverse();
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-500 mt-1">View and export attendance reports</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-slate-500 text-sm font-medium">
          <Filter size={16} /> Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select label="Subject" value={filters.subject_id} onChange={(e) => setFilters({ ...filters, subject_id: e.target.value })}>
            <option value="">All My Subjects</option>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <p className="text-sm text-slate-500">Total Records</p>
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
          <p className={`text-2xl font-bold mt-1 ${stats.percentage >= 75 ? "text-emerald-600" : "text-amber-600"}`}>{stats.percentage}%</p>
        </Card>
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <FileBarChart size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">Attendance Records</h3>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Roll No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, 100).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{r.students?.profiles?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{r.students?.roll_number || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.subjects?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.status === "present" ? "success" : "danger"}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <div className="px-4 py-3 text-center text-sm text-slate-400 border-t border-slate-100">
                Showing 100 of {filtered.length} records. Export to see all.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
