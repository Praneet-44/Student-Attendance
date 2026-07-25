import { useEffect, useState } from "react";
import { BookOpen, ClipboardCheck, Users, TrendingUp, Calendar, Upload } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card, StatCard } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { calculateStats, formatDate } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import type { Attendance, Subject } from "../../lib/types";
import { DEMO_TEACHER_SUBJECTS, getDemoTeacherAttendance } from "../../lib/demoData";
import { getLocalCache, setLocalCache, withTimeout } from "../../lib/cache";

interface SubjectWithDept extends Subject {
  departments: { name: string; code: string } | null;
}

export function TeacherDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { profile } = useAuth();
  const [subjects, setSubjects] = useState<SubjectWithDept[]>(() => getLocalCache("teacher_subjects") || []);
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>(() => getLocalCache("teacher_today") || []);
  const [recentAttendance, setRecentAttendance] = useState<Attendance[]>(() => getLocalCache("teacher_recent") || []);
  const [loading, setLoading] = useState<boolean>(() => !getLocalCache("teacher_subjects"));

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!profile) return;

    const hasCache = getLocalCache("teacher_subjects") !== null;
    if (!hasCache) setLoading(true);

    if (profile.id.startsWith("demo-")) {
      setSubjects(DEMO_TEACHER_SUBJECTS as unknown as SubjectWithDept[]);
      const { todayAttendance: demoToday, recentAttendance: demoRecent } = getDemoTeacherAttendance();
      setTodayAttendance(demoToday as unknown as Attendance[]);
      setRecentAttendance(demoRecent as unknown as Attendance[]);
      setLoading(false);
      return;
    }

    try {
      // Get assigned subjects with 1s timeout
      const subRes = await withTimeout(
        supabase
          .from("subjects")
          .select("*, departments(name, code)")
          .eq("teacher_id", profile.id)
          .order("name"),
        1000
      );

      const subs = subRes.data;
      if (subRes.error || !subs || subs.length === 0) {
        if (!hasCache) {
          setSubjects(DEMO_TEACHER_SUBJECTS as unknown as SubjectWithDept[]);
          const { todayAttendance: demoToday, recentAttendance: demoRecent } = getDemoTeacherAttendance();
          setTodayAttendance(demoToday as unknown as Attendance[]);
          setRecentAttendance(demoRecent as unknown as Attendance[]);
        }
        setLoading(false);
        return;
      }

      const fetchedSubjects = subs as unknown as SubjectWithDept[];
      setSubjects(fetchedSubjects);
      setLocalCache("teacher_subjects", fetchedSubjects);

      // Get today's attendance & recent attendance IN PARALLEL with 1s timeout
      const today = new Date().toISOString().slice(0, 10);
      const subjectIds = subs.map((s) => s.id);

      const [todayRes, recentRes] = await withTimeout(
        Promise.all([
          supabase
            .from("attendance")
            .select("id, student_id, subject_id, date, status, subjects(name, code), students(roll_number, profiles(name))")
            .in("subject_id", subjectIds)
            .eq("date", today)
            .order("created_at", { ascending: false }),
          supabase
            .from("attendance")
            .select("id, student_id, subject_id, date, status, subjects(name, code), students(roll_number, profiles(name))")
            .in("subject_id", subjectIds)
            .order("created_at", { ascending: false })
            .limit(10),
        ]),
        1000
      );

      const fetchedToday = (todayRes.data || []) as unknown as Attendance[];
      const fetchedRecent = (recentRes.data || []) as unknown as Attendance[];

      setTodayAttendance(fetchedToday);
      setRecentAttendance(fetchedRecent);
      setLocalCache("teacher_today", fetchedToday);
      setLocalCache("teacher_recent", fetchedRecent);
    } catch {
      // Fast fallback to demo data if query times out or fails and no cache present
      if (!hasCache) {
        setSubjects(DEMO_TEACHER_SUBJECTS as unknown as SubjectWithDept[]);
        const { todayAttendance: demoToday, recentAttendance: demoRecent } = getDemoTeacherAttendance();
        setTodayAttendance(demoToday as unknown as Attendance[]);
        setRecentAttendance(demoRecent as unknown as Attendance[]);
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

  const todayStats = calculateStats(todayAttendance);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile?.name}</h1>
        <p className="text-slate-500 mt-1">Your teaching dashboard</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Assigned Subjects" value={subjects.length} icon={<BookOpen size={22} />} color="text-blue-600" />
        <StatCard label="Today's Records" value={todayAttendance.length} icon={<ClipboardCheck size={22} />} color="text-emerald-600" />
        <StatCard label="Present Today" value={todayStats.present} icon={<TrendingUp size={22} />} color="text-emerald-600" />
        <StatCard label="Absent Today" value={todayStats.absent} icon={<Users size={22} />} color="text-rose-600" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer" >
          <button onClick={() => onNavigate("mark")} className="flex items-center gap-4 w-full text-left">
            <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-white">
              <ClipboardCheck size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Mark Attendance</h3>
              <p className="text-sm text-slate-500">Record attendance for your classes</p>
            </div>
          </button>
        </Card>
        <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
          <button onClick={() => onNavigate("upload")} className="flex items-center gap-4 w-full text-left">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <Upload size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Upload Excel</h3>
              <p className="text-sm text-slate-500">Bulk import attendance from Excel</p>
            </div>
          </button>
        </Card>
      </div>

      {/* Assigned subjects */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Assigned Subjects</h3>
        </div>
        {subjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <BookOpen size={28} className="mb-2" />
            <p className="text-sm">No subjects assigned yet. Contact admin.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {subjects.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.code} · Sem {s.semester} · {s.departments?.code || "—"}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onNavigate("mark")}>
                  Mark
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent activity */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Recent Attendance</h3>
        </div>
        {recentAttendance.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            No attendance marked yet
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentAttendance.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${a.status === "present" ? "bg-emerald-50" : "bg-rose-50"}`}>
                    <ClipboardCheck size={16} className={a.status === "present" ? "text-emerald-600" : "text-rose-600"} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {a.students?.profiles?.name || "Unknown"} ({a.students?.roll_number || ""})
                    </p>
                    <p className="text-xs text-slate-500">{a.subjects?.name || ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDate(a.date)}
                  </span>
                  <Badge variant={a.status === "present" ? "success" : "danger"}>{a.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
