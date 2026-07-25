import { useEffect, useState } from "react";
import { Plus, Building2, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/Toast";
import type { Department } from "../../lib/types";
import { DEMO_DEPARTMENTS } from "../../lib/demoData";

export function DepartmentsPage() {
  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("departments").select("id, name, code, created_at").order("name");
      if (error || !data || data.length === 0) {
        setDepartments(DEMO_DEPARTMENTS as unknown as Department[]);
      } else {
        setDepartments(data);
      }
    } catch {
      setDepartments(DEMO_DEPARTMENTS as unknown as Department[]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.name || !form.code) {
      showToast("error", "Please fill all fields");
      return;
    }
    const { error } = await supabase.from("departments").insert({
      name: form.name,
      code: form.code.toUpperCase(),
    });
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", "Department created successfully");
    setModalOpen(false);
    setForm({ name: "", code: "" });
    await loadData();
  }

  async function handleDelete() {
    if (!deleteModal) return;
    const { error } = await supabase.from("departments").delete().eq("id", deleteModal.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", "Department deleted");
    setDeleteModal(null);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Departments</h1>
          <p className="text-slate-500 mt-1">Manage academic departments</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={18} /> Add Department
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
        </div>
      ) : departments.length === 0 ? (
        <Card className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Building2 size={32} className="mb-2" />
          <p>No departments found</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((d) => (
            <Card key={d.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                    <Building2 size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{d.name}</h3>
                    <Badge variant="info">{d.code}</Badge>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteModal(d)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New Department">
        <div className="space-y-4">
          <Input label="Department Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Computer Science & Engineering" />
          <Input label="Department Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CSE" />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Department</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Department" size="sm">
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-medium text-slate-900">{deleteModal?.name}</span>?
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setDeleteModal(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
