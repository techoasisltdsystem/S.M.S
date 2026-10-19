import { Student } from "@/data/mockData";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mail, Phone, MapPin, Calendar, User, BookOpen, TrendingUp, UserCheck } from "lucide-react";

interface StudentProfileProps {
  student: Student;
}

const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) => (
  <div className="flex items-start gap-3">
    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
      <Icon className="w-4 h-4 text-muted-foreground" />
    </div>
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-card-foreground">{value}</p>
    </div>
  </div>
);

const statusColors: Record<string, string> = {
  Active: "bg-success/10 text-success border-success/20",
  Inactive: "bg-muted text-muted-foreground border-border",
  Transferred: "bg-warning/10 text-warning border-warning/20",
  Graduated: "bg-info/10 text-info border-info/20",
};

const StudentProfile = ({ student }: StudentProfileProps) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-heading font-bold text-xl">
          {student.firstName[0]}{student.lastName[0]}
        </div>
        <div>
          <h3 className="font-heading text-lg font-bold text-card-foreground">{student.firstName} {student.lastName}</h3>
          <p className="text-sm text-muted-foreground">{student.id} · Grade {student.grade}{student.section} · Roll #{student.rollNumber}</p>
          <Badge variant="outline" className={`mt-1 text-xs ${statusColors[student.status]}`}>{student.status}</Badge>
        </div>
      </div>

      {/* Academic Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="font-heading text-lg font-bold text-card-foreground">{student.gpa.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">GPA</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <UserCheck className="w-5 h-5 mx-auto text-success mb-1" />
          <p className="font-heading text-lg font-bold text-card-foreground">{student.attendance}%</p>
          <p className="text-xs text-muted-foreground">Attendance</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <BookOpen className="w-5 h-5 mx-auto text-info mb-1" />
          <p className="font-heading text-lg font-bold text-card-foreground">Grade {student.grade}</p>
          <p className="text-xs text-muted-foreground">Current</p>
        </div>
      </div>

      <Separator />

      {/* Personal Info */}
      <div>
        <h4 className="font-heading text-sm font-semibold text-card-foreground mb-3">Personal Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow icon={Mail} label="Email" value={student.email} />
          <InfoRow icon={Phone} label="Phone" value={student.phone} />
          <InfoRow icon={Calendar} label="Date of Birth" value={new Date(student.dateOfBirth).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
          <InfoRow icon={User} label="Gender" value={student.gender} />
          <InfoRow icon={MapPin} label="Address" value={student.address} />
          <InfoRow icon={Calendar} label="Admission Date" value={new Date(student.admissionDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
        </div>
      </div>

      <Separator />

      {/* Guardian Info */}
      <div>
        <h4 className="font-heading text-sm font-semibold text-card-foreground mb-3">Guardian Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow icon={User} label="Guardian Name" value={student.guardianName} />
          <InfoRow icon={Phone} label="Guardian Phone" value={student.guardianPhone} />
          <InfoRow icon={Mail} label="Guardian Email" value={student.guardianEmail} />
        </div>
      </div>
    </div>
  );
};

export default StudentProfile;
