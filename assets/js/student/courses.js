// My Courses, Browse Courses, course page (curriculum) and enrollment checkout
(function () {
    // ---------------- My Courses ----------------
    S.route('/student/my-courses', { title: 'My Courses', nav: 'my-courses', live: true, skeleton: 'list', render: async el => {
        const all = await api.myCourses();
        let filter = S.q('filter') || 'all', sort = 'recent';
        const draw = () => {
            let list = all.filter(c => filter === 'all' || c.status === filter);
            const by = { recent: (a, b) => new Date(b.lastAccessAt || 0) - new Date(a.lastAccessAt || 0), newest: (a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt), progress: (a, b) => b.pct - a.pct, az: (a, b) => a.title.localeCompare(b.title) };
            list.sort(by[sort]);
            el.querySelector('#grid').innerHTML = list.length ? `<div class="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">${list.map(S.courseCard).join('')}</div>`
                : all.length ? S.empty('fa-filter', 'No courses in this view', 'Try another filter.') : S.empty('fa-book-open', 'No courses yet', 'When you enroll in a program it will appear here with your progress.', '<a href="/student/browse" class="btn btn-forest btn-sm">Browse courses</a>');
            el.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === filter); b.setAttribute('aria-selected', b.dataset.tab === filter); });
        };
        const n = s => all.filter(c => c.status === s).length;
        el.innerHTML = S.pageHeader('My Courses', `${ui.plural(all.length, 'course')} you're enrolled in`, '<a href="/student/browse" class="btn btn-outline btn-sm"><i class="fa-solid fa-compass"></i>Browse courses</a>')
            + `<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">${S.tabs([['all', 'All', all.length], ['in_progress', 'In progress', n('in_progress')], ['completed', 'Completed', n('completed')], ['not_started', 'Not started', n('not_started')]], filter)}
                <label class="flex items-center gap-2 text-sm s-muted shrink-0">Sort <select id="sort" class="field h-10 w-auto py-0"><option value="recent">Recently accessed</option><option value="newest">Newest</option><option value="progress">Progress</option><option value="az">Alphabetical</option></select></label></div><div id="grid"></div>`;
        el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { filter = b.dataset.tab; history.replaceState({}, '', '/student/my-courses' + (filter === 'all' ? '' : '?filter=' + filter)); draw(); });
        el.querySelector('#sort').onchange = e => { sort = e.target.value; draw(); };
        draw();
    } });

    // ---------------- Browse ----------------
    S.route('/student/browse', { title: 'Browse Courses', nav: 'browse', live: true, skeleton: 'list', render: async el => {
        const all = await api.catalog();
        const cats = [...new Set(all.map(c => c.category))].sort();
        let q = '', cat = '', level = '';
        const draw = () => {
            const list = all.filter(c => (!q || (c.title + ' ' + c.shortDescription + ' ' + c.instructor).toLowerCase().includes(q)) && (!cat || c.category === cat) && (!level || c.level === level));
            el.querySelector('#grid').innerHTML = list.length ? `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">${list.map(c => `<a href="/student/course/${c.id}" class="s-card s-card-hover overflow-hidden flex flex-col">
                <div class="relative aspect-[16/9] bg-slate-100"><img src="${esc(c.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover">${c.enrolled ? '<span class="absolute top-3 left-3 s-chip bg-emerald-50 text-emerald-700"><i class="fa-solid fa-check"></i>Enrolled</span>' : `<span class="absolute top-3 left-3 s-chip bg-white text-slate-900">${c.price ? ui.money(c.price) : 'Free'}</span>`}</div>
                <div class="p-4 flex-1 flex flex-col"><div class="text-xs s-muted">${esc(c.category)} · ${esc(c.level)}</div><h3 class="font-semibold text-slate-900 mt-0.5">${esc(c.title)}</h3><p class="text-sm s-muted mt-1 line-clamp-2">${esc(c.shortDescription)}</p>
                <div class="mt-auto pt-3 flex items-center justify-between text-xs s-muted"><span><i class="fa-solid fa-chalkboard-user mr-1"></i>${esc(c.instructor)}</span><span>${c.hours}h · ${c.lessons} lessons${c.reviews ? ` · <i class="fa-solid fa-star text-gold"></i> ${c.rating.toFixed(1)}` : ''}</span></div></div></a>`).join('')}</div>`
                : S.empty('fa-magnifying-glass', 'No courses match', 'Try a different search or filter.');
        };
        el.innerHTML = S.pageHeader('Browse Courses', 'Every program open for enrollment. Paid programs include a free trial.')
            + `<div class="s-card p-3 flex flex-col md:flex-row gap-3 mb-5"><div class="relative flex-1"><i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i><input id="bq" type="search" class="field h-11 pl-9" placeholder="Search by course, skill or instructor"></div>
                <select id="bc" class="field h-11 md:w-56"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
                <select id="bl" class="field h-11 md:w-44"><option value="">Any level</option>${db.settings().courses.levels.map(l => `<option>${esc(l)}</option>`).join('')}</select></div><div id="grid"></div>`;
        el.querySelector('#bq').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
        el.querySelector('#bc').onchange = e => { cat = e.target.value; draw(); };
        el.querySelector('#bl').onchange = e => { level = e.target.value; draw(); };
        draw();
    } });

    // ---------------- Checkout (enroll from inside the portal) ----------------
    S.checkout = function (course, done, payOnly) {
        const st = db.settings().payments;
        if (!course.price) {
            return api.enroll(course.id).then(() => { ui.toast('You are enrolled. Enjoy the course!'); done && done(); }).catch(e => ui.toast(e.message, 'error'));
        }
        let quote = { subtotal: course.price, discount: 0, total: course.price }, coupon = '';
        const m = ui.modal({ title: payOnly ? 'Complete your payment' : 'Enroll in ' + course.title, size: 'max-w-md', body: `
            <div class="flex gap-4 items-center"><img src="${esc(course.thumbnail)}" alt="" class="w-20 h-14 rounded-xl object-cover"><div><div class="font-semibold text-slate-900">${esc(course.title)}</div><div class="text-xs s-muted">${esc(course.level)} · ${esc(course.category)}</div></div></div>
            ${payOnly ? '' : `<form id="cpf" class="flex gap-2 mt-5"><input id="cpi" class="field" placeholder="Coupon code" autocomplete="off" aria-label="Coupon code"><button class="btn btn-outline btn-sm">Apply</button></form><p id="cpm" class="text-xs mt-1.5 hidden"></p>`}
            <dl id="qb" class="mt-5 text-sm space-y-2"></dl>
            ${!payOnly && st.trialDays ? `<p class="text-xs s-muted mt-4 bg-[#F7F8FA] rounded-xl p-3"><i class="fa-solid fa-gift text-gold-600 mr-1"></i>Start with a <b>${st.trialDays}-day free trial</b>: full access, nothing to pay today.</p>` : ''}
            <div class="mt-5 space-y-2">${!payOnly && st.trialDays ? '<button data-act="trial" class="btn btn-forest w-full h-12">Start free trial</button>' : ''}${TOS.lms.onlinePayments()
                ? `<button data-act="pay" class="btn ${!payOnly && st.trialDays ? 'btn-outline' : 'btn-gold'} w-full h-12"><i class="fa-solid fa-lock text-xs"></i>Pay <span data-total></span> now</button>`
                : `<div class="rounded-xl border border-slate-200 bg-[#F7F8FA] p-4 text-sm text-slate-700"><div class="font-semibold text-slate-900"><i class="fa-regular fa-credit-card mr-1.5 s-muted"></i>Online payment is not available yet</div><p class="mt-1">To pay <b data-total></b> for this course, email <a class="font-semibold text-forest underline" href="mailto:${esc(db.settings().school.studentEmail)}?subject=${encodeURIComponent('Payment for ' + course.title)}">${esc(db.settings().school.studentEmail)}</a>. The school confirms your payment and unlocks your access.</p></div>`}</div>` });
        const paint = () => { m.el.querySelector('#qb').innerHTML = `<div class="flex justify-between"><dt class="s-muted">Tuition</dt><dd>${ui.money(quote.subtotal)}</dd></div>${quote.discount ? `<div class="flex justify-between text-forest-600"><dt>Discount (${esc(coupon.toUpperCase())})</dt><dd>−${ui.money(quote.discount)}</dd></div>` : ''}<div class="flex justify-between border-t pt-2 font-semibold text-slate-900"><dt>Total</dt><dd>${ui.money(quote.total)}</dd></div>`; m.el.querySelector('[data-total]').textContent = ui.money(quote.total); };
        paint();
        const cpf = m.el.querySelector('#cpf');
        if (cpf) cpf.onsubmit = async e => {
            e.preventDefault(); const code = m.el.querySelector('#cpi').value.trim(), msg = m.el.querySelector('#cpm'); msg.classList.remove('hidden');
            const q = await api.quote(course.id, code);
            if (q.error) { msg.className = 'text-xs mt-1.5 text-rose-700'; msg.textContent = q.error; return; }
            coupon = code; quote = q; paint(); msg.className = 'text-xs mt-1.5 text-forest-600'; msg.textContent = 'Coupon applied.';
        };
        m.el.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
            b.disabled = true;
            try { await api.enroll(course.id, { coupon, payNow: b.dataset.act === 'pay' }); m.close(); ui.toast(b.dataset.act === 'trial' ? 'Your free trial has started!' : 'Payment received. Welcome!'); done && done(); }
            catch (e) { b.disabled = false; ui.toast(e.message, 'error'); }
        });
    };

    // ---------------- Course page ----------------
    S.route('/student/course/:courseId', { title: 'Course', nav: 'my-courses', live: true, render: async (el, { courseId }) => {
        const c = await api.course(courseId);
        S.setTitle(c.title);
        const p = c.progress, cert = c.certificate, enr = c.enrollment;
        const pay = enr && enr.payment, blocked = pay === 'overdue' || pay === 'pending';
        const resumeId = p && (p.currentId || p.nextId);
        const lessonRow = (l, idx) => {
            const current = p && l.id === p.currentId && !l.completed;
            const icon = l.completed ? '<i class="fa-solid fa-circle-check text-emerald-500"></i>' : current ? '<i class="fa-solid fa-circle-play text-forest-600"></i>' : l.locked ? '<i class="fa-solid fa-lock text-slate-300"></i>' : '<i class="fa-regular fa-circle text-slate-300"></i>';
            const inner = `<span class="w-5 text-center shrink-0">${icon}</span>
                <span class="flex-1 min-w-0"><span class="block text-sm ${current ? 'font-semibold text-slate-900' : l.locked ? 'text-slate-500' : 'text-slate-800'} truncate">${esc(l.title)}</span>
                <span class="block text-xs s-muted"><i class="fa-solid ${S.LESSON_ICON(l.type)} mr-1"></i>${(ui.LESSON_TYPES[l.type] || {}).label || ''}${l.durationMin ? ' · ' + ui.fmtDuration(l.durationMin) : ''}${l.isPreview && !c.enrolled ? ' · <span class="text-forest-600 font-semibold">Free preview</span>' : ''}${l.locked && l.lockReason === 'sequential' ? ' · Complete previous lessons first' : ''}</span></span>
                ${current ? '<span class="s-chip bg-forest text-white">Current</span>' : ''}`;
            return `<li>${l.locked ? `<div class="flex items-center gap-3 px-5 py-3" title="Locked">${inner}</div>` : `<a href="/student/learn/${l.id}" class="flex items-center gap-3 px-5 py-3 ${current ? 'bg-forest-50/70' : 'hover:bg-slate-50'}">${inner}</a>`}</li>`;
        };
        el.innerHTML = `
            <div class="s-card overflow-hidden">
                <div class="grid lg:grid-cols-[1fr_320px]">
                    <div class="p-6 sm:p-8">
                        <a href="${c.enrolled ? '/student/my-courses' : '/student/browse'}" class="text-sm s-muted hover:text-slate-900"><i class="fa-solid fa-arrow-left mr-2"></i>${c.enrolled ? 'My Courses' : 'Browse Courses'}</a>
                        <div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600 mt-5">Course · ${esc(c.category)}</div>
                        <h1 class="text-[28px] sm:text-[32px] font-bold text-slate-900 leading-tight mt-1">${esc(c.title)}</h1>
                        <p class="s-muted mt-2 max-w-2xl">${esc(c.shortDescription)}</p>
                        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm text-slate-600">${c.instructors.map(i => `<span class="flex items-center gap-2">${i.avatar ? `<img src="${esc(i.avatar)}" alt="" class="w-7 h-7 rounded-full object-cover">` : ''}${esc(i.name)}</span>`).join('')}<span><i class="fa-solid fa-signal mr-1 text-slate-400"></i>${esc(c.level)}</span><span><i class="fa-regular fa-clock mr-1 text-slate-400"></i>${c.hours} hours</span><span><i class="fa-solid fa-language mr-1 text-slate-400"></i>${esc(c.language)}</span></div>
                        ${c.enrolled && pay === 'trial' ? `<div class="mt-5 text-sm bg-gold-50 border border-gold-200 text-gold-700 rounded-xl px-4 py-3"><i class="fa-solid fa-hourglass-half mr-1"></i>Free trial ends ${ui.fmtDate(enr.trialEndsAt)}. <button data-pay class="font-semibold underline">Pay now</button> to keep access.</div>` : ''}
                        ${blocked ? `<div class="mt-5 text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3"><i class="fa-solid fa-lock mr-1"></i>${pay === 'overdue' ? 'Your free trial has ended.' : 'Payment is pending.'} Lessons are locked until payment is complete. <button data-pay class="font-semibold underline">Pay now</button></div>` : ''}
                    </div>
                    <div class="bg-[#F7F8FA] border-t lg:border-t-0 lg:border-l border-[#E6E8EC] p-6 sm:p-8 flex flex-col justify-center">
                        ${c.enrolled ? `<div class="flex items-center gap-5">${S.ring(p.pct, 92, 8)}<div><div class="text-lg font-bold text-slate-900">${p.pct}% complete</div><div class="text-sm s-muted">${p.done} of ${p.total} lessons</div></div></div>
                            ${resumeId && !blocked ? `<a href="/student/learn/${resumeId}" class="btn btn-forest h-12 mt-6 w-full"><i class="fa-solid fa-play text-xs"></i>${p.done ? (p.pct === 100 ? 'Review course' : 'Continue learning') : 'Start learning'}</a>` : ''}
                            ${cert.issued ? `<a href="/student/certificates" class="btn btn-gold h-11 mt-2 w-full"><i class="fa-solid fa-award"></i>View certificate</a>` : cert.eligibility && cert.eligibility.eligible ? `<button data-claim class="btn btn-gold h-11 mt-2 w-full"><i class="fa-solid fa-award"></i>Claim certificate</button>` : ''}`
                        : `<div class="text-3xl font-bold text-slate-900">${c.price ? ui.money(c.price) : 'Free'}</div>${c.price && db.settings().payments.trialDays ? `<div class="text-sm text-forest-600 font-medium mt-1"><i class="fa-solid fa-gift mr-1"></i>${db.settings().payments.trialDays}-day free trial</div>` : ''}
                            <button data-enroll class="btn btn-forest h-12 mt-5 w-full">${c.price ? (db.settings().payments.trialDays ? 'Start free trial' : 'Enroll now') : 'Enroll for free'}</button>
                            <p class="text-xs s-muted mt-3 text-center">${ui.plural(c.sections.reduce((a, s) => a + s.lessons.length, 0), 'lesson')} · Certificate ${c.certificate.enabled ? 'included' : 'not offered'}</p>`}
                    </div>
                </div>
            </div>

            <div class="grid xl:grid-cols-[1fr_340px] gap-5 mt-5 items-start">
                <section class="s-card overflow-hidden" aria-labelledby="currh">
                    <div class="flex items-center justify-between px-5 py-4 border-b border-[#EEF0F3]"><h2 id="currh" class="s-h2">Course curriculum</h2><button data-toggle-all class="text-xs font-semibold text-forest-600">Collapse all</button></div>
                    ${c.sections.length ? c.sections.map(s => {
                        const open = !p || s.lessons.some(l => l.id === p.currentId) || s.status === 'in_progress' || (s.index === 1 && !p.done);
                        return `<details ${open ? 'open' : ''} class="group border-b border-[#EEF0F3] last:border-0" data-sec>
                            <summary class="list-none cursor-pointer flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                                <span class="w-10 h-10 rounded-xl ${s.status === 'complete' ? 'bg-emerald-50 text-emerald-600' : 'bg-forest-50 text-forest'} flex items-center justify-center text-sm font-bold shrink-0">${s.status === 'complete' ? '<i class="fa-solid fa-check"></i>' : s.index}</span>
                                <span class="flex-1 min-w-0"><span class="block text-[11px] font-bold uppercase tracking-[0.15em] s-muted">Section ${s.index}</span><span class="block font-semibold text-slate-900 truncate">${esc(s.title)}</span></span>
                                <span class="hidden sm:block text-xs s-muted text-right shrink-0">${s.lessons.length ? (c.enrolled ? (s.status === 'complete' ? '<span class="text-emerald-600 font-semibold">✓ Complete</span>' : s.status === 'in_progress' ? s.pct + '% complete' : 'Not started') : ui.plural(s.lessons.length, 'lesson')) : 'Coming soon'}</span>
                                <i class="fa-solid fa-chevron-down text-xs text-slate-400 group-open:rotate-180 transition"></i></summary>
                            <ul class="pb-2">${s.lessons.map(lessonRow).join('') || '<li class="px-5 py-3 text-sm s-muted">Lessons coming soon.</li>'}</ul></details>`;
                    }).join('') : '<p class="p-5 text-sm s-muted">The curriculum is being prepared.</p>'}
                </section>
                <aside class="space-y-5">
                    ${cert.enabled ? `<section class="s-card p-5"><h2 class="s-h2"><i class="fa-solid fa-award text-gold-600 mr-2"></i>Certificate</h2>
                        ${cert.issued ? `<p class="text-sm s-muted mt-2">Issued ${ui.fmtDate(cert.issued.issuedAt)} · <span class="font-mono">${esc(cert.issued.code)}</span></p><a href="/student/certificates" class="btn btn-outline btn-sm mt-3">View certificate</a>`
                        : cert.eligibility ? `<ul class="mt-3 space-y-2">${cert.eligibility.checks.map(x => `<li class="flex gap-2.5 text-sm"><i class="fa-solid ${x.ok ? 'fa-circle-check text-emerald-500' : 'fa-circle text-slate-200'} mt-0.5"></i><span><span class="${x.ok ? 'text-slate-700' : 'text-slate-900'}">${esc(x.label)}</span><span class="block text-xs s-muted">${esc(x.detail)}</span></span></li>`).join('')}</ul>`
                        : `<p class="text-sm s-muted mt-2">Earn a verified certificate by completing ${cert.rules.minLessonPct}% of lessons${cert.rules.requireQuizPass ? ', passing every quiz' : ''}${cert.rules.requireAssignments ? ' and scoring ' + cert.rules.minAssignmentPct + '%+ on assignments' : ''}.</p>`}</section>` : ''}
                    ${c.quizzes.length ? `<section class="s-card p-5"><h2 class="s-h2">Quizzes</h2><div class="divide-y divide-[#F1F3F5] mt-2">${c.quizzes.map(q => `<a href="/student/learn/${q.lessonId}" class="flex items-center gap-3 py-2.5 group"><i class="fa-solid fa-circle-question text-violet-500"></i><span class="flex-1 min-w-0 text-sm truncate group-hover:underline">${esc(q.title)}</span>${q.best != null ? `<span class="text-xs font-semibold ${q.status === 'completed' ? 'text-emerald-600' : 'text-slate-600'}">${q.best}%</span>` : '<span class="text-xs s-muted">Not taken</span>'}</a>`).join('')}</div></section>` : ''}
                    ${c.assignments.length ? `<section class="s-card p-5"><h2 class="s-h2">Assignments</h2><div class="divide-y divide-[#F1F3F5] mt-2">${c.assignments.map(a => `<a href="/student/assignments/${a.id}" class="flex items-center gap-3 py-2.5 group"><i class="fa-solid fa-file-pen text-gold-600"></i><span class="flex-1 min-w-0 text-sm truncate group-hover:underline">${esc(a.title)}</span>${S.statusChip(a.status)}</a>`).join('')}</div></section>` : ''}
                    ${c.resources.length ? `<section class="s-card p-5"><h2 class="s-h2">Course resources</h2><div class="space-y-2 mt-3">${c.resources.map(r => `<div class="flex items-center gap-3"><i class="fa-solid ${S.fileIcon(r.fileType)} w-5"></i><span class="flex-1 min-w-0 text-sm truncate">${esc(r.name)}</span>${S.download(r)}</div>`).join('')}</div></section>` : ''}
                    <section class="s-card p-5"><h2 class="s-h2">About this course</h2><div class="prose-tos text-sm mt-2 max-h-72 overflow-y-auto thin-scroll">${ui.md(c.description)}</div>
                        ${c.outcomes.length ? `<h3 class="text-sm font-semibold text-slate-900 mt-4">What you'll learn</h3><ul class="mt-2 space-y-1.5">${c.outcomes.map(o => `<li class="flex gap-2 text-sm text-slate-700"><i class="fa-solid fa-check text-emerald-500 mt-1 text-xs"></i>${esc(o)}</li>`).join('')}</ul>` : ''}</section>
                    ${c.instructors.length ? `<section class="s-card p-5"><h2 class="s-h2">Instructor</h2>${c.instructors.map(i => `<div class="flex items-center gap-3 mt-3">${i.avatar ? `<img src="${esc(i.avatar)}" alt="" class="w-12 h-12 rounded-xl object-cover">` : ''}<div><div class="text-sm font-semibold text-slate-900">${esc(i.name)}</div><div class="text-xs s-muted">${esc(i.title)}</div></div></div><p class="text-sm s-muted mt-2">${esc(i.bio)}</p>`).join('')}${c.enrolled ? '<a href="/student/messages?new=1" class="btn btn-outline btn-sm mt-3"><i class="fa-regular fa-envelope"></i>Message instructor</a>' : ''}</section>` : ''}
                </aside>
            </div>`;
        const tg = el.querySelector('[data-toggle-all]');
        tg.onclick = () => { const close = tg.textContent.startsWith('Collapse'); el.querySelectorAll('[data-sec]').forEach(d => d.open = !close); tg.textContent = close ? 'Expand all' : 'Collapse all'; };
        const reload = () => S.dispatch();
        el.querySelectorAll('[data-enroll]').forEach(b => b.onclick = () => S.checkout(c, reload));
        el.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => S.checkout(c, reload, true));
        const cl = el.querySelector('[data-claim]');
        if (cl) cl.onclick = async () => { try { const cert = await api.claimCertificate(c.id); ui.toast('Certificate issued: ' + cert.code); S.go('/student/certificates'); } catch (e) { ui.toast(e.message, 'error'); } };
    } });
})();
