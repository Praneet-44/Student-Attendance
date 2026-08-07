import { type ReactNode, useState } from "react";
import {
  GraduationCap, LayoutDashboard, Users, Building2,
  ClipboardCheck, FileBarChart, LogOut, Menu, X, Shield,
  CalendarDays, Upload, History, UserCog, FileUp, ImageIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../lib/types";

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
}

const navByRole: Record<UserRole, NavItem[]> = {
  admin: [
    { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { key: "teachers", label: "Teachers", icon: <UserCog size={20} /> },
    { key: "students", label: "Students", icon: <Users size={20} /> },
    { key: "bulk-import", label: "Bulk Import", icon: <FileUp size={20} /> },
    { key: "departments", label: "Departments", icon: <Building2 size={20} /> },
    { key: "reports", label: "Reports", icon: <FileBarChart size={20} /> },
    { key: "audit", label: "Audit Logs", icon: <History size={20} /> },
  ],
  teacher: [
    { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { key: "mark", label: "Mark Attendance", icon: <ClipboardCheck size={20} /> },
    { key: "upload", label: "Excel Upload", icon: <Upload size={20} /> },
    { key: "image-upload", label: "Image Upload", icon: <ImageIcon size={20} /> },
    { key: "reports", label: "Reports", icon: <FileBarChart size={20} /> },
  ],
  student: [
    { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { key: "attendance", label: "My Attendance", icon: <ClipboardCheck size={20} /> },
    { key: "calendar", label: "Calendar", icon: <CalendarDays size={20} /> },
    { key: "reports", label: "Download Reports", icon: <FileBarChart size={20} /> },
  ],
};

const roleConfig: Record<UserRole, { label: string; color: string; bg: string }> = {
  admin: { label: "Administrator", color: "text-rose-600", bg: "bg-rose-50" },
  teacher: { label: "Teacher", color: "text-blue-600", bg: "bg-blue-50" },
  student: { label: "Student", color: "text-emerald-600", bg: "bg-emerald-50" },
};

interface LayoutProps {
  activePage: string;
  onPageChange: (page: string) => void;
  children: ReactNode;
}

export function Layout({ activePage, onPageChange, children }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!profile) return null;

  const navItems = navByRole[profile.role];
  const roleInfo = roleConfig[profile.role];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col z-40 transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <GraduationCap size={20} />
            </div>
            <div>
              <span className="text-lg font-bold text-slate-900">SAMS</span>
              <p className="text-xs text-slate-400">Attendance System</p>
            </div>
          </div>
        </div>

        {/* Role badge */}
        <div className="px-4 py-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${roleInfo.bg}`}>
            {profile.role === "admin" && <Shield size={16} className={roleInfo.color} />}
            <span className={`text-sm font-medium ${roleInfo.color}`}>{roleInfo.label}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                onPageChange(item.key);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activePage === item.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* User info & logout */}
        <div className="px-3 py-3 border-t border-slate-200">
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium text-sm">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{profile.name}</p>
              <p className="text-xs text-slate-400 truncate">{profile.role}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <GraduationCap size={18} />
            </div>
            <span className="font-bold text-slate-900">SAMS</span>
          </div>
          <div className="w-10" />
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Close button for mobile sidebar */}
      {sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(false)}
          className="fixed top-4 right-4 z-50 lg:hidden p-2 rounded-lg bg-white shadow-lg"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
}
