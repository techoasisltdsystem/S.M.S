// Student engagement services: notifications, messaging, calendar, support tickets, lesson notes and
// student profiles. Notifications are created by row triggers, so any change made in the admin CMS
// (publishing a lesson, grading, announcements, certificates, schedule edits) reaches students automatically.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const db = TOS.db, lms = TOS.lms;
    const DAY = 86400000;

    // ---------------- Notifications ----------------
    const TYPES = {
        enrollment: { label: 'Enrollment', icon: 'fa-id-card' },
        lesson: { label: 'New lesson', icon: 'fa-circle-play' },
        assignment_due: { label: 'Assignment due', icon: 'fa-hourglass-half' },
        assignment_graded: { label: 'Assignment graded', icon: 'fa-file-circle-check' },
        quiz_available: { label: 'Quiz available', icon: 'fa-circle-question' },
        quiz_result: { label: 'Quiz result', icon: 'fa-square-poll-vertical' },
        course_completed: { label: 'Course completed', icon: 'fa-flag-checkered' },
        certificate: { label: 'Certificate issued', icon: 'fa-award' },
        message: { label: 'New message', icon: 'fa-envelope' },
        announcement: { label: 'Announcement', icon: 'fa-bullhorn' },
        schedule: { label: 'Schedule change', icon: 'fa-calendar-days' },
        support: { label: 'Support', icon: 'fa-life-ring' },
        submission: { label: 'New submission', icon: 'fa-inbox' },
        system: { label: 'Account', icon: 'fa-user-shield' }
    };
    let muted = 0;
    // Run writes without generating notifications (sample data, bulk imports)
    const quietly = fn => { muted++; try { return fn(); } finally { muted--; } };

    function notify(userId, type, title, body, link, opts) {
        if (muted || !userId) return null;
        const u = db.get('users', userId);
        if (!u || !['student', 'staff'].includes(u.role) || (u.status && u.status !== 'active')) return null;
        const prefs = (u.prefs && u.prefs.notify) || {};
        if (prefs[type] === false) return null;                // student switched this type off
        opts = opts || {};
        if (opts.key && db.first('notifications', { userId, key: opts.key })) return null;   // de-duplicate
        return db.insert('notifications', { userId, type, title, body: body || '', link: link || '', key: opts.key || null, readAt: null, createdAt: opts.at || db.now() });
    }
    const enrolledStudents = courseId => db.where('enrollments', e => e.courseId === courseId && e.status !== 'cancelled').map(e => e.userId);
    const allStudents = () => db.where('users', u => u.role === 'student' && u.status !== 'suspended').map(u => u.id);
    const audience = courseId => courseId ? enrolledStudents(courseId) : allStudents();
    const unreadCount = userId => db.count('notifications', n => n.userId === userId && !n.readAt);

    // ---------------- Triggers ----------------
    db.on('users', (evt, row) => {
        if (evt === 'insert' && row.role === 'student') {
            if (!row.studentId) row.studentId = nextStudentId();
            if (!row.status) row.status = 'active';
        }
    });
    db.on('enrollments', (evt, row, prev) => {
        const c = db.get('courses', row.courseId); if (!c) return;
        if (evt === 'insert') notify(row.userId, 'enrollment', 'You are enrolled in ' + c.title, 'Your course is ready in My Courses. Start whenever you like.', '/student/course/' + c.id, { at: row.enrolledAt, key: 'enr:' + row.id });
        if (evt === 'update' && row.status === 'completed' && prev.status !== 'completed') notify(row.userId, 'course_completed', 'Course completed: ' + c.title, 'Congratulations on finishing every lesson. Check whether your certificate is ready.', '/student/course/' + c.id, { at: row.completedAt });
        if (evt === 'update' && row.status === 'cancelled' && prev.status !== 'cancelled') notify(row.userId, 'enrollment', 'Course access removed: ' + c.title, 'Your access to this course has ended. Contact support if you think this is a mistake.', '/student/help');
        if (evt === 'remove') notify(row.userId, 'enrollment', 'Course access removed: ' + c.title, 'You are no longer enrolled in this course. Contact support if you think this is a mistake.', '/student/help');
    });
    db.on('lessons', (evt, row, prev) => {
        const becamePublished = row.status === 'published' && (evt === 'insert' || (evt === 'update' && prev.status !== 'published'));
        if (!becamePublished) return;
        const ctx = lms.lessonContext(row.id);
        if (!ctx || !ctx.course || ctx.course.status !== 'published' || ctx.section.status !== 'published') return;
        const isQuiz = row.type === 'quiz';
        enrolledStudents(ctx.course.id).forEach(uid => notify(uid, isQuiz ? 'quiz_available' : 'lesson', (isQuiz ? 'New quiz: ' : 'New lesson: ') + row.title, ctx.course.title + ' · ' + ctx.section.title, '/student/learn/' + row.id, { key: 'les:' + row.id + ':' + uid }));
    });
    db.on('submissions', (evt, row, prev) => {
        // Tell the course's grading staff about new work
        if ((evt === 'insert' || (evt === 'update' && prev && prev.submittedAt !== row.submittedAt)) && row.status !== 'graded') {
            const a = db.get('assignments', row.assignmentId), ctx = a && lms.lessonContext(a.lessonId), st = db.get('users', row.userId);
            if (ctx && ctx.course) lms.courseInstructors(ctx.course.id).forEach(i => { const iu = i.userId && db.get('users', i.userId); if (iu && (iu.permissions || []).includes('grade_students')) notify(iu.id, 'submission', 'New submission: ' + a.title, (st ? st.name : 'A student') + ' · ' + ctx.course.title, '/staff/grading?s=' + row.id); });
        }
        if (evt !== 'update' || row.status !== 'graded' || (prev && prev.status === 'graded' && prev.score === row.score)) return;
        const a = db.get('assignments', row.assignmentId); if (!a) return;
        notify(row.userId, 'assignment_graded', 'Graded: ' + a.title, `You scored ${row.score}/${a.maxScore}.${row.feedback ? ' Your instructor left feedback.' : ''}`, '/student/assignments/' + a.id, { at: row.gradedAt });
    });
    db.on('quiz_attempts', (evt, row) => {
        if (evt !== 'insert' || !row.submittedAt) return;
        const q = db.get('quizzes', row.quizId); if (!q) return;
        notify(row.userId, 'quiz_result', `${q.title}: ${row.percent}%`, row.passed ? 'Passed. Well done!' : `Not passed yet (${q.passingScore}% needed).`, '/student/learn/' + q.lessonId, { at: row.submittedAt });
    });
    db.on('certificates', (evt, row, prev) => {
        if (evt === 'insert') notify(row.userId, 'certificate', 'Certificate issued: ' + row.courseTitle, 'Your verified certificate is ready to view, download and share.', '/student/certificates', { at: row.issuedAt });
        if (evt === 'update' && row.revoked && !prev.revoked) notify(row.userId, 'certificate', 'Certificate revoked: ' + row.courseTitle, row.revokedReason || 'Contact the school for details.', '/student/certificates');
    });
    db.on('messages', (evt, row) => {
        if (evt !== 'insert') return;
        const cv = db.get('conversations', row.conversationId); if (!cv) return;
        db.update('conversations', cv.id, { lastMessageAt: row.createdAt });
        if (row.senderId !== cv.studentId) notify(cv.studentId, 'message', 'New message from ' + (row.senderName || 'Tech Oasis'), String(row.body).slice(0, 120), '/student/messages/' + cv.id);
        else if (cv.recipientUserId) notify(cv.recipientUserId, 'message', 'New message from ' + (row.senderName || 'a student'), String(row.body).slice(0, 120), '/staff/messages/' + cv.id);
    });
    db.on('announcements', (evt, row) => {
        if (evt !== 'insert') return;
        audience(row.courseId).forEach(uid => notify(uid, 'announcement', row.title, String(row.body).slice(0, 140), '/student/announcements', { at: row.createdAt, key: 'ann:' + row.id + ':' + uid }));
    });
    db.on('calendar_events', (evt, row, prev) => {
        if (evt === 'update' && prev && prev.startsAt === row.startsAt && prev.endsAt === row.endsAt && prev.location === row.location && prev.title === row.title) return;
        const when = new Date(row.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const title = evt === 'insert' ? 'Added to your calendar: ' + row.title : evt === 'remove' ? 'Cancelled: ' + row.title : 'Schedule change: ' + row.title;
        audience(row.courseId).forEach(uid => notify(uid, 'schedule', title, evt === 'remove' ? 'This event has been removed from the calendar.' : when + (row.location ? ' · ' + row.location : ''), '/student/calendar'));
    });
    db.on('support_tickets', (evt, row, prev) => {
        if (evt === 'update' && (row.replies || []).length > ((prev && prev.replies) || []).length) {
            const last = row.replies[row.replies.length - 1];
            if (last.by === 'staff') notify(row.userId, 'support', 'Support replied: ' + row.subject, String(last.body).slice(0, 120), '/student/help');
        }
    });

    // Reminders for assignments due soon (called when a student opens the portal; de-duplicated per assignment)
    function dueReminders(userId) {
        const hours = db.settings().portal.assignmentReminderHours || 48;
        db.where('enrollments', e => e.userId === userId && e.status !== 'cancelled').forEach(e => {
            lms.flatLessons(e.courseId).filter(l => l.type === 'assignment').forEach(l => {
                const a = lms.assignmentOf(l.id); if (!a || lms.submissionOf(userId, a.id)) return;
                const due = lms.assignmentDue(a, userId); if (!due) return;
                const left = new Date(due) - Date.now();
                if (left > 0 && left < hours * 3600000) notify(userId, 'assignment_due', 'Due soon: ' + a.title, 'Due ' + new Date(due).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), '/student/assignments/' + a.id, { key: 'due:' + a.id + ':' + userId });
                if (left <= 0) notify(userId, 'assignment_due', 'Overdue: ' + a.title, 'This assignment is past its due date. Submit as soon as you can.', '/student/assignments/' + a.id, { key: 'overdue:' + a.id + ':' + userId });
            });
        });
    }

    // ---------------- Students ----------------
    function nextStudentId() {
        const prefix = (db.settings().portal.studentIdPrefix || 'TOS').toUpperCase(), year = new Date().getFullYear();
        const nums = db.where('users', u => u.studentId && u.studentId.startsWith(prefix + year)).map(u => +u.studentId.slice((prefix + year).length) || 0);
        return prefix + year + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0');
    }

    // ---------------- Messaging ----------------
    // Who may a student message? Instructors of their courses, the support team, and (if allowed) administration.
    function recipientsFor(studentId) {
        const st = db.settings().portal, out = [];
        if (st.allowInstructorMessages) {
            const seen = new Set();
            db.where('enrollments', e => e.userId === studentId && e.status !== 'cancelled').forEach(e => {
                lms.courseInstructors(e.courseId).forEach(i => {
                    const iu = i.userId && db.get('users', i.userId);
                    if (!iu || seen.has(i.userId) || (iu.status && iu.status !== 'active') || !(iu.permissions || []).includes('message_students')) return;
                    seen.add(i.userId);
                    out.push({ key: 'ins:' + i.userId, type: 'instructor', userId: i.userId, label: i.name, sub: 'Instructor · ' + (db.get('courses', e.courseId) || {}).title, courseId: e.courseId });
                });
            });
        }
        out.push({ key: 'support', type: 'support', userId: null, label: 'Student Support', sub: 'Courses, payments and technical help' });
        if (st.allowAdminMessages) out.push({ key: 'admin', type: 'admin', userId: null, label: 'School Administration', sub: 'Registrar and academic office' });
        return out;
    }
    const conversationName = cv => cv.recipientType === 'instructor' ? ((db.get('users', cv.recipientUserId) || {}).name || 'Instructor') : cv.recipientType === 'admin' ? 'School Administration' : 'Student Support';
    function startConversation(studentId, { recipientKey, subject, body, attachments }) {
        const r = recipientsFor(studentId).find(x => x.key === recipientKey);
        if (!r) throw new Error('You are not allowed to message this recipient.');
        return db.tx(() => {
            const cv = db.insert('conversations', { studentId, recipientType: r.type, recipientUserId: r.userId, courseId: r.courseId || null, subject: subject || 'New conversation', lastMessageAt: db.now(), status: 'open' });
            const s = db.get('users', studentId);
            db.insert('messages', { conversationId: cv.id, senderId: studentId, senderName: s.name, senderRole: 'student', body, attachments: attachments || [], readAt: null });
            return cv;
        });
    }
    // Staff/admin start a thread with a student (e.g. admin "Send message")
    function staffStartConversation(studentId, { senderId, senderName, senderRole, subject, body }) {
        return db.tx(() => {
            const cv = db.insert('conversations', { studentId, recipientType: senderRole === 'instructor' ? 'instructor' : 'support', recipientUserId: senderRole === 'instructor' ? senderId : null, courseId: null, subject, lastMessageAt: db.now(), status: 'open' });
            db.insert('messages', { conversationId: cv.id, senderId: senderId || null, senderName, senderRole, body, attachments: [], readAt: null });
            return cv;
        });
    }
    function sendMessage(conversationId, { senderId, senderName, senderRole, body, attachments }) {
        return db.insert('messages', { conversationId, senderId: senderId || null, senderName, senderRole, body, attachments: attachments || [], readAt: null });
    }
    // Mark the other side's messages read. side = 'student' | 'staff'
    function markConversationRead(conversationId, side) {
        const cv = db.get('conversations', conversationId); if (!cv) return;
        db.tx(() => db.where('messages', m => m.conversationId === conversationId && !m.readAt && (side === 'student' ? m.senderId !== cv.studentId : m.senderId === cv.studentId)).forEach(m => db.update('messages', m.id, { readAt: db.now() })));
    }
    const unreadMessagesForStudent = studentId => {
        const ids = new Set(db.where('conversations', { studentId }).map(c => c.id));
        return db.count('messages', m => ids.has(m.conversationId) && m.senderId !== studentId && !m.readAt);
    };
    const unreadMessagesForStaff = filter => db.where('conversations', filter).reduce((n, cv) => n + db.count('messages', m => m.conversationId === cv.id && m.senderId === cv.studentId && !m.readAt), 0);

    // ---------------- Calendar ----------------
    // Everything on a student's calendar: school/course events, assignment deadlines and important announcements.
    function calendarFor(studentId) {
        const enrolled = db.where('enrollments', e => e.userId === studentId && e.status !== 'cancelled').map(e => e.courseId);
        const events = db.where('calendar_events', e => !e.courseId || enrolled.includes(e.courseId)).map(e => Object.assign({ source: 'event' }, e));
        enrolled.forEach(cid => lms.flatLessons(cid).filter(l => l.type === 'assignment').forEach(l => {
            const a = lms.assignmentOf(l.id), due = a && lms.assignmentDue(a, studentId);
            if (due) events.push({ id: 'asg_' + a.id, source: 'assignment', type: 'deadline', title: a.title + ' due', courseId: cid, startsAt: due, endsAt: due, allDay: false, link: '/student/assignments/' + a.id, done: !!lms.submissionOf(studentId, a.id) });
        }));
        db.where('announcements', a => a.important && (!a.courseId || enrolled.includes(a.courseId))).forEach(a => events.push({ id: 'ann_' + a.id, source: 'announcement', type: 'announcement', title: a.title, courseId: a.courseId, startsAt: a.eventDate || a.createdAt, endsAt: a.eventDate || a.createdAt, allDay: true, link: '/student/announcements' }));
        return events.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    }
    const EVENT_TYPES = { class: ['Class', 'fa-chalkboard-user'], exam: ['Exam', 'fa-pen-to-square'], quiz: ['Quiz deadline', 'fa-circle-question'], deadline: ['Deadline', 'fa-flag'], event: ['School event', 'fa-calendar-star'], holiday: ['Holiday', 'fa-umbrella-beach'], announcement: ['Announcement', 'fa-bullhorn'] };

    // ---------------- Notes & tickets ----------------
    const noteFor = (userId, lessonId) => db.first('lesson_notes', { userId, lessonId });
    const saveNote = (userId, lessonId, body) => db.upsert('lesson_notes', { userId, lessonId }, { body });
    function openTicket(userId, { category, subject, body }) {
        return db.insert('support_tickets', { userId, category, subject, body, status: 'open', replies: [] });
    }
    function replyTicket(id, { by, name, body, status }) {
        const t = db.get('support_tickets', id);
        return db.update('support_tickets', id, { replies: (t.replies || []).concat([{ by, name, body, at: db.now() }]), status: status || (by === 'staff' ? 'answered' : 'open') });
    }

    // ---------------- Migrations: existing data gets student IDs, statuses and sample portal content ----------------
    (TOS.migrations = TOS.migrations || []).push(function (db) {
        db.where('users', u => u.role === 'student' && (!u.studentId || !u.status)).forEach(u => { if (!u.studentId) u.studentId = nextStudentId(); if (!u.status) u.status = 'active'; });
        const st = db.settings();
        if (st._portalSeeded || !db.count('courses')) return;
        st._portalSeeded = true;
        quietly(() => seedPortal(db));
    });
    function seedPortal(db) {
        const web = lms.courseBySlug('web-development'), ai = lms.courseBySlug('artificial-intelligence-ai');
        const at = (days, h, m) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m || 0, 0, 0); return d.toISOString(); };
        const ev = (o) => db.insert('calendar_events', Object.assign({ allDay: false, location: 'Online · Live classroom', url: '', description: '' }, o));
        if (web) {
            // Weekly live class for Web Development: Tue & Thu, 6pm, for four weeks
            for (let w = 0; w < 4; w++) [2, 4].forEach(dow => { const d = new Date(); const diff = (dow - d.getDay() + 7) % 7 + w * 7; ev({ title: 'Web Development live class', type: 'class', courseId: web.id, startsAt: at(diff, 18), endsAt: at(diff, 19, 30), description: 'Weekly live session with Q&A.' }); });
            ev({ title: 'HTML & CSS practical exam', type: 'exam', courseId: web.id, startsAt: at(12, 10), endsAt: at(12, 12), description: 'Timed practical. Build a responsive page from a brief.' });
        }
        if (ai) ev({ title: 'Generative AI quiz window closes', type: 'quiz', courseId: ai.id, startsAt: at(5, 23, 59), endsAt: at(5, 23, 59) });
        ev({ title: 'New student orientation', type: 'event', courseId: null, startsAt: at(3, 17), endsAt: at(3, 18), description: 'Meet the team and learn how to get the most from the portal.' });
        ev({ title: 'JavaScript workshop', type: 'event', courseId: null, startsAt: at(4, 16), endsAt: at(4, 18), description: 'Hands-on workshop open to every student.' });
        db.insert('announcements', { courseId: null, title: 'JavaScript workshop this Friday', body: 'A hands-on JavaScript workshop is open to every student this Friday at 4pm. Bring a laptop and your questions.', authorName: 'Tech Oasis School', important: true, eventDate: at(4, 16) });
        // A sample conversation between a student and their instructor
        const margaret = db.first('users', { email: 'margaret@gmail.com' }), clifford = db.first('users', { email: 'instructor@techoasisltd.com' });
        if (margaret && clifford && web) {
            const cv = db.insert('conversations', { studentId: margaret.id, recipientType: 'instructor', recipientUserId: clifford.id, courseId: web.id, subject: 'Question about Flexbox', lastMessageAt: db.now(), status: 'open' });
            db.insert('messages', { conversationId: cv.id, senderId: margaret.id, senderName: margaret.name, senderRole: 'student', body: 'Hi Clifford, when should I use Flexbox instead of Grid?', attachments: [], readAt: db.now(), createdAt: new Date(Date.now() - 2 * DAY).toISOString() });
            db.insert('messages', { conversationId: cv.id, senderId: clifford.id, senderName: clifford.name, senderRole: 'instructor', body: 'Great question! Use Flexbox for one-dimensional layouts (a row or a column) and Grid when you need rows and columns together. We will practise both in Thursday\'s live class.', attachments: [], readAt: null, createdAt: new Date(Date.now() - DAY).toISOString() });
        }
    }

    TOS.engage = {
        TYPES, EVENT_TYPES, notify, quietly, unreadCount, dueReminders, nextStudentId,
        recipientsFor, conversationName, startConversation, staffStartConversation, sendMessage, markConversationRead, unreadMessagesForStudent, unreadMessagesForStaff,
        calendarFor, noteFor, saveNote, openTicket, replyTicket
    };
})();
