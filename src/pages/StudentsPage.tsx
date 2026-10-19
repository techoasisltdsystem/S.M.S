import { useState } from "react";
import { motion } from "framer-motion";
import { MOCK_STUDENTS, Student } from "@/data/mockData";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Filter, Download, Eye, MoreHorizontal, GraduationCap, Users, UserCheck, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StudentProfile from "@/components/students/StudentProfile";
import AdmissionForm from "@/components/students/AdmissionForm";
import StatCard from "@/components/dashboard/StatCard";

const statusColors: Record<string, string> = {
  Active: "bg-success/10 text-success border-success/20",
  Inactive: "bg-muted text-muted-foreground border-border",
  Transferred: "bg-warning/10 text-warning border-warning/20",
  Graduated: "bg-info/10 text-info border-info/20",
};

const StudentsPage = () => {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showAdmission, setShowAdmission] = useState(false);

  const filtered = MOCK_STUDENTS.filter((s) => {
    const matchesSearch =
      `${s.firstName} ${s.lastName} ${s.id} ${s.email}`.toLowerCase().includes(search.toLowerCase());
    const matchesGrade = gradeFilter === "all" || s.grade === gradeFilter;
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesGrade && matchesStatus;
  });

  const activeCount = MOCK_STUDENTS.filter((s) => s.status === "Active").length;
  const avgGpa = (MOCK_STUDENTS.reduce((sum, s) => sum + s.gpa, 0) / MOCK_STUDENTS.length).toFixed(2);
  const avgAttendance = Math.round(MOCK_STUDENTS.reduce((sum, s) => sum + s.attendance, 0) / MOCK_STUDENTS.length);

  return (
    <DashboardLayout>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Students" value={MOCK_STUDENTS.length} icon={GraduationCap} color="primary" change="All enrolled" changeType="neutral" />
        <StatCard title="Active Students" value={activeCount} icon={UserCheck} color="success" change={`${Math.round((activeCount / MOCK_STUDENTS.length) * 100)}% of total`} changeType="positive" delay={0.08} />
        <StatCard title="Average GPA" value={avgGpa} icon={Users} color="info" change="Current term" changeType="neutral" delay={0.16} />
        <StatCard title="Avg Attendance" value={`${avgAttendance}%`} icon={UserX} color="warning" change="This semester" changeType="neutral" delay={0.24} />
      </div>

      {/* Header & Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-b border-border">
          <div>
            <h1 className="font-heading text-xl font-bold text-card-foreground">Student Management</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} students found</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-1.5" />Export</Button>
            <Button size="sm" onClick={() => setShowAdmission(true)}><Plus className="w-4 h-4 mr-1.5" />New Admission</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-border bg-muted/30">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name, ID, or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-[140px] h-9"><Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Grade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {["9", "10", "11", "12"].map((g) => (<SelectItem key={g} value={g}>Grade {g}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {["Active", "Inactive", "Transferred", "Graduated"].map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Student</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden md:table-cell">ID</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Grade</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden lg:table-cell">GPA</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden lg:table-cell">Attendance</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student, i) => (
                <motion.tr
                  key={student.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading font-bold text-sm shrink-0">
                        {student.firstName[0]}{student.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-card-foreground">{student.firstName} {student.lastName}</p>
                        <p className="text-xs text-muted-foreground">{student.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell">{student.id}</td>
                  <td className="px-5 py-3.5 text-sm text-card-foreground">{student.grade}{student.section}</td>
                  <td className="px-5 py-3.5 text-sm text-card-foreground hidden lg:table-cell">{student.gpa.toFixed(2)}</td>
                  <td className="px-5 py-3.5 hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${student.attendance}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{student.attendance}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className={`text-xs ${statusColors[student.status]}`}>{student.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedStudent(student)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No students found matching your criteria</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Student Profile Dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={() => setSelectedStudent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Student Profile</DialogTitle>
          </DialogHeader>
          {selectedStudent && <StudentProfile student={selectedStudent} />}
        </DialogContent>
      </Dialog>

      {/* Admission Form Dialog */}
      <Dialog open={showAdmission} onOpenChange={setShowAdmission}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">New Student Admission</DialogTitle>
          </DialogHeader>
          <AdmissionForm onClose={() => setShowAdmission(false)} />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default StudentsPage;
