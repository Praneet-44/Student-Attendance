import { useEffect, useState, useRef } from "react";
import {
  FileSpreadsheet, FileText, Download, CalendarDays, Users, Printer,
  Edit3, Save, Plus, Trash2, CheckCircle, FileUp
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select, Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { DEMO_STUDENTS } from "../../lib/demoData";
import { getLocalCache, setLocalCache } from "../../lib/cache";

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
  const [workingDays, setWorkingDays] = useState(25);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
    setIsEditing(false);

    // Check local cache for manual/imported custom entries for this month
    const cacheKey = `monthly_report_${selectedMonth}_${profile?.id || "demo"}`;
    const cachedData = getLocalCache<{ rows: StudentMonthlyRow[]; workingDays: number }>(cacheKey);

    if (cachedData && cachedData.rows && cachedData.rows.length > 0) {
      setRows(cachedData.rows);
      setWorkingDays(cachedData.workingDays || 25);
      setLoading(false);
      return;
    }

    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const startDate = `${selectedMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      // Demo Mode Fallback
      if (isDemo) {
        const total = 25;
        setWorkingDays(total);

        const demoResult: StudentMonthlyRow[] = DEMO_STUDENTS.map((stu, idx) => {
          const p = Math.max(12, Math.min(25, 25 - ((idx * 3) % 11)));
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
        setLocalCache(cacheKey, { rows: demoResult, workingDays: total });
        setLoading(false);
        return;
      }

      // Live Supabase Fetch
      const { data: att } = await supabase
        .from("attendance")
        .select("student_id, date, status, students(roll_number, profiles(name))")
        .gte("date", startDate)
        .lte("date", endDate);

      const { data: allStudents } = await supabase
        .from("students")
        .select("id, roll_number, profiles(name)")
        .order("roll_number");

      const uniqueDates = new Set((att || []).map((a) => a.date));
      const total = uniqueDates.size || 25;
      setWorkingDays(total);

      const studentMap = new Map<
        string,
        { roll_number: string; name: string; present: number; absent: number }
      >();

      // Populate registered students
      (allStudents || []).forEach((stu) => {
        studentMap.set(stu.id, {
          roll_number: stu.roll_number || "—",
          name: (stu as any).profiles?.name || "—",
          present: 0,
          absent: 0,
        });
      });

      // Populate attendance records if any exist
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

      const list = Array.from(studentMap.values()).sort((a, b) =>
        a.roll_number.localeCompare(b.roll_number)
      );

      const result: StudentMonthlyRow[] = list.map((s, i) => {
        const presentDays = uniqueDates.size > 0 ? s.present : 22; // Default present days if none recorded yet
        const absentDays = Math.max(0, total - presentDays);
        const pct = Math.round((presentDays / total) * 100 * 100) / 100;
        return {
          sl_no: i + 1,
          roll_number: s.roll_number,
          name: s.name,
          present: presentDays,
          absent: absentDays,
          total,
          percentage: pct,
        };
      });

      setRows(result);
      setLocalCache(cacheKey, { rows: result, workingDays: total });
    } catch {
      showToast("error", "Unexpected error loading report.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Excel Upload
  function handleExcelUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

        if (jsonRows.length === 0) {
          showToast("error", "The uploaded Excel file is empty.");
          return;
        }

        let detectedWorkingDays = workingDays;

        const importedRows: StudentMonthlyRow[] = jsonRows.map((row, idx) => {
          const roll_number = String(
            row["Roll No"] || row["roll_number"] || row["Roll Number"] || row["RollNo"] || ""
          ).trim();
          const name = String(
            row["Name of the Student"] || row["name"] || row["Student Name"] || row["Name"] || ""
          ).trim();

          const present = Number(
            row["Present (Days)"] ?? row["present"] ?? row["Present"] ?? row["present_days"] ?? 0
          );
          const absent = Number(
            row["Absent (Days)"] ?? row["absent"] ?? row["Absent"] ?? row["absent_days"] ?? 0
          );
          const totalInRow = Number(
            row["Working Days"] ?? row["working_days"] ?? row["Total Working Days"] ?? row["total"] ?? (present + absent || workingDays)
          );

          if (totalInRow > 0) detectedWorkingDays = totalInRow;

          const calcTotal = totalInRow || detectedWorkingDays;
          const calcAbsent = absent || Math.max(0, calcTotal - present);
          const pct = calcTotal > 0 ? Math.round((present / calcTotal) * 100 * 100) / 100 : 0;

          return {
            sl_no: idx + 1,
            roll_number: roll_number || `REG${1000 + idx}`,
            name: name || `Student ${idx + 1}`,
            present: isNaN(present) ? 0 : present,
            absent: isNaN(calcAbsent) ? 0 : calcAbsent,
            total: isNaN(calcTotal) ? 25 : calcTotal,
            percentage: isNaN(pct) ? 0 : pct,
          };
        });

        setWorkingDays(detectedWorkingDays);
        setRows(importedRows);

        // Save to local cache
        const cacheKey = `monthly_report_${selectedMonth}_${profile?.id || "demo"}`;
        setLocalCache(cacheKey, { rows: importedRows, workingDays: detectedWorkingDays });

        showToast("success", `Successfully imported ${importedRows.length} student records from Excel!`);
      } catch (err) {
        showToast("error", "Error parsing Excel file. Please ensure correct format.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Save manual modifications
  function saveManualEdits() {
    const updatedRows = rows.map((r, i) => {
      const calcTotal = workingDays;
      const calcAbsent = Math.max(0, calcTotal - r.present);
      const pct = calcTotal > 0 ? Math.round((r.present / calcTotal) * 100 * 100) / 100 : 0;
      return {
        ...r,
        sl_no: i + 1,
        absent: calcAbsent,
        total: calcTotal,
        percentage: pct,
      };
    });

    setRows(updatedRows);
    setIsEditing(false);

    const cacheKey = `monthly_report_${selectedMonth}_${profile?.id || "demo"}`;
    setLocalCache(cacheKey, { rows: updatedRows, workingDays });

    showToast("success", "Monthly attendance report saved successfully!");
  }

  // Add new student row
  function addNewStudentRow() {
    const newRow: StudentMonthlyRow = {
      sl_no: rows.length + 1,
      roll_number: `ROLL${100 + rows.length + 1}`,
      name: "New Student",
      present: workingDays,
      absent: 0,
      total: workingDays,
      percentage: 100,
    };
    setRows([...rows, newRow]);
  }

  // Delete student row
  function deleteStudentRow(index: number) {
    const updated = rows.filter((_, i) => i !== index).map((r, i) => ({ ...r, sl_no: i + 1 }));
    setRows(updated);
  }

  // Download Blank Excel Template
  function downloadExcelTemplate() {
    const templateData = [
      {
        "Sl.No": 1,
        "Roll No": "24UGSIT00001",
        "Name of the Student": "NIVETHA M",
        "Present (Days)": 24,
        "Absent (Days)": 1,
        "Working Days": 25,
        "%": 96,
      },
      {
        "Sl.No": 2,
        "Roll No": "24UGSIT00002",
        "Name of the Student": "K DHARSANA",
        "Present (Days)": 23,
        "Absent (Days)": 2,
        "Working Days": 25,
        "%": 92,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = [{ wch: 8 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Attendance Template");
    XLSX.writeFile(wb, "monthly_attendance_template.xlsx");
    showToast("success", "Monthly attendance template downloaded!");
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

    // ── Header ──
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
      {/* Hidden File Input for Excel Import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleExcelUpload(file);
        }}
      />

      {/* Header & Export/Import Controls */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monthly Attendance Report</h1>
          <p className="text-slate-500 mt-1">
            Enter, import, or export consolidated monthly attendance details
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Import Excel */}
          <Button
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={16} /> Import Excel Report
          </Button>

          {/* Edit / Add More Button */}
          {!isEditing ? (
            <Button variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" onClick={() => setIsEditing(true)}>
              <Edit3 size={16} /> Edit / Add More
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={addNewStudentRow}>
              <Plus size={16} /> Add More Student
            </Button>
          )}

          {/* Save Data Button */}
          <Button className="bg-emerald-600 hover:bg-emerald-700 font-semibold" onClick={saveManualEdits}>
            <Save size={16} /> Save Data
          </Button>

          {/* Download Buttons */}
          <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
            <FileSpreadsheet size={16} /> Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={rows.length === 0}>
            <FileText size={16} /> PDF
          </Button>
        </div>
      </div>

      {/* Month & Working Days Selection */}
      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end max-w-2xl">
          <Select
            label="Select Month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>

          <Input
            label="No. of Working Days"
            type="number"
            value={workingDays}
            min={1}
            max={31}
            disabled={!isEditing}
            onChange={(e) => setWorkingDays(Number(e.target.value) || 25)}
          />

          <div className="flex items-end pb-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs w-full"
              onClick={downloadExcelTemplate}
            >
              <Download size={14} /> Template Excel
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
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

      {/* Main Table */}
      <Card>
        {/* Table header bar */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl flex items-center justify-between flex-wrap gap-2">
          <div className="text-center sm:text-left">
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
              Monthly Attendance for the Month of {monthLabel}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">No. of Working Days : <strong>{workingDays}</strong></p>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                <Edit3 size={14} /> Edit / Add More
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={addNewStudentRow}>
                <Plus size={14} /> Add Student
              </Button>
            )}

            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={saveManualEdits}>
              <Save size={14} /> Save Data
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-slate-400 gap-3 p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <CalendarDays size={32} />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-base">No attendance data for {monthLabel}</p>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                You can import an Excel sheet with student monthly details or enter details manually.
              </p>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <Button
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={16} /> Import Excel File
              </Button>
              <Button onClick={() => setIsEditing(true)}>
                <Edit3 size={16} /> Enter Details Manually
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-2.5 py-3 text-center text-xs font-semibold uppercase w-12">Sl.No</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase whitespace-nowrap">Roll No</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase min-w-[180px]">Name of the Student</th>
                  <th className="px-2.5 py-3 text-center text-xs font-semibold uppercase whitespace-nowrap">Present (Days)</th>
                  <th className="px-2.5 py-3 text-center text-xs font-semibold uppercase whitespace-nowrap">Absent (Days)</th>
                  <th className="px-2.5 py-3 text-center text-xs font-semibold uppercase whitespace-nowrap">Working Days</th>
                  <th className="px-2.5 py-3 text-center text-xs font-semibold uppercase whitespace-nowrap">%</th>
                  {isEditing && <th className="px-2.5 py-3 text-center text-xs font-semibold uppercase">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => {
                  const presentVal = row.present;
                  const calcAbsent = Math.max(0, workingDays - presentVal);
                  const calcPct = workingDays > 0 ? Math.round((presentVal / workingDays) * 100 * 100) / 100 : 0;

                  return (
                    <tr
                      key={index}
                      className={`transition-colors ${
                        calcPct < 75
                          ? "bg-rose-50 hover:bg-rose-100"
                          : index % 2 === 0
                          ? "bg-white hover:bg-slate-50"
                          : "bg-slate-50/50 hover:bg-slate-100"
                      }`}
                    >
                      <td className="px-2.5 py-2.5 text-center text-slate-500">{index + 1}</td>

                      {/* Roll No */}
                      <td className="px-3 py-2.5 font-mono text-slate-700 font-medium whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.roll_number}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[index].roll_number = e.target.value;
                              setRows(updated);
                            }}
                            className="w-28 px-2 py-1 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          row.roll_number
                        )}
                      </td>

                      {/* Name of Student */}
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[index].name = e.target.value;
                              setRows(updated);
                            }}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          row.name
                        )}
                      </td>

                      {/* Present (Days) */}
                      <td className="px-2.5 py-2.5 text-center text-emerald-700 font-semibold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            max={workingDays}
                            value={row.present}
                            onChange={(e) => {
                              const p = Math.min(workingDays, Math.max(0, Number(e.target.value) || 0));
                              const updated = [...rows];
                              updated[index].present = p;
                              updated[index].absent = Math.max(0, workingDays - p);
                              updated[index].percentage = Math.round((p / workingDays) * 100 * 100) / 100;
                              setRows(updated);
                            }}
                            className="w-16 px-1.5 py-1 border border-slate-300 rounded text-xs text-center font-bold text-emerald-700 focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          row.present
                        )}
                      </td>

                      {/* Absent (Days) */}
                      <td className="px-2.5 py-2.5 text-center text-rose-600 font-semibold whitespace-nowrap">
                        {isEditing ? calcAbsent : row.absent}
                      </td>

                      {/* Working Days */}
                      <td className="px-2.5 py-2.5 text-center text-slate-600 font-medium whitespace-nowrap">
                        {workingDays}
                      </td>

                      {/* Percentage */}
                      <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                        <Badge variant={calcPct >= 75 ? "success" : "danger"}>
                          {calcPct}%
                        </Badge>
                      </td>

                      {/* Delete Action when editing */}
                      {isEditing && (
                        <td className="px-2 py-2.5 text-center">
                          <button
                            onClick={() => deleteStudentRow(index)}
                            className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer */}
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-slate-700 text-right">
                    Class Average →
                  </td>
                  <td className="px-2.5 py-2.5 text-center text-xs font-bold text-emerald-700">
                    {rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.present, 0) / rows.length * 10) / 10 : 0}
                  </td>
                  <td className="px-2.5 py-2.5 text-center text-xs font-bold text-rose-600">
                    {rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.absent, 0) / rows.length * 10) / 10 : 0}
                  </td>
                  <td className="px-2.5 py-2.5 text-center text-xs font-bold text-slate-600">{workingDays}</td>
                  <td className="px-2.5 py-2.5 text-center">
                    <Badge variant={presentAvg >= 75 ? "success" : "danger"}>{presentAvg}%</Badge>
                  </td>
                  {isEditing && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Action bar when editing */}
        {isEditing && (
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={addNewStudentRow}>
              <Plus size={14} /> Add Row
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={saveManualEdits}>
                <CheckCircle size={14} /> Save Monthly Report
              </Button>
            </div>
          </div>
        )}

        {/* Legend */}
        {rows.length > 0 && !isEditing && (
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
