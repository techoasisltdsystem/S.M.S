// Student dashboard
(function () {
    S.courseCard = c => `<a href="/student/course/${c.id}" class="s-card s-card-hover overflow-hidden flex flex-col">
        <div class="relative aspect-[16/9] bg-slate-100">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover">` : ''}
            <span class="absolute top-3 left-3">${S.statusChip(c.status)}</span>${c.payment === 'trial' ? '<span class="absolute top-3 right-3 s-chip bg-gold-100 text-gold-700">Free trial</span>' : ['overdue', 'pending'].includes(c.payment) ? '<span class="absolute top-3 right-3 s-chip bg-rose-50 text-rose-700">Payment due</span>' : ''}</div>
        <div class="p-4 flex-1 flex flex-col">
            <div class="text-xs s-muted">${esc(c.category)}</div>
            <h3 class="font-semibold text-slate-900 leading-snug mt-0.5">${esc(c.title)}</h3>
            <div class="text-xs s-muted mt-1"><i class="fa-solid fa-chalkboard-user mr-1"></i>${esc(c.instructor)}</div>
            <div class="mt-auto pt-4"><div class="flex justify-between text-xs mb-1.5"><span class="s-muted">${c.done}/${c.total} lessons</span><span class="font-semibold text-slate-900">${c.pct}%</span></div>${S.bar(c.pct)}
            <div class="flex items-center justify-between mt-3"><span class="text-[11px] text-slate-400">${c.lastAccessAt ? 'Last accessed ' + ui.timeAgo(c.lastAccessAt) : 'Not started yet'}</span><span class="text-sm font-semibold text-forest-600">${c.status === 'completed' ? 'Review' : c.done ? 'Continue' : 'Start'} <i class="fa-solid fa-arrow-right text-xs"></i></span></div></div>
        </div></a>`;
    const EVT_STYLE = { class: 'bg-forest-50 text-forest', exam: 'bg-rose-50 text-rose-700', quiz: 'bg-violet-50 text-violet-700', deadline: 'bg-gold-50 text-gold-700', event: 'bg-sky-50 text-sky-700', holiday: 'bg-emerald-50 text-emerald-700', announcement: 'bg-slate-100 text-slate-600' };
    S.EVT_STYLE = EVT_STYLE;
    S.eventRow = e => {
        const d = new Date(e.startsAt), T = TOS.engage.EVENT_TYPES[e.type] || TOS.engage.EVENT_TYPES.event;
        return `<a href="${e.link || '/student/calendar'}" class="flex items-center gap-3 py-3 group">
            <div class="w-12 text-center rounded-xl border border-[#E6E8EC] py-1 shrink-0"><div class="text-[10px] font-bold uppercase text-rose-600">${d.toLocaleDateString(undefined, { month: 'short' })}</div><div class="text-lg font-bold text-slate-900 leading-none">${d.getDate()}</div></div>
            <div class="min-w-0 flex-1"><div class="text-sm font-medium text-slate-900 truncate group-hover:underline">${esc(e.title)}</div><div class="text-xs s-muted truncate">${e.allDay ? 'All day' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}${e.course ? ' · ' + esc(e.course) : ''}${e.location ? ' · ' + esc(e.location) : ''}</div></div>
            <span class="s-chip ${EVT_STYLE[e.type] || ''} hidden sm:inline-flex"><i class="fa-solid ${T[1]}"></i>${T[0]}</span></a>`;
    };

    S.route('/student/dashboard', { title: 'Dashboard', nav: 'dashboard', live: true, render: async el => {
        const d = await api.dashboard(), me = S.me, c = d.continue, enrolled = d.stats.enrolled > 0;
        // New learners get a few places to start (free courses first) instead of an empty page
        const start = enrolled ? [] : (await api.catalog()).filter(x => !x.enrolled).sort((a, b) => (a.price ? 1 : 0) - (b.price ? 1 : 0)).slice(0, 3);
        const stat = (label, value, sub, href) => `<a href="${href}" class="block bg-white px-5 py-4 hover:bg-slate-50 transition"><div class="text-xs font-medium s-muted">${label}</div><div class="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">${value}</div>${sub ? `<div class="text-xs s-muted mt-0.5">${sub}</div>` : ''}</a>`;
        const side = (id, title, link, body) => `<section class="s-card p-5" aria-labelledby="${id}"><div class="flex items-center justify-between gap-3"><h2 id="${id}" class="s-h2">${title}</h2>${link ? `<a href="${link[0]}" class="text-xs font-semibold text-forest-600 hover:underline">${link[1]}</a>` : ''}</div>${body}</section>`;
        const step = (n, t, x) => `<li class="flex gap-3"><span class="w-7 h-7 shrink-0 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center" aria-hidden="true">${n}</span><div><div class="text-sm font-semibold text-slate-900">${t}</div><div class="text-sm s-muted">${x}</div></div></li>`;
        const hero = c && c.current
            ? `<section class="s-card overflow-hidden grid sm:grid-cols-[240px_minmax(0,1fr)]" aria-labelledby="clh">
                <div class="relative bg-slate-100 min-h-[150px]">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" class="absolute inset-0 w-full h-full object-cover">` : ''}</div>
                <div class="p-6">
                    <h2 id="clh" class="eyebrow">Continue learning</h2>
                    <div class="text-xl font-semibold text-slate-900 mt-1.5 leading-snug">${esc(c.title)}</div>
                    <div class="mt-3 space-y-1 text-sm s-muted"><div><i class="fa-solid fa-layer-group w-5" aria-hidden="true"></i>Section ${c.current.sectionIndex} · ${esc(c.current.sectionTitle)}</div><div><i class="fa-solid ${S.LESSON_ICON(c.current.type)} w-5" aria-hidden="true"></i>Lesson ${c.current.index} · ${esc(c.current.title)}</div></div>
                    <div class="mt-4"><div class="flex justify-between text-xs mb-1.5 s-muted"><span>Course progress</span><b class="text-slate-900">${c.pct}%</b></div>${S.bar(c.pct)}</div>
                    <a href="/student/learn/${c.current.id}" class="btn btn-forest h-11 px-5 mt-5"><i class="fa-solid fa-play text-xs" aria-hidden="true"></i>${c.done ? 'Continue learning' : 'Start learning'}</a>
                </div></section>`
            : `<section class="s-card p-6 sm:p-8" aria-labelledby="gsh">
                <h2 id="gsh" class="text-xl font-semibold text-slate-900">Start your first course</h2>
                <p class="s-muted mt-1">Your progress, assignments and certificates will appear here as you learn.</p>
                <ol class="grid sm:grid-cols-3 gap-5 mt-6">${step(1, 'Choose a course', 'Browse by category, level or price.')}${step(2, 'Enrol', 'Free courses open at once. Paid programmes start with a free trial.')}${step(3, 'Learn and earn', 'Finish the work to earn a certificate.')}</ol>
                ${start.length ? `<div class="mt-7 pt-6 border-t border-[#E6E8EC]"><h3 class="text-sm font-semibold text-slate-900">Good places to start</h3>
                    <div class="grid sm:grid-cols-3 gap-4 mt-4">${start.map(x => `<a href="/student/course/${x.id}" class="group block rounded-xl border border-[#E6E8EC] overflow-hidden hover:border-forest transition"><div class="aspect-[16/9] bg-slate-100">${x.thumbnail ? `<img src="${esc(x.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover">` : ''}</div><div class="p-3"><div class="text-sm font-semibold text-slate-900 leading-snug group-hover:underline">${esc(x.title)}</div><div class="text-xs s-muted mt-1">${esc(x.level)} · ${x.hours}h · ${x.price ? ui.money(x.price) : 'Free'}</div></div></a>`).join('')}</div></div>` : ''}
                <a href="/student/browse" class="btn btn-forest h-11 px-5 mt-6">Browse all courses <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i></a>
            </section>`;
        const K = TOS.kit;
        const time = e => e.allDay ? 'All day' : new Date(e.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const EVT_TONE = { class: 'forest', exam: 'rose', quiz: 'violet', deadline: 'gold', event: 'sky', holiday: 'emerald' };
        const todayList = `<div class="flex items-center justify-between mb-1"><h2 class="text-xs font-semibold text-slate-900">Today's schedule</h2><a href="/student/schedule" class="k-link">My schedule</a></div>`
            + K.schedule(d.today.slice(0, 4).map(e => ({ time: time(e), title: e.title, sub: e.course || e.location || '', tone: EVT_TONE[e.type], href: e.link || '/student/calendar' })), 'Nothing scheduled today.');
        const resultsTable = d.results.length ? `<div class="k-table-wrap"><table class="k-table"><caption class="sr-only">Your most recent results</caption>
            <thead><tr><th scope="col">Work</th><th scope="col" class="hidden sm:table-cell">Type</th><th scope="col">Score</th><th scope="col" class="hidden md:table-cell">Date</th></tr></thead>
            <tbody>${d.results.map(r => `<tr><td><a href="${r.href}" class="block truncate max-w-[260px]">${esc(r.title)}</a><span class="block text-xs s-muted truncate max-w-[260px]">${esc(r.course)}</span></td>
                <td class="hidden sm:table-cell">${r.kind}</td>
                <td><span class="s-chip ${r.kind === 'Quiz' ? (r.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700') : 'bg-sky-50 text-sky-700'}">${r.kind === 'Quiz' ? r.percent + '% · ' + (r.passed ? 'Passed' : 'Not passed') : r.score + '/' + r.maxScore}</span></td>
                <td class="hidden md:table-cell whitespace-nowrap">${ui.fmtDate(r.at)}</td></tr>`).join('')}</tbody></table></div>`
            : K.emptyState({ icon: 'fa-square-poll-vertical', title: 'No results yet', text: 'Quiz scores and graded assignments will appear here.' });
        const perf = d.performance.length >= 2 ? K.lineChart(d.performance, { max: 100, dots: true, fmt: v => v + '%', label: 'Average score by month' })
            : d.averageScore != null ? `<div class="flex items-center gap-5">${S.ring(d.averageScore, 96, 9)}<p class="text-sm s-muted">Average across ${ui.plural(d.resultsCount, 'result')}. A trend appears once you have results in two different months.</p></div>`
            : K.emptyState({ icon: 'fa-chart-line', title: 'No scores yet', text: 'Complete a quiz or assignment to see your performance.' });
        const mix = d.courseMix;
        el.innerHTML = `
            ${K.welcome({ name: me.name, sub: enrolled ? (d.streak ? `${ui.plural(d.streak, 'day')} learning streak. Keep it going.` : 'Here is your learning at a glance.') : 'Start with a free course or a free trial.', aside: todayList })}

            <div class="mt-6">${K.stats([
                { icon: 'fa-book-open', tone: 'forest', label: 'Courses enrolled', value: d.stats.enrolled, sub: d.stats.inProgress ? `${d.stats.inProgress} in progress` : 'Browse to enrol', href: '/student/my-courses' },
                { icon: 'fa-list-check', tone: 'sky', label: 'Overall progress', value: d.overall + '%', sub: d.lessonsTotal ? `${d.lessonsDone} of ${d.lessonsTotal} lessons` : 'No lessons yet', meter: d.overall, href: '/student/progress' },
                { icon: 'fa-file-pen', tone: d.assignmentsDue.some(a => a.status === 'overdue') ? 'rose' : 'violet', label: 'Assignments due', value: d.assignmentsDueCount, sub: d.assignmentsDue.some(a => a.status === 'overdue') ? 'Some are overdue' : d.assignmentsDueCount ? 'Open and upcoming' : 'All caught up', href: '/student/assignments' },
                { icon: 'fa-square-poll-vertical', tone: 'gold', label: 'Average score', value: d.averageScore != null ? d.averageScore + '%' : '—', sub: d.resultsCount ? ui.plural(d.resultsCount, 'result') : 'No results yet', href: '/student/progress' },
                { icon: 'fa-award', tone: 'emerald', label: 'Certificates', value: d.stats.certificates, sub: d.stats.completed ? `${d.stats.completed} courses completed` : 'Earned on completion', href: '/student/certificates' }
            ])}</div>

            <div class="mt-6 grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
                <div class="space-y-6 min-w-0">
                    ${hero}
                    <div class="grid lg:grid-cols-2 gap-6">
                        ${K.panel({ id: 'rrh', title: 'Recent results', icon: 'fa-square-poll-vertical', tone: 'sky', link: ['/student/progress', 'View all'], body: resultsTable })}
                        ${K.panel({ id: 'pfh', title: 'Performance', icon: 'fa-chart-line', tone: 'forest', link: ['/student/progress', 'Details'], body: perf })}
                    </div>
                    ${K.panel({ id: 'qah', title: 'Quick access', icon: 'fa-bolt', tone: 'amber', body: K.quickActions([
                        c && c.current ? { href: '/student/learn/' + c.current.id, label: 'Continue lesson', icon: 'fa-circle-play', tone: 'forest' } : { href: '/student/browse', label: 'Browse courses', icon: 'fa-compass', tone: 'forest' },
                        { href: '/student/assignments', label: 'Submit assignment', icon: 'fa-file-arrow-up', tone: 'rose' },
                        { href: '/student/quizzes', label: 'Take a quiz', icon: 'fa-circle-question', tone: 'violet' },
                        { href: '/student/schedule', label: 'View schedule', icon: 'fa-calendar-days', tone: 'sky' },
                        { href: '/student/certificates', label: 'My certificates', icon: 'fa-award', tone: 'emerald' },
                        { href: '/student/messages', label: 'Message a teacher', icon: 'fa-envelope', tone: 'gold' }
                    ]) })}
                    ${d.courses.length ? `<section aria-labelledby="mch"><div class="flex items-center justify-between mb-3"><h2 id="mch" class="s-h2">My courses</h2><a href="/student/my-courses" class="k-link">View all</a></div>
                        <div class="grid sm:grid-cols-2 gap-5">${d.courses.map(S.courseCard).join('')}</div></section>` : ''}
                </div>
                <aside class="space-y-5 min-w-0" aria-label="Your calendar and updates">
                    ${K.panel({ id: 'nbh', title: 'Notice board', icon: 'fa-bullhorn', tone: 'sky', link: ['/student/announcements', 'View all'], body: d.announcements.length
                        ? `<div class="divide-y divide-[#F1F3F5] -mt-1">${d.announcements.map(a => `<a href="/student/announcements#${a.id}" class="block py-3 group"><div class="flex items-center gap-2">${a.read ? '' : '<span class="w-2 h-2 rounded-full bg-gold shrink-0" aria-label="Unread"></span>'}<span class="text-sm ${a.read ? 'text-slate-700' : 'font-semibold text-slate-900'} truncate group-hover:underline">${esc(a.title)}</span></div><div class="text-xs s-muted line-clamp-2 mt-0.5">${esc(a.body)}</div><div class="text-[11px] s-muted mt-1">${ui.timeAgo(a.createdAt)}</div></a>`).join('')}</div>`
                        : '<p class="k-empty-line">No announcements yet.</p>' })}
                    ${K.panel({ id: 'calh', title: 'Academic calendar', icon: 'fa-calendar', tone: 'rose', link: ['/student/calendar', 'Open calendar'], body: '<div data-mini-cal></div>' })}
                    ${side('adh', 'Assignments due', ['/student/assignments', 'View all'], d.assignmentsDue.length
                        ? `<div class="divide-y divide-[#F1F3F5] mt-2">${d.assignmentsDue.map(a => `<a href="/student/assignments/${a.id}" class="flex items-center gap-3 py-3 group"><span class="w-9 h-9 rounded-lg ${a.status === 'overdue' ? 'bg-rose-50 text-rose-700' : 'bg-gold-50 text-gold-700'} flex items-center justify-center text-sm shrink-0"><i class="fa-solid fa-file-pen" aria-hidden="true"></i></span><div class="min-w-0 flex-1"><div class="text-sm font-medium text-slate-900 truncate group-hover:underline">${esc(a.title)}</div><div class="text-xs ${a.status === 'overdue' ? 'text-rose-700' : 's-muted'} truncate">${a.due ? (a.status === 'overdue' ? 'Overdue · ' : 'Due ') + S.relDate(a.due) : 'No due date'} · ${esc(a.course)}</div></div></a>`).join('')}</div>`
                        : `<p class="text-sm s-muted mt-3">${enrolled ? 'Nothing due. You are up to date.' : 'Assignments from your courses will show here.'}</p>`)}
                    ${enrolled ? K.panel({ id: 'cmh', title: 'Course status', icon: 'fa-chart-pie', tone: 'gold', link: ['/student/my-courses', 'My courses'], body: K.donut([{ label: 'Completed', value: mix.completed, tone: 'emerald' }, { label: 'In progress', value: mix.inProgress, tone: 'sky' }, { label: 'Not started', value: mix.notStarted, tone: 'slate' }], { center: d.overall + '%', centerSub: 'Lessons done', label: 'Your courses by status', size: 120, stroke: 14 }) }) : ''}
                    ${side('uch', 'Upcoming classes & events', ['/student/calendar', 'Calendar'], d.upcoming.length ? `<div class="divide-y divide-[#F1F3F5] mt-1">${d.upcoming.slice(0, 4).map(S.eventRow).join('')}</div>` : '<p class="text-sm s-muted mt-3">No upcoming events.</p>')}
                    <section class="s-card overflow-hidden" aria-labelledby="rnh"><div class="flex items-center justify-between px-5 pt-5 pb-3"><h2 id="rnh" class="s-h2">Recent notifications</h2><a href="/student/notifications" class="text-xs font-semibold text-forest-600 hover:underline">View all</a></div>
                        ${d.notifications.length ? `<div class="divide-y divide-[#F1F3F5]">${d.notifications.slice(0, 3).map(n => S.notificationRow(n, true)).join('')}</div>` : '<p class="px-5 pb-5 text-sm s-muted">No notifications yet.</p>'}</section>
                </aside>
            </div>`;
        K.mountCalendar(el.querySelector('[data-mini-cal]'), d.calendarEvents, { href: () => '/student/calendar' });
        el.querySelectorAll('[data-notif-link]').forEach(a => a.addEventListener('click', () => api.markNotification(a.dataset.notifLink)));
    } });
})();
