import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { LoginPage } from "./pages/LoginPage";
import { Layout } from "./components/Layout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { TeachersPage } from "./pages/admin/TeachersPage";
import { StudentsPage } from "./pages/admin/StudentsPage";
import { SubjectsPage } from "./pages/admin/SubjectsPage";
import { DepartmentsPage } from "./pages/admin/DepartmentsPage";
import { AdminReports } from "./pages/admin/AdminReports";
import { AuditLogsPage } from "./pages/admin/AuditLogsPage";
import { BulkImportStudents } from "./pages/admin/BulkImportStudents";
import { TeacherDashboard } from "./pages/teacher/TeacherDashboard";
import { MarkAttendance } from "./pages/teacher/MarkAttendance";
import { ExcelUpload } from "./pages/teacher/ExcelUpload";
import { TeacherReports } from "./pages/teacher/TeacherReports";
import { StudentDashboard } from "./pages/student/StudentDashboard";
import { StudentAttendance } from "./pages/student/StudentAttendance";
import { StudentCalendar } from "./pages/student/StudentCalendar";
import { StudentReports } from "./pages/student/StudentReports";

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [activePage, setActivePage] = useState("dashboard");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return <LoginPage />;
  }

  function renderPage() {
    if (profile!.role === "admin") {
      switch (activePage) {
        case "dashboard": return <AdminDashboard />;
        case "teachers": return <TeachersPage />;
        case "students": return <StudentsPage />;
        case "bulk-import": return <BulkImportStudents />;
        case "subjects": return <SubjectsPage />;
        case "departments": return <DepartmentsPage />;
        case "reports": return <AdminReports />;
        case "audit": return <AuditLogsPage />;
        default: return <AdminDashboard />;
      }
    }

    if (profile!.role === "teacher") {
      switch (activePage) {
        case "dashboard": return <TeacherDashboard onNavigate={setActivePage} />;
        case "mark": return <MarkAttendance />;
        case "upload": return <ExcelUpload />;
        case "reports": return <TeacherReports />;
        default: return <TeacherDashboard onNavigate={setActivePage} />;
      }
    }

    if (profile!.role === "student") {
      switch (activePage) {
        case "dashboard": return <StudentDashboard />;
        case "attendance": return <StudentAttendance />;
        case "calendar": return <StudentCalendar />;
        case "reports": return <StudentReports />;
        default: return <StudentDashboard />;
      }
    }

    return <LoginPage />;
  }

  return (
    <Layout activePage={activePage} onPageChange={setActivePage}>
      {renderPage()}
    </Layout>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
