// Settings: school, courses, certificates, payments, plus data tools.
(function () {
    const TABS = [['school', 'School Settings', 'fa-school'], ['courses', 'Course Settings', 'fa-sliders'], ['certificates', 'Certificate Settings', 'fa-certificate'], ['payments', 'Payment Settings', 'fa-wallet']];
    const shell = (tab, body) => A.header('Settings', 'Configure how your school works.') + `<div class="grid lg:grid-cols-[220px_1fr] gap-5 items-start">
        <nav class="bg-white rounded-2xl border border-slate-200/80 p-2 space-y-0.5">${TABS.map(([k, l, ic]) => `<a href="#/settings/${k}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${k === tab ? 'bg-forest-50 text-forest font-semibold' : 'hover:bg-slate-50'}"><i class="fa-solid ${ic} w-4"></i>${l}</a>`).join('')}</nav>
        <div class="space-y-5">${body}</div></div>`;
    const saveBar = '<div class="flex justify-end"><button class="btn btn-forest"><i class="fa-solid fa-floppy-disk"></i>Save changes</button></div>';
    const bind = (group, after) => { document.getElementById('setForm').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target); if (after && after(d) === false) return; db.updateSettings(group, d); ui.toast('Settings saved'); A.refresh(); }; };

    A.route('settings', () => location.replace('#/settings/school'));

    A.route('settings/school', () => {
        A.crumbs(['Settings', 'settings/school'], 'School Settings');
        const s = db.settings().school;
        A.view().innerHTML = shell('school', `<form id="setForm" class="space-y-5">
            ${A.card(A.cardTitle('School profile') + `<div class="grid sm:grid-cols-2 gap-4">${A.field('School name', A.input('name', s.name, 'required'))}${A.field('Tagline', A.input('tagline', s.tagline))}
                ${A.field('Website address', A.input('website', s.website || '', 'type="url" placeholder="https://school.techoasisltd.com"'), 'Used in emails and on certificate verification links.')}<div class="hidden sm:block"></div>
                ${A.field('General & admissions email', A.input('email', s.email, 'type="email" required'), 'Shown in the footer, About page and organisation enquiries.')}${A.field('Student support email', A.input('studentEmail', s.studentEmail, 'type="email" required'), 'Shown to learners for help with courses and payments.')}</div>`)}
            ${A.card(A.cardTitle('Public contact details & social accounts') + `<p class="text-sm text-slate-600 mb-4">Optional. The website shows only the items you fill in here, so leave a field empty rather than adding an account that is not yours. Social links must start with https://.</p><div class="grid sm:grid-cols-2 gap-4">${A.field('Phone or WhatsApp number', A.input('phone', s.phone || '', 'placeholder="+233 ..."'), 'Shown on the Contact page.')}<div class="hidden sm:block"></div>
                ${A.field('LinkedIn page', A.input('socialLinkedin', s.socialLinkedin || '', 'type="url" placeholder="https://www.linkedin.com/company/..."'))}${A.field('X (Twitter) account', A.input('socialX', s.socialX || '', 'type="url" placeholder="https://x.com/..."'))}
                ${A.field('Instagram account', A.input('socialInstagram', s.socialInstagram || '', 'type="url" placeholder="https://www.instagram.com/..."'))}${A.field('YouTube channel', A.input('socialYoutube', s.socialYoutube || '', 'type="url" placeholder="https://www.youtube.com/@..."'))}
                ${A.field('Facebook page', A.input('socialFacebook', s.socialFacebook || '', 'type="url" placeholder="https://www.facebook.com/..."'))}</div>`)}
            ${A.card(A.cardTitle('Administrator access') + `<div class="grid sm:grid-cols-2 gap-4">${A.field('Admin sign-in email', A.input('adminEmail', s.adminEmail, 'type="email" required'))}${A.field('New passcode', A.input('newPass', '', 'type="password" minlength="8" autocomplete="new-password" placeholder="Leave blank to keep current"'), 'At least 8 characters.')}</div>
                <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mt-4"><i class="fa-solid fa-triangle-exclamation mr-1"></i>This static build checks the passcode in the browser. Before launch, connect a real authentication backend so admin access is enforced on the server.</p>`)}
            ${saveBar}</form>
            ${A.card(A.cardTitle('Data') + `<p class="text-sm text-slate-600">All school data currently lives in this browser's storage. Export regularly as a backup, or to move it to another device or into your production database.</p>
                <div class="flex flex-wrap gap-2 mt-4"><button id="exp" class="btn btn-outline btn-sm"><i class="fa-solid fa-download"></i>Export all data (JSON)</button>
                <label class="btn btn-outline btn-sm cursor-pointer"><i class="fa-solid fa-upload"></i>Import data<input type="file" accept="application/json" id="imp" class="hidden"></label>
                <button id="reseed" class="btn btn-outline btn-sm"><i class="fa-solid fa-rotate"></i>Reset to sample content</button>
                <button id="fresh" class="btn btn-sm text-rose-700 hover:bg-rose-50"><i class="fa-solid fa-broom"></i>Start fresh (remove all sample data)</button></div>
                <p class="field-hint mt-3">Storage used: ${ui.fmtBytes(db.exportJSON().length)} of about 5 MB.</p>`)}`);
        bind('school', d => { if (d.newPass) TOS.auth.setAdminPasscode(d.newPass); delete d.newPass; });
        document.getElementById('exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([db.exportJSON()], { type: 'application/json' })); a.download = 'tech-oasis-data-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); };
        document.getElementById('imp').onchange = async e => {
            const f = e.target.files[0]; if (!f) return;
            if (!await ui.confirmBox('Replace ALL current data with the contents of this file?', { okText: 'Import', danger: true })) return;
            try { db.importJSON(await f.text()); ui.toast('Data imported'); A.refresh(); } catch (err) { ui.toast('Import failed: ' + err.message, 'error'); }
        };
        document.getElementById('reseed').onclick = async () => { if (await ui.confirmBox('Delete everything and reload the sample courses, students and orders? Settings are kept.', { okText: 'Reset', danger: true })) { db.reset(true); ui.toast('Sample content restored'); A.refresh(); } };
        document.getElementById('fresh').onclick = async () => { if (await ui.confirmBox('Delete ALL courses, students, orders, reviews and certificates so you can launch with your own content? Settings are kept. Export a backup first if unsure.', { okText: 'Delete everything', danger: true })) { db.reset(false); ui.toast('All data cleared. Start by creating categories and a course.'); location.hash = '#/dashboard'; A.refresh(); } };
    });

    A.route('settings/courses', () => {
        A.crumbs(['Settings', 'settings/school'], 'Course Settings');
        const s = db.settings().courses;
        A.view().innerHTML = shell('courses', `<form id="setForm" class="space-y-5">
            ${A.card(A.cardTitle('Defaults for new courses') + `<div class="grid sm:grid-cols-2 gap-4">${A.field('Default language', A.input('defaultLanguage', s.defaultLanguage))}${A.field('Skill levels', `<textarea name="levels" data-list rows="3" class="field">${esc(s.levels.join('\n'))}</textarea>`, 'One per line.')}</div>
                <div class="space-y-3 mt-4">${A.toggle('discussionsEnabled', s.discussionsEnabled, 'Lesson discussions', 'Turning this off hides discussions in every course.')}${A.toggle('sequentialByDefault', s.sequentialByDefault, 'Sequential learning for new courses', 'Lessons unlock in order.')}</div>`)}
            ${A.card(A.cardTitle('Progress tracking') + A.field('Mark a video lesson complete after watching (%)', A.input('videoCompleteAt', s.videoCompleteAt, 'type="number" min="50" max="100"'), 'Applies to YouTube, Vimeo and direct-file videos. Other providers use the "Mark as complete" button.'))}
            ${saveBar}</form>`);
        bind('courses', d => { if (!d.levels.length) { ui.toast('Add at least one level', 'error'); return false; } });
    });

    A.route('settings/certificates', () => {
        A.crumbs(['Settings', 'settings/school'], 'Certificate Settings');
        const s = db.settings().certificates;
        A.view().innerHTML = shell('certificates', `<form id="setForm" class="space-y-5">
            ${A.card(A.cardTitle('Completion requirements') + `<div class="space-y-4">${A.toggle('enabled', s.enabled, 'Issue certificates', 'Courses can still switch certificates off individually.')}
                ${A.field('Minimum lessons completed (%)', A.input('minLessonPct', s.minLessonPct, 'type="number" min="1" max="100"'))}
                ${A.toggle('requireQuizPass', s.requireQuizPass, 'Require passing every quiz')}
                ${A.toggle('requireAssignments', s.requireAssignments, 'Require graded assignments')}
                ${A.field('Minimum assignment score (%)', A.input('minAssignmentPct', s.minAssignmentPct, 'type="number" min="0" max="100"'))}</div>`)}
            ${A.card(A.cardTitle('Certificate design') + `<div class="grid sm:grid-cols-2 gap-4">${A.field('Signatory name', A.input('signatoryName', s.signatoryName))}${A.field('Signatory title', A.input('signatoryTitle', s.signatoryTitle))}
                ${A.field('Certificate ID prefix', A.input('prefix', s.prefix, 'pattern="[A-Z]{2,6}" maxlength="6"'), 'e.g. TOS → TOS-2026-AB12CD')}${A.field('Accent colour', `<input type="color" name="accent" value="${esc(s.accent)}" class="h-11 w-24 rounded-lg border">`)}</div>
                <div class="flex flex-wrap gap-2 mt-4">${db.all('certificates')[0] ? `<a href="verify.html?code=${encodeURIComponent(db.all('certificates')[0].code)}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-eye"></i>Preview a certificate</a>` : ''}<a href="verify.html" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-shield-halved"></i>Open verification page</a></div>`)}
            ${saveBar}</form>`);
        bind('certificates');
    });

    A.route('settings/payments', () => {
        A.crumbs(['Settings', 'settings/school'], 'Payment Settings');
        const s = db.settings().payments;
        A.view().innerHTML = shell('payments', `<form id="setForm" class="space-y-5">
            ${A.card(A.cardTitle('Pricing') + `<div class="grid sm:grid-cols-3 gap-4">${A.field('Currency', A.select('currency', [['USD', 'USD – US Dollar'], ['GHS', 'GHS – Ghanaian Cedi'], ['NGN', 'NGN – Nigerian Naira'], ['KES', 'KES – Kenyan Shilling'], ['ZAR', 'ZAR – South African Rand'], ['EUR', 'EUR – Euro'], ['GBP', 'GBP – British Pound']], s.currency))}${A.field('Default course price', A.input('defaultPrice', s.defaultPrice, 'type="number" min="0" step="0.01"'))}${A.field('Free trial (days)', A.input('trialDays', s.trialDays, 'type="number" min="0" max="60"'), '0 = no trial; students pay to start.')}</div>`)}
            ${A.card(A.cardTitle('Payment provider') + `<div class="grid sm:grid-cols-2 gap-4">${A.field('Provider', A.select('provider', [['manual', 'Manual / offline (record payments yourself)'], ['paystack', 'Paystack'], ['flutterwave', 'Flutterwave'], ['stripe', 'Stripe']], s.provider))}${A.field('Public key', A.input('publicKey', s.publicKey, 'placeholder="pk_live_…"'), 'Public (publishable) key only. Never paste a secret key here.')}</div>
                <p class="text-xs text-slate-600 bg-ivory border border-ivory-200 rounded-xl p-3 mt-4"><i class="fa-solid fa-circle-info text-gold-600 mr-1"></i>Card payments need a small server endpoint to verify each transaction with your provider (webhook) before marking the order paid. Until that is connected, checkout records payments as <b>demo</b> and you confirm real payments under Commerce → Orders.</p>`)}
            ${saveBar}</form>`);
        bind('payments', d => { if (/^sk_|secret/i.test(d.publicKey || '')) { ui.toast('That looks like a secret key. Only paste the public key.', 'error'); return false; } });
    });
})();
