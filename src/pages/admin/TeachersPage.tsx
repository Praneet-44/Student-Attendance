import { useEffect, useState } from "react";
import { Plus, Search, Trash2, KeyRound, Mail } from "lucide-react";
import { supabase, ADMIN_FUNCTION_URL } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import type { Department, UserWithInfo } from "../../lib/types";
import { DEMO_DEPARTMENTS } from "../../lib/demoData";

const DEMO_TEACHERS: UserWithInfo[] = [
  { id: "demo-t-1", name: "Dr. Robert Vance", email: "robert@university.edu", role: "teacher", created_at: new Date().toISOString(), teacher_info: { id: "demo-t-1", department_id: "demo-dept-1", created_at: new Date().toISOString() } },
  { id: "demo-t-2", name: "Prof. Sarah Connor", email: "sarah@university.edu", role: "teacher", created_at: new Date().toISOString(), teacher_info: { id: "demo-t-2", department_id: "demo-dept-1", created_at: new Date().toISOString() } },
  { id: "demo-t-3", name: "Dr. Alan Turing", email: "alan@university.edu", role: "teacher", created_at: new Date().toISOString(), teacher_info: { id: "demo-t-3", department_id: "demo-dept-2", created_at: new Date().toISOString() } },
];

export function TeachersPage() {
  const { showToast } = useToast();
  const { session } = useAuth();
  const [teachers, setTeachers] = useState<UserWithInfo[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetModal, setResetModal] = useState<UserWithInfo | null>(null);
  const [deleteModal, setDeleteModal] = useState<UserWithInfo | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department_id: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [deptRes] = await Promise.all([
        supabase.from("departments").select("id, name, code").order("name"),
      ]);
      setDepartments((deptRes.data || DEMO_DEPARTMENTS) as unknown as Department[]);
      await loadTeachers();
    } catch {
      setDepartments(DEMO_DEPARTMENTS as unknown as Department[]);
      setTeachers(DEMO_TEACHERS);
    } finally {
      setLoading(false);
    }
  }

  async function loadTeachers() {
    try {
      const res = await fetch(`${ADMIN_FUNCTION_URL}/list`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        setTeachers(DEMO_TEACHERS);
        return;
      }
      const data = await res.json();
      const filteredUsers = (data.users || []).filter((u: UserWithInfo) => u.role === "teacher");
      if (filteredUsers.length === 0) {
        setTeachers(DEMO_TEACHERS);
      } else {
        setTeachers(filteredUsers);
      }
    } catch {
      setTeachers(DEMO_TEACHERS);
    }
  }

  const filtered = teachers.filter((t) => {
    const q = search.toLowerCase();
    const deptName = getDeptName(t.teacher_info?.department_id || null);
    return (
      t.name.toLowerCase().includes(q) ||
      (t.email || "").toLowerCase().includes(q) ||
      deptName.toLowerCase().includes(q)
    );
  });

  function getDeptName(id: string | null): string {
    if (!id) return "Unassigned";
    const dept = departments.find((d) => d.id === id);
    return dept ? dept.name : "Unknown";
  }

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) {
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
        role: "teacher",
        department_id: form.department_id || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast("error", data.error || "Failed to create teacher");
      return;
    }
    showToast("success", "Teacher account created successfully");
    setModalOpen(false);
    setForm({ name: "", email: "", password: "", department_id: "" });
    await loadTeachers();
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
    const data = await res.json();
    if (!res.ok) {
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
    const data = await res.json();
    if (!res.ok) {
      showToast("error", data.error || "Failed to delete teacher");
      return;
    }
    showToast("success", "Teacher account deleted");
    setDeleteModal(null);
    await loadTeachers();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teachers</h1>
          <p className="text-slate-500 mt-1">Manage teacher accounts and assignments</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={18} /> Add Teacher
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Mail size={32} className="mb-2" />
            <p>No teachers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm">
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-slate-900">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{t.email || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{getDeptName(t.teacher_info?.department_id || null)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setResetModal(t)}
                          className="p-2 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                          title="Reset password"
                        >
                          <KeyRound size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteModal(t)}
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

      {/* Create teacher modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New Teacher">
        <div className="space-y-4">
          <Input
            label="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Jane Smith"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="jane@university.edu"
          />
          <Input
            label="Temporary Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Min 6 characters"
          />
          <Select
            label="Department"
            value={form.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          >
            <option value="">Select department (optional)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Teacher</Button>
          </div>
        </div>
      </Modal>

      {/* Reset password modal */}
      <Modal open={!!resetModal} onClose={() => { setResetModal(null); setNewPassword(""); }} title="Reset Password">
        <p className="text-sm text-slate-500 mb-4">
          Set a new password for <span className="font-medium text-slate-900">{resetModal?.name}</span>
        </p>
        <Input
          label="New Password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min 6 characters"
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => { setResetModal(null); setNewPassword(""); }}>Cancel</Button>
          <Button onClick={handleResetPassword}>Reset Password</Button>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Teacher" size="sm">
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-medium text-slate-900">{deleteModal?.name}</span>?
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setDeleteModal(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
