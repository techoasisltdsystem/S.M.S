import { useMemo, useState } from "react";
import { CalendarDays, Megaphone, Pencil, Plus } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import MonthCalendar from "@/components/kit/MonthCalendar";
import EventList, { upcoming } from "@/components/kit/EventList";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  todayIso, useAnnouncements, useAssignments, useClasses, useEvents, useRefreshSchoolData,
  type Announcement, type SchoolEvent,
} from "@/hooks/useSchoolData";
import EventDialog from "@/components/calendar/EventDialog";
import NoticeDialog from "@/components/calendar/NoticeDialog";
import NoticeBoard from "@/components/calendar/NoticeBoard";
import { localDate } from "@/components/calendar/shared";
import { ListSkeleton, LoadError } from "@/components/results/shared";

const CalendarPage = () => {
  const { user, can } = useAuth();
  const schoolId = user?.schoolId ?? "";
  const events = useEvents(schoolId);
  const notices = useAnnouncements(schoolId);
  const classes = useClasses(schoolId);
  const assignments = useAssignments(schoolId);
  const refresh = useRefreshSchoolData();
  const [day, setDay] = useState<string | null>(null);
  const [eventEdit, setEventEdit] = useState<{ event: SchoolEvent | null } | null>(null);
  const [noticeEdit, setNoticeEdit] = useState<{ notice: Announcement | null } | null>(null);

  const manage = can("communications.manage");
  const teacherPosting = !manage && user?.role === "teacher";
  const me = user?.id;

  const myClasses = useMemo(() => {
    const all = classes.data ?? [];
    if (!teacherPosting) return all;
    const ids = new Set([
      ...(assignments.data ?? []).filter((a) => a.teacher_id === me).map((a) => a.class_id),
      ...all.filter((c) => c.form_teacher_id === me).map((c) => c.id),
    ]);
    return all.filter((c) => ids.has(c.id));
  }, [classes.data, assignments.data, teacherPosting, me]);

  const className = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c.name])), [classes.data]);
  const marked = useMemo(() => (events.data ?? []).map((e) => localDate(e.starts_at)), [events.data]);
  const shown = useMemo(() => {
    const all = events.data ?? [];
    return day ? all.filter((e) => localDate(e.starts_at) === day) : upcoming(all, 8);
  }, [events.data, day]);

  const queries = [events, notices, classes, assignments];
  const loading = queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.isError);

  const dayLabel = day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "Upcoming events";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold">Calendar and notices</h1>
            <p className="text-sm text-muted-foreground">School events and announcements for you.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {manage && (
              <>
                <Button variant="outline" onClick={() => setNoticeEdit({ notice: null })}><Megaphone className="mr-2 h-4 w-4" /> Post notice</Button>
                <Button onClick={() => setEventEdit({ event: null })}><Plus className="mr-2 h-4 w-4" /> Add event</Button>
              </>
            )}
            {teacherPosting && (
              <Button onClick={() => setNoticeEdit({ notice: null })} disabled={myClasses.length === 0}><Megaphone className="mr-2 h-4 w-4" /> Post to my class</Button>
            )}
          </div>
        </div>

        {loading ? (
          <ListSkeleton />
        ) : failed ? (
          <LoadError message={(failed.error as Error).message} onRetry={() => queries.forEach((q) => q.isError && q.refetch())} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <Panel title="Month" icon={CalendarDays}>
                <MonthCalendar marked={marked} selected={day ?? undefined} onPick={(iso) => setDay(iso === day ? null : iso)} />
              </Panel>
              <Panel title={dayLabel}>
                {day && (
                  <Button variant="link" size="sm" className="-mt-2 mb-2 h-auto p-0" onClick={() => setDay(null)}>Show upcoming events</Button>
                )}
                {shown.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title={day ? "Nothing on this day" : "No upcoming events"}
                    text={manage ? "Use Add event to put something on the school calendar." : "Events the school adds will show here."}
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {shown.map((e) => (
                      <li key={e.id} className="flex items-center gap-1">
                        <div className="min-w-0 flex-1"><EventList events={[e]} /></div>
                        {manage && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Edit ${e.title}`} onClick={() => setEventEdit({ event: e })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            <Panel title="Notice board" icon={Megaphone} className="lg:col-span-2">
              <NoticeBoard
                notices={notices.data ?? []}
                className={className}
                canEdit={(n) => manage || (teacherPosting && n.created_by === me && !!n.class_id)}
                onEdit={(n) => setNoticeEdit({ notice: n })}
              />
            </Panel>
          </div>
        )}
      </div>

      {user && (
        <>
          <EventDialog
            open={!!eventEdit}
            onOpenChange={(o) => !o && setEventEdit(null)}
            schoolId={schoolId}
            event={eventEdit?.event ?? null}
            defaultDate={day ?? todayIso()}
            onSaved={refresh}
          />
          <NoticeDialog
            open={!!noticeEdit}
            onOpenChange={(o) => !o && setNoticeEdit(null)}
            schoolId={schoolId}
            notice={noticeEdit?.notice ?? null}
            classOnly={teacherPosting}
            classes={myClasses}
            onSaved={refresh}
          />
        </>
      )}
    </DashboardLayout>
  );
};

export default CalendarPage;
