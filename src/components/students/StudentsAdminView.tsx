import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { GraduationCap, Plus, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useClasses, useDirectory, useEnrollments, useGuardianLinks, useRefreshSchoolData } from "@/hooks/useSchoolData";
import { ErrorBox, LoadingRows, firstError } from "./QueryState";
import { InviteLinkDialog, type IssuedLink } from "./InviteLinkDialog";
import { AddStudentDialog } from "./AddStudentDialog";
import { ChangeClassDialog } from "./ChangeClassDialog";
import { GuardianDialog, LinkActions, LinkBadge } from "./GuardianDialog";
import { AdmissionNumberDialog } from "./AdmissionNumberDialog";

const ALL = "all";

export const StudentsAdminView = () => {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const refresh = useRefreshSchoolData();
  const schoolId = user!.schoolId;
  const directory = useDirectory(schoolId);
  const classes = useClasses(schoolId);
  const enrollments = useEnrollments(schoolId);
  const links = useGuardianLinks(schoolId);

  const canCreate = can("students.create");
  const canUpdate = can("students.update");

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(ALL);
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [changing, setChanging] = useState<{ id: string; name: string; classId: string | null } | null>(null);
  const [guardians, setGuardians] = useState<{ id: string; name: string } | null>(null);
  const [withdrawing, setWithdrawing] = useState<{ enrollmentId: string; name: string } | null>(null);
  const [numbering, setNumbering] = useState<{ id: string; name: string } | null>(null);
  const admissions = useQuery({
    queryKey: ["admission-numbers", schoolId],
    enabled: !!schoolId,
    queryFn: () => rpc<{ profile_id: string; admission_number: string }[]>("student_admission_numbers", { _school: schoolId }),
  });
  const admissionOf = useMemo(() => new Map((admissions.data ?? []).map((a) => [a.profile_id, a.admission_number])), [admissions.data]);

  const people = useMemo(() => directory.data ?? [], [directory.data]);
  const nameOf = (id: string) => people.find((p) => p.profile_id === id)?.full_name ?? "Unknown person";
  const classList = useMemo(() => classes.data ?? [], [classes.data]);

  const rows = useMemo(() => {
    const active = new Map((enrollments.data ?? []).filter((e) => e.status === "active").map((e) => [e.student_id, e]));
    const className = new Map(classList.map((c) => [c.id, c.name]));
    return people
      .filter((p) => p.roles.includes("student"))
      .map((p) => {
        const en = active.get(p.profile_id);
        return {
          person: p,
          enrollmentId: en?.id ?? null,
          classId: en?.class_id ?? null,
          className: en ? className.get(en.class_id) ?? "Unknown class" : null,
          links: (links.data ?? []).filter((l) => l.student_id === p.profile_id),
        };
      })
      .sort((a, b) => a.person.full_name.localeCompare(b.person.full_name));
  }, [people, enrollments.data, classList, links.data]);

  const filtered = rows.filter((r) => {
    if (search && !r.person.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (classFilter === "none") return !r.classId;
    return classFilter === ALL || r.classId === classFilter;
  });

  const pending = (links.data ?? []).filter((l) => l.status === "pending");
  const queries = [directory, classes, enrollments, links];
  const loading = queries.some((q) => q.isLoading);
  const error = firstError(...queries);

  const withdraw = async () => {
    if (!withdrawing) return;
    const { error: err } = await db.rpc("end_enrollment", { _enrollment: withdrawing.enrollmentId, _status: "withdrawn" });
    if (err) toast({ title: "Could not withdraw", description: err.message, variant: "destructive" });
    else {
      toast({ title: "Student withdrawn", description: `${withdrawing.name} is no longer enrolled.` });
      refresh();
    }
    setWithdrawing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Students</h1>
          <p className="text-sm text-muted-foreground">Enrolment, classes and guardian links.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add student
          </Button>
        )}
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={() => queries.forEach((q) => q.refetch())} />
      ) : loading ? (
        <LoadingRows />
      ) : (
        <>
          {canUpdate && pending.length > 0 && (
            <Panel title={`Guardian links waiting for approval (${pending.length})`} icon={ShieldCheck}>
              <p className="mb-3 text-xs text-muted-foreground">A parent sees nothing about the student until you verify the link.</p>
              <div className="space-y-2">
                {pending.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <p className="text-sm">
                      <span className="font-medium">{nameOf(l.guardian_id)}</span> ({l.relationship}) of <span className="font-medium">{nameOf(l.student_id)}</span>
                    </p>
                    <LinkActions link={l} />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title={`Students (${filtered.length})`} icon={Users}>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input className="pl-9" placeholder="Search by name" aria-label="Search students" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="sm:w-48" aria-label="Filter by class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  <SelectItem value="none">Not in a class</SelectItem>
                  {classList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={GraduationCap}
                title="No students yet"
                text={canCreate ? "Use Add student to invite the first one and place them in a class." : "Students will appear here once they are added."}
              />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Search} title="No students match" text="Clear the search or choose a different class." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Adm. no.</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Guardians</TableHead>
                      {(canCreate || canUpdate) && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.person.profile_id}>
                        <TableCell className="font-medium">{r.person.full_name}</TableCell>
                        <TableCell>
                          {admissionOf.get(r.person.profile_id) ?? <span className="text-muted-foreground">Not set</span>}
                          {canUpdate && (
                            <Button size="sm" variant="ghost" className="ml-1 h-6 px-1.5 text-xs" onClick={() => setNumbering({ id: r.person.profile_id, name: r.person.full_name })} aria-label={`Edit admission number for ${r.person.full_name}`}>Edit</Button>
                          )}
                        </TableCell>
                        <TableCell>{r.className ?? <span className="text-muted-foreground">Not enrolled</span>}</TableCell>
                        <TableCell className="capitalize">{r.person.gender ?? <span className="text-muted-foreground">Not set</span>}</TableCell>
                        <TableCell>
                          {r.links.length === 0 ? (
                            <span className="text-muted-foreground">None</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {r.links.map((l) => (
                                <span key={l.id} className="flex items-center gap-2 text-sm">
                                  {nameOf(l.guardian_id)} <LinkBadge status={l.status} />
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        {(canCreate || canUpdate) && (
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              {canUpdate && (
                                <Button size="sm" variant="outline" onClick={() => setGuardians({ id: r.person.profile_id, name: r.person.full_name })}>
                                  <UserPlus className="mr-1 h-3.5 w-3.5" /> Guardians
                                </Button>
                              )}
                              {canCreate && (
                                <Button size="sm" variant="outline" onClick={() => setChanging({ id: r.person.profile_id, name: r.person.full_name, classId: r.classId })}>
                                  {r.classId ? "Change class" : "Enrol"}
                                </Button>
                              )}
                              {canCreate && r.enrollmentId && (
                                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setWithdrawing({ enrollmentId: r.enrollmentId!, name: r.person.full_name })}>
                                  Withdraw
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </>
      )}

      <AddStudentDialog open={adding} schoolId={schoolId} classes={classList} onClose={() => setAdding(false)} onIssued={setIssued} />
      <ChangeClassDialog student={changing} classes={classList} onClose={() => setChanging(null)} />
      <AdmissionNumberDialog student={numbering} current={numbering ? admissionOf.get(numbering.id) ?? "" : ""} onClose={() => setNumbering(null)} />
      <GuardianDialog
        student={guardians}
        schoolId={schoolId}
        parents={people.filter((p) => p.roles.includes("parent"))}
        links={links.data ?? []}
        nameOf={nameOf}
        onClose={() => setGuardians(null)}
        onIssued={setIssued}
      />
      <InviteLinkDialog issued={issued} onClose={() => setIssued(null)} />
      <AlertDialog open={!!withdrawing} onOpenChange={(o) => !o && setWithdrawing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw {withdrawing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This ends their current enrolment. Their past attendance and results are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={withdraw}>Withdraw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
