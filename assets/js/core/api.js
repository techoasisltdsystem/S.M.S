// Student API: the only interface the student portal uses to read and write data.
//
// Every call is async and checks the session (signed in, role = student, not suspended), and only ever
// returns the signed-in student's own records. Today it runs against TOS.db in the browser; to move to a
// real backend, re-implement these functions as HTTP calls with the same names and return shapes.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const { db, lms, auth, engage } = TOS;
    const DAY = 86400000;

    class ApiError extends Error { constructor(code, message) { super(message); this.code = code; } }
    const out = v => v == null ? v : JSON.parse(JSON.stringify(v));          // never hand out live rows
    const call = fn => (...args) => new Promise((res, rej) => { try { res(out(fn(...args))); } catch (e) { rej(e instanceof ApiError ? e : new ApiError('ERROR', e.message)); } });

    function me() {
        const s = auth.current();
        if (!s) { const p = auth.sessionProblem(); throw new ApiError(p === 'suspended' ? 'SUSPENDED' : 'UNAUTHENTICATED', p === 'suspended' ? 'Your account is suspended.' : 'Please sign in to continue.'); }
        if (s.role !== 'student') throw new ApiError('FORBIDDEN', 'The student portal is for student accounts only.');
        return db.get('users', s.id);
    }
    const myEnrollments = uid => db.where('enrollments', e => e.userId === uid && e.status !== 'cancelled' && db.get('courses', e.courseId));
    function requireCourseAccess(uid, courseId) {
        const c = db.get('courses', courseId);
        if (!c) throw new ApiError('NOT_FOUND', 'This course could not be found.');
        const e = lms.enrollmentOf(uid, courseId);
        if (!e || e.status === 'cancelled') throw new ApiError('NO_ACCESS', "You don't have access to this course.");
        return { course: c, enrollment: e };
    }
    const sectionOrdinal = (courseId, sectionId) => db.ordered('sections', s => s.courseId === courseId && s.status === 'published').findIndex(s => s.id === sectionId) + 1;
    const instructorName = cid => (lms.primaryInstructor(cid) || {}).name || 'Tech Oasis Faculty';
    const fmtDue = d => d ? new Date(d).toISOString() : null;

    function courseSummary(uid, e) {
        const c = db.get('courses', e.courseId), p = lms.progress(uid, c.id), all = p.lessons;
        const cur = p.current, curIdx = cur ? all.findIndex(l => l.id === cur.id) : -1;
        const sec = cur && db.get('sections', cur.sectionId);
        return {
            id: c.id, slug: c.slug, title: c.title, thumbnail: c.thumbnail, level: c.level, category: lms.categoryName(c.categoryId),
            instructor: instructorName(c.id), pct: p.pct, done: p.done, total: p.total, status: e.status === 'completed' || (p.total && p.pct === 100) ? 'completed' : p.done || p.lessons.some(l => lms.progressRow(uid, l.id)) ? 'in_progress' : 'not_started',
            enrolledAt: e.enrolledAt, lastAccessAt: e.lastAccessAt, publishedAt: c.publishedAt || c.createdAt, payment: lms.paymentState(e), trialEndsAt: e.trialEndsAt,
            current: cur ? { id: cur.id, title: cur.title, type: cur.type, index: curIdx + 1, sectionTitle: sec ? sec.title : '', sectionIndex: sec ? sectionOrdinal(c.id, sec.id) : 0 } : null,
            certificate: (lms.certificateOf(uid, c.id) || {}).code || null, eligible: lms.eligibility(uid, c.id).eligible
        };
    }

    function streak(uid) {
        const days = new Set(db.where('lesson_progress', p => p.userId === uid && (p.completedAt || p.lastWatchedAt)).flatMap(p => [p.completedAt, p.lastWatchedAt].filter(Boolean).map(d => new Date(d).toDateString())));
        let n = 0; const d = new Date();
        if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
        while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
        return n;
    }

    function assignmentRows(uid) {
        const rows = [];
        myEnrollments(uid).forEach(e => lms.flatLessons(e.courseId).filter(l => l.type === 'assignment').forEach(l => {
            const a = lms.assignmentOf(l.id); if (!a) return;
            const sub = lms.submissionOf(uid, a.id), due = lms.assignmentDue(a, uid);
            const status = sub ? (sub.status === 'graded' ? 'graded' : 'submitted') : due && new Date(due) < new Date() ? 'overdue' : 'upcoming';
            rows.push({ id: a.id, lessonId: l.id, title: a.title, courseId: e.courseId, course: (db.get('courses', e.courseId) || {}).title, due: fmtDue(due), maxScore: a.maxScore, status, score: sub && sub.status === 'graded' ? sub.score : null, submittedAt: sub ? sub.submittedAt : null, late: sub ? sub.status === 'late' : false });
        }));
        return rows.sort((x, y) => new Date(x.due || 8.64e15) - new Date(y.due || 8.64e15));
    }
    function quizRows(uid) {
        const rows = [];
        myEnrollments(uid).forEach(e => lms.flatLessons(e.courseId).filter(l => l.type === 'quiz').forEach(l => {
            const q = lms.quizOf(l.id); if (!q) return;
            const at = lms.attemptsOf(uid, q.id), best = lms.bestAttempt(uid, q.id), left = lms.attemptsLeft(uid, q);
            const passed = at.some(a => a.passed);
            rows.push({ id: q.id, lessonId: l.id, title: q.title, courseId: e.courseId, course: (db.get('courses', e.courseId) || {}).title, questions: lms.questionsOf(q.id).length, passingScore: q.passingScore, timeLimitMin: q.timeLimitMin,
                attempts: at.length, maxAttempts: q.maxAttempts, attemptsLeft: left === Infinity ? null : left, best: best ? best.percent : null, status: passed ? 'completed' : at.length ? (left > 0 ? 'pending' : 'failed') : 'available', lastAttemptAt: at[0] ? at[0].submittedAt : null });
        }));
        return rows;
    }

    // Results, monthly performance, today's schedule and this month's calendar for the dashboard. Only this student's own
    // quiz attempts and graded submissions in courses they are enrolled in are read.
    function academicSummary(uid, courses) {
        const courseIds = courses.map(c => c.id), title = id => (db.get('courses', id) || {}).title || '';
        const results = [];
        quizRows(uid).forEach(q => lms.attemptsOf(uid, q.id).forEach(a => results.push({ kind: 'Quiz', title: q.title, course: q.course, percent: a.percent, passed: a.passed, at: a.submittedAt, href: '/student/quizzes' })));
        assignmentRows(uid).forEach(a => {
            const sub = lms.submissionOf(uid, a.id);
            if (sub && sub.status === 'graded' && a.maxScore) results.push({ kind: 'Assignment', title: a.title, course: a.course, percent: Math.round(sub.score / a.maxScore * 100), score: sub.score, maxScore: a.maxScore, at: sub.gradedAt || sub.submittedAt, href: '/student/assignments/' + a.id });
        });
        results.sort((x, y) => new Date(y.at) - new Date(x.at));
        // Average score per calendar month, last 6 months; months without any result are left out rather than shown as 0
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - i);
            const next = new Date(d); next.setMonth(d.getMonth() + 1);
            const inMonth = results.filter(r => new Date(r.at) >= d && new Date(r.at) < next);
            if (inMonth.length) months.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), value: Math.round(inMonth.reduce((a, r) => a + r.percent, 0) / inMonth.length), count: inMonth.length });
        }
        const events = engage.calendarFor(uid).filter(e => e.source !== 'announcement').map(e => Object.assign({}, e, { course: e.courseId ? title(e.courseId) : null }));
        const start = new Date(); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(start.getDate() + 1);
        return {
            results: results.slice(0, 6), resultsCount: results.length,
            averageScore: results.length ? Math.round(results.reduce((a, r) => a + r.percent, 0) / results.length) : null,
            performance: months,
            today: events.filter(e => new Date(e.startsAt) >= start && new Date(e.startsAt) < end).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)),
            calendarEvents: events.map(e => ({ startsAt: e.startsAt, title: e.title })),
            courseMix: { completed: courses.filter(c => c.status === 'completed').length, inProgress: courses.filter(c => c.status === 'in_progress').length, notStarted: courses.filter(c => c.status === 'not_started').length },
            courseIds
        };
    }

    // ===================== Public API =====================
    const api = {
        ApiError,

        me: call(() => {
            const u = me();
            const enrs = myEnrollments(u.id);
            const current = enrs.slice().sort((a, b) => new Date(b.lastAccessAt || 0) - new Date(a.lastAccessAt || 0))[0];
            return { id: u.id, name: u.name, email: u.email, studentId: u.studentId, phone: u.phone || '', bio: u.bio || '', avatar: u.avatar || '', program: u.program || (current ? (db.get('courses', current.courseId) || {}).title : ''), className: u.className || '', status: u.status, createdAt: u.createdAt, prefs: u.prefs || {} };
        }),
        counts: call(() => { const u = me(); return { notifications: engage.unreadCount(u.id), messages: engage.unreadMessagesForStudent(u.id), announcements: db.where('announcements', a => (!a.courseId || myEnrollments(u.id).some(e => e.courseId === a.courseId)) && !db.first('announcement_reads', { announcementId: a.id, userId: u.id })).length }; }),

        dashboard: call(() => {
            const u = me(); engage.dueReminders(u.id);
            const courses = myEnrollments(u.id).map(e => courseSummary(u.id, e));
            const lessonsDone = courses.reduce((a, c) => a + c.done, 0), lessonsTotal = courses.reduce((a, c) => a + c.total, 0);
            const recent = courses.slice().sort((a, b) => new Date(b.lastAccessAt || 0) - new Date(a.lastAccessAt || 0));
            const assignments = assignmentRows(u.id).filter(a => a.status === 'upcoming' || a.status === 'overdue');
            const upcoming = engage.calendarFor(u.id).filter(e => new Date(e.endsAt || e.startsAt) >= new Date() && e.source !== 'announcement').slice(0, 5)
                .map(e => Object.assign({}, e, { course: e.courseId ? (db.get('courses', e.courseId) || {}).title : null }));
            const anns = db.where('announcements', a => !a.courseId || courses.some(c => c.id === a.courseId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3)
                .map(a => Object.assign({}, a, { read: !!db.first('announcement_reads', { announcementId: a.id, userId: u.id }) }));
            return {
                stats: { enrolled: courses.length, completed: courses.filter(c => c.status === 'completed').length, inProgress: courses.filter(c => c.status === 'in_progress').length, certificates: db.count('certificates', c => c.userId === u.id && !c.revoked) },
                overall: lessonsTotal ? Math.round(lessonsDone / lessonsTotal * 100) : 0, lessonsDone, lessonsTotal, streak: streak(u.id),
                continue: recent.find(c => c.status !== 'completed' && c.current) || recent[0] || null, courses: recent.slice(0, 4),
                assignmentsDue: assignments.slice(0, 4), assignmentsDueCount: assignments.length, upcoming, announcements: anns,
                notifications: db.where('notifications', { userId: u.id }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
                ...academicSummary(u.id, courses)
            };
        }),

        myCourses: call(() => { const u = me(); return myEnrollments(u.id).map(e => courseSummary(u.id, e)); }),

        catalog: call(() => {
            const u = me();
            return lms.listedCourses().map(c => {
                const m = lms.courseMeta(c.id), e = lms.enrollmentOf(u.id, c.id);
                return { id: c.id, slug: c.slug, title: c.title, thumbnail: c.thumbnail, shortDescription: c.shortDescription, level: c.level, category: lms.categoryName(c.categoryId), categoryId: c.categoryId, instructor: instructorName(c.id), price: lms.priceOf(c), hours: m.hours, lessons: m.lessons, rating: m.rating.avg, reviews: m.rating.count, enrolled: !!(e && e.status !== 'cancelled') };
            });
        }),

        course: call(courseId => {
            const u = me();
            const c = db.get('courses', courseId);
            if (!c || (c.status !== 'published' && !lms.enrollmentOf(u.id, courseId))) throw new ApiError('NOT_FOUND', 'This course could not be found or is no longer available.');
            const e = lms.enrollmentOf(u.id, courseId), enrolled = !!(e && e.status !== 'cancelled');
            const t = lms.tree(courseId, false), p = enrolled ? lms.progress(u.id, courseId) : null, m = lms.courseMeta(courseId);
            const st = db.settings();
            return {
                id: c.id, slug: c.slug, title: c.title, thumbnail: c.thumbnail, shortDescription: c.shortDescription, description: c.description, level: c.level, language: c.language, category: lms.categoryName(c.categoryId),
                outcomes: c.outcomes || [], requirements: c.requirements || [], price: lms.priceOf(c), hours: m.hours, rating: m.rating.avg, reviews: m.rating.count,
                instructors: lms.courseInstructors(courseId).map(i => ({ name: i.name, title: i.title, avatar: i.avatar, bio: i.bio })),
                enrolled, enrollment: enrolled ? { status: e.status, enrolledAt: e.enrolledAt, payment: lms.paymentState(e), trialEndsAt: e.trialEndsAt } : null,
                progress: p ? { pct: p.pct, done: p.done, total: p.total, currentId: p.current ? p.current.id : null, nextId: p.next ? p.next.id : null } : null,
                sections: t.sections.map((s, i) => {
                    const sp = p && p.sections.find(x => x.id === s.id);
                    return { id: s.id, index: i + 1, title: s.title, description: s.description, pct: sp ? sp.pct : 0, status: sp ? sp.status : 'not_started',
                        lessons: s.lessons.map(l => { const acc = lms.lessonAccess(u.id, l.id); const row = lms.progressRow(u.id, l.id);
                            return { id: l.id, title: l.title, type: l.type, durationMin: l.durationMin, isPreview: l.isPreview, completed: row && row.status === 'completed', started: !!row, locked: !acc.ok, lockReason: acc.ok ? null : acc.reason }; }) };
                }),
                resources: enrolled ? lms.resourcesOf({ courseId }).map(r => ({ id: r.id, name: r.name, fileType: r.fileType, url: r.url, sizeBytes: r.sizeBytes })) : [],
                assignments: enrolled ? assignmentRows(u.id).filter(a => a.courseId === courseId) : [],
                quizzes: enrolled ? quizRows(u.id).filter(q => q.courseId === courseId) : [],
                certificate: { enabled: st.certificates.enabled && c.certificateEnabled, issued: enrolled ? out(lms.certificateOf(u.id, courseId)) : null, eligibility: enrolled ? lms.eligibility(u.id, courseId) : null, rules: { minLessonPct: st.certificates.minLessonPct, requireQuizPass: st.certificates.requireQuizPass, requireAssignments: st.certificates.requireAssignments, minAssignmentPct: st.certificates.minAssignmentPct } }
            };
        }),

        quote: call((courseId, code) => { me(); return lms.quote(courseId, code); }),
        // Enroll (free) or check out (paid). Paying online is refused until a payment gateway is integrated (lms.onlinePayments).
        enroll: call((courseId, { coupon, payNow } = {}) => {
            const u = me(), c = db.get('courses', courseId);
            if (!c || c.status !== 'published') throw new ApiError('NOT_FOUND', 'This course is not open for enrollment.');
            if (payNow && !lms.onlinePayments()) throw new ApiError('PAYMENT_UNAVAILABLE', 'Online payment is not available yet. Please email ' + db.settings().school.studentEmail + ' to arrange payment.');
            const ex = lms.enrollmentOf(u.id, courseId);
            if (ex && ex.status !== 'cancelled') {
                if (payNow && ex.orderId && ['trial', 'overdue', 'pending'].includes(lms.paymentState(ex))) lms.markOrderPaid(ex.orderId, db.settings().payments.provider, 'demo-' + Date.now());
                return { ok: true };
            }
            if (ex) db.remove('enrollments', ex.id);
            const r = lms.checkout(u.id, courseId, coupon);
            if (r.error) throw new ApiError('INVALID', r.error);
            if (payNow && r.order.status !== 'paid') lms.markOrderPaid(r.order.id, db.settings().payments.provider, 'demo-' + Date.now());
            return { ok: true };
        }),

        lesson: call(lessonId => {
            const u = me();
            const ctx = lms.lessonContext(lessonId);
            if (!ctx || !ctx.course || ctx.lesson.status !== 'published' || ctx.section.status !== 'published') throw new ApiError('NOT_FOUND', 'This lesson could not be found or is not published yet.');
            const acc = lms.lessonAccess(u.id, lessonId);
            const all = lms.flatLessons(ctx.course.id), i = all.findIndex(l => l.id === lessonId);
            const base = { id: lessonId, title: ctx.lesson.title, courseId: ctx.course.id, courseTitle: ctx.course.title, sectionTitle: ctx.section.title, index: i + 1, total: all.length, prevId: (all[i - 1] || {}).id || null, nextId: (all[i + 1] || {}).id || null, type: ctx.lesson.type };
            if (!acc.ok) return Object.assign(base, { locked: true, lockReason: acc.reason });
            const l = ctx.lesson, row = lms.progressRow(u.id, lessonId), contents = lms.contentsOf(lessonId);
            const quiz = l.type === 'quiz' ? lms.quizOf(lessonId) : null, asg = l.type === 'assignment' ? lms.assignmentOf(lessonId) : null;
            const discussOn = ctx.course.discussionsEnabled !== false && l.discussionsEnabled !== false && db.settings().courses.discussionsEnabled;
            return Object.assign(base, {
                locked: false, previewOnly: !!acc.previewOnly, summary: l.summary, body: l.body, durationMin: l.durationMin,
                completed: row && row.status === 'completed', position: row ? row.videoPositionSec || 0 : 0, watchedPct: row ? row.videoWatchedPct || 0 : 0, lastWatchedAt: row ? row.lastWatchedAt : null,
                contents: contents.map(c => out(c)),
                quiz: quiz ? quizRows(u.id).find(q => q.id === quiz.id) || { id: quiz.id, title: quiz.title, questions: lms.questionsOf(quiz.id).length, passingScore: quiz.passingScore, timeLimitMin: quiz.timeLimitMin, maxAttempts: quiz.maxAttempts, attempts: 0, attemptsLeft: quiz.maxAttempts || null, status: 'available' } : null,
                quizInstructions: quiz ? quiz.instructions : '', assignmentId: asg ? asg.id : null,
                resources: lms.resourcesOf({ lessonId }).concat(i === 0 || l.type === 'download' ? lms.resourcesOf({ courseId: ctx.course.id }) : []).map(r => ({ id: r.id, name: r.name, fileType: r.fileType, url: r.url, sizeBytes: r.sizeBytes, courseWide: !!r.courseId })),
                discussionsEnabled: discussOn, note: (engage.noteFor(u.id, lessonId) || {}).body || ''
            });
        }),
        openLesson: call(lessonId => { const u = me(); const ctx = lms.lessonContext(lessonId); if (ctx && lms.lessonAccess(u.id, lessonId).ok && lms.enrollmentOf(u.id, ctx.course.id)) lms.touch(u.id, ctx.course.id, lessonId); return { ok: true }; }),
        completeLesson: call((lessonId, done) => {
            const u = me(), ctx = lms.lessonContext(lessonId); requireCourseAccess(u.id, ctx.course.id);
            if (!lms.lessonAccess(u.id, lessonId).ok) throw new ApiError('NO_ACCESS', 'This lesson is locked.');
            lms.setComplete(u.id, lessonId, done !== false);
            const p = lms.progress(u.id, ctx.course.id);
            return { pct: p.pct, courseCompleted: p.pct === 100, eligible: lms.eligibility(u.id, ctx.course.id).eligible };
        }),
        saveVideoProgress: call((lessonId, pos, dur) => {
            const u = me(), ctx = lms.lessonContext(lessonId);
            if (!ctx || !lms.enrollmentOf(u.id, ctx.course.id) || !lms.lessonAccess(u.id, lessonId).ok) return { completed: false };
            return { completed: lms.saveVideoProgress(u.id, lessonId, pos, dur) };
        }),
        saveNote: call((lessonId, body) => { const u = me(); engage.saveNote(u.id, lessonId, String(body).slice(0, 20000)); return { ok: true }; }),

        // ---- Quizzes: questions are sent without answers; grading happens here ----
        quizzes: call(() => quizRows(me().id)),
        startQuiz: call(quizId => {
            const u = me(), q = db.get('quizzes', quizId); if (!q) throw new ApiError('NOT_FOUND', 'Quiz not found.');
            const ctx = lms.lessonContext(q.lessonId); requireCourseAccess(u.id, ctx.course.id);
            if (!lms.lessonAccess(u.id, q.lessonId).ok) throw new ApiError('NO_ACCESS', 'This quiz is locked.');
            if (lms.attemptsLeft(u.id, q) <= 0) throw new ApiError('INVALID', 'You have used all your attempts for this quiz.');
            let qs = lms.questionsOf(quizId);
            if (q.shuffle) qs = qs.slice().sort(() => Math.random() - .5);
            return { id: q.id, title: q.title, instructions: q.instructions, timeLimitMin: q.timeLimitMin, passingScore: q.passingScore, startedAt: db.now(),
                questions: qs.map(x => ({ id: x.id, type: x.type, prompt: x.prompt, points: x.points || 1, options: x.options })) };
        }),
        submitQuiz: call((quizId, answers, startedAt) => {
            const u = me(), q = db.get('quizzes', quizId); if (!q) throw new ApiError('NOT_FOUND', 'Quiz not found.');
            const ctx = lms.lessonContext(q.lessonId); requireCourseAccess(u.id, ctx.course.id);
            if (lms.attemptsLeft(u.id, q) <= 0) throw new ApiError('INVALID', 'No attempts remaining.');
            const r = lms.submitQuiz(u.id, quizId, answers || {}, startedAt);
            const qs = lms.questionsOf(quizId);
            const left = lms.attemptsLeft(u.id, q);
            return { percent: r.percent, score: r.score, max: r.max, passed: r.passed, passingScore: q.passingScore, attemptsLeft: left === Infinity ? null : left,
                correct: r.results.filter(x => x.ok).length, incorrect: r.results.filter(x => !x.ok).length,
                review: qs.map(x => { const res = r.results.find(y => y.questionId === x.id); return { id: x.id, prompt: x.prompt, options: x.options, correct: x.correct, given: (answers || {})[x.id] || [], ok: res.ok, explanation: x.explanation, points: x.points || 1 }; }),
                eligible: lms.eligibility(u.id, ctx.course.id).eligible };
        }),
        quizHistory: call(quizId => lms.attemptsOf(me().id, quizId).map(a => ({ id: a.id, percent: a.percent, passed: a.passed, submittedAt: a.submittedAt }))),

        // ---- Assignments ----
        assignments: call(() => assignmentRows(me().id)),
        assignment: call(id => {
            const u = me(), a = db.get('assignments', id); if (!a) throw new ApiError('NOT_FOUND', 'Assignment not found.');
            const ctx = lms.lessonContext(a.lessonId); requireCourseAccess(u.id, ctx.course.id);
            const sub = lms.submissionOf(u.id, a.id), row = assignmentRows(u.id).find(r => r.id === id);
            return Object.assign({}, row || {}, { id: a.id, lessonId: a.lessonId, title: a.title, instructions: a.instructions, rubric: a.rubric || [], maxScore: a.maxScore, allowFile: a.allowFile, allowText: a.allowText !== false, course: ctx.course.title, courseId: ctx.course.id, section: ctx.section.title,
                resources: lms.resourcesOf({ lessonId: a.lessonId }).map(r => ({ name: r.name, url: r.url, fileType: r.fileType, sizeBytes: r.sizeBytes })), submission: sub ? out(sub) : null });
        }),
        submitAssignment: call((id, { text, files }) => {
            const u = me(), a = db.get('assignments', id); if (!a) throw new ApiError('NOT_FOUND', 'Assignment not found.');
            const ctx = lms.lessonContext(a.lessonId); requireCourseAccess(u.id, ctx.course.id);
            if (!lms.lessonAccess(u.id, a.lessonId).ok) throw new ApiError('NO_ACCESS', 'This assignment is locked.');
            const ex = lms.submissionOf(u.id, id); if (ex && ex.status === 'graded') throw new ApiError('INVALID', 'This assignment has already been graded.');
            if (!String(text || '').trim() && !(files || []).length) throw new ApiError('INVALID', 'Add an answer or attach a file.');
            lms.submitAssignment(u.id, id, { text, files });
            return { ok: true, eligible: lms.eligibility(u.id, ctx.course.id).eligible };
        }),

        // ---- Certificates ----
        certificates: call(() => db.where('certificates', c => c.userId === me().id).sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))),
        claimCertificate: call(courseId => {
            const u = me(); requireCourseAccess(u.id, courseId);
            const el = lms.eligibility(u.id, courseId);
            if (!el.eligible) throw new ApiError('INVALID', 'You have not met the certificate requirements yet.');
            return lms.issueCertificate(u.id, courseId);
        }),

        // ---- Learning progress analytics ----
        progress: call(() => {
            const u = me(), enrs = myEnrollments(u.id), courses = enrs.map(e => courseSummary(u.id, e));
            const rows = db.where('lesson_progress', { userId: u.id });
            const attempts = db.where('quiz_attempts', a => a.userId === u.id && a.submittedAt), subs = db.where('submissions', { userId: u.id });
            const graded = subs.filter(s => s.status === 'graded');
            const certs = db.where('certificates', c => c.userId === u.id && !c.revoked);
            const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); const n = new Date(d); n.setDate(d.getDate() + 1); days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }), value: rows.filter(r => r.completedAt && new Date(r.completedAt) >= d && new Date(r.completedAt) < n).length }); }
            const activity = []
                .concat(rows.filter(r => r.completedAt).map(r => { const l = db.get('lessons', r.lessonId); return l && { at: r.completedAt, icon: 'fa-circle-check', text: 'Completed lesson "' + l.title + '"', link: '/student/learn/' + l.id }; }))
                .concat(attempts.map(a => { const q = db.get('quizzes', a.quizId); return q && { at: a.submittedAt, icon: 'fa-circle-question', text: `Scored ${a.percent}% on "${q.title}"`, link: '/student/learn/' + q.lessonId }; }))
                .concat(subs.map(s => { const a = db.get('assignments', s.assignmentId); return a && { at: s.gradedAt || s.submittedAt, icon: 'fa-file-pen', text: s.status === 'graded' ? `"${a.title}" graded ${s.score}/${a.maxScore}` : `Submitted "${a.title}"`, link: '/student/assignments/' + a.id }; }))
                .concat(certs.map(c => ({ at: c.issuedAt, icon: 'fa-award', text: 'Earned certificate: ' + c.courseTitle, link: '/student/certificates' })))
                .concat(enrs.map(e => ({ at: e.enrolledAt, icon: 'fa-id-card', text: 'Enrolled in ' + (db.get('courses', e.courseId) || {}).title, link: '/student/course/' + e.courseId })))
                .filter(Boolean).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 12);
            const lessonsDone = courses.reduce((a, c) => a + c.done, 0), lessonsTotal = courses.reduce((a, c) => a + c.total, 0);
            return {
                overall: lessonsTotal ? Math.round(lessonsDone / lessonsTotal * 100) : 0, lessonsDone, lessonsTotal, courses,
                watchSeconds: rows.reduce((a, r) => a + (r.watchSeconds || 0), 0), streak: streak(u.id), daily: days,
                quizzes: { attempts: attempts.length, avg: attempts.length ? Math.round(attempts.reduce((a, x) => a + x.percent, 0) / attempts.length) : null, passRate: attempts.length ? Math.round(attempts.filter(a => a.passed).length / attempts.length * 100) : null, rows: quizRows(u.id) },
                assignments: { submitted: subs.length, graded: graded.length, avg: graded.length ? Math.round(graded.reduce((a, s) => { const as = db.get('assignments', s.assignmentId); return a + s.score / ((as && as.maxScore) || 100) * 100; }, 0) / graded.length) : null },
                certificates: certs.length, activity
            };
        }),

        // ---- Calendar, schedule, resources ----
        calendar: call(() => { const u = me(); return engage.calendarFor(u.id).map(e => Object.assign({}, e, { course: e.courseId ? (db.get('courses', e.courseId) || {}).title : null })); }),
        resources: call(() => {
            const u = me(), list = [];
            myEnrollments(u.id).forEach(e => {
                const c = db.get('courses', e.courseId);
                lms.resourcesOf({ courseId: c.id }).forEach(r => list.push({ id: r.id, name: r.name, fileType: r.fileType, url: r.url, sizeBytes: r.sizeBytes, course: c.title, courseId: c.id, lesson: null }));
                lms.flatLessons(c.id).forEach(l => { if (!lms.lessonAccess(u.id, l.id).ok) return; lms.resourcesOf({ lessonId: l.id }).forEach(r => list.push({ id: r.id, name: r.name, fileType: r.fileType, url: r.url, sizeBytes: r.sizeBytes, course: c.title, courseId: c.id, lesson: l.title, lessonId: l.id })); });
            });
            return list;
        }),

        // ---- Announcements & notifications ----
        announcements: call(() => {
            const u = me(), mine = myEnrollments(u.id).map(e => e.courseId);
            return db.where('announcements', a => !a.courseId || mine.includes(a.courseId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(a => Object.assign({}, a, { course: a.courseId ? (db.get('courses', a.courseId) || {}).title : null, read: !!db.first('announcement_reads', { announcementId: a.id, userId: u.id }) }));
        }),
        markAnnouncementRead: call(id => { const u = me(); if (!db.first('announcement_reads', { announcementId: id, userId: u.id })) db.insert('announcement_reads', { announcementId: id, userId: u.id }); return { ok: true }; }),
        markAllAnnouncementsRead: call(() => { const u = me(), mine = myEnrollments(u.id).map(e => e.courseId); db.tx(() => db.where('announcements', a => !a.courseId || mine.includes(a.courseId)).forEach(a => { if (!db.first('announcement_reads', { announcementId: a.id, userId: u.id })) db.insert('announcement_reads', { announcementId: a.id, userId: u.id }); })); return { ok: true }; }),
        notifications: call(() => db.where('notifications', { userId: me().id }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))),
        markNotification: call((id, read) => { const u = me(), n = db.get('notifications', id); if (!n || n.userId !== u.id) throw new ApiError('NOT_FOUND', 'Notification not found.'); db.update('notifications', id, { readAt: read === false ? null : db.now() }); return { ok: true }; }),
        markAllNotifications: call(() => { const u = me(); db.tx(() => db.where('notifications', n => n.userId === u.id && !n.readAt).forEach(n => db.update('notifications', n.id, { readAt: db.now() }))); return { ok: true }; }),
        deleteNotification: call(id => { const u = me(), n = db.get('notifications', id); if (!n || n.userId !== u.id) throw new ApiError('NOT_FOUND', 'Notification not found.'); db.remove('notifications', id); return { ok: true }; }),

        // ---- Messages ----
        recipients: call(() => engage.recipientsFor(me().id)),
        conversations: call(() => {
            const u = me();
            return db.where('conversations', { studentId: u.id }).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)).map(cv => {
                const msgs = db.where('messages', { conversationId: cv.id }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), last = msgs[msgs.length - 1];
                return { id: cv.id, subject: cv.subject, with: engage.conversationName(cv), type: cv.recipientType, course: cv.courseId ? (db.get('courses', cv.courseId) || {}).title : null, lastMessageAt: cv.lastMessageAt, preview: last ? (last.senderId === u.id ? 'You: ' : '') + last.body : '', unread: msgs.filter(m => m.senderId !== u.id && !m.readAt).length };
            });
        }),
        conversation: call(id => {
            const u = me(), cv = db.get('conversations', id);
            if (!cv || cv.studentId !== u.id) throw new ApiError('NOT_FOUND', 'Conversation not found.');
            engage.markConversationRead(id, 'student');
            return { id: cv.id, subject: cv.subject, with: engage.conversationName(cv), type: cv.recipientType, course: cv.courseId ? (db.get('courses', cv.courseId) || {}).title : null,
                messages: db.where('messages', { conversationId: id }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(m => Object.assign({}, m, { mine: m.senderId === u.id })) };
        }),
        startConversation: call(data => { const u = me(); if (!String(data.body || '').trim()) throw new ApiError('INVALID', 'Write a message first.'); return engage.startConversation(u.id, data); }),
        reply: call((id, body, attachments) => {
            const u = me(), cv = db.get('conversations', id);
            if (!cv || cv.studentId !== u.id) throw new ApiError('NOT_FOUND', 'Conversation not found.');
            if (!String(body || '').trim() && !(attachments || []).length) throw new ApiError('INVALID', 'Write a message first.');
            return engage.sendMessage(id, { senderId: u.id, senderName: u.name, senderRole: 'student', body: String(body).trim(), attachments });
        }),

        // ---- Discussion (per lesson) ----
        discussion: call(lessonId => {
            const u = me(), posts = db.where('discussions', { lessonId });
            // Respect each student's privacy choice: "Ama Owusu" -> "Ama O."
            const display = x => (x.prefs && x.prefs.privacy && x.prefs.privacy.showFullName === false) ? x.name.split(/\s+/).map((w, i) => i ? w[0] + '.' : w).slice(0, 2).join(' ') : x.name;
            const who = p => { const x = p.userId && db.get('users', p.userId); return { name: x ? display(x) : (p.authorName || 'Tech Oasis Team'), staff: !x || x.role !== 'student', mine: p.userId === u.id }; };
            return posts.filter(p => !p.parentId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => Object.assign({ id: p.id, body: p.body, createdAt: p.createdAt }, who(p), {
                replies: posts.filter(r => r.parentId === p.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(r => Object.assign({ id: r.id, body: r.body, createdAt: r.createdAt }, who(r))) }));
        }),
        postDiscussion: call((lessonId, body, parentId) => {
            const u = me(), ctx = lms.lessonContext(lessonId); requireCourseAccess(u.id, ctx.course.id);
            if (!String(body || '').trim()) throw new ApiError('INVALID', 'Write something first.');
            return db.insert('discussions', { courseId: ctx.course.id, lessonId, userId: u.id, parentId: parentId || null, body: String(body).trim().slice(0, 4000) });
        }),

        // ---- Profile & settings (protected fields are ignored) ----
        updateProfile: call(patch => {
            const u = me(), allowed = {};
            ['phone', 'bio', 'avatar'].forEach(k => { if (k in patch) allowed[k] = String(patch[k] || '').slice(0, k === 'avatar' ? 1500000 : 600); });
            if ('name' in patch && String(patch.name).trim().length >= 2) allowed.name = String(patch.name).trim().slice(0, 80);
            db.update('users', u.id, allowed);
            return { ok: true };
        }),
        updatePrefs: call(patch => { const u = me(); db.update('users', u.id, { prefs: Object.assign({}, u.prefs || {}, patch) }); return { ok: true }; }),
        changePassword: call((cur, next) => { const u = me(); const r = auth.changePassword(u.id, cur, next); if (r.error) throw new ApiError('INVALID', r.error); return r; }),

        // ---- Help & support ----
        tickets: call(() => db.where('support_tickets', { userId: me().id }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))),
        openTicket: call(data => { const u = me(); if (!String(data.subject || '').trim() || !String(data.body || '').trim()) throw new ApiError('INVALID', 'Add a subject and describe the problem.'); return engage.openTicket(u.id, data); }),
        replyTicket: call((id, body) => { const u = me(), t = db.get('support_tickets', id); if (!t || t.userId !== u.id) throw new ApiError('NOT_FOUND', 'Ticket not found.'); return engage.replyTicket(id, { by: 'student', name: u.name, body, status: 'open' }); }),

        // Search across the student's own courses, lessons and assignments
        search: call(q => {
            const u = me(); q = String(q || '').trim().toLowerCase(); if (q.length < 2) return [];
            const res = [];
            myEnrollments(u.id).forEach(e => {
                const c = db.get('courses', e.courseId);
                if (c.title.toLowerCase().includes(q)) res.push({ kind: 'Course', title: c.title, link: '/student/course/' + c.id });
                lms.flatLessons(c.id).forEach(l => { if (l.title.toLowerCase().includes(q)) res.push({ kind: 'Lesson', title: l.title, sub: c.title, link: '/student/learn/' + l.id }); });
            });
            assignmentRows(u.id).forEach(a => { if (a.title.toLowerCase().includes(q)) res.push({ kind: 'Assignment', title: a.title, sub: a.course, link: '/student/assignments/' + a.id }); });
            lms.listedCourses().filter(c => c.title.toLowerCase().includes(q) && !lms.enrollmentOf(u.id, c.id)).forEach(c => res.push({ kind: 'Browse', title: c.title, link: '/student/course/' + c.id }));
            return res.slice(0, 12);
        })
    };

    TOS.api = api;
})();
