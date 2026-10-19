// Public staff pages: apply, application status, email verification, login and password recovery.
(function () {
    const MAX_FILE = 1048576;
    const safeNext = n => n && n.startsWith('/staff/') && !n.startsWith('//') ? n : '/staff/dashboard';
    const school = () => db.settings().school;
    const layout = (title, sub, body, wide) => `<main class="min-h-screen grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] bg-white">
        <section class="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-ink via-forest to-forest-600 text-white p-12 flex-col justify-between grain">
            <div class="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-gold/15 blur-3xl"></div>
            <a href="/" class="relative" aria-label="Tech Oasis School website">${ui.brandLogo(true, 44)}</a>
            <div class="relative max-w-md">
                <span class="text-[11px] font-bold uppercase tracking-[0.25em] text-gold-200">Staff Portal</span>
                <h2 class="font-display text-[42px] leading-[1.1] mt-4">Teach the people building Africa's tech future.</h2>
                <ol class="mt-8 space-y-4 text-white/85 text-[15px]">
                    ${[['fa-file-signature', 'Apply with your experience and documents'], ['fa-user-check', 'An administrator reviews your application'], ['fa-key', 'Once approved, sign in with the email and password you chose']].map(([ic, t], i) => `<li class="flex gap-3"><span class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0"><i class="fa-solid ${ic}"></i></span><span><span class="text-gold-200 text-xs font-bold">STEP ${i + 1}</span><br>${t}</span></li>`).join('')}
                </ol>
            </div>
            <p class="relative text-xs text-white/50">&copy; ${new Date().getFullYear()} Tech Oasis School · <a href="mailto:${esc(school().email)}" class="underline">${esc(school().email)}</a></p>
        </section>
        <section class="flex ${wide ? 'items-start' : 'items-center'} justify-center p-6 sm:p-10">
            <div class="w-full ${wide ? 'max-w-[720px] py-4' : 'max-w-[420px]'}">
                <a href="/" class="lg:hidden inline-block mb-8">${ui.brandLogo(false, 40)}</a>
                ${title ? `<h1 class="text-[28px] font-bold text-slate-900 tracking-tight">${title}</h1>` : ''}
                ${sub ? `<p class="text-sm s-muted mt-1.5">${sub}</p>` : ''}
                ${ui.demoNotice()}
                <div class="mt-8">${body}</div>
            </div>
        </section></main>`;
    const notice = (kind, html) => `<div class="mb-5 rounded-xl px-4 py-3 text-sm ${kind === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-100' : kind === 'warn' ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}" role="${kind === 'error' ? 'alert' : 'status'}">${html}</div>`;
    const errBox = '<p id="err" class="hidden text-sm font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3" role="alert"></p>';
    const showErr = (el, msg) => { const e = el.querySelector('#err'); e.textContent = msg; e.classList.remove('hidden'); e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    const pw = (id, label, auto, extra) => `<div><div class="flex items-center justify-between"><label class="field-label" for="${id}">${label}</label>${extra || ''}</div><div class="relative"><input id="${id}" type="password" required autocomplete="${auto}" class="field h-12 pr-11"><button type="button" data-eye="${id}" class="absolute right-1 top-1 w-10 h-10 rounded-lg text-slate-400 hover:text-slate-700" aria-label="Show password"><i class="fa-regular fa-eye"></i></button></div></div>`;
    const bindEyes = root => root.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = root.querySelector('#' + b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = `<i class="fa-regular ${i.type === 'password' ? 'fa-eye' : 'fa-eye-slash'}"></i>`; });
    const readFile = async (file, kind) => { if (file.size > MAX_FILE) throw new Error(`"${file.name}" is larger than 1 MB. Compress it or share a link instead.`); return { kind, name: file.name, size: file.size, type: file.type, url: await ui.readFile(file) }; };

    // ---------------- Apply ----------------
    const STEPS = [['personal', 'Personal', 'fa-user'], ['professional', 'Professional', 'fa-briefcase'], ['teaching', 'Teaching', 'fa-chalkboard-user'], ['account', 'Documents & account', 'fa-file-shield']];
    S.route('/staff/apply', { title: 'Apply to teach', layout: 'auth', allowSignedIn: true, render: el => {
        const courses = TOS.lms.listedCourses().sort((a, b) => a.title.localeCompare(b.title));
        const subjects = [...new Set(courses.map(c => c.title).concat(['Mathematics', 'English', 'Data Analysis']))].sort();
        const chips = (name, items, type) => `<div class="flex flex-wrap gap-2">${items.map(([v, l]) => `<label class="cursor-pointer"><input type="${type || 'checkbox'}" name="${name}" value="${esc(v)}" class="peer sr-only"><span class="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-slate-200 text-sm text-slate-700 peer-checked:bg-forest peer-checked:text-white peer-checked:border-forest peer-focus-visible:ring-2 peer-focus-visible:ring-gold">${esc(l)}</span></label>`).join('')}</div>`;
        const f = (label, control, hint, req) => `<div><label class="field-label">${label}${req ? ' <span class="text-rose-600">*</span>' : ''}</label>${control}${hint ? `<p class="field-hint">${hint}</p>` : ''}</div>`;
        const inp = (name, attrs) => `<input name="${name}" class="field h-11" ${attrs || ''}>`;
        const ta = (name, rows, attrs) => `<textarea name="${name}" rows="${rows || 3}" class="field" ${attrs || ''}></textarea>`;
        const sel = (name, opts) => `<select name="${name}" class="field h-11">${opts.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
        const file = (name, label, hint, req, accept) => `<div class="rounded-xl border border-dashed border-slate-300 p-4"><div class="flex items-center justify-between gap-3"><div><div class="text-sm font-medium text-slate-900">${label}${req ? ' <span class="text-rose-600">*</span>' : ''}</div><div class="text-xs s-muted">${hint}</div></div><label class="btn btn-outline btn-sm cursor-pointer shrink-0"><i class="fa-solid fa-upload"></i>Choose<input type="file" data-doc="${name}" ${accept ? `accept="${accept}"` : ''} ${name === 'certificate' || name === 'other' ? 'multiple' : ''} class="hidden"></label></div><div data-files="${name}" class="mt-2 space-y-1"></div></div>`;
        el.innerHTML = layout('Apply to teach at Tech Oasis', 'Tell us about your experience. An administrator reviews every application before a staff account is created.', `
            <ol class="grid grid-cols-4 gap-2 mb-8" aria-label="Application steps">${STEPS.map(([k, l, ic], i) => `<li data-stepdot="${i}" class="text-center"><span class="mx-auto w-10 h-10 rounded-full flex items-center justify-center text-sm border-2"><i class="fa-solid ${ic}"></i></span><span class="block text-[11px] font-semibold mt-1.5 leading-tight">${l}</span></li>`).join('')}</ol>
            <form id="applyForm" novalidate>
                <fieldset data-step="0" class="space-y-5"><legend class="text-lg font-semibold text-slate-900 mb-1">Personal information</legend>
                    <div class="grid sm:grid-cols-2 gap-4">${f('First name', inp('firstName', 'required autocomplete="given-name"'), '', 1)}${f('Last name', inp('lastName', 'required autocomplete="family-name"'), '', 1)}</div>
                    <div class="grid sm:grid-cols-2 gap-4">${f('Phone', inp('phone', 'type="tel" required autocomplete="tel"'), '', 1)}${f('Location', inp('location', 'required placeholder="City, Country"'), '', 1)}</div>
                    ${f('Date of birth', inp('dateOfBirth', 'type="date"'), 'Optional, only if your country requires it for teaching contracts.')}
                    <div class="flex items-center gap-4"><div id="photoPrev" class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 overflow-hidden shrink-0"><i class="fa-solid fa-user text-xl"></i></div><div><label class="btn btn-outline btn-sm cursor-pointer"><i class="fa-solid fa-camera"></i>Profile photo<input type="file" id="photo" accept="image/*" class="hidden"></label><p class="field-hint">Optional · JPG or PNG under 1 MB</p></div></div>
                </fieldset>
                <fieldset data-step="1" class="space-y-5 hidden"><legend class="text-lg font-semibold text-slate-900 mb-1">Professional information</legend>
                    <div class="grid sm:grid-cols-2 gap-4">${f('Area of expertise', inp('expertise', 'required placeholder="e.g. Full-stack web development"'), '', 1)}${f('Years of experience', inp('yearsExperience', 'type="number" min="0" max="60" required'), '', 1)}</div>
                    ${f('Subject(s) you want to teach', chips('subjects', subjects.map(s => [s, s])), 'Tell us what you would like to teach. The school decides your final role.', 1)}
                    ${f('Other subject', inp('otherSubject', 'placeholder="Anything not listed"'))}
                    ${f('Qualifications', ta('qualifications', 2, 'required placeholder="Degrees, certifications, awards"'), '', 1)}
                    ${f('Education', ta('education', 2, 'required placeholder="Institutions and years"'), '', 1)}
                    ${f('Previous teaching experience', ta('previousTeaching', 2, 'placeholder="Where and what you have taught"'))}
                    ${f('Professional bio', ta('bio', 4, 'required maxlength="1200" placeholder="A short introduction students will see if you are approved"'), '', 1)}
                </fieldset>
                <fieldset data-step="2" class="space-y-5 hidden"><legend class="text-lg font-semibold text-slate-900 mb-1">Teaching information</legend>
                    ${f('Courses you could teach', chips('courseIds', courses.map(c => [c.id, c.title])), 'Optional. Helps the school assign you to the right courses.')}
                    <div class="grid sm:grid-cols-2 gap-4">${f('Preferred teaching level', sel('teachingLevel', ['Beginner', 'Intermediate', 'Advanced', 'All levels']))}${f('Preferred teaching method', sel('teachingMethod', ['Live online classes', 'Recorded video lessons', 'Blended (live + recorded)', 'In-person workshops']))}</div>
                    ${f('Teaching experience', ta('teachingExperience', 2, 'placeholder="Class sizes, age groups, outcomes you are proud of"'))}
                    ${f('Availability', chips('availabilitySlots', [['Weekday mornings', 'Weekday mornings'], ['Weekday afternoons', 'Weekday afternoons'], ['Weekday evenings', 'Weekday evenings'], ['Weekends', 'Weekends'], ['Flexible', 'Flexible']]), '', 1)}
                    ${f('Availability notes', inp('availabilityNotes', 'placeholder="e.g. up to 10 hours a week, GMT"'))}
                </fieldset>
                <fieldset data-step="3" class="space-y-5 hidden"><legend class="text-lg font-semibold text-slate-900 mb-1">Documents</legend>
                    ${file('cv', 'CV / Resume', 'PDF or Word, under 1 MB', 1, '.pdf,.doc,.docx')}
                    ${f('Or link to your CV', inp('cvLink', 'type="url" placeholder="https://… (Google Drive, LinkedIn, Dropbox)"'), 'Use a link if your file is larger than 1 MB.')}
                    ${file('certificate', 'Certificates & qualifications', 'Optional · you can add several', 0, '.pdf,.jpg,.jpeg,.png')}
                    ${file('identification', 'Identification', 'Optional, only where required', 0, '.pdf,.jpg,.jpeg,.png')}
                    ${file('other', 'Other supporting documents', 'Optional · portfolio, references', 0)}
                    <div class="pt-2"><h2 class="text-lg font-semibold text-slate-900">Your account</h2><p class="text-sm s-muted">You'll use this email and password to sign in once your application is approved.</p></div>
                    ${f('Email', inp('email', 'type="email" required autocomplete="email"'), 'Must not already be used by another account.', 1)}
                    <div class="grid sm:grid-cols-2 gap-4">${pw('password', 'Password', 'new-password')}${pw('confirmPassword', 'Confirm password', 'new-password')}</div>
                    <p class="field-hint -mt-3">At least 8 characters.</p>
                    <label class="flex items-start gap-3 text-sm text-slate-600"><input type="checkbox" name="consent" class="mt-1 w-4 h-4 accent-[#0C3B2E]"><span>I confirm the information is accurate and agree that Tech Oasis School may review it and contact my references.</span></label>
                </fieldset>
                <div class="mt-6">${errBox}</div>
                <div class="flex items-center justify-between gap-3 mt-6 pt-6 border-t border-slate-100">
                    <button type="button" id="back" class="btn btn-outline">Back</button>
                    <span id="stepLabel" class="text-xs s-muted"></span>
                    <button type="button" id="next" class="btn btn-forest">Continue<i class="fa-solid fa-arrow-right text-xs"></i></button>
                    <button type="submit" id="submitApp" class="btn btn-gold hidden"><i class="fa-solid fa-paper-plane"></i>Submit application</button>
                </div>
            </form>
            <p class="mt-8 text-sm text-slate-600">Already applied? <a href="/staff/application" class="font-semibold text-forest-600 hover:underline">Check your application status</a> · Approved staff: <a href="/staff/login" class="font-semibold text-forest-600 hover:underline">Sign in</a></p>`, true);
        bindEyes(el);
        const form = el.querySelector('#applyForm'), docs = { cv: [], certificate: [], identification: [], other: [] };
        let step = 0, photo = '';
        const paint = () => {
            el.querySelectorAll('[data-step]').forEach(fs => fs.classList.toggle('hidden', +fs.dataset.step !== step));
            el.querySelectorAll('[data-stepdot]').forEach(d => { const i = +d.dataset.stepdot, s = d.querySelector('span'); s.className = 'mx-auto w-10 h-10 rounded-full flex items-center justify-center text-sm border-2 ' + (i < step ? 'bg-forest border-forest text-white' : i === step ? 'border-forest text-forest bg-forest-50' : 'border-slate-200 text-slate-300'); d.lastElementChild.className = 'block text-[11px] font-semibold mt-1.5 leading-tight ' + (i <= step ? 'text-slate-900' : 'text-slate-400'); });
            el.querySelector('#back').style.visibility = step ? 'visible' : 'hidden';
            el.querySelector('#next').classList.toggle('hidden', step === STEPS.length - 1);
            el.querySelector('#submitApp').classList.toggle('hidden', step !== STEPS.length - 1);
            el.querySelector('#stepLabel').textContent = `Step ${step + 1} of ${STEPS.length}`;
            el.querySelector('#err').classList.add('hidden');
        };
        const val = n => (form.elements[n] && form.elements[n].value || '').trim();
        const checked = n => [...form.querySelectorAll(`input[name="${n}"]:checked`)].map(i => i.value);
        const validate = i => {
            const need = [['firstName', 'lastName', 'phone', 'location'], ['expertise', 'yearsExperience', 'qualifications', 'education', 'bio'], [], []][i];
            if (need.some(n => !val(n))) return 'Please complete every required field.';
            if (i === 1 && !checked('subjects').length && !val('otherSubject')) return 'Choose at least one subject you want to teach.';
            if (i === 2 && !checked('availabilitySlots').length) return 'Tell us when you are available.';
            if (i === 3) {
                if (!docs.cv.length && !/^https?:\/\//.test(val('cvLink'))) return 'Attach your CV or paste a link to it.';
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val('email'))) return 'Enter a valid email address.';
                const block = ST.applyBlock(val('email')); if (block) return block;
                if (form.elements.password.value.length < 8) return 'Use at least 8 characters for your password.';
                if (form.elements.password.value !== form.elements.confirmPassword.value) return 'The passwords do not match.';
                if (!form.elements.consent.checked) return 'Please confirm the declaration to submit.';
            }
            return null;
        };
        el.querySelector('#next').onclick = () => { const e = validate(step); if (e) return showErr(el, e); step++; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        el.querySelector('#back').onclick = () => { step--; paint(); };
        el.querySelector('#photo').onchange = async e => { try { const d = await readFile(e.target.files[0], 'photo'); photo = d.url; el.querySelector('#photoPrev').innerHTML = `<img src="${photo}" alt="" class="w-full h-full object-cover">`; } catch (x) { showErr(el, x.message); } };
        el.querySelectorAll('[data-doc]').forEach(inp => inp.onchange = async () => {
            const kind = inp.dataset.doc;
            try { for (const fl of inp.files) { const d = await readFile(fl, kind); if (kind === 'cv' || kind === 'identification') docs[kind] = [d]; else docs[kind].push(d); } } catch (x) { showErr(el, x.message); }
            const box = el.querySelector(`[data-files="${kind}"]`);
            box.innerHTML = docs[kind].map((d, i) => `<div class="flex items-center gap-2 text-sm"><i class="fa-solid fa-paperclip text-slate-400"></i><span class="flex-1 truncate">${esc(d.name)}</span><span class="text-xs s-muted">${ui.fmtBytes(d.size)}</span><button type="button" data-rm="${kind}:${i}" class="text-rose-600 text-xs" aria-label="Remove ${esc(d.name)}"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
            box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.rm.split(':'); docs[k].splice(+i, 1); inp.dispatchEvent(new Event('change')); });
            inp.value = '';
        });
        form.onsubmit = e => {
            e.preventDefault();
            for (let i = 0; i < STEPS.length; i++) { const er = validate(i); if (er) { step = i; paint(); return showErr(el, er); } }
            const subjects = checked('subjects').concat(val('otherSubject') ? [val('otherSubject')] : []);
            const documents = [].concat(docs.cv, docs.certificate, docs.identification, docs.other);
            if (!docs.cv.length) documents.push({ kind: 'cv', name: 'CV (link)', size: 0, type: 'link', url: val('cvLink') });
            const btn = el.querySelector('#submitApp'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Submitting…';
            setTimeout(() => {   // let the button state paint before password hashing
                try {
                    const r = ST.submitApplication({ firstName: val('firstName'), lastName: val('lastName'), email: val('email'), phone: val('phone'), location: val('location'), dateOfBirth: val('dateOfBirth') || null, photo,
                        expertise: val('expertise'), yearsExperience: val('yearsExperience'), subjects, qualifications: val('qualifications'), education: val('education'), previousTeaching: val('previousTeaching'), bio: val('bio'),
                        courseIds: checked('courseIds'), teachingLevel: val('teachingLevel'), teachingMethod: val('teachingMethod'), teachingExperience: val('teachingExperience'),
                        availability: checked('availabilitySlots').join(', ') + (val('availabilityNotes') ? ' · ' + val('availabilityNotes') : ''), documents,
                        password: form.elements.password.value, confirmPassword: form.elements.confirmPassword.value });
                    sessionStorage.setItem('tos_applied', r.email);
                    S.go('/staff/apply/submitted', { replace: true });
                } catch (x) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>Submit application'; showErr(el, x.message); }
            }, 30);
        };
        paint();
    } });

    S.route('/staff/apply/submitted', { title: 'Application submitted', layout: 'auth', allowSignedIn: true, render: el => {
        const email = sessionStorage.getItem('tos_applied') || 'your email address';
        el.innerHTML = layout('', '', `<div class="text-center">
            <span class="w-20 h-20 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl"><i class="fa-solid fa-circle-check"></i></span>
            <h1 class="text-2xl font-bold text-slate-900 mt-6">${TOS.config.serverConnected ? 'Your teaching application has been submitted successfully.' : 'Your application was saved on this device.'}</h1>
            <p class="text-slate-600 mt-3">${TOS.config.serverConnected ? 'Your application is currently under review. You will receive an email when an administrator makes a decision.' : 'Your application was saved in this browser. The school can only review it once this website is connected to a server, and no email has been sent.'}</p>
            <div class="mt-6 rounded-2xl bg-[#F7F8FA] border border-[#EEF0F3] p-5 text-left text-sm space-y-3">
                ${TOS.config.serverConnected ? `<div class="flex gap-3"><i class="fa-regular fa-envelope text-forest-600 mt-0.5"></i><span>We've sent a verification link to <b>${esc(email)}</b>. Please confirm your email address.</span></div>` : `<div class="flex gap-3"><i class="fa-regular fa-envelope text-forest-600 mt-0.5"></i><span>To make sure the school sees your application, email <b>${esc(school().email)}</b> with your details and CV.</span></div>`}
                <div class="flex gap-3"><i class="fa-solid fa-lock text-forest-600 mt-0.5"></i><span>You can't sign in to the Staff Portal until your application is approved.</span></div>
            </div>
            <div class="flex flex-wrap justify-center gap-3 mt-8"><a href="/staff/application" class="btn btn-forest">Check application status</a><a href="/" class="btn btn-outline">Back to website</a></div></div>`);
    } });

    S.route('/staff/verify-email', { title: 'Verify email', layout: 'auth', allowSignedIn: true, render: el => {
        let html;
        try { const r = ST.verifyEmail(S.q('token')); html = notice('ok', `<i class="fa-solid fa-circle-check mr-1"></i><b>${esc(r.email)}</b> is verified. Your application continues to be reviewed.`); }
        catch (e) { html = notice('error', esc(e.message)); }
        el.innerHTML = layout('Email verification', '', html + '<a href="/staff/application" class="btn btn-forest w-full h-12">Check application status</a>');
    } });

    // ---------------- Application status (the applicant signs in with their application credentials) ----------------
    S.route('/staff/application', { title: 'Application status', layout: 'auth', allowSignedIn: true, render: el => {
        let creds = null;
        const STEPS2 = ['pending', 'under_review', 'decision'];
        const showStatus = a => {
            const decided = ['approved', 'rejected', 'withdrawn'].includes(a.status), idx = a.status === 'pending' ? 0 : a.status === 'under_review' ? 1 : 2;
            const chip = { pending: 'bg-amber-50 text-amber-700', under_review: 'bg-sky-50 text-sky-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', withdrawn: 'bg-slate-100 text-slate-600' }[a.status];
            el.innerHTML = layout('Your application', esc(a.name) + ' · ' + esc(a.email), `
                <div class="flex flex-wrap items-center gap-3"><span class="s-chip ${chip} !text-sm !px-3 !py-1">${esc(a.statusLabel)}</span><span class="text-sm s-muted">Submitted ${ui.fmtDate(a.submittedAt)}</span>${a.emailVerified ? '<span class="s-chip bg-emerald-50 text-emerald-700"><i class="fa-solid fa-check"></i>Email verified</span>' : '<span class="s-chip bg-amber-50 text-amber-700">Email not verified</span>'}</div>
                <ol class="mt-6 space-y-4">${['Application received', 'Under review', decided ? 'Decision: ' + a.statusLabel : 'Decision'].map((t, i) => `<li class="flex items-center gap-3"><span class="w-8 h-8 rounded-full flex items-center justify-center text-xs ${i <= idx ? 'bg-forest text-white' : 'bg-slate-100 text-slate-400'}">${i < idx || (decided && i === 2) ? '<i class="fa-solid fa-check"></i>' : i + 1}</span><span class="text-sm ${i <= idx ? 'font-medium text-slate-900' : 's-muted'}">${t}</span></li>`).join('')}</ol>
                ${a.status === 'approved' ? notice('ok', 'Your application was approved. <a href="/staff/login" class="font-semibold underline">Sign in to the Staff Portal</a> with this email and your password.') : ''}
                ${a.status === 'rejected' ? `<div class="mt-6">${notice('error', 'Your application was not approved. Please contact administration if you have questions.' + (a.rejectionReason ? '<br><br>' + esc(a.rejectionReason) : ''))}</div>` : ''}
                ${a.messages.length ? `<h2 class="text-sm font-semibold text-slate-900 mt-8 mb-3">Messages</h2><div class="space-y-3">${a.messages.map(m => `<div class="rounded-xl p-4 text-sm ${m.from === 'school' ? 'bg-forest-50 border border-forest-100' : 'bg-[#F7F8FA] border border-[#EEF0F3] ml-8'}"><div class="text-xs font-semibold ${m.from === 'school' ? 'text-forest' : 'text-slate-600'}">${m.from === 'school' ? 'Tech Oasis School' : 'You'} · ${ui.timeAgo(m.at)}</div><p class="mt-1 whitespace-pre-line">${esc(m.body)}</p></div>`).join('')}</div>` : ''}
                ${a.infoRequested ? `<form id="replyForm" class="mt-4 space-y-3"><label class="field-label" for="rb">Your reply</label><textarea id="rb" rows="3" class="field" placeholder="Answer the school's request"></textarea><label class="btn btn-outline btn-sm cursor-pointer"><i class="fa-solid fa-paperclip"></i>Attach document<input type="file" id="rf" class="hidden" multiple></label><span id="rfn" class="text-xs s-muted ml-2"></span>${errBox}<button class="btn btn-forest w-full">Send reply</button></form>` : ''}
                ${['pending', 'under_review'].includes(a.status) ? '<button id="withdraw" class="btn btn-ghost w-full mt-8 text-rose-700">Withdraw my application</button>' : ''}
                <a href="/" class="block text-center text-sm font-semibold text-forest-600 mt-4">Back to website</a>`);
            const rf = el.querySelector('#replyForm');
            if (rf) { let files = []; el.querySelector('#rf').onchange = async e => { try { files = []; for (const fl of e.target.files) files.push(await readFile(fl, 'other')); el.querySelector('#rfn').textContent = files.map(x => x.name).join(', '); } catch (x) { showErr(el, x.message); } };
                rf.onsubmit = e => { e.preventDefault(); try { showStatus(ST.applicantReply(creds.email, creds.password, el.querySelector('#rb').value, files)); ui.toast('Reply sent to the school'); } catch (x) { showErr(el, x.message); } }; }
            const w = el.querySelector('#withdraw');
            if (w) w.onclick = async () => { if (await ui.confirmBox('Withdraw your application? You can apply again later.', { okText: 'Withdraw', danger: true })) { try { showStatus(ST.withdraw(creds.email, creds.password)); } catch (x) { ui.toast(x.message, 'error'); } } };
        };
        el.innerHTML = layout('Check your application', 'Sign in with the email and password you used when you applied.', `<form id="af" class="space-y-5">
            <div><label class="field-label" for="em">Email</label><input id="em" type="email" required autocomplete="email" class="field h-12"></div>
            ${pw('pw', 'Password', 'current-password')}${errBox}
            <button class="btn btn-forest w-full h-12">View status</button></form>
            <p class="mt-8 pt-6 border-t border-slate-100 text-sm text-slate-600">Haven't applied yet? <a href="/staff/apply" class="font-semibold text-forest-600 hover:underline">Apply to teach</a></p>`);
        bindEyes(el);
        el.querySelector('#af').onsubmit = e => {
            e.preventDefault();
            const email = el.querySelector('#em').value, password = el.querySelector('#pw').value;
            const a = ST.applicationByCredentials(email, password);
            if (!a) return showErr(el, 'Incorrect email or password.');
            creds = { email, password }; showStatus(ST.applicantView(a));
        };
    } });

    // ---------------- Staff login ----------------
    // Sign-in screen: brand-gradient page, one card. Left: the animated Tech Oasis mark on forest green. Right: the form.
    const loginShell = (msg, form) => `<main class="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-forest-600 via-forest to-ink overflow-hidden">
        <div class="relative w-full max-w-[940px] rounded-2xl overflow-hidden bg-forest shadow-lift md:min-h-[560px]">
            <div class="hidden md:block absolute -left-24 -bottom-24 w-72 h-72 rounded-full bg-forest-600" aria-hidden="true"></div>
            <div class="hidden md:block absolute left-24 bottom-10 w-44 h-44 rounded-full" style="background: radial-gradient(circle at 35% 30%, #3A8D7C, #14584A 70%)" aria-hidden="true"></div>
            <div class="hidden md:block absolute -left-10 -top-10 w-40 h-40 rounded-full bg-forest-500/60" aria-hidden="true"></div>
            <div class="relative grid md:grid-cols-2 md:min-h-[560px]">
                <div class="hidden md:flex flex-col items-center justify-center text-center px-8 pb-24">
                    ${ui.animatedLogo(150, 'login')}
                    <div class="text-white text-xl font-extrabold tracking-[0.2em] mt-5">TECH <span class="gold-text">OASIS</span></div>
                    <p class="text-[10px] text-forest-200 mt-2 uppercase tracking-[0.4em]">Where Innovation Meets Expertise</p>
                </div>
                <div class="light-surface staff-form-col bg-white p-7 sm:p-10 md:py-14 md:pl-24 md:pr-10 flex flex-col justify-center">
                    <a href="/" class="md:hidden self-start mb-6" aria-label="Tech Oasis School website">${ui.brandLogo(false, 36)}</a>
                    <h1 class="text-[30px] font-extrabold text-ink tracking-tight">Sign in</h1>
                    <p class="text-sm text-slate-500 mt-1">Staff dashboard for approved Tech Oasis teaching and support staff.</p>
                    ${ui.demoNotice()}
                    <div class="mt-6">${msg}${form}</div>
                </div>
            </div>
        </div>
        <p class="relative text-xs text-white/60 mt-5">&copy; ${new Date().getFullYear()} Tech Oasis School · <a href="mailto:${esc(school().email)}" class="underline">${esc(school().email)}</a></p>
    </main>`;
    const fillField = (id, type, auto, placeholder, icon, label, extra) => `<div class="relative"><label for="${id}" class="sr-only">${label}</label>
        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-ink" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
        <input id="${id}" type="${type}" required autocomplete="${auto}" placeholder="${placeholder}" class="w-full h-12 rounded-lg bg-slate-100 border border-transparent pl-11 ${extra ? 'pr-16' : 'pr-4'} text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:bg-white focus:border-forest-600 focus:ring-2 focus:ring-forest-600/20 transition">
        ${extra || ''}</div>`;
    S.route('/staff/login', { title: 'Staff sign in', layout: 'auth', render: el => {
        const q = S.q, state = q('state');
        const STATE_MSG = { suspended: 'Your staff account is currently suspended. Please contact administration.', banned: 'Your staff account has been disabled. Please contact administration.', archived: 'This account is no longer active. Please contact administration.' };
        const msg = state && STATE_MSG[state] ? notice('error', esc(STATE_MSG[state])) : q('expired') ? notice('warn', 'Your session has expired. Please sign in again.')
            : q('signedout') ? notice('ok', 'You have been signed out.') : q('reset') ? notice('ok', 'Your password has been updated. Sign in with your new password.') : '';
        el.innerHTML = loginShell(msg, `<form id="lf" class="space-y-4" novalidate>
                ${fillField('em', 'email', 'username', 'Email', 'fa-user', 'Email')}
                ${fillField('pw', 'password', 'current-password', 'Password', 'fa-lock', 'Password', '<button type="button" id="showPw" class="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold tracking-wider text-forest-600 hover:underline px-1" aria-label="Show password" aria-pressed="false">SHOW</button>')}
                <div class="flex items-center justify-between gap-3 text-xs">
                    <label class="flex items-center gap-2 text-slate-600 cursor-pointer"><input id="rm" type="checkbox" checked class="w-4 h-4 rounded accent-[#0C3B2E]">Remember me</label>
                    <a href="/staff/forgot-password" class="font-semibold text-forest-600 hover:underline">Forgot password?</a></div>
                ${errBox}
                <button class="btn btn-forest w-full h-12 text-[15px]">Sign in</button></form>
            <div class="flex items-center gap-3 my-4 text-xs text-slate-400" aria-hidden="true"><span class="flex-1 h-px bg-slate-200"></span>or<span class="flex-1 h-px bg-slate-200"></span></div>
            <a href="/student/login" class="btn btn-outline w-full h-12 text-[15px] !border-forest !text-forest">Student sign in</a>
            <div class="mt-6 text-center text-xs text-slate-500 space-y-1.5">
                <p>Don't have an account? <a href="/staff/apply" class="font-semibold text-forest-600 hover:underline">Apply to teach</a> · <a href="/staff/application" class="font-semibold text-forest-600 hover:underline">Application status</a></p>
                <p><a href="/" class="underline">Back to website</a></p></div>`);
        el.querySelector('#showPw').onclick = e => { const i = el.querySelector('#pw'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; e.currentTarget.textContent = show ? 'HIDE' : 'SHOW'; e.currentTarget.setAttribute('aria-pressed', show); e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); };
        el.querySelector('#em').focus();
        el.querySelector('#lf').onsubmit = e => {
            e.preventDefault();
            const email = el.querySelector('#em').value.trim(), password = el.querySelector('#pw').value;
            if (!email || !password) return showErr(el, 'Enter your email and password.');
            const r = ST.staffLogin(email, password, el.querySelector('#rm').checked);
            if (r.error) return showErr(el, r.error);
            S.me = null;
            S.go(r.mustChangePassword ? '/staff/change-password' : safeNext(q('next')), { replace: true });
        };
    } });

    S.route('/staff/forgot-password', { title: 'Reset password', layout: 'auth', render: el => {
        el.innerHTML = layout('Reset your password', "Enter your staff email. If it belongs to an active staff account, we'll email you a secure link to set a new password.", `<form id="ff" class="space-y-5"><div><label class="field-label" for="em">Staff email</label><input id="em" type="email" required class="field h-12"></div><button class="btn btn-forest w-full h-12">Email me a reset link</button></form><a href="/staff/login" class="block text-center text-sm font-semibold text-forest-600 mt-6">Back to sign in</a>`);
        el.querySelector('#ff').onsubmit = e => { e.preventDefault(); ST.requestPasswordReset(el.querySelector('#em').value); el.querySelector('#ff').outerHTML = notice('ok', 'If that email belongs to an active staff account, a reset link is on its way. The link expires in 2 hours.'); };
    } });
    S.route('/staff/reset-password', { title: 'Set a new password', layout: 'auth', allowSignedIn: true, render: el => {
        el.innerHTML = layout('Set a new password', 'Choose a new password for your staff account.', `<form id="rf" class="space-y-5">${pw('p1', 'New password', 'new-password')}${pw('p2', 'Confirm new password', 'new-password')}<p class="field-hint -mt-3">At least 8 characters.</p>${errBox}<button class="btn btn-forest w-full h-12">Save new password</button></form>`);
        bindEyes(el);
        el.querySelector('#rf').onsubmit = e => {
            e.preventDefault(); const p1 = el.querySelector('#p1').value;
            if (p1 !== el.querySelector('#p2').value) return showErr(el, 'The passwords do not match.');
            try { ST.resetPasswordWithToken(S.q('token'), p1); auth.logout(); S.me = null; S.go('/staff/login?reset=1', { replace: true }); } catch (x) { showErr(el, x.message); }
        };
    } });
    // Required before entering the portal when an administrator forced a password reset
    S.route('/staff/change-password', { title: 'Change your password', layout: 'auth', allowSignedIn: true, render: el => {
        const me = auth.current();
        if (!me || me.role !== 'staff') return S.go('/staff/login', { replace: true });
        el.innerHTML = layout('Change your password', 'For your security, the school administration requires you to set a new password before continuing.', `<form id="cf" class="space-y-5">${pw('c0', 'Current password', 'current-password')}${pw('c1', 'New password', 'new-password')}${pw('c2', 'Confirm new password', 'new-password')}${errBox}<button class="btn btn-forest w-full h-12">Update password and continue</button></form><button id="so" class="block mx-auto text-sm font-semibold text-slate-500 mt-6">Sign out</button>`);
        bindEyes(el);
        el.querySelector('#so').onclick = () => { auth.logout(); S.go('/staff/login', { replace: true }); };
        el.querySelector('#cf').onsubmit = async e => {
            e.preventDefault(); const n = el.querySelector('#c1').value;
            if (n !== el.querySelector('#c2').value) return showErr(el, 'The new passwords do not match.');
            try { await sapi.changePassword(el.querySelector('#c0').value, n); S.me = null; ui.toast('Password updated'); S.go('/staff/dashboard', { replace: true }); } catch (x) { showErr(el, x.message); }
        };
    } });
})();
