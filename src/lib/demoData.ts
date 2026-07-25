export const DEMO_DEPARTMENTS = [
  { id: "demo-dept-1", name: "Computer Science & Engineering", code: "CSE", created_at: new Date().toISOString() },
  { id: "demo-dept-2", name: "Electronics & Communication", code: "ECE", created_at: new Date().toISOString() },
  { id: "demo-dept-3", name: "Mechanical Engineering", code: "ME", created_at: new Date().toISOString() },
  { id: "demo-dept-4", name: "Civil Engineering", code: "CE", created_at: new Date().toISOString() },
];

export const DEMO_TEACHER_SUBJECTS = [
  {
    id: "demo-sub-1",
    name: "Data Structures & Algorithms",
    code: "CS201",
    semester: 3,
    department_id: "demo-dept-1",
    teacher_id: "demo-teacher",
    created_at: new Date().toISOString(),
    departments: { name: "Computer Science & Engineering", code: "CSE" },
  },
  {
    id: "demo-sub-2",
    name: "Database Management Systems",
    code: "CS302",
    semester: 5,
    department_id: "demo-dept-1",
    teacher_id: "demo-teacher",
    created_at: new Date().toISOString(),
    departments: { name: "Computer Science & Engineering", code: "CSE" },
  },
  {
    id: "demo-sub-3",
    name: "Operating Systems",
    code: "CS301",
    semester: 5,
    department_id: "demo-dept-1",
    teacher_id: "demo-teacher",
    created_at: new Date().toISOString(),
    departments: { name: "Computer Science & Engineering", code: "CSE" },
  },
  {
    id: "demo-sub-4",
    name: "Web Technologies",
    code: "CS401",
    semester: 7,
    department_id: "demo-dept-1",
    teacher_id: "demo-teacher",
    created_at: new Date().toISOString(),
    departments: { name: "Computer Science & Engineering", code: "CSE" },
  },
];

export const DEMO_STUDENTS = [
  { id: "demo-stu-1", roll_number: "CS2024001", department_id: "demo-dept-1", semester: 5, profiles: { name: "Alex Johnson" } },
  { id: "demo-stu-2", roll_number: "CS2024002", department_id: "demo-dept-1", semester: 5, profiles: { name: "Beatrix Vance" } },
  { id: "demo-stu-3", roll_number: "CS2024003", department_id: "demo-dept-1", semester: 5, profiles: { name: "Charlie Davis" } },
  { id: "demo-stu-4", roll_number: "CS2024004", department_id: "demo-dept-1", semester: 5, profiles: { name: "Diana Prince" } },
  { id: "demo-stu-5", roll_number: "CS2024005", department_id: "demo-dept-1", semester: 5, profiles: { name: "Ethan Hunt" } },
  { id: "demo-stu-6", roll_number: "CS2024006", department_id: "demo-dept-1", semester: 5, profiles: { name: "Fiona Gallagher" } },
  { id: "demo-stu-7", roll_number: "CS2024007", department_id: "demo-dept-1", semester: 5, profiles: { name: "George Miller" } },
  { id: "demo-stu-8", roll_number: "CS2024008", department_id: "demo-dept-1", semester: 5, profiles: { name: "Hannah Abbott" } },
];

export function getDemoTeacherAttendance() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().slice(0, 10);

  const todayAttendance = DEMO_STUDENTS.map((stu, i) => ({
    id: `att-today-${i}`,
    student_id: stu.id,
    subject_id: DEMO_TEACHER_SUBJECTS[0].id,
    date: today,
    status: i % 5 === 0 ? "absent" : "present",
    created_at: new Date().toISOString(),
    subjects: { name: DEMO_TEACHER_SUBJECTS[0].name, code: DEMO_TEACHER_SUBJECTS[0].code },
    students: { roll_number: stu.roll_number, profiles: { name: stu.profiles.name } },
  }));

  const recentAttendance = [
    ...todayAttendance.slice(0, 5),
    {
      id: "att-rec-1",
      student_id: DEMO_STUDENTS[0].id,
      subject_id: DEMO_TEACHER_SUBJECTS[1].id,
      date: yesterday,
      status: "present",
      created_at: new Date().toISOString(),
      subjects: { name: DEMO_TEACHER_SUBJECTS[1].name, code: DEMO_TEACHER_SUBJECTS[1].code },
      students: { roll_number: DEMO_STUDENTS[0].roll_number, profiles: { name: DEMO_STUDENTS[0].profiles.name } },
    },
    {
      id: "att-rec-2",
      student_id: DEMO_STUDENTS[1].id,
      subject_id: DEMO_TEACHER_SUBJECTS[1].id,
      date: yesterday,
      status: "absent",
      created_at: new Date().toISOString(),
      subjects: { name: DEMO_TEACHER_SUBJECTS[1].name, code: DEMO_TEACHER_SUBJECTS[1].code },
      students: { roll_number: DEMO_STUDENTS[1].roll_number, profiles: { name: DEMO_STUDENTS[1].profiles.name } },
    },
    {
      id: "att-rec-3",
      student_id: DEMO_STUDENTS[2].id,
      subject_id: DEMO_TEACHER_SUBJECTS[2].id,
      date: twoDaysAgo,
      status: "present",
      created_at: new Date().toISOString(),
      subjects: { name: DEMO_TEACHER_SUBJECTS[2].name, code: DEMO_TEACHER_SUBJECTS[2].code },
      students: { roll_number: DEMO_STUDENTS[2].roll_number, profiles: { name: DEMO_STUDENTS[2].profiles.name } },
    },
    {
      id: "att-rec-4",
      student_id: DEMO_STUDENTS[3].id,
      subject_id: DEMO_TEACHER_SUBJECTS[2].id,
      date: twoDaysAgo,
      status: "present",
      created_at: new Date().toISOString(),
      subjects: { name: DEMO_TEACHER_SUBJECTS[2].name, code: DEMO_TEACHER_SUBJECTS[2].code },
      students: { roll_number: DEMO_STUDENTS[3].roll_number, profiles: { name: DEMO_STUDENTS[3].profiles.name } },
    },
  ];

  return { todayAttendance, recentAttendance };
}

export function getDemoStudentData() {
  const studentInfo = {
    id: "demo-student-id",
    roll_number: "CS2024001",
    department_id: "demo-dept-1",
    semester: 5,
    profiles: { name: "Sample Student" },
    departments: { name: "Computer Science & Engineering", code: "CSE" },
  };

  const records = [];
  const now = new Date();
  const subjects = DEMO_TEACHER_SUBJECTS;

  for (let i = 0; i < 40; i++) {
    const d = new Date(now.valueOf() - i * 86400000 * 1.5);
    const dateStr = d.toISOString().slice(0, 10);
    const sub = subjects[i % subjects.length];
    const isPresent = i % 6 !== 0;

    records.push({
      id: `stu-att-${i}`,
      student_id: studentInfo.id,
      subject_id: sub.id,
      date: dateStr,
      status: isPresent ? "present" : "absent",
      created_at: d.toISOString(),
      subjects: { name: sub.name, code: sub.code },
    });
  }

  return { studentInfo, records };
}

export function getDemoAdminData() {
  const now = new Date();
  const logs = [];
  for (let i = 0; i < 10; i++) {
    const stu = DEMO_STUDENTS[i % DEMO_STUDENTS.length];
    const sub = DEMO_TEACHER_SUBJECTS[i % DEMO_TEACHER_SUBJECTS.length];
    const d = new Date(now.valueOf() - i * 3600000 * 4);
    logs.push({
      id: `admin-log-${i}`,
      student_id: stu.id,
      subject_id: sub.id,
      date: d.toISOString().slice(0, 10),
      status: i % 4 === 0 ? "absent" : "present",
      created_at: d.toISOString(),
      subjects: { name: sub.name, code: sub.code },
      students: { roll_number: stu.roll_number, profiles: { name: stu.profiles.name } },
    });
  }

  const attendanceOverview = [];
  for (let i = 0; i < 200; i++) {
    const d = new Date(now.valueOf() - i * 86400000 * 0.8);
    attendanceOverview.push({
      id: `admin-att-${i}`,
      status: i % 5 === 0 ? "absent" : "present",
      date: d.toISOString().slice(0, 10),
    });
  }

  return {
    counts: { students: 128, teachers: 14, subjects: 24, departments: 4 },
    logs,
    attendanceOverview,
  };
}
