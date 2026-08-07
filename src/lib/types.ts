export type UserRole = "admin" | "teacher" | "student";

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  created_at?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  created_at?: string;
}

export interface Teacher {
  id: string;
  department_id?: string | null;
  created_at?: string;
  profiles?: { name: string } | null;
  departments?: { name: string; code: string } | null;
}

export interface Student {
  id: string;
  roll_number: string;
  department_id?: string | null;
  semester?: number;
  created_at?: string;
  profiles?: { name: string } | null;
  departments?: { name: string; code: string } | null;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  semester?: number;
  department_id?: string | null;
  teacher_id?: string | null;
  created_at?: string;
  departments?: { name: string; code: string } | null;
  teachers?: { id: string; profiles?: { name: string } | null } | null;
}

export interface Attendance {
  id: string;
  student_id: string;
  subject_id: string;
  date: string;
  status: "present" | "absent";
  created_at?: string;
  subjects?: { name: string; code: string } | null;
  students?: { roll_number: string; profiles?: { name: string } | null } | null;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at?: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
  profiles?: { name: string } | null;
}

export interface UserWithInfo {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  created_at: string;
  student_info?: {
    roll_number: string;
    department_id: string | null;
    semester: number;
  } | null;
  teacher_info?: {
    department_id: string | null;
  } | null;
}

export interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  percentage: number;
}
