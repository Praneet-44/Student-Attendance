import { useEffect, useState } from "react";
import { Plus, Search, Trash2, BookOpen } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import type { Department, Subject, Teacher } from "../../lib/types";
import { DEMO_TEACHER_SUBJECTS, DEMO_DEPARTMENTS } from "../../lib/demoData";

interface SubjectWithRelations extends Subject {
  departments: { name: string; code: string } | null;
  teachers: { id: string; profiles: { name: string } | null } | null;
}

export function SubjectsPage() {
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<SubjectWithRelations[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<SubjectWithRelations | null>(null);

  const [form, setForm] = useState({
    name: "",
    code: "",
    semester: "1",
    department_id: "",
    teacher_id: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [subRes, deptRes, teacherRes] = await Promise.all([
        supabase.from("subjects").select("*, departments(name, code), teachers(id, profiles(name))").order("name"),
        supabase.from("departments").select("id, name, code").order("name"),
        supabase.from("teachers").select("id, department_id, profiles(name)").order("created_at"),
      ]);

      if (subRes.error || !subRes.data || subRes.data.length === 0) {
        setSubjects(DEMO_TEACHER_SUBJECTS as unknown as SubjectWithRelations[]);
        setDepartments(DEMO_DEPARTMENTS as unknown as Department[]);
      } else {
        setSubjects(subRes.data as unknown as SubjectWithRelations[]);
        setDepartments((deptRes.data || DEMO_DEPARTMENTS) as unknown as Department[]);
        setTeachers((teacherRes.data || []) as unknown as Teacher[]);
      }
    } catch {
      setSubjects(DEMO_TEACHER_SUBJECTS as unknown as SubjectWithRelations[]);
      setDepartments(DEMO_DEPARTMENTS as unknown as Department[]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = subjects.filter((s) => {
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
  });

  async function handleCreate() {
    if (!form.name || !form.code) {
      showToast("error", "Please fill all required fields");
      return;
    }
    const { error } = await supabase.from("subjects").insert({
      name: form.name,
      code: form.code,
      semester: parseInt(form.semester) || 1,
      department_id: form.department_id || null,
      teacher_id: form.teacher_id || null,
    });
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", "Subject created successfully");
    setModalOpen(false);
    setForm({ name: "", code: "", semester: "1", department_id: "", teacher_id: "" });
    await loadData();
  }

  async function handleDelete() {
    if (!deleteModal) return;
    const { error } = await supabase.from("subjects").delete().eq("id", deleteModal.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", "Subject deleted");
    setDeleteModal(null);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subjects</h1>
          <p className="text-slate-500 mt-1">Manage subjects and assign teachers</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={18} /> Add Subject
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or code..."
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
            <BookOpen size={32} className="mb-2" />
            <p>No subjects found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Semester</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Teacher</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{s.code}</td>
                    <td className="px-4 py-3">
                      {s.departments ? <Badge variant="info">{s.departments.code}</Badge> : <span className="text-slate-400 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">Sem {s.semester}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {s.teachers?.profiles?.name || <span className="text-slate-400">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => setDeleteModal(s)}
                          className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New Subject">
        <div className="space-y-4">
          <Input label="Subject Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Data Structures" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Subject Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CS201" />
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
          <Select label="Assign Teacher" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
            <option value="">Select teacher (optional)</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.profiles?.name || "Unknown"}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Subject</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Subject" size="sm">
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-medium text-slate-900">{deleteModal?.name}</span>?
          This will also remove all related attendance records.
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setDeleteModal(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
