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
import { DEMO_STUDENTS } from "../../lib/demoData";

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

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rows, setRows] = useState<StudentMonthlyRow[]>([]);
  const [workingDays, setWorkingDays] = useState(0);
  const [loading, setLoading] = useState(false);

  const isDemo = profile?.id?.startsWith("demo-");

  // Past 12 months selector options
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
    if (selectedMonth) loadReport();
  }, [selectedMonth]);

  async function loadReport() {
    if (!selectedMonth) return;
    setLoading(true);
    setRows([]);

    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const startDate = `${selectedMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      // Demo Mode Fallback
      if (isDemo) {
        const total = 25; // 25 working days like college format
        setWorkingDays(total);

        // Deterministic mock calculations for demo students
        const demoResult: StudentMonthlyRow[] = DEMO_STUDENTS.map((stu, idx) => {
          const p = Math.max(12, Math.min(25, 25 - (idx * 3 % 11)));
          const a = total - p;
          const pct = Math.round((p / total) * 100 * 100) / 100;
          return {
            sl_no: idx + 1,
            roll_number: stu.roll_number,
            name: stu.profiles.name,
            present: p,
            absent: a,
            total,
            percentage: pct,
          };
        }).sort((a, b) => a.roll_number.localeCompare(b.roll_number));

        setRows(demoResult);
        setLoading(false);
        return;
      }

      // Live Supabase Fetch across all students and attendance in month
      const { data: att, error } = await supabase
        .from("attendance")
        .select("student_id, date, status, students(roll_number, profiles(name))")
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) {
        showToast("error", "Failed to load attendance: " + error.message);
        setLoading(false);
        return;
      }

      // Also fetch all registered students to make sure even students with 0 attendance appear
      const { data: allStudents } = await supabase
        .from("students")
        .select("id, roll_number, profiles(name)")
        .order("roll_number");

      if ((!att || att.length === 0) && (!allStudents || allStudents.length === 0)) {
        showToast("info", "No attendance records found for this month.");
        setRows([]);
        setWorkingDays(0);
        setLoading(false);
        return;
      }

      const uniqueDates = new Set((att || []).map((a) => a.date));
      const total = uniqueDates.size || 1;
      setWorkingDays(uniqueDates.size);

      // Student aggregation map
      const studentMap = new Map<
        string,
        { roll_number: string; name: string; present: number; absent: number }
      >();

      // Initialize all students
      (allStudents || []).forEach((stu) => {
        studentMap.set(stu.id, {
          roll_number: stu.roll_number || "—",
          name: (stu as any).profiles?.name || "—",
          present: 0,
          absent: 0,
        });
      });

      // Populate attendance records
      (att || []).forEach((record) => {
        const sid = record.student_id;
        const stu = (record as any).students;
        if (!studentMap.has(sid)) {
          studentMap.set(sid, {
            roll_number: stu?.roll_number || "—",
            name: stu?.profiles?.name || "—",
            present: 0,
            absent: 0,
          });
        }
        const entry = studentMap.get(sid)!;
        if (record.status === "present") entry.present++;
        else entry.absent++;
      });

      // Build rows
      const result: StudentMonthlyRow[] = Array.from(studentMap.values())
        .sort((a, b) => a.roll_number.localeCompare(b.roll_number))
        .map((s, i) => ({
          sl_no: i + 1,
          roll_number: s.roll_number,
          name: s.name,
          present: s.present,
          absent: uniqueDates.size > 0 ? total - s.present : 0,
          total,
          percentage: total > 0 ? Math.round((s.present / total) * 100 * 100) / 100 : 0,
        }));

      setRows(result);
    } catch {
      showToast("error", "Unexpected error loading report.");
    } finally {
      setLoading(false);
    }
  }

  function exportExcel() {
    if (rows.length === 0) { showToast("error", "No data to export"); return; }
    const data = rows.map((r) => ({
      "Sl.No": r.sl_no,
      "Roll No": r.roll_number,
      "Name of the Student": r.name,
      "Present (Days)": r.present,
      "Absent (Days)": r.absent,
      "Working Days": r.total,
      "%": `${r.percentage}%`,
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    XLSX.utils.sheet_add_aoa(ws, [
      [`MONTHLY ATTENDANCE REPORT FOR THE MONTH OF ${monthLabel.toUpperCase()}`],
      [`No. of Working Days: ${workingDays}`],
      [],
    ], { origin: "A1" });

    ws["!cols"] = [{ wch: 8 }, { wch: 18 }, { wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${monthLabel} Attendance`);
    XLSX.writeFile(wb, `monthly_attendance_${selectedMonth}.xlsx`);
    showToast("success", "Excel report downloaded");
  }

  function exportPDF() {
    if (rows.length === 0) { showToast("error", "No data to export"); return; }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // ── College Header ──
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`MONTHLY ATTENDANCE FOR THE MONTH OF ${monthLabel.toUpperCase()}`, pageW / 2, 15, { align: "center" });

    // Info row
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`No. of Working Days : ${workingDays}`, 14, 25);
    doc.text(`Total Students: ${rows.length}`, pageW - 14, 25, { align: "right" });

    const avgPct = rows.length > 0
      ? Math.round(rows.reduce((a, r) => a + r.percentage, 0) / rows.length * 100) / 100
      : 0;

    // ── Table ──
    autoTable(doc, {
      startY: 30,
      head: [["Sl.No", "Roll No", "Name of the Student", "Present (Days)", "Absent (Days)", "Working Days", "%"]],
      body: rows.map((r) => [
        r.sl_no,
        r.roll_number,
        r.name,
        r.present,
        r.absent,
        r.total,
        `${r.percentage}%`,
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { halign: "center", cellWidth: 12 },
        1: { halign: "center", cellWidth: 28 },
        2: { cellWidth: 60 },
        3: { halign: "center", cellWidth: 22 },
        4: { halign: "center", cellWidth: 22 },
        5: { halign: "center", cellWidth: 22 },
        6: { halign: "center", cellWidth: 18 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 6) {
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
      `Class Average Attendance: ${avgPct}% | * Students below 75% are highlighted in red.`,
      14, finalY
    );

    doc.save(`monthly_attendance_${selectedMonth}.pdf`);
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
            Student-wise consolidated monthly attendance report
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

      {/* Month Selection Filter */}
      <Card className="p-5">
        <div className="max-w-xs">
          <Select
            label="Select Month"
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
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl text-center">
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
              Monthly Attendance for the Month of {monthLabel}
            </h2>
            <p className="text-xs text-slate-500 mt-1">No. of Working Days : <strong>{workingDays}</strong></p>
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
            <p className="text-sm mt-1">Select a month to generate the report</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Sl.No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Roll No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name of the Student</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Present (Days)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Absent (Days)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Working Days</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">%</th>
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
                    <td className="px-4 py-3 text-center text-slate-500">{row.sl_no}</td>
                    <td className="px-4 py-3 font-mono text-slate-700 font-medium">{row.roll_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{row.present}</td>
                    <td className="px-4 py-3 text-center text-rose-600 font-semibold">{row.absent}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{row.total}</td>
                    <td className="px-4 py-3 text-center">
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
                  <td colSpan={3} className="px-4 py-3 text-xs font-bold text-slate-700 text-right">
                    Class Average →
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-emerald-700">
                    {rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.present, 0) / rows.length * 10) / 10 : 0}
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-rose-600">
                    {rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.absent, 0) / rows.length * 10) / 10 : 0}
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-slate-600">{workingDays}</td>
                  <td className="px-4 py-3 text-center">
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
