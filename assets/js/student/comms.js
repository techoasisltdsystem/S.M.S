// Messages, announcements and notifications
(function () {
    // ---------------- Messages ----------------
    const msgRoute = { title: 'Messages', nav: 'messages', live: true, render: async (el, params) => {
        const list = await api.conversations();
        const activeId = params.id || null;
        const thread = activeId ? await api.conversation(activeId) : null;
        S.refreshCounts();
        let q = '';
        el.innerHTML = `<div class="hidden lg:block">${S.pageHeader('Messages', 'Talk to your instructors and the school support team.', '<button data-new class="btn btn-forest btn-sm"><i class="fa-solid fa-pen-to-square"></i>New message</button>')}</div>
            <div class="s-card overflow-hidden grid lg:grid-cols-[340px_1fr] h-[calc(100vh-210px)] lg:h-[calc(100vh-220px)] min-h-[480px]">
                <div class="${thread ? 'hidden lg:flex' : 'flex'} flex-col border-r border-[#EEF0F3] min-h-0">
                    <div class="p-3 border-b border-[#EEF0F3] flex gap-2"><div class="relative flex-1"><i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i><input id="mq" type="search" class="field h-10 pl-8" placeholder="Search messages" aria-label="Search messages"></div><button data-new class="lg:hidden btn btn-forest btn-sm" aria-label="New message"><i class="fa-solid fa-pen-to-square"></i></button></div>
                    <div id="convList" class="flex-1 overflow-y-auto thin-scroll"></div></div>
                <div class="${thread ? 'flex' : 'hidden lg:flex'} flex-col min-h-0" id="threadPane"></div></div>`;
        const drawList = () => {
            const items = list.filter(c => !q || (c.with + ' ' + c.subject + ' ' + c.preview).toLowerCase().includes(q));
            el.querySelector('#convList').innerHTML = items.length ? items.map(c => `<a href="/student/messages/${c.id}" class="flex gap-3 px-4 py-3.5 border-b border-[#F1F3F5] ${c.id === activeId ? 'bg-forest-50/70' : 'hover:bg-slate-50'}">
                ${S.avatar({ name: c.with }, 40)}<div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><span class="text-sm ${c.unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'} truncate">${esc(c.with)}</span><span class="text-[11px] text-slate-400 shrink-0">${ui.timeAgo(c.lastMessageAt)}</span></div>
                <div class="text-xs text-slate-600 truncate">${esc(c.subject)}</div><div class="flex items-center gap-2"><span class="text-xs s-muted truncate flex-1">${esc(c.preview)}</span>${c.unread ? `<span class="s-badge">${c.unread}</span>` : ''}</div></div></a>`).join('')
                : `<div class="p-8 text-center text-sm s-muted">${list.length ? 'No conversations match.' : 'No messages yet.<br>Start a conversation with your instructor or the support team.'}</div>`;
        };
        drawList();
        el.querySelector('#mq').oninput = e => { q = e.target.value.trim().toLowerCase(); drawList(); };
        el.querySelectorAll('[data-new]').forEach(b => b.onclick = compose);
        const pane = el.querySelector('#threadPane');
        if (!thread) { pane.innerHTML = `<div class="m-auto text-center p-8"><span class="w-14 h-14 mx-auto rounded-2xl bg-forest-50 text-forest flex items-center justify-center text-xl"><i class="fa-regular fa-comments"></i></span><p class="font-semibold text-slate-900 mt-4">${list.length ? 'Select a conversation' : 'No messages yet'}</p><p class="text-sm s-muted mt-1">Messages from instructors and support appear here.</p><button data-new2 class="btn btn-forest btn-sm mt-5">New message</button></div>`; pane.querySelector('[data-new2]').onclick = compose; }
        else {
            const lastMine = [...thread.messages].reverse().find(m => m.mine);
            pane.innerHTML = `<div class="px-4 sm:px-5 py-3 border-b border-[#EEF0F3] flex items-center gap-3"><a href="/student/messages" class="lg:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center" aria-label="Back to conversations"><i class="fa-solid fa-arrow-left"></i></a>${S.avatar({ name: thread.with }, 38)}<div class="min-w-0"><div class="font-semibold text-slate-900 truncate">${esc(thread.with)}</div><div class="text-xs s-muted truncate">${esc(thread.subject)}${thread.course ? ' · ' + esc(thread.course) : ''}</div></div></div>
                <div id="msgs" class="flex-1 overflow-y-auto thin-scroll p-4 sm:p-6 space-y-4 bg-[#FAFBFC]">${thread.messages.map(m => `<div class="flex ${m.mine ? 'justify-end' : 'justify-start'}"><div><div class="bubble ${m.mine ? 'mine' : 'theirs'}">${esc(m.body)}${(m.attachments || []).map(a => `<a href="${esc(a.url)}" download="${esc(a.name)}" class="mt-2 flex items-center gap-2 text-xs underline ${m.mine ? 'text-white/90' : 'text-forest-600'}"><i class="fa-solid fa-paperclip"></i>${esc(a.name)} (${ui.fmtBytes(a.size)})</a>`).join('')}</div>
                    <div class="text-[11px] text-slate-400 mt-1 ${m.mine ? 'text-right' : ''}">${m.mine ? '' : esc(m.senderName) + ' · '}${ui.fmtDateTime(m.createdAt)}${m === lastMine ? (m.readAt ? ' · <i class="fa-solid fa-check-double text-forest-400"></i> Seen' : ' · Sent') : ''}</div></div></div>`).join('')}</div>
                <form id="reply" class="p-3 sm:p-4 border-t border-[#EEF0F3] bg-white"><div class="flex items-end gap-2"><label class="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer text-slate-500 shrink-0" title="Attach a file (max 1 MB)"><i class="fa-solid fa-paperclip"></i><input type="file" id="att" class="hidden"></label>
                    <label for="rb" class="sr-only">Message</label><textarea id="rb" rows="1" class="field resize-none max-h-40" placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"></textarea><button class="btn btn-forest h-10 px-4 shrink-0" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button></div><p id="attName" class="text-xs s-muted mt-1.5 hidden"></p></form>`;
            const box = pane.querySelector('#msgs'); box.scrollTop = box.scrollHeight;
            let att = null;
            pane.querySelector('#att').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 1048576) return ui.toast('Attachments must be 1 MB or smaller.', 'error'); att = { name: f.name, size: f.size, url: await ui.readFile(f) }; const n = pane.querySelector('#attName'); n.textContent = 'Attached: ' + f.name; n.classList.remove('hidden'); };
            const ta = pane.querySelector('#rb');
            ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };
            ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pane.querySelector('#reply').requestSubmit(); } };
            pane.querySelector('#reply').onsubmit = async e => { e.preventDefault(); try { await api.reply(thread.id, ta.value, att ? [att] : []); ta.value = ''; S.dispatchQuiet(); } catch (err) { ui.toast(err.message, 'error'); } };
        }
        if (S.q('new') === '1') { history.replaceState({}, '', location.pathname); compose(); }
    } };
    S.route('/student/messages', msgRoute);
    S.route('/student/messages/:id', msgRoute);

    async function compose() {
        const rec = await api.recipients();
        const m = ui.modal({ title: 'New message', size: 'max-w-lg', body: `<form class="space-y-4">
            <div><label class="field-label" for="to">To</label><select id="to" required class="field">${rec.map(r => `<option value="${esc(r.key)}">${esc(r.label)} — ${esc(r.sub)}</option>`).join('')}</select><p class="field-hint">You can message instructors of your courses and the student support team.</p></div>
            <div><label class="field-label" for="subj">Subject</label><input id="subj" required maxlength="120" class="field"></div>
            <div><label class="field-label" for="body">Message</label><textarea id="body" required rows="5" maxlength="5000" class="field"></textarea></div>
            <div><label class="field-label" for="catt">Attachment <span class="font-normal s-muted">(optional, max 1 MB)</span></label><input id="catt" type="file" class="field text-sm"></div>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm"><i class="fa-solid fa-paper-plane"></i>Send</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = async e => {
            e.preventDefault();
            const f = m.el.querySelector('#catt').files[0];
            if (f && f.size > 1048576) return ui.toast('Attachments must be 1 MB or smaller.', 'error');
            try {
                const cv = await api.startConversation({ recipientKey: m.el.querySelector('#to').value, subject: m.el.querySelector('#subj').value, body: m.el.querySelector('#body').value, attachments: f ? [{ name: f.name, size: f.size, url: await ui.readFile(f) }] : [] });
                m.close(); ui.toast('Message sent'); S.go('/student/messages/' + cv.id);
            } catch (err) { ui.toast(err.message, 'error'); }
        };
    }

    // ---------------- Announcements ----------------
    S.route('/student/announcements', { title: 'Announcements', nav: 'announcements', live: true, skeleton: 'list', render: async el => {
        const list = await api.announcements(), unread = list.filter(a => !a.read).length;
        el.innerHTML = S.pageHeader('Announcements', unread ? `${unread} unread` : 'News from the school and your instructors.', unread ? '<button data-readall class="btn btn-outline btn-sm"><i class="fa-solid fa-check-double"></i>Mark all as read</button>' : '')
            + (list.length ? `<div class="space-y-3">${list.map(a => `<article id="${a.id}" class="s-card p-5 sm:p-6 ${a.read ? '' : 'border-l-4 !border-l-gold'}">
                <div class="flex flex-wrap items-center gap-2 text-xs s-muted"><span class="s-chip ${a.courseId ? 'bg-sky-50 text-sky-700' : 'bg-forest-50 text-forest'}"><i class="fa-solid ${a.courseId ? 'fa-book-open' : 'fa-school'}"></i>${a.courseId ? esc(a.course) : 'School announcement'}</span>${a.important ? '<span class="s-chip bg-rose-50 text-rose-700"><i class="fa-solid fa-thumbtack"></i>Important</span>' : ''}<span>${ui.fmtDate(a.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</span><span>·</span><span>${esc(a.authorName || 'Tech Oasis School')}</span>${a.read ? '<span class="ml-auto"><i class="fa-solid fa-check-double"></i> Read</span>' : '<span class="ml-auto text-gold-700 font-semibold">New</span>'}</div>
                <h2 class="text-lg font-semibold text-slate-900 mt-2">${esc(a.title)}</h2><p class="text-sm text-slate-700 mt-1.5 whitespace-pre-line">${esc(a.body)}</p>
                ${a.read ? '' : `<button data-read="${a.id}" class="text-xs font-semibold text-forest-600 mt-3">Mark as read</button>`}</article>`).join('')}</div>`
                : S.empty('fa-bullhorn', 'No announcements', 'School and course announcements will appear here.'));
        el.querySelectorAll('[data-read]').forEach(b => b.onclick = async () => { await api.markAnnouncementRead(b.dataset.read); S.dispatchQuiet(); S.refreshCounts(); });
        const ra = el.querySelector('[data-readall]'); if (ra) ra.onclick = async () => { await api.markAllAnnouncementsRead(); S.dispatchQuiet(); S.refreshCounts(); };
        if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) { t.scrollIntoView({ block: 'center' }); api.markAnnouncementRead(location.hash.slice(1)).then(S.refreshCounts); } }
    } });

    // ---------------- Notifications ----------------
    S.route('/student/notifications', { title: 'Notifications', nav: 'notifications', live: true, skeleton: 'list', render: async el => {
        const list = await api.notifications();
        let filter = S.q('filter') || 'all';
        const draw = () => {
            const items = list.filter(n => filter === 'all' || (filter === 'unread' ? !n.readAt : n.type === filter));
            el.querySelector('#nl').innerHTML = items.length ? `<div class="s-card overflow-hidden divide-y divide-[#F1F3F5]">${items.map(n => `<div class="flex items-stretch group">${S.notificationRow(n).replace('class="flex gap-3', 'class="flex-1 min-w-0 flex gap-3')}
                <div class="flex flex-col sm:flex-row items-center justify-center gap-1 pr-3"><button data-toggle="${n.id}" class="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700" title="${n.readAt ? 'Mark as unread' : 'Mark as read'}" aria-label="${n.readAt ? 'Mark as unread' : 'Mark as read'}"><i class="fa-solid ${n.readAt ? 'fa-envelope' : 'fa-envelope-open'} text-xs"></i></button><button data-del="${n.id}" class="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Delete" aria-label="Delete notification"><i class="fa-solid fa-trash text-xs"></i></button></div></div>`).join('')}</div>`
                : S.empty('fa-bell-slash', filter === 'unread' ? 'No unread notifications' : 'No notifications', "You're all caught up.");
            el.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === filter); b.setAttribute('aria-selected', b.dataset.tab === filter); });
            el.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => { const n = list.find(x => x.id === b.dataset.toggle); await api.markNotification(n.id, !n.readAt); n.readAt = n.readAt ? null : new Date().toISOString(); draw(); S.refreshCounts(); });
            el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await api.deleteNotification(b.dataset.del); list.splice(list.findIndex(x => x.id === b.dataset.del), 1); draw(); S.refreshCounts(); });
            el.querySelectorAll('[data-notif-link]').forEach(a => a.addEventListener('click', () => api.markNotification(a.dataset.notifLink).then(S.refreshCounts)));
        };
        const unread = list.filter(n => !n.readAt).length;
        el.innerHTML = S.pageHeader('Notifications', unread ? `${unread} unread` : 'Updates about your courses, work and account.', `${unread ? '<button data-readall class="btn btn-outline btn-sm"><i class="fa-solid fa-check-double"></i>Mark all as read</button>' : ''}<a href="/student/settings#notifications" class="btn btn-ghost btn-sm"><i class="fa-solid fa-sliders"></i>Preferences</a>`)
            + `<div class="mb-5">${S.tabs([['all', 'All', list.length], ['unread', 'Unread', unread], ['assignment_graded', 'Grades'], ['message', 'Messages'], ['announcement', 'Announcements']], filter)}</div><div id="nl"></div>`;
        el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { filter = b.dataset.tab; draw(); });
        const ra = el.querySelector('[data-readall]'); if (ra) ra.onclick = async () => { await api.markAllNotifications(); S.dispatchQuiet(); S.refreshCounts(); };
        draw();
    } });
})();
