// Admin CMS shell: navigation, hash router, shared view helpers, charts and the dashboard.
// Each feature file registers routes with A.route(pattern, handler).
const { db, lms, ui, auth } = TOS;
const esc = ui.esc;

const A = window.A = {
    routes: [],
    route(pattern, fn) { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'); this.routes.push({ re, keys, fn, pattern }); },
    view: () => document.getElementById('view'),
    query: () => document.getElementById('globalSearch').value.trim().toLowerCase(),
    matches: (...parts) => { const q = A.query(); return !q || parts.join(' ').toLowerCase().includes(q); },
};

// ---------------- Navigation ----------------
A.NAV = [
    { items: [['dashboard', 'Dashboard', 'fa-gauge-high']] },
    { title: 'Learning Management', items: [['courses', 'Courses', 'fa-book-open'], ['categories', 'Categories', 'fa-folder-tree'], ['lessons', 'Lessons', 'fa-circle-play'], ['quizzes', 'Quizzes', 'fa-circle-question'], ['assignments', 'Assignments', 'fa-file-pen'], ['resources', 'Resources', 'fa-paperclip'], ['certificates', 'Certificates', 'fa-award']] },
    { title: 'People', items: [['students', 'Students', 'fa-user-graduate'], ['instructors', 'Instructors', 'fa-chalkboard-user'], ['enrollments', 'Enrollments', 'fa-id-card']] },
    { title: 'Commerce', items: [['payments', 'Payments', 'fa-credit-card'], ['orders', 'Orders', 'fa-receipt'], ['coupons', 'Coupons', 'fa-ticket']] },
    { title: 'Engagement', items: [['reviews', 'Reviews', 'fa-star'], ['discussions', 'Discussions', 'fa-comments'], ['announcements', 'Announcements', 'fa-bullhorn']] },
    { title: 'Analytics', items: [['analytics/courses', 'Course Analytics', 'fa-chart-column'], ['analytics/students', 'Student Analytics', 'fa-chart-line'], ['analytics/revenue', 'Revenue Analytics', 'fa-sack-dollar']] },
    { title: 'Settings', items: [['settings/school', 'School Settings', 'fa-school'], ['settings/courses', 'Course Settings', 'fa-sliders'], ['settings/certificates', 'Certificate Settings', 'fa-certificate'], ['settings/payments', 'Payment Settings', 'fa-wallet']] }
];
function badgeFor(key) {
    if (A.extraBadges && A.extraBadges[key]) return A.extraBadges[key]();
    if (key === 'assignments') return db.count('submissions', s => s.status !== 'graded');
    if (key === 'reviews') return 0;
    if (key === 'payments') return db.all('enrollments').filter(e => lms.paymentState(e) === 'overdue').length;
    return 0;
}
A.renderNav = function (path) {
    const active = A.NAV.flatMap(g => g.items).map(i => i[0]).filter(k => path === k || path.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0];
    document.getElementById('navList').innerHTML = A.NAV.map(g => `<div class="mb-5">${g.title ? `<div class="rail-group px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35" style="--rail-x:6px"><span class="rail-fade">${g.title}</span></div>` : ''}
        ${g.items.map(([k, label, ic]) => { const n = badgeFor(k), on = k === active; return `<a href="#/${k}" class="relative flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 ${on ? 'bg-gold text-ink font-semibold' : 'hover:bg-white/5'}" ${on ? 'aria-current="page"' : ''}>
            <i class="fa-solid ${ic} w-4 ${on ? '' : 'text-white/40'}"></i><span class="flex-1 rail-fade">${label}</span>${n ? `<span class="rail-badge min-w-[20px] h-5 px-1.5 rounded-full ${on ? 'bg-ink text-white' : 'bg-rose-600 text-white'} text-[10px] font-bold flex items-center justify-center">${n}</span>` : ''}</a>`; }).join('')}</div>`).join('');
    const pending = badgeFor('assignments') + badgeFor('payments') + badgeFor('messages') + badgeFor('support'), bell = document.getElementById('bell');
    bell.textContent = pending; bell.classList.toggle('hidden', !pending);
};

// ---------------- Router ----------------
let currentRoute = null;
A.navigate = path => { location.hash = '#/' + path; };
A.refresh = () => A.dispatch(true);
A.dispatch = function (keepScroll) {
    if (!auth.isAdmin()) return A.showLogin();
    const path = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    const params = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    if (currentRoute !== path) { document.getElementById('globalSearch').value = ''; if (!keepScroll) window.scrollTo(0, 0); }
    currentRoute = path;
    A.renderNav(path);
    document.getElementById('nav').classList.add('-translate-x-full'); document.getElementById('navScrim').classList.add('hidden');
    for (const r of A.routes) {
        const m = path.match(r.re);
        if (m) { const args = {}; r.keys.forEach((k, i) => args[k] = decodeURIComponent(m[i + 1])); try { r.fn(args, params); } catch (e) { console.error(e); A.view().innerHTML = A.empty('fa-triangle-exclamation', 'Something went wrong', e.message); } return; }
    }
    A.view().innerHTML = A.empty('fa-compass', 'Page not found', 'That section does not exist.', '<a href="#/dashboard" class="btn btn-forest btn-sm">Go to dashboard</a>');
};
A.crumbs = (...parts) => {
    document.getElementById('crumbs').innerHTML = parts.map((p, i) => Array.isArray(p) ? `<a href="#/${p[1]}" class="hover:text-ink truncate">${esc(p[0])}</a><i class="fa-solid fa-chevron-right text-[9px] text-slate-300"></i>` : `<span class="font-semibold text-ink truncate">${esc(p)}</span>`).join('');
    document.title = (parts[parts.length - 1] || 'Admin') + ' | Tech Oasis CMS';
};

// ---------------- View helpers ----------------
A.header = (title, sub, actions) => `<div class="flex flex-wrap items-end justify-between gap-4 mb-6"><div class="min-w-0"><h1 class="font-display text-3xl text-ink">${title}</h1>${sub ? `<p class="text-sm text-slate-500 mt-1">${sub}</p>` : ''}</div><div class="flex flex-wrap gap-2">${actions || ''}</div></div>`;
A.card = (body, cls) => `<div class="bg-white rounded-2xl border border-slate-200/80 ${cls || 'p-5'}">${body}</div>`;
A.cardTitle = (t, right) => `<div class="flex items-center justify-between gap-3 mb-4"><h2 class="font-semibold text-ink">${t}</h2>${right || ''}</div>`;
A.empty = (icon, title, text, action) => `<div class="text-center py-14 px-6"><span class="w-14 h-14 mx-auto rounded-2xl bg-forest-50 text-forest flex items-center justify-center text-xl"><i class="fa-solid ${icon}"></i></span><div class="font-semibold text-ink mt-4">${title}</div>${text ? `<p class="text-sm text-slate-500 mt-1 max-w-sm mx-auto">${text}</p>` : ''}${action ? `<div class="mt-5">${action}</div>` : ''}</div>`;
A.stat = (icon, tone, label, value, sub) => `<div class="bg-white rounded-2xl border border-slate-200/80 p-5"><div class="flex items-center justify-between"><span class="text-sm text-slate-500">${label}</span><span class="w-9 h-9 rounded-xl ${tone} flex items-center justify-center text-sm"><i class="fa-solid ${icon}"></i></span></div><div class="font-display text-3xl text-ink mt-2">${value}</div>${sub ? `<div class="text-xs text-slate-500 mt-1">${sub}</div>` : ''}</div>`;
A.pill = s => `<span class="pill pill-${esc(String(s).toLowerCase())}">${esc(String(s).replace(/_/g, ' '))}</span>`;
A.avatar = (name, tone) => `<span class="w-9 h-9 rounded-full ${tone || 'bg-forest-50 text-forest'} text-[11px] font-bold flex items-center justify-center shrink-0">${esc(ui.initials(name))}</span>`;
A.person = (name, sub) => `<div class="flex items-center gap-3 min-w-0">${A.avatar(name)}<div class="min-w-0"><div class="font-medium text-ink truncate">${esc(name)}</div>${sub ? `<div class="text-xs text-slate-500 truncate">${esc(sub)}</div>` : ''}</div></div>`;
A.progressBar = (pct, w) => `<div class="flex items-center gap-2 ${w || 'w-36'}"><div class="flex-1 h-1.5 bg-slate-100 rounded-full"><div class="h-1.5 rounded-full bg-forest-600" style="width:${pct}%"></div></div><span class="text-xs text-slate-500 w-9 text-right">${pct}%</span></div>`;
A.iconBtn = (icon, label, attrs, danger) => `<button ${attrs} class="w-8 h-8 rounded-lg ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-500 hover:bg-slate-100 hover:text-ink'}" title="${label}" aria-label="${label}"><i class="fa-solid ${icon} text-xs"></i></button>`;

// Data table: cols = [{ label, render(row), cls }]
A.table = (cols, rows, emptyHtml) => rows.length ? `<div class="overflow-x-auto -mx-5 sm:mx-0"><table class="w-full text-sm"><thead><tr class="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">${cols.map(c => `<th class="py-3 px-4 font-semibold whitespace-nowrap ${c.cls || ''}">${c.label}</th>`).join('')}</tr></thead>
    <tbody class="divide-y divide-slate-100">${rows.map(r => `<tr class="hover:bg-slate-50/60">${cols.map(c => `<td class="py-3 px-4 align-middle ${c.cls || ''}">${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : (emptyHtml || A.empty('fa-inbox', 'Nothing here yet'));

// Form helpers
A.field = (label, control, hint, cls) => `<div class="${cls || ''}"><label class="field-label">${label}</label>${control}${hint ? `<p class="field-hint">${hint}</p>` : ''}</div>`;
A.input = (name, value, attrs) => `<input name="${name}" value="${esc(value == null ? '' : value)}" class="field" ${attrs || ''}>`;
A.textarea = (name, value, rows, attrs) => `<textarea name="${name}" rows="${rows || 4}" class="field" ${attrs || ''}>${esc(value || '')}</textarea>`;
A.select = (name, options, value, attrs) => `<select name="${name}" class="field" ${attrs || ''}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value == null ? '' : value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
A.toggle = (name, checked, label, hint) => `<label class="flex items-start gap-3 cursor-pointer"><span class="switch mt-0.5"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span></span></span><span><span class="block text-sm font-medium text-ink">${label}</span>${hint ? `<span class="block text-xs text-slate-500">${hint}</span>` : ''}</span></label>`;
// Read a form into an object: checkboxes -> booleans, type=number -> numbers, data-list -> array of lines
A.formData = form => {
    const o = {};
    Array.from(form.elements).forEach(el => {
        if (!el.name || el.disabled) return;
        if (el.type === 'checkbox') o[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
        else if (el.type === 'number') o[el.name] = el.value === '' ? null : +el.value;
        else if (el.type === 'file') return;
        else if (el.dataset.list !== undefined) o[el.name] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
        else o[el.name] = el.value.trim();
    });
    return o;
};
// Small uploads are stored inline (demo storage adapter). Production: swap for your storage provider.
A.MAX_INLINE = 1048576;
A.upload = async file => {
    if (!file) return null;
    if (file.size > A.MAX_INLINE) { ui.toast(`"${file.name}" is larger than 1 MB. Host it (e.g. cloud storage) and paste the link instead.`, 'error'); return null; }
    return { url: await ui.readFile(file), name: file.name, size: file.size, type: file.type };
};
A.fileType = name => { const ext = (String(name).split('.').pop() || '').toLowerCase(); return ext === 'pdf' ? 'pdf' : ['zip', 'rar', '7z'].includes(ext) ? 'zip' : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? 'image' : ['js', 'ts', 'html', 'css', 'py', 'json', 'java', 'sql'].includes(ext) ? 'code' : ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext) ? 'doc' : 'file'; };
A.csv = (filename, rows) => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
};
A.courseOptions = (withAll) => (withAll ? [['', withAll]] : []).concat(db.all('courses').sort((a, b) => a.title.localeCompare(b.title)).map(c => [c.id, c.title]));
A.userName = id => (db.get('users', id) || {}).name || 'Deleted user';
A.courseTitle = id => (db.get('courses', id) || {}).title || '—';
A.bindSearch = fn => { const el = document.getElementById('globalSearch'); el.oninput = fn; };

// ---------------- Charts ----------------
// Bar and line charts (with their hover tooltips) live in the shared dashboard kit, assets/js/core/kit.js
A.barChart = TOS.kit.barChart;
A.lineChart = TOS.kit.lineChart;
A.donut = TOS.kit.donut;
// Daily buckets for the last n days
A.daily = (rows, dateKey, n, valueFn) => {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
        const next = new Date(d); next.setDate(d.getDate() + 1);
        const inDay = rows.filter(r => r[dateKey] && new Date(r[dateKey]) >= d && new Date(r[dateKey]) < next);
        out.push({ label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: valueFn ? inDay.reduce((a, r) => a + valueFn(r), 0) : inDay.length });
    }
    return out;
};
A.revenueOf = orders => orders.filter(o => o.status === 'paid').reduce((a, o) => a + (+o.total || 0), 0);

// ---------------- Dashboard ----------------
A.route('dashboard', () => {
    A.crumbs('Dashboard');
    const courses = db.all('courses'), enrs = db.all('enrollments'), students = db.where('users', { role: 'student' });
    const published = courses.filter(c => c.status === 'published').length;
    const revenue = A.revenueOf(db.all('orders'));
    const completed = enrs.filter(e => e.status === 'completed').length;
    const active7 = new Set(enrs.filter(e => e.lastAccessAt && Date.now() - new Date(e.lastAccessAt) < 7 * 864e5).map(e => e.userId)).size;
    const popular = courses.map(c => ({ c, n: enrs.filter(e => e.courseId === c.id).length })).sort((a, b) => b.n - a.n).slice(0, 5);
    const school = db.settings().school;

    // Enrollment trend: last 30 days against the 30 days before
    const series = A.daily(enrs, 'enrolledAt', 30).map((d, i, all) => ({ ...d, short: i % 5 === 0 || i === all.length - 1 ? d.label : '' }));
    const last30 = series.reduce((a, d) => a + d.value, 0);
    const prev30 = enrs.filter(e => { const age = Date.now() - new Date(e.enrolledAt); return age >= 30 * 864e5 && age < 60 * 864e5; }).length;
    // Absolute change reads honestly on small numbers (a % jump from 1 to 11 looks dramatic but means little)
    const delta = last30 - prev30;
    const trend = `<span class="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full ${delta > 0 ? 'bg-emerald-50 text-emerald-700' : delta < 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}"><i class="fa-solid ${delta > 0 ? 'fa-arrow-trend-up' : delta < 0 ? 'fa-arrow-trend-down' : 'fa-minus'} text-[10px]"></i>${delta > 0 ? '+' : ''}${delta} vs previous 30 days</span>`;

    // Work queue: every item is always listed so the admin sees at a glance what is clear and what is waiting
    const tasks = [
        ['#/assignments', 'fa-file-pen', 'bg-gold-50 text-gold-700', 'Submissions to grade', 'Assignments waiting for feedback', badgeFor('assignments')],
        ['#/staff-applications', 'fa-file-signature', 'bg-violet-50 text-violet-700', 'Staff applications', 'Pending or under review', badgeFor('staff-applications')],
        ['#/payments', 'fa-hourglass-end', 'bg-rose-50 text-rose-700', 'Unpaid after free trial', 'Students to follow up', badgeFor('payments')],
        ['#/messages', 'fa-envelope', 'bg-sky-50 text-sky-700', 'Unread messages', 'From students to the school', badgeFor('messages')],
        ['#/support', 'fa-life-ring', 'bg-emerald-50 text-emerald-700', 'Open support tickets', 'Questions from learners', badgeFor('support')]
    ];
    const open = tasks.reduce((a, t) => a + t[5], 0);

    const actions = [['#/courses/new', 'fa-plus', 'New course'], ['#/assignments', 'fa-file-pen', 'Grade work'], ['#/students', 'fa-user-plus', 'Add student'],
        ['#/staff-applications', 'fa-user-tie', 'Review staff'], ['#/announcements', 'fa-bullhorn', 'Announce'], ['#/coupons', 'fa-ticket', 'New coupon']];

    const K = TOS.kit, dayStart = new Date(new Date().toDateString()), dayEnd = new Date(dayStart.getTime() + 864e5);
    const today = db.where('calendar_events', e => new Date(e.startsAt) < dayEnd && new Date(e.endsAt || e.startsAt) >= dayStart).sort((x, y) => new Date(x.startsAt) - new Date(y.startsAt));
    const EVT_TONE = { class: 'forest', exam: 'rose', quiz: 'violet', deadline: 'gold', event: 'sky', holiday: 'emerald' };
    const aside = `<div class="flex items-center justify-between mb-1"><h2 class="text-xs font-semibold text-slate-900">Today at the school</h2><a href="#/calendar" class="k-link">Calendar</a></div>`
        + K.schedule(today.slice(0, 4).map(e => ({ time: e.allDay ? 'All day' : new Date(e.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), title: e.title, sub: e.courseId ? (db.get('courses', e.courseId) || {}).title : (e.location || 'Whole school'), tone: EVT_TONE[e.type], href: '#/calendar' })), 'Nothing scheduled today.');

    A.view().innerHTML = `
        ${K.welcome({ greeting: K.greetingNow(), name: school.name || 'Administrator', sub: open ? `${open} item${open === 1 ? '' : 's'} need${open === 1 ? 's' : ''} your attention today.` : 'Everything is up to date.', aside })}
        <div class="flex flex-wrap justify-end gap-2 mt-4"><a href="index.html" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>View site</a><a href="#/courses/new" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Create course</a></div>

        <section aria-label="Key figures" class="mt-4">${K.stats([
            { icon: 'fa-user-graduate', tone: 'sky', label: 'Students', value: students.length, sub: `${active7} active this week`, href: '#/students' },
            { icon: 'fa-book-open', tone: 'forest', label: 'Courses', value: courses.length, sub: `${published} published · ${courses.length - published} draft`, href: '#/courses' },
            { icon: 'fa-id-card', tone: 'violet', label: 'Enrollments', value: enrs.length, sub: `${enrs.filter(e => lms.paymentState(e) === 'trial').length} on free trial`, href: '#/enrollments' },
            { icon: 'fa-flag-checkered', tone: 'gold', label: 'Completion rate', value: (enrs.length ? Math.round(completed / enrs.length * 100) : 0) + '%', sub: `${completed} of ${enrs.length} completed`, meter: enrs.length ? completed / enrs.length * 100 : 0, href: '#/analytics/courses' },
            { icon: 'fa-award', tone: 'amber', label: 'Certificates', value: db.count('certificates', c => !c.revoked), sub: 'issued to students', href: '#/certificates' },
            { icon: 'fa-sack-dollar', tone: 'emerald', label: 'Revenue', value: ui.money(revenue), sub: `${db.count('orders', { status: 'pending' })} orders pending`, href: '#/payments' }
        ])}</section>

        <div class="grid lg:grid-cols-5 xl:grid-cols-3 gap-5 mt-5">
            <section class="lg:col-span-3 xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 min-w-0">
                <div class="flex flex-wrap items-start justify-between gap-3 mb-5">
                    <div><h2 class="font-semibold text-ink">New enrollments</h2><div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1"><span class="font-display text-2xl text-ink">${last30}</span><span class="text-xs text-slate-500 whitespace-nowrap">in the last 30 days</span>${trend}</div></div>
                    <a href="#/enrollments" class="text-xs font-semibold text-forest hover:underline">View enrollments</a>
                </div>
                ${A.barChart(series, { height: 190, minMax: 4, empty: 'No enrollments in the last 30 days' })}
            </section>
            <section class="lg:col-span-2 xl:col-span-1 bg-white rounded-2xl border border-slate-200/80 p-5 min-w-0">
                <div class="flex items-center justify-between gap-3 mb-3"><h2 class="font-semibold text-ink">Needs attention</h2><span class="text-xs font-semibold px-2 py-0.5 rounded-full ${open ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}">${open ? open + ' open' : 'All clear'}</span></div>
                <div class="divide-y divide-slate-100">${tasks.map(([href, ic, tone, label, sub, n]) => `<a href="${href}" class="flex items-center gap-3 py-3 group">
                    <span class="w-9 h-9 rounded-xl ${n ? tone : 'bg-slate-50 text-slate-400'} flex items-center justify-center text-sm shrink-0"><i class="fa-solid ${ic}"></i></span>
                    <span class="min-w-0 flex-1"><span class="block text-sm font-medium ${n ? 'text-ink' : 'text-slate-500'} truncate group-hover:underline">${label}</span><span class="block text-xs text-slate-500 truncate">${sub}</span></span>
                    ${n ? `<span class="min-w-[24px] h-6 px-2 rounded-full bg-ink text-white text-xs font-bold flex items-center justify-center">${n}</span>` : '<span class="text-xs text-emerald-700 font-medium flex items-center gap-1"><i class="fa-solid fa-check text-[10px]"></i>Clear</span>'}
                    <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-500"></i></a>`).join('')}</div>
            </section>
        </div>

        <section class="mt-5">${K.panel({ title: 'Quick actions', icon: 'fa-bolt', tone: 'amber', body: K.quickActions(actions.map(([href, icon, label], i) => ({ href, icon, label, tone: ['forest', 'gold', 'sky', 'violet', 'rose', 'emerald'][i % 6] }))) })}</section>

        <div class="grid lg:grid-cols-2 gap-5 mt-5">
            ${A.card(A.cardTitle('Most popular courses', '<a href="#/analytics/courses" class="text-xs font-semibold text-forest hover:underline">Analytics</a>') + (popular.length ? `<div class="space-y-3.5">${popular.map(({ c, n }, i) => `<a href="#/courses/${c.id}" class="flex items-center gap-3 group"><span class="w-5 text-xs font-semibold text-slate-400 text-right">${i + 1}</span><img src="${esc(c.thumbnail)}" alt="" class="w-12 h-9 rounded-lg object-cover bg-slate-100 shrink-0"><div class="flex-1 min-w-0"><div class="text-sm font-medium text-ink truncate group-hover:underline">${esc(c.title)}</div><div class="h-1.5 bg-slate-100 rounded-full mt-1.5"><div class="h-1.5 rounded-full bg-forest-600" style="width:${popular[0].n ? n / popular[0].n * 100 : 0}%"></div></div></div><span class="text-sm font-semibold text-ink w-14 text-right whitespace-nowrap">${n} <span class="text-xs font-normal text-slate-400">${n === 1 ? 'student' : 'students'}</span></span></a>`).join('')}</div>` : '<p class="text-sm text-slate-500">No courses yet.</p>'), 'p-5 min-w-0')}
            ${A.card(A.cardTitle('Recent enrollments', '<a href="#/enrollments" class="text-xs font-semibold text-forest hover:underline">View all</a>') + `<div class="divide-y divide-slate-100 -my-2">${enrs.slice().sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt)).slice(0, 5).map(e => `<div class="flex items-center gap-3 py-2.5">${A.avatar(A.userName(e.userId))}<div class="min-w-0 flex-1"><div class="text-sm font-medium text-ink truncate">${esc(A.userName(e.userId))}</div><div class="text-xs text-slate-500 truncate">${esc(A.courseTitle(e.courseId))}</div></div><span class="text-xs text-slate-400 whitespace-nowrap">${ui.timeAgo(e.enrolledAt)}</span></div>`).join('') || '<p class="text-sm text-slate-500 py-2">No enrollments yet.</p>'}</div>`, 'p-5 min-w-0')}
        </div>`;
});

// ---------------- Boot ----------------
A.showLogin = () => {
    document.getElementById('shell').classList.add('hidden'); document.getElementById('login').classList.remove('hidden');
    // Role-based access: a signed-in student (or instructor) is told plainly that the CMS is off-limits
    const s = auth.current(), form = document.getElementById('loginForm');
    if (s && s.role !== 'admin' && !document.getElementById('roleDenied')) {
        form.insertAdjacentHTML('afterbegin', `<div id="roleDenied" class="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm p-4" role="alert"><b>Access denied.</b> You are signed in as a ${s.role === 'student' ? 'student' : 'staff member'}, and ${s.role === 'student' ? 'student accounts' : 'staff accounts'} cannot access the admin CMS. <a href="${s.role === 'student' ? '/student/dashboard' : '/staff/dashboard'}" class="underline font-semibold">Go to your ${s.role === 'student' ? 'student portal' : 'Staff Portal'}</a></div>`);
    }
    // Re-render the vault emblem so its intro plays every time the sign-in screen is shown
    const vault = document.getElementById('vault'); if (vault) vault.innerHTML = ui.vaultLogo(240);
    setTimeout(() => document.getElementById('adminId').focus(), 30);
};
// Emblem state: armed while the form has focus, red on a failed attempt, green when access is granted
const vaultState = (cls, on) => { const v = document.querySelector('#vault .vl'); if (v) v.classList.toggle(cls, on); return v; };
A.start = function () {
    ui.applyBrandLogos();
    let fails = 0, lockUntil = 0;
    const lf = document.getElementById('loginForm'), btn = document.getElementById('loginBtn'), idEl = document.getElementById('adminId'), passEl = document.getElementById('adminPass');
    const showErr = (msg, field) => {
        const err = document.getElementById('loginErr'); err.textContent = msg; err.classList.remove('hidden');
        [idEl, passEl].forEach(f => f.setAttribute('aria-invalid', String(f === field || (!field && msg.startsWith('Invalid')))));
        if (field) field.focus();
    };
    const busy = on => { btn.disabled = on; btn.innerHTML = on ? '<span class="adm-spin" aria-hidden="true"></span><span data-label>Signing in…</span>' : '<span data-label>Sign in</span>'; btn.setAttribute('aria-busy', String(on)); };
    lf.onsubmit = e => {
        e.preventDefault();
        if (btn.disabled) return;
        const err = document.getElementById('loginErr');
        if (Date.now() < lockUntil) return showErr(`Too many attempts. Try again in ${Math.ceil((lockUntil - Date.now()) / 1000)}s.`);
        if (!idEl.value.trim()) return showErr('Enter the admin email.', idEl);
        if (!passEl.value) return showErr('Enter the passcode.', passEl);
        busy(true);
        // Let the spinner paint before the (deliberately slow) passcode hash runs
        setTimeout(() => {
            const ok = auth.adminLogin(idEl.value, passEl.value);
            busy(false);
            if (ok) {
                fails = 0; err.classList.add('hidden'); passEl.value = ''; [idEl, passEl].forEach(f => f.removeAttribute('aria-invalid'));
                const v = vaultState('granted', true), open = () => { vaultState('granted', false); document.getElementById('login').classList.add('hidden'); document.getElementById('shell').classList.remove('hidden'); A.dispatch(); };
                return v && v.getBoundingClientRect().width ? setTimeout(open, 650) : open();
            }
            const v = vaultState('denied', false); if (v) { void v.getBoundingClientRect(); vaultState('denied', true); setTimeout(() => vaultState('denied', false), 900); }
            if (++fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
            // Same message for a wrong email and a wrong passcode, so the form does not reveal which admin emails exist
            showErr('Invalid admin email or passcode.');
        }, 30);
    };
    const eye = document.getElementById('togglePass');
    eye.onclick = () => { const show = passEl.type === 'password'; passEl.type = show ? 'text' : 'password'; eye.setAttribute('aria-pressed', String(show)); eye.setAttribute('aria-label', show ? 'Hide passcode' : 'Show passcode'); eye.innerHTML = `<i class="fa-regular ${show ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`; passEl.focus(); };
    const fb = document.getElementById('forgotBtn');
    fb.onclick = () => { const open = document.getElementById('forgotHelp').classList.toggle('hidden') === false; fb.setAttribute('aria-expanded', String(open)); };
    const sc = db.settings().school, contact = [sc.email && 'Email: ' + sc.email, sc.phone && 'Phone: ' + sc.phone].filter(Boolean);
    document.getElementById('adminContact').innerHTML = contact.length ? 'Need help? ' + contact.map(esc).join('<br>') : 'Authorized administrators only. Activity may be monitored.';
    lf.addEventListener('focusin', () => vaultState('armed', true));
    lf.addEventListener('focusout', () => setTimeout(() => vaultState('armed', lf.contains(document.activeElement)), 0));
    document.getElementById('logoutBtn').onclick = () => { auth.adminLogout(); A.showLogin(); };
    document.getElementById('navToggle').onclick = () => { document.getElementById('nav').classList.remove('-translate-x-full'); document.getElementById('navScrim').classList.remove('hidden'); };
    document.getElementById('navScrim').onclick = () => { document.getElementById('nav').classList.add('-translate-x-full'); document.getElementById('navScrim').classList.add('hidden'); };
    document.getElementById('adminEmailLabel').textContent = db.settings().school.adminEmail;
    window.addEventListener('hashchange', () => A.dispatch());
    if (auth.isAdmin()) { document.getElementById('shell').classList.remove('hidden'); A.dispatch(); } else A.showLogin();
};
