import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

interface AdmissionFormProps {
  onClose: () => void;
}

const AdmissionForm = ({ onClose }: AdmissionFormProps) => {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    toast({ title: "Admission Submitted", description: "New student admission form has been saved successfully." });
    setLoading(false);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Student Details */}
      <div>
        <h4 className="font-heading text-sm font-semibold text-card-foreground mb-3">Student Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First Name *</Label>
            <Input id="firstName" required placeholder="Enter first name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input id="lastName" required placeholder="Enter last name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" required placeholder="student@school.edu" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="+1-555-0000" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dob">Date of Birth *</Label>
            <Input id="dob" type="date" required />
          </div>
          <div className="space-y-1.5">
            <Label>Gender *</Label>
            <Select required>
              <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Grade *</Label>
            <Select required>
              <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
              <SelectContent>
                {["9", "10", "11", "12"].map((g) => (<SelectItem key={g} value={g}>Grade {g}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Section *</Label>
            <Select required>
              <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                {["A", "B", "C", "D"].map((s) => (<SelectItem key={s} value={s}>Section {s}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Textarea id="address" placeholder="Full address" rows={2} />
        </div>
      </div>

      {/* Guardian Details */}
      <div>
        <h4 className="font-heading text-sm font-semibold text-card-foreground mb-3">Guardian Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="guardianName">Guardian Name *</Label>
            <Input id="guardianName" required placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guardianPhone">Guardian Phone *</Label>
            <Input id="guardianPhone" required placeholder="+1-555-0000" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="guardianEmail">Guardian Email</Label>
            <Input id="guardianEmail" type="email" placeholder="guardian@email.com" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit Admission"}
        </Button>
      </div>
    </form>
  );
};

export default AdmissionForm;
