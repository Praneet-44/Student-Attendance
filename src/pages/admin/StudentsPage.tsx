import { useEffect, useState } from "react";
import { Plus, Search, Trash2, KeyRound, Users } from "lucide-react";
import { supabase, ADMIN_FUNCTION_URL } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import type { Department, UserWithInfo } from "../../lib/types";

export function StudentsPage() {
  const { showToast } = useToast();
  const { session } = useAuth();
  const [students, setStudents] = useState<UserWithInfo[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [semFilter, setSemFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetModal, setResetModal] = useState<UserWithInfo | null>(null);
  const [deleteModal, setDeleteModal] = useState<UserWithInfo | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    roll_number: "",
    department_id: "",
    semester: "1",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: depts } = await supabase.from("departments").select("id, name, code").order("name");
    setDepartments(depts || []);
    await loadStudents();
    setLoading(false);
  }

  async function loadStudents() {
    const res = await fetch(`${ADMIN_FUNCTION_URL}/list`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setStudents((data.users || []).filter((u: UserWithInfo) => u.role === "student"));
  }

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      s.name.toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.student_info?.roll_number || "").toLowerCase().includes(q);
    const matchDept = !deptFilter || s.student_info?.department_id === deptFilter;
    const matchSem = !semFilter || String(s.student_info?.semester) === semFilter;
    return matchSearch && matchDept && matchSem;
  });

  function getDeptName(id: string | null): string {
    if (!id) return "Unassigned";
    const dept = departments.find((d) => d.id === id);
    return dept ? `${dept.code}` : "Unknown";
  }

  async function handleCreate() {
    if (!form.name || !form.email || !form.password || !form.roll_number) {
      showToast("error", "Please fill all required fields");
      return;
    }
    const res = await fetch(`${ADMIN_FUNCTION_URL}/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        name: form.name,
        role: "student",
        roll_number: form.roll_number,
        department_id: form.department_id || undefined,
        semester: parseInt(form.semester) || 1,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast("error", data.error || "Failed to create student");
      return;
    }
    showToast("success", "Student account created successfully");
    setModalOpen(false);
    setForm({ name: "", email: "", password: "", roll_number: "", department_id: "", semester: "1" });
    await loadStudents();
  }

  async function handleResetPassword() {
    if (!resetModal || !newPassword || newPassword.length < 6) {
      showToast("error", "Password must be at least 6 characters");
      return;
    }
    const res = await fetch(`${ADMIN_FUNCTION_URL}/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ userId: resetModal.id, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json();
      showToast("error", data.error || "Failed to reset password");
      return;
    }
    showToast("success", "Password reset successfully");
    setResetModal(null);
    setNewPassword("");
  }

  async function handleDelete() {
    if (!deleteModal) return;
    const res = await fetch(`${ADMIN_FUNCTION_URL}/delete/${deleteModal.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (!res.ok) {
      const data = await res.json();
      showToast("error", data.error || "Failed to delete student");
      return;
    }
    showToast("success", "Student account deleted");
    setDeleteModal(null);
    await loadStudents();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Students</h1>
          <p className="text-slate-500 mt-1">Manage student accounts and enrollment</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={18} /> Add Student
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or roll no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <Select value={semFilter} onChange={(e) => setSemFilter(e.target.value)}>
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>Semester {s}</option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Users size={32} className="mb-2" />
            <p>No students found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Roll No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Semester</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-medium text-sm">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-slate-900">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{s.email || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{s.student_info?.roll_number || "—"}</td>
                    <td className="px-4 py-3"><Badge variant="info">{getDeptName(s.student_info?.department_id || null)}</Badge></td>
                    <td className="px-4 py-3 text-sm text-slate-600">Sem {s.student_info?.semester || 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setResetModal(s)}
                          className="p-2 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                          title="Reset password"
                        >
                          <KeyRound size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteModal(s)}
                          className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New Student">
        <div className="space-y-4">
          <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@university.edu" />
          <Input label="Temporary Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Roll Number" value={form.roll_number} onChange={(e) => setForm({ ...form, roll_number: e.target.value })} placeholder="CS2024001" />
            <Select label="Semester" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </Select>
          </div>
          <Select label="Department" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">Select department (optional)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Student</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetModal} onClose={() => { setResetModal(null); setNewPassword(""); }} title="Reset Password">
        <p className="text-sm text-slate-500 mb-4">
          Set a new password for <span className="font-medium text-slate-900">{resetModal?.name}</span>
        </p>
        <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => { setResetModal(null); setNewPassword(""); }}>Cancel</Button>
          <Button onClick={handleResetPassword}>Reset Password</Button>
        </div>
      </Modal>

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Student" size="sm">
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-medium text-slate-900">{deleteModal?.name}</span>?
          This will also remove all attendance records. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setDeleteModal(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
