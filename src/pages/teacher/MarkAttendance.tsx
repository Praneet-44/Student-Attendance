import { useEffect, useState } from "react";
import { ClipboardCheck, Save, Check, X, Search, Calendar } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { formatDateInput } from "../../lib/utils";
import type { Subject, Student } from "../../lib/types";
import { DEMO_TEACHER_SUBJECTS, DEMO_STUDENTS } from "../../lib/demoData";
import { getLocalCache, setLocalCache, withTimeout } from "../../lib/cache";

interface StudentWithProfile extends Student {
  profiles: { name: string } | null;
}

export function MarkAttendance() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>(() => getLocalCache("teacher_mark_subjects") || []);
  const [selectedSubject, setSelectedSubject] = useState<string>(() => {
    const cachedSubs = getLocalCache<Subject[]>("teacher_mark_subjects");
    return cachedSubs && cachedSubs.length > 0 ? cachedSubs[0].id : "";
  });
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [students, setStudents] = useState<StudentWithProfile[]>(() => getLocalCache("teacher_mark_students") || []);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, "present" | "absent">>(() => getLocalCache("teacher_mark_att_map") || {});
  const [existingAttendance, setExistingAttendance] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<boolean>(() => !getLocalCache("teacher_mark_subjects"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSubjects();
  }, []);

  async function loadSubjects() {
    if (!profile) return;
    const hasCache = getLocalCache("teacher_mark_subjects") !== null;
    if (!hasCache) setLoading(true);

    if (profile.id.startsWith("demo-")) {
      const demoSubs = DEMO_TEACHER_SUBJECTS as unknown as Subject[];
      setSubjects(demoSubs);
      if (demoSubs.length > 0 && !selectedSubject) setSelectedSubject(demoSubs[0].id);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("subjects")
          .select("id, name, code, semester, department_id")
          .eq("teacher_id", profile.id)
          .order("name"),
        1000
      );

      if (error || !data || data.length === 0) {
        if (!hasCache) {
          const demoSubs = DEMO_TEACHER_SUBJECTS as unknown as Subject[];
          setSubjects(demoSubs);
          if (demoSubs.length > 0 && !selectedSubject) setSelectedSubject(demoSubs[0].id);
        }
      } else {
        const fetchedSubs = data as unknown as Subject[];
        setSubjects(fetchedSubs);
        setLocalCache("teacher_mark_subjects", fetchedSubs);
        if (!selectedSubject && fetchedSubs.length > 0) setSelectedSubject(fetchedSubs[0].id);
      }
    } catch {
      if (!hasCache) {
        const demoSubs = DEMO_TEACHER_SUBJECTS as unknown as Subject[];
        setSubjects(demoSubs);
        if (demoSubs.length > 0 && !selectedSubject) setSelectedSubject(demoSubs[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedSubject) {
      loadStudents();
    }
  }, [selectedSubject, date]);

  async function loadStudents() {
    const hasCache = getLocalCache("teacher_mark_students") !== null;
    if (!hasCache) setLoading(true);

    if (profile?.id?.startsWith("demo-") || selectedSubject.startsWith("demo-")) {
      const demoStus = DEMO_STUDENTS as unknown as StudentWithProfile[];
      setStudents(demoStus);
      const defaultMap: Record<string, "present" | "absent"> = {};
      demoStus.forEach((s) => {
        defaultMap[s.id] = "present";
      });
      setAttendanceMap(defaultMap);
      setExistingAttendance({});
      setLoading(false);
      return;
    }

    try {
      const subject = subjects.find((s) => s.id === selectedSubject);
      let query = supabase.from("students").select("id, roll_number, department_id, semester, profiles(name)").order("roll_number");

      if (subject?.department_id) query = query.eq("department_id", subject.department_id);
      if (subject?.semester) query = query.eq("semester", subject.semester);

      const [studentsRes, existingRes] = await withTimeout(
        Promise.all([
          query,
          supabase
            .from("attendance")
            .select("id, student_id, status")
            .eq("subject_id", selectedSubject)
            .eq("date", date),
        ]),
        1000
      );

      const stus = (studentsRes.data || []) as unknown as StudentWithProfile[];
      if (stus.length === 0) {
        if (!hasCache) {
          const demoStus = DEMO_STUDENTS as unknown as StudentWithProfile[];
          setStudents(demoStus);
          const defaultMap: Record<string, "present" | "absent"> = {};
          demoStus.forEach((s) => { defaultMap[s.id] = "present"; });
          setAttendanceMap(defaultMap);
        }
      } else {
        setStudents(stus);
        setLocalCache("teacher_mark_students", stus);
        const existingMap: Record<string, string> = {};
        const attMap: Record<string, "present" | "absent"> = {};
        (existingRes.data || []).forEach((a) => {
          existingMap[a.student_id] = a.id;
          attMap[a.student_id] = a.status as "present" | "absent";
        });
        setExistingAttendance(existingMap);

        const defaultMap: Record<string, "present" | "absent"> = {};
        stus.forEach((s) => {
          defaultMap[s.id] = attMap[s.id] || "present";
        });
        setAttendanceMap(defaultMap);
        setLocalCache("teacher_mark_att_map", defaultMap);
      }
    } catch {
      if (!hasCache) {
        const demoStus = DEMO_STUDENTS as unknown as StudentWithProfile[];
        setStudents(demoStus);
        const defaultMap: Record<string, "present" | "absent"> = {};
        demoStus.forEach((s) => { defaultMap[s.id] = "present"; });
        setAttendanceMap(defaultMap);
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredStudents = students.filter((s) => {
    const q = search.toLowerCase();
    return s.profiles?.name?.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q);
  });

  function setStatus(studentId: string, status: "present" | "absent") {
    setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
  }

  function setAll(status: "present" | "absent") {
    const map: Record<string, "present" | "absent"> = {};
    students.forEach((s) => { map[s.id] = status; });
    setAttendanceMap(map);
  }

  async function handleSave() {
    if (!selectedSubject || students.length === 0) {
      showToast("error", "Please select a subject and ensure students are loaded");
      return;
    }
    setSaving(true);

    // Build records - upsert (insert or update)
    const toInsert: { student_id: string; subject_id: string; date: string; status: string }[] = [];
    const toUpdate: { id: string; status: string }[] = [];

    for (const student of students) {
      const status = attendanceMap[student.id];
      if (existingAttendance[student.id]) {
        toUpdate.push({ id: existingAttendance[student.id], status });
      } else {
        toInsert.push({
          student_id: student.id,
          subject_id: selectedSubject,
          date,
          status,
        });
      }
    }

    let errorCount = 0;

    // Insert new records
    if (toInsert.length > 0) {
      const { error } = await supabase.from("attendance").insert(toInsert);
      if (error) errorCount++;
    }

    // Update existing records
    for (const u of toUpdate) {
      const { error } = await supabase.from("attendance").update({ status: u.status }).eq("id", u.id);
      if (error) errorCount++;
    }

    // Log to audit
    await supabase.from("audit_logs").insert({
      user_id: profile?.id,
      action: "attendance_marked",
      details: `Marked attendance for ${students.length} students on ${date}`,
    });

    if (errorCount > 0) {
      showToast("error", `${errorCount} records failed to save`);
    } else {
      showToast("success", `Attendance saved for ${students.length} students`);
    }
    setSaving(false);
    await loadStudents();
  }

  const presentCount = Object.values(attendanceMap).filter((s) => s === "present").length;
  const absentCount = Object.values(attendanceMap).filter((s) => s === "absent").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mark Attendance</h1>
        <p className="text-slate-500 mt-1">Record attendance for your class</p>
      </div>

      {/* Selection bar */}
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="Subject" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
            <option value="">Select a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
            <div className="relative">
              <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </Card>

      {subjects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center h-48 text-slate-400">
          <ClipboardCheck size={32} className="mb-2" />
          <p>No subjects assigned. Please contact admin.</p>
        </Card>
      ) : !selectedSubject ? (
        <Card className="flex items-center justify-center h-48 text-slate-400">
          <p>Please select a subject to mark attendance</p>
        </Card>
      ) : (
        <>
          {/* Stats bar */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Badge variant="success">{presentCount} Present</Badge>
              <Badge variant="danger">{absentCount} Absent</Badge>
              <Badge variant="default">{students.length} Total</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setAll("present")}>
                <Check size={16} /> All Present
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAll("absent")}>
                <X size={16} /> All Absent
              </Button>
              <Button onClick={handleSave} disabled={saving || loading}>
                <Save size={16} /> {saving ? "Saving..." : "Save Attendance"}
              </Button>
            </div>
          </div>

          {/* Student list */}
          <Card>
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                No students found for this subject
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredStudents.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium text-sm">
                        {s.profiles?.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{s.profiles?.name || "Unknown"}</p>
                        <p className="text-xs text-slate-500 font-mono">{s.roll_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {existingAttendance[s.id] && (
                        <Badge variant="info">Saved</Badge>
                      )}
                      <button
                        onClick={() => setStatus(s.id, "present")}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          attendanceMap[s.id] === "present"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-emerald-50"
                        }`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => setStatus(s.id, "absent")}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          attendanceMap[s.id] === "absent"
                            ? "bg-rose-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-rose-50"
                        }`}
                      >
                        Absent
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
