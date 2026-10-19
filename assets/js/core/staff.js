// Staff lifecycle: application -> admin review -> staff account -> permissions.
//
// Three separate concepts:
//   STAFF APPLICATION  staff_applications row (status: pending | under_review | approved | rejected | withdrawn)
//   STAFF ACCOUNT      users row with role 'staff' (status: active | suspended | banned | archived | deleted),
//                      created ONLY when an administrator approves the application, and linked to it (applicationId)
//   STAFF PERMISSIONS  permissions[] on the account, chosen by the administrator (applicants never pick their role)
//
// In this browser build these functions stand in for server endpoints; in production every one of them must
// run on the server with the same checks (see db/schema.sql for the tables and RLS notes).
(function () {
    const TOS = window.TOS = window.TOS || {};
    const db = TOS.db, lms = TOS.lms, C = TOS.crypto;
    const DAY = 86400000;

    // ---------------- Catalogs ----------------
    const PERMISSIONS = {
        view_courses: ['View assigned courses', 'See the curriculum and statistics of courses assigned to them'],
        manage_lessons: ['Manage assigned lessons', 'Add, edit and publish lessons in assigned courses'],
        create_assignments: ['Create assignments', 'Add assignments to assigned courses'],
        create_quizzes: ['Create quizzes', 'Add quizzes to assigned courses'],
        grade_students: ['Grade students', 'Review and grade submissions in assigned courses'],
        view_students: ['View assigned students', 'See progress of students in assigned courses'],
        message_students: ['Message students', 'Reply to and start conversations with their students'],
        manage_schedule: ['Manage class schedule', 'Add live classes and exams to assigned courses'],
        post_announcements: ['Post course announcements', 'Publish announcements to students in assigned courses']
    };
    const ROLES = {
        instructor: { label: 'Instructor', permissions: ['view_courses', 'manage_lessons', 'create_assignments', 'create_quizzes', 'grade_students', 'view_students', 'message_students', 'manage_schedule', 'post_announcements'] },
        teaching_assistant: { label: 'Teaching Assistant', permissions: ['view_courses', 'grade_students', 'view_students', 'message_students'] },
        content_editor: { label: 'Content Editor', permissions: ['view_courses', 'manage_lessons', 'create_assignments', 'create_quizzes'] },
        coordinator: { label: 'Program Coordinator', permissions: ['view_courses', 'view_students', 'message_students', 'manage_schedule', 'post_announcements'] }
    };
    const DEPARTMENTS = ['Development', 'Design', 'AI & Data', 'Security & Cloud', 'Business & Marketing', 'Student Services'];
    const APP_STATUS = { pending: 'Pending', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' };
    const ACCOUNT_STATUS = { active: 'Active', suspended: 'Suspended', banned: 'Banned', archived: 'Archived', deleted: 'Deleted' };
    const OPEN = ['pending', 'under_review'];

    const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
    const lower = s => String(s || '').trim().toLowerCase();
    const link = path => db.siteUrl(path);
    const school = () => db.settings().school;

    // ---------------- Email outbox ----------------
    // Emails are queued here. Connect an email provider to deliver them; until then admins can see them in the CMS.
    function queueEmail({ to, subject, body, kind, related }) {
        return db.insert('email_outbox', { to: lower(to), subject, body, kind: kind || 'general', related: related || null, status: 'queued' });
    }
    function audit(action, { userId, applicationId, by, note }) {
        return db.insert('staff_audit', { action, userId: userId || null, applicationId: applicationId || null, by: by || 'Administrator', note: note || '' });
    }
    const historyEntry = (action, by, note) => ({ at: db.now(), action, by: by || 'Administrator', note: note || '' });

    // ---------------- Applications (public) ----------------
    // Why can't this email apply? null when it can.
    function applyBlock(email) {
        email = lower(email);
        const u = db.first('users', x => x.email === email);
        if (u && u.status === 'banned') return "This email can't be used for a new application. Please contact the school administration.";
        if (u) return 'An account already exists for this email. Sign in instead, or contact the school administration.';
        if (db.first('staff_applications', a => a.email === email && (OPEN.includes(a.status) || a.status === 'approved'))) return 'An application with this email is already in progress. Check its status instead.';
        return null;
    }
    function submitApplication(d) {
        const email = lower(d.email);
        const required = ['firstName', 'lastName', 'email', 'phone', 'location', 'expertise', 'qualifications', 'education', 'bio', 'availability'];
        const missing = required.filter(k => !String(d[k] || '').trim());
        if (missing.length) fail('INVALID', 'Please complete every required field.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('INVALID', 'Enter a valid email address.');
        if (!(d.subjects || []).length) fail('INVALID', 'Choose at least one subject you want to teach.');
        if (String(d.password || '').length < 8) fail('INVALID', 'Use at least 8 characters for your password.');
        if (d.password !== d.confirmPassword) fail('INVALID', 'The passwords do not match.');
        if (!(d.documents || []).some(x => x.kind === 'cv')) fail('INVALID', 'Attach your CV or resume.');
        const block = applyBlock(email); if (block) fail('DUPLICATE', block);
        const token = C.token();
        const app = db.insert('staff_applications', {
            firstName: d.firstName.trim(), lastName: d.lastName.trim(), email, phone: d.phone, photo: d.photo || '', dateOfBirth: d.dateOfBirth || null, location: d.location,
            expertise: d.expertise, subjects: d.subjects, qualifications: d.qualifications, education: d.education, yearsExperience: +d.yearsExperience || 0,
            previousTeaching: d.previousTeaching || '', bio: d.bio, courseIds: d.courseIds || [], teachingLevel: d.teachingLevel || '', teachingExperience: d.teachingExperience || '',
            teachingMethod: d.teachingMethod || '', availability: d.availability, documents: d.documents || [],
            passwordHash: C.hashPassword(d.password),               // the plain password is never stored
            emailVerified: false, verifyTokenHash: C.hashToken(token), status: 'pending', staffUserId: null,
            history: [historyEntry('Application submitted', 'Applicant')], adminNotes: [], messages: [], rejectionReason: '', submittedAt: db.now()
        });
        queueEmail({ to: email, kind: 'verify_email', related: app.id, subject: 'Verify your email for your Tech Oasis teaching application', body: `Hi ${app.firstName},\n\nThanks for applying to teach at ${school().name}. Please confirm your email address:\n${link('/staff/verify-email?token=' + token)}\n\nYour application is now pending review.` });
        return { id: app.id, email };
    }
    function verifyEmail(token) {
        const app = token && db.first('staff_applications', a => a.verifyTokenHash === C.hashToken(token));
        if (!app) fail('INVALID', 'This verification link is invalid or has already been used.');
        db.update('staff_applications', app.id, { emailVerified: true, verifiedAt: db.now(), verifyTokenHash: null, history: app.history.concat([historyEntry('Email verified', 'Applicant')]) });
        return { email: app.email };
    }
    // The applicant proves who they are with the email + password they chose
    function applicationByCredentials(email, password) {
        email = lower(email);
        const apps = db.where('staff_applications', a => a.email === email).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        return apps.find(a => C.verifyPassword(password, a.passwordHash)) || null;
    }
    // What the applicant may see: never admin notes
    const applicantView = a => ({ id: a.id, name: a.firstName + ' ' + a.lastName, email: a.email, status: a.status, statusLabel: APP_STATUS[a.status], submittedAt: a.submittedAt, emailVerified: a.emailVerified,
        subjects: a.subjects, messages: a.messages, rejectionReason: a.status === 'rejected' ? a.rejectionReason : '', infoRequested: !!a.infoRequested });
    function withdraw(email, password) {
        const a = applicationByCredentials(email, password); if (!a) fail('AUTH', 'Incorrect email or password.');
        if (!OPEN.includes(a.status)) fail('INVALID', 'Only applications that are still being reviewed can be withdrawn.');
        db.update('staff_applications', a.id, { status: 'withdrawn', history: a.history.concat([historyEntry('Withdrawn by applicant', 'Applicant')]) });
        return applicantView(db.get('staff_applications', a.id));
    }
    function applicantReply(email, password, body, documents) {
        const a = applicationByCredentials(email, password); if (!a) fail('AUTH', 'Incorrect email or password.');
        if (!OPEN.includes(a.status)) fail('INVALID', 'This application is no longer open.');
        if (!String(body || '').trim() && !(documents || []).length) fail('INVALID', 'Write a reply or attach a document.');
        db.update('staff_applications', a.id, { infoRequested: false, messages: a.messages.concat([{ from: 'applicant', body: String(body || '').trim(), at: db.now() }]), documents: a.documents.concat(documents || []),
            history: a.history.concat([historyEntry('Applicant sent more information', 'Applicant')]) });
        return applicantView(db.get('staff_applications', a.id));
    }

    // ---------------- Applications (admin) ----------------
    const getApp = id => db.get('staff_applications', id) || fail('NOT_FOUND', 'Application not found.');
    function setApplicationStatus(id, status, note) {
        const a = getApp(id);
        if (!APP_STATUS[status] || status === 'approved') fail('INVALID', 'Use Approve to approve an application.');
        if (a.status === 'approved') fail('INVALID', 'This application is already approved. Manage the staff account instead.');
        db.update('staff_applications', id, { status, history: a.history.concat([historyEntry('Status changed to ' + APP_STATUS[status], 'Administrator', note)]) });
        if (status === 'under_review' && a.status === 'pending') queueEmail({ to: a.email, kind: 'application_review', related: id, subject: 'Your teaching application is under review', body: `Hi ${a.firstName},\n\nAn administrator has started reviewing your application. We'll email you when a decision is made.` });
        audit('application_' + status, { applicationId: id, note });
    }
    function addAdminNote(id, note) {
        const a = getApp(id); if (!String(note || '').trim()) return;
        db.update('staff_applications', id, { adminNotes: a.adminNotes.concat([{ at: db.now(), by: 'Administrator', note: note.trim() }]) });
    }
    function requestInfo(id, message) {
        const a = getApp(id); if (!OPEN.includes(a.status)) fail('INVALID', 'Only open applications can be asked for more information.');
        if (!String(message || '').trim()) fail('INVALID', 'Write what you need from the applicant.');
        db.update('staff_applications', id, { status: 'under_review', infoRequested: true, messages: a.messages.concat([{ from: 'school', body: message.trim(), at: db.now() }]), history: a.history.concat([historyEntry('More information requested', 'Administrator')]) });
        queueEmail({ to: a.email, kind: 'application_info', related: id, subject: 'We need a little more information about your teaching application', body: `Hi ${a.firstName},\n\n${message.trim()}\n\nReply from your application status page: ${link('/staff/application')}` });
        audit('application_info_requested', { applicationId: id });
    }
    function reject(id, { reason, internalNote }) {
        const a = getApp(id); if (!OPEN.includes(a.status)) fail('INVALID', 'Only open applications can be rejected.');
        db.tx(() => {
            db.update('staff_applications', id, { status: 'rejected', rejectionReason: String(reason || '').trim(), decidedAt: db.now(), history: a.history.concat([historyEntry('Application rejected', 'Administrator')]) });
            if (internalNote) addAdminNote(id, internalNote);
            // Only the optional public reason is shared, never internal notes
            queueEmail({ to: a.email, kind: 'application_rejected', related: id, subject: 'Your Tech Oasis School teaching application', body: `Hi ${a.firstName},\n\nThank you for applying to teach at ${school().name}. After careful review, we are unable to offer you a teaching role at this time.${reason ? '\n\n' + reason.trim() : ''}\n\nIf you have questions, contact ${school().email}.` });
            audit('application_rejected', { applicationId: id, note: internalNote });
        });
    }
    // Approval creates the staff account from the application. The applicant's password hash moves across;
    // the plain password never existed in storage and is never sent by email.
    function approve(id, { staffRole, permissions, department, title, courseIds }) {
        const a = getApp(id);
        if (!OPEN.includes(a.status)) fail('INVALID', 'Only pending or under-review applications can be approved.');
        if (!ROLES[staffRole]) fail('INVALID', 'Choose a staff role.');
        if (db.first('users', u => u.email === a.email)) fail('DUPLICATE', 'Another account already uses this email.');
        const perms = (permissions && permissions.length ? permissions : ROLES[staffRole].permissions).filter(p => PERMISSIONS[p]);
        return db.tx(() => {
            const name = a.firstName + ' ' + a.lastName;
            const user = db.insert('users', { role: 'staff', name, email: a.email, passwordHash: a.passwordHash, status: 'active', staffRole, permissions: perms, department: department || '',
                phone: a.phone, avatar: a.photo || '', applicationId: a.id, emailVerified: !!a.emailVerified, approvedAt: db.now(), mustChangePassword: false });
            const ins = db.insert('instructors', { name, title: title || ROLES[staffRole].label, bio: a.bio, avatar: a.photo || '', email: a.email, userId: user.id, active: true });
            assignCourses(user.id, courseIds || [], ins);
            db.update('staff_applications', id, { status: 'approved', staffUserId: user.id, decidedAt: db.now(), passwordHash: null, history: a.history.concat([historyEntry('Approved: account created as ' + ROLES[staffRole].label, 'Administrator')]) });
            queueEmail({ to: a.email, kind: 'application_approved', related: id, subject: 'Your Tech Oasis School teaching application has been approved', body: `Hi ${a.firstName},\n\nYour Tech Oasis School teaching application has been approved.\n\nSign in to the Staff Portal: ${link('/staff/login')}\nRegistered email: ${a.email}\n\nUse the password you chose when you applied. If you have forgotten it, use "Forgot password" on the sign-in page to set a new one.` });
            TOS.engage && TOS.engage.notify(user.id, 'system', 'Welcome to the Tech Oasis teaching team', 'Your account is active. Start by reviewing your assigned courses.', '/staff/courses');
            audit('application_approved', { applicationId: id, userId: user.id, note: ROLES[staffRole].label });
            return user;
        });
    }

    // ---------------- Staff accounts (admin) ----------------
    const getStaff = id => { const u = db.get('users', id); if (!u || u.role !== 'staff') fail('NOT_FOUND', 'Staff account not found.'); return u; };
    const profileOf = userId => db.first('instructors', { userId });
    function assignedCourseIds(userId) {
        const ins = profileOf(userId); if (!ins) return [];
        return db.where('course_instructors', { instructorId: ins.id }).map(ci => ci.courseId).filter(id => db.get('courses', id));
    }
    function assignCourses(userId, courseIds, insRow) {
        const u = getStaff(userId);
        const ins = insRow || profileOf(userId) || db.insert('instructors', { name: u.name, title: (ROLES[u.staffRole] || ROLES.instructor).label, bio: '', avatar: u.avatar || '', email: u.email, userId, active: true });
        db.tx(() => {
            db.where('course_instructors', { instructorId: ins.id }).filter(ci => !courseIds.includes(ci.courseId)).forEach(ci => db.remove('course_instructors', ci.id));
            courseIds.forEach(cid => {
                if (db.first('course_instructors', { courseId: cid, instructorId: ins.id })) return;
                const hasLead = db.first('course_instructors', { courseId: cid, role: 'lead' });
                db.insert('course_instructors', { courseId: cid, instructorId: ins.id, role: hasLead ? 'co' : 'lead', order: db.count('course_instructors', { courseId: cid }) });
            });
        });
    }
    function updateStaff(userId, patch) {
        getStaff(userId);
        const allowed = {};
        ['name', 'department', 'phone'].forEach(k => { if (k in patch) allowed[k] = String(patch[k] || '').trim(); });
        if (patch.staffRole && ROLES[patch.staffRole]) allowed.staffRole = patch.staffRole;
        if (Array.isArray(patch.permissions)) allowed.permissions = patch.permissions.filter(p => PERMISSIONS[p]);
        db.update('users', userId, allowed);
        const ins = profileOf(userId); if (ins) db.update('instructors', ins.id, Object.assign({}, allowed.name ? { name: allowed.name } : {}, patch.title != null ? { title: patch.title } : {}));
        audit('staff_updated', { userId, note: Object.keys(allowed).join(', ') });
    }
    // Account lifecycle. History (messages, grades, classes, audit) is never removed.
    const TRANSITIONS = {
        suspend: { from: ['active'], to: 'suspended', label: 'Suspended' },
        reactivate: { from: ['suspended', 'archived'], to: 'active', label: 'Reactivated' },
        ban: { from: ['active', 'suspended', 'archived'], to: 'banned', label: 'Banned' },
        unban: { from: ['banned'], to: 'active', label: 'Unbanned / restored' },
        archive: { from: ['active', 'suspended'], to: 'archived', label: 'Archived' },
        delete: { from: ['active', 'suspended', 'banned', 'archived'], to: 'deleted', label: 'Deleted' }
    };
    function changeAccountStatus(userId, action, { reason } = {}) {
        const u = getStaff(userId), t = TRANSITIONS[action];
        if (!t) fail('INVALID', 'Unknown action.');
        if (!t.from.includes(u.status || 'active')) fail('INVALID', `A ${ACCOUNT_STATUS[u.status] || u.status} account can't be ${t.label.toLowerCase()}.`);
        db.tx(() => {
            const patch = { status: t.to, statusChangedAt: db.now() };
            if (action === 'delete') patch.deletedAt = db.now();
            if (action === 'ban') patch.bannedAt = db.now();
            db.update('users', userId, patch);
            // Deleted/archived staff stop appearing as instructors on live course pages; assignments are kept for history
            const ins = profileOf(userId); if (ins) db.update('instructors', ins.id, { active: t.to === 'active' });
            db.where('password_resets', r => r.userId === userId && !r.usedAt).forEach(r => db.update('password_resets', r.id, { usedAt: db.now(), revoked: true }));
            audit('account_' + action, { userId, note: reason });
            const msg = { suspended: 'Your staff account is currently suspended. Please contact administration.', banned: 'Your staff account has been disabled. Please contact administration.', active: 'Your staff account is active again. You can sign in to the Staff Portal.', archived: 'Your staff account has been archived.', deleted: 'Your staff account has been closed.' }[t.to];
            queueEmail({ to: u.email, kind: 'account_' + action, related: userId, subject: 'Your Tech Oasis School staff account', body: `Hi ${u.name.split(' ')[0]},\n\n${msg}${t.to === 'active' ? '\n\n' + link('/staff/login') : ''}\n\nQuestions: ${school().email}` });
        });
    }

    // ---------------- Passwords ----------------
    function createPasswordReset(userId, reason) {
        const u = getStaff(userId), token = C.token();
        db.insert('password_resets', { userId, tokenHash: C.hashToken(token), expiresAt: new Date(Date.now() + 2 * 3600000).toISOString(), usedAt: null, reason: reason || 'requested' });
        queueEmail({ to: u.email, kind: 'password_reset', related: userId, subject: 'Set a new password for your Tech Oasis staff account', body: `Hi ${u.name.split(' ')[0]},\n\nUse this link within 2 hours to set a new password:\n${link('/staff/reset-password?token=' + token)}\n\nIf you didn't request this, you can ignore this email.` });
        return true;
    }
    function forcePasswordReset(userId) {
        getStaff(userId);
        db.update('users', userId, { mustChangePassword: true });
        createPasswordReset(userId, 'forced by administrator');
        audit('password_reset_forced', { userId });
    }
    // Public "forgot password": same response whether or not the email exists
    function requestPasswordReset(email) {
        const u = db.first('users', x => x.email === lower(email) && x.role === 'staff' && (x.status || 'active') === 'active');
        if (u) createPasswordReset(u.id, 'requested by staff member');
        return { ok: true };
    }
    function resetPasswordWithToken(token, password) {
        const r = token && db.first('password_resets', x => x.tokenHash === C.hashToken(token));
        if (!r || r.usedAt || new Date(r.expiresAt) < new Date()) fail('INVALID', 'This reset link is invalid or has expired. Request a new one.');
        const u = db.get('users', r.userId); if (!u || (u.status || 'active') !== 'active') fail('INVALID', 'This account cannot be reset. Please contact the school administration.');
        if (String(password).length < 8) fail('INVALID', 'Use at least 8 characters.');
        db.tx(() => { db.update('users', u.id, { password, mustChangePassword: false }); db.update('password_resets', r.id, { usedAt: db.now() }); audit('password_reset_completed', { userId: u.id, by: u.name }); });
        return { email: u.email };
    }

    // ---------------- Staff login: authentication AND account status must both pass ----------------
    const GENERIC = 'Incorrect email or password.';
    function staffLogin(email, password, remember) {
        email = lower(email);
        const u = db.first('users', x => x.email === email);
        if (u) {
            if (!TOS.auth.verifyUser(u, password)) return { error: GENERIC };
            if (u.role !== 'staff') return { error: "This account can't sign in to the Staff Portal." };
            if (!TOS.auth.isActive(u)) return { error: TOS.auth.statusMessage(u), status: u.status };
            db.update('users', u.id, { lastLoginAt: db.now() });
            audit('login', { userId: u.id, by: u.name });
            return { user: TOS.auth.start(u, remember), mustChangePassword: !!u.mustChangePassword };
        }
        const a = applicationByCredentials(email, password);
        if (!a) return { error: GENERIC };
        const msg = { pending: 'Your application is still under review.', under_review: 'Your application is still under review.', rejected: 'Your application was not approved. Please contact administration if you have questions.', withdrawn: 'This application was withdrawn. You are welcome to apply again.' }[a.status];
        return { error: msg || GENERIC, status: a.status, application: true };
    }
    const can = (user, perm) => !!user && user.role === 'staff' && (user.status || 'active') === 'active' && (user.permissions || []).includes(perm);

    // ---------------- Triggers & migrations ----------------
    // Staff accounts created directly by an admin (e.g. legacy "Add instructor") get safe defaults
    db.on('users', (evt, row) => {
        if (evt !== 'insert' || row.role !== 'staff') return;
        if (!row.status) row.status = 'active';
        if (!row.staffRole) row.staffRole = 'instructor';
        if (!row.permissions) row.permissions = ROLES[row.staffRole].permissions.slice();
    });
    (TOS.migrations = TOS.migrations || []).push(function (db) {
        db.where('users', u => u.role === 'staff' && (!u.staffRole || !u.permissions || !u.status)).forEach(u => db.update('users', u.id, { status: u.status || 'active', staffRole: u.staffRole || 'instructor', permissions: u.permissions || ROLES.instructor.permissions.slice(), department: u.department || 'Development' }));
        const st = db.settings();
        if (st._staffSeeded || !db.count('courses')) return;
        st._staffSeeded = true;
        // Sample applications for the review queue
        const web = lms.courseBySlug('web-development'), ux = lms.courseBySlug('ui-ux-design');
        const sample = (o, status, extra) => { const a = db.insert('staff_applications', Object.assign({ phone: '+233 20 000 0000', photo: '', dateOfBirth: null, previousTeaching: '', teachingLevel: 'Beginner to intermediate', teachingExperience: '', teachingMethod: 'Live sessions with hands-on projects', availability: 'Weekday evenings, Saturdays', courseIds: [],
            documents: [{ kind: 'cv', name: o.firstName + '-' + o.lastName + '-CV.pdf', size: 184000, type: 'application/pdf', url: '' }], passwordHash: C.hashPassword('teach12345'), emailVerified: true, verifyTokenHash: null, status, staffUserId: null, adminNotes: [], messages: [], rejectionReason: '', submittedAt: new Date(Date.now() - (extra || 2) * DAY).toISOString(),
            history: [{ at: new Date(Date.now() - (extra || 2) * DAY).toISOString(), action: 'Application submitted', by: 'Applicant', note: '' }] }, o)); return a; };
        sample({ firstName: 'Akosua', lastName: 'Darko', email: 'akosua.darko@example.com', location: 'Accra, Ghana', expertise: 'Product & UI/UX design', subjects: ['UI/UX Design', 'Web Design'], courseIds: ux ? [ux.id] : [], qualifications: 'Google UX Design Certificate', education: 'BSc Computer Science, University of Ghana', yearsExperience: 6, previousTeaching: 'Mentored 40+ junior designers; ran design bootcamps.', bio: 'Product designer who has shipped fintech and health apps used across West Africa.', teachingExperience: '3 years leading design workshops.' }, 'pending', 1);
        sample({ firstName: 'Ibrahim', lastName: 'Sani', email: 'ibrahim.sani@example.com', location: 'Lagos, Nigeria', expertise: 'Full-stack JavaScript', subjects: ['Web Development', 'Coding'], courseIds: web ? [web.id] : [], qualifications: 'AWS Certified Developer', education: 'BEng Electrical Engineering', yearsExperience: 8, previousTeaching: 'Part-time lecturer, two years.', bio: 'Engineer building React and Node.js products for startups.', teachingExperience: 'Taught evening coding classes for two years.' }, 'under_review', 4);
    });

    TOS.staff = {
        PERMISSIONS, ROLES, DEPARTMENTS, APP_STATUS, ACCOUNT_STATUS, TRANSITIONS,
        applyBlock, submitApplication, verifyEmail, applicationByCredentials, applicantView, withdraw, applicantReply,
        setApplicationStatus, addAdminNote, requestInfo, reject, approve,
        profileOf, assignedCourseIds, assignCourses, updateStaff, changeAccountStatus,
        createPasswordReset, forcePasswordReset, requestPasswordReset, resetPasswordWithToken,
        staffLogin, can, queueEmail, audit
    };
})();
