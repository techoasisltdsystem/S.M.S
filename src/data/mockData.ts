export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  grade: string;
  section: string;
  rollNumber: string;
  dateOfBirth: string;
  gender: "Male" | "Female" | "Other";
  phone: string;
  address: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  admissionDate: string;
  status: "Active" | "Inactive" | "Transferred" | "Graduated";
  avatar?: string;
  gpa: number;
  attendance: number;
}

export const MOCK_STUDENTS: Student[] = [
  { id: "STU001", firstName: "Emily", lastName: "Johnson", email: "emily.j@school.edu", grade: "10", section: "A", rollNumber: "1001", dateOfBirth: "2011-05-14", gender: "Female", phone: "+1-555-0101", address: "123 Oak Street, Springfield", guardianName: "Michael Johnson", guardianPhone: "+1-555-0102", guardianEmail: "michael.j@email.com", admissionDate: "2022-08-15", status: "Active", gpa: 3.85, attendance: 96 },
  { id: "STU002", firstName: "James", lastName: "Williams", email: "james.w@school.edu", grade: "10", section: "A", rollNumber: "1002", dateOfBirth: "2011-03-22", gender: "Male", phone: "+1-555-0103", address: "456 Elm Avenue, Springfield", guardianName: "Sarah Williams", guardianPhone: "+1-555-0104", guardianEmail: "sarah.w@email.com", admissionDate: "2022-08-15", status: "Active", gpa: 3.42, attendance: 92 },
  { id: "STU003", firstName: "Sophia", lastName: "Chen", email: "sophia.c@school.edu", grade: "9", section: "B", rollNumber: "0903", dateOfBirth: "2012-09-08", gender: "Female", phone: "+1-555-0105", address: "789 Pine Road, Springfield", guardianName: "Wei Chen", guardianPhone: "+1-555-0106", guardianEmail: "wei.c@email.com", admissionDate: "2023-08-20", status: "Active", gpa: 3.91, attendance: 98 },
  { id: "STU004", firstName: "Liam", lastName: "Martinez", email: "liam.m@school.edu", grade: "11", section: "A", rollNumber: "1101", dateOfBirth: "2010-12-01", gender: "Male", phone: "+1-555-0107", address: "321 Maple Drive, Springfield", guardianName: "Carlos Martinez", guardianPhone: "+1-555-0108", guardianEmail: "carlos.m@email.com", admissionDate: "2021-08-16", status: "Active", gpa: 2.98, attendance: 88 },
  { id: "STU005", firstName: "Ava", lastName: "Brown", email: "ava.b@school.edu", grade: "9", section: "A", rollNumber: "0901", dateOfBirth: "2012-07-19", gender: "Female", phone: "+1-555-0109", address: "654 Cedar Lane, Springfield", guardianName: "David Brown", guardianPhone: "+1-555-0110", guardianEmail: "david.b@email.com", admissionDate: "2023-08-20", status: "Active", gpa: 3.67, attendance: 94 },
  { id: "STU006", firstName: "Noah", lastName: "Taylor", email: "noah.t@school.edu", grade: "12", section: "B", rollNumber: "1204", dateOfBirth: "2009-02-28", gender: "Male", phone: "+1-555-0111", address: "987 Birch Court, Springfield", guardianName: "Jennifer Taylor", guardianPhone: "+1-555-0112", guardianEmail: "jennifer.t@email.com", admissionDate: "2020-08-17", status: "Active", gpa: 3.55, attendance: 91 },
  { id: "STU007", firstName: "Isabella", lastName: "Davis", email: "isabella.d@school.edu", grade: "11", section: "B", rollNumber: "1105", dateOfBirth: "2010-11-15", gender: "Female", phone: "+1-555-0113", address: "147 Walnut Street, Springfield", guardianName: "Robert Davis", guardianPhone: "+1-555-0114", guardianEmail: "robert.d@email.com", admissionDate: "2021-08-16", status: "Active", gpa: 3.78, attendance: 95 },
  { id: "STU008", firstName: "Ethan", lastName: "Garcia", email: "ethan.g@school.edu", grade: "10", section: "B", rollNumber: "1006", dateOfBirth: "2011-06-30", gender: "Male", phone: "+1-555-0115", address: "258 Spruce Avenue, Springfield", guardianName: "Maria Garcia", guardianPhone: "+1-555-0116", guardianEmail: "maria.g@email.com", admissionDate: "2022-08-15", status: "Transferred", gpa: 3.12, attendance: 85 },
  { id: "STU009", firstName: "Mia", lastName: "Anderson", email: "mia.a@school.edu", grade: "12", section: "A", rollNumber: "1201", dateOfBirth: "2009-04-12", gender: "Female", phone: "+1-555-0117", address: "369 Ash Boulevard, Springfield", guardianName: "Thomas Anderson", guardianPhone: "+1-555-0118", guardianEmail: "thomas.a@email.com", admissionDate: "2020-08-17", status: "Active", gpa: 3.95, attendance: 99 },
  { id: "STU010", firstName: "Alexander", lastName: "Wilson", email: "alex.w@school.edu", grade: "9", section: "A", rollNumber: "0902", dateOfBirth: "2012-01-25", gender: "Male", phone: "+1-555-0119", address: "741 Willow Way, Springfield", guardianName: "Patricia Wilson", guardianPhone: "+1-555-0120", guardianEmail: "patricia.w@email.com", admissionDate: "2023-08-20", status: "Active", gpa: 3.33, attendance: 90 },
];

export interface FeeRecord {
  id: string;
  studentId: string;
  studentName: string;
  grade: string;
  feeType: "Tuition" | "Transport" | "Hostel" | "Lab" | "Library" | "Exam";
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: "Paid" | "Pending" | "Overdue" | "Partial";
  paidAmount: number;
  invoiceNumber: string;
}

export const MOCK_FEES: FeeRecord[] = [
  { id: "FEE001", studentId: "STU001", studentName: "Emily Johnson", grade: "10A", feeType: "Tuition", amount: 2500, dueDate: "2026-03-31", status: "Pending", paidAmount: 0, invoiceNumber: "INV-2026-0341" },
  { id: "FEE002", studentId: "STU001", studentName: "Emily Johnson", grade: "10A", feeType: "Lab", amount: 150, dueDate: "2026-03-15", paidDate: "2026-03-10", status: "Paid", paidAmount: 150, invoiceNumber: "INV-2026-0342" },
  { id: "FEE003", studentId: "STU002", studentName: "James Williams", grade: "10A", feeType: "Tuition", amount: 2500, dueDate: "2026-03-31", status: "Paid", paidAmount: 2500, paidDate: "2026-03-05", invoiceNumber: "INV-2026-0343" },
  { id: "FEE004", studentId: "STU003", studentName: "Sophia Chen", grade: "9B", feeType: "Tuition", amount: 2500, dueDate: "2026-02-28", status: "Overdue", paidAmount: 0, invoiceNumber: "INV-2026-0344" },
  { id: "FEE005", studentId: "STU004", studentName: "Liam Martinez", grade: "11A", feeType: "Tuition", amount: 2800, dueDate: "2026-03-31", status: "Partial", paidAmount: 1400, paidDate: "2026-03-01", invoiceNumber: "INV-2026-0345" },
  { id: "FEE006", studentId: "STU005", studentName: "Ava Brown", grade: "9A", feeType: "Transport", amount: 800, dueDate: "2026-03-31", status: "Pending", paidAmount: 0, invoiceNumber: "INV-2026-0346" },
  { id: "FEE007", studentId: "STU006", studentName: "Noah Taylor", grade: "12B", feeType: "Tuition", amount: 3000, dueDate: "2026-03-31", status: "Paid", paidAmount: 3000, paidDate: "2026-03-08", invoiceNumber: "INV-2026-0347" },
  { id: "FEE008", studentId: "STU007", studentName: "Isabella Davis", grade: "11B", feeType: "Hostel", amount: 1200, dueDate: "2026-02-28", status: "Overdue", paidAmount: 0, invoiceNumber: "INV-2026-0348" },
  { id: "FEE009", studentId: "STU009", studentName: "Mia Anderson", grade: "12A", feeType: "Exam", amount: 200, dueDate: "2026-03-15", status: "Paid", paidAmount: 200, paidDate: "2026-03-12", invoiceNumber: "INV-2026-0349" },
  { id: "FEE010", studentId: "STU010", studentName: "Alexander Wilson", grade: "9A", feeType: "Tuition", amount: 2500, dueDate: "2026-03-31", status: "Pending", paidAmount: 0, invoiceNumber: "INV-2026-0350" },
];
