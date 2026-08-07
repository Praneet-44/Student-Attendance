import { useEffect, useState } from "react";
import {
  CalendarCheck, FileSpreadsheet, FileText, BookOpen,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
} from "lucide-react";
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

interface SubjectMonthRow {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  working_days: number;
  present: number;
  absent: number;
  percentage: number;
}

export function StudentMonthlyReport() {
  const { showToast } = useToast();
  const { profile } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rows, setRows] = useState<SubjectMonthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [studentInfo, setStudentInfo] = useState<{
    name: string; roll_number: string; semester: number; department: string;
  } | null>(null);

  // Past 12 months
  const monthOptions = (() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      opts.push({
        value: val,
        label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
      });
    }
    return opts;
  })();

  const monthLabel = monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth;

  useEffect(() => {
    if (profile) {
      loadStudentInfo();
    }
  }, [profile]);

  useEffect(() => {
    if (profile && selectedMonth) loadReport();
  }, [profile, selectedMonth]);

  async function loadStudentInfo() {
    if (!profile) return;
    const { data } = await supabase
      .from("students")
      .select("roll_number, semester, departments(name), profiles(name)")
      .eq("id", profile.id)
      .maybeSingle();

    if (data) {
      setStudentInfo({
        name: (data as any).profiles?.name || profile.name,
        roll_number: (data as any).roll_number || "—",
        semester: (data as any).semester || 1,
        department: (data as any).departments?.name || "—",
      });
    } else {
      setStudentInfo({
        name: profile.name,
        roll_number: "—",
        semester: 1,
        department: "—",
      });
    }
  }

  async function loadReport() {
    if (!profile || !selectedMonth) return;
    setLoading(true);
    setRows([]);

    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const startDate = `${selectedMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      const { data: att, error } = await supabase
        .from("attendance")
        .select("subject_id, date, status, subjects(name, code)")
        .eq("student_id", profile.id)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) {
        showToast("error", "Failed to load report: " + error.message);
        setLoading(false);
        return;
      }

      if (!att || att.length === 0) {
        showToast("info", "No attendance records found for this month.");
        setRows([]);
        setLoading(false);
        return;
      }

      // Aggregate per subject
      const subjectMap = new Map<string, {
        name: string; code: string;
        dates: Set<string>; present: number; absent: number;
      }>();

      for (const record of att) {
        const sid = record.subject_id;
        const subj = (record as any).subjects;
        if (!subjectMap.has(sid)) {
          subjectMap.set(sid, {
            name: subj?.name || "Unknown",
            code: subj?.code || "—",
            dates: new Set(),
            present: 0,
            absent: 0,
          });
        }
        const entry = subjectMap.get(sid)!;
        entry.dates.add(record.date);
        if (record.status === "present") entry.present++;
        else entry.absent++;
      }

      const result: SubjectMonthRow[] = Array.from(subjectMap.entries()).map(([id, s]) => ({
        subject_id: id,
        subject_name: s.name,
        subject_code: s.code,
        working_days: s.dates.size,
        present: s.present,
        absent: s.absent,
        percentage: s.dates.size > 0
          ? Math.round((s.present / s.dates.size) * 10000) / 100
          : 0,
      })).sort((a, b) => a.subject_name.localeCompare(b.subject_name));

      setRows(result);
    } catch {
      showToast("error", "Unexpected error loading report.");
    } finally {
      setLoading(false);
    }
  }

  // Overall totals
  const totalWorking = rows.reduce((a, r) => a + r.working_days, 0);
  const totalPresent = rows.reduce((a, r) => a + r.present, 0);
  const totalAbsent = rows.reduce((a, r) => a + r.absent, 0);
  const overallPct = totalWorking > 0
    ? Math.round((totalPresent / totalWorking) * 10000) / 100
    : 0;
  const atRiskSubjects = rows.filter((r) => r.percentage < 75);

  function exportExcel() {
    if (rows.length === 0) { showToast("error", "No data to export"); return; }

    const data = rows.map((r, i) => ({
      "Sl.No": i + 1,
      "Subject": r.subject_name,
      "Code": r.subject_code,
      "Working Days": r.working_days,
      "Present (Days)": r.present,
      "Absent (Days)": r.absent,
      "Attendance %": `${r.percentage}%`,
    }));

    // Summary row
    data.push({
      "Sl.No": 0,
      "Subject": "TOTAL / OVERALL",
      "Code": "",
      "Working Days": totalWorking,
      "Present (Days)": totalPresent,
      "Absent (Days)": totalAbsent,
      "Attendance %": `${overallPct}%`,
    });

    const ws = XLSX.utils.json_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [
      [`MONTHLY ATTENDANCE REPORT - ${monthLabel.toUpperCase()}`],
      [`Name: ${studentInfo?.name || profile?.name}`],
      [`Roll No: ${studentInfo?.roll_number}`],
      [`Semester: ${studentInfo?.semester}   |   Department: ${studentInfo?.department}`],
      [],
    ], { origin: "A1" });
    XLSX.utils.sheet_add_json(ws, data, { origin: "A6" });
    ws["!cols"] = [{ wch: 6 }, { wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${monthLabel} Report`);
    XLSX.writeFile(wb, `my_monthly_report_${selectedMonth}.xlsx`);
    showToast("success", "Excel report downloaded");
  }

  function exportPDF() {
    if (rows.length === 0) { showToast("error", "No data to export"); return; }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("MONTHLY ATTENDANCE REPORT", pw / 2, 14, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Month: ${monthLabel}`, pw / 2, 21, { align: "center" });

    // Student info
    doc.setFontSize(9);
    doc.text(`Name: ${studentInfo?.name || profile?.name}`, 14, 30);
    doc.text(`Roll No: ${studentInfo?.roll_number}`, 14, 36);
    doc.text(`Semester: ${studentInfo?.semester}`, 14, 42);
    doc.text(`Department: ${studentInfo?.department}`, pw / 2, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, pw / 2, 36);
    doc.text(`Overall Attendance: ${overallPct}%`, pw / 2, 42);

    // Table
    autoTable(doc, {
      startY: 50,
      head: [["Sl.No", "Subject", "Code", "Working Days", "Present", "Absent", "%"]],
      body: [
        ...rows.map((r, i) => [
          i + 1,
          r.subject_name,
          r.subject_code,
          r.working_days,
          r.present,
          r.absent,
          `${r.percentage}%`,
        ]),
        ["", "TOTAL / OVERALL", "", totalWorking, totalPresent, totalAbsent, `${overallPct}%`],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { halign: "center", cellWidth: 12 },
        1: { cellWidth: 55 },
        2: { halign: "center", cellWidth: 18 },
        3: { halign: "center", cellWidth: 24 },
        4: { halign: "center", cellWidth: 18 },
        5: { halign: "center", cellWidth: 18 },
        6: { halign: "center", cellWidth: 18 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell(data) {
        const isFooter = data.row.index === rows.length;
        if (isFooter) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [241, 245, 249];
        }
        if (data.section === "body" && data.column.index === 6 && !isFooter) {
          const pct = rows[data.row.index]?.percentage ?? 0;
          data.cell.styles.textColor = pct < 75 ? [220, 38, 38] : [5, 150, 105];
          data.cell.styles.fontStyle = "bold";
        }
        if (isFooter && data.column.index === 6) {
          data.cell.styles.textColor = overallPct < 75 ? [220, 38, 38] : [5, 150, 105];
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text("* Subjects with attendance below 75% are at risk. Please attend regularly.", 14, finalY);

    doc.save(`my_monthly_report_${selectedMonth}.pdf`);
    showToast("success", "PDF report downloaded");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monthly Report</h1>
          <p className="text-slate-500 mt-1">Your subject-wise attendance summary for a selected month</p>
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

      {/* Month selector */}
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <Select
            label="Select Month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>

          {/* Student info strip */}
          {studentInfo && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{studentInfo.name}</span>
              <span className="text-slate-500">
                Roll: <strong className="font-mono">{studentInfo.roll_number}</strong>
                &nbsp;|&nbsp; Sem {studentInfo.semester}
                &nbsp;|&nbsp; {studentInfo.department}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* At-risk alert */}
      {atRiskSubjects.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200">
          <AlertTriangle size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-900">
              {atRiskSubjects.length} subject{atRiskSubjects.length > 1 ? "s" : ""} below 75% attendance
            </p>
            <p className="text-sm text-rose-700 mt-0.5">
              {atRiskSubjects.map((s) => `${s.subject_name} (${s.percentage}%)`).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Total Working Days</p>
            <p className="text-2xl font-bold text-slate-900">{totalWorking}</p>
          </Card>
          <Card className="p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-emerald-500">
              <TrendingUp size={16} />
            </div>
            <p className="text-2xl font-bold text-emerald-600">{totalPresent}</p>
            <p className="text-xs text-slate-500 mt-0.5">Present</p>
          </Card>
          <Card className="p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-rose-500">
              <TrendingDown size={16} />
            </div>
            <p className="text-2xl font-bold text-rose-600">{totalAbsent}</p>
            <p className="text-xs text-slate-500 mt-0.5">Absent</p>
          </Card>
          <Card className={`p-4 text-center border-2 ${overallPct >= 75 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
            <div className="flex items-center justify-center gap-1 mb-1">
              <CheckCircle size={16} className={overallPct >= 75 ? "text-emerald-500" : "text-rose-500"} />
            </div>
            <p className={`text-2xl font-bold ${overallPct >= 75 ? "text-emerald-600" : "text-rose-600"}`}>
              {overallPct}%
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Overall</p>
          </Card>
        </div>
      )}

      {/* Report Table */}
      <Card>
        {/* Report title bar */}
        {rows.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl text-center">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Monthly Attendance — {monthLabel}
            </h2>
            {studentInfo && (
              <p className="text-xs text-slate-500 mt-0.5">
                {studentInfo.name} &nbsp;·&nbsp; Roll: {studentInfo.roll_number}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <CalendarCheck size={36} className="mb-3" />
            <p className="font-medium">No attendance data found</p>
            <p className="text-sm mt-1">Select a month to view your report</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-3 py-3 text-center text-xs font-semibold">Sl.No</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold">Subject</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">Code</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">Working<br />Days</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">Present<br />(Days)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">Absent<br />(Days)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => (
                  <tr
                    key={row.subject_id}
                    className={`transition-colors ${
                      row.percentage < 75
                        ? "bg-rose-50 hover:bg-rose-100"
                        : i % 2 === 0
                        ? "bg-white hover:bg-slate-50"
                        : "bg-slate-50/50 hover:bg-slate-100"
                    }`}
                  >
                    <td className="px-3 py-3 text-center text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <BookOpen size={15} className="text-slate-400 flex-shrink-0" />
                        <span className="font-medium text-slate-900">{row.subject_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-slate-600 text-xs">{row.subject_code}</td>
                    <td className="px-3 py-3 text-center text-slate-600 font-medium">{row.working_days}</td>
                    <td className="px-3 py-3 text-center text-emerald-700 font-bold">{row.present}</td>
                    <td className="px-3 py-3 text-center text-rose-600 font-bold">{row.absent}</td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant={row.percentage >= 75 ? "success" : "danger"}>
                        {row.percentage}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td colSpan={3} className="px-3 py-3 text-xs font-bold text-slate-700 text-right">
                    Overall Total →
                  </td>
                  <td className="px-3 py-3 text-center text-xs font-bold text-slate-700">{totalWorking}</td>
                  <td className="px-3 py-3 text-center text-xs font-bold text-emerald-700">{totalPresent}</td>
                  <td className="px-3 py-3 text-center text-xs font-bold text-rose-600">{totalAbsent}</td>
                  <td className="px-3 py-3 text-center">
                    <Badge variant={overallPct >= 75 ? "success" : "danger"}>{overallPct}%</Badge>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-400 flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" />
              Below 75% (attendance shortage)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
              75% and above (safe)
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
