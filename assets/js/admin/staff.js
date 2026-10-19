// Admin: staff applications, staff accounts (lifecycle + permissions) and the email outbox.
(function () {
    const ST = TOS.staff;
    // Navigation
    const people = A.NAV.find(g => g.title === 'People');
    const iIdx = people.items.findIndex(i => i[0] === 'instructors');
    people.items.splice(iIdx, 1, ['staff', 'Staff', 'fa-id-badge'], ['staff-applications', 'Staff Applications', 'fa-file-signature'], ['instructors', 'Instructor Profiles', 'fa-chalkboard-user']);
    A.NAV.find(g => g.title === 'Settings').items.push(['email-outbox', 'Email Outbox', 'fa-inbox']);
    A.extraBadges = Object.assign(A.extraBadges || {}, { 'staff-applications': () => db.count('staff_applications', a => a.status === 'pending' || (a.status === 'under_review' && !a.infoRequested)) });

    const STATUS_PILL = { pending: 'pill-pending', under_review: 'bg-sky-50 text-sky-700', approved: 'pill-active', rejected: 'pill-revoked', withdrawn: 'pill-inactive', active: 'pill-active', suspended: 'pill-pending', banned: 'pill-revoked', archived: 'pill-inactive', deleted: 'pill-inactive' };
    const appPill = s => `<span class="pill ${STATUS_PILL[s] || ''}">${esc(ST.APP_STATUS[s] || s)}</span>`;
    const accPill = s => `<span class="pill ${STATUS_PILL[s || 'active']}">${esc(ST.ACCOUNT_STATUS[s || 'active'])}</span>`;
    const fullName = a => a.firstName + ' ' + a.lastName;
    const avatar = (name, photo, size) => photo ? `<img src="${esc(photo)}" alt="" class="rounded-full object-cover shrink-0" style="width:${size || 36}px;height:${size || 36}px">` : A.avatar(name);
    const run = (fn, msg) => { try { fn(); if (msg) ui.toast(msg); return true; } catch (e) { ui.toast(e.message, 'error'); return false; } };

    // ================= Staff applications =================
    A.route('staff-applications', (_, p) => {
        A.crumbs('Staff Applications');
        let filter = p.status || 'all';
        const draw = () => {
            const rows = db.all('staff_applications').filter(a => (filter === 'all' || a.status === filter) && A.matches(fullName(a), a.email, a.expertise, (a.subjects || []).join(' ')))
                .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
            document.getElementById('tbl').innerHTML = A.table([
                // Contact details sit under the name and experience under the expertise, so the table fits without scrolling
                { label: 'Applicant', cls: 'w-full', render: a => `<a href="#/staff-applications/${a.id}" class="flex items-center gap-3 min-w-0">${avatar(fullName(a), a.photo)}<span class="min-w-0"><span class="block font-medium text-ink hover:underline break-words">${esc(fullName(a))}</span><span class="block text-xs text-slate-500 break-all">${esc(a.email)}</span><span class="block text-xs text-slate-500 xl:hidden">${esc(a.phone)}</span>${a.infoRequested ? '<span class="block text-[11px] text-sky-700">Waiting for applicant</span>' : a.emailVerified ? '' : '<span class="block text-[11px] text-amber-700">Email not verified</span>'}</span></a>` },
                { label: 'Phone', cls: 'hidden xl:table-cell', render: a => `<span class="text-xs whitespace-nowrap">${esc(a.phone)}</span>` },
                { label: 'Subject', cls: 'hidden 2xl:table-cell', render: a => `<span class="text-xs">${esc((a.subjects || []).slice(0, 2).join(', '))}${(a.subjects || []).length > 2 ? ' +' + (a.subjects.length - 2) : ''}</span>` },
                { label: 'Expertise', cls: 'hidden md:table-cell', render: a => `<span class="block text-xs min-w-[9rem]">${esc(a.expertise)}</span><span class="block text-xs text-slate-500 whitespace-nowrap">${ui.plural(a.yearsExperience || 0, 'year')} experience</span>` },
                { label: 'Applied', cls: 'hidden lg:table-cell', render: a => `<span class="text-xs whitespace-nowrap">${ui.fmtDate(a.submittedAt)}</span>` },
                { label: 'Status', render: a => appPill(a.status) },
                { label: '', cls: 'text-right', render: a => `<a href="#/staff-applications/${a.id}" class="btn ${['pending', 'under_review'].includes(a.status) ? 'btn-forest' : 'btn-outline'} btn-sm">${['pending', 'under_review'].includes(a.status) ? 'Review' : 'View'}</a>` }
            ], rows, A.empty('fa-file-signature', 'No applications', 'Applications submitted at /staff/apply appear here for review.'));
        };
        const count = s => s === 'all' ? db.count('staff_applications') : db.count('staff_applications', { status: s });
        A.view().innerHTML = A.header('Staff Applications', 'People asking to teach at Tech Oasis. Nobody can sign in to the Staff Portal until you approve them.', '<a href="/staff/apply" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i>Open application form</a>')
            + `<div class="flex flex-wrap gap-2 mb-4">${[['all', 'All'], ['pending', 'Pending'], ['under_review', 'Under Review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['withdrawn', 'Withdrawn']].map(([k, l]) => `<a href="#/staff-applications${k === 'all' ? '' : '?status=' + k}" class="h-9 px-4 rounded-full text-sm font-semibold flex items-center ${filter === k ? 'bg-ink text-white' : 'bg-white border border-slate-200'}">${l} <span class="ml-2 text-xs opacity-60">${count(k)}</span></a>`).join('')}</div>` + A.card('<div id="tbl"></div>');
        A.bindSearch(draw); draw();
    });

    A.route('staff-applications/:id', ({ id }) => {
        const a = db.get('staff_applications', id);
        if (!a) { A.view().innerHTML = A.empty('fa-file-signature', 'Application not found', '', '<a href="#/staff-applications" class="btn btn-forest btn-sm">All applications</a>'); return; }
        A.crumbs(['Staff Applications', 'staff-applications'], fullName(a));
        const open = ['pending', 'under_review'].includes(a.status), staffUser = a.staffUserId && db.get('users', a.staffUserId);
        const courseTitles = (a.courseIds || []).map(cid => (db.get('courses', cid) || {}).title).filter(Boolean);
        const sec = (title, rows) => A.card(A.cardTitle(title) + `<dl class="grid sm:grid-cols-2 gap-x-6 gap-y-4">${rows.filter(r => r[1] !== undefined).map(([k, v, wide]) => `<div class="${wide ? 'sm:col-span-2' : ''}"><dt class="text-xs text-slate-500">${k}</dt><dd class="text-sm text-ink mt-0.5 whitespace-pre-line break-words">${v || '<span class="text-slate-400">—</span>'}</dd></div>`).join('')}</dl>`);
        const docIcon = k => ({ cv: 'fa-file-lines', certificate: 'fa-certificate', identification: 'fa-id-card', other: 'fa-paperclip' }[k] || 'fa-paperclip');
        A.view().innerHTML = `
            <a href="#/staff-applications" class="text-sm font-semibold text-slate-500 hover:text-ink"><i class="fa-solid fa-arrow-left mr-2"></i>All applications</a>
            <div class="bg-white rounded-2xl border border-slate-200/80 p-6 mt-4 flex flex-col lg:flex-row lg:items-center gap-5">
                ${avatar(fullName(a), a.photo, 72)}
                <div class="flex-1 min-w-0"><div class="flex flex-wrap items-center gap-2">${appPill(a.status)}${a.emailVerified ? '<span class="pill pill-active"><i class="fa-solid fa-check"></i>Email verified</span>' : '<span class="pill pill-pending">Email not verified</span>'}${a.infoRequested ? '<span class="pill bg-sky-50 text-sky-700">Waiting for applicant</span>' : ''}</div>
                    <h1 class="font-display text-3xl text-ink mt-2">${esc(fullName(a))}</h1><p class="text-sm text-slate-500">${esc(a.expertise)} · ${ui.plural(a.yearsExperience || 0, 'year')} experience · Applied ${ui.fmtDate(a.submittedAt)}</p></div>
                <div class="flex flex-wrap gap-2">${open ? `${a.status === 'pending' ? '<button data-act="review" class="btn btn-outline btn-sm"><i class="fa-solid fa-magnifying-glass"></i>Mark under review</button>' : ''}<button data-act="info" class="btn btn-outline btn-sm"><i class="fa-regular fa-comment-dots"></i>Request more information</button><button data-act="reject" class="btn btn-sm text-rose-700 border border-rose-200 hover:bg-rose-50"><i class="fa-solid fa-xmark"></i>Reject</button><button data-act="approve" class="btn btn-forest btn-sm"><i class="fa-solid fa-check"></i>Approve</button>`
                    : staffUser ? `<a href="#/staff?open=${staffUser.id}" class="btn btn-forest btn-sm"><i class="fa-solid fa-id-badge"></i>View staff account</a>` : ''}${a.status === 'rejected' || a.status === 'withdrawn' ? '<button data-act="reopen" class="btn btn-outline btn-sm">Reopen</button>' : ''}</div>
            </div>
            ${!a.emailVerified && open ? '<div class="mt-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3"><i class="fa-solid fa-triangle-exclamation mr-1"></i>The applicant has not verified their email yet. Approving is allowed, but the login email has not been confirmed.</div>' : ''}
            <div class="grid xl:grid-cols-[1fr_380px] gap-5 mt-5 items-start">
                <div class="space-y-5">
                    ${sec('Personal information', [['Full name', esc(fullName(a))], ['Email', esc(a.email)], ['Phone', esc(a.phone)], ['Location', esc(a.location)], ['Date of birth', a.dateOfBirth ? ui.fmtDate(a.dateOfBirth) : '']])}
                    ${sec('Professional information', [['Area of expertise', esc(a.expertise)], ['Years of experience', String(a.yearsExperience || 0)], ['Qualifications', esc(a.qualifications), 1], ['Education', esc(a.education), 1], ['Previous teaching experience', esc(a.previousTeaching), 1], ['Professional bio', esc(a.bio), 1]])}
                    ${sec('Teaching information', [['Subjects they want to teach', esc((a.subjects || []).join(', ')), 1], ['Courses they could teach', esc(courseTitles.join(', ')), 1], ['Preferred level', esc(a.teachingLevel)], ['Preferred method', esc(a.teachingMethod)], ['Teaching experience', esc(a.teachingExperience), 1], ['Availability', esc(a.availability), 1]])}
                    ${A.card(A.cardTitle('Documents') + ((a.documents || []).length ? `<div class="grid sm:grid-cols-2 gap-3">${a.documents.map(d => `<div class="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><span class="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center text-slate-500"><i class="fa-solid ${docIcon(d.kind)}"></i></span><div class="flex-1 min-w-0"><div class="text-sm font-medium text-ink truncate">${esc(d.name)}</div><div class="text-[11px] text-slate-500 capitalize">${esc(d.kind)}${d.size ? ' · ' + ui.fmtBytes(d.size) : ''}</div></div>${d.url ? `<a href="${esc(d.url)}" ${String(d.url).startsWith('data:') ? `download="${esc(d.name)}"` : 'target="_blank" rel="noopener noreferrer"'} class="btn btn-outline btn-sm">Open</a>` : '<span class="text-[11px] text-slate-400">sample</span>'}</div>`).join('')}</div>` : '<p class="text-sm text-slate-500">No documents.</p>'))}
                </div>
                <aside class="space-y-5">
                    ${A.card(A.cardTitle('Messages with applicant') + ((a.messages || []).length ? `<div class="space-y-3">${a.messages.map(m => `<div class="rounded-xl p-3 text-sm ${m.from === 'school' ? 'bg-forest-50' : 'bg-slate-50'}"><div class="text-[11px] font-semibold ${m.from === 'school' ? 'text-forest' : 'text-slate-600'}">${m.from === 'school' ? 'School' : 'Applicant'} · ${ui.timeAgo(m.at)}</div><p class="mt-1 whitespace-pre-line">${esc(m.body)}</p></div>`).join('')}</div>` : '<p class="text-sm text-slate-500">No messages. Use "Request more information" to ask the applicant something.</p>'))}
                    ${A.card(A.cardTitle('Admin notes', '<span class="text-[11px] text-slate-400"><i class="fa-solid fa-lock mr-1"></i>Never shown to the applicant</span>') + `${(a.adminNotes || []).map(n => `<div class="text-sm border-l-2 border-gold pl-3 mb-3"><div class="whitespace-pre-line">${esc(n.note)}</div><div class="text-[11px] text-slate-400 mt-0.5">${esc(n.by)} · ${ui.timeAgo(n.at)}</div></div>`).join('')}
                        <form id="noteForm" class="flex gap-2 mt-2"><input name="note" required class="field" placeholder="Add a private note"><button class="btn btn-outline btn-sm">Add</button></form>`)}
                    ${A.card(A.cardTitle('Application history') + `<ol class="relative ml-2 border-l border-slate-200 space-y-4">${(a.history || []).slice().reverse().map(h => `<li class="ml-4"><span class="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-forest-400 mt-1.5"></span><div class="text-sm text-ink">${esc(h.action)}</div><div class="text-[11px] text-slate-400">${esc(h.by)} · ${ui.fmtDateTime(h.at)}</div>${h.note ? `<div class="text-xs text-slate-500 mt-0.5">${esc(h.note)}</div>` : ''}</li>`).join('')}</ol>`)}
                </aside></div>`;
        document.getElementById('noteForm').onsubmit = e => { e.preventDefault(); ST.addAdminNote(a.id, A.formData(e.target).note); A.refresh(); };
        const act = (k, fn) => { const b = A.view().querySelector(`[data-act="${k}"]`); if (b) b.onclick = fn; };
        act('review', () => { if (run(() => ST.setApplicationStatus(a.id, 'under_review'), 'Marked as under review. The applicant was emailed.')) A.refresh(); });
        act('reopen', async () => { if (await ui.confirmBox('Reopen this application and set it back to Under Review?', { okText: 'Reopen' }) && run(() => ST.setApplicationStatus(a.id, 'under_review'), 'Application reopened')) A.refresh(); });
        act('info', () => {
            const m = ui.modal({ title: 'Request more information', body: `<form class="space-y-4">${A.field('Message to the applicant', A.textarea('msg', '', 5, 'required placeholder="e.g. Please upload a copy of your teaching certificate and two references."'), 'Emailed to the applicant. They reply from their application status page.')}<div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Send request</button></div></form>` });
            m.el.querySelector('[data-c]').onclick = m.close;
            m.el.querySelector('form').onsubmit = e => { e.preventDefault(); if (run(() => ST.requestInfo(a.id, A.formData(e.target).msg), 'Request sent')) { m.close(); A.refresh(); } };
        });
        act('reject', () => {
            const m = ui.modal({ title: 'Reject application', body: `<form class="space-y-4">
                ${A.field('Reason shared with the applicant (optional)', A.textarea('reason', '', 3, 'placeholder="Included in the rejection email"'))}
                ${A.field('Internal note (private)', A.textarea('internal', '', 3, 'placeholder="Only administrators see this"'))}
                <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-danger btn-sm">Reject application</button></div></form>` });
            m.el.querySelector('[data-c]').onclick = m.close;
            m.el.querySelector('form').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target); if (run(() => ST.reject(a.id, { reason: d.reason, internalNote: d.internal }), 'Application rejected. The applicant was notified.')) { m.close(); A.refresh(); } };
        });
        act('approve', () => accessModal({ title: 'Approve ' + fullName(a), cta: 'Approve & create staff account', role: 'instructor', permissions: null, department: '', titleText: '', courseIds: a.courseIds || [], note: 'Approving creates an active staff account with the email and password the applicant chose. They are emailed a sign-in link (never a password).' },
            d => { const u = ST.approve(a.id, d); ui.toast('Approved. ' + u.name + ' can now sign in to the Staff Portal.'); location.hash = '#/staff?open=' + u.id; }));
        A.renderNav('staff-applications');
    });

    // Role + permissions + department + courses (used by Approve and by staff Edit/Permissions)
    function accessModal(o, save) {
        const courses = db.all('courses').filter(c => c.status !== 'archived').sort((a, b) => a.title.localeCompare(b.title));
        const m = ui.modal({ title: o.title, size: 'max-w-2xl', body: `<form class="space-y-5">
            <div class="grid sm:grid-cols-2 gap-4">${A.field('Staff role *', A.select('staffRole', Object.entries(ST.ROLES).map(([k, r]) => [k, r.label]), o.role, 'id="roleSel"'), 'The applicant does not choose this. You do.')}${A.field('Department', A.select('department', [['', 'None']].concat(ST.DEPARTMENTS.map(d => [d, d])), o.department))}</div>
            ${o.showTitle !== false ? A.field('Public title', A.input('title', o.titleText, 'placeholder="e.g. Web Development Instructor"'), 'Shown to students on course pages.') : ''}
            <div><div class="field-label">Permissions</div><div id="perms" class="grid sm:grid-cols-2 gap-2"></div></div>
            ${o.courses !== false ? `<div><div class="field-label">Assigned courses</div><div class="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto thin-scroll">${courses.map(c => `<label class="flex items-center gap-2 text-sm rounded-lg border border-slate-200 px-3 py-2 cursor-pointer has-[:checked]:border-forest has-[:checked]:bg-forest-50"><input type="checkbox" name="course" value="${c.id}" ${o.courseIds.includes(c.id) ? 'checked' : ''} class="accent-[#0C3B2E]">${esc(c.title)}</label>`).join('')}</div></div>` : ''}
            ${o.note ? `<p class="text-xs text-slate-500 bg-slate-50 rounded-xl p-3"><i class="fa-solid fa-circle-info mr-1"></i>${o.note}</p>` : ''}
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">${o.cta}</button></div></form>` });
        const drawPerms = perms => { m.el.querySelector('#perms').innerHTML = Object.entries(ST.PERMISSIONS).map(([k, [l, d]]) => `<label class="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 cursor-pointer has-[:checked]:border-forest has-[:checked]:bg-forest-50"><input type="checkbox" name="perm" value="${k}" ${perms.includes(k) ? 'checked' : ''} class="mt-0.5 accent-[#0C3B2E]"><span><span class="block text-sm font-medium text-ink">${l}</span><span class="block text-[11px] text-slate-500">${d}</span></span></label>`).join(''); };
        drawPerms(o.permissions || ST.ROLES[o.role].permissions);
        m.el.querySelector('#roleSel').onchange = e => drawPerms(ST.ROLES[e.target.value].permissions);
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => {
            e.preventDefault();
            const f = e.target, perms = [...f.querySelectorAll('[name=perm]:checked')].map(x => x.value);
            if (!perms.length) return ui.toast('Grant at least one permission.', 'error');
            const d = { staffRole: f.staffRole.value, department: f.department.value, permissions: perms, title: f.title ? f.title.value : undefined, courseIds: [...f.querySelectorAll('[name=course]:checked')].map(x => x.value) };
            if (run(() => save(d))) m.close();
        };
    }

    // ================= Staff accounts =================
    const ACTIONS = [['suspend', 'Suspend', 'fa-user-clock'], ['ban', 'Ban', 'fa-ban'], ['reactivate', 'Reactivate', 'fa-user-check'], ['unban', 'Unban / Restore', 'fa-unlock'], ['archive', 'Archive', 'fa-box-archive'], ['delete', 'Delete', 'fa-trash']];
    A.route('staff', (_, p) => {
        A.crumbs('Staff');
        let filter = p.status || 'active';
        const draw = () => {
            const rows = db.where('users', u => u.role === 'staff' && (filter === 'all' || (u.status || 'active') === filter) && A.matches(u.name, u.email, u.department, (ST.ROLES[u.staffRole] || {}).label));
            document.getElementById('tbl').innerHTML = A.table([
                // Email sits under the name and department under the role, so the table fits the card without scrolling
                { label: 'Staff', cls: 'w-full', render: u => `<button data-view="${u.id}" class="flex items-center gap-3 text-left min-w-0">${avatar(u.name, u.avatar)}<span class="min-w-0"><span class="block font-medium text-ink hover:underline break-words">${esc(u.name)}</span><span class="block text-xs text-slate-500 break-all">${esc(u.email)}</span><span class="block text-xs text-slate-500 md:hidden">${esc((ST.ROLES[u.staffRole] || {}).label || '')}</span></span></button>` },
                { label: 'Role', cls: 'hidden md:table-cell', render: u => `<span class="block whitespace-nowrap">${esc((ST.ROLES[u.staffRole] || {}).label || '—')}</span><span class="block text-xs text-slate-500 whitespace-nowrap">${esc(u.department || 'No department')}</span>` },
                { label: 'Status', render: u => accPill(u.status) },
                { label: 'Application', cls: 'hidden 2xl:table-cell', render: u => u.applicationId && db.get('staff_applications', u.applicationId) ? `<a href="#/staff-applications/${u.applicationId}" class="text-xs font-semibold text-forest hover:underline whitespace-nowrap">View application</a>` : '<span class="text-xs text-slate-400 whitespace-nowrap">Created by admin</span>' },
                { label: 'Last login', cls: 'hidden xl:table-cell', render: u => `<span class="text-xs whitespace-nowrap">${u.lastLoginAt ? ui.timeAgo(u.lastLoginAt) : 'Never'}</span>` },
                { label: '<span class="sr-only">Actions</span>', cls: 'text-right', render: u => `<button data-menu="${u.id}" class="btn btn-outline btn-sm whitespace-nowrap" aria-haspopup="true" aria-label="Actions for ${esc(u.name)}"><span class="hidden sm:inline">Actions</span><i class="fa-solid fa-ellipsis sm:hidden"></i><i class="fa-solid fa-chevron-down text-[10px] hidden sm:inline"></i></button>` }
            ], rows, A.empty('fa-id-badge', 'No staff in this view', filter === 'active' ? 'Approve a staff application to add someone to the team.' : ''));
            ui.$$('[data-view]').forEach(b => b.onclick = () => staffDrawer(b.dataset.view, draw));
            ui.$$('[data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); actionMenu(b, db.get('users', b.dataset.menu), draw); });
        };
        const count = s => db.count('users', u => u.role === 'staff' && (s === 'all' || (u.status || 'active') === s));
        A.view().innerHTML = A.header('Staff', 'Approved staff accounts. You control their role, permissions, courses and access at any time.', '<a href="#/staff-applications" class="btn btn-forest btn-sm"><i class="fa-solid fa-file-signature"></i>Review applications</a>')
            + `<div class="flex flex-wrap gap-2 mb-4">${[['active', 'Active'], ['suspended', 'Suspended'], ['banned', 'Banned'], ['archived', 'Archived'], ['deleted', 'Deleted'], ['all', 'All']].map(([k, l]) => `<a href="#/staff?status=${k}" class="h-9 px-4 rounded-full text-sm font-semibold flex items-center ${filter === k ? 'bg-ink text-white' : 'bg-white border border-slate-200'}">${l} <span class="ml-2 text-xs opacity-60">${count(k)}</span></a>`).join('')}</div>` + A.card('<div id="tbl"></div>');
        A.bindSearch(draw); draw();
        if (p.open) staffDrawer(p.open, draw);
    });

    function actionMenu(btn, u, done) {
        document.querySelectorAll('.staff-menu').forEach(x => x.remove());
        const st = u.status || 'active';
        const allowed = ACTIONS.filter(([k]) => ST.TRANSITIONS[k].from.includes(st));
        const menu = document.createElement('div');
        menu.className = 'staff-menu fixed w-56 max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-lift border py-1 z-50 text-sm text-left';
        menu.innerHTML = [['view', 'View', 'fa-eye'], ['edit', 'Edit', 'fa-pen'], ['permissions', 'Permissions', 'fa-key'], ['message', 'Message', 'fa-envelope']].concat(st === 'deleted' ? [] : [['reset', 'Send password reset', 'fa-unlock-keyhole'], ['force', 'Force password reset', 'fa-key']])
            .map(([k, l, ic]) => `<button data-a="${k}" class="w-full text-left px-4 py-2 hover:bg-slate-50"><i class="fa-solid ${ic} w-5 text-slate-400"></i>${l}</button>`).join('')
            + (allowed.length ? '<div class="border-t my-1"></div>' + allowed.map(([k, l, ic]) => `<button data-a="${k}" class="w-full text-left px-4 py-2 hover:bg-slate-50 ${['ban', 'delete', 'suspend'].includes(k) ? 'text-rose-700' : ''}"><i class="fa-solid ${ic} w-5"></i>${l}</button>`).join('') : '');
        // Attached to the page (not the table) so the table's scroll area can never clip it.
        // Opens below the button, or above it when there is no room, and stays inside the screen.
        document.body.appendChild(menu);
        const r = btn.getBoundingClientRect(), h = menu.offsetHeight, w = menu.offsetWidth;
        menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
        menu.style.top = (r.bottom + 4 + h > innerHeight && r.top - 4 - h > 0 ? r.top - 4 - h : Math.max(8, Math.min(r.bottom + 4, innerHeight - h - 8))) + 'px';
        const close = () => { menu.remove(); document.removeEventListener('click', close); removeEventListener('scroll', close, true); removeEventListener('resize', close); };
        setTimeout(() => { document.addEventListener('click', close); addEventListener('scroll', close, true); addEventListener('resize', close); });
        menu.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { menu.remove(); doAction(b.dataset.a, u, done); });
    }
    async function doAction(k, u, done) {
        if (k === 'view') return staffDrawer(u.id, done);
        if (k === 'edit') return editStaff(u, done);
        if (k === 'permissions') return accessModal({ title: 'Permissions: ' + u.name, cta: 'Save permissions', role: u.staffRole || 'instructor', permissions: u.permissions || [], department: u.department || '', showTitle: false, courses: false },
            d => { ST.updateStaff(u.id, { staffRole: d.staffRole, permissions: d.permissions, department: d.department }); ui.toast('Permissions updated'); done(); });
        if (k === 'message') return messageStaff(u);
        if (k === 'reset') { if (await ui.confirmBox(`Email ${u.name} a secure link to set a new password? Their current password keeps working until they use it.`, { okText: 'Send link' }) && run(() => ST.createPasswordReset(u.id, 'sent by administrator'), 'Password reset link queued in the Email Outbox')) done(); return; }
        if (k === 'force') { if (await ui.confirmBox(`Force ${u.name} to change their password? They must set a new one the next time they sign in, and a reset link is emailed to them.`, { okText: 'Force reset' }) && run(() => ST.forcePasswordReset(u.id), 'Password change required at next sign-in')) done(); return; }
        // Lifecycle actions
        const T = ST.TRANSITIONS[k];
        if (k === 'delete') {
            const m = ui.modal({ title: 'Delete staff account', size: 'max-w-md', body: `<form class="space-y-4"><p class="text-sm text-slate-700"><b>Are you sure you want to delete this staff account?</b></p><p class="text-sm text-slate-600">${esc(u.name)} will no longer be able to sign in, and will be removed from live course pages. Their messages, grades, classes, application and audit history are kept for school records.</p>
                ${A.field('Reason (internal)', A.input('reason', '', 'placeholder="Optional"'))}${A.field('Type DELETE to confirm', A.input('confirm', '', 'required autocomplete="off"'))}
                <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-danger btn-sm">Delete account</button></div></form>` });
            m.el.querySelector('[data-c]').onclick = m.close;
            m.el.querySelector('form').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target); if (d.confirm !== 'DELETE') return ui.toast('Type DELETE to confirm.', 'error'); if (run(() => ST.changeAccountStatus(u.id, 'delete', { reason: d.reason }), 'Staff account deleted')) { m.close(); done(); } };
            return;
        }
        const needsReason = ['suspend', 'ban', 'archive'].includes(k);
        const copy = { suspend: `${u.name} won't be able to sign in until you reactivate the account. Nothing is deleted.`, ban: `${u.name} won't be able to sign in or apply again with this email until you unban the account.`, reactivate: `${u.name} will be able to sign in again.`, unban: `This lifts the ban and restores access for ${u.name}.`, archive: `${u.name} won't be able to sign in. You can reactivate the account later.` }[k];
        const m = ui.modal({ title: T.label.replace(' / restored', '') + ': ' + u.name, size: 'max-w-md', body: `<form class="space-y-4"><p class="text-sm text-slate-600">${esc(copy)}</p>${needsReason ? A.field('Reason (internal, never shown to the staff member)', A.input('reason', '', 'placeholder="Optional"')) : ''}<div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn ${['ban', 'suspend', 'archive'].includes(k) ? 'btn-danger' : 'btn-forest'} btn-sm">${T.label.replace(' / restored', '')}</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => { e.preventDefault(); if (run(() => ST.changeAccountStatus(u.id, k, { reason: (A.formData(e.target).reason || '') }), 'Account ' + T.label.toLowerCase())) { m.close(); done(); } };
    }
    function editStaff(u, done) {
        const ins = ST.profileOf(u.id);
        const m = ui.modal({ title: 'Edit ' + u.name, size: 'max-w-2xl', body: `<form class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-4">${A.field('Full name', A.input('name', u.name, 'required'))}${A.field('Phone', A.input('phone', u.phone || ''))}${A.field('Department', A.select('department', [['', 'None']].concat(ST.DEPARTMENTS.map(d => [d, d])), u.department || ''))}${A.field('Public title', A.input('title', ins ? ins.title : ''))}</div>
            <div><div class="field-label">Assigned courses</div><div class="grid sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto thin-scroll">${db.all('courses').filter(c => c.status !== 'archived').sort((a, b) => a.title.localeCompare(b.title)).map(c => `<label class="flex items-center gap-2 text-sm rounded-lg border border-slate-200 px-3 py-2 cursor-pointer has-[:checked]:border-forest has-[:checked]:bg-forest-50"><input type="checkbox" name="course" value="${c.id}" ${ST.assignedCourseIds(u.id).includes(c.id) ? 'checked' : ''} class="accent-[#0C3B2E]">${esc(c.title)}</label>`).join('')}</div></div>
            <p class="text-xs text-slate-500">Email can't be changed here because it is the staff member's sign-in identity. Use <b>Permissions</b> to change their role.</p>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target);
            if (run(() => { ST.updateStaff(u.id, { name: d.name, phone: d.phone, department: d.department, title: d.title }); ST.assignCourses(u.id, [...e.target.querySelectorAll('[name=course]:checked')].map(x => x.value)); }, 'Staff member updated')) { m.close(); done(); } };
    }
    function messageStaff(u) {
        const m = ui.modal({ title: 'Message ' + u.name, body: `<form class="space-y-4">${A.field('Subject', A.input('subject', '', 'required'))}${A.field('Message', A.textarea('body', '', 5, 'required'))}<p class="text-xs text-slate-500">Delivered to their Staff Portal notifications and queued as an email.</p><div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Send</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target);
            TOS.engage.notify(u.id, 'system', d.subject, d.body, '/staff/notifications');
            ST.queueEmail({ to: u.email, kind: 'admin_message', related: u.id, subject: d.subject, body: d.body });
            ST.audit('admin_message', { userId: u.id, note: d.subject }); m.close(); ui.toast('Message sent'); };
    }
    function staffDrawer(id, done) {
        const u = db.get('users', id); if (!u || u.role !== 'staff') return;
        const ins = ST.profileOf(u.id), app = u.applicationId && db.get('staff_applications', u.applicationId);
        const courses = ST.assignedCourseIds(u.id).map(cid => db.get('courses', cid));
        const auditRows = db.where('staff_audit', { userId: u.id }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 15);
        const graded = db.count('submissions', s => s.gradedBy === u.name);
        const m = ui.modal({ title: u.name, size: 'max-w-3xl', body: `
            <div class="flex flex-wrap items-center gap-4 pb-5 border-b">${avatar(u.name, u.avatar, 56)}<div class="flex-1 min-w-0"><div class="text-sm text-slate-600">${esc(u.email)}${u.phone ? ' · ' + esc(u.phone) : ''}</div><div class="text-xs text-slate-400">${esc((ST.ROLES[u.staffRole] || {}).label || '')}${u.department ? ' · ' + esc(u.department) : ''} · ${u.approvedAt ? 'Approved ' + ui.fmtDate(u.approvedAt) : 'Created ' + ui.fmtDate(u.createdAt)} · Last login ${u.lastLoginAt ? ui.timeAgo(u.lastLoginAt) : 'never'}</div></div>${accPill(u.status)}${u.mustChangePassword ? '<span class="pill pill-pending">Must change password</span>' : ''}</div>
            <div class="flex flex-wrap gap-2 py-4 border-b">${[['edit', 'Edit', 'fa-pen'], ['permissions', 'Permissions', 'fa-key'], ['message', 'Message', 'fa-envelope']].map(([k, l, ic]) => `<button data-a="${k}" class="btn btn-outline btn-sm"><i class="fa-solid ${ic}"></i>${l}</button>`).join('')}${ACTIONS.filter(([k]) => ST.TRANSITIONS[k].from.includes(u.status || 'active')).map(([k, l, ic]) => `<button data-a="${k}" class="btn btn-sm ${['ban', 'delete', 'suspend'].includes(k) ? 'text-rose-700 hover:bg-rose-50' : 'btn-outline'}"><i class="fa-solid ${ic}"></i>${l}</button>`).join('')}</div>
            <div class="grid md:grid-cols-2 gap-6 mt-5">
                <div><h4 class="font-semibold text-ink mb-2">Permissions</h4><ul class="space-y-1.5">${Object.entries(ST.PERMISSIONS).map(([k, [l]]) => `<li class="text-sm flex items-center gap-2"><i class="fa-solid ${(u.permissions || []).includes(k) ? 'fa-circle-check text-forest-400' : 'fa-circle-xmark text-slate-300'}"></i><span class="${(u.permissions || []).includes(k) ? 'text-ink' : 'text-slate-400'}">${l}</span></li>`).join('')}</ul></div>
                <div><h4 class="font-semibold text-ink mb-2">Assigned courses</h4>${courses.length ? courses.map(c => `<a href="#/courses/${c.id}" class="block text-sm py-1 hover:underline">${esc(c.title)}</a>`).join('') : '<p class="text-sm text-slate-500">None. Use Edit to assign courses.</p>'}
                    <h4 class="font-semibold text-ink mt-5 mb-2">Activity</h4><p class="text-sm text-slate-600">${ui.plural(graded, 'submission')} graded · ${ui.plural(db.count('messages', x => x.senderId === u.id), 'message')} sent</p>
                    ${app ? `<h4 class="font-semibold text-ink mt-5 mb-2">Application</h4><a href="#/staff-applications/${app.id}" class="text-sm text-forest font-semibold hover:underline">Applied ${ui.fmtDate(app.submittedAt)}: ${esc(app.expertise)}</a>` : ''}
                    ${ins ? `<h4 class="font-semibold text-ink mt-5 mb-2">Public profile</h4><p class="text-sm text-slate-600">${esc(ins.title)}${ins.active === false ? ' · <span class="text-rose-600">hidden from course pages</span>' : ''}</p>` : ''}</div>
            </div>
            <h4 class="font-semibold text-ink mt-6 mb-2">Audit trail</h4>${auditRows.length ? `<div class="divide-y divide-slate-100 border rounded-xl">${auditRows.map(r => `<div class="flex justify-between gap-3 px-4 py-2 text-sm"><span>${esc(r.action.replace(/_/g, ' '))}${r.note ? ` <span class="text-xs text-slate-400">· ${esc(r.note)}</span>` : ''}</span><span class="text-xs text-slate-400 whitespace-nowrap">${esc(r.by)} · ${ui.timeAgo(r.createdAt)}</span></div>`).join('')}</div>` : '<p class="text-sm text-slate-500">No activity recorded yet.</p>'}` });
        const refresh = () => { m.close(); done && done(); staffDrawer(id, done); };
        m.el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { m.close(); doAction(b.dataset.a, db.get('users', id), refresh); });
    }

    // ================= Email outbox =================
    A.route('email-outbox', () => {
        A.crumbs(['Settings', 'settings/school'], 'Email Outbox');
        const draw = () => {
            const rows = db.all('email_outbox').filter(e => A.matches(e.to, e.subject, e.kind)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'To', render: e => `<span class="text-sm">${esc(e.to)}</span>` },
                { label: 'Subject', render: e => `<button data-open="${e.id}" class="text-left font-medium text-ink hover:underline">${esc(e.subject)}</button>` },
                { label: 'Type', render: e => `<span class="pill bg-slate-100 text-slate-600">${esc(e.kind.replace(/_/g, ' '))}</span>` },
                { label: 'Queued', render: e => `<span class="text-xs whitespace-nowrap">${ui.fmtDateTime(e.createdAt)}</span>` },
                { label: 'Status', render: e => `<span class="pill pill-pending">${esc(e.status)}</span>` }
            ], rows, A.empty('fa-inbox', 'No emails yet'));
            ui.$$('[data-open]').forEach(b => b.onclick = () => { const e = db.get('email_outbox', b.dataset.open);
                ui.modal({ title: e.subject, size: 'max-w-xl', body: `<div class="text-xs text-slate-500 mb-3">To ${esc(e.to)} · ${ui.fmtDateTime(e.createdAt)}</div><div class="rounded-xl bg-slate-50 border p-4 text-sm whitespace-pre-line break-words">${esc(e.body).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-forest underline">$1</a>')}</div>` }); });
        };
        A.view().innerHTML = A.header('Email Outbox', 'Messages the system has queued for applicants and staff.') + `<div class="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-4 mb-4"><i class="fa-solid fa-circle-info mr-1"></i>No email service is connected, so emails are queued here instead of being sent. Connect a provider (e.g. Resend, Postmark, SendGrid) to deliver them automatically. Treat links in these emails as private: they let the recipient verify an email or set a password.</div>` + A.card('<div id="tbl"></div>');
        A.bindSearch(draw); draw();
    });
})();
