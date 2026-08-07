/*
# Student Attendance Management System (SAMS) - Initial Schema

## Overview
Creates the complete database schema for a role-based student attendance management system with three user roles: admin, teacher, and student.

## New Tables
1. **profiles** - Extends auth.users with name and role (admin/teacher/student)
2. **departments** - Academic departments (e.g., Computer Science)
3. **teachers** - Teacher profiles linked to departments
4. **students** - Student profiles with roll number, department, semester
5. **subjects** - Subjects assigned to teachers, scoped to department + semester
6. **attendance** - Daily attendance records (student + subject + date + status)
7. **audit_logs** - Tracks login history, attendance changes, upload history
8. **academic_years** - Academic year management

## Security (RLS)
- All tables have RLS enabled
- profiles: users read own; admins read all; users update own; admins update all
- departments, subjects, teachers, students: all authenticated can SELECT; only admin can INSERT/UPDATE/DELETE
- attendance: students SELECT own only; teachers/admins SELECT all; teachers/admins INSERT/UPDATE; admin DELETE
- audit_logs: admin SELECT all; all authenticated INSERT own; admin DELETE
- academic_years: all authenticated SELECT; admin write

## Triggers
- handle_new_user(): auto-creates a profile when a new auth user signs up. First user becomes admin; subsequent users get role from metadata or default 'student'.
*/

-- ============================================================
-- STEP 1: Create all tables (no policies yet)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  roll_number text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  semester integer NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 12),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  semester integer NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 12),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'absent')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, subject_id, date)
);

CREATE TABLE IF NOT EXISTS public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- STEP 2: Helper functions (must exist before policies reference them)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- STEP 3: Enable RLS on all tables
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 4: Create all RLS policies
-- ============================================================

-- profiles policies
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- departments policies
DROP POLICY IF EXISTS "departments_select_all" ON public.departments;
CREATE POLICY "departments_select_all" ON public.departments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "departments_insert_admin" ON public.departments;
CREATE POLICY "departments_insert_admin" ON public.departments FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "departments_update_admin" ON public.departments;
CREATE POLICY "departments_update_admin" ON public.departments FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "departments_delete_admin" ON public.departments;
CREATE POLICY "departments_delete_admin" ON public.departments FOR DELETE
  TO authenticated USING (public.is_admin());

-- teachers policies
DROP POLICY IF EXISTS "teachers_select_all" ON public.teachers;
CREATE POLICY "teachers_select_all" ON public.teachers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "teachers_insert_admin" ON public.teachers;
CREATE POLICY "teachers_insert_admin" ON public.teachers FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "teachers_update_admin" ON public.teachers;
CREATE POLICY "teachers_update_admin" ON public.teachers FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "teachers_delete_admin" ON public.teachers;
CREATE POLICY "teachers_delete_admin" ON public.teachers FOR DELETE
  TO authenticated USING (public.is_admin());

-- students policies
DROP POLICY IF EXISTS "students_select_own_or_staff" ON public.students;
CREATE POLICY "students_select_own_or_staff" ON public.students FOR SELECT
  TO authenticated USING (
    auth.uid() = id OR public.get_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "students_insert_admin" ON public.students;
CREATE POLICY "students_insert_admin" ON public.students FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "students_update_admin" ON public.students;
CREATE POLICY "students_update_admin" ON public.students FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "students_delete_admin" ON public.students;
CREATE POLICY "students_delete_admin" ON public.students FOR DELETE
  TO authenticated USING (public.is_admin());

-- subjects policies
DROP POLICY IF EXISTS "subjects_select_all" ON public.subjects;
CREATE POLICY "subjects_select_all" ON public.subjects FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "subjects_insert_admin" ON public.subjects;
CREATE POLICY "subjects_insert_admin" ON public.subjects FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "subjects_update_admin" ON public.subjects;
CREATE POLICY "subjects_update_admin" ON public.subjects FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "subjects_delete_admin" ON public.subjects;
CREATE POLICY "subjects_delete_admin" ON public.subjects FOR DELETE
  TO authenticated USING (public.is_admin());

-- attendance policies
DROP POLICY IF EXISTS "attendance_select_own_or_staff" ON public.attendance;
CREATE POLICY "attendance_select_own_or_staff" ON public.attendance FOR SELECT
  TO authenticated USING (
    auth.uid() = student_id OR public.get_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "attendance_insert_staff" ON public.attendance;
CREATE POLICY "attendance_insert_staff" ON public.attendance FOR INSERT
  TO authenticated WITH CHECK (
    public.get_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "attendance_update_staff" ON public.attendance;
CREATE POLICY "attendance_update_staff" ON public.attendance FOR UPDATE
  TO authenticated USING (
    public.get_user_role() IN ('teacher', 'admin')
  ) WITH CHECK (
    public.get_user_role() IN ('teacher', 'admin')
  );

DROP POLICY IF EXISTS "attendance_delete_admin" ON public.attendance;
CREATE POLICY "attendance_delete_admin" ON public.attendance FOR DELETE
  TO authenticated USING (public.is_admin());

-- academic_years policies
DROP POLICY IF EXISTS "academic_years_select_all" ON public.academic_years;
CREATE POLICY "academic_years_select_all" ON public.academic_years FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "academic_years_insert_admin" ON public.academic_years;
CREATE POLICY "academic_years_insert_admin" ON public.academic_years FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "academic_years_update_admin" ON public.academic_years;
CREATE POLICY "academic_years_update_admin" ON public.academic_years FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "academic_years_delete_admin" ON public.academic_years;
CREATE POLICY "academic_years_delete_admin" ON public.academic_years FOR DELETE
  TO authenticated USING (public.is_admin());

-- audit_logs policies
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "audit_logs_insert_own" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_own" ON public.audit_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "audit_logs_delete_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_delete_admin" ON public.audit_logs FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- STEP 5: Trigger - Auto-create profile on signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  assigned_role text;
BEGIN
  assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    assigned_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    assigned_role
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STEP 6: Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject_id ON public.attendance(subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_students_department ON public.students(department_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher ON public.subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_department ON public.subjects(department_id);

-- ============================================================
-- STEP 7: Seed data - Departments
-- ============================================================

INSERT INTO public.departments (name, code) VALUES
  ('Computer Science & Engineering', 'CSE'),
  ('Electronics & Communication', 'ECE'),
  ('Mechanical Engineering', 'MECH'),
  ('Information Technology', 'IT'),
  ('Civil Engineering', 'CIVIL')
ON CONFLICT (code) DO NOTHING;