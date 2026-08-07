import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile, UserRole } from "../lib/types";
import { withTimeout } from "../lib/cache";

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    name: string,
    role: UserRole,
  ) => Promise<{ error: string | null }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_STORAGE_KEY = "sams_demo_session_v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check if demo session exists in localStorage
    const savedDemo = localStorage.getItem(DEMO_STORAGE_KEY);
    if (savedDemo) {
      try {
        const parsed = JSON.parse(savedDemo);
        setSession(parsed.session);
        setProfile(parsed.profile);
        setLoading(false);
      } catch {
        localStorage.removeItem(DEMO_STORAGE_KEY);
      }
    }

    // 2. Try fetching Supabase session with 1s timeout
    withTimeout(supabase.auth.getSession(), 1000)
      .then(({ data }) => {
        if (data.session) {
          setSession(data.session);
          loadProfile(data.session.user.id, data.session.user);
        } else if (!savedDemo) {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!savedDemo) {
          setLoading(false);
        }
      });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (newSession) {
          setSession(newSession);
          loadProfile(newSession.user.id, newSession.user);
        } else if (!localStorage.getItem(DEMO_STORAGE_KEY)) {
          setProfile(null);
          setSession(null);
          setLoading(false);
        }
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string, authUser?: any) {
    try {
      const res = await withTimeout(
        supabase
          .from("profiles")
          .select("id, name, role, created_at")
          .eq("id", userId)
          .maybeSingle(),
        1000
      );

      if (!res.error && res.data) {
        setProfile(res.data);
        setLoading(false);
        return;
      }
    } catch {
      // Supabase query failed or timed out
    }

    // Fallback profile if Supabase profile row missing or query failed
    const metaRole: UserRole = authUser?.user_metadata?.role ||
      (authUser?.email?.includes("admin") ? "admin" : authUser?.email?.includes("teacher") ? "teacher" : "student");
    const metaName: string = authUser?.user_metadata?.name || authUser?.email?.split("@")[0] || "User";

    const fallbackProfile: Profile = {
      id: userId,
      name: metaName,
      role: metaRole,
      created_at: new Date().toISOString(),
    };

    // Auto-create missing profile row in Supabase if user is logged in
    try {
      await supabase.from("profiles").upsert({
        id: userId,
        name: metaName,
        role: metaRole,
      });
    } catch {
      // Ignore if RLS or network prevents write
    }

    setProfile(fallbackProfile);
    setLoading(false);
  }

  function createDemoAuth(email: string, name: string, role: UserRole) {
    const userId = `demo-${role}-${Date.now()}`;
    const mockProfile: Profile = {
      id: userId,
      name: name || email.split("@")[0] || "Demo User",
      role: role,
      created_at: new Date().toISOString(),
    };
    const mockSession = {
      access_token: "demo-token",
      refresh_token: "demo-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: userId,
        email: email,
        user_metadata: { name: mockProfile.name, role: role },
        app_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
      },
    } as unknown as Session;

    localStorage.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({ session: mockSession, profile: mockProfile }),
    );
    setSession(mockSession);
    setProfile(mockProfile);
  }

  async function signUp(
    email: string,
    password: string,
    name: string,
    role: UserRole,
  ) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name, role } },
      });

      if (error) {
        // If network error, create local demo account as fallback
        if (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("Failed")) {
          createDemoAuth(email, name, role);
          return { error: null };
        }
        return { error: error.message };
      }

      // If sign up succeeded but session returned immediately (auto-confirm)
      if (data.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id, data.session.user);
      }
      return { error: null };
    } catch {
      // Fallback for network failure
      createDemoAuth(email, name, role);
      return { error: null };
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Handle network / fetch failure by falling back to demo mode if offline
        if (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("Failed")) {
          const role: UserRole = email.includes("admin") ? "admin" : email.includes("teacher") ? "teacher" : "student";
          createDemoAuth(email, email.split("@")[0], role);
          return { error: null };
        }
        return { error: error.message };
      }

      if (data.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id, data.session.user);
      }
      return { error: null };
    } catch {
      // Offline fallback
      const role: UserRole = email.includes("admin") ? "admin" : email.includes("teacher") ? "teacher" : "student";
      createDemoAuth(email, email.split("@")[0], role);
      return { error: null };
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore network error on sign out
    }
    localStorage.removeItem(DEMO_STORAGE_KEY);
    setProfile(null);
    setSession(null);
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

