// People: students, instructors, enrollments.
(function () {
    const PAY_LABEL = { free: ['Free', 'bg-sky-50 text-sky-700'], paid: ['Paid', 'pill-paid'], trial: ['Trial', 'pill-trial'], overdue: ['Overdue', 'pill-overdue'], pending: ['Unpaid', 'pill-pending'] };
    const payPill = e => { const [l, c] = PAY_LABEL[lms.paymentState(e)]; return `<span class="pill ${c}">${l}</span>`; };
    const lastActive = uid => { const t = db.where('enrollments', { userId: uid }).map(e => e.lastAccessAt).filter(Boolean).sort().pop(); return t; };

    // ---------------- Students ----------------
    A.route('students', (_, p) => {
        A.crumbs('Students');
        const draw = () => {
            const rows = db.where('users', { role: 'student' }).filter(u => A.matches(u.name, u.email, u.studentId)).map(u => {
                const enrs = db.where('enrollments', { userId: u.id }), progs = enrs.map(e => lms.progress(u.id, e.courseId)).filter(Boolean);
                return Object.assign({ enrs, avg: progs.length ? Math.round(progs.reduce((a, p) => a + p.pct, 0) / progs.length) : 0, last: lastActive(u.id), certs: db.count('certificates', c => c.userId === u.id && !c.revoked) }, u);
            }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('tbl').innerHTML = `<p class="text-xs text-slate-500 mb-3">${ui.plural(rows.length, 'student')}</p>` + A.table([
                { label: 'Student', render: u => `<button data-open="${u.id}" class="text-left">${A.person(u.name, (u.studentId ? u.studentId + ' · ' : '') + u.email)}</button>` },
                { label: 'Status', render: u => u.status === 'suspended' ? '<span class="pill pill-revoked">Suspended</span>' : '<span class="pill pill-active">Active</span>' },
                { label: 'Courses', render: u => u.enrs.length },
                { label: 'Avg progress', render: u => A.progressBar(u.avg) },
                { label: 'Certificates', render: u => u.certs },
                { label: 'Last active', render: u => u.last ? ui.timeAgo(u.last) : '<span class="text-slate-400">Never</span>' },
                { label: 'Joined', render: u => ui.fmtDate(u.createdAt) },
                { label: '', cls: 'text-right whitespace-nowrap', render: u => `<a href="mailto:${esc(u.email)}" class="btn btn-ghost btn-sm" title="Email"><i class="fa-regular fa-envelope"></i></a><button data-open="${u.id}" class="btn btn-outline btn-sm">View</button>` }
            ], rows, A.empty('fa-user-graduate', 'No students yet', 'Students appear here when they sign up on the website.'));
            ui.$$('[data-open]').forEach(b => b.onclick = () => studentDrawer(b.dataset.open, draw));
        };
        A.view().innerHTML = A.header('Students', 'Everyone learning at the school.', `<button id="exp" class="btn btn-outline btn-sm"><i class="fa-solid fa-file-export"></i>Export CSV</button><button id="add" class="btn btn-forest btn-sm"><i class="fa-solid fa-user-plus"></i>Add student</button>`) + A.card('<div id="tbl"></div>');
        document.getElementById('add').onclick = () => userModal('student', null, draw);
        document.getElementById('exp').onclick = () => A.csv('students.csv', [['Name', 'Email', 'Courses', 'Joined']].concat(db.where('users', { role: 'student' }).map(u => [u.name, u.email, db.count('enrollments', { userId: u.id }), ui.fmtDate(u.createdAt)])));
        A.bindSearch(draw); draw();
        if (p.open) studentDrawer(p.open, draw);
    });
    function studentDrawer(uid, done) {
        const u = db.get('users', uid); if (!u) return;
        const enrs = db.where('enrollments', { userId: uid });
        const attempts = db.where('quiz_attempts', a => a.userId === uid && a.submittedAt).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        const subs = db.where('submissions', { userId: uid }), certs = db.where('certificates', { userId: uid });
        const suspended = u.status === 'suspended';
        const reopen = () => { done && done(); studentDrawer(uid, done); };
        const m = ui.modal({ title: u.name, size: 'max-w-4xl', body: `
            <div class="flex flex-wrap items-center gap-4 pb-5 border-b">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" class="w-12 h-12 rounded-full object-cover">` : A.avatar(u.name, 'bg-forest text-gold')}
                <div class="flex-1 min-w-0"><div class="text-sm text-slate-600"><span class="font-mono font-semibold text-ink">${esc(u.studentId || '—')}</span> · ${esc(u.email)}${u.phone ? ' · ' + esc(u.phone) : ''}</div><div class="text-xs text-slate-400">${esc(u.program || 'No program set')}${u.className ? ' · ' + esc(u.className) : ''} · Joined ${ui.fmtDate(u.createdAt)}${u.lastLoginAt ? ' · last login ' + ui.timeAgo(u.lastLoginAt) : ''}</div></div>
                <span class="pill ${suspended ? 'pill-revoked' : 'pill-active'}">${suspended ? 'Suspended' : 'Active'}</span></div>
            <div class="flex flex-wrap gap-2 py-4 border-b">
                <button data-edit class="btn btn-outline btn-sm"><i class="fa-solid fa-pen"></i>Edit profile</button>
                <button data-enroll class="btn btn-outline btn-sm"><i class="fa-solid fa-plus"></i>Enroll in course</button>
                <button data-msg class="btn btn-outline btn-sm"><i class="fa-regular fa-envelope"></i>Send message</button>
                <button data-notify class="btn btn-outline btn-sm"><i class="fa-regular fa-bell"></i>Send notification</button>
                <button data-suspend class="btn btn-sm ${suspended ? 'btn-forest' : 'text-rose-700 hover:bg-rose-50'}"><i class="fa-solid ${suspended ? 'fa-user-check' : 'fa-user-slash'}"></i>${suspended ? 'Reactivate account' : 'Suspend account'}</button></div>
            <h4 class="font-semibold text-ink mt-5 mb-3">Courses & progress</h4>
            <div class="space-y-3">${enrs.map(e => { const c = db.get('courses', e.courseId), p = lms.progress(uid, e.courseId); if (!c) return ''; const cancelled = e.status === 'cancelled'; return `<div class="rounded-xl border p-4 ${cancelled ? 'bg-slate-50' : ''}">
                <div class="flex flex-wrap items-center gap-2 justify-between"><div class="font-medium text-ink">${esc(c.title)}</div><div class="flex gap-2">${A.pill(e.status)}${payPill(e)}</div></div>
                <div class="mt-2">${A.progressBar(p.pct, 'w-full')}</div>
                <details class="mt-2"><summary class="text-xs font-semibold text-forest cursor-pointer">${p.done}/${p.total} lessons completed · view by section</summary>
                    <div class="mt-2 space-y-2">${lms.tree(e.courseId).sections.map(s => `<div><div class="text-xs font-semibold text-slate-700">${esc(s.title)}</div><div class="flex flex-wrap gap-1 mt-1">${s.lessons.map(l => `<span class="text-[11px] px-2 py-0.5 rounded-full ${lms.isComplete(uid, l.id) ? 'bg-forest-50 text-forest' : 'bg-slate-100 text-slate-400'}">${lms.isComplete(uid, l.id) ? '✓ ' : ''}${esc(l.title)}</span>`).join('')}</div></div>`).join('')}</div></details>
                <div class="flex flex-wrap items-center gap-2 mt-3"><span class="text-xs text-slate-400 flex-1">Enrolled ${ui.fmtDate(e.enrolledAt)}${e.lastAccessAt ? ' · active ' + ui.timeAgo(e.lastAccessAt) : ''}${p.current ? ' · Current: ' + esc(p.current.title) : ''}</span>
                    ${cancelled ? `<button data-restore="${e.id}" class="btn btn-ghost btn-sm text-forest">Restore access</button>` : `<button data-revoke="${e.id}" class="btn btn-ghost btn-sm text-rose-700">Remove access</button>`}
                    <button data-reset="${e.courseId}" class="btn btn-ghost btn-sm">Reset progress</button>
                    ${!lms.certificateOf(uid, e.courseId) ? `<button data-cert="${e.courseId}" class="btn btn-ghost btn-sm">Issue certificate</button>` : ''}</div></div>`; }).join('') || '<p class="text-sm text-slate-500">Not enrolled in any course.</p>'}</div>
            <div class="grid md:grid-cols-2 gap-5 mt-6">
                <div><h4 class="font-semibold text-ink mb-2">Quiz results</h4>${attempts.slice(0, 8).map(a => { const q = db.get('quizzes', a.quizId); return `<div class="flex justify-between text-sm py-1.5 border-b border-slate-100"><span class="truncate">${esc(q ? q.title : 'Quiz')} <span class="text-xs text-slate-400">${ui.fmtDate(a.submittedAt)}</span></span><span class="${a.passed ? 'text-forest-600' : 'text-rose-700'} font-semibold">${a.percent}%</span></div>`; }).join('') || '<p class="text-sm text-slate-500">None</p>'}</div>
                <div><h4 class="font-semibold text-ink mb-2">Assignment submissions</h4>${subs.map(s => { const a = db.get('assignments', s.assignmentId); return `<div class="flex justify-between items-center text-sm py-1.5 border-b border-slate-100"><span class="truncate">${esc(a ? a.title : 'Assignment')}</span><span>${s.status === 'graded' ? `<b>${s.score}</b>/${a ? a.maxScore : 100}` : `<a href="#/assignments?grade=${s.id}" class="pill pill-submitted">Grade</a>`}</span></div>`; }).join('') || '<p class="text-sm text-slate-500">None</p>'}</div>
            </div>
            ${certs.length ? `<h4 class="font-semibold text-ink mt-6 mb-2">Certificates</h4>${certs.map(c => `<div class="flex items-center justify-between text-sm py-1.5"><a href="verify.html?code=${encodeURIComponent(c.code)}" target="_blank" class="hover:underline">${esc(c.courseTitle)} <span class="font-mono text-xs text-slate-400">${esc(c.code)}</span></a>${c.revoked ? '<span class="pill pill-revoked">revoked</span>' : `<button data-revokecert="${c.id}" class="btn btn-ghost btn-sm text-rose-700">Revoke</button>`}</div>`).join('')}` : ''}
            <div class="mt-6 pt-4 border-t flex justify-end"><button data-del class="btn btn-ghost btn-sm text-rose-700"><i class="fa-solid fa-trash"></i>Delete student</button></div>` });
        const on = (sel, fn) => m.el.querySelectorAll(sel).forEach(b => b.onclick = () => fn(b));
        on('[data-edit]', () => { m.close(); userModal('student', u, reopen); });
        on('[data-enroll]', () => { m.close(); enrollModal({ userId: uid }, reopen); });
        on('[data-msg]', () => { m.close(); A.messageStudent(uid, cv => location.hash = '#/messages?c=' + cv.id); });
        on('[data-notify]', () => {
            m.close();
            const n = ui.modal({ title: 'Notify ' + u.name, body: `<form class="space-y-4">${A.field('Title', A.input('title', '', 'required maxlength="100"'))}${A.field('Message', A.textarea('body', '', 3))}<div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Send</button></div></form>` });
            n.el.querySelector('[data-c]').onclick = n.close;
            n.el.querySelector('form').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target); TOS.engage.notify(uid, 'system', d.title, d.body, '/student/notifications'); n.close(); ui.toast('Notification sent'); };
        });
        on('[data-suspend]', async () => {
            if (!suspended && !await ui.confirmBox(`Suspend ${u.name}? They are signed out and cannot access the student portal until reactivated. Their records are kept.`, { okText: 'Suspend', danger: true })) return;
            db.update('users', uid, { status: suspended ? 'active' : 'suspended' });
            if (suspended) TOS.engage.notify(uid, 'system', 'Your account has been reactivated', 'Welcome back! You can continue learning.', '/student/dashboard');
            m.close(); ui.toast(suspended ? 'Account reactivated' : 'Account suspended'); reopen();
        });
        on('[data-revoke]', async b => { if (await ui.confirmBox("Remove this student's access to the course? Their progress is kept and access can be restored.", { okText: 'Remove access', danger: true })) { db.update('enrollments', b.dataset.revoke, { status: 'cancelled' }); m.close(); reopen(); } });
        on('[data-restore]', b => { const en = db.update('enrollments', b.dataset.restore, { status: 'active' }); TOS.engage.notify(uid, 'enrollment', 'Course access restored: ' + A.courseTitle(en.courseId), 'You can continue where you left off.', '/student/course/' + en.courseId); m.close(); reopen(); });
        on('[data-reset]', async b => { if (await ui.confirmBox(`Reset ${u.name}'s progress in ${A.courseTitle(b.dataset.reset)}? Completed lessons, quiz attempts and submissions for this course are deleted. This cannot be undone.`, { okText: 'Reset progress', danger: true })) { lms.resetProgress(uid, b.dataset.reset); m.close(); ui.toast('Progress reset'); reopen(); } });
        on('[data-cert]', async b => { const el = lms.eligibility(uid, b.dataset.cert); if (!el.eligible && !await ui.confirmBox('This student has not met every certificate requirement yet. Issue the certificate anyway?', { okText: 'Issue anyway' })) return; lms.issueCertificate(uid, b.dataset.cert, true); m.close(); ui.toast('Certificate issued'); reopen(); });
        on('[data-revokecert]', async b => { if (await ui.confirmBox('Revoke this certificate? The verification page will show it as revoked.', { okText: 'Revoke', danger: true })) { db.update('certificates', b.dataset.revokecert, { revoked: true, revokedReason: 'Revoked by the school' }); m.close(); reopen(); } });
        on('[data-del]', async () => { if (await ui.confirmBox(`Delete ${u.name}'s account, enrollments and progress? Issued certificates remain valid.`, { okText: 'Delete', danger: true })) { db.remove('users', uid); m.close(); done && done(); ui.toast('Student deleted'); } });
    }
    function userModal(role, u, done) {
        const st = role === 'student';
        const m = ui.modal({ title: u ? 'Edit ' + role : 'Add ' + role, size: 'max-w-xl', body: `<form class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-4">${A.field('Full name *', A.input('name', u ? u.name : '', 'required'))}${A.field('Email *', A.input('email', u ? u.email : '', 'type="email" required'))}</div>
            ${st ? `<div class="grid sm:grid-cols-2 gap-4">${A.field('Student ID', A.input('studentId', u ? u.studentId : '', 'placeholder="Assigned automatically"'))}${A.field('Phone', A.input('phone', u ? u.phone : ''))}${A.field('Program', A.input('program', u ? u.program : '', 'placeholder="e.g. Web Development"'))}${A.field('Class', A.input('className', u ? u.className : '', 'placeholder="e.g. Cohort 2026-A"'))}</div>
                ${A.field('Account status', A.select('status', [['active', 'Active'], ['suspended', 'Suspended']], u ? u.status || 'active' : 'active'))}` : ''}
            ${A.field(u ? 'New password' : 'Temporary password *', A.input('password', '', `type="text" minlength="6" ${u ? 'placeholder="Leave blank to keep current"' : 'required'}`), 'Share it securely. Students sign in at /student/login.')}
            <p data-err class="hidden text-xs text-rose-700"></p>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => {
            e.preventDefault();
            const d = A.formData(e.target), err = m.el.querySelector('[data-err]'); d.email = d.email.toLowerCase();
            if (db.first('users', x => x.email === d.email && (!u || x.id !== u.id))) { err.textContent = 'Another account already uses this email.'; return err.classList.remove('hidden'); }
            if (st && d.studentId && db.first('users', x => x.studentId === d.studentId && (!u || x.id !== u.id))) { err.textContent = 'That student ID is already in use.'; return err.classList.remove('hidden'); }
            if (!d.password) delete d.password;
            if (st && !d.studentId) delete d.studentId;
            const row = u ? db.update('users', u.id, d) : db.insert('users', Object.assign(d, { role }));
            m.close(); done && done(row); ui.toast('Saved');
        };
    }

    // ---------------- Instructors ----------------
    A.route('instructors', () => {
        A.crumbs('Instructors');
        const draw = () => {
            const list = db.all('instructors').filter(i => A.matches(i.name, i.title, i.email));
            document.getElementById('grid').innerHTML = list.map(i => {
                const courses = db.where('course_instructors', { instructorId: i.id }).map(ci => db.get('courses', ci.courseId)).filter(Boolean);
                const students = new Set(db.all('enrollments').filter(e => courses.some(c => c.id === e.courseId)).map(e => e.userId)).size;
                const login = i.userId && db.get('users', i.userId);
                return `<div class="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col">
                    <div class="flex items-center gap-4">${i.avatar ? `<img src="${esc(i.avatar)}" alt="" class="w-14 h-14 rounded-2xl object-cover">` : `<span class="w-14 h-14 rounded-2xl bg-forest text-gold font-bold flex items-center justify-center">${esc(ui.initials(i.name))}</span>`}
                        <div class="min-w-0"><div class="font-semibold text-ink truncate">${esc(i.name)}</div><div class="text-xs text-gold-600 font-semibold truncate">${esc(i.title)}</div></div></div>
                    <p class="text-sm text-slate-600 mt-3 line-clamp-3 flex-1">${esc(i.bio)}</p>
                    <div class="flex gap-4 text-xs text-slate-500 mt-4"><span><b class="text-ink">${courses.length}</b> courses</span><span><b class="text-ink">${students}</b> students</span><span>${login ? '<i class="fa-solid fa-key text-forest-400"></i> Staff login' : '<span class="text-slate-400">No login</span>'}</span></div>
                    <div class="flex flex-wrap gap-1 mt-3">${courses.map(c => `<a href="#/courses/${c.id}" class="pill bg-slate-100 text-slate-600 hover:bg-slate-200">${esc(c.title)}</a>`).join('')}</div>
                    <div class="flex justify-end gap-1 mt-4 pt-3 border-t border-slate-100">${A.iconBtn('fa-pen', 'Edit', `data-edit="${i.id}"`)}${A.iconBtn('fa-trash', 'Delete', `data-del="${i.id}"`, true)}</div></div>`;
            }).join('') || A.empty('fa-chalkboard-user', 'No instructors yet');
            ui.$$('[data-edit]').forEach(b => b.onclick = () => instructorModal(db.get('instructors', b.dataset.edit), draw));
            ui.$$('[data-del]').forEach(b => b.onclick = async () => { const i = db.get('instructors', b.dataset.del); if (await ui.confirmBox(`Remove ${i.name}? They will be unassigned from their courses.`, { okText: 'Remove', danger: true })) { db.remove('instructors', i.id); draw(); } });
        };
        A.view().innerHTML = A.header('Instructors', 'Public instructor profiles shown on course pages. Staff Portal logins are created by approving a staff application.', '<button id="add" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Add instructor</button>') + '<div id="grid" class="grid md:grid-cols-2 xl:grid-cols-3 gap-4"></div>';
        document.getElementById('add').onclick = () => instructorModal(null, draw);
        A.bindSearch(draw); draw();
    });
    function instructorModal(i, done) {
        const login = i && i.userId && db.get('users', i.userId);
        const m = ui.modal({ title: i ? 'Edit instructor' : 'Add instructor', size: 'max-w-xl', body: `<form class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-4">${A.field('Full name *', A.input('name', i ? i.name : '', 'required'))}${A.field('Title', A.input('title', i ? i.title : '', 'placeholder="Senior Engineer"'))}</div>
            ${A.field('Bio', A.textarea('bio', i ? i.bio : '', 4))}
            ${A.field('Photo URL', A.input('avatar', i && !String(i.avatar).startsWith('data:') ? i.avatar : '', 'id="avUrl" placeholder="https://…"'))}<label class="btn btn-outline btn-sm cursor-pointer"><i class="fa-solid fa-upload"></i>Upload photo<input type="file" accept="image/*" id="avFile" class="hidden"></label>
            <div class="rounded-xl bg-ivory p-4 text-sm"><div class="font-semibold text-ink">Staff Portal access</div>
                ${login ? `<p class="text-slate-600 mt-1">Linked to the staff account <b>${esc(login.email)}</b> (${esc((TOS.staff.ACCOUNT_STATUS[login.status] || 'Active'))}). <a href="#/staff?open=${login.id}" class="underline">Manage account</a></p>`
                    : '<p class="text-slate-600 mt-1">No login. Staff accounts are created only by approving a <a href="#/staff-applications" class="underline">staff application</a>.</p>'}</div>
            <p data-err class="hidden text-xs text-rose-700"></p>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save instructor</button></div></form>` });
        let avatar = i && String(i.avatar).startsWith('data:') ? i.avatar : null;
        m.el.querySelector('#avFile').onchange = async e => { const up = await A.upload(e.target.files[0]); if (up) { avatar = up.url; m.el.querySelector('#avUrl').value = ''; ui.toast('Photo ready'); } };
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => {
            e.preventDefault();
            const d = A.formData(e.target);
            const row = { name: d.name, title: d.title, bio: d.bio, avatar: avatar || d.avatar };
            if (i) db.update('instructors', i.id, row); else db.insert('instructors', row);
            m.close(); done(); ui.toast('Instructor saved');
        };
    }

    // ---------------- Enrollments ----------------
    A.route('enrollments', (_, p) => {
        A.crumbs('Enrollments');
        let course = p.course || '', status = p.status || '';
        if (p.q) document.getElementById('globalSearch').value = p.q;
        const draw = () => {
            const rows = db.all('enrollments').filter(e => (!course || e.courseId === course) && (!status || e.status === status || lms.paymentState(e) === status) && A.matches(A.userName(e.userId), A.courseTitle(e.courseId)))
                .sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt));
            document.getElementById('tbl').innerHTML = `<p class="text-xs text-slate-500 mb-3">${ui.plural(rows.length, 'enrollment')}</p>` + A.table([
                { label: 'Student', render: e => `<a href="#/students?open=${e.userId}">${A.person(A.userName(e.userId), (db.get('users', e.userId) || {}).email)}</a>` },
                { label: 'Course', render: e => `<a href="#/courses/${e.courseId}" class="text-ink hover:underline">${esc(A.courseTitle(e.courseId))}</a>` },
                { label: 'Progress', render: e => A.progressBar((lms.progress(e.userId, e.courseId) || { pct: 0 }).pct) },
                { label: 'Status', render: e => A.pill(e.status) },
                { label: 'Payment', render: e => payPill(e) + (lms.paymentState(e) === 'trial' ? `<div class="text-[11px] text-slate-400 mt-0.5">ends ${ui.fmtDate(e.trialEndsAt)}</div>` : '') },
                { label: 'Enrolled', render: e => ui.fmtDate(e.enrolledAt) },
                { label: '', cls: 'text-right whitespace-nowrap', render: e => `${['overdue', 'trial', 'pending'].includes(lms.paymentState(e)) && e.orderId ? `<button data-paid="${e.orderId}" class="btn btn-ghost btn-sm text-forest">Mark paid</button>` : ''}${A.iconBtn('fa-pen', 'Change status', `data-edit="${e.id}"`)}${A.iconBtn('fa-trash', 'Remove enrollment', `data-del="${e.id}"`, true)}` }
            ], rows, A.empty('fa-id-card', 'No enrollments match'));
            ui.$$('[data-paid]').forEach(b => b.onclick = () => { lms.markOrderPaid(b.dataset.paid, 'manual', 'admin'); ui.toast('Payment recorded'); draw(); A.renderNav('enrollments'); });
            ui.$$('[data-edit]').forEach(b => b.onclick = () => {
                const e = db.get('enrollments', b.dataset.edit);
                const m = ui.modal({ title: 'Enrollment status', body: `<form class="space-y-4">${A.field('Status', A.select('status', [['active', 'Active'], ['trial', 'Trial'], ['completed', 'Completed'], ['cancelled', 'Cancelled (access removed)']], e.status))}${A.field('Trial ends', A.input('trialEndsAt', e.trialEndsAt ? e.trialEndsAt.slice(0, 10) : '', 'type="date"'), 'Extend a trial by moving this date.')}<div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save</button></div></form>` });
                m.el.querySelector('[data-c]').onclick = m.close;
                m.el.querySelector('form').onsubmit = ev => { ev.preventDefault(); const d = A.formData(ev.target); db.update('enrollments', e.id, { status: d.status, trialEndsAt: d.trialEndsAt ? new Date(d.trialEndsAt + 'T23:59:00').toISOString() : e.trialEndsAt }); m.close(); draw(); };
            });
            ui.$$('[data-del]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Remove this enrollment? The student loses access; their lesson progress records are kept.', { okText: 'Remove', danger: true })) { db.remove('enrollments', b.dataset.del); draw(); } });
        };
        A.view().innerHTML = A.header('Enrollments', 'Who is enrolled in what, with progress and payment status.', '<button id="add" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Enroll a student</button>')
            + `<div class="grid sm:grid-cols-2 gap-3 mb-4 max-w-xl">${A.select('c', A.courseOptions('All courses'), course, 'id="fc"')}${A.select('s', [['', 'Any status'], ['active', 'Active'], ['trial', 'On trial'], ['overdue', 'Payment overdue'], ['completed', 'Completed'], ['cancelled', 'Cancelled']], status, 'id="fs"')}</div>` + A.card('<div id="tbl"></div>');
        document.getElementById('fc').onchange = e => { course = e.target.value; draw(); };
        document.getElementById('fs').onchange = e => { status = e.target.value; draw(); };
        document.getElementById('add').onclick = () => enrollModal({ courseId: course }, draw);
        A.bindSearch(draw); draw();
    });
    function enrollModal(pre, done) {
        const students = db.where('users', { role: 'student' }).sort((a, b) => a.name.localeCompare(b.name));
        const m = ui.modal({ title: 'Enroll a student', body: `<form class="space-y-4">
            ${A.field('Student *', A.select('userId', [['', 'Select student…']].concat(students.map(u => [u.id, u.name + ' — ' + u.email])), pre.userId, 'required'))}
            ${A.field('Course *', A.select('courseId', [['', 'Select course…']].concat(A.courseOptions()), pre.courseId, 'required'))}
            ${A.toggle('comp', true, 'Complimentary access', 'Grant full access without payment (scholarship, staff, partner).')}
            <p data-err class="hidden text-xs text-rose-700"></p>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Enroll</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => {
            e.preventDefault(); const d = A.formData(e.target);
            if (lms.enrollmentOf(d.userId, d.courseId)) { const er = m.el.querySelector('[data-err]'); er.textContent = 'This student is already enrolled in that course.'; return er.classList.remove('hidden'); }
            if (d.comp) lms.enroll(d.userId, d.courseId, { source: 'admin' }); else lms.checkout(d.userId, d.courseId);
            m.close(); done && done(); ui.toast('Student enrolled');
        };
    }
    // Builder "Students" tab
    A.courseStudents = function (el, c) {
        const enrs = db.where('enrollments', { courseId: c.id });
        el.innerHTML = A.card(A.cardTitle(ui.plural(enrs.length, 'student'), `<button id="enr" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Enroll student</button>`) + A.table([
            { label: 'Student', render: e => `<a href="#/students?open=${e.userId}">${A.person(A.userName(e.userId), (db.get('users', e.userId) || {}).email)}</a>` },
            { label: 'Progress', render: e => A.progressBar((lms.progress(e.userId, c.id) || { pct: 0 }).pct) },
            { label: 'Current lesson', render: e => { const p = lms.progress(e.userId, c.id); return `<span class="text-xs">${esc(p && p.current ? p.current.title : '—')}</span>`; } },
            { label: 'Status', render: e => A.pill(e.status) },
            { label: 'Payment', render: payPill },
            { label: 'Last active', render: e => e.lastAccessAt ? ui.timeAgo(e.lastAccessAt) : '—' }
        ], enrs, A.empty('fa-user-graduate', 'No students yet')));
        document.getElementById('enr').onclick = () => enrollModal({ courseId: c.id }, () => A.refresh());
    };
})();
