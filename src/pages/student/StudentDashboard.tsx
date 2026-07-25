import { useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, Calendar, BookOpen, AlertTriangle,
  CheckCircle, XCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card, StatCard } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import {
  calculateStats, getAttendanceColor, getAttendanceBg,
  getAttendanceBarColor, groupBySubject, getMonthName, formatDate,
} from "../../lib/utils";
import type { Attendance, Student } from "../../lib/types";
import { getDemoStudentData } from "../../lib/demoData";
import { getLocalCache, setLocalCache, withTimeout } from "../../lib/cache";

interface StudentWithRelations extends Student {
  profiles: { name: string } | null;
  departments: { name: string; code: string } | null;
}

interface AttendanceWithSubject extends Attendance {
  subjects: { name: string; code: string } | null;
}

const MIN_ATTENDANCE = 75;

export function StudentDashboard() {
  const { profile } = useAuth();
  const [studentInfo, setStudentInfo] = useState<StudentWithRelations | null>(() => getLocalCache("student_info"));
  const [records, setRecords] = useState<AttendanceWithSubject[]>(() => getLocalCache("student_records") || []);
  const [loading, setLoading] = useState<boolean>(() => !getLocalCache("student_info"));

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!profile) return;

    const hasCache = getLocalCache("student_info") !== null;
    if (!hasCache) setLoading(true);

    if (profile.id.startsWith("demo-")) {
      const { studentInfo: demoInfo, records: demoRecords } = getDemoStudentData();
      setStudentInfo(demoInfo as unknown as StudentWithRelations);
      setRecords(demoRecords as unknown as AttendanceWithSubject[]);
      setLoading(false);
      return;
    }

    try {
      const [studentRes, attRes] = await withTimeout(
        Promise.all([
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
        ]),
        1000
      );

      if (studentRes.error || !studentRes.data) {
        if (!hasCache) {
          const { studentInfo: demoInfo, records: demoRecords } = getDemoStudentData();
          setStudentInfo(demoInfo as unknown as StudentWithRelations);
          setRecords(demoRecords as unknown as AttendanceWithSubject[]);
        }
      } else {
        const fetchedInfo = studentRes.data as StudentWithRelations;
        const fetchedRecords = (attRes.data || []) as unknown as AttendanceWithSubject[];
        setStudentInfo(fetchedInfo);
        setRecords(fetchedRecords);
        setLocalCache("student_info", fetchedInfo);
        setLocalCache("student_records", fetchedRecords);
      }
    } catch {
      if (!hasCache) {
        const { studentInfo: demoInfo, records: demoRecords } = getDemoStudentData();
        setStudentInfo(demoInfo as unknown as StudentWithRelations);
        setRecords(demoRecords as unknown as AttendanceWithSubject[]);
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  const stats = calculateStats(records);
  const subjectStats = groupBySubject(records);
  const isLowAttendance = stats.percentage < MIN_ATTENDANCE && stats.total > 0;

  // Monthly breakdown
  const monthlyMap: Record<string, { present: number; total: number }> = {};
  records.forEach((r) => {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { present: 0, total: 0 };
    monthlyMap[key].total++;
    if (r.status === "present") monthlyMap[key].present++;
  });
  const monthlyData = Object.entries(monthlyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([key, val]) => {
      const [y, m] = key.split("-");
      return { month: `${getMonthName(parseInt(m) - 1)} ${y.slice(2)}`, percentage: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0 };
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile?.name}</h1>
        <p className="text-slate-500 mt-1">Your attendance overview</p>
      </div>

      {/* Student info card */}
      {studentInfo && (
        <Card className={`p-5 border-2 ${getAttendanceBg(stats.percentage)}`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center text-slate-700 font-bold text-xl shadow-sm">
                {profile?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{profile?.name}</h2>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-sm text-slate-600 font-mono">Roll: {studentInfo.roll_number}</span>
                  {studentInfo.departments && (
                    <Badge variant="info">{studentInfo.departments.code}</Badge>
                  )}
                  <Badge variant="default">Sem {studentInfo.semester}</Badge>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Overall Attendance</p>
              <p className={`text-3xl font-bold ${getAttendanceColor(stats.percentage)}`}>{stats.percentage}%</p>
            </div>
          </div>
        </Card>
      )}

      {/* Low attendance alert */}
      {isLowAttendance && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200">
          <AlertTriangle size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-rose-900">Attendance is below minimum required ({MIN_ATTENDANCE}%)</p>
            <p className="text-sm text-rose-700 mt-0.5">
              Your current attendance is {stats.percentage}%. Please attend classes regularly to maintain the minimum requirement.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Present Days" value={stats.present} icon={<TrendingUp size={22} />} color="text-emerald-600" />
        <StatCard label="Absent Days" value={stats.absent} icon={<TrendingDown size={22} />} color="text-rose-600" />
        <StatCard label="Total Classes" value={stats.total} icon={<Calendar size={22} />} color="text-blue-600" />
      </div>

      {/* Subject-wise attendance */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Subject-wise Attendance</h3>
        </div>
        {Object.keys(subjectStats).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <BookOpen size={28} className="mb-2" />
            <p className="text-sm">No attendance records yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {Object.entries(subjectStats).map(([subjectId, { stats: s }]) => {
              const subject = records.find((r) => r.subject_id === subjectId)?.subjects;
              return (
                <div key={subjectId} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <BookOpen size={18} className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-900">{subject?.name || "Unknown"}</span>
                      <span className="text-xs text-slate-400">({subject?.code || ""})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">{s.present}/{s.total}</span>
                      <span className={`text-sm font-bold ${getAttendanceColor(s.percentage)}`}>{s.percentage}%</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${getAttendanceBarColor(s.percentage)}`}
                      style={{ width: `${s.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Monthly trend */}
      {monthlyData.length > 0 && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Monthly Attendance Trend</h3>
          <div className="flex items-end justify-between gap-3 h-40 pt-4">
            {monthlyData.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-slate-600">{m.percentage}%</span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-md transition-all duration-700 ${getAttendanceBarColor(m.percentage)}`}
                    style={{ height: `${m.percentage}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 text-center">{m.month}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent attendance */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Recent Attendance</h3>
        </div>
        {records.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No attendance records yet</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {records.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.status === "present" ? "bg-emerald-50" : "bg-rose-50"}`}>
                    {r.status === "present" ? <CheckCircle size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-rose-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{r.subjects?.name || "Unknown"}</p>
                    <p className="text-xs text-slate-500">{formatDate(r.date)}</p>
                  </div>
                </div>
                <Badge variant={r.status === "present" ? "success" : "danger"}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
