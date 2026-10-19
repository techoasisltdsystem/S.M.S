// Profile, settings and help & support
(function () {
    const locked = '<i class="fa-solid fa-lock text-[10px] text-slate-300 ml-1" title="Managed by the school"></i>';

    // ---------------- Profile ----------------
    S.route('/student/profile', { title: 'Profile', nav: 'profile', render: async el => {
        const [me, courses, certs] = await Promise.all([api.me(), api.myCourses(), api.certificates()]);
        const field = (label, value, isLocked) => `<div><dt class="text-xs s-muted">${label}${isLocked ? locked : ''}</dt><dd class="text-sm font-medium text-slate-900 mt-0.5 break-words">${value || '<span class="text-slate-400 font-normal">Not set</span>'}</dd></div>`;
        el.innerHTML = S.pageHeader('My Profile', 'Your student record. Fields with a lock are managed by the school.')
            + `<div class="grid xl:grid-cols-[1fr_360px] gap-5 items-start"><div class="space-y-5">
                <section class="s-card overflow-hidden"><div class="h-24 bg-gradient-to-r from-forest via-forest-600 to-ink"></div>
                    <div class="px-6 pb-6 -mt-10 flex flex-col sm:flex-row sm:items-end gap-4">
                        <div class="relative w-fit"><div class="rounded-full ring-4 ring-white">${S.avatar(me, 88)}</div>
                            <label class="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white border border-[#E6E8EC] shadow flex items-center justify-center cursor-pointer hover:bg-slate-50" title="Change photo"><i class="fa-solid fa-camera text-xs text-slate-600"></i><input type="file" accept="image/*" id="av" class="hidden"><span class="sr-only">Change profile photo</span></label></div>
                        <div class="flex-1 min-w-0"><h2 class="text-xl font-bold text-slate-900">${esc(me.name)}</h2><div class="text-sm s-muted"><span class="font-mono">${esc(me.studentId)}</span> · ${esc(me.email)}</div></div>
                        <span class="s-chip ${me.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'} !text-xs !py-1 !px-3 capitalize"><i class="fa-solid fa-circle text-[6px]"></i>${esc(me.status)}</span>
                    </div>${me.avatar ? '<div class="px-6 -mt-3 pb-4"><button id="rmAv" class="text-xs font-semibold text-rose-700">Remove photo</button></div>' : ''}</section>
                <section class="s-card p-6"><h2 class="s-h2 mb-4">Student information</h2><dl class="grid sm:grid-cols-2 gap-5">
                    ${field('Full name', esc(me.name), true)}${field('Student ID', `<span class="font-mono">${esc(me.studentId)}</span>`, true)}${field('Email', esc(me.email), true)}${field('Program', esc(me.program), true)}${field('Class', esc(me.className), true)}${field('Enrollment date', ui.fmtDate(me.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }), true)}${field('Account status', `<span class="capitalize">${esc(me.status)}</span>`, true)}${field('Phone', esc(me.phone))}</dl>
                    <p class="text-xs s-muted mt-5"><i class="fa-solid fa-circle-info mr-1"></i>Need to correct a locked field? <a href="/student/help?category=account" class="underline">Send a request</a> to the registrar.</p></section>
                <form id="pf" class="s-card p-6 space-y-4"><h2 class="s-h2">Editable details</h2>
                    <div><label class="field-label" for="ph">Phone number</label><input id="ph" type="tel" maxlength="30" class="field" value="${esc(me.phone)}" autocomplete="tel"></div>
                    <div><label class="field-label" for="bio">About me</label><textarea id="bio" rows="3" maxlength="600" class="field" placeholder="A short introduction for classmates and instructors">${esc(me.bio)}</textarea></div>
                    <button class="btn btn-forest btn-sm"><i class="fa-solid fa-floppy-disk"></i>Save changes</button></form>
            </div><aside class="space-y-5">
                <section class="s-card p-5"><div class="flex items-center justify-between"><h2 class="s-h2">My courses</h2><span class="text-xs s-muted">${courses.length}</span></div>${courses.length ? `<div class="space-y-3 mt-3">${courses.map(c => `<a href="/student/course/${c.id}" class="flex items-center gap-3 group"><img src="${esc(c.thumbnail)}" alt="" class="w-12 h-9 rounded-lg object-cover bg-slate-100"><div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-900 truncate group-hover:underline">${esc(c.title)}</div>${S.bar(c.pct, 'mt-1.5 !h-1.5')}</div><span class="text-xs font-semibold text-slate-600">${c.pct}%</span></a>`).join('')}</div>` : '<p class="text-sm s-muted mt-3">Not enrolled yet.</p>'}</section>
                <section class="s-card p-5"><div class="flex items-center justify-between"><h2 class="s-h2">Certificates</h2><span class="text-xs s-muted">${certs.length}</span></div>${certs.length ? `<div class="space-y-2 mt-3">${certs.map(c => `<a href="/student/certificates" class="flex items-center gap-3 text-sm hover:underline"><i class="fa-solid fa-award text-gold-600"></i><span class="truncate">${esc(c.courseTitle)}</span></a>`).join('')}</div>` : '<p class="text-sm s-muted mt-3">None yet.</p>'}</section>
            </aside></div>`;
        el.querySelector('#pf').onsubmit = async e => { e.preventDefault(); try { await api.updateProfile({ phone: el.querySelector('#ph').value.trim(), bio: el.querySelector('#bio').value.trim() }); ui.toast('Profile saved'); await S.refreshMe(); S.dispatchQuiet(); } catch (err) { ui.toast(err.message, 'error'); } };
        el.querySelector('#av').onchange = async e => {
            const f = e.target.files[0]; if (!f) return;
            if (f.size > 1048576) return ui.toast('Choose an image under 1 MB.', 'error');
            await api.updateProfile({ avatar: await ui.readFile(f) }); ui.toast('Photo updated'); await S.refreshMe(); S.dispatchQuiet();
        };
        const rm = el.querySelector('#rmAv'); if (rm) rm.onclick = async () => { await api.updateProfile({ avatar: '' }); await S.refreshMe(); S.dispatchQuiet(); };
    } });

    // ---------------- Settings ----------------
    S.route('/student/settings', { title: 'Settings', nav: 'settings', render: async el => {
        const me = await api.me(), prefs = me.prefs || {}, notify = prefs.notify || {}, email = Object.assign({ announcements: true, grades: true, deadlines: true, weekly: false }, prefs.email || {}), privacy = Object.assign({ showFullName: true }, prefs.privacy || {}), look = prefs.appearance || {};
        const sw = (name, on, label, hint) => `<label class="flex items-start justify-between gap-4 py-3 cursor-pointer"><span><span class="block text-sm font-medium text-slate-900">${label}</span>${hint ? `<span class="block text-xs s-muted">${hint}</span>` : ''}</span><span class="switch mt-0.5"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></span></label>`;
        const sections = [['account', 'Account', 'fa-user'], ['password', 'Password', 'fa-key'], ['notifications', 'Notifications', 'fa-bell'], ['email', 'Email preferences', 'fa-envelope'], ['privacy', 'Privacy', 'fa-shield-halved'], ['language', 'Language', 'fa-language'], ['appearance', 'Appearance', 'fa-palette']];
        el.innerHTML = S.pageHeader('Settings', 'Manage your account, security and preferences.')
            + `<div class="grid lg:grid-cols-[220px_1fr] gap-5 items-start">
                <nav class="hidden lg:block s-card p-2 sticky top-24" aria-label="Settings sections">${sections.map(([k, l, ic]) => `<a href="#${k}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900" onclick="event.preventDefault();document.getElementById('${k}').scrollIntoView({behavior:'smooth'})"><i class="fa-solid ${ic} w-4 text-slate-400"></i>${l}</a>`).join('')}</nav>
                <div class="space-y-5">
                <section id="account" class="s-card p-6 scroll-mt-24"><h2 class="s-h2">Account</h2><dl class="grid sm:grid-cols-3 gap-5 mt-4 text-sm"><div><dt class="text-xs s-muted">Name ${locked}</dt><dd class="font-medium mt-0.5">${esc(me.name)}</dd></div><div><dt class="text-xs s-muted">Email ${locked}</dt><dd class="font-medium mt-0.5 break-all">${esc(me.email)}</dd></div><div><dt class="text-xs s-muted">Student ID ${locked}</dt><dd class="font-mono font-medium mt-0.5">${esc(me.studentId)}</dd></div></dl>
                    <p class="text-xs s-muted mt-4">Your name, email, student ID and enrollment details are managed by the school. <a href="/student/profile" class="underline">Edit your phone and bio</a> on your profile.</p></section>
                <form id="password" class="s-card p-6 scroll-mt-24 space-y-4"><h2 class="s-h2">Change password</h2>
                    <div class="grid sm:grid-cols-3 gap-4"><div><label class="field-label" for="cp">Current password</label><input id="cp" type="password" required autocomplete="current-password" class="field"></div><div><label class="field-label" for="np">New password</label><input id="np" type="password" required minlength="8" autocomplete="new-password" class="field"></div><div><label class="field-label" for="np2">Confirm new password</label><input id="np2" type="password" required minlength="8" autocomplete="new-password" class="field"></div></div>
                    <p id="pwErr" class="hidden text-sm text-rose-700" role="alert"></p><button class="btn btn-forest btn-sm">Update password</button></form>
                <form id="notifications" class="s-card p-6 scroll-mt-24"><h2 class="s-h2">In-app notifications</h2><p class="text-xs s-muted mt-1">Choose what appears in your notification bell.</p><div class="divide-y divide-[#F1F3F5] mt-2">
                    ${Object.entries(TOS.engage.TYPES).filter(([k]) => k !== 'system').map(([k, t]) => sw('n_' + k, notify[k] !== false, t.label)).join('')}</div><button class="btn btn-forest btn-sm mt-4">Save notification settings</button></form>
                <form id="email" class="s-card p-6 scroll-mt-24"><h2 class="s-h2">Email preferences</h2><p class="text-xs s-muted mt-1">Sent to ${esc(me.email)} once the school's email service is connected.</p><div class="divide-y divide-[#F1F3F5] mt-2">
                    ${sw('e_announcements', email.announcements, 'School and course announcements')}${sw('e_grades', email.grades, 'Grades and feedback')}${sw('e_deadlines', email.deadlines, 'Deadline reminders')}${sw('e_weekly', email.weekly, 'Weekly progress summary')}</div><button class="btn btn-forest btn-sm mt-4">Save email preferences</button></form>
                <form id="privacy" class="s-card p-6 scroll-mt-24"><h2 class="s-h2">Privacy</h2><div class="divide-y divide-[#F1F3F5] mt-2">${sw('p_full', privacy.showFullName, 'Show my full name in discussions', 'When off, classmates see your first name and last initial.')}</div>
                    <p class="text-xs s-muted mt-3">Your grades, progress and messages are only visible to you, your instructors and school administrators.</p><button class="btn btn-forest btn-sm mt-4">Save privacy settings</button></form>
                <form id="language" class="s-card p-6 scroll-mt-24"><h2 class="s-h2">Language</h2><div class="mt-4 max-w-xs"><label class="field-label" for="lang">Portal language</label><select id="lang" class="field"><option value="en" selected>English</option></select><p class="field-hint">More languages are coming soon.</p></div></form>
                <form id="appearance" class="s-card p-6 scroll-mt-24"><h2 class="s-h2">Appearance</h2><div class="mt-4 max-w-xs"><label class="field-label" for="ts">Text size</label><select id="ts" class="field"><option value="normal">Standard</option><option value="large" ${look.textSize === 'large' ? 'selected' : ''}>Large</option></select></div>
                    <div class="divide-y divide-[#F1F3F5] mt-2">${sw('a_motion', look.reduceMotion, 'Reduce motion', 'Minimise animations across the portal.')}</div><button class="btn btn-forest btn-sm mt-4">Save appearance</button></form>
                </div></div>`;
        if (location.hash) setTimeout(() => { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }, 50);
        const save = async (patch, msg) => { await api.updatePrefs(patch); await S.refreshMe(); S.applyPrefs(); ui.toast(msg); };
        el.querySelector('#password').onsubmit = async e => {
            e.preventDefault(); const err = el.querySelector('#pwErr'); err.classList.add('hidden');
            const np = el.querySelector('#np').value;
            if (np !== el.querySelector('#np2').value) { err.textContent = 'The new passwords do not match.'; return err.classList.remove('hidden'); }
            try { await api.changePassword(el.querySelector('#cp').value, np); e.target.reset(); ui.toast('Password updated'); } catch (x) { err.textContent = x.message; err.classList.remove('hidden'); }
        };
        el.querySelector('#notifications').onsubmit = e => { e.preventDefault(); const n = {}; Object.keys(TOS.engage.TYPES).forEach(k => { const i = e.target.elements['n_' + k]; if (i) n[k] = i.checked; }); save({ notify: n }, 'Notification settings saved'); };
        el.querySelector('#email').onsubmit = e => { e.preventDefault(); const f = e.target.elements; save({ email: { announcements: f.e_announcements.checked, grades: f.e_grades.checked, deadlines: f.e_deadlines.checked, weekly: f.e_weekly.checked } }, 'Email preferences saved'); };
        el.querySelector('#privacy').onsubmit = e => { e.preventDefault(); save({ privacy: { showFullName: e.target.elements.p_full.checked } }, 'Privacy settings saved'); };
        el.querySelector('#language').onsubmit = e => e.preventDefault();
        el.querySelector('#appearance').onsubmit = e => { e.preventDefault(); save({ appearance: { textSize: el.querySelector('#ts').value, reduceMotion: e.target.elements.a_motion.checked } }, 'Appearance saved'); };
    } });

    // ---------------- Help & support ----------------
    S.route('/student/help', { title: 'Help & Support', nav: 'help', live: true, render: async el => {
        const tickets = await api.tickets(), st = db.settings().school;
        const faqs = [
            ['How do I continue where I left off?', 'Open the Dashboard and select Continue learning, or tap Learn in the bottom bar on mobile. Videos resume from your last position.'],
            ['When does a lesson count as complete?', 'Videos complete automatically when you have watched most of them. Readings and other lessons complete when you select Mark as complete. Quizzes complete when you pass, and assignments when you submit.'],
            ['How do I get my certificate?', 'Meet the requirements shown on the course page (lessons, quizzes and graded assignments). A Claim certificate button appears as soon as you are eligible.'],
            ['My free trial ended. What now?', 'Open the course and choose Pay now. Your progress is kept, and lessons unlock again immediately after payment.'],
            ['Can I change my name or email?', 'These are part of your student record. Submit a request below under "Account" and the registrar will update them.'],
            ['The video won\'t play.', 'Refresh the page, check your connection and try another browser. If it still fails, submit a Technical support request with the course and lesson name.']
        ];
        el.innerHTML = S.pageHeader('Help & Support', 'Answers to common questions, and a direct line to the school.')
            + `<div class="grid md:grid-cols-3 gap-4 mb-5">
                <a href="mailto:${esc(st.studentEmail)}" class="s-card s-card-hover p-5"><span class="w-10 h-10 rounded-xl bg-forest-50 text-forest flex items-center justify-center"><i class="fa-solid fa-life-ring"></i></span><div class="font-semibold text-slate-900 mt-3">Student support</div><div class="text-sm s-muted">${esc(st.studentEmail)}</div></a>
                <a href="mailto:${esc(st.email)}" class="s-card s-card-hover p-5"><span class="w-10 h-10 rounded-xl bg-gold-50 text-gold-700 flex items-center justify-center"><i class="fa-solid fa-building-columns"></i></span><div class="font-semibold text-slate-900 mt-3">Admissions & registrar</div><div class="text-sm s-muted">${esc(st.email)}</div></a>
                <a href="/student/messages?new=1" class="s-card s-card-hover p-5"><span class="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center"><i class="fa-regular fa-comments"></i></span><div class="font-semibold text-slate-900 mt-3">Message your instructor</div><div class="text-sm s-muted">Course questions and feedback</div></a></div>
            <div class="grid xl:grid-cols-2 gap-5 items-start">
                <section class="s-card p-6"><h2 class="s-h2">Frequently asked questions</h2><div class="divide-y divide-[#F1F3F5] mt-2">${faqs.map(([q, a]) => `<details class="group py-3.5"><summary class="list-none cursor-pointer flex items-center justify-between gap-4 text-sm font-medium text-slate-900">${esc(q)}<i class="fa-solid fa-plus text-xs text-slate-400 group-open:rotate-45 transition"></i></summary><p class="text-sm s-muted mt-2">${esc(a)}</p></details>`).join('')}</div></section>
                <div class="space-y-5">
                    <form id="tf" class="s-card p-6 space-y-4"><h2 class="s-h2">Submit a support request</h2>
                        <div class="grid sm:grid-cols-2 gap-4"><div><label class="field-label" for="tc">Category</label><select id="tc" class="field">${[['technical', 'Technical support'], ['course', 'Course-related'], ['payment', 'Payments & billing'], ['account', 'Account & records'], ['other', 'Something else']].map(([v, l]) => `<option value="${v}" ${S.q('category') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div><label class="field-label" for="ts2">Subject</label><input id="ts2" required maxlength="120" class="field"></div></div>
                        <div><label class="field-label" for="tb">Describe the problem</label><textarea id="tb" required rows="4" maxlength="4000" class="field" placeholder="Include the course and lesson name, and what you expected to happen"></textarea></div>
                        <button class="btn btn-forest btn-sm"><i class="fa-solid fa-paper-plane"></i>Submit request</button></form>
                    <section class="s-card p-6"><h2 class="s-h2">My support requests</h2>${tickets.length ? `<div class="space-y-3 mt-3">${tickets.map(t => `<details class="rounded-xl border border-[#E6E8EC] p-4 group"><summary class="list-none cursor-pointer flex items-center gap-3"><span class="flex-1 min-w-0"><span class="block text-sm font-medium text-slate-900 truncate">${esc(t.subject)}</span><span class="block text-xs s-muted capitalize">${esc(t.category)} · updated ${ui.timeAgo(t.updatedAt)}</span></span><span class="s-chip capitalize ${t.status === 'answered' ? 'bg-emerald-50 text-emerald-700' : t.status === 'closed' ? '' : 'bg-amber-50 text-amber-700'}">${esc(t.status)}</span></summary>
                        <div class="mt-3 space-y-3 text-sm"><div class="rounded-lg bg-[#F7F8FA] p-3 whitespace-pre-line">${esc(t.body)}</div>${(t.replies || []).map(r => `<div class="rounded-lg p-3 ${r.by === 'staff' ? 'bg-forest-50' : 'bg-[#F7F8FA]'}"><div class="text-xs font-semibold ${r.by === 'staff' ? 'text-forest' : 'text-slate-600'}">${esc(r.name)} · ${ui.timeAgo(r.at)}</div><div class="whitespace-pre-line mt-1">${esc(r.body)}</div></div>`).join('')}
                        ${t.status !== 'closed' ? `<form data-tr="${t.id}" class="flex gap-2"><input class="field" required placeholder="Add a reply" aria-label="Reply to support"><button class="btn btn-outline btn-sm">Send</button></form>` : ''}</div></details>`).join('')}</div>` : '<p class="text-sm s-muted mt-3">You have not submitted any requests.</p>'}</section>
                </div></div>`;
        el.querySelector('#tf').onsubmit = async e => { e.preventDefault(); try { await api.openTicket({ category: el.querySelector('#tc').value, subject: el.querySelector('#ts2').value, body: el.querySelector('#tb').value }); ui.toast('Request submitted. We usually reply within one working day.'); S.dispatchQuiet(); } catch (x) { ui.toast(x.message, 'error'); } };
        el.querySelectorAll('[data-tr]').forEach(f => f.onsubmit = async e => { e.preventDefault(); await api.replyTicket(f.dataset.tr, f.querySelector('input').value); S.dispatchQuiet(); });
    } });
})();
