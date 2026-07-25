import { useState } from "react";
import { GraduationCap, Mail, Lock, Shield, BookOpen, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import type { UserRole } from "../lib/types";

type Mode = "signin" | "signup";

const roleOptions: { value: UserRole; label: string; icon: React.ReactNode }[] = [
  { value: "student", label: "Student", icon: <Users size={18} /> },
  { value: "teacher", label: "Teacher", icon: <BookOpen size={18} /> },
  { value: "admin", label: "Admin", icon: <Shield size={18} /> },
];

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState<string | null>(null);
  const [quickStatus, setQuickStatus] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signin") {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      const { error } = await signUp(email, password, name, role);
      if (error) {
        setError(error);
      } else {
        setError("");
        setMode("signin");
        setEmail("");
        setPassword("");
        setName("");
        alert("Account created! Please sign in.");
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-blue-500 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-emerald-500 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
              <GraduationCap size={28} />
            </div>
            <span className="text-2xl font-bold">SAMS</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Student Attendance<br />Management System
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-10">
            Digitize attendance tracking with real-time insights, role-based access,
            and comprehensive reporting for your institution.
          </p>
          <div className="space-y-4">
            {[
              { icon: <Shield size={20} />, text: "Secure role-based access control" },
              { icon: <BookOpen size={20} />, text: "Effortless attendance marking" },
              { icon: <Users size={20} />, text: "Real-time analytics & reports" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-slate-300">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                  {item.icon}
                </div>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-11 h-11 rounded-xl bg-slate-900 flex items-center justify-center text-white">
              <GraduationCap size={24} />
            </div>
            <span className="text-xl font-bold text-slate-900">SAMS</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-slate-500 mb-8">
            {mode === "signin"
              ? "Sign in to access your dashboard"
              : "Sign up to get started with SAMS"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <Input
                label="Full Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
              />
            )}

            <div className="relative">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                required
              />
              <Mail size={18} className="absolute right-3.5 top-9 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
              <Lock size={18} className="absolute right-3.5 top-9 text-slate-400 pointer-events-none" />
            </div>

            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {roleOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 transition-all ${
                        role === opt.value
                          ? "border-slate-900 bg-slate-50 text-slate-900"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {opt.icon}
                      <span className="text-xs font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            {mode === "signin" ? (
              <>
                Don't have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(""); }}
                  className="text-slate-900 font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("signin"); setError(""); }}
                  className="text-slate-900 font-medium hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          <div className="mt-8 p-3.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
            <p className="font-medium mb-1">First registered user becomes the admin.</p>
            <p>Create an admin account first, then add teachers and students from the admin dashboard.</p>
          </div>

          {mode === "signin" && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">Quick Access</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: "Admin",
                    roleName: "admin" as UserRole,
                    email: "admin@sams.dev",
                    password: "Admin@1234",
                    color: "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100",
                    activeColor: "bg-violet-100 border-violet-400",
                    dot: "bg-violet-500",
                  },
                  {
                    label: "Teacher",
                    roleName: "teacher" as UserRole,
                    email: "teacher@sams.dev",
                    password: "Teacher@1234",
                    color: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
                    activeColor: "bg-emerald-100 border-emerald-400",
                    dot: "bg-emerald-500",
                  },
                  {
                    label: "Student",
                    roleName: "student" as UserRole,
                    email: "student@sams.dev",
                    password: "Student@1234",
                    color: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
                    activeColor: "bg-amber-100 border-amber-400",
                    dot: "bg-amber-500",
                  },
                ].map((demoRole) => (
                  <button
                    key={demoRole.label}
                    type="button"
                    disabled={quickLoading !== null}
                    onClick={async () => {
                      setQuickLoading(demoRole.label);
                      setQuickStatus("Signing in...");
                      setError("");

                      // Try sign in first
                      let { error: signInErr } = await signIn(demoRole.email, demoRole.password);

                      // If user doesn't exist, create it then sign in
                      if (signInErr && (signInErr.toLowerCase().includes("invalid") || signInErr.toLowerCase().includes("credentials"))) {
                        setQuickStatus("Creating account...");
                        await signUp(demoRole.email, demoRole.password, demoRole.label, demoRole.roleName);
                        setQuickStatus("Signing in...");
                        const retry = await signIn(demoRole.email, demoRole.password);
                        signInErr = retry.error;
                      }

                      if (signInErr) {
                        setError(signInErr);
                      }
                      setQuickLoading(null);
                      setQuickStatus("");
                    }}
                    className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-lg border transition-all text-xs font-medium ${
                      quickLoading === demoRole.label ? demoRole.activeColor : demoRole.color
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {quickLoading === demoRole.label ? (
                      <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <span className={`w-2 h-2 rounded-full ${demoRole.dot}`} />
                    )}
                    {demoRole.label}
                    <span className="text-[10px] opacity-60 font-normal truncate w-full text-center">{demoRole.email}</span>
                  </button>
                ))}
              </div>
              {quickStatus ? (
                <p className="text-center text-[10px] text-violet-500 mt-2 font-medium">{quickStatus}</p>
              ) : (
                <p className="text-center text-[10px] text-slate-400 mt-2">Click to instantly sign in (auto-creates account if needed)</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
