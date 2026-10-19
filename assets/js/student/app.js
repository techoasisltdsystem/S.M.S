// Tech Oasis portal shell, shared by the Student Portal (/student/*) and the Staff Portal (/staff/*).
// Each app registers a config in S.APPS (base path, role, API, navigation, sidebar card) and its pages with
// S.route(pattern, { title, nav, layout, live, render }). The shell, router, guards and components are shared.
const { api, ui, auth, db } = TOS;
const esc = ui.esc;

const S = window.S = { routes: [], APPS: {}, me: null, counts: { notifications: 0, messages: 0, announcements: 0 }, current: null, renderToken: 0 };

S.route = (pattern, def) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    S.routes.push(Object.assign({ pattern, re, keys, layout: 'app' }, def));
};

// ---------------- Student app config ----------------
S.APPS.student = {
    base: '/student', role: 'student', label: 'Student', name: 'Student Portal', api: TOS.api,
    searchPlaceholder: 'Search courses, lessons, assignments',
    nav: [
        { title: 'Main', items: [['dashboard', 'Dashboard', 'fa-house'], ['my-courses', 'My Courses', 'fa-book-open'], ['browse', 'Browse Courses', 'fa-compass'], ['progress', 'Learning Progress', 'fa-chart-line'], ['assignments', 'Assignments', 'fa-file-pen'], ['quizzes', 'Quizzes', 'fa-circle-question'], ['certificates', 'Certificates', 'fa-award']] },
        { title: 'Communication', items: [['messages', 'Messages', 'fa-envelope', 'messages'], ['announcements', 'Announcements', 'fa-bullhorn', 'announcements'], ['notifications', 'Notifications', 'fa-bell', 'notifications']] },
        { title: 'Academic', items: [['calendar', 'Calendar', 'fa-calendar-days'], ['schedule', 'My Schedule', 'fa-clock'], ['resources', 'Resources', 'fa-folder-open']] },
        { title: 'Account', items: [['profile', 'Profile', 'fa-user'], ['settings', 'Settings', 'fa-gear'], ['help', 'Help & Support', 'fa-life-ring']] }
    ],
    bottom: [['dashboard', 'Home', 'fa-house'], ['my-courses', 'Courses', 'fa-book-open'], ['continue', 'Learn', 'fa-circle-play', 'primary'], ['notifications', 'Alerts', 'fa-bell'], ['profile', 'Profile', 'fa-user']],
    roleLine: me => me.program || 'Student',
    card: me => `<div class="text-[11px] s-muted font-mono">${esc(me.studentId || '')}</div>${me.program ? `<div class="text-[11px] text-forest-600 truncate">${esc(me.program)}</div>` : ''}`,
    menu: [['profile', 'My Profile', 'fa-regular fa-user'], ['settings', 'Settings', 'fa-solid fa-gear'], ['help', 'Help', 'fa-regular fa-circle-question']]
};
S.app = S.APPS.student;
S.appFor = path => Object.values(S.APPS).find(a => path === a.base || path.startsWith(a.base + '/')) || S.APPS.student;
S.url = p => S.app.base + '/' + p;

// ---------------- Navigation ----------------
S.path = () => {
    let p = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    // /admin/... is the CMS: hand over to admin.html with the same route
    if (p === '/admin' || p.startsWith('/admin/')) { location.replace('/admin.html#/' + p.slice(7)); return null; }
    if (p === '' || p === '/portal.html') p = '/student';
    const app = S.appFor(p);
    if (p === app.base) p = app.base + '/dashboard';
    return p;
};
S.go = (path, opts) => {
    if (opts && opts.replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
    S.dispatch();
};
document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const href = a.getAttribute('href');
    if (!Object.values(S.APPS).some(app => href === app.base || href.startsWith(app.base + '/') || href.startsWith(app.base + '?'))) return;
    e.preventDefault();
    S.closeOverlays();
    if (href === location.pathname + location.search) return S.dispatch();
    S.go(href);
});
window.addEventListener('popstate', () => S.dispatch());

// ---------------- Shared components ----------------
S.q = k => new URLSearchParams(location.search).get(k);
S.avatar = (me, size) => {
    const s = size || 40;
    return me && me.avatar ? `<img src="${esc(me.avatar)}" alt="" class="rounded-full object-cover shrink-0" style="width:${s}px;height:${s}px">`
        : `<span class="rounded-full bg-forest text-gold font-semibold flex items-center justify-center shrink-0" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .36)}px">${esc(ui.initials(me ? me.name : '?'))}</span>`;
};
S.ring = (pct, size, stroke, label) => {
    const s = size || 64, w = stroke || 6, r = (s - w) / 2, c = 2 * Math.PI * r;
    return `<div class="relative shrink-0" style="width:${s}px;height:${s}px" role="img" aria-label="${pct}% complete"><svg width="${s}" height="${s}" class="-rotate-90"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke-width="${w}" class="ring-track"/><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke-width="${w}" stroke-linecap="round" class="ring-value" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/></svg>
        <div class="absolute inset-0 flex items-center justify-center font-semibold text-slate-900" style="font-size:${Math.round(s * .22)}px">${label != null ? label : pct + '%'}</div></div>`;
};
S.bar = (pct, cls) => `<div class="h-2 rounded-full bg-slate-100 overflow-hidden ${cls || ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="h-2 rounded-full bg-gradient-to-r from-forest-600 to-forest-400" style="width:${pct}%"></div></div>`;
S.statusChip = st => ({
    completed: '<span class="s-chip bg-emerald-50 text-emerald-700"><i class="fa-solid fa-circle-check"></i>Completed</span>',
    in_progress: '<span class="s-chip bg-sky-50 text-sky-700"><i class="fa-solid fa-spinner"></i>In progress</span>',
    not_started: '<span class="s-chip"><i class="fa-regular fa-circle"></i>Not started</span>',
    upcoming: '<span class="s-chip bg-sky-50 text-sky-700"><i class="fa-regular fa-clock"></i>Upcoming</span>',
    overdue: '<span class="s-chip bg-rose-50 text-rose-700"><i class="fa-solid fa-triangle-exclamation"></i>Overdue</span>',
    submitted: '<span class="s-chip bg-amber-50 text-amber-700"><i class="fa-solid fa-paper-plane"></i>Submitted</span>',
    late: '<span class="s-chip bg-amber-50 text-amber-700"><i class="fa-solid fa-clock"></i>Submitted late</span>',
    graded: '<span class="s-chip bg-emerald-50 text-emerald-700"><i class="fa-solid fa-circle-check"></i>Graded</span>',
    available: '<span class="s-chip bg-sky-50 text-sky-700"><i class="fa-solid fa-play"></i>Available</span>',
    pending: '<span class="s-chip bg-amber-50 text-amber-700"><i class="fa-solid fa-rotate"></i>Retake available</span>',
    failed: '<span class="s-chip bg-rose-50 text-rose-700"><i class="fa-solid fa-xmark"></i>No attempts left</span>',
    published: '<span class="s-chip bg-emerald-50 text-emerald-700">Published</span>',
    draft: '<span class="s-chip bg-amber-50 text-amber-700">Draft</span>'
}[st] || `<span class="s-chip">${esc(st)}</span>`);
S.empty = (icon, title, text, action) => `<div class="s-card px-6 py-14 text-center fade-in"><span class="w-14 h-14 mx-auto rounded-2xl bg-forest-50 text-forest flex items-center justify-center text-xl"><i class="fa-solid ${icon}"></i></span>
    <h3 class="font-semibold text-slate-900 mt-4">${title}</h3>${text ? `<p class="text-sm s-muted mt-1 max-w-sm mx-auto">${text}</p>` : ''}${action ? `<div class="mt-5">${action}</div>` : ''}</div>`;
S.pageHeader = (title, sub, actions) => `<div class="flex flex-wrap items-end justify-between gap-4 mb-6"><div class="min-w-0"><h1 class="s-title">${title}</h1>${sub ? `<p class="text-sm s-muted mt-1">${sub}</p>` : ''}</div>${actions ? `<div class="flex flex-wrap gap-2">${actions}</div>` : ''}</div>`;
S.tabs = (items, active, attr) => `<div class="flex gap-1 overflow-x-auto no-scrollbar p-1 bg-white border border-[#E6E8EC] rounded-xl w-full sm:w-auto" role="tablist">${items.map(([k, l, n]) => `<button role="tab" aria-selected="${k === active}" ${attr || 'data-tab'}="${k}" class="s-tab ${k === active ? 'on' : ''}">${l}${n != null ? ` <span class="ml-1 opacity-60">${n}</span>` : ''}</button>`).join('')}</div>`;
S.relDate = d => {
    if (!d) return '—';
    const t = new Date(d), diff = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    const time = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (diff === 0) return 'Today, ' + time; if (diff === 1) return 'Tomorrow, ' + time; if (diff === -1) return 'Yesterday, ' + time;
    return t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + time;
};
S.LESSON_ICON = t => (ui.LESSON_TYPES[t] || ui.LESSON_TYPES.article).icon;
S.download = (r) => /^(https?:|data:)/.test(r.url) ? `<a href="${esc(r.url)}" ${r.url.startsWith('data:') ? `download="${esc(r.name)}"` : 'target="_blank" rel="noopener noreferrer"'} class="btn btn-outline btn-sm" aria-label="Download ${esc(r.name)}"><i class="fa-solid fa-download"></i></a>` : '';
S.fileIcon = t => ({ pdf: 'fa-file-pdf text-rose-600', zip: 'fa-file-zipper text-amber-600', image: 'fa-file-image text-sky-600', code: 'fa-file-code text-violet-600', doc: 'fa-file-word text-blue-600', template: 'fa-file-lines text-forest-600' }[t] || 'fa-file text-slate-500');

// Loading skeletons shaped like the page that is coming
S.skeleton = kind => {
    const line = (w, h) => `<div class="sk" style="width:${w};height:${h || 12}px"></div>`;
    const card = h => `<div class="s-card p-5 space-y-3">${line('40%', 14)}${line('90%')}${line('70%')}${h ? `<div class="sk" style="height:${h}px"></div>` : ''}</div>`;
    if (kind === 'list') return `<div class="space-y-4">${line('220px', 26)}${line('320px')}<div class="space-y-3 mt-6">${[1, 2, 3, 4].map(() => `<div class="s-card p-4 flex gap-4 items-center"><div class="sk w-12 h-12 shrink-0"></div><div class="flex-1 space-y-2">${line('50%', 14)}${line('30%')}</div></div>`).join('')}</div></div>`;
    if (kind === 'learn') return `<div class="space-y-4"><div class="sk w-full" style="aspect-ratio:16/9;max-height:60vh"></div>${line('50%', 22)}${line('30%')}</div>`;
    return `<div class="space-y-6">${line('280px', 28)}${line('200px')}<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${[1, 2, 3, 4].map(() => `<div class="s-card p-5 space-y-3">${line('50%')}${line('40%', 24)}</div>`).join('')}</div><div class="grid lg:grid-cols-3 gap-5"><div class="lg:col-span-2">${card(140)}</div>${card(80)}</div></div>`;
};
// Error states with a retry, mapped from API error codes
S.errorView = (err, retry) => {
    const home = S.url('dashboard');
    const map = {
        NO_ACCESS: ['fa-lock', "You don't have access to this", err.message + (S.app.role === 'student' ? ' Enroll to unlock it, or contact support if this is unexpected.' : ''), S.app.role === 'student' ? '<a href="/student/browse" class="btn btn-forest btn-sm">Browse courses</a> <a href="/student/help" class="btn btn-outline btn-sm">Get help</a>' : `<a href="${home}" class="btn btn-forest btn-sm">Back to dashboard</a>`],
        NOT_FOUND: ['fa-compass', 'We couldn\'t find that', err.message, `<a href="${home}" class="btn btn-forest btn-sm">Back to dashboard</a>`],
        FORBIDDEN: ['fa-ban', 'Not permitted', err.message, `<a href="${home}" class="btn btn-forest btn-sm">Back to dashboard</a>`]
    }[err.code] || ['fa-plug-circle-exclamation', 'Something went wrong', (err.message || 'A connection problem stopped this page from loading.') + ' Please try again.', '<button data-retry class="btn btn-forest btn-sm"><i class="fa-solid fa-rotate-right"></i>Try again</button>'];
    const html = S.empty(map[0], map[1], esc(map[2]), map[3]);
    setTimeout(() => { const b = document.querySelector('[data-retry]'); if (b && retry) b.onclick = retry; });
    return html;
};

// ---------------- Shell ----------------
function sidebarHtml() {
    const me = S.me, app = S.app;
    const active = (S.current && S.current.nav) || '';
    return `<div class="rail-head h-16 px-5 flex items-center border-b border-[#E6E8EC] shrink-0"><a href="${S.url('dashboard')}" aria-label="${app.name} home">${ui.brandLogo(false, 34)}</a><span class="rail-fade ml-auto text-[10px] font-bold uppercase tracking-[0.15em] text-gold-600 bg-gold-50 px-2 py-1 rounded-md">${app.label}</span></div>
        <a href="${S.url('profile')}" class="rail-card mx-3 mt-4 p-3 rounded-xl bg-[#F7F8FA] border border-[#EEF0F3] flex items-center gap-3 hover:border-forest-200">
            ${S.avatar(me, 42)}<div class="min-w-0 rail-fade"><div class="text-sm font-semibold text-slate-900 truncate">${esc(me.name)}</div>${app.card(me)}</div></a>
        <nav class="flex-1 overflow-y-auto thin-scroll pb-4" aria-label="${app.name}">${app.nav.map(g => {
            const items = g.items.filter(it => !it[4] || it[4](me));
            return items.length ? `<div class="s-nav-group rail-group"><span class="rail-fade">${g.title}</span></div>${items.map(([k, l, ic, badge]) => {
                const n = badge ? S.counts[badge] : 0;
                return `<a href="${S.url(k)}" class="s-nav-link ${active === k ? 'active' : ''}" ${active === k ? 'aria-current="page"' : ''}><i class="fa-solid ${ic}"></i><span class="flex-1 rail-fade">${l}</span>${n ? `<span class="s-badge" data-badge="${badge}">${n > 99 ? '99+' : n}</span>` : `<span data-badge="${badge || ''}"></span>`}</a>`;
            }).join('')}` : '';
        }).join('')}</nav>
        <div class="p-3 border-t border-[#E6E8EC] shrink-0"><button data-logout class="s-nav-link w-[calc(100%-1rem)] text-left text-rose-700 hover:bg-rose-50"><i class="fa-solid fa-right-from-bracket !text-rose-400"></i><span class="rail-fade">Log out</span></button></div>`;
}
function headerHtml(route) {
    const me = S.me, focus = route.layout === 'focus', app = S.app;
    const badge = (n, key) => `<span data-badge="${key}" class="${n ? '' : 'hidden'} absolute -top-0.5 -right-0.5 s-badge">${n > 99 ? '99+' : n}</span>`;
    return `<header class="s-header sticky top-0 z-30 px-3 sm:px-6 flex items-center gap-2 sm:gap-4">
        <button data-open-nav class="${focus ? '' : 'lg:hidden'} w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-600" aria-label="Open menu"><i class="fa-solid fa-bars"></i></button>
        ${focus ? `<a href="${S.url('dashboard')}" class="hidden sm:block">${ui.logoMark(28)}</a>` : ''}
        <h1 id="pageTitle" class="text-[15px] sm:text-base font-semibold text-slate-900 truncate min-w-0">${esc(route.title || '')}</h1>
        <div class="relative ml-auto hidden md:block w-full max-w-xs" id="searchBox">
            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input id="portalSearch" type="search" autocomplete="off" placeholder="${esc(app.searchPlaceholder)}" aria-label="Search" class="w-full h-10 rounded-xl bg-[#F4F5F7] border border-transparent pl-9 pr-3 text-sm focus:outline-none focus:bg-white focus:border-forest-200 focus:ring-4 focus:ring-forest-600/10">
            <div id="searchResults" class="hidden absolute left-0 right-0 top-12 bg-white rounded-xl shadow-lift border border-[#E6E8EC] py-1.5 max-h-96 overflow-y-auto thin-scroll"></div>
        </div>
        <div class="flex items-center gap-1 sm:gap-2 ml-auto md:ml-0">
            <a href="${S.url('messages')}" class="relative w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-600 flex items-center justify-center" aria-label="Messages"><i class="fa-regular fa-envelope text-[17px]"></i>${badge(S.counts.messages, 'messages')}</a>
            <div class="relative"><button data-bell class="relative w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-600" aria-label="Notifications" aria-haspopup="true"><i class="fa-regular fa-bell text-[17px]"></i>${badge(S.counts.notifications, 'notifications')}</button>
                <div id="bellPanel" class="hidden absolute right-0 mt-2 w-[min(360px,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-lift border border-[#E6E8EC] overflow-hidden z-40"></div></div>
            <div class="relative"><button data-profile class="flex items-center gap-2.5 pl-1 pr-1 sm:pr-3 h-10 rounded-xl hover:bg-slate-100" aria-label="Account menu" aria-haspopup="true">${S.avatar(me, 32)}<span class="hidden sm:block text-left leading-tight max-w-[160px]"><span class="block text-sm font-medium text-slate-800 truncate">${esc(me.name.split(' ')[0])}</span><span class="block text-[11px] s-muted truncate">${esc(app.roleLine ? app.roleLine(me) : app.label)}</span></span><i class="hidden sm:block fa-solid fa-chevron-down text-[10px] text-slate-400"></i></button>
                <div id="profileMenu" class="hidden absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-lift border border-[#E6E8EC] py-2 z-40 text-sm">
                    <div class="px-4 py-2 border-b border-[#EEF0F3] mb-1"><div class="font-semibold text-slate-900 truncate">${esc(me.name)}</div><div class="text-xs s-muted truncate">${esc(me.email)}</div></div>
                    ${app.menu.map(([k, l, ic]) => `<a href="${S.url(k)}" class="flex items-center gap-3 px-4 py-2 hover:bg-slate-50"><i class="${ic} w-4 text-slate-400"></i>${l}</a>`).join('')}
                    <a href="/" class="flex items-center gap-3 px-4 py-2 hover:bg-slate-50"><i class="fa-solid fa-globe w-4 text-slate-400"></i>School website</a>
                    <button data-logout class="w-full flex items-center gap-3 px-4 py-2 hover:bg-rose-50 text-rose-700 border-t border-[#EEF0F3] mt-1"><i class="fa-solid fa-right-from-bracket w-4"></i>Log out</button></div></div>
        </div></header>`;
}
function bottomNavHtml() {
    const active = (S.current && S.current.nav) || '';
    return `<nav class="s-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E6E8EC] grid grid-cols-5" aria-label="Quick navigation">${S.app.bottom.map(([k, l, ic, primary]) => `<a href="${S.url(k)}" class="relative flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium text-slate-500 ${active === k || (k === 'continue' && active === 'learn') ? 'active' : ''}">
        ${primary ? `<span class="w-11 h-11 -mt-5 rounded-full bg-forest text-gold flex items-center justify-center shadow-lift"><i class="fa-solid ${ic}"></i></span>` : `<i class="fa-solid ${ic} text-lg"></i>`}<span>${l}</span>
        ${k === 'notifications' ? `<span data-badge="notifications" class="${S.counts.notifications ? '' : 'hidden'} absolute top-2 left-1/2 ml-1 s-badge">${S.counts.notifications}</span>` : ''}</a>`).join('')}</nav>`;
}
function renderShell(route) {
    const root = document.getElementById('root'), focus = route.layout === 'focus';
    root.innerHTML = `<div class="min-h-screen flex">
        <aside id="sideNav" class="s-sidebar ${focus ? "" : "app-side"} fixed ${focus ? "" : "lg:sticky"} top-0 left-0 z-50 h-screen flex flex-col -translate-x-full ${focus ? '' : 'lg:translate-x-0'} transition-transform shrink-0">${sidebarHtml()}</aside>
        <div id="navScrim" class="hidden fixed inset-0 z-40 bg-slate-900/40 ${focus ? '' : 'lg:hidden'}"></div>
        <div class="${focus ? '' : 'app-main '}flex-1 min-w-0 flex flex-col">
            ${headerHtml(route)}
            <main id="main" class="flex-1 min-w-0 ${focus ? '' : 'px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-28 lg:pb-10 max-w-[1400px] w-full mx-auto'}" tabindex="-1"></main>
        </div></div>${focus ? '' : bottomNavHtml()}`;
    S.shellKey = S.app.base + ':' + route.layout;
    bindShell();
}
function bindShell() {
    const nav = document.getElementById('sideNav'), scrim = document.getElementById('navScrim');
    const openNav = () => { nav.classList.remove('-translate-x-full'); scrim.classList.remove('hidden'); };
    document.querySelectorAll('[data-open-nav]').forEach(b => b.onclick = openNav);
    scrim.onclick = () => S.closeOverlays();
    document.querySelectorAll('[data-logout]').forEach(b => b.onclick = S.logout);
    const bell = document.querySelector('[data-bell]'), panel = document.getElementById('bellPanel');
    bell.onclick = async e => { e.stopPropagation(); document.getElementById('profileMenu').classList.add('hidden'); if (!panel.classList.toggle('hidden')) renderBellPanel(panel); };
    const pb = document.querySelector('[data-profile]'), pm = document.getElementById('profileMenu');
    pb.onclick = e => { e.stopPropagation(); panel.classList.add('hidden'); pm.classList.toggle('hidden'); };
    const input = document.getElementById('portalSearch'), results = document.getElementById('searchResults');
    let t; input.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
        const q = input.value.trim(); if (q.length < 2) return results.classList.add('hidden');
        const res = await S.app.api.search(q).catch(() => []);
        results.innerHTML = res.length ? res.map(r => `<a href="${r.link}" class="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50"><span class="s-chip">${esc(r.kind)}</span><span class="min-w-0"><span class="block text-sm text-slate-900 truncate">${esc(r.title)}</span>${r.sub ? `<span class="block text-xs s-muted truncate">${esc(r.sub)}</span>` : ''}</span></a>`).join('') : `<p class="px-4 py-3 text-sm s-muted">No results for "${esc(q)}"</p>`;
        results.classList.remove('hidden');
    }, 180); };
    input.onkeydown = e => { if (e.key === 'Escape') { results.classList.add('hidden'); input.blur(); } };
}
async function renderBellPanel(panel) {
    const A = S.app.api;
    panel.innerHTML = `<div class="p-4 space-y-3">${[1, 2, 3].map(() => '<div class="sk h-10"></div>').join('')}</div>`;
    const list = (await A.notifications().catch(() => [])).slice(0, 6);
    panel.innerHTML = `<div class="flex items-center justify-between px-4 py-3 border-b border-[#EEF0F3]"><span class="font-semibold text-sm text-slate-900">Notifications</span>${list.some(n => !n.readAt) ? '<button data-readall class="text-xs font-semibold text-forest-600">Mark all as read</button>' : ''}</div>
        ${list.length ? `<div class="max-h-[380px] overflow-y-auto thin-scroll divide-y divide-[#F1F3F5]">${list.map(n => S.notificationRow(n, true)).join('')}</div>` : '<p class="px-4 py-8 text-center text-sm s-muted">You\'re all caught up.</p>'}
        <a href="${S.url('notifications')}" class="block text-center text-sm font-semibold text-forest-600 py-3 border-t border-[#EEF0F3] hover:bg-slate-50">View all notifications</a>`;
    const ra = panel.querySelector('[data-readall]'); if (ra) ra.onclick = async e => { e.stopPropagation(); await A.markAllNotifications(); S.refreshCounts(); renderBellPanel(panel); };
    panel.querySelectorAll('[data-notif-link]').forEach(a => a.addEventListener('click', () => A.markNotification(a.dataset.notifLink).then(S.refreshCounts)));
}
S.notificationRow = (n, compact) => {
    const T = TOS.engage.TYPES[n.type] || TOS.engage.TYPES.system;
    return `<a href="${esc(n.link || S.url('notifications'))}" data-notif-link="${n.id}" class="flex gap-3 ${compact ? 'px-4 py-3' : 'p-4'} hover:bg-slate-50 ${n.readAt ? '' : 'bg-forest-50/40'}">
        <span class="w-9 h-9 rounded-xl ${n.readAt ? 'bg-slate-100 text-slate-500' : 'bg-forest text-gold'} flex items-center justify-center text-sm shrink-0"><i class="fa-solid ${T.icon}"></i></span>
        <span class="min-w-0 flex-1"><span class="block text-sm ${n.readAt ? 'text-slate-700' : 'font-semibold text-slate-900'}">${esc(n.title)}</span>${n.body ? `<span class="block text-xs s-muted mt-0.5 ${compact ? 'line-clamp-2' : ''}">${esc(n.body)}</span>` : ''}<span class="block text-[11px] text-slate-400 mt-1">${T.label} · ${ui.timeAgo(n.createdAt)}</span></span>
        ${n.readAt ? '' : '<span class="w-2 h-2 rounded-full bg-gold mt-1.5 shrink-0" aria-label="Unread"></span>'}</a>`;
};
S.closeOverlays = () => {
    const nav = document.getElementById('sideNav'), scrim = document.getElementById('navScrim');
    if (nav) { nav.classList.add('-translate-x-full'); scrim.classList.add('hidden'); }
    ['bellPanel', 'profileMenu', 'searchResults'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
};
document.addEventListener('click', e => { if (!e.target.closest('#bellPanel,[data-bell],#profileMenu,[data-profile],#searchBox')) ['bellPanel', 'profileMenu', 'searchResults'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') S.closeOverlays(); });

S.refreshCounts = async () => {
    try { S.counts = await S.app.api.counts(); } catch (e) { return; }
    document.querySelectorAll('[data-badge]').forEach(el => {
        const k = el.dataset.badge; if (!k) return; const n = S.counts[k] || 0;
        el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', !n); if (n) el.classList.add('s-badge');
    });
    document.title = (S.counts.notifications ? `(${S.counts.notifications}) ` : '') + (S.titleText || S.app.name) + ' | Tech Oasis School';
};
S.setTitle = t => { S.titleText = t; const h = document.getElementById('pageTitle'); if (h) h.textContent = t; document.title = (S.counts.notifications ? '(' + S.counts.notifications + ') ' : '') + t + ' | Tech Oasis School'; };
S.refreshMe = async () => { S.me = await S.app.api.me(); const side = document.getElementById('sideNav'); if (side) { side.innerHTML = sidebarHtml(); bindShell(); } };

S.logout = () => { auth.logout(); S.me = null; S.go(S.url('login?signedout=1'), { replace: true }); };
S.applyPrefs = () => {
    const p = (S.me && S.me.prefs && S.me.prefs.appearance) || {};
    document.body.classList.toggle('text-lg-pref', p.textSize === 'large');
    document.body.classList.toggle('reduce-motion', !!p.reduceMotion);
};
const roleHome = role => role === 'staff' ? '/staff/dashboard' : role === 'student' ? '/student/dashboard' : '/';

// ---------------- Router ----------------
S.dispatch = async function () {
    const path = S.path(); if (!path) return;
    if (path !== location.pathname) history.replaceState({}, '', path + location.search);
    S.app = S.appFor(path);
    let route = null, params = {};
    for (const r of S.routes) { const m = path.match(r.re); if (m) { route = r; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); break; } }
    if (!route) route = S.routes.find(r => r.pattern === S.app.base + '/404');

    // Public pages (sign in, apply, verify…)
    if (route.layout === 'auth') {
        const cur = auth.current();
        if (cur && cur.role === S.app.role && !route.allowSignedIn && !cur.mustChangePassword) return S.go(S.url('dashboard'), { replace: true });
        S.current = route; S.shellKey = 'auth';
        document.title = route.title + ' | Tech Oasis School';
        const root = document.getElementById('root'); root.innerHTML = '';
        return route.render(root, params);
    }

    // Guard: authenticated, correct role, active account
    const s = auth.current();
    if (!s) {
        const problem = auth.sessionProblem();
        if (problem && problem !== 'none' && problem !== 'deleted') { auth.logout(); return S.go(S.url('login?state=' + problem), { replace: true }); }
        const expired = !!S.me;
        S.me = null;
        return S.go(S.url('login?next=' + encodeURIComponent(path + location.search) + (expired ? '&expired=1' : '')), { replace: true });
    }
    if (s.role !== S.app.role) {
        const other = s.role === 'staff' ? 'the Staff Portal' : s.role === 'student' ? 'the Student Portal' : 'the website';
        document.title = 'Access denied | ' + S.app.name;
        document.getElementById('root').innerHTML = `<div class="min-h-screen flex items-center justify-center p-6"><div class="max-w-md w-full">${S.empty('fa-ban', 'Access denied', `The ${esc(S.app.name)} is only for ${S.app.role} accounts. You are signed in to ${other}.`, `<a href="${roleHome(s.role)}" class="btn btn-forest btn-sm">Go to ${other}</a> <button data-switch class="btn btn-outline btn-sm">Sign out</button>`)}</div></div>`;
        document.querySelector('[data-switch]').onclick = () => { auth.logout(); S.go(S.url('login'), { replace: true }); };
        S.shellKey = 'denied';
        return;
    }
    if (s.mustChangePassword && S.app.forcePasswordRoute) return S.go(S.app.forcePasswordRoute, { replace: true });

    const token = ++S.renderToken;
    S.current = route;
    try { if (!S.me || S.me.id !== s.id || S.meApp !== S.app.base) { S.me = await S.app.api.me(); S.meApp = S.app.base; S.counts = await S.app.api.counts(); } } catch (e) { return S.go(S.url('login?expired=1'), { replace: true }); }
    S.applyPrefs();
    if (S.shellKey !== S.app.base + ':' + route.layout || !document.getElementById('main')) renderShell(route);
    else {
        document.getElementById('sideNav').innerHTML = sidebarHtml(); bindShell();
        const bn = document.querySelector('.s-bottom-nav'); if (bn) bn.outerHTML = bottomNavHtml();
    }
    S.setTitle(route.title || S.app.name);
    const main = document.getElementById('main');
    main.innerHTML = route.layout === 'focus' ? `<div class="p-4 sm:p-6">${S.skeleton(route.skeleton)}</div>` : S.skeleton(route.skeleton);
    window.scrollTo(0, 0);
    try {
        await route.render(main, params, token);
        if (token !== S.renderToken) return;
        main.classList.add('fade-in'); setTimeout(() => main.classList.remove('fade-in'), 300);
    } catch (err) {
        if (token !== S.renderToken) return;
        if (!err.code || err.code === 'ERROR') console.error(err);   // expected API outcomes (not found, no access) are shown, not logged
        if (err.code === 'UNAUTHENTICATED') return S.go(S.url('login?expired=1&next=' + encodeURIComponent(path)), { replace: true });
        if (err.code === 'SUSPENDED' || /^ACCOUNT_/.test(err.code)) { const st = err.code === 'SUSPENDED' ? 'suspended' : err.code.slice(8).toLowerCase(); auth.logout(); return S.go(S.url('login?state=' + st), { replace: true }); }
        main.innerHTML = `<div class="${route.layout === 'focus' ? 'p-6 max-w-xl mx-auto' : 'max-w-xl mx-auto'}">${S.errorView(err, () => S.dispatch())}</div>`;
    }
    S.refreshCounts();
};
// Re-render live pages without disturbing anything the user is typing or watching
S.softRefresh = () => {
    if (!S.current || S.current.layout === 'auth') return;
    // Signed out, suspended or deleted elsewhere (e.g. by an admin): leave the portal immediately
    if (!auth.current()) return S.dispatch();
    S.refreshCounts();
    const el = document.activeElement, typing = el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && el.id !== 'portalSearch';
    if (S.current.live && !typing && !document.querySelector('[role=dialog]')) S.dispatchQuiet();
};
S.dispatchQuiet = async () => {
    const main = document.getElementById('main'); if (!main) return;
    const path = S.path(), r = S.current, m = path && path.match(r.re); if (!m) return;
    const params = {}; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
    const y = window.scrollY, token = ++S.renderToken;
    try { await r.render(main, params, token); window.scrollTo(0, y); } catch (e) { /* keep current view on background refresh errors */ }
};

// ---------------- Live sync with the admin CMS and other tabs ----------------
window.addEventListener('storage', e => {
    if (e.key === 'tos_lms_v1') setTimeout(S.softRefresh, 50);          // db.js reloads first, then we refresh
    if (e.key === 'to_current_user' && !auth.current() && S.current && S.current.layout !== 'auth') S.dispatch();   // signed out elsewhere
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) S.softRefresh(); });

S.start = () => {
    const splash = document.getElementById('splashLogo');
    if (splash) splash.innerHTML = ui.brandLogo(false, 44);
    S.dispatch();
};

// 404s
S.route('/student/404', { title: 'Page not found', nav: '', render: el => { el.innerHTML = `<div class="max-w-xl mx-auto">${S.empty('fa-compass', 'Page not found', 'That page does not exist in the student portal.', '<a href="/student/dashboard" class="btn btn-forest btn-sm">Go to dashboard</a>')}</div>`; } });
// Shortcut used by the mobile "Learn" button: jump straight back into the last lesson
S.route('/student/continue', { title: 'Continue learning', nav: 'continue', render: async () => {
    const d = await api.dashboard();
    S.go(d.continue && d.continue.current ? '/student/learn/' + d.continue.current.id : '/student/my-courses', { replace: true });
} });
