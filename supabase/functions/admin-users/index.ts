import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UserPayload {
  email: string;
  password: string;
  name: string;
  role: "admin" | "teacher" | "student";
  roll_number?: string;
  department_id?: string;
  semester?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing authorization header", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return errorResponse("Invalid token", 401);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      return errorResponse("Admin access required", 403);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace("/functions/v1/admin-users", "");

    if (req.method === "POST" && path === "/create") {
      return await createUser(supabaseAdmin, await req.json());
    }

    if (req.method === "POST" && path === "/bulk-create") {
      return await bulkCreateUsers(supabaseAdmin, await req.json(), userData.user.id);
    }

    if (req.method === "GET" && path === "/list") {
      return await listUsers(supabaseAdmin);
    }

    if (req.method === "POST" && path === "/reset-password") {
      return await resetPassword(supabaseAdmin, await req.json());
    }

    if (req.method === "DELETE" && path.startsWith("/delete/")) {
      const userId = path.replace("/delete/", "");
      return await deleteUser(supabaseAdmin, userId);
    }

    return errorResponse("Not found", 404);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500,
    );
  }
});

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function createUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: UserPayload,
) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      name: payload.name,
      role: payload.role,
    },
  });

  if (error) {
    return errorResponse(error.message, 400);
  }

  const userId = data.user.id;

  if (payload.role === "teacher") {
    const { error: teacherError } = await supabaseAdmin.from("teachers")
      .insert({
        id: userId,
        department_id: payload.department_id || null,
      });
    if (teacherError) {
      return errorResponse(
        `User created but teacher record failed: ${teacherError.message}`,
        400,
      );
    }
  }

  if (payload.role === "student") {
    const { error: studentError } = await supabaseAdmin.from("students")
      .insert({
        id: userId,
        roll_number: payload.roll_number || "",
        department_id: payload.department_id || null,
        semester: payload.semester || 1,
      });
    if (studentError) {
      return errorResponse(
        `User created but student record failed: ${studentError.message}`,
        400,
      );
    }
  }

  await supabaseAdmin.from("audit_logs").insert({
    user_id: userId,
    action: "user_created",
    details: `Created ${payload.role} account: ${payload.email}`,
  });

  return jsonResponse({ success: true, userId });
}

async function listUsers(
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const { data: profiles, error } = await supabaseAdmin.from("profiles")
    .select("id, name, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return errorResponse(error.message, 400);
  }

  // Fetch authentication users to extract emails
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    limit: 1000,
  });

  const emailMap = new Map<string, string>();
  if (!authError && authData?.users) {
    authData.users.forEach((u) => {
      if (u.email) {
        emailMap.set(u.id, u.email);
      }
    });
  }

  const { data: students } = await supabaseAdmin.from("students")
    .select("id, roll_number, department_id, semester");
  const { data: teachers } = await supabaseAdmin.from("teachers")
    .select("id, department_id");

  const studentMap = new Map(
    (students || []).map((s) => [s.id, s]),
  );
  const teacherMap = new Map(
    (teachers || []).map((t) => [t.id, t]),
  );

  const users = (profiles || []).map((p) => ({
    ...p,
    email: emailMap.get(p.id) || "",
    student_info: studentMap.get(p.id) || null,
    teacher_info: teacherMap.get(p.id) || null,
  }));

  return jsonResponse({ users });
}

async function resetPassword(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: { userId: string; newPassword: string },
) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    payload.userId,
    { password: payload.newPassword },
  );

  if (error) {
    return errorResponse(error.message, 400);
  }

  await supabaseAdmin.from("audit_logs").insert({
    user_id: payload.userId,
    action: "password_reset",
    details: "Password reset by admin",
  });

  return jsonResponse({ success: true });
}

async function deleteUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    return errorResponse(error.message, 400);
  }

  await supabaseAdmin.from("audit_logs").insert({
    user_id: null,
    action: "user_deleted",
    details: `Deleted user: ${userId}`,
  });

  return jsonResponse({ success: true });
}

async function bulkCreateUsers(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: { students: UserPayload[] },
  adminUserId: string,
) {
  const { students } = payload;
  if (!students || !Array.isArray(students) || students.length === 0) {
    return errorResponse("No students provided", 400);
  }

  const results: {
    row: number;
    email: string;
    success: boolean;
    error?: string;
  }[] = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    try {
      // Basic validation
      if (!s.email || !s.password || !s.name || !s.roll_number) {
        results.push({ row: i + 1, email: s.email || "?", success: false, error: "Missing required fields" });
        continue;
      }

      // Create auth user
      const { data, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: s.email,
        password: s.password,
        email_confirm: true,
        user_metadata: { name: s.name, role: "student" },
      });

      if (authError || !data?.user) {
        results.push({ row: i + 1, email: s.email, success: false, error: authError?.message || "Auth creation failed" });
        continue;
      }

      const userId = data.user.id;

      // Insert students record
      const { error: studentError } = await supabaseAdmin.from("students").insert({
        id: userId,
        roll_number: s.roll_number,
        department_id: s.department_id || null,
        semester: s.semester || 1,
      });

      if (studentError) {
        // Rollback: delete the auth user we just created
        await supabaseAdmin.auth.admin.deleteUser(userId);
        results.push({ row: i + 1, email: s.email, success: false, error: `Student record failed: ${studentError.message}` });
        continue;
      }

      results.push({ row: i + 1, email: s.email, success: true });
    } catch (err) {
      results.push({ row: i + 1, email: s.email || "?", success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  // Log audit
  await supabaseAdmin.from("audit_logs").insert({
    user_id: adminUserId,
    action: "bulk_student_import",
    details: `Bulk imported students: ${successCount} succeeded, ${failureCount} failed`,
  });

  return jsonResponse({ results, successCount, failureCount });
}
