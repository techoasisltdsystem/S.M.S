// Tech Oasis LMS domain services: curriculum, authoring, progress, quizzes, assignments,
// certificates, commerce and analytics. All reads go through TOS.db relations.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const db = TOS.db;
    const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
    const DAY = 86400000;

    // ================= Catalog / curriculum =================
    const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
    function uniqueSlug(table, base, scope, excludeId) {
        const root = slugify(base); let s = root, n = 2;
        while (db.where(table, r => r.slug === s && r.id !== excludeId && (!scope || Object.keys(scope).every(k => r[k] === scope[k]))).length) s = root + '-' + n++;
        return s;
    }

    const category = id => db.get('categories', id);
    const categoryName = id => (category(id) || {}).name || 'Uncategorised';
    const courseBySlug = slug => db.first('courses', c => c.slug === slug || c.id === slug);

    function courseInstructors(courseId) {
        // Instructors whose staff account was archived/deleted (active === false) no longer show on courses
        return db.where('course_instructors', { courseId }).sort(byOrder).map(ci => db.get('instructors', ci.instructorId)).filter(i => i && i.active !== false);
    }
    const primaryInstructor = courseId => courseInstructors(courseId)[0] || null;
    function setPrimaryInstructor(courseId, instructorId) {
        db.tx(() => {
            const lead = db.first('course_instructors', { courseId, role: 'lead' });
            if (!instructorId) { if (lead) db.remove('course_instructors', lead.id); return; }
            if (lead) db.update('course_instructors', lead.id, { instructorId });
            else db.insert('course_instructors', { courseId, instructorId, role: 'lead', order: 0 });
        });
    }

    const isVisible = (row, preview) => preview || row.status === 'published';
    const sectionsOf = (courseId, preview) => db.where('sections', { courseId }).filter(s => isVisible(s, preview)).sort(byOrder);
    const lessonsOf = (sectionId, preview) => db.where('lessons', { sectionId }).filter(l => isVisible(l, preview)).sort(byOrder);

    // Course -> Sections -> Lessons, as the student (or previewing admin) sees it
    function tree(courseId, preview) {
        const course = db.get('courses', courseId); if (!course) return null;
        const sections = sectionsOf(courseId, preview).map(s => Object.assign({}, s, { lessons: lessonsOf(s.id, preview) }));
        return { course, sections };
    }
    function flatLessons(courseId, preview) {
        return sectionsOf(courseId, preview).flatMap(s => lessonsOf(s.id, preview));
    }
    function lessonContext(lessonId) {
        const lesson = db.get('lessons', lessonId); if (!lesson) return null;
        const section = db.get('sections', lesson.sectionId);
        const course = section && db.get('courses', section.courseId);
        return { lesson, section, course };
    }
    const contentsOf = lessonId => db.ordered('contents', { lessonId });
    const quizOf = lessonId => db.first('quizzes', { lessonId });
    const assignmentOf = lessonId => db.first('assignments', { lessonId });
    const questionsOf = quizId => db.ordered('quiz_questions', { quizId });
    const resourcesOf = ({ courseId, lessonId }) => db.where('resources', r => (courseId && r.courseId === courseId) || (lessonId && r.lessonId === lessonId));

    function rating(courseId) {
        const rs = db.where('reviews', r => r.courseId === courseId && r.status !== 'hidden');
        const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : 0;
        return { avg: Math.round(avg * 10) / 10, count: rs.length, reviews: rs };
    }

    function courseMeta(courseId, preview) {
        const lessons = flatLessons(courseId, preview);
        const durationMin = lessons.reduce((a, l) => a + (+l.durationMin || 0), 0);
        const course = db.get('courses', courseId);
        return {
            sections: sectionsOf(courseId, preview).length,
            lessons: lessons.length,
            durationMin,
            hours: course && course.estimatedHours ? +course.estimatedHours : Math.max(1, Math.round(durationMin / 60)),
            videos: lessons.filter(l => l.type === 'video').length,
            quizzes: lessons.filter(l => l.type === 'quiz').length,
            assignments: lessons.filter(l => l.type === 'assignment').length,
            enrollments: db.count('enrollments', { courseId }),
            rating: rating(courseId)
        };
    }
    const publishedCourses = () => db.where('courses', c => c.status === 'published' && c.visibility !== 'private');
    const listedCourses = () => publishedCourses().filter(c => c.visibility === 'public');

    // ================= Authoring =================
    function createCourse(data) {
        return db.tx(() => {
            const { instructorId } = data; delete data.instructorId;
            const course = db.insert('courses', Object.assign({
                title: 'Untitled course', shortDescription: '', description: '', thumbnail: '', categoryId: null, subcategoryId: null,
                level: 'Beginner', language: db.settings().courses.defaultLanguage, estimatedHours: null, price: db.settings().payments.defaultPrice,
                isFree: false, certificateEnabled: true, requirements: [], outcomes: [], audience: [], status: 'draft', visibility: 'public',
                discussionsEnabled: db.settings().courses.discussionsEnabled, sequential: db.settings().courses.sequentialByDefault, featured: false, publishedAt: null
            }, data));
            course.slug = uniqueSlug('courses', data.slug || course.title, null, course.id);
            if (instructorId) setPrimaryInstructor(course.id, instructorId);
            return course;
        });
    }

    function addSection(courseId, data) {
        return db.insert('sections', Object.assign({ courseId, title: 'New section', description: '', status: 'draft', order: db.nextOrder('sections', { courseId }) }, data));
    }

    // Creates a lesson plus the content record its type needs (video item, quiz, assignment...)
    function addLesson(sectionId, data) {
        return db.tx(() => {
            const sec = db.get('sections', sectionId);
            const type = data.type || 'video';
            const lesson = db.insert('lessons', Object.assign({
                sectionId, title: 'New lesson', summary: '', body: '', type, durationMin: type === 'quiz' ? 10 : type === 'assignment' ? 30 : 8,
                isPreview: false, status: 'draft', discussionsEnabled: true, order: db.nextOrder('lessons', { sectionId })
            }, data));
            lesson.slug = uniqueSlug('lessons', data.slug || lesson.title, { sectionId }, lesson.id);
            if (type === 'video') db.insert('contents', { lessonId: lesson.id, kind: 'video', order: 1, provider: 'youtube', url: '', ref: '', durationSec: 0, thumbnail: '', captions: [], transcript: '', videoStatus: 'draft' });
            if (type === 'article') db.insert('contents', { lessonId: lesson.id, kind: 'article', order: 1, body: '' });
            if (type === 'document') db.insert('contents', { lessonId: lesson.id, kind: 'document', order: 1, url: '', fileName: '', sizeBytes: 0 });
            if (type === 'external') db.insert('contents', { lessonId: lesson.id, kind: 'external', order: 1, url: '', label: 'Open resource', newTab: true });
            if (type === 'quiz') db.insert('quizzes', { lessonId: lesson.id, title: lesson.title, instructions: 'Answer every question, then submit.', passingScore: 70, timeLimitMin: 0, maxAttempts: 3, shuffle: false });
            if (type === 'assignment') db.insert('assignments', { lessonId: lesson.id, title: lesson.title, instructions: '', dueDays: 7, dueDate: null, maxScore: 100, allowFile: true, allowText: true, rubric: [] });
            if (sec) db.update('courses', sec.courseId, {});
            return lesson;
        });
    }

    // Deep copy helpers (keep relations, generate new IDs)
    function copyRow(table, row, patch) {
        const data = JSON.parse(JSON.stringify(row)); delete data.id; delete data.createdAt; delete data.updatedAt;
        return db.insert(table, Object.assign(data, patch));
    }
    function duplicateLesson(lessonId, toSectionId, keepOrder) {
        return db.tx(() => {
            const l = db.get('lessons', lessonId);
            const sectionId = toSectionId || l.sectionId;
            const copy = copyRow('lessons', l, { sectionId, title: toSectionId ? l.title : l.title + ' (copy)', status: toSectionId ? l.status : 'draft', order: keepOrder ? l.order : db.nextOrder('lessons', { sectionId }) });
            copy.slug = uniqueSlug('lessons', copy.title, { sectionId }, copy.id);
            contentsOf(l.id).forEach(c => copyRow('contents', c, { lessonId: copy.id }));
            const q = quizOf(l.id); if (q) { const nq = copyRow('quizzes', q, { lessonId: copy.id }); questionsOf(q.id).forEach(qq => copyRow('quiz_questions', qq, { quizId: nq.id })); }
            const a = assignmentOf(l.id); if (a) copyRow('assignments', a, { lessonId: copy.id });
            db.where('resources', { lessonId: l.id }).forEach(r => copyRow('resources', r, { lessonId: copy.id }));
            return copy;
        });
    }
    function duplicateSection(sectionId, toCourseId) {
        return db.tx(() => {
            const s = db.get('sections', sectionId);
            const courseId = toCourseId || s.courseId;
            const copy = copyRow('sections', s, { courseId, title: toCourseId ? s.title : s.title + ' (copy)', status: toCourseId ? s.status : 'draft', order: toCourseId ? s.order : db.nextOrder('sections', { courseId }) });
            db.ordered('lessons', { sectionId }).forEach(l => duplicateLesson(l.id, copy.id, true));
            return copy;
        });
    }
    function duplicateCourse(courseId) {
        return db.tx(() => {
            const c = db.get('courses', courseId);
            const copy = copyRow('courses', c, { title: c.title + ' (copy)', status: 'draft', publishedAt: null, featured: false });
            copy.slug = uniqueSlug('courses', copy.title, null, copy.id);
            db.where('course_instructors', { courseId }).forEach(ci => copyRow('course_instructors', ci, { courseId: copy.id }));
            db.ordered('sections', { courseId }).forEach(s => duplicateSection(s.id, copy.id));
            db.where('resources', { courseId }).forEach(r => copyRow('resources', r, { courseId: copy.id }));
            return copy;
        });
    }

    // Publishing checklist: blocking items must pass before a course goes live
    function publishChecklist(courseId) {
        const c = db.get('courses', courseId);
        const secs = db.where('sections', { courseId });
        const lessons = secs.flatMap(s => db.where('lessons', { sectionId: s.id }));
        const pubLessons = lessons.filter(l => l.status === 'published' && (db.get('sections', l.sectionId) || {}).status === 'published');
        const videoMissing = pubLessons.filter(l => l.type === 'video' && !(contentsOf(l.id).find(x => x.kind === 'video') || {}).url);
        const quizEmpty = pubLessons.filter(l => l.type === 'quiz' && !(quizOf(l.id) && questionsOf(quizOf(l.id).id).length));
        return [
            { ok: !!(c.title && c.title.trim()), label: 'Course title', block: true },
            { ok: !!(c.shortDescription && c.description), label: 'Short and full description', block: true },
            { ok: !!c.thumbnail, label: 'Course thumbnail', block: false },
            { ok: !!primaryInstructor(courseId), label: 'Instructor assigned', block: true },
            { ok: !!c.categoryId, label: 'Category selected', block: false },
            { ok: secs.some(s => s.status === 'published'), label: 'At least one published section', block: true },
            { ok: pubLessons.length > 0, label: 'At least one published lesson', block: true },
            { ok: !videoMissing.length, label: videoMissing.length ? `${videoMissing.length} published video lesson(s) without a video` : 'Every video lesson has a video', block: true },
            { ok: !quizEmpty.length, label: quizEmpty.length ? `${quizEmpty.length} published quiz(zes) without questions` : 'Every quiz has questions', block: true },
            { ok: (c.outcomes || []).length > 0, label: 'Learning outcomes ("What you will learn")', block: false }
        ];
    }

    // ================= Enrollment & progress =================
    const enrollmentOf = (userId, courseId) => userId ? db.first('enrollments', { userId, courseId }) : null;
    function enroll(userId, courseId, extra) {
        const ex = enrollmentOf(userId, courseId); if (ex) return ex;
        return db.insert('enrollments', Object.assign({ userId, courseId, status: 'active', enrolledAt: db.now(), completedAt: null, currentLessonId: null, lastAccessAt: db.now(), trialEndsAt: null, source: 'direct' }, extra));
    }
    const progressRow = (userId, lessonId) => db.first('lesson_progress', { userId, lessonId });
    const isComplete = (userId, lessonId) => (progressRow(userId, lessonId) || {}).status === 'completed';

    function progress(userId, courseId) {
        const t = tree(courseId, false);
        if (!t) return null;
        let done = 0, total = 0;
        const sections = t.sections.map(s => {
            const d = s.lessons.filter(l => isComplete(userId, l.id)).length;
            done += d; total += s.lessons.length;
            const pct = s.lessons.length ? Math.round(d / s.lessons.length * 100) : 0;
            const started = s.lessons.some(l => progressRow(userId, l.id));
            return { id: s.id, title: s.title, done: d, total: s.lessons.length, pct, status: pct === 100 ? 'complete' : (d || started) ? 'in_progress' : 'not_started' };
        });
        const lessons = t.sections.flatMap(s => s.lessons);
        const enr = enrollmentOf(userId, courseId);
        const next = lessons.find(l => !isComplete(userId, l.id)) || null;
        const current = (enr && enr.currentLessonId && lessons.find(l => l.id === enr.currentLessonId)) || next || lessons[0] || null;
        return { pct: total ? Math.round(done / total * 100) : 0, done, total, sections, next, current, lessons };
    }

    function touch(userId, courseId, lessonId) {
        const e = enrollmentOf(userId, courseId);
        if (e) db.update('enrollments', e.id, { currentLessonId: lessonId, lastAccessAt: db.now() });
        const p = progressRow(userId, lessonId);
        if (!p) db.insert('lesson_progress', { userId, lessonId, status: 'in_progress', videoPositionSec: 0, videoWatchedPct: 0, completedAt: null });
    }

    function setComplete(userId, lessonId, done) {
        db.upsert('lesson_progress', { userId, lessonId }, done ? { status: 'completed', completedAt: db.now() } : { status: 'in_progress', completedAt: null });
        const ctx = lessonContext(lessonId);
        if (ctx && ctx.course) {
            const e = enrollmentOf(userId, ctx.course.id), p = progress(userId, ctx.course.id);
            if (e) db.update('enrollments', e.id, p.pct === 100 ? { status: 'completed', completedAt: e.completedAt || db.now() } : (e.status === 'completed' ? { status: 'active', completedAt: null } : {}));
        }
    }

    // Admin action: clear a student's progress in one course (lessons, quiz attempts, submissions). Keeps the enrollment.
    function resetProgress(userId, courseId) {
        db.tx(() => {
            flatLessons(courseId, true).forEach(l => {
                db.where('lesson_progress', { userId, lessonId: l.id }).forEach(p => db.remove('lesson_progress', p.id));
                const q = quizOf(l.id); if (q) db.where('quiz_attempts', { userId, quizId: q.id }).forEach(a => db.remove('quiz_attempts', a.id));
                const a = assignmentOf(l.id); if (a) db.where('submissions', { userId, assignmentId: a.id }).forEach(s => db.remove('submissions', s.id));
            });
            const e = enrollmentOf(userId, courseId);
            if (e) db.update('enrollments', e.id, { currentLessonId: null, completedAt: null, status: e.status === 'completed' ? 'active' : e.status });
        });
    }

    function saveVideoProgress(userId, lessonId, pos, dur) {
        const pct = dur ? Math.min(100, Math.round(pos / dur * 100)) : 0;
        const p = progressRow(userId, lessonId);
        const watched = Math.max(pct, (p && p.videoWatchedPct) || 0);
        // Watch time counts forward playback only (seeking ahead doesn't add time)
        const delta = pos - ((p && p.videoPositionSec) || 0);
        const watchSeconds = ((p && p.watchSeconds) || 0) + (delta > 0 && delta <= 30 ? delta : 0);
        db.upsert('lesson_progress', { userId, lessonId }, { videoPositionSec: Math.round(pos), videoWatchedPct: watched, watchSeconds: Math.round(watchSeconds), lastWatchedAt: db.now(), status: (p && p.status === 'completed') ? 'completed' : 'in_progress' });
        if (watched >= db.settings().courses.videoCompleteAt && !isComplete(userId, lessonId)) { setComplete(userId, lessonId, true); return true; }
        return false;
    }

    // Can this user open this lesson? (preview lessons are open to all; sequential courses gate on order)
    function lessonAccess(userId, lessonId, preview) {
        if (preview) return { ok: true };
        const ctx = lessonContext(lessonId); if (!ctx) return { ok: false, reason: 'missing' };
        const enr = enrollmentOf(userId, ctx.course.id);
        if (!enr || enr.status === 'cancelled') return ctx.lesson.isPreview ? { ok: true, previewOnly: true } : { ok: false, reason: 'enroll' };
        const pay = paymentState(enr);
        if (pay === 'overdue' || pay === 'pending') return ctx.lesson.isPreview ? { ok: true } : { ok: false, reason: 'payment' };
        if (ctx.course.sequential) {
            const lessons = flatLessons(ctx.course.id), i = lessons.findIndex(l => l.id === lessonId);
            if (i > 0 && !lessons.slice(0, i).every(l => isComplete(userId, l.id))) return { ok: false, reason: 'sequential' };
        }
        return { ok: true };
    }

    // ================= Quizzes =================
    const attemptsOf = (userId, quizId) => db.where('quiz_attempts', a => a.userId === userId && a.quizId === quizId && a.submittedAt).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const bestAttempt = (userId, quizId) => attemptsOf(userId, quizId).sort((a, b) => b.percent - a.percent)[0] || null;
    function attemptsLeft(userId, quiz) { return quiz.maxAttempts ? Math.max(0, quiz.maxAttempts - attemptsOf(userId, quiz.id).length) : Infinity; }

    function gradeQuiz(quizId, answers) {
        const quiz = db.get('quizzes', quizId), qs = questionsOf(quizId);
        let score = 0, max = 0;
        const results = qs.map(q => {
            const pts = +q.points || 1; max += pts;
            const given = (answers[q.id] || []).slice().sort(), correct = (q.correct || []).slice().sort();
            const ok = given.length === correct.length && given.every((v, i) => v === correct[i]);
            if (ok) score += pts;
            return { questionId: q.id, ok, given, correct, points: ok ? pts : 0 };
        });
        const percent = max ? Math.round(score / max * 100) : 0;
        return { score, max, percent, passed: percent >= (+quiz.passingScore || 0), results };
    }
    function submitQuiz(userId, quizId, answers, startedAt) {
        const g = gradeQuiz(quizId, answers);
        const attempt = db.insert('quiz_attempts', { quizId, userId, answers, startedAt: startedAt || db.now(), submittedAt: db.now(), score: g.score, maxScore: g.max, percent: g.percent, passed: g.passed });
        if (g.passed) setComplete(userId, db.get('quizzes', quizId).lessonId, true);
        return Object.assign({ attempt }, g);
    }

    // ================= Assignments =================
    const submissionOf = (userId, assignmentId) => db.first('submissions', { userId, assignmentId });
    function assignmentDue(assignment, userId) {
        if (assignment.dueDate) return assignment.dueDate;
        const ctx = lessonContext(assignment.lessonId); const e = ctx && enrollmentOf(userId, ctx.course.id);
        return e && assignment.dueDays ? new Date(new Date(e.enrolledAt).getTime() + assignment.dueDays * DAY).toISOString() : null;
    }
    function submitAssignment(userId, assignmentId, { text, files }) {
        const a = db.get('assignments', assignmentId), due = assignmentDue(a, userId);
        const late = due && Date.now() > new Date(due).getTime();
        const sub = db.upsert('submissions', { userId, assignmentId }, { text: text || '', files: files || [], submittedAt: db.now(), status: late ? 'late' : 'submitted', score: null, feedback: '', rubricScores: {}, gradedAt: null });
        setComplete(userId, a.lessonId, true);
        return sub;
    }
    function gradeSubmission(submissionId, { score, feedback, rubricScores, gradedBy }) {
        return db.update('submissions', submissionId, { score: +score, feedback: feedback || '', rubricScores: rubricScores || {}, status: 'graded', gradedAt: db.now(), gradedBy: gradedBy || 'Admin' });
    }

    // ================= Certificates =================
    function eligibility(userId, courseId) {
        const s = db.settings().certificates, course = db.get('courses', courseId);
        const p = progress(userId, courseId);
        const lessons = p ? p.lessons : [];
        const quizzes = lessons.filter(l => l.type === 'quiz').map(l => quizOf(l.id)).filter(Boolean);
        const asgs = lessons.filter(l => l.type === 'assignment').map(l => assignmentOf(l.id)).filter(Boolean);
        const checks = [
            { label: `Complete ${s.minLessonPct}% of lessons`, ok: !!p && p.pct >= s.minLessonPct, detail: p ? `${p.done}/${p.total} lessons (${p.pct}%)` : '' }
        ];
        if (s.requireQuizPass && quizzes.length) {
            const passed = quizzes.filter(q => attemptsOf(userId, q.id).some(a => a.passed)).length;
            checks.push({ label: 'Pass every graded quiz', ok: passed === quizzes.length, detail: `${passed}/${quizzes.length} passed` });
        }
        if (s.requireAssignments && asgs.length) {
            const okA = asgs.filter(a => { const sub = submissionOf(userId, a.id); return sub && sub.status === 'graded' && sub.score / (a.maxScore || 100) * 100 >= s.minAssignmentPct; }).length;
            checks.push({ label: `Assignments graded at ${s.minAssignmentPct}% or higher`, ok: okA === asgs.length, detail: `${okA}/${asgs.length} graded and passed` });
        }
        const enabled = s.enabled && course && course.certificateEnabled;
        return { enabled, eligible: enabled && checks.every(c => c.ok), checks };
    }
    const certificateOf = (userId, courseId) => db.first('certificates', c => c.userId === userId && c.courseId === courseId && !c.revoked);
    function issueCertificate(userId, courseId, force) {
        const ex = certificateOf(userId, courseId); if (ex) return ex;
        if (!force && !eligibility(userId, courseId).eligible) return null;
        const user = db.get('users', userId), course = db.get('courses', courseId), ins = primaryInstructor(courseId), st = db.settings();
        let code; do { code = `${st.certificates.prefix || 'TOS'}-${new Date().getFullYear()}-${Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')}`; } while (db.first('certificates', { code }));
        // Snapshot fields are intentional: an issued certificate must not change if the course is renamed later.
        return db.insert('certificates', { code, userId, courseId, issuedAt: db.now(), studentName: user.name, courseTitle: course.title, instructorName: ins ? ins.name : '', schoolName: st.school.name, hours: courseMeta(courseId).hours, revoked: false, revokedReason: '' });
    }
    const certificateByCode = code => db.first('certificates', c => c.code.toUpperCase() === String(code || '').trim().toUpperCase());
    const verifyUrl = code => db.siteUrl('/verify.html?code=' + encodeURIComponent(code));

    // ================= Commerce =================
    const priceOf = c => c.isFree ? 0 : +c.price || 0;
    function findCoupon(code, courseId) {
        if (!code) return { coupon: null };
        const c = db.first('coupons', x => x.code.toUpperCase() === code.trim().toUpperCase());
        if (!c || !c.active) return { error: 'That coupon code is not valid.' };
        if (c.expiresAt && new Date(c.expiresAt) < new Date()) return { error: 'That coupon has expired.' };
        if (c.maxUses && (c.used || 0) >= c.maxUses) return { error: 'That coupon has been fully redeemed.' };
        if (c.courseId && c.courseId !== courseId) return { error: 'That coupon does not apply to this course.' };
        return { coupon: c };
    }
    function quote(courseId, couponCode) {
        const course = db.get('courses', courseId), subtotal = priceOf(course);
        const { coupon, error } = findCoupon(couponCode, courseId);
        const discount = coupon ? Math.min(subtotal, coupon.type === 'percent' ? subtotal * coupon.value / 100 : +coupon.value) : 0;
        return { subtotal, discount: Math.round(discount * 100) / 100, total: Math.max(0, Math.round((subtotal - discount) * 100) / 100), coupon, error };
    }
    // No payment gateway is integrated yet. Until a provider plus a server-side webhook exist, nothing may be shown as "paid" by the
    // browser. Admins can still record a payment received outside the site (Admin → Orders → Mark paid).
    const onlinePayments = () => false;

    // Creates the order and the enrollment. Paid courses start as a trial until the order is paid.
    function checkout(userId, courseId, couponCode) {
        return db.tx(() => {
            const q = quote(courseId, couponCode); if (q.error) return { error: q.error };
            const st = db.settings().payments;
            const order = db.insert('orders', { userId, couponId: q.coupon ? q.coupon.id : null, subtotal: q.subtotal, discount: q.discount, total: q.total, currency: st.currency, status: q.total === 0 ? 'paid' : 'pending', provider: st.provider, paidAt: q.total === 0 ? db.now() : null });
            db.insert('order_items', { orderId: order.id, courseId, price: q.subtotal });
            if (q.coupon) db.update('coupons', q.coupon.id, { used: (q.coupon.used || 0) + 1 });
            const trial = q.total > 0 && st.trialDays > 0;
            // Without a trial, a paid order stays pending and lessons unlock once it is paid (see paymentState)
            const enr = enroll(userId, courseId, { status: trial ? 'trial' : 'active', trialEndsAt: trial ? new Date(Date.now() + st.trialDays * DAY).toISOString() : null, orderId: order.id, source: 'checkout' });
            return { order, enrollment: enr, quote: q };
        });
    }
    function markOrderPaid(orderId, provider, providerRef) {
        return db.tx(() => {
            const o = db.update('orders', orderId, { status: 'paid', paidAt: db.now() });
            db.insert('payments', { orderId, amount: o.total, currency: o.currency, provider: provider || o.provider || 'manual', providerRef: providerRef || '', status: 'succeeded' });
            db.where('order_items', { orderId }).forEach(it => { const e = enrollmentOf(o.userId, it.courseId); if (e && e.status === 'trial') db.update('enrollments', e.id, { status: 'active' }); });
            return o;
        });
    }
    function refundOrder(orderId) {
        return db.tx(() => {
            const o = db.update('orders', orderId, { status: 'refunded' });
            db.insert('payments', { orderId, amount: -o.total, currency: o.currency, provider: o.provider || 'manual', providerRef: '', status: 'refunded' });
            db.where('order_items', { orderId }).forEach(it => { const e = enrollmentOf(o.userId, it.courseId); if (e) db.update('enrollments', e.id, { status: 'cancelled' }); });
            return o;
        });
    }
    // 'free' | 'paid' | 'trial' | 'overdue' | 'pending'
    function paymentState(enr) {
        const course = db.get('courses', enr.courseId);
        if (!course || priceOf(course) === 0) return 'free';
        const order = enr.orderId && db.get('orders', enr.orderId);
        if (!order) return enr.source === 'admin' ? 'paid' : 'pending';
        if (order.status === 'paid') return 'paid';
        if (!enr.trialEndsAt) return 'pending';
        return new Date(enr.trialEndsAt) > new Date() ? 'trial' : 'overdue';
    }

    // ================= Analytics =================
    function courseAnalytics(courseId) {
        const enrs = db.where('enrollments', { courseId });
        const lessons = flatLessons(courseId);
        const progresses = enrs.map(e => progress(e.userId, courseId));
        const active = enrs.filter(e => e.lastAccessAt && Date.now() - new Date(e.lastAccessAt) < 14 * DAY).length;
        const completed = enrs.filter(e => e.status === 'completed').length;
        const funnel = lessons.map(l => {
            const n = db.where('lesson_progress', p => p.lessonId === l.id && p.status === 'completed' && enrs.some(e => e.userId === p.userId)).length;
            const views = db.where('lesson_progress', p => p.lessonId === l.id && enrs.some(e => e.userId === p.userId)).length;
            return { lesson: l, completed: n, views, rate: enrs.length ? Math.round(n / enrs.length * 100) : 0 };
        });
        let dropOff = null, worst = 0;
        funnel.forEach((f, i) => { if (i) { const drop = funnel[i - 1].rate - f.rate; if (drop > worst) { worst = drop; dropOff = { lesson: f.lesson, drop }; } } });
        const quizzes = lessons.filter(l => l.type === 'quiz').map(l => quizOf(l.id)).filter(Boolean).map(q => {
            const at = db.where('quiz_attempts', a => a.quizId === q.id && a.submittedAt);
            return { quiz: q, attempts: at.length, avg: at.length ? Math.round(at.reduce((a, x) => a + x.percent, 0) / at.length) : 0, passRate: at.length ? Math.round(at.filter(a => a.passed).length / at.length * 100) : 0 };
        });
        const assignments = lessons.filter(l => l.type === 'assignment').map(l => assignmentOf(l.id)).filter(Boolean).map(a => {
            const subs = db.where('submissions', { assignmentId: a.id }), graded = subs.filter(s => s.status === 'graded');
            return { assignment: a, submitted: subs.length, graded: graded.length, avg: graded.length ? Math.round(graded.reduce((x, s) => x + s.score / (a.maxScore || 100) * 100, 0) / graded.length) : 0 };
        });
        const revenue = db.where('order_items', { courseId }).reduce((sum, it) => { const o = db.get('orders', it.orderId); return sum + (o && o.status === 'paid' ? o.total : 0); }, 0);
        const r = rating(courseId), dist = [5, 4, 3, 2, 1].map(n => ({ stars: n, count: r.reviews.filter(x => x.rating === n).length }));
        return {
            enrollments: enrs.length, active, completed, completionRate: enrs.length ? Math.round(completed / enrs.length * 100) : 0,
            avgProgress: progresses.length ? Math.round(progresses.reduce((a, p) => a + (p ? p.pct : 0), 0) / progresses.length) : 0,
            lessonCompletionRate: funnel.length ? Math.round(funnel.reduce((a, f) => a + f.rate, 0) / funnel.length) : 0,
            funnel, dropOff, quizzes, assignments, revenue, rating: r, ratingDist: dist,
            popular: funnel.slice().sort((a, b) => b.views - a.views).slice(0, 5)
        };
    }

    // ================= Legacy adapters (staff hub in index.html still reads these shapes) =================
    function legacyCourses() {
        return db.where('courses', c => c.status !== 'archived').map(c => {
            const ins = primaryInstructor(c.id);
            return { id: c.id, slug: c.slug, title: c.title, category: categoryName(c.categoryId), level: c.level, instructor: ins ? ins.name : 'Tech Oasis Faculty', desc: c.shortDescription, syllabus: sectionsOf(c.id).map(s => s.title) };
        });
    }
    function legacyStudents() {
        return db.all('enrollments').map(e => {
            const u = db.get('users', e.userId), c = db.get('courses', e.courseId); if (!u || !c) return null;
            const ps = paymentState(e), p = progress(u.id, c.id);
            const status = ps === 'paid' ? 'Paid' : ps === 'free' ? 'Enrolled (free)' : ps === 'trial' ? 'Active Trial (fee pending)' : ps === 'overdue' ? 'Trial Expired' : 'Payment pending';
            return { id: e.id, name: u.name, email: u.email, course: c.title, courseId: c.id, card: '—', status, owing: ps === 'overdue', trialEnd: e.trialEndsAt || e.enrolledAt, progress: p ? p.pct : 0 };
        }).filter(Boolean);
    }

    TOS.lms = {
        slugify, uniqueSlug, category, categoryName, courseBySlug, courseInstructors, primaryInstructor, setPrimaryInstructor,
        tree, flatLessons, lessonContext, contentsOf, quizOf, assignmentOf, questionsOf, resourcesOf, rating, courseMeta, publishedCourses, listedCourses,
        createCourse, addSection, addLesson, duplicateLesson, duplicateSection, duplicateCourse, publishChecklist,
        enrollmentOf, enroll, progress, progressRow, isComplete, touch, setComplete, saveVideoProgress, resetProgress, lessonAccess,
        attemptsOf, bestAttempt, attemptsLeft, gradeQuiz, submitQuiz,
        submissionOf, assignmentDue, submitAssignment, gradeSubmission,
        eligibility, certificateOf, issueCertificate, certificateByCode, verifyUrl,
        priceOf, quote, checkout, onlinePayments, markOrderPaid, refundOrder, paymentState, findCoupon,
        courseAnalytics, legacyCourses, legacyStudents
    };
})();
