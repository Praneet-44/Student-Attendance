import { useEffect, useState } from "react";
import {
  Users, BookOpen, Building2, ClipboardCheck, TrendingUp,
  TrendingDown, Calendar,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card, StatCard } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { calculateStats, getMonthName } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import type { Attendance } from "../../lib/types";
import { getDemoAdminData } from "../../lib/demoData";
import { getLocalCache, setLocalCache, withTimeout } from "../../lib/cache";

export function AdminDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<{ students: number; teachers: number; subjects: number; departments: number }>(() => getLocalCache("admin_stats") || { students: 0, teachers: 0, subjects: 0, departments: 0 });
  const [attendanceStats, setAttendanceStats] = useState<{ total: number; present: number; absent: number; percentage: number }>(() => getLocalCache("admin_att_stats") || { total: 0, present: 0, absent: 0, percentage: 0 });
  const [monthlyData, setMonthlyData] = useState<{ month: string; percentage: number }[]>(() => getLocalCache("admin_monthly") || []);
  const [recentActivity, setRecentActivity] = useState<Attendance[]>(() => getLocalCache("admin_logs") || []);
  const [loading, setLoading] = useState<boolean>(() => !getLocalCache("admin_stats"));

  useEffect(() => {
    loadDashboard();
  }, []);

  function applyDemoData() {
    const demo = getDemoAdminData();
    setStats(demo.counts);
    const allAttendance = demo.attendanceOverview as unknown as Attendance[];
    setAttendanceStats(calculateStats(allAttendance));

    const monthlyMap: Record<string, { present: number; total: number }> = {};
    for (const a of allAttendance) {
      const d = new Date(a.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap[key]) monthlyMap[key] = { present: 0, total: 0 };
      monthlyMap[key].total++;
      if (a.status === "present") monthlyMap[key].present++;
    }
    const monthly = Object.entries(monthlyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, val]) => {
        const [y, m] = key.split("-");
        return { month: `${getMonthName(parseInt(m) - 1)} ${y.slice(2)}`, percentage: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0 };
      });
    setMonthlyData(monthly);
    setRecentActivity(demo.logs as unknown as Attendance[]);
  }

  async function loadDashboard() {
    const hasCache = getLocalCache("admin_stats") !== null;
    if (!hasCache) setLoading(true);

    if (profile?.id?.startsWith("demo-")) {
      applyDemoData();
      setLoading(false);
      return;
    }

    try {
      const [students, teachers, subjects, departments, attendance, logs] = await withTimeout(
        Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }),
          supabase.from("teachers").select("id", { count: "exact", head: true }),
          supabase.from("subjects").select("id", { count: "exact", head: true }),
          supabase.from("departments").select("id", { count: "exact", head: true }),
          supabase.from("attendance").select("id, status, date").order("date", { ascending: false }).limit(500),
          supabase.from("attendance").select("id, student_id, subject_id, date, status, subjects(name, code), students(roll_number, profiles(name))").order("created_at", { ascending: false }).limit(10),
        ]),
        1000
      );

      if (students.error || (students.count === 0 && teachers.count === 0)) {
        if (!hasCache) applyDemoData();
      } else {
        const newStats = {
          students: students.count || 0,
          teachers: teachers.count || 0,
          subjects: subjects.count || 0,
          departments: departments.count || 0,
        };
        setStats(newStats);
        setLocalCache("admin_stats", newStats);

        const allAttendance = (attendance.data || []) as unknown as Attendance[];
        const newAttStats = calculateStats(allAttendance);
        setAttendanceStats(newAttStats);
        setLocalCache("admin_att_stats", newAttStats);

        // Monthly breakdown
        const monthlyMap: Record<string, { present: number; total: number }> = {};
        for (const a of allAttendance) {
          const d = new Date(a.date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyMap[key]) monthlyMap[key] = { present: 0, total: 0 };
          monthlyMap[key].total++;
          if (a.status === "present") monthlyMap[key].present++;
        }
        const monthly = Object.entries(monthlyMap)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .map(([key, val]) => {
            const [y, m] = key.split("-");
            return { month: `${getMonthName(parseInt(m) - 1)} ${y.slice(2)}`, percentage: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0 };
          });
        setMonthlyData(monthly);
        setLocalCache("admin_monthly", monthly);

        const fetchedLogs = (logs.data || []) as unknown as Attendance[];
        setRecentActivity(fetchedLogs);
        setLocalCache("admin_logs", fetchedLogs);
      }
    } catch {
      if (!hasCache) applyDemoData();
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

  const maxPct = 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1">Institution overview and attendance analytics</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Students" value={stats.students} icon={<Users size={22} />} color="text-blue-600" />
        <StatCard label="Total Teachers" value={stats.teachers} icon={<Users size={22} />} color="text-emerald-600" />
        <StatCard label="Total Subjects" value={stats.subjects} icon={<BookOpen size={22} />} color="text-amber-600" />
        <StatCard label="Departments" value={stats.departments} icon={<Building2 size={22} />} color="text-rose-600" />
      </div>

      {/* Attendance overview + Monthly chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Overall Attendance</h3>
          <div className="flex items-center justify-center mb-4">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none"
                  stroke={attendanceStats.percentage >= 75 ? "#10b981" : "#f59e0b"}
                  strokeWidth="3"
                  strokeDasharray={`${(attendanceStats.percentage / 100) * 97.4} 97.4`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-slate-900">{attendanceStats.percentage}%</span>
                <span className="text-xs text-slate-400">Attendance</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-3 rounded-lg bg-emerald-50">
              <div className="flex items-center justify-center gap-1 text-emerald-600">
                <TrendingUp size={16} />
                <span className="text-lg font-bold">{attendanceStats.present}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Present</p>
            </div>
            <div className="p-3 rounded-lg bg-rose-50">
              <div className="flex items-center justify-center gap-1 text-rose-600">
                <TrendingDown size={16} />
                <span className="text-lg font-bold">{attendanceStats.absent}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Absent</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Monthly Attendance Trend</h3>
          {monthlyData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No attendance data yet</div>
          ) : (
            <div className="flex items-end justify-between gap-3 h-48 pt-4">
              {monthlyData.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">{m.percentage}%</span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-md transition-all duration-700 ${
                        m.percentage >= 75 ? "bg-emerald-500" : m.percentage >= 50 ? "bg-amber-500" : "bg-rose-500"
                      }`}
                      style={{ height: `${(m.percentage / maxPct) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 text-center">{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Recent Attendance Activity</h3>
        {recentActivity.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No recent activity</div>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${a.status === "present" ? "bg-emerald-50" : "bg-rose-50"}`}>
                    <ClipboardCheck size={18} className={a.status === "present" ? "text-emerald-600" : "text-rose-600"} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {a.students?.profiles?.name || "Unknown"} ({a.students?.roll_number || ""})
                    </p>
                    <p className="text-xs text-slate-500">{a.subjects?.name || "Unknown subject"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(a.date).toLocaleDateString()}
                  </span>
                  <Badge variant={a.status === "present" ? "success" : "danger"}>
                    {a.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
