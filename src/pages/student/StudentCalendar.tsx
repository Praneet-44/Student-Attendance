import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import { getMonthName } from "../../lib/utils";
import type { Attendance } from "../../lib/types";

interface AttendanceWithSubject extends Attendance {
  subjects: { name: string; code: string } | null;
}

export function StudentCalendar() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<AttendanceWithSubject[]>([]);
  const [, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!profile) return;
    const { data } = await supabase
      .from("attendance")
      .select("id, student_id, subject_id, date, status, created_at, subjects(name, code)")
      .eq("student_id", profile.id)
      .order("date", { ascending: false });
    setRecords((data || []) as unknown as AttendanceWithSubject[]);
    setLoading(false);
  }

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  // Group records by date for current month
  const recordsByDate = new Map<string, AttendanceWithSubject[]>();
  records.forEach((r) => {
    const d = new Date(r.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = String(d.getDate());
      if (!recordsByDate.has(key)) recordsByDate.set(key, []);
      recordsByDate.get(key)!.push(r);
    }
  });

  const monthRecords = records.filter((r) => {
    const d = new Date(r.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const monthPresent = monthRecords.filter((r) => r.status === "present").length;
  const monthAbsent = monthRecords.filter((r) => r.status === "absent").length;

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }
  function goToToday() {
    setCurrentMonth(new Date());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Attendance Calendar</h1>
        <p className="text-slate-500 mt-1">Visual calendar of your attendance</p>
      </div>

      {/* Month stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <p className="text-sm text-slate-500">This Month</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{monthRecords.length}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-slate-500">Present</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{monthPresent}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-slate-500">Absent</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{monthAbsent}</p>
        </Card>
      </div>

      <Card className="p-5">
        {/* Calendar header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {getMonthName(month)} {year}
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button onClick={goToToday} className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              Today
            </button>
            <button onClick={nextMonth} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-slate-400 py-2">
              {day}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dayRecords = recordsByDate.get(String(day)) || [];
            const hasRecords = dayRecords.length > 0;
            const allPresent = hasRecords && dayRecords.every((r) => r.status === "present");
            const allAbsent = hasRecords && dayRecords.every((r) => r.status === "absent");
                        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

            return (
              <div
                key={i}
                className={`aspect-square rounded-lg border p-1.5 flex flex-col items-center justify-center transition-all ${
                  !hasRecords
                    ? "border-slate-100 bg-slate-50/50"
                    : allPresent
                      ? "border-emerald-200 bg-emerald-50"
                      : allAbsent
                        ? "border-rose-200 bg-rose-50"
                        : "border-amber-200 bg-amber-50"
                } ${isToday ? "ring-2 ring-blue-500" : ""}`}
              >
                <span className={`text-sm font-medium ${isToday ? "text-blue-600" : "text-slate-700"}`}>{day}</span>
                {hasRecords && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayRecords.slice(0, 4).map((r, j) => (
                      <div
                        key={j}
                        className={`w-1.5 h-1.5 rounded-full ${r.status === "present" ? "bg-emerald-500" : "bg-rose-500"}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-xs text-slate-600">Present</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500" />
            <span className="text-xs text-slate-600">Absent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-xs text-slate-600">Mixed</span>
          </div>
        </div>
      </Card>

      {/* Day details */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <CalendarDays size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">Records for {getMonthName(month)} {year}</h3>
        </div>
        {monthRecords.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No records for this month</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {monthRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{r.subjects?.name || "Unknown"}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(r.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </p>
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
