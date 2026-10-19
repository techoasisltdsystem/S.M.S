// Staff API: the only interface the Staff Portal (/staff/*) uses.
//
// Every call checks, in order: signed in -> staff role -> account active -> the specific permission the
// administrator granted -> the course is assigned to this staff member. Role, permissions, department and
// status can never be changed through this API (privilege escalation is impossible from the portal).
// Re-implement these as server endpoints with the same checks for production.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const { db, lms, auth, engage, staff: ST } = TOS;
    const ApiError = TOS.api.ApiError;
    const out = v => v == null ? v : JSON.parse(JSON.stringify(v));
    const call = fn => (...args) => new Promise((res, rej) => { try { res(out(fn(...args))); } catch (e) { rej(e instanceof ApiError ? e : new ApiError(e.code || 'ERROR', e.message)); } });

    function me() {
        const s = auth.current();
        if (!s) { const p = auth.sessionProblem(); if (p && p !== 'none' && p !== 'deleted') throw new ApiError('ACCOUNT_' + p.toUpperCase(), 'Your staff account is not active.'); throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.'); }
        const u = db.get('users', s.id);
        if (u.role !== 'staff') throw new ApiError('FORBIDDEN', 'The Staff Portal is for approved staff accounts only.');
        return u;
    }
    function need(u, perm) { if (!ST.can(u, perm)) throw new ApiError('FORBIDDEN', `Your role doesn't include permission to ${ST.PERMISSIONS[perm][0].toLowerCase()}. Contact the school administration if you need it.`); }
    const myCourseIds = u => ST.assignedCourseIds(u.id);
    function ownCourse(u, courseId) {
        if (!db.get('courses', courseId)) throw new ApiError('NOT_FOUND', 'This course could not be found.');
        if (!myCourseIds(u).includes(courseId)) throw new ApiError('NO_ACCESS', 'This course is not assigned to you.');
        return db.get('courses', courseId);
    }
    const ownLesson = (u, lessonId) => { const ctx = lms.lessonContext(lessonId); if (!ctx || !ctx.course) throw new ApiError('NOT_FOUND', 'Lesson not found.'); ownCourse(u, ctx.course.id); return ctx; };
    const ownSection = (u, sectionId) => { const s = db.get('sections', sectionId); if (!s) throw new ApiError('NOT_FOUND', 'Section not found.'); ownCourse(u, s.courseId); return s; };
    const enrolledIn = ids => db.where('enrollments', e => ids.includes(e.courseId) && e.status !== 'cancelled');
    const studentRow = e => { const s = db.get('users', e.userId), c = db.get('courses', e.courseId), p = lms.progress(e.userId, e.courseId); return s && c ? { id: s.id, name: s.name, email: s.email, studentId: s.studentId, avatar: s.avatar || '', courseId: c.id, course: c.title, pct: p ? p.pct : 0, done: p ? p.done : 0, total: p ? p.total : 0, lastAccessAt: e.lastAccessAt, enrolledAt: e.enrolledAt, status: e.status } : null; };
    function submissionRows(ids) {
        return db.all('submissions').map(s => { const a = db.get('assignments', s.assignmentId), ctx = a && lms.lessonContext(a.lessonId); if (!ctx || !ctx.course || !ids.includes(ctx.course.id)) return null; const st = db.get('users', s.userId);
            return { id: s.id, assignmentId: a.id, title: a.title, maxScore: a.maxScore, courseId: ctx.course.id, course: ctx.course.title, student: st ? st.name : 'Student', studentId: s.userId, status: s.status, score: s.score, submittedAt: s.submittedAt, gradedAt: s.gradedAt }; }).filter(Boolean)
            .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    }

    const api = {
        me: call(() => {
            const u = me(), ins = ST.profileOf(u.id), app = u.applicationId && db.get('staff_applications', u.applicationId);
            return { id: u.id, name: u.name, email: u.email, phone: u.phone || '', avatar: u.avatar || '', bio: ins ? ins.bio : '', title: ins ? ins.title : '', department: u.department || '', staffRole: u.staffRole, roleLabel: (ST.ROLES[u.staffRole] || {}).label || 'Staff',
                permissions: u.permissions || [], status: u.status, createdAt: u.createdAt, approvedAt: u.approvedAt, lastLoginAt: u.lastLoginAt, mustChangePassword: !!u.mustChangePassword, prefs: u.prefs || {},
                courseCount: myCourseIds(u).length, application: app ? { submittedAt: app.submittedAt, subjects: app.subjects, expertise: app.expertise } : null };
        }),
        counts: call(() => { const u = me(); return { notifications: engage.unreadCount(u.id), messages: engage.unreadMessagesForStaff({ recipientUserId: u.id }), grading: ST.can(u, 'grade_students') ? submissionRows(myCourseIds(u)).filter(s => s.status !== 'graded').length : 0 }; }),

        dashboard: call(() => {
            const u = me(), ids = myCourseIds(u), enrs = enrolledIn(ids), rows = enrs.map(studentRow).filter(Boolean);
            const subs = ST.can(u, 'grade_students') ? submissionRows(ids) : [];
            const courses = ids.map(id => { const c = db.get('courses', id), r = rows.filter(x => x.courseId === id); return { id, title: c.title, thumbnail: c.thumbnail, status: c.status, students: r.length, avgProgress: r.length ? Math.round(r.reduce((a, x) => a + x.pct, 0) / r.length) : 0, lessons: lms.flatLessons(id, true).length }; });
            const now = Date.now();
            const events = db.where('calendar_events', e => (!e.courseId || ids.includes(e.courseId)) && new Date(e.endsAt || e.startsAt) >= now - 3600000).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 5).map(e => Object.assign({}, e, { course: e.courseId ? (db.get('courses', e.courseId) || {}).title : null }));
            const atRisk = rows.filter(r => r.pct < 100 && (!r.lastAccessAt || now - new Date(r.lastAccessAt) > 7 * 86400000)).slice(0, 5);
            return { stats: { courses: ids.length, students: new Set(rows.map(r => r.id)).size, toGrade: subs.filter(s => s.status !== 'graded').length, unreadMessages: engage.unreadMessagesForStaff({ recipientUserId: u.id }) },
                courses, events, recentSubmissions: subs.slice(0, 5), atRisk: ST.can(u, 'view_students') ? atRisk : [],
                notifications: db.where('notifications', { userId: u.id }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5) };
        }),

        // ---- Courses & lessons ----
        courses: call(() => { const u = me(); need(u, 'view_courses'); return myCourseIds(u).map(id => { const c = db.get('courses', id), m = lms.courseMeta(id, true), r = enrolledIn([id]).map(studentRow).filter(Boolean);
            return { id, title: c.title, thumbnail: c.thumbnail, status: c.status, category: lms.categoryName(c.categoryId), sections: m.sections, lessons: m.lessons, students: r.length, avgProgress: r.length ? Math.round(r.reduce((a, x) => a + x.pct, 0) / r.length) : 0, completed: r.filter(x => x.pct === 100).length }; }); }),
        course: call(courseId => {
            const u = me(); need(u, 'view_courses'); const c = ownCourse(u, courseId);
            const a = lms.courseAnalytics(courseId);
            return { id: c.id, title: c.title, slug: c.slug, status: c.status, shortDescription: c.shortDescription, thumbnail: c.thumbnail,
                stats: { students: a.enrollments, active: a.active, completionRate: a.completionRate, avgProgress: a.avgProgress },
                sections: db.ordered('sections', { courseId }).map(s => ({ id: s.id, title: s.title, status: s.status, lessons: db.ordered('lessons', { sectionId: s.id }).map(l => {
                    const f = a.funnel.find(x => x.lesson.id === l.id), v = lms.contentsOf(l.id).find(x => x.kind === 'video');
                    return { id: l.id, title: l.title, type: l.type, status: l.status, durationMin: l.durationMin, isPreview: l.isPreview, completionRate: f ? f.rate : 0, summary: l.summary, videoUrl: v ? v.url : '' }; }) })),
                can: { manage_lessons: ST.can(u, 'manage_lessons'), create_assignments: ST.can(u, 'create_assignments'), create_quizzes: ST.can(u, 'create_quizzes') } };
        }),
        lesson: call(lessonId => { const u = me(); need(u, 'view_courses'); const ctx = ownLesson(u, lessonId), l = ctx.lesson, cs = lms.contentsOf(l.id);
            return { id: l.id, title: l.title, type: l.type, status: l.status, summary: l.summary, body: l.body, durationMin: l.durationMin, isPreview: l.isPreview, sectionId: l.sectionId, courseId: ctx.course.id,
                videoUrl: (cs.find(x => x.kind === 'video') || {}).url || '', article: (cs.find(x => x.kind === 'article') || {}).body || '', externalUrl: (cs.find(x => x.kind === 'external') || {}).url || '', documentUrl: (cs.find(x => x.kind === 'document') || {}).url || '' }; }),
        addLesson: call((sectionId, d) => {
            const u = me(), s = ownSection(u, sectionId);
            const permFor = { assignment: 'create_assignments', quiz: 'create_quizzes' }[d.type] || 'manage_lessons';
            need(u, permFor);
            if (!String(d.title || '').trim()) throw new ApiError('INVALID', 'Give the lesson a title.');
            if (!['video', 'article', 'external', 'document'].includes(d.type)) throw new ApiError('INVALID', 'Use the assignment or quiz builder for those lesson types.');
            const l = lms.addLesson(s.id, { title: d.title.trim(), type: d.type, summary: d.summary || '', durationMin: +d.durationMin || 10, status: d.publish && ST.can(u, 'manage_lessons') ? 'published' : 'draft' });
            saveContent(l.id, d); return { id: l.id };
        }),
        updateLesson: call((lessonId, d) => {
            const u = me(); need(u, 'manage_lessons'); const ctx = ownLesson(u, lessonId);
            const patch = {}; ['title', 'summary', 'body'].forEach(k => { if (k in d) patch[k] = String(d[k] || ''); });
            if ('durationMin' in d) patch.durationMin = Math.max(0, +d.durationMin || 0);
            if ('status' in d && ['draft', 'published'].includes(d.status)) patch.status = d.status;
            if (patch.title === '') throw new ApiError('INVALID', 'The lesson needs a title.');
            db.update('lessons', ctx.lesson.id, patch); saveContent(ctx.lesson.id, d); return { ok: true };
        }),
        createAssignment: call((sectionId, d) => {
            const u = me(); need(u, 'create_assignments'); const s = ownSection(u, sectionId);
            if (!String(d.title || '').trim() || !String(d.instructions || '').trim()) throw new ApiError('INVALID', 'Add a title and instructions.');
            const l = lms.addLesson(s.id, { title: d.title.trim(), type: 'assignment', summary: d.summary || '', durationMin: +d.durationMin || 60, status: d.publish ? 'published' : 'draft' });
            const a = lms.assignmentOf(l.id);
            db.update('assignments', a.id, { title: d.title.trim(), instructions: d.instructions, maxScore: Math.max(1, +d.maxScore || 100), dueDays: d.dueDate ? null : Math.max(1, +d.dueDays || 7), dueDate: d.dueDate ? new Date(d.dueDate + 'T23:59:00').toISOString() : null, allowText: d.allowText !== false, allowFile: !!d.allowFile,
                rubric: (d.rubric || []).filter(r => String(r.criterion || '').trim()).map(r => ({ criterion: r.criterion.trim(), description: r.description || '', points: Math.max(0, +r.points || 0) })) });
            return { id: l.id };
        }),
        createQuiz: call((sectionId, d) => {
            const u = me(); need(u, 'create_quizzes'); const s = ownSection(u, sectionId);
            const qs = (d.questions || []).filter(q => String(q.prompt || '').trim());
            if (!String(d.title || '').trim()) throw new ApiError('INVALID', 'Give the quiz a title.');
            if (!qs.length) throw new ApiError('INVALID', 'Add at least one question.');
            qs.forEach((q, i) => { const opts = (q.options || []).filter(o => String(o.text || '').trim()); if (opts.length < 2 || !(q.correct || []).some(c => opts.find(o => o.id === c))) throw new ApiError('INVALID', `Question ${i + 1} needs at least two answers and a correct answer.`); });
            const l = lms.addLesson(s.id, { title: d.title.trim(), type: 'quiz', durationMin: +d.durationMin || 10, status: d.publish ? 'published' : 'draft' });
            const quiz = lms.quizOf(l.id);
            db.tx(() => {
                db.update('quizzes', quiz.id, { title: d.title.trim(), instructions: d.instructions || 'Answer every question, then submit.', passingScore: Math.min(100, Math.max(0, +d.passingScore || 70)), timeLimitMin: Math.max(0, +d.timeLimitMin || 0), maxAttempts: Math.max(0, +d.maxAttempts || 0) });
                qs.forEach((q, i) => { const opts = q.options.filter(o => String(o.text || '').trim()); db.insert('quiz_questions', { quizId: quiz.id, type: q.type, prompt: q.prompt.trim(), options: opts, correct: q.correct.filter(c => opts.find(o => o.id === c)), explanation: q.explanation || '', points: Math.max(1, +q.points || 1), order: i + 1 }); });
            });
            return { id: l.id };
        }),

        // ---- Students & grading ----
        students: call(courseId => { const u = me(); need(u, 'view_students'); const ids = courseId ? [ownCourse(u, courseId).id] : myCourseIds(u); return enrolledIn(ids).map(studentRow).filter(Boolean); }),
        student: call(studentId => {
            const u = me(); need(u, 'view_students');
            const ids = myCourseIds(u), enrs = db.where('enrollments', e => e.userId === studentId && ids.includes(e.courseId));
            if (!enrs.length) throw new ApiError('NO_ACCESS', 'This student is not enrolled in any of your courses.');
            const s = db.get('users', studentId);
            const quizIds = new Set(ids.flatMap(id => lms.flatLessons(id).filter(l => l.type === 'quiz').map(l => (lms.quizOf(l.id) || {}).id)));
            return { id: s.id, name: s.name, email: s.email, studentId: s.studentId, avatar: s.avatar || '',
                courses: enrs.map(e => { const p = lms.progress(studentId, e.courseId); return { id: e.courseId, title: db.get('courses', e.courseId).title, pct: p.pct, done: p.done, total: p.total, current: p.current ? p.current.title : null, lastAccessAt: e.lastAccessAt, sections: p.sections }; }),
                quizzes: db.where('quiz_attempts', a => a.userId === studentId && quizIds.has(a.quizId) && a.submittedAt).map(a => ({ title: (db.get('quizzes', a.quizId) || {}).title, percent: a.percent, passed: a.passed, at: a.submittedAt })),
                submissions: submissionRows(ids).filter(x => x.studentId === studentId) };
        }),
        submissions: call(() => { const u = me(); need(u, 'grade_students'); return submissionRows(myCourseIds(u)); }),
        submission: call(id => {
            const u = me(); need(u, 'grade_students'); const row = submissionRows(myCourseIds(u)).find(s => s.id === id);
            if (!row) throw new ApiError('NOT_FOUND', 'Submission not found in your courses.');
            const s = db.get('submissions', id), a = db.get('assignments', s.assignmentId);
            return Object.assign(row, { text: s.text, files: s.files || [], feedback: s.feedback, rubricScores: s.rubricScores || {}, rubric: a.rubric || [], instructions: a.instructions, late: s.status === 'late' });
        }),
        grade: call((id, d) => {
            const u = me(); need(u, 'grade_students');
            if (!submissionRows(myCourseIds(u)).find(s => s.id === id)) throw new ApiError('NOT_FOUND', 'Submission not found in your courses.');
            const a = db.get('assignments', db.get('submissions', id).assignmentId);
            const score = +d.score; if (!(score >= 0 && score <= a.maxScore)) throw new ApiError('INVALID', `Score must be between 0 and ${a.maxScore}.`);
            lms.gradeSubmission(id, { score, feedback: String(d.feedback || ''), rubricScores: d.rubricScores || {}, gradedBy: u.name });
            ST.audit('graded_submission', { userId: u.id, by: u.name, note: a.title });
            return { ok: true };
        }),
        quizResults: call(() => { const u = me(); need(u, 'view_courses'); const ids = myCourseIds(u);
            return ids.flatMap(id => lms.flatLessons(id, true).filter(l => l.type === 'quiz').map(l => { const q = lms.quizOf(l.id); if (!q) return null; const at = db.where('quiz_attempts', a => a.quizId === q.id && a.submittedAt);
                return { id: q.id, lessonId: l.id, title: q.title, course: db.get('courses', id).title, questions: lms.questionsOf(q.id).length, passingScore: q.passingScore, attempts: at.length, students: new Set(at.map(a => a.userId)).size, avg: at.length ? Math.round(at.reduce((s, a) => s + a.percent, 0) / at.length) : null, passRate: at.length ? Math.round(at.filter(a => a.passed).length / at.length * 100) : null, status: l.status }; }).filter(Boolean)); }),

        // ---- Messages: only conversations addressed to this staff member ----
        conversations: call(() => { const u = me(); return db.where('conversations', { recipientUserId: u.id }).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)).map(cv => { const st = db.get('users', cv.studentId), msgs = db.where('messages', { conversationId: cv.id }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), last = msgs[msgs.length - 1];
            return { id: cv.id, subject: cv.subject, with: st ? st.name : 'Student', studentId: cv.studentId, course: cv.courseId ? (db.get('courses', cv.courseId) || {}).title : null, lastMessageAt: cv.lastMessageAt, preview: last ? (last.senderId === u.id ? 'You: ' : '') + last.body : '', unread: msgs.filter(m => m.senderId === cv.studentId && !m.readAt).length }; }); }),
        conversation: call(id => { const u = me(), cv = db.get('conversations', id); if (!cv || cv.recipientUserId !== u.id) throw new ApiError('NOT_FOUND', 'Conversation not found.');
            engage.markConversationRead(id, 'staff'); const st = db.get('users', cv.studentId);
            return { id: cv.id, subject: cv.subject, with: st ? st.name : 'Student', course: cv.courseId ? (db.get('courses', cv.courseId) || {}).title : null, messages: db.where('messages', { conversationId: id }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(m => Object.assign({}, m, { mine: m.senderId !== cv.studentId })) }; }),
        reply: call((id, body, attachments) => { const u = me(); need(u, 'message_students'); const cv = db.get('conversations', id); if (!cv || cv.recipientUserId !== u.id) throw new ApiError('NOT_FOUND', 'Conversation not found.');
            if (!String(body || '').trim()) throw new ApiError('INVALID', 'Write a message first.'); return engage.sendMessage(id, { senderId: u.id, senderName: u.name, senderRole: 'instructor', body: String(body).trim(), attachments }); }),
        messageStudent: call((studentId, subject, body) => { const u = me(); need(u, 'message_students');
            if (!enrolledIn(myCourseIds(u)).some(e => e.userId === studentId)) throw new ApiError('NO_ACCESS', 'You can only message students in your courses.');
            if (!String(subject || '').trim() || !String(body || '').trim()) throw new ApiError('INVALID', 'Add a subject and a message.');
            return engage.staffStartConversation(studentId, { senderId: u.id, senderName: u.name, senderRole: 'instructor', subject: subject.trim(), body: body.trim() }); }),

        // ---- Schedule & announcements ----
        schedule: call(() => { const u = me(), ids = myCourseIds(u); return db.where('calendar_events', e => !e.courseId || ids.includes(e.courseId)).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).map(e => Object.assign({}, e, { course: e.courseId ? (db.get('courses', e.courseId) || {}).title : null, mine: !!e.courseId && ids.includes(e.courseId) })); }),
        addEvent: call(d => { const u = me(); need(u, 'manage_schedule'); ownCourse(u, d.courseId);
            if (!['class', 'exam', 'quiz', 'deadline'].includes(d.type)) throw new ApiError('INVALID', 'Choose an event type.');
            if (!String(d.title || '').trim() || !d.startsAt) throw new ApiError('INVALID', 'Add a title and start time.');
            const s = new Date(d.startsAt), e = d.endsAt ? new Date(d.endsAt) : s; if (e < s) throw new ApiError('INVALID', 'The end time is before the start time.');
            return db.insert('calendar_events', { title: d.title.trim(), type: d.type, courseId: d.courseId, startsAt: s.toISOString(), endsAt: e.toISOString(), allDay: false, location: d.location || 'Online · Live classroom', url: d.url || '', description: d.description || '', createdBy: u.id }); }),
        deleteEvent: call(id => { const u = me(); need(u, 'manage_schedule'); const ev = db.get('calendar_events', id); if (!ev || !ev.courseId) throw new ApiError('NO_ACCESS', 'You can only remove events for your own courses.'); ownCourse(u, ev.courseId); db.remove('calendar_events', id); return { ok: true }; }),
        announcements: call(() => { const u = me(), ids = myCourseIds(u); return db.where('announcements', a => !a.courseId || ids.includes(a.courseId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(a => Object.assign({}, a, { course: a.courseId ? (db.get('courses', a.courseId) || {}).title : null })); }),
        postAnnouncement: call(d => { const u = me(); need(u, 'post_announcements'); ownCourse(u, d.courseId);
            if (!String(d.title || '').trim() || !String(d.body || '').trim()) throw new ApiError('INVALID', 'Add a title and a message.');
            return db.insert('announcements', { courseId: d.courseId, title: d.title.trim(), body: d.body.trim(), authorName: u.name, authorId: u.id, important: false }); }),

        // ---- Notifications ----
        notifications: call(() => db.where('notifications', { userId: me().id }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))),
        markNotification: call((id, read) => { const u = me(), n = db.get('notifications', id); if (!n || n.userId !== u.id) throw new ApiError('NOT_FOUND', 'Notification not found.'); db.update('notifications', id, { readAt: read === false ? null : db.now() }); return { ok: true }; }),
        markAllNotifications: call(() => { const u = me(); db.tx(() => db.where('notifications', n => n.userId === u.id && !n.readAt).forEach(n => db.update('notifications', n.id, { readAt: db.now() }))); return { ok: true }; }),
        deleteNotification: call(id => { const u = me(), n = db.get('notifications', id); if (!n || n.userId !== u.id) throw new ApiError('NOT_FOUND', 'Notification not found.'); db.remove('notifications', id); return { ok: true }; }),

        // ---- Profile & account (role, permissions, department, name and email are admin-only) ----
        updateProfile: call(p => {
            const u = me(), patch = {};
            if ('phone' in p) patch.phone = String(p.phone || '').slice(0, 30);
            if ('avatar' in p) patch.avatar = String(p.avatar || '').slice(0, 1500000);
            db.update('users', u.id, patch);
            const ins = ST.profileOf(u.id);
            if (ins) db.update('instructors', ins.id, Object.assign({}, 'bio' in p ? { bio: String(p.bio || '').slice(0, 1200) } : {}, 'title' in p ? { title: String(p.title || '').slice(0, 80) } : {}, 'avatar' in p ? { avatar: patch.avatar } : {}));
            return { ok: true };
        }),
        updatePrefs: call(patch => { const u = me(); db.update('users', u.id, { prefs: Object.assign({}, u.prefs || {}, patch) }); return { ok: true }; }),
        changePassword: call((cur, next) => { const u = me(); const r = auth.changePassword(u.id, cur, next); if (r.error) throw new ApiError('INVALID', r.error); ST.audit('password_changed', { userId: u.id, by: u.name }); return r; }),

        search: call(q => {
            const u = me(); q = String(q || '').trim().toLowerCase(); if (q.length < 2) return [];
            const ids = myCourseIds(u), res = [];
            ids.forEach(id => { const c = db.get('courses', id); if (c.title.toLowerCase().includes(q)) res.push({ kind: 'Course', title: c.title, link: '/staff/courses/' + id }); lms.flatLessons(id, true).forEach(l => { if (l.title.toLowerCase().includes(q)) res.push({ kind: 'Lesson', title: l.title, sub: c.title, link: '/staff/courses/' + id }); }); });
            if (ST.can(u, 'view_students')) enrolledIn(ids).map(studentRow).filter(Boolean).forEach(s => { if ((s.name + ' ' + (s.studentId || '')).toLowerCase().includes(q)) res.push({ kind: 'Student', title: s.name, sub: s.course, link: '/staff/students/' + s.id }); });
            return res.filter((r, i, a) => a.findIndex(x => x.link === r.link && x.title === r.title) === i).slice(0, 12);
        })
    };
    function saveContent(lessonId, d) {
        const cs = lms.contentsOf(lessonId), pick = k => cs.find(x => x.kind === k);
        if (d.videoUrl != null && pick('video')) { const url = String(d.videoUrl).trim(); if (url && !/^https:\/\//i.test(url)) throw new ApiError('INVALID', 'Video links must start with https://'); const p = TOS.video.detect(url); db.update('contents', pick('video').id, { url, provider: p.id, ref: p.parse(url) || '', videoStatus: url ? 'ready' : 'draft' }); }
        if (d.article != null && pick('article')) db.update('contents', pick('article').id, { body: String(d.article) });
        if (d.externalUrl != null && pick('external')) db.update('contents', pick('external').id, { url: String(d.externalUrl).trim() });
        if (d.documentUrl != null && pick('document')) db.update('contents', pick('document').id, { url: String(d.documentUrl).trim() });
    }

    TOS.staffApi = api;
})();
