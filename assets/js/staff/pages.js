// Staff Portal pages: dashboard, students, messages, announcements, notifications, schedule, profile, settings, help.
(function () {
    const stat = (icon, tone, label, value, href) => `<a href="${href}" class="s-card s-card-hover p-5"><div class="flex items-center justify-between"><span class="text-sm s-muted">${label}</span><span class="w-9 h-9 rounded-xl ${tone} flex items-center justify-center text-sm"><i class="fa-solid ${icon}"></i></span></div><div class="text-3xl font-bold text-slate-900 mt-2">${value}</div></a>`;

    // ---------------- Dashboard ----------------
    S.route('/staff/dashboard', { title: 'Dashboard', nav: 'dashboard', live: true, render: async el => {
        const d = await sapi.dashboard(), me = S.me;
        const K = TOS.kit, now = new Date(), dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
        const today = d.events.filter(e => new Date(e.startsAt) <= dayEnd && new Date(e.endsAt || e.startsAt) >= new Date(now.toDateString()));
        const EVT_TONE = { class: 'forest', exam: 'rose', quiz: 'violet', deadline: 'gold', event: 'sky', holiday: 'emerald' };
        const aside = `<div class="flex items-center justify-between mb-1"><h2 class="text-xs font-semibold text-slate-900">Today's schedule</h2><a href="/staff/schedule" class="k-link">Schedule</a></div>`
            + K.schedule(today.slice(0, 4).map(e => ({ time: e.allDay ? 'All day' : new Date(e.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), title: e.title, sub: e.course || e.location || '', tone: EVT_TONE[e.type], href: '/staff/schedule' })), 'Nothing scheduled today.');
        // Quick actions only for what this staff member's permissions allow
        const actions = [
            has(me, 'grade_students') && { href: '/staff/grading', label: d.stats.toGrade ? `Grade ${ui.plural(d.stats.toGrade, 'submission')}` : 'Grading queue', icon: 'fa-list-check', tone: 'gold' },
            has(me, 'view_courses') && { href: '/staff/courses', label: 'My courses', icon: 'fa-book-open', tone: 'forest' },
            has(me, 'view_students') && { href: '/staff/students', label: 'Student progress', icon: 'fa-user-graduate', tone: 'sky' },
            has(me, 'manage_schedule') && { href: '/staff/schedule', label: 'Add a class or exam', icon: 'fa-calendar-plus', tone: 'rose' },
            has(me, 'post_announcements') && { href: '/staff/announcements', label: 'Post announcement', icon: 'fa-bullhorn', tone: 'violet' },
            { href: '/staff/messages', label: 'Messages', icon: 'fa-envelope', tone: 'emerald' }
        ].filter(Boolean);
        el.innerHTML = `
            ${K.welcome({ name: me.name, sub: me.roleLabel + (me.department ? ' · ' + me.department : ''), aside })}
            <div class="mt-6">${K.stats([
                { icon: 'fa-book-open', tone: 'forest', label: 'My courses', value: d.stats.courses, sub: 'Assigned to you', href: has(me, 'view_courses') ? '/staff/courses' : null },
                { icon: 'fa-user-graduate', tone: 'sky', label: 'Students', value: d.stats.students, sub: 'In your courses', href: has(me, 'view_students') ? '/staff/students' : null },
                { icon: 'fa-list-check', tone: d.stats.toGrade ? 'rose' : 'gold', label: 'To grade', value: d.stats.toGrade, sub: d.stats.toGrade ? 'Waiting for you' : 'All graded', href: has(me, 'grade_students') ? '/staff/grading' : null },
                { icon: 'fa-envelope', tone: 'violet', label: 'Unread messages', value: d.stats.unreadMessages, sub: d.stats.unreadMessages ? 'Reply when you can' : 'Inbox clear', href: '/staff/messages' }
            ])}</div>
            <div class="mt-5">${K.panel({ title: 'Quick actions', icon: 'fa-bolt', tone: 'amber', body: K.quickActions(actions) })}</div>
            ${!d.courses.length ? `<div class="mt-5">${S.empty('fa-book-open', 'No courses assigned yet', 'The school administration will assign courses to you. They will appear here.', '<a href="/staff/help" class="btn btn-outline btn-sm">Contact administration</a>')}</div>` : ''}
            <div class="grid xl:grid-cols-3 gap-5 mt-5">
                <section class="xl:col-span-2 s-card p-5"><div class="flex items-center justify-between"><h2 class="s-h2">My courses</h2>${has(me, 'view_courses') ? '<a href="/staff/courses" class="text-xs font-semibold text-forest-600">View all</a>' : ''}</div>
                    ${d.courses.length ? `<div class="grid sm:grid-cols-2 gap-4 mt-4">${d.courses.map(c => `<a href="${has(me, 'view_courses') ? '/staff/courses/' + c.id : '#'}" class="flex gap-3 rounded-xl border border-[#EEF0F3] p-3 hover:border-forest-200"><img src="${esc(c.thumbnail)}" alt="" class="w-20 h-14 rounded-lg object-cover bg-slate-100"><div class="min-w-0 flex-1"><div class="text-sm font-semibold text-slate-900 truncate">${esc(c.title)}</div><div class="text-xs s-muted">${ui.plural(c.students, 'student')} · ${c.lessons} lessons</div><div class="mt-2">${S.bar(c.avgProgress)}</div><div class="text-[11px] s-muted mt-1">Average progress ${c.avgProgress}%</div></div></a>`).join('')}</div>` : '<p class="text-sm s-muted mt-3">No courses yet.</p>'}</section>
                <section class="s-card p-5"><div class="flex items-center justify-between"><h2 class="s-h2">Upcoming</h2><a href="/staff/schedule" class="text-xs font-semibold text-forest-600">Schedule</a></div>
                    ${d.events.length ? `<div class="divide-y divide-[#F1F3F5] mt-1">${d.events.map(S.eventRow).join('')}</div>` : '<p class="text-sm s-muted mt-3">Nothing scheduled.</p>'}</section>
            </div>
            <div class="grid xl:grid-cols-3 gap-5 mt-5">
                ${has(me, 'grade_students') ? `<section class="s-card p-5"><div class="flex items-center justify-between"><h2 class="s-h2">Recent submissions</h2><a href="/staff/grading" class="text-xs font-semibold text-forest-600">Grading</a></div>
                    ${d.recentSubmissions.length ? `<div class="divide-y divide-[#F1F3F5] mt-1">${d.recentSubmissions.map(s => `<a href="/staff/grading?s=${s.id}" class="flex items-center gap-3 py-3 group"><div class="min-w-0 flex-1"><div class="text-sm font-medium text-slate-900 truncate group-hover:underline">${esc(s.student)}</div><div class="text-xs s-muted truncate">${esc(s.title)} · ${ui.timeAgo(s.submittedAt)}</div></div>${S.statusChip(s.status)}</a>`).join('')}</div>` : '<p class="text-sm s-muted mt-3">No submissions yet.</p>'}</section>` : ''}
                ${has(me, 'view_students') ? `<section class="s-card p-5"><h2 class="s-h2">Students who may need a nudge</h2><p class="text-xs s-muted">Inactive for 7+ days and not finished</p>
                    ${d.atRisk.length ? `<div class="divide-y divide-[#F1F3F5] mt-2">${d.atRisk.map(s => `<a href="/staff/students/${s.id}" class="flex items-center gap-3 py-2.5">${SP.personRow(s, esc(s.course) + ' · ' + s.pct + '%')}</a>`).join('')}</div>` : '<p class="text-sm s-muted mt-3"><i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i>Everyone is active.</p>'}</section>` : ''}
                <section class="s-card overflow-hidden"><div class="flex items-center justify-between px-5 pt-5 pb-3"><h2 class="s-h2">Notifications</h2><a href="/staff/notifications" class="text-xs font-semibold text-forest-600">View all</a></div>
                    ${d.notifications.length ? `<div class="divide-y divide-[#F1F3F5]">${d.notifications.map(n => S.notificationRow(n, true)).join('')}</div>` : '<p class="px-5 pb-5 text-sm s-muted">No notifications.</p>'}</section>
            </div>`;
        el.querySelectorAll('[data-notif-link]').forEach(a => a.addEventListener('click', () => sapi.markNotification(a.dataset.notifLink)));
    } });

    // ---------------- Students ----------------
    S.route('/staff/students', { title: 'Students', nav: 'students', live: true, skeleton: 'list', render: async el => {
        if (!has(S.me, 'view_students')) { el.innerHTML = S.pageHeader('Students') + SP.permNote('view_students'); return; }
        const rows = await sapi.students();
        const courses = [...new Set(rows.map(r => r.course))].sort();
        let q = '', course = '';
        const draw = () => {
            const list = rows.filter(r => (!course || r.course === course) && (!q || (r.name + ' ' + r.email + ' ' + (r.studentId || '')).toLowerCase().includes(q)));
            el.querySelector('#tbl').innerHTML = list.length ? `<div class="s-card overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-[11px] uppercase tracking-wider s-muted border-b border-[#EEF0F3]"><th class="p-4">Student</th><th class="p-4">Course</th><th class="p-4">Progress</th><th class="p-4">Last active</th><th class="p-4"></th></tr></thead>
                <tbody class="divide-y divide-[#F1F3F5]">${list.map(r => `<tr class="hover:bg-slate-50/60"><td class="p-4"><a href="/staff/students/${r.id}">${SP.personRow(r, esc(r.studentId || r.email))}</a></td><td class="p-4">${esc(r.course)}</td><td class="p-4 w-48">${S.bar(r.pct)}<div class="text-xs s-muted mt-1">${r.done}/${r.total} lessons · ${r.pct}%</div></td><td class="p-4 text-xs s-muted">${r.lastAccessAt ? ui.timeAgo(r.lastAccessAt) : 'Never'}</td><td class="p-4 text-right"><a href="/staff/students/${r.id}" class="btn btn-outline btn-sm">View</a></td></tr>`).join('')}</tbody></table></div>`
                : S.empty('fa-user-graduate', rows.length ? 'No students match' : 'No students yet', rows.length ? '' : 'Students enrolled in your courses appear here.');
        };
        el.innerHTML = S.pageHeader('Students', `${ui.plural(new Set(rows.map(r => r.id)).size, 'student')} across your courses`) + `<div class="s-card p-3 flex flex-col sm:flex-row gap-3 mb-5"><div class="relative flex-1"><i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i><input id="sq" type="search" class="field h-11 pl-9" placeholder="Search name, email or student ID" aria-label="Search students"></div><select id="sc" class="field h-11 sm:w-64" aria-label="Filter by course"><option value="">All my courses</option>${courses.map(c => `<option>${esc(c)}</option>`).join('')}</select></div><div id="tbl"></div>`;
        el.querySelector('#sq').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
        el.querySelector('#sc').onchange = e => { course = e.target.value; draw(); };
        draw();
    } });
    S.route('/staff/students/:id', { title: 'Student', nav: 'students', live: true, render: async (el, { id }) => {
        const s = await sapi.student(id);
        S.setTitle(s.name);
        el.innerHTML = `<a href="/staff/students" class="text-sm s-muted hover:text-slate-900"><i class="fa-solid fa-arrow-left mr-2"></i>Students</a>
            <div class="s-card p-6 mt-4 flex flex-wrap items-center gap-4">${S.avatar(s, 56)}<div class="flex-1 min-w-0"><h1 class="text-xl font-bold text-slate-900">${esc(s.name)}</h1><div class="text-sm s-muted"><span class="font-mono">${esc(s.studentId || '')}</span> · ${esc(s.email)}</div></div>${has(S.me, 'message_students') ? '<button id="msg" class="btn btn-forest btn-sm"><i class="fa-regular fa-envelope"></i>Message</button>' : ''}</div>
            <div class="grid xl:grid-cols-[1fr_360px] gap-5 mt-5 items-start">
                <div class="space-y-5">${s.courses.map(c => `<section class="s-card p-5"><div class="flex items-center justify-between gap-3"><h2 class="s-h2">${esc(c.title)}</h2><span class="text-sm font-semibold">${c.pct}%</span></div><div class="mt-2">${S.bar(c.pct)}</div>
                    <div class="text-xs s-muted mt-2">${c.done}/${c.total} lessons${c.current ? ' · Current: ' + esc(c.current) : ''} · ${c.lastAccessAt ? 'active ' + ui.timeAgo(c.lastAccessAt) : 'not started'}</div>
                    <div class="grid sm:grid-cols-2 gap-2 mt-4">${c.sections.map(x => `<div class="flex items-center gap-2 text-sm"><i class="fa-solid ${x.status === 'complete' ? 'fa-circle-check text-emerald-500' : x.status === 'in_progress' ? 'fa-circle-half-stroke text-sky-500' : 'fa-circle text-slate-200'}"></i><span class="truncate flex-1">${esc(x.title)}</span><span class="text-xs s-muted">${x.pct}%</span></div>`).join('')}</div></section>`).join('')}</div>
                <aside class="space-y-5">
                    <section class="s-card p-5"><h2 class="s-h2">Quiz attempts</h2>${s.quizzes.length ? `<div class="divide-y divide-[#F1F3F5] mt-2">${s.quizzes.map(q => `<div class="flex justify-between py-2 text-sm"><span class="truncate">${esc(q.title)}</span><b class="${q.passed ? 'text-emerald-600' : 'text-rose-600'}">${q.percent}%</b></div>`).join('')}</div>` : '<p class="text-sm s-muted mt-2">None yet.</p>'}</section>
                    <section class="s-card p-5"><h2 class="s-h2">Submissions</h2>${s.submissions.length ? `<div class="divide-y divide-[#F1F3F5] mt-2">${s.submissions.map(x => `<a href="/staff/grading?s=${x.id}" class="flex items-center justify-between gap-2 py-2 text-sm hover:underline"><span class="truncate">${esc(x.title)}</span>${x.status === 'graded' ? `<b>${x.score}/${x.maxScore}</b>` : S.statusChip(x.status)}</a>`).join('')}</div>` : '<p class="text-sm s-muted mt-2">None yet.</p>'}</section>
                </aside></div>`;
        const m = el.querySelector('#msg'); if (m) m.onclick = () => SP.composeTo(s.id, s.name);
    } });
    SP.composeTo = (studentId, name) => {
        const m = ui.modal({ title: 'Message ' + name, body: `<form class="space-y-4"><div><label class="field-label" for="su">Subject</label><input id="su" required maxlength="120" class="field"></div><div><label class="field-label" for="bo">Message</label><textarea id="bo" required rows="5" class="field"></textarea></div><div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Send</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = async e => { e.preventDefault(); try { const cv = await sapi.messageStudent(studentId, m.el.querySelector('#su').value, m.el.querySelector('#bo').value); m.close(); ui.toast('Message sent'); S.go('/staff/messages/' + cv.id); } catch (x) { ui.toast(x.message, 'error'); } };
    };

    // ---------------- Messages ----------------
    const msgRoute = { title: 'Messages', nav: 'messages', live: true, render: async (el, params) => {
        const list = await sapi.conversations(), activeId = params.id || null, thread = activeId ? await sapi.conversation(activeId) : null;
        S.refreshCounts();
        const canReply = has(S.me, 'message_students');
        el.innerHTML = `<div class="hidden lg:block">${S.pageHeader('Messages', 'Conversations with your students.', canReply && has(S.me, 'view_students') ? '<button data-new class="btn btn-forest btn-sm"><i class="fa-solid fa-pen-to-square"></i>Message a student</button>' : '')}</div>
            <div class="s-card overflow-hidden grid lg:grid-cols-[340px_1fr] h-[calc(100vh-210px)] lg:h-[calc(100vh-220px)] min-h-[480px]">
                <div class="${thread ? 'hidden lg:flex' : 'flex'} flex-col border-r border-[#EEF0F3] min-h-0"><div id="cl" class="flex-1 overflow-y-auto thin-scroll"></div></div>
                <div class="${thread ? 'flex' : 'hidden lg:flex'} flex-col min-h-0" id="tp"></div></div>`;
        el.querySelector('#cl').innerHTML = list.length ? list.map(c => `<a href="/staff/messages/${c.id}" class="flex gap-3 px-4 py-3.5 border-b border-[#F1F3F5] ${c.id === activeId ? 'bg-forest-50/70' : 'hover:bg-slate-50'}">${S.avatar({ name: c.with }, 40)}<div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><span class="text-sm ${c.unread ? 'font-semibold' : 'font-medium'} text-slate-900 truncate">${esc(c.with)}</span><span class="text-[11px] text-slate-400 shrink-0">${ui.timeAgo(c.lastMessageAt)}</span></div><div class="text-xs text-slate-600 truncate">${esc(c.subject)}</div><div class="flex items-center gap-2"><span class="text-xs s-muted truncate flex-1">${esc(c.preview)}</span>${c.unread ? `<span class="s-badge">${c.unread}</span>` : ''}</div></div></a>`).join('') : '<div class="p-8 text-center text-sm s-muted">No messages yet.</div>';
        const tp = el.querySelector('#tp');
        if (!thread) tp.innerHTML = '<div class="m-auto text-center p-8"><span class="w-14 h-14 mx-auto rounded-2xl bg-forest-50 text-forest flex items-center justify-center text-xl"><i class="fa-regular fa-comments"></i></span><p class="font-semibold text-slate-900 mt-4">Select a conversation</p><p class="text-sm s-muted mt-1">Student questions addressed to you appear here.</p></div>';
        else {
            tp.innerHTML = `<div class="px-5 py-3 border-b border-[#EEF0F3] flex items-center gap-3"><a href="/staff/messages" class="lg:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></a>${S.avatar({ name: thread.with }, 38)}<div class="min-w-0"><div class="font-semibold text-slate-900 truncate">${esc(thread.with)}</div><div class="text-xs s-muted truncate">${esc(thread.subject)}${thread.course ? ' · ' + esc(thread.course) : ''}</div></div></div>
                <div id="ms" class="flex-1 overflow-y-auto thin-scroll p-5 space-y-4 bg-[#FAFBFC]">${thread.messages.map(m => `<div class="flex ${m.mine ? 'justify-end' : ''}"><div><div class="bubble ${m.mine ? 'mine' : 'theirs'}">${esc(m.body)}${(m.attachments || []).map(a => `<a href="${esc(a.url)}" download="${esc(a.name)}" class="mt-2 flex items-center gap-2 text-xs underline"><i class="fa-solid fa-paperclip"></i>${esc(a.name)}</a>`).join('')}</div><div class="text-[11px] text-slate-400 mt-1 ${m.mine ? 'text-right' : ''}">${esc(m.senderName)} · ${ui.fmtDateTime(m.createdAt)}${m.mine && m.readAt ? ' · Seen' : ''}</div></div></div>`).join('')}</div>
                ${canReply ? `<form id="rf" class="p-4 border-t border-[#EEF0F3] flex gap-2"><label for="rb" class="sr-only">Reply</label><textarea id="rb" rows="1" class="field resize-none" placeholder="Write a reply… (Enter to send)"></textarea><button class="btn btn-forest h-10 px-4" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button></form>` : `<div class="p-4 border-t">${SP.permNote('message_students')}</div>`}`;
            const box = tp.querySelector('#ms'); box.scrollTop = box.scrollHeight;
            const rf = tp.querySelector('#rf');
            if (rf) { const ta = tp.querySelector('#rb'); ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); rf.requestSubmit(); } };
                rf.onsubmit = async e => { e.preventDefault(); try { await sapi.reply(thread.id, ta.value); ta.value = ''; S.dispatchQuiet(); } catch (x) { ui.toast(x.message, 'error'); } }; }
        }
        const nb = el.querySelector('[data-new]');
        if (nb) nb.onclick = async () => {
            const studs = await sapi.students(), uniq = studs.filter((s, i) => studs.findIndex(x => x.id === s.id) === i);
            const m = ui.modal({ title: 'Message a student', body: `<form class="space-y-4"><div><label class="field-label" for="ws">Student</label><select id="ws" class="field">${uniq.map(s => `<option value="${s.id}">${esc(s.name)} — ${esc(s.course)}</option>`).join('')}</select></div><div class="flex justify-end"><button class="btn btn-forest btn-sm">Continue</button></div></form>` });
            m.el.querySelector('form').onsubmit = e => { e.preventDefault(); const s = uniq.find(x => x.id === m.el.querySelector('#ws').value); m.close(); SP.composeTo(s.id, s.name); };
        };
    } };
    S.route('/staff/messages', msgRoute);
    S.route('/staff/messages/:id', msgRoute);

    // ---------------- Announcements ----------------
    S.route('/staff/announcements', { title: 'Announcements', nav: 'announcements', live: true, skeleton: 'list', render: async el => {
        const list = await sapi.announcements(), canPost = has(S.me, 'post_announcements');
        el.innerHTML = S.pageHeader('Announcements', 'School-wide news and announcements for your courses.', canPost ? '<button id="post" class="btn btn-forest btn-sm"><i class="fa-solid fa-bullhorn"></i>Post to a course</button>' : '')
            + (list.length ? `<div class="space-y-3">${list.map(a => `<article class="s-card p-5"><div class="flex flex-wrap items-center gap-2 text-xs s-muted"><span class="s-chip ${a.courseId ? 'bg-sky-50 text-sky-700' : 'bg-forest-50 text-forest'}">${a.courseId ? esc(a.course) : 'School-wide'}</span><span>${ui.fmtDate(a.createdAt)} · ${esc(a.authorName || 'Tech Oasis School')}</span></div><h2 class="font-semibold text-slate-900 mt-2">${esc(a.title)}</h2><p class="text-sm text-slate-700 mt-1 whitespace-pre-line">${esc(a.body)}</p></article>`).join('')}</div>` : S.empty('fa-bullhorn', 'No announcements'));
        const p = el.querySelector('#post');
        if (p) p.onclick = async () => {
            const courses = await sapi.courses().catch(() => []);
            const m = ui.modal({ title: 'Post a course announcement', body: `<form class="space-y-4"><div><label class="field-label" for="ac">Course</label><select id="ac" class="field">${courses.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></div><div><label class="field-label" for="at">Title</label><input id="at" required maxlength="120" class="field"></div><div><label class="field-label" for="ab">Message</label><textarea id="ab" required rows="4" class="field"></textarea></div><p class="text-xs s-muted">Every student in the course is notified.</p><div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Publish</button></div></form>` });
            m.el.querySelector('[data-c]').onclick = m.close;
            m.el.querySelector('form').onsubmit = async e => { e.preventDefault(); try { await sapi.postAnnouncement({ courseId: m.el.querySelector('#ac').value, title: m.el.querySelector('#at').value, body: m.el.querySelector('#ab').value }); m.close(); ui.toast('Announcement published'); S.dispatchQuiet(); } catch (x) { ui.toast(x.message, 'error'); } };
        };
    } });

    // ---------------- Notifications ----------------
    S.route('/staff/notifications', { title: 'Notifications', nav: 'notifications', live: true, skeleton: 'list', render: async el => {
        const list = await sapi.notifications(), unread = list.filter(n => !n.readAt).length;
        el.innerHTML = S.pageHeader('Notifications', unread ? unread + ' unread' : 'Updates about your courses, students and account.', unread ? '<button id="ra" class="btn btn-outline btn-sm"><i class="fa-solid fa-check-double"></i>Mark all as read</button>' : '')
            + (list.length ? `<div class="s-card overflow-hidden divide-y divide-[#F1F3F5]">${list.map(n => `<div class="flex items-stretch">${S.notificationRow(n).replace('class="flex gap-3', 'class="flex-1 min-w-0 flex gap-3')}<button data-del="${n.id}" class="px-4 text-slate-400 hover:text-rose-600" aria-label="Delete notification"><i class="fa-solid fa-trash text-xs"></i></button></div>`).join('')}</div>` : S.empty('fa-bell-slash', 'No notifications', "You're all caught up."));
        const ra = el.querySelector('#ra'); if (ra) ra.onclick = async () => { await sapi.markAllNotifications(); S.dispatchQuiet(); S.refreshCounts(); };
        el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await sapi.deleteNotification(b.dataset.del); S.dispatchQuiet(); S.refreshCounts(); });
        el.querySelectorAll('[data-notif-link]').forEach(a => a.addEventListener('click', () => sapi.markNotification(a.dataset.notifLink).then(S.refreshCounts)));
    } });

    // ---------------- Schedule ----------------
    S.route('/staff/schedule', { title: 'Schedule', nav: 'schedule', live: true, skeleton: 'list', render: async el => {
        const events = await sapi.schedule(), canAdd = has(S.me, 'manage_schedule');
        const from = new Date(); from.setHours(0, 0, 0, 0);
        const up = events.filter(e => new Date(e.endsAt || e.startsAt) >= from), groups = {};
        up.forEach(e => { const k = new Date(e.startsAt).toDateString(); (groups[k] = groups[k] || []).push(e); });
        el.innerHTML = S.pageHeader('Schedule', 'Classes, exams and school events for your courses.', canAdd ? '<button id="add" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Schedule a class</button>' : '')
            + (up.length ? `<div class="s-card overflow-hidden">${Object.keys(groups).map(k => { const d = new Date(k); return `<div class="flex gap-4 px-5 py-4 border-b border-[#F1F3F5]"><div class="w-14 shrink-0 text-center"><div class="text-[11px] font-bold uppercase text-rose-600">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div><div class="text-2xl font-bold text-slate-900 leading-none mt-0.5">${d.getDate()}</div><div class="text-[11px] s-muted">${d.toLocaleDateString(undefined, { month: 'short' })}</div></div>
                <div class="flex-1 space-y-2">${groups[k].map(e => { const T = TOS.engage.EVENT_TYPES[e.type] || TOS.engage.EVENT_TYPES.event; return `<div class="flex items-center gap-3 rounded-xl border border-[#EEF0F3] p-3"><span class="w-9 h-9 rounded-lg ${S.EVT_STYLE[e.type] || 'bg-slate-100'} flex items-center justify-center text-sm shrink-0"><i class="fa-solid ${T[1]}"></i></span><div class="min-w-0 flex-1"><div class="text-sm font-medium text-slate-900">${esc(e.title)}</div><div class="text-xs s-muted">${new Date(e.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${T[0]}${e.course ? ' · ' + esc(e.course) : ' · School-wide'}${e.location ? ' · ' + esc(e.location) : ''}</div></div>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">Join</a>` : ''}${canAdd && e.mine ? `<button data-del="${e.id}" class="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label="Remove event"><i class="fa-solid fa-trash text-xs"></i></button>` : ''}</div>`; }).join('')}</div></div>`; }).join('')}</div>`
                : S.empty('fa-calendar-days', 'Nothing scheduled', canAdd ? 'Schedule a live class or exam for one of your courses.' : ''));
        el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Remove this event? Students in the course are notified that it was cancelled.', { okText: 'Remove', danger: true })) { await sapi.deleteEvent(b.dataset.del); S.dispatchQuiet(); } });
        const add = el.querySelector('#add');
        if (add) add.onclick = async () => {
            const courses = await sapi.courses().catch(() => []);
            const m = ui.modal({ title: 'Schedule a class', size: 'max-w-lg', body: `<form class="space-y-4"><div class="grid sm:grid-cols-2 gap-3"><div><label class="field-label" for="ec">Course</label><select id="ec" class="field">${courses.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></div><div><label class="field-label" for="et">Type</label><select id="et" class="field"><option value="class">Live class</option><option value="exam">Exam</option><option value="quiz">Quiz deadline</option><option value="deadline">Deadline</option></select></div></div>
                <div><label class="field-label" for="en">Title</label><input id="en" required class="field" placeholder="e.g. Week 3 live Q&A"></div>
                <div class="grid sm:grid-cols-2 gap-3"><div><label class="field-label" for="es">Starts</label><input id="es" type="datetime-local" required class="field"></div><div><label class="field-label" for="ee">Ends</label><input id="ee" type="datetime-local" class="field"></div></div>
                <div class="grid sm:grid-cols-2 gap-3"><div><label class="field-label" for="el">Location</label><input id="el" class="field" value="Online · Live classroom"></div><div><label class="field-label" for="eu">Join link</label><input id="eu" type="url" class="field" placeholder="https://"></div></div>
                <p class="text-xs s-muted">Students in the course are notified and see it in their calendar.</p><div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Add to schedule</button></div></form>` });
            m.el.querySelector('[data-c]').onclick = m.close;
            m.el.querySelector('form').onsubmit = async e => { e.preventDefault(); const g = id => m.el.querySelector(id).value;
                try { await sapi.addEvent({ courseId: g('#ec'), type: g('#et'), title: g('#en'), startsAt: g('#es'), endsAt: g('#ee'), location: g('#el'), url: g('#eu') }); m.close(); ui.toast('Added to the schedule'); S.dispatchQuiet(); } catch (x) { ui.toast(x.message, 'error'); } };
        };
    } });

    // ---------------- Profile ----------------
    S.route('/staff/profile', { title: 'Profile', nav: 'profile', render: async el => {
        const me = await sapi.me();
        const locked = '<i class="fa-solid fa-lock text-[10px] text-slate-300 ml-1" title="Managed by the school"></i>';
        const field = (l, v, lock) => `<div><dt class="text-xs s-muted">${l}${lock ? locked : ''}</dt><dd class="text-sm font-medium text-slate-900 mt-0.5 break-words">${v || '<span class="text-slate-400 font-normal">Not set</span>'}</dd></div>`;
        el.innerHTML = S.pageHeader('My Profile', 'Fields with a lock are managed by the school administration.')
            + `<div class="grid xl:grid-cols-[1fr_380px] gap-5 items-start"><div class="space-y-5">
                <section class="s-card overflow-hidden"><div class="h-24 bg-gradient-to-r from-ink via-forest to-forest-600"></div><div class="px-6 pb-6 -mt-10 flex flex-wrap items-end gap-4">
                    <div class="relative"><div class="rounded-full ring-4 ring-white">${S.avatar(me, 88)}</div><label class="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white border shadow flex items-center justify-center cursor-pointer" title="Change photo"><i class="fa-solid fa-camera text-xs text-slate-600"></i><input type="file" id="av" accept="image/*" class="hidden"><span class="sr-only">Change photo</span></label></div>
                    <div class="flex-1 min-w-0"><h2 class="text-xl font-bold text-slate-900">${esc(me.name)}</h2><div class="text-sm s-muted">${esc(me.title || me.roleLabel)} · ${esc(me.email)}</div></div><span class="s-chip bg-emerald-50 text-emerald-700 !text-xs !px-3 !py-1 capitalize">${esc(me.status)}</span></div></section>
                <section class="s-card p-6"><h2 class="s-h2 mb-4">Staff record</h2><dl class="grid sm:grid-cols-2 gap-5">${field('Full name', esc(me.name), 1)}${field('Email', esc(me.email), 1)}${field('Role', esc(me.roleLabel), 1)}${field('Department', esc(me.department), 1)}${field('Account status', `<span class="capitalize">${esc(me.status)}</span>`, 1)}${field('Approved', me.approvedAt ? ui.fmtDate(me.approvedAt) : 'Created by administrator', 1)}${field('Assigned courses', me.courseCount, 1)}${field('Last sign-in', me.lastLoginAt ? ui.fmtDateTime(me.lastLoginAt) : '—', 1)}</dl>
                    ${me.application ? `<p class="text-xs s-muted mt-5">Applied ${ui.fmtDate(me.application.submittedAt)} to teach ${esc((me.application.subjects || []).join(', '))}.</p>` : ''}</section>
                <form id="pf" class="s-card p-6 space-y-4"><h2 class="s-h2">Public profile</h2><p class="text-xs s-muted -mt-2">Shown to students on course pages.</p>
                    <div class="grid sm:grid-cols-2 gap-4"><div><label class="field-label" for="ti">Title</label><input id="ti" maxlength="80" class="field" value="${esc(me.title)}"></div><div><label class="field-label" for="ph">Phone</label><input id="ph" type="tel" class="field" value="${esc(me.phone)}"></div></div>
                    <div><label class="field-label" for="bi">Bio</label><textarea id="bi" rows="4" maxlength="1200" class="field">${esc(me.bio)}</textarea></div><button class="btn btn-forest btn-sm">Save changes</button></form>
            </div><aside class="s-card p-5"><h2 class="s-h2">Your permissions</h2><p class="text-xs s-muted mt-1">Set by the school administration.</p>
                <ul class="mt-4 space-y-3">${Object.entries(ST.PERMISSIONS).map(([k, [l, d]]) => { const on = me.permissions.includes(k); return `<li class="flex gap-3 text-sm"><i class="fa-solid ${on ? 'fa-circle-check text-emerald-500' : 'fa-circle-xmark text-slate-300'} mt-0.5"></i><span><span class="${on ? 'text-slate-900' : 'text-slate-400'}">${l}</span><span class="block text-xs s-muted">${d}</span></span></li>`; }).join('')}</ul></aside></div>`;
        el.querySelector('#pf').onsubmit = async e => { e.preventDefault(); await sapi.updateProfile({ title: el.querySelector('#ti').value, phone: el.querySelector('#ph').value, bio: el.querySelector('#bi').value }); ui.toast('Profile saved'); await S.refreshMe(); };
        el.querySelector('#av').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 1048576) return ui.toast('Choose an image under 1 MB.', 'error'); await sapi.updateProfile({ avatar: await ui.readFile(f) }); await S.refreshMe(); S.dispatchQuiet(); };
    } });

    // ---------------- Settings ----------------
    S.route('/staff/settings', { title: 'Settings', nav: 'settings', render: async el => {
        const me = await sapi.me(), notify = (me.prefs && me.prefs.notify) || {};
        const types = ['message', 'submission', 'announcement', 'schedule', 'system'];
        el.innerHTML = S.pageHeader('Settings', 'Security and notification preferences.') + `<div class="space-y-5 max-w-3xl">
            <form id="pw" class="s-card p-6 space-y-4"><h2 class="s-h2">Change password</h2><div class="grid sm:grid-cols-3 gap-4"><div><label class="field-label" for="c0">Current</label><input id="c0" type="password" required autocomplete="current-password" class="field"></div><div><label class="field-label" for="c1">New</label><input id="c1" type="password" required minlength="8" autocomplete="new-password" class="field"></div><div><label class="field-label" for="c2">Confirm new</label><input id="c2" type="password" required minlength="8" autocomplete="new-password" class="field"></div></div><p id="pe" class="hidden text-sm text-rose-700" role="alert"></p><button class="btn btn-forest btn-sm">Update password</button></form>
            <form id="nf" class="s-card p-6"><h2 class="s-h2">Notifications</h2><div class="divide-y divide-[#F1F3F5] mt-2">${types.map(k => `<label class="flex items-center justify-between gap-4 py-3 cursor-pointer"><span class="text-sm font-medium text-slate-900">${TOS.engage.TYPES[k].label}</span><span class="switch"><input type="checkbox" name="${k}" ${notify[k] !== false ? 'checked' : ''}><span></span></span></label>`).join('')}</div><button class="btn btn-forest btn-sm mt-4">Save</button></form>
            <section class="s-card p-6 text-sm text-slate-600"><h2 class="s-h2 mb-2">Account</h2>Your role, permissions, department and account status are managed by the school administration. To change them, contact <a class="underline" href="mailto:${esc(db.settings().school.email)}">${esc(db.settings().school.email)}</a>.</section></div>`;
        el.querySelector('#pw').onsubmit = async e => { e.preventDefault(); const pe = el.querySelector('#pe'); pe.classList.add('hidden'); const n = el.querySelector('#c1').value;
            if (n !== el.querySelector('#c2').value) { pe.textContent = 'The new passwords do not match.'; return pe.classList.remove('hidden'); }
            try { await sapi.changePassword(el.querySelector('#c0').value, n); e.target.reset(); ui.toast('Password updated'); } catch (x) { pe.textContent = x.message; pe.classList.remove('hidden'); } };
        el.querySelector('#nf').onsubmit = async e => { e.preventDefault(); const n = {}; types.forEach(k => n[k] = e.target.elements[k].checked); await sapi.updatePrefs({ notify: n }); ui.toast('Notification settings saved'); };
    } });

    // ---------------- Help ----------------
    S.route('/staff/help', { title: 'Help', nav: 'help', render: el => {
        const st = db.settings().school;
        const faqs = [['Why can\'t I see a menu item?', 'Menu items appear based on the permissions the administration assigned to your role. Contact the school if you need more access.'], ['How do I get assigned to a course?', 'Course assignments are made by the administration. Ask them to add you as an instructor on the course.'], ['A student can\'t message me.', 'Students can only message instructors of courses they are enrolled in, and only if you have the "Message students" permission.'], ['How do grades reach students?', 'As soon as you save a grade the student is notified, and the score and feedback appear in their portal.']];
        el.innerHTML = S.pageHeader('Help', 'Answers for staff, and how to reach the administration.') + `<div class="grid xl:grid-cols-2 gap-5 items-start">
            <section class="s-card p-6"><h2 class="s-h2">FAQs</h2><div class="divide-y divide-[#F1F3F5] mt-2">${faqs.map(([q, a]) => `<details class="group py-3.5"><summary class="list-none cursor-pointer flex items-center justify-between gap-4 text-sm font-medium text-slate-900">${esc(q)}<i class="fa-solid fa-plus text-xs text-slate-400 group-open:rotate-45 transition"></i></summary><p class="text-sm s-muted mt-2">${esc(a)}</p></details>`).join('')}</div></section>
            <section class="s-card p-6"><h2 class="s-h2">Contact the administration</h2><a href="mailto:${esc(st.email)}" class="flex items-center gap-3 mt-4 rounded-xl border border-[#EEF0F3] p-4 hover:border-forest-200"><span class="w-10 h-10 rounded-xl bg-forest-50 text-forest flex items-center justify-center"><i class="fa-regular fa-envelope"></i></span><span><span class="block text-sm font-medium text-slate-900">${esc(st.email)}</span><span class="block text-xs s-muted">Roles, permissions, course assignments, account questions</span></span></a></section></div>`;
    } });
})();
