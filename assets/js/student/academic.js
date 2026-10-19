// Calendar, My Schedule and Resources
(function () {
    const T = () => TOS.engage.EVENT_TYPES;
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const timeOf = e => e.allDay ? 'All day' : new Date(e.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };   // Monday
    const legend = () => `<div class="flex flex-wrap gap-2 text-xs">${Object.entries(T()).filter(([k]) => k !== 'holiday').map(([k, [l, ic]]) => `<span class="s-chip ${S.EVT_STYLE[k]}"><i class="fa-solid ${ic}"></i>${l}</span>`).join('')}</div>`;

    function eventModal(e) {
        const [label, ic] = T()[e.type] || T().event, s = new Date(e.startsAt), en = new Date(e.endsAt || e.startsAt);
        const m = ui.modal({ title: e.title, size: 'max-w-md', body: `<span class="s-chip ${S.EVT_STYLE[e.type] || ''}"><i class="fa-solid ${ic}"></i>${label}</span>
            <dl class="mt-4 space-y-3 text-sm"><div class="flex gap-3"><dt class="w-5 text-slate-400"><i class="fa-regular fa-clock"></i></dt><dd>${s.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${e.allDay ? '' : '<br>' + timeOf(e) + (en > s ? ' – ' + en.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '')}</dd></div>
            ${e.course ? `<div class="flex gap-3"><dt class="w-5 text-slate-400"><i class="fa-solid fa-book-open"></i></dt><dd>${esc(e.course)}</dd></div>` : ''}
            ${e.location ? `<div class="flex gap-3"><dt class="w-5 text-slate-400"><i class="fa-solid fa-location-dot"></i></dt><dd>${esc(e.location)}</dd></div>` : ''}
            ${e.description ? `<div class="flex gap-3"><dt class="w-5 text-slate-400"><i class="fa-solid fa-align-left"></i></dt><dd class="text-slate-600">${esc(e.description)}</dd></div>` : ''}</dl>
            <div class="flex flex-wrap gap-2 mt-6">${e.url && /^https?:/.test(e.url) ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-forest btn-sm"><i class="fa-solid fa-video"></i>Join</a>` : ''}${e.link ? `<a href="${e.link}" class="btn btn-outline btn-sm">Open</a>` : ''}</div>` });
        m.el.querySelectorAll('a[href^="/student"]').forEach(a => a.addEventListener('click', () => m.close()));
    }

    S.route('/student/calendar', { title: 'Calendar', nav: 'calendar', live: true, render: async el => {
        const events = await api.calendar();
        let view = S.q('view') || (matchMedia('(max-width: 640px)').matches ? 'agenda' : 'month'), cursor = new Date();
        const evOn = d => events.filter(e => sameDay(new Date(e.startsAt), d));
        const chip = e => `<button data-ev="${e.id}" class="cal-ev text-left w-full ${S.EVT_STYLE[e.type] || 'bg-slate-100'} ${e.done ? 'line-through opacity-60' : ''} hover:brightness-95">${e.allDay ? '' : `<b>${new Date(e.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</b> `}${esc(e.title)}</button>`;
        const draw = () => {
            let title, body;
            if (view === 'month') {
                const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1), start = startOfWeek(first);
                title = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
                body = `<div class="cal-grid border-b border-[#EEF0F3] bg-[#F7F8FA]">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider s-muted">${d}</div>`).join('')}</div>
                    <div class="cal-grid">${days.map(d => { const ev = evOn(d), out = d.getMonth() !== cursor.getMonth(), today = sameDay(d, new Date());
                        return `<div class="cal-cell ${out ? 'bg-[#FAFBFC]' : ''}"><div class="text-xs font-semibold ${today ? 'w-6 h-6 rounded-full bg-forest text-white flex items-center justify-center' : out ? 'text-slate-300' : 'text-slate-700'}">${d.getDate()}</div>${ev.slice(0, 3).map(chip).join('')}${ev.length > 3 ? `<button data-day="${d.toISOString()}" class="text-[11px] font-semibold text-forest-600 mt-0.5">+${ev.length - 3} more</button>` : ''}</div>`; }).join('')}</div>`;
            } else if (view === 'week') {
                const start = startOfWeek(cursor), end = new Date(start); end.setDate(start.getDate() + 6);
                title = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' – ' + end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                body = `<div class="grid md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-[#EEF0F3]">${Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); const ev = evOn(d), today = sameDay(d, new Date());
                    return `<div class="min-h-[120px] md:min-h-[420px] p-2.5 ${today ? 'bg-forest-50/40' : ''}"><div class="flex md:block items-baseline gap-2 mb-2"><div class="text-[11px] font-semibold uppercase tracking-wider s-muted">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div><div class="text-lg font-bold ${today ? 'text-forest-600' : 'text-slate-900'}">${d.getDate()}</div></div>
                    <div class="space-y-1.5">${ev.map(e => `<button data-ev="${e.id}" class="w-full text-left rounded-lg p-2 ${S.EVT_STYLE[e.type] || 'bg-slate-100'} hover:brightness-95"><div class="text-[11px] font-semibold">${timeOf(e)}</div><div class="text-xs leading-snug ${e.done ? 'line-through opacity-60' : ''}">${esc(e.title)}</div></button>`).join('') || '<div class="text-xs text-slate-300 hidden md:block">—</div>'}</div></div>`; }).join('')}</div>`;
            } else {
                title = 'Upcoming';
                const from = new Date(); from.setHours(0, 0, 0, 0);
                const up = events.filter(e => new Date(e.endsAt || e.startsAt) >= from);
                const groups = {}; up.forEach(e => { const k = new Date(e.startsAt).toDateString(); (groups[k] = groups[k] || []).push(e); });
                body = up.length ? Object.keys(groups).map(k => { const d = new Date(k); return `<div class="flex gap-4 px-5 py-4 border-b border-[#F1F3F5]"><div class="w-14 shrink-0 text-center"><div class="text-[11px] font-bold uppercase text-rose-600">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div><div class="text-2xl font-bold text-slate-900 leading-none mt-0.5">${d.getDate()}</div><div class="text-[11px] s-muted">${d.toLocaleDateString(undefined, { month: 'short' })}</div></div>
                    <div class="flex-1 space-y-2">${groups[k].map(e => { const [l, ic] = T()[e.type] || T().event; return `<button data-ev="${e.id}" class="w-full text-left flex items-center gap-3 rounded-xl border border-[#EEF0F3] p-3 hover:border-forest-200"><span class="w-9 h-9 rounded-lg ${S.EVT_STYLE[e.type] || 'bg-slate-100'} flex items-center justify-center text-sm shrink-0"><i class="fa-solid ${ic}"></i></span><span class="min-w-0 flex-1"><span class="block text-sm font-medium text-slate-900 ${e.done ? 'line-through opacity-60' : ''}">${esc(e.title)}</span><span class="block text-xs s-muted">${timeOf(e)} · ${l}${e.course ? ' · ' + esc(e.course) : ''}</span></span></button>`; }).join('')}</div></div>`; }).join('')
                    : `<div class="p-10 text-center"><i class="fa-regular fa-calendar text-3xl text-slate-300"></i><p class="font-semibold text-slate-900 mt-3">No upcoming events</p><p class="text-sm s-muted">Classes, deadlines and school events will appear here.</p></div>`;
            }
            el.querySelector('#cal').innerHTML = `<div class="flex flex-wrap items-center gap-3 p-4 border-b border-[#EEF0F3]">
                ${view !== 'agenda' ? `<div class="flex items-center gap-1"><button data-nav="-1" class="w-9 h-9 rounded-lg hover:bg-slate-100" aria-label="Previous"><i class="fa-solid fa-chevron-left text-xs"></i></button><button data-nav="0" class="btn btn-outline btn-sm">Today</button><button data-nav="1" class="w-9 h-9 rounded-lg hover:bg-slate-100" aria-label="Next"><i class="fa-solid fa-chevron-right text-xs"></i></button></div>` : ''}
                <h2 class="text-lg font-semibold text-slate-900">${title}</h2>
                <div class="ml-auto">${S.tabs([['month', 'Month'], ['week', 'Week'], ['agenda', 'Agenda']], view, 'data-view')}</div></div>${body}`;
            el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; draw(); });
            el.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { const n = +b.dataset.nav; if (!n) cursor = new Date(); else if (view === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1); else cursor = new Date(cursor.getTime() + n * 7 * 864e5); draw(); });
            el.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => eventModal(events.find(e => String(e.id) === b.dataset.ev)));
            el.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { cursor = new Date(b.dataset.day); view = 'week'; draw(); });
        };
        el.innerHTML = S.pageHeader('Calendar', 'Classes, deadlines, exams and school events in one place.') + `<div class="mb-4">${legend()}</div><div id="cal" class="s-card overflow-hidden"></div>`;
        draw();
    } });

    S.route('/student/schedule', { title: 'My Schedule', nav: 'schedule', live: true, render: async el => {
        const events = await api.calendar();
        const now = new Date(), today = new Date(now); today.setHours(0, 0, 0, 0);
        const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
        const classes = events.filter(e => e.type === 'class' || e.type === 'exam');
        const next = classes.find(e => new Date(e.endsAt || e.startsAt) >= now);
        const deadlines = events.filter(e => (e.type === 'deadline' || e.type === 'quiz') && new Date(e.startsAt) >= today && !e.done).slice(0, 6);
        el.innerHTML = S.pageHeader('My Schedule', 'Your next seven days at a glance.', '<a href="/student/calendar" class="btn btn-outline btn-sm"><i class="fa-regular fa-calendar"></i>Full calendar</a>')
            + `<div class="grid xl:grid-cols-[1fr_340px] gap-5 items-start"><div class="space-y-5">
                ${next ? `<section class="rounded-2xl bg-ink text-white p-6 flex flex-col sm:flex-row sm:items-center gap-5"><span class="w-14 h-14 rounded-2xl bg-white/10 text-gold flex items-center justify-center text-xl shrink-0"><i class="fa-solid ${(T()[next.type] || T().class)[1]}"></i></span><div class="flex-1 min-w-0"><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-200">Next ${next.type === 'exam' ? 'exam' : 'class'}</div><div class="text-xl font-semibold mt-1">${esc(next.title)}</div><div class="text-sm text-white/70 mt-1">${S.relDate(next.startsAt)}${next.location ? ' · ' + esc(next.location) : ''}${next.course ? ' · ' + esc(next.course) : ''}</div></div>${next.url ? `<a href="${esc(next.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-gold">Join class</a>` : ''}</section>` : ''}
                <section class="s-card overflow-hidden"><h2 class="s-h2 px-5 pt-5 pb-3">This week</h2>${week.map(d => { const ev = events.filter(e => sameDay(new Date(e.startsAt), d));
                    return `<div class="flex gap-4 px-5 py-4 border-t border-[#F1F3F5] ${sameDay(d, now) ? 'bg-forest-50/40' : ''}"><div class="w-16 shrink-0"><div class="text-xs font-semibold ${sameDay(d, now) ? 'text-forest-600' : 's-muted'}">${sameDay(d, now) ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long' })}</div><div class="text-[11px] text-slate-400">${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div></div>
                        <div class="flex-1 space-y-2">${ev.map(e => `<div class="flex items-center gap-3"><span class="w-16 text-xs font-semibold text-slate-600 shrink-0">${timeOf(e)}</span><span class="s-chip ${S.EVT_STYLE[e.type] || ''}"><i class="fa-solid ${(T()[e.type] || T().event)[1]}"></i></span><span class="text-sm text-slate-800 truncate ${e.done ? 'line-through opacity-60' : ''}">${esc(e.title)}</span></div>`).join('') || '<span class="text-sm text-slate-300">Free</span>'}</div></div>`; }).join('')}</section>
            </div>
            <aside class="s-card p-5"><h2 class="s-h2">Deadlines</h2>${deadlines.length ? `<div class="divide-y divide-[#F1F3F5] mt-1">${deadlines.map(S.eventRow).join('')}</div>` : '<p class="text-sm s-muted mt-3">No upcoming deadlines.</p>'}</aside></div>`;
    } });

    S.route('/student/resources', { title: 'Resources', nav: 'resources', live: true, skeleton: 'list', render: async el => {
        const all = await api.resources();
        const courses = [...new Set(all.map(r => r.course))];
        let q = '', course = '';
        const draw = () => {
            const list = all.filter(r => (!course || r.course === course) && (!q || (r.name + ' ' + (r.lesson || '')).toLowerCase().includes(q)));
            el.querySelector('#rl').innerHTML = list.length ? `<div class="s-card divide-y divide-[#F1F3F5]">${list.map(r => `<div class="flex items-center gap-4 p-4"><span class="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center text-lg shrink-0"><i class="fa-solid ${S.fileIcon(r.fileType)}"></i></span>
                <div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-900 truncate">${esc(r.name)}</div><div class="text-xs s-muted truncate">${esc(r.course)}${r.lesson ? ` · <a href="/student/learn/${r.lessonId}" class="hover:underline">${esc(r.lesson)}</a>` : ' · Course resource'} · ${esc(r.fileType).toUpperCase()} · ${ui.fmtBytes(r.sizeBytes)}</div></div>${S.download(r)}</div>`).join('')}</div>`
                : S.empty('fa-folder-open', all.length ? 'No resources match' : 'No resources yet', all.length ? '' : 'Files your instructors share (PDFs, templates, source code) will appear here.');
        };
        el.innerHTML = S.pageHeader('Resources', 'Downloads from all your courses.') + `<div class="s-card p-3 flex flex-col sm:flex-row gap-3 mb-5"><div class="relative flex-1"><i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i><input id="rq" type="search" class="field h-11 pl-9" placeholder="Search files" aria-label="Search files"></div><select id="rc" class="field h-11 sm:w-64" aria-label="Filter by course"><option value="">All courses</option>${courses.map(c => `<option>${esc(c)}</option>`).join('')}</select></div><div id="rl"></div>`;
        el.querySelector('#rq').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
        el.querySelector('#rc').onchange = e => { course = e.target.value; draw(); };
        draw();
    } });
})();
