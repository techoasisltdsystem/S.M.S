// Admin ↔ Student Portal: messages inbox, academic calendar, support tickets, notifications and portal settings.
(function () {
    const E = TOS.engage;
    // Navigation additions
    A.NAV.find(g => g.title === 'Engagement').items.unshift(['messages', 'Messages', 'fa-envelope'], ['support', 'Support Tickets', 'fa-life-ring']);
    A.NAV.find(g => g.title === 'Engagement').items.push(['notifications', 'Send Notification', 'fa-paper-plane']);
    A.NAV.find(g => g.title === 'People').items.push(['calendar', 'Academic Calendar', 'fa-calendar-days']);
    A.NAV.find(g => g.title === 'Settings').items.push(['settings/portal', 'Student Portal', 'fa-id-badge']);
    A.extraBadges = { messages: () => E.unreadMessagesForStaff(() => true), support: () => db.count('support_tickets', { status: 'open' }) };

    const student = id => db.get('users', id) || { name: 'Deleted student', email: '' };

    // ---------------- Messages ----------------
    const inbox = (_, p) => {
        A.crumbs('Messages');
        const activeId = p.c || null;
        let filter = p.f || 'all';
        const draw = () => {
            const convs = db.all('conversations').filter(cv => A.matches(student(cv.studentId).name, cv.subject, E.conversationName(cv)))
                .map(cv => Object.assign({ unread: db.count('messages', m => m.conversationId === cv.id && m.senderId === cv.studentId && !m.readAt) }, cv))
                .filter(cv => filter === 'all' || cv.unread).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
            document.getElementById('cl').innerHTML = convs.map(cv => `<a href="#/messages?c=${cv.id}&f=${filter}" class="flex gap-3 px-4 py-3 border-b border-slate-100 ${cv.id === activeId ? 'bg-forest-50' : 'hover:bg-slate-50'}">${A.avatar(student(cv.studentId).name)}
                <div class="min-w-0 flex-1"><div class="flex justify-between gap-2"><span class="text-sm ${cv.unread ? 'font-semibold' : 'font-medium'} text-ink truncate">${esc(student(cv.studentId).name)}</span><span class="text-[11px] text-slate-400 shrink-0">${ui.timeAgo(cv.lastMessageAt)}</span></div>
                <div class="text-xs text-slate-600 truncate">${esc(cv.subject)}</div><div class="flex items-center gap-2 mt-0.5"><span class="text-[11px] text-slate-400 truncate flex-1">To: ${esc(E.conversationName(cv))}</span>${cv.unread ? `<span class="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">${cv.unread}</span>` : ''}</div></div></a>`).join('') || '<p class="p-6 text-sm text-slate-500 text-center">No conversations.</p>';
        };
        const cv = activeId && db.get('conversations', activeId);
        if (cv) E.markConversationRead(cv.id, 'staff');
        const msgs = cv ? db.where('messages', { conversationId: cv.id }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) : [];
        A.view().innerHTML = A.header('Messages', 'Conversations between students, instructors and the support team.', '<button id="newMsg" class="btn btn-forest btn-sm"><i class="fa-solid fa-pen-to-square"></i>Message a student</button>')
            + `<div class="bg-white rounded-2xl border border-slate-200/80 overflow-hidden grid lg:grid-cols-[340px_1fr] min-h-[560px]">
                <div class="border-r border-slate-100 flex flex-col"><div class="p-3 border-b border-slate-100 flex gap-2">${['all', 'unread'].map(k => `<a href="#/messages?f=${k}${activeId ? '&c=' + activeId : ''}" class="h-8 px-3 rounded-full text-xs font-semibold flex items-center ${filter === k ? 'bg-ink text-white' : 'bg-slate-100'}">${k === 'all' ? 'All' : 'Needs reply'}</a>`).join('')}</div><div id="cl" class="flex-1 overflow-y-auto thin-scroll max-h-[620px]"></div></div>
                <div class="flex flex-col">${cv ? `<div class="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">${A.person(student(cv.studentId).name, student(cv.studentId).email + ' · ' + (student(cv.studentId).studentId || ''))}<div class="ml-auto text-right"><div class="text-sm font-semibold text-ink">${esc(cv.subject)}</div><div class="text-xs text-slate-500">To ${esc(E.conversationName(cv))}${cv.courseId ? ' · ' + esc(A.courseTitle(cv.courseId)) : ''}</div></div></div>
                    <div id="thread" class="flex-1 overflow-y-auto thin-scroll p-5 space-y-3 bg-slate-50/60 max-h-[520px]">${msgs.map(m => { const st = m.senderId === cv.studentId; return `<div class="flex ${st ? 'justify-start' : 'justify-end'}"><div class="max-w-[78%]"><div class="rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line break-words ${st ? 'bg-white border border-slate-200' : 'bg-forest text-white'}">${esc(m.body)}${(m.attachments || []).map(a => `<a href="${esc(a.url)}" download="${esc(a.name)}" class="block mt-1 text-xs underline"><i class="fa-solid fa-paperclip"></i> ${esc(a.name)}</a>`).join('')}</div><div class="text-[11px] text-slate-400 mt-1 ${st ? '' : 'text-right'}">${esc(m.senderName || '')} · ${ui.fmtDateTime(m.createdAt)}${!st && m.readAt ? ' · Seen' : ''}</div></div></div>`; }).join('')}</div>
                    <form id="rf" class="p-4 border-t border-slate-100 flex gap-2"><textarea name="body" rows="2" required class="field" placeholder="Reply as ${esc(cv.recipientType === 'instructor' ? 'Tech Oasis Team (on behalf of the instructor)' : E.conversationName(cv))}"></textarea><button class="btn btn-forest self-end">Send</button></form>`
                    : A.empty('fa-comments', 'Select a conversation', 'Student messages to instructors, support and administration appear here.')}</div></div>`;
        draw(); A.bindSearch(draw);
        const th = document.getElementById('thread'); if (th) th.scrollTop = th.scrollHeight;
        const rf = document.getElementById('rf');
        if (rf) rf.onsubmit = e => { e.preventDefault(); E.sendMessage(cv.id, { senderId: null, senderName: cv.recipientType === 'admin' ? 'School Administration' : 'Tech Oasis Support', senderRole: 'admin', body: A.formData(rf).body }); ui.toast('Reply sent. The student has been notified.'); A.refresh(); };
        document.getElementById('newMsg').onclick = () => A.messageStudent(null, c => location.hash = '#/messages?c=' + c.id);
        A.renderNav('messages');
    };
    A.route('messages', inbox);
    A.messageStudent = function (userId, done) {
        const students = db.where('users', { role: 'student' }).sort((a, b) => a.name.localeCompare(b.name));
        const m = ui.modal({ title: 'Message a student', body: `<form class="space-y-4">${A.field('Student', A.select('userId', students.map(u => [u.id, `${u.name} — ${u.studentId || u.email}`]), userId || '', 'required'))}${A.field('Subject', A.input('subject', '', 'required maxlength="120"'))}${A.field('Message', A.textarea('body', '', 5, 'required'))}<div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Send message</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target); const cv = E.staffStartConversation(d.userId, { senderId: null, senderName: 'Tech Oasis Support', senderRole: 'admin', subject: d.subject, body: d.body }); m.close(); ui.toast('Message sent'); done && done(cv); };
    };

    // ---------------- Academic calendar ----------------
    A.route('calendar', () => {
        A.crumbs('Academic Calendar');
        let show = 'upcoming';
        const draw = () => {
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const rows = db.all('calendar_events').filter(e => (show === 'all' || new Date(e.endsAt || e.startsAt) >= now) && A.matches(e.title, e.location, A.courseTitle(e.courseId))).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'When', render: e => `<div class="text-sm font-medium text-ink whitespace-nowrap">${new Date(e.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div><div class="text-xs text-slate-500">${e.allDay ? 'All day' : new Date(e.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + (e.endsAt ? ' – ' + new Date(e.endsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '')}</div>` },
                { label: 'Event', render: e => `<div class="font-medium text-ink">${esc(e.title)}</div><div class="text-xs text-slate-500">${esc(e.location || '')}</div>` },
                { label: 'Type', render: e => `<span class="pill bg-slate-100 text-slate-600">${esc((E.EVENT_TYPES[e.type] || ['Event'])[0])}</span>` },
                { label: 'Audience', render: e => e.courseId ? esc(A.courseTitle(e.courseId)) : 'All students' },
                { label: '', cls: 'text-right whitespace-nowrap', render: e => A.iconBtn('fa-pen', 'Edit', `data-edit="${e.id}"`) + A.iconBtn('fa-trash', 'Delete', `data-del="${e.id}"`, true) }
            ], rows, A.empty('fa-calendar-days', 'No events', 'Add classes, exams, quiz windows and school events. Students see them in their calendar.'));
            ui.$$('[data-edit]').forEach(b => b.onclick = () => eventModal(db.get('calendar_events', b.dataset.edit), draw));
            ui.$$('[data-del]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Delete this event? Affected students are notified that it was cancelled.', { okText: 'Delete', danger: true })) { db.remove('calendar_events', b.dataset.del); draw(); } });
        };
        A.view().innerHTML = A.header('Academic Calendar', 'Classes, exams and events shown in each student\'s calendar and schedule. Changes notify affected students.', '<button id="add" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Add event</button>')
            + `<div class="flex gap-2 mb-4">${[['upcoming', 'Upcoming'], ['all', 'All']].map(([k, l]) => `<button data-show="${k}" class="h-9 px-4 rounded-full text-sm font-semibold ${show === k ? 'bg-ink text-white' : 'bg-white border border-slate-200'}">${l}</button>`).join('')}</div>` + A.card('<div id="tbl"></div>');
        ui.$$('[data-show]').forEach(b => b.onclick = () => { show = b.dataset.show; ui.$$('[data-show]').forEach(x => x.className = 'h-9 px-4 rounded-full text-sm font-semibold ' + (x === b ? 'bg-ink text-white' : 'bg-white border border-slate-200')); draw(); });
        document.getElementById('add').onclick = () => eventModal(null, draw);
        A.bindSearch(draw); draw();
    });
    const local = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
    function eventModal(ev, done) {
        const m = ui.modal({ title: ev ? 'Edit event' : 'Add event', size: 'max-w-xl', body: `<form class="space-y-4">
            ${A.field('Title *', A.input('title', ev ? ev.title : '', 'required maxlength="120"'))}
            <div class="grid sm:grid-cols-2 gap-4">${A.field('Type', A.select('type', Object.entries(E.EVENT_TYPES).filter(([k]) => k !== 'announcement').map(([k, v]) => [k, v[0]]), ev ? ev.type : 'class'))}${A.field('Audience', A.select('courseId', A.courseOptions('All students'), ev ? ev.courseId : ''))}</div>
            <div class="grid sm:grid-cols-2 gap-4">${A.field('Starts *', A.input('startsAt', local(ev && ev.startsAt), 'type="datetime-local" required'))}${A.field('Ends', A.input('endsAt', local(ev && ev.endsAt), 'type="datetime-local"'))}</div>
            ${A.toggle('allDay', ev && ev.allDay, 'All-day event')}
            <div class="grid sm:grid-cols-2 gap-4">${A.field('Location', A.input('location', ev ? ev.location : 'Online · Live classroom'))}${A.field('Join link', A.input('url', ev ? ev.url : '', 'type="url" placeholder="https://meet…"'))}</div>
            ${A.field('Description', A.textarea('description', ev ? ev.description : '', 2))}
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save event</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => {
            e.preventDefault(); const d = A.formData(e.target);
            const row = { title: d.title, type: d.type, courseId: d.courseId || null, startsAt: new Date(d.startsAt).toISOString(), endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : new Date(d.startsAt).toISOString(), allDay: d.allDay, location: d.location, url: d.url, description: d.description };
            if (new Date(row.endsAt) < new Date(row.startsAt)) return ui.toast('The end time is before the start time.', 'error');
            if (ev) db.update('calendar_events', ev.id, row); else db.insert('calendar_events', row);
            m.close(); done(); ui.toast('Event saved. Students have been notified.');
        };
    }

    // ---------------- Support tickets ----------------
    A.route('support', (_, p) => {
        A.crumbs('Support Tickets');
        let status = p.s || 'open';
        const draw = () => {
            const rows = db.all('support_tickets').filter(t => (status === 'all' || t.status === status) && A.matches(t.subject, t.body, student(t.userId).name)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'Student', render: t => A.person(student(t.userId).name, student(t.userId).studentId || student(t.userId).email) },
                { label: 'Request', render: t => `<div class="font-medium text-ink">${esc(t.subject)}</div><div class="text-xs text-slate-500 capitalize">${esc(t.category)} · ${ui.plural((t.replies || []).length, 'reply', 'replies')}</div>` },
                { label: 'Updated', render: t => ui.timeAgo(t.updatedAt) },
                { label: 'Status', render: t => `<span class="pill ${t.status === 'open' ? 'pill-pending' : t.status === 'answered' ? 'pill-active' : 'pill-inactive'}">${esc(t.status)}</span>` },
                { label: '', cls: 'text-right', render: t => `<button data-open="${t.id}" class="btn ${t.status === 'open' ? 'btn-forest' : 'btn-outline'} btn-sm">${t.status === 'open' ? 'Respond' : 'View'}</button>` }
            ], rows, A.empty('fa-life-ring', status === 'open' ? 'No open requests' : 'No requests', 'Requests students send from Help & Support appear here.'));
            ui.$$('[data-open]').forEach(b => b.onclick = () => ticket(b.dataset.open, draw));
        };
        A.view().innerHTML = A.header('Support Tickets', 'Help requests from students, including password resets and record corrections.')
            + `<div class="flex gap-2 mb-4">${[['open', 'Open'], ['answered', 'Answered'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => `<button data-st="${k}" class="h-9 px-4 rounded-full text-sm font-semibold ${status === k ? 'bg-ink text-white' : 'bg-white border border-slate-200'}">${l} <span class="opacity-60 text-xs">${k === 'all' ? db.count('support_tickets') : db.count('support_tickets', { status: k })}</span></button>`).join('')}</div>` + A.card('<div id="tbl"></div>');
        ui.$$('[data-st]').forEach(b => b.onclick = () => { status = b.dataset.st; ui.$$('[data-st]').forEach(x => x.className = 'h-9 px-4 rounded-full text-sm font-semibold ' + (x === b ? 'bg-ink text-white' : 'bg-white border border-slate-200')); draw(); });
        A.bindSearch(draw); draw();
        if (p.t) ticket(p.t, draw);
    });
    function ticket(id, done) {
        const t = db.get('support_tickets', id), u = student(t.userId), isReset = /password/i.test(t.subject);
        const m = ui.modal({ title: t.subject, size: 'max-w-2xl', body: `
            <div class="flex flex-wrap items-center gap-3 pb-4 border-b">${A.person(u.name, (u.studentId || '') + ' · ' + u.email)}<span class="ml-auto pill bg-slate-100 text-slate-600 capitalize">${esc(t.category)}</span></div>
            <div class="space-y-3 mt-4 max-h-80 overflow-y-auto thin-scroll"><div class="rounded-xl bg-slate-50 p-3 text-sm whitespace-pre-line">${esc(t.body)}<div class="text-[11px] text-slate-400 mt-1">${ui.fmtDateTime(t.createdAt)}</div></div>
                ${(t.replies || []).map(r => `<div class="rounded-xl p-3 text-sm ${r.by === 'staff' ? 'bg-forest-50 ml-8' : 'bg-slate-50 mr-8'}"><div class="text-xs font-semibold">${esc(r.name)} · ${ui.timeAgo(r.at)}</div><div class="whitespace-pre-line mt-1">${esc(r.body)}</div></div>`).join('')}</div>
            ${isReset && u.id ? `<div class="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm flex flex-wrap items-center gap-3"><i class="fa-solid fa-key text-amber-600"></i><span class="flex-1">Verify the student's identity, then issue a temporary password.</span><button type="button" data-reset class="btn btn-outline btn-sm">Generate temporary password</button></div>` : ''}
            <form class="space-y-3 mt-4">${A.textarea('body', '', 4, 'required placeholder="Write your reply to the student"')}
                <div class="flex flex-wrap justify-between gap-2"><button type="button" data-close class="btn btn-ghost btn-sm">${t.status === 'closed' ? 'Reopen' : 'Close ticket'}</button><button class="btn btn-forest btn-sm">Send reply</button></div></form>` });
        const rb = m.el.querySelector('[data-reset]');
        if (rb) rb.onclick = () => {
            const pw = 'TOS-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
            db.update('users', u.id, { password: pw });
            m.el.querySelector('textarea').value = `Your password has been reset. Your temporary password is: ${pw}\n\nSign in at /student/login and change it straight away under Settings → Password.`;
            ui.toast('Temporary password set. Send the reply to share it.');
        };
        m.el.querySelector('[data-close]').onclick = () => { db.update('support_tickets', t.id, { status: t.status === 'closed' ? 'open' : 'closed' }); m.close(); done(); A.renderNav('support'); };
        m.el.querySelector('form').onsubmit = e => { e.preventDefault(); E.replyTicket(t.id, { by: 'staff', name: 'Tech Oasis Support', body: A.formData(e.target).body, status: 'answered' }); m.close(); done(); ui.toast('Reply sent'); A.renderNav('support'); };
    }

    // ---------------- Send notification ----------------
    A.route('notifications', () => {
        A.crumbs('Send Notification');
        const recent = db.all('notifications').filter(n => n.type === 'system').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const seen = new Set(), sent = recent.filter(n => { const k = n.title + n.createdAt.slice(0, 16); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
        A.view().innerHTML = A.header('Send Notification', 'Post a notification to students\' notification bell. For longer news, use Announcements.')
            + `<div class="grid xl:grid-cols-[1fr_380px] gap-5 items-start">${A.card(`<form id="nf" class="space-y-4">
                ${A.field('Send to', A.select('to', [['all', 'All active students'], ['course', 'Students in a course'], ['one', 'One student']], 'all', 'id="toSel"'))}
                <div id="toCourse" class="hidden">${A.field('Course', A.select('courseId', A.courseOptions()))}</div>
                <div id="toOne" class="hidden">${A.field('Student', A.select('userId', db.where('users', { role: 'student' }).sort((a, b) => a.name.localeCompare(b.name)).map(u => [u.id, u.name + ' — ' + (u.studentId || u.email)])))}</div>
                ${A.field('Title *', A.input('title', '', 'required maxlength="100"'))}${A.field('Message', A.textarea('body', '', 3, 'maxlength="300"'))}
                ${A.field('Link (optional)', A.select('link', [['', 'No link'], ['/student/dashboard', 'Dashboard'], ['/student/my-courses', 'My Courses'], ['/student/assignments', 'Assignments'], ['/student/calendar', 'Calendar'], ['/student/announcements', 'Announcements'], ['/student/help', 'Help & Support']]))}
                <button class="btn btn-forest"><i class="fa-solid fa-paper-plane"></i>Send notification</button></form>`, 'p-6')}
                ${A.card(A.cardTitle('Recently sent') + (sent.length ? `<div class="space-y-3">${sent.map(n => `<div class="text-sm"><div class="font-medium text-ink">${esc(n.title)}</div><div class="text-xs text-slate-500">${ui.timeAgo(n.createdAt)}</div></div>`).join('')}</div>` : '<p class="text-sm text-slate-500">Nothing sent yet.</p>'))}</div>`;
        const sel = document.getElementById('toSel');
        sel.onchange = () => { document.getElementById('toCourse').classList.toggle('hidden', sel.value !== 'course'); document.getElementById('toOne').classList.toggle('hidden', sel.value !== 'one'); };
        document.getElementById('nf').onsubmit = e => {
            e.preventDefault(); const d = A.formData(e.target);
            const ids = d.to === 'one' ? [d.userId] : d.to === 'course' ? db.where('enrollments', x => x.courseId === d.courseId && x.status !== 'cancelled').map(x => x.userId) : db.where('users', u => u.role === 'student' && u.status !== 'suspended').map(u => u.id);
            let n = 0; db.tx(() => ids.forEach(id => { if (E.notify(id, 'system', d.title, d.body, d.link)) n++; }));
            ui.toast(`Notification sent to ${ui.plural(n, 'student')}`); A.refresh();
        };
    });

    // ---------------- Portal settings ----------------
    A.route('settings/portal', () => {
        A.crumbs(['Settings', 'settings/school'], 'Student Portal');
        const s = db.settings().portal;
        A.view().innerHTML = A.header('Student Portal Settings', 'Who can join, who students may message, and reminders.')
            + `<form id="pf" class="space-y-5 max-w-3xl">${A.card(A.cardTitle('Access') + `<div class="space-y-4">${A.toggle('allowSelfRegistration', s.allowSelfRegistration, 'Allow self-registration', 'Visitors can create a student account at /student/register. Turn off to create accounts yourself.')}
                ${A.field('Student ID prefix', A.input('studentIdPrefix', s.studentIdPrefix, 'maxlength="6"'), 'New IDs look like ' + esc(s.studentIdPrefix) + new Date().getFullYear() + '0001. Existing IDs are not changed.')}</div>`)}
                ${A.card(A.cardTitle('Messaging permissions') + `<div class="space-y-4">${A.toggle('allowInstructorMessages', s.allowInstructorMessages, 'Students can message their instructors', 'Only instructors of courses the student is enrolled in, who have a staff login.')}
                ${A.toggle('allowAdminMessages', s.allowAdminMessages, 'Students can message School Administration', 'Student Support is always available. This adds a separate administration inbox.')}</div>`)}
                ${A.card(A.cardTitle('Reminders') + A.field('Remind students about assignments due within (hours)', A.input('assignmentReminderHours', s.assignmentReminderHours, 'type="number" min="1" max="336"')))}
                <div class="flex justify-end"><button class="btn btn-forest"><i class="fa-solid fa-floppy-disk"></i>Save portal settings</button></div></form>`;
        document.getElementById('pf').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target); d.studentIdPrefix = (d.studentIdPrefix || 'TOS').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'TOS'; db.updateSettings('portal', d); ui.toast('Portal settings saved'); A.refresh(); };
    });
})();
