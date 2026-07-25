import type { Attendance, AttendanceStats } from "./types";

export function calculateStats(records: Attendance[]): AttendanceStats {
  const total = records.length;
  const present = records.filter((r) => r.status === "present").length;
  const absent = total - present;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  return { total, present, absent, percentage };
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateInput(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMonthName(month: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return months[month] || "";
}

export function getAttendanceColor(percentage: number): string {
  if (percentage >= 85) return "text-emerald-600";
  if (percentage >= 75) return "text-amber-600";
  return "text-rose-600";
}

export function getAttendanceBg(percentage: number): string {
  if (percentage >= 85) return "bg-emerald-50 border-emerald-200";
  if (percentage >= 75) return "bg-amber-50 border-amber-200";
  return "bg-rose-50 border-rose-200";
}

export function getAttendanceBarColor(percentage: number): string {
  if (percentage >= 85) return "bg-emerald-500";
  if (percentage >= 75) return "bg-amber-500";
  return "bg-rose-500";
}

export function groupByMonth(records: Attendance[]): Record<string, Attendance[]> {
  const grouped: Record<string, Attendance[]> = {};
  for (const r of records) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  return grouped;
}

export function groupBySubject(records: Attendance[]): Record<string, { records: Attendance[]; stats: AttendanceStats }> {
  const grouped: Record<string, { records: Attendance[]; stats: AttendanceStats }> = {};
  for (const r of records) {
    const key = r.subject_id;
    if (!grouped[key]) grouped[key] = { records: [], stats: { total: 0, present: 0, absent: 0, percentage: 0 } };
    grouped[key].records.push(r);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].stats = calculateStats(grouped[key].records);
  }
  return grouped;
}
