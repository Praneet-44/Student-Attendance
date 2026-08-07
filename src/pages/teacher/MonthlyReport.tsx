import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Download, CalendarDays, Users, Printer } from "lucide-react";
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

interface StudentMonthlyRow {
  sl_no: number;
  roll_number: string;
  name: string;
  present: number;
  absent: number;
  total: number;
  percentage: number;
}

export function MonthlyReport() {
  const { showToast } = useToast();
  const { profile } = useAuth();

  const [subjects, setSubjects] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rows, setRows] = useState<StudentMonthlyRow[]>([]);
  const [workingDays, setWorkingDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [departmentInfo, setDepartmentInfo] = useState<{ name: string; code: string } | null>(null);

  // Generate past 12 months
  const monthOptions = (() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
    return options;
  })();

  const monthLabel = monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth;

  useEffect(() => {
    loadSubjects();
  }, []);

  useEffect(() => {
    if (selectedSubject && selectedMonth) loadReport();
  }, [selectedSubject, selectedMonth]);

  async function loadSubjects() {
    if (!profile) return;
    const { data } = await supabase
      .from("subjects")
      .select("id, name, code, department_id, departments(name, code)")
      .eq("teacher_id", profile.id)
      .order("name");

    if (data && data.length > 0) {
      setSubjects(data.map((s) => ({ id: s.id, name: s.name, code: s.code })));
      setSelectedSubject(data[0].id);
      // Save department info for first subject
      const dept = (data[0] as any).departments;
      if (dept) setDepartmentInfo(dept);
    }
  }

  async function loadReport() {
    if (!selectedSubject || !selectedMonth) return;
    setLoading(true);
    setRows([]);

    try {
      // Get start and end date of the month
      const [year, month] = selectedMonth.split("-").map(Number);
      const startDate = `${selectedMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      // Fetch subject info for department
      const { data: subData } = await supabase
        .from("subjects")
        .select("id, name, code, department_id, departments(name, code)")
        .eq("id", selectedSubject)
        .maybeSingle();

      if (subData) {
        const dept = (subData as any).departments;
        if (dept) setDepartmentInfo(dept);
      }

      // Fetch all attendance for subject in month
      const { data: att, error } = await supabase
        .from("attendance")
        .select("student_id, date, status, students(roll_number, profiles(name))")
        .eq("subject_id", selectedSubject)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) {
        showToast("error", "Failed to load attendance: " + error.message);
        setLoading(false);
        return;
      }

      if (!att || att.length === 0) {
        showToast("info", "No attendance records found for this month.");
        setRows([]);
        setWorkingDays(0);
        setLoading(false);
        return;
      }

      // Count unique working days
      const uniqueDates = new Set(att.map((a) => a.date));
      setWorkingDays(uniqueDates.size);

      // Aggregate per student
      const studentMap = new Map<
        string,
        { roll_number: string; name: string; present: number; absent: number }
      >();

      for (const record of att) {
        const sid = record.student_id;
        const stu = (record as any).students;
        const rollNo = stu?.roll_number || "—";
        const name = stu?.profiles?.name || "—";

        if (!studentMap.has(sid)) {
          studentMap.set(sid, { roll_number: rollNo, name, present: 0, absent: 0 });
        }
        const entry = studentMap.get(sid)!;
        if (record.status === "present") entry.present++;
        else entry.absent++;
      }

      // Build rows sorted by roll number
      const total = uniqueDates.size;
      const result: StudentMonthlyRow[] = Array.from(studentMap.values())
        .sort((a, b) => a.roll_number.localeCompare(b.roll_number))
        .map((s, i) => ({
          sl_no: i + 1,
          roll_number: s.roll_number,
          name: s.name,
          present: s.present,
          absent: total - s.present,
          total,
          percentage: total > 0 ? Math.round((s.present / total) * 100 * 100) / 100 : 0,
        }));

      setRows(result);
    } catch (err) {
      showToast("error", "Unexpected error loading report.");
    } finally {
      setLoading(false);
    }
  }

  const subjectName = subjects.find((s) => s.id === selectedSubject)?.name || "";
  const subjectCode = subjects.find((s) => s.id === selectedSubject)?.code || "";

  function exportExcel() {
    if (rows.length === 0) { showToast("error", "No data to export"); return; }
    const data = rows.map((r) => ({
      "Sl.No": r.sl_no,
      "Roll No": r.roll_number,
      "Name of the Student": r.name,
      "Present (Days)": r.present,
      "Absent (Days)": r.absent,
      "Total Working Days": r.total,
      "Attendance %": r.percentage,
    }));
    const ws = XLSX.utils.json_to_sheet(data);

    // Header info rows
    XLSX.utils.sheet_add_aoa(ws, [
      [`MONTHLY ATTENDANCE - ${monthLabel.toUpperCase()}`],
      [`Subject: ${subjectName} (${subjectCode})`],
      [`Department: ${departmentInfo?.name || ""}`],
      [`Working Days: ${workingDays}`],
      [],
    ], { origin: "A1" });

    ws["!cols"] = [{ wch: 6 }, { wch: 15 }, { wch: 30 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${monthLabel} Attendance`);
    XLSX.writeFile(wb, `monthly_attendance_${selectedMonth}_${subjectCode}.xlsx`);
    showToast("success", "Excel report downloaded");
  }

  function exportPDF() {
    if (rows.length === 0) { showToast("error", "No data to export"); return; }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // ── College Header ──
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("MONTHLY ATTENDANCE REPORT", pageW / 2, 15, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Month: ${monthLabel}`, pageW / 2, 22, { align: "center" });

    // Info row
    doc.setFontSize(9);
    doc.text(`Department: ${departmentInfo?.name || "—"}`, 14, 30);
    doc.text(`Subject: ${subjectName} (${subjectCode})`, 14, 36);
    doc.text(`No. of Working Days: ${workingDays}`, 14, 42);
    doc.text(`Total Students: ${rows.length}`, pageW - 14, 30, { align: "right" });
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, pageW - 14, 36, { align: "right" });

    const avgPct = rows.length > 0
      ? Math.round(rows.reduce((a, r) => a + r.percentage, 0) / rows.length * 100) / 100
      : 0;
    doc.text(`Class Avg Attendance: ${avgPct}%`, pageW - 14, 42, { align: "right" });

    // ── Table ──
    autoTable(doc, {
      startY: 48,
      head: [["Sl.No", "Roll No", "Name of the Student", "Present\n(Days)", "Absent\n(Days)", "%"]],
      body: rows.map((r) => [
        r.sl_no,
        r.roll_number,
        r.name,
        r.present,
        r.absent,
        `${r.percentage}%`,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        1: { halign: "center", cellWidth: 28 },
        2: { cellWidth: 70 },
        3: { halign: "center", cellWidth: 22 },
        4: { halign: "center", cellWidth: 22 },
        5: { halign: "center", cellWidth: 20 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 5) {
          const pct = rows[data.row.index]?.percentage ?? 0;
          if (pct < 75) data.cell.styles.textColor = [220, 38, 38];
          else data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(
      `* Students with attendance below 75% are highlighted in red.`,
      14, finalY
    );

    doc.save(`monthly_attendance_${selectedMonth}_${subjectCode}.pdf`);
    showToast("success", "PDF report downloaded");
  }

  const presentAvg = rows.length > 0
    ? Math.round(rows.reduce((a, r) => a + r.percentage, 0) / rows.length * 100) / 100
    : 0;
  const belowThreshold = rows.filter((r) => r.percentage < 75).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monthly Attendance Report</h1>
          <p className="text-slate-500 mt-1">
            Student-wise consolidated attendance for a selected month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
            <FileSpreadsheet size={16} /> Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={rows.length === 0}>
            <FileText size={16} /> PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Subject"
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
          >
            <option value="">Select a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>
          <Select
            label="Month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <div className="flex items-center justify-center mb-1 text-blue-500">
              <CalendarDays size={20} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{workingDays}</p>
            <p className="text-xs text-slate-500 mt-0.5">Working Days</p>
          </Card>
          <Card className="p-4 text-center">
            <div className="flex items-center justify-center mb-1 text-emerald-500">
              <Users size={20} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{rows.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Students</p>
          </Card>
          <Card className="p-4 text-center">
            <div className="flex items-center justify-center mb-1 text-violet-500">
              <Printer size={20} />
            </div>
            <p className={`text-2xl font-bold ${presentAvg >= 75 ? "text-emerald-600" : "text-amber-500"}`}>
              {presentAvg}%
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Class Avg</p>
          </Card>
          <Card className="p-4 text-center">
            <div className="flex items-center justify-center mb-1 text-rose-500">
              <Users size={20} />
            </div>
            <p className="text-2xl font-bold text-rose-600">{belowThreshold}</p>
            <p className="text-xs text-slate-500 mt-0.5">Below 75%</p>
          </Card>
        </div>
      )}

      {/* Report Table */}
      <Card>
        {/* Table header info */}
        {rows.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
            <div className="text-center">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                Monthly Attendance for the Month of {monthLabel}
              </h2>
              {departmentInfo && (
                <p className="text-sm text-slate-600 mt-0.5">
                  Department: <span className="font-semibold">{departmentInfo.name}</span>
                  &nbsp;|&nbsp;
                  Subject: <span className="font-semibold">{subjectName} ({subjectCode})</span>
                </p>
              )}
              <p className="text-xs text-slate-500 mt-0.5">No. of Working Days: <strong>{workingDays}</strong></p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <CalendarDays size={36} className="mb-3" />
            <p className="font-medium">No attendance data found</p>
            <p className="text-sm mt-1">Select a subject and month to generate the report</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-3 py-3 text-center text-xs font-semibold">Sl.No</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold">Roll No</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold">Name of the Student</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">Present<br />(Days)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">Absent<br />(Days)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">Working<br />Days</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr
                    key={row.roll_number}
                    className={`transition-colors ${
                      row.percentage < 75
                        ? "bg-rose-50 hover:bg-rose-100"
                        : i % 2 === 0
                        ? "bg-white hover:bg-slate-50"
                        : "bg-slate-50/50 hover:bg-slate-100"
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center text-slate-500">{row.sl_no}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-700">{row.roll_number}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{row.name}</td>
                    <td className="px-3 py-2.5 text-center text-emerald-700 font-semibold">{row.present}</td>
                    <td className="px-3 py-2.5 text-center text-rose-600 font-semibold">{row.absent}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{row.total}</td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant={row.percentage >= 75 ? "success" : "danger"}>
                        {row.percentage}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Footer */}
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-slate-700 text-right">
                    Class Average →
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs font-bold text-emerald-700">
                    {rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.present, 0) / rows.length * 10) / 10 : 0}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs font-bold text-rose-600">
                    {rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.absent, 0) / rows.length * 10) / 10 : 0}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs font-bold text-slate-600">{workingDays}</td>
                  <td className="px-3 py-2.5 text-center">
                    <Badge variant={presentAvg >= 75 ? "success" : "danger"}>{presentAvg}%</Badge>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Legend */}
        {rows.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" />
              Below 75% attendance (at risk)
            </span>
            <span className="flex items-center gap-1.5">
              <Download size={12} />
              Export using Excel or PDF buttons above
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
