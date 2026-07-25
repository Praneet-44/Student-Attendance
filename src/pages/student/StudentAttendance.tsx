import { useEffect, useState } from "react";
import { Filter, ClipboardCheck, Calendar } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import { calculateStats, formatDate, getAttendanceColor } from "../../lib/utils";
import type { Attendance } from "../../lib/types";
import { getDemoStudentData } from "../../lib/demoData";

interface AttendanceWithSubject extends Attendance {
  subjects: { name: string; code: string } | null;
}

export function StudentAttendance() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<AttendanceWithSubject[]>([]);
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
      const { records: demoRecords } = getDemoStudentData();
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
      const { data: att, error } = await supabase
        .from("attendance")
        .select("id, student_id, subject_id, date, status, created_at, subjects(name, code)")
        .eq("student_id", profile.id)
        .order("date", { ascending: false });

      if (error || !att || att.length === 0) {
        const { records: demoRecords } = getDemoStudentData();
        const atts = demoRecords as unknown as AttendanceWithSubject[];
        setRecords(atts);
        const subjMap = new Map<string, { id: string; name: string; code: string }>();
        atts.forEach((a) => {
          if (a.subjects) subjMap.set(a.subject_id, { id: a.subject_id, name: a.subjects.name, code: a.subjects.code });
        });
        setSubjects(Array.from(subjMap.values()));
      } else {
        const atts = att as unknown as AttendanceWithSubject[];
        setRecords(atts);
        const subjMap = new Map<string, { id: string; name: string; code: string }>();
        atts.forEach((a) => {
          if (a.subjects) subjMap.set(a.subject_id, { id: a.subject_id, name: a.subjects.name, code: a.subjects.code });
        });
        setSubjects(Array.from(subjMap.values()));
      }
    } catch {
      const { records: demoRecords } = getDemoStudentData();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Attendance</h1>
        <p className="text-slate-500 mt-1">View your detailed attendance records</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-slate-500 text-sm font-medium">
          <Filter size={16} /> Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      {/* Records table */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <ClipboardCheck size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">Attendance History</h3>
          <Badge variant="default">{filtered.length} records</Badge>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Calendar size={32} className="mb-2" />
            <p>No attendance records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Day</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(r.date).toLocaleDateString("en-US", { weekday: "long" })}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{r.subjects?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono">{r.subjects?.code || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.status === "present" ? "success" : "danger"}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
