// Analytics: course, student and revenue.
(function () {
    // Reused in the course builder's Analytics tab
    A.courseAnalyticsPanel = function (el, c) {
        const a = lms.courseAnalytics(c.id);
        const short = t => t.length > 14 ? t.slice(0, 13) + '…' : t;
        el.innerHTML = `
            <div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
                ${A.stat('fa-id-card', 'bg-violet-50 text-violet-700', 'Enrollments', a.enrollments)}
                ${A.stat('fa-bolt', 'bg-sky-50 text-sky-700', 'Active (14d)', a.active)}
                ${A.stat('fa-flag-checkered', 'bg-forest-50 text-forest', 'Completion', a.completionRate + '%', a.completed + ' completed')}
                ${A.stat('fa-chart-simple', 'bg-gold-50 text-gold-700', 'Avg progress', a.avgProgress + '%')}
                ${A.stat('fa-list-check', 'bg-emerald-50 text-emerald-700', 'Lesson completion', a.lessonCompletionRate + '%', 'avg across lessons')}
                ${A.stat('fa-star', 'bg-amber-50 text-amber-700', 'Rating', a.rating.count ? a.rating.avg.toFixed(1) : '—', ui.plural(a.rating.count, 'review'))}
                ${A.stat('fa-sack-dollar', 'bg-emerald-50 text-emerald-700', 'Revenue', ui.money(a.revenue))}
                ${A.stat('fa-award', 'bg-gold-50 text-gold-700', 'Certificates', db.count('certificates', x => x.courseId === c.id && !x.revoked))}
            </div>
            <div class="grid xl:grid-cols-3 gap-5 mt-5">
                <div class="xl:col-span-2">${A.card(A.cardTitle('Lesson completion funnel', '<span class="text-xs text-slate-500">% of enrolled students who completed each lesson</span>') + A.barChart(a.funnel.map((f, i) => ({ label: f.lesson.title, short: String(i + 1), value: f.rate, tip: `${i + 1}. ${f.lesson.title}: ${f.rate}% (${f.completed} students)` })), { fmt: v => v + '%', empty: 'No enrolled students yet' })
                    + (a.dropOff ? `<div class="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm"><i class="fa-solid fa-triangle-exclamation text-amber-600 mt-0.5"></i><span><b>Biggest drop-off:</b> ${esc(a.dropOff.lesson.title)}, where ${a.dropOff.drop} percentage points fewer students complete it than the lesson before. Consider shortening it, adding examples or splitting it.</span></div>` : ''))}</div>
                ${A.card(A.cardTitle('Ratings') + `<div class="font-display text-5xl text-ink">${a.rating.count ? a.rating.avg.toFixed(1) : '—'}</div><div class="text-gold mt-1">${ui.stars(a.rating.avg)}</div>
                    <div class="space-y-2 mt-4">${a.ratingDist.map(d => `<div class="flex items-center gap-3 text-xs"><span class="w-10 text-slate-500">${d.stars} star</span><div class="flex-1 h-2 bg-slate-100 rounded-full"><div class="h-2 rounded-full bg-gold" style="width:${a.rating.count ? d.count / a.rating.count * 100 : 0}%"></div></div><span class="w-6 text-right text-slate-500">${d.count}</span></div>`).join('')}</div>`)}
            </div>
            <div class="grid xl:grid-cols-3 gap-5 mt-5">
                ${A.card(A.cardTitle('Quiz performance') + (a.quizzes.length ? `<div class="space-y-4">${a.quizzes.map(q => `<a href="#/quizzes/${q.quiz.id}" class="block group"><div class="flex justify-between text-sm"><span class="font-medium text-ink group-hover:underline truncate">${esc(q.quiz.title)}</span><span class="text-slate-500 whitespace-nowrap">${q.attempts} attempts</span></div><div class="flex gap-4 text-xs text-slate-500 mt-1"><span>Avg <b class="text-ink">${q.avg}%</b></span><span>Pass rate <b class="text-ink">${q.passRate}%</b></span></div>${A.progressBar(q.passRate, 'w-full mt-1')}</a>`).join('')}</div>` : '<p class="text-sm text-slate-500">No quizzes in this course.</p>'))}
                ${A.card(A.cardTitle('Assignment performance') + (a.assignments.length ? `<div class="space-y-4">${a.assignments.map(x => `<a href="#/assignments?a=${x.assignment.id}&status=all" class="block group"><div class="text-sm font-medium text-ink group-hover:underline">${esc(x.assignment.title)}</div><div class="flex gap-4 text-xs text-slate-500 mt-1"><span><b class="text-ink">${x.submitted}</b> submitted</span><span><b class="text-ink">${x.graded}</b> graded</span><span>Avg <b class="text-ink">${x.avg}%</b></span></div></a>`).join('')}</div>` : '<p class="text-sm text-slate-500">No assignments in this course.</p>'))}
                ${A.card(A.cardTitle('Most viewed lessons') + (a.popular.some(p => p.views) ? `<ol class="space-y-3">${a.popular.filter(p => p.views).map((p, i) => `<li class="flex items-center gap-3 text-sm"><span class="w-6 h-6 rounded-full bg-forest-50 text-forest text-xs font-bold flex items-center justify-center">${i + 1}</span><span class="flex-1 truncate">${esc(p.lesson.title)}</span><span class="text-slate-500">${p.views}</span></li>`).join('')}</ol>` : '<p class="text-sm text-slate-500">No lesson views yet.</p>'))}
            </div>`;
    };

    A.route('analytics/courses', (_, p) => {
        A.crumbs('Analytics', 'Course Analytics');
        const courses = db.all('courses').sort((a, b) => a.title.localeCompare(b.title));
        const sel = p.course || (courses[0] && courses[0].id);
        const summary = courses.map(c => { const e = db.where('enrollments', { courseId: c.id }); return { c, n: e.length, done: e.filter(x => x.status === 'completed').length, avg: e.length ? Math.round(e.reduce((s, x) => s + (lms.progress(x.userId, c.id) || { pct: 0 }).pct, 0) / e.length) : 0 }; }).sort((a, b) => b.n - a.n);
        A.view().innerHTML = A.header('Course Analytics', 'Enrollment, engagement and outcomes per course.')
            + A.card(A.cardTitle('All courses at a glance') + A.table([
                { label: 'Course', render: x => `<a href="#/analytics/courses?course=${x.c.id}" class="font-medium text-ink hover:underline">${esc(x.c.title)}</a>` },
                { label: 'Status', render: x => A.pill(x.c.status) },
                { label: 'Enrollments', render: x => x.n },
                { label: 'Avg progress', render: x => A.progressBar(x.avg) },
                { label: 'Completion', render: x => (x.n ? Math.round(x.done / x.n * 100) : 0) + '%' },
                { label: 'Rating', render: x => { const r = lms.rating(x.c.id); return r.count ? `<i class="fa-solid fa-star text-gold"></i> ${r.avg.toFixed(1)}` : '—'; } }
            ], summary), 'p-5 mb-5')
            + `<div class="flex flex-wrap items-center gap-3 mb-4"><h2 class="font-display text-2xl text-ink">Course detail</h2><div class="w-72">${A.select('c', courses.map(c => [c.id, c.title]), sel, 'id="csel"')}</div></div><div id="detail"></div>`;
        document.getElementById('csel').onchange = e => location.hash = '#/analytics/courses?course=' + e.target.value;
        if (sel) A.courseAnalyticsPanel(document.getElementById('detail'), db.get('courses', sel));
        if (p.course) setTimeout(() => document.getElementById('detail').scrollIntoView({ behavior: 'smooth' }), 50);
    });

    A.route('analytics/students', () => {
        A.crumbs('Analytics', 'Student Analytics');
        const students = db.where('users', { role: 'student' }), enrs = db.all('enrollments');
        const DAY = 864e5, now = Date.now();
        const rows = enrs.map(e => ({ e, p: lms.progress(e.userId, e.courseId) })).filter(x => x.p);
        const bands = [['0–24%', 0, 24], ['25–49%', 25, 49], ['50–74%', 50, 74], ['75–99%', 75, 99], ['100%', 100, 100]].map(([l, a, b]) => ({ label: l, value: rows.filter(x => x.p.pct >= a && x.p.pct <= b).length }));
        const atRisk = rows.filter(x => x.e.status !== 'completed' && x.p.pct < 100 && (!x.e.lastAccessAt || now - new Date(x.e.lastAccessAt) > 7 * DAY));
        const top = students.map(u => ({ u, done: db.count('lesson_progress', { userId: u.id, status: 'completed' }) })).sort((a, b) => b.done - a.done).slice(0, 6);
        const completions = db.where('lesson_progress', p => p.completedAt);
        A.view().innerHTML = A.header('Student Analytics', 'Activity, progress distribution and learners who may need a nudge.')
            + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">${A.stat('fa-user-graduate', 'bg-sky-50 text-sky-700', 'Students', students.length, students.filter(u => now - new Date(u.createdAt) < 30 * DAY).length + ' joined in 30 days')}${A.stat('fa-bolt', 'bg-forest-50 text-forest', 'Active (7d)', new Set(enrs.filter(e => e.lastAccessAt && now - new Date(e.lastAccessAt) < 7 * DAY).map(e => e.userId)).size)}${A.stat('fa-list-check', 'bg-gold-50 text-gold-700', 'Lessons completed', completions.length)}${A.stat('fa-user-clock', 'bg-rose-50 text-rose-700', 'At risk', atRisk.length, 'inactive 7+ days')}</div>`
            + `<div class="grid xl:grid-cols-2 gap-5">${A.card(A.cardTitle('Lessons completed per day', '<span class="text-xs text-slate-500">Last 30 days</span>') + A.lineChart(A.daily(completions, 'completedAt', 30), { empty: 'No lessons completed in the last 30 days' }))}
               ${A.card(A.cardTitle('Progress distribution', '<span class="text-xs text-slate-500">Enrollments by course progress</span>') + A.barChart(bands, { empty: 'No enrollments yet' }))}</div>
               <div class="grid xl:grid-cols-2 gap-5 mt-5">
               ${A.card(A.cardTitle('At-risk learners', '<span class="text-xs text-slate-500">Inactive 7+ days and not finished</span>') + A.table([
                   { label: 'Student', render: x => { const u = db.get('users', x.e.userId); return `<a href="#/students?open=${x.e.userId}">${A.person(u ? u.name : '—', A.courseTitle(x.e.courseId))}</a>`; } },
                   { label: 'Progress', render: x => A.progressBar(x.p.pct, 'w-28') },
                   { label: 'Last active', render: x => x.e.lastAccessAt ? ui.timeAgo(x.e.lastAccessAt) : 'Never' },
                   { label: '', cls: 'text-right', render: x => { const u = db.get('users', x.e.userId); return u ? `<a class="btn btn-outline btn-sm" href="mailto:${esc(u.email)}?subject=${encodeURIComponent('Keep going with ' + A.courseTitle(x.e.courseId))}"><i class="fa-regular fa-envelope"></i>Nudge</a>` : ''; } }
               ], atRisk.slice(0, 10), A.empty('fa-face-smile', 'Everyone is on track')))}
               ${A.card(A.cardTitle('Top learners') + `<ol class="space-y-3">${top.map((t, i) => `<li class="flex items-center gap-3"><span class="w-6 text-sm font-bold ${i < 3 ? 'text-gold-600' : 'text-slate-400'}">${i + 1}</span>${A.person(t.u.name, t.u.email)}<span class="ml-auto text-sm"><b>${t.done}</b> <span class="text-slate-500">lessons</span></span></li>`).join('')}</ol>`)}</div>`;
    });

    A.route('analytics/revenue', () => {
        A.crumbs('Analytics', 'Revenue Analytics');
        const orders = db.all('orders'), paid = orders.filter(o => o.status === 'paid'), pays = db.all('payments');
        const total = A.revenueOf(orders), refunds = pays.filter(p => p.status === 'refunded').reduce((a, p) => a + Math.abs(p.amount), 0);
        const byCourse = db.all('courses').map(c => ({ label: c.title, short: c.title.split(/\s+/)[0].slice(0, 10), value: db.where('order_items', { courseId: c.id }).reduce((s, it) => { const o = db.get('orders', it.orderId); return s + (o && o.status === 'paid' ? o.total : 0); }, 0) })).filter(x => x.value).sort((a, b) => b.value - a.value);
        const months = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const n = new Date(d); n.setMonth(d.getMonth() + 1); months.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), value: pays.filter(p => p.status === 'succeeded' && new Date(p.createdAt) >= d && new Date(p.createdAt) < n).reduce((a, p) => a + p.amount, 0) }); }
        const coupons = db.all('coupons').map(c => ({ c, orders: orders.filter(o => o.couponId === c.id), })).filter(x => x.orders.length);
        const trials = db.all('enrollments').filter(e => e.trialEndsAt), converted = trials.filter(e => lms.paymentState(e) === 'paid');
        A.view().innerHTML = A.header('Revenue Analytics', 'Income by course and over time.', '<button id="exp" class="btn btn-outline btn-sm"><i class="fa-solid fa-file-export"></i>Export orders CSV</button>')
            + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">${A.stat('fa-sack-dollar', 'bg-emerald-50 text-emerald-700', 'Total revenue', ui.money(total), ui.plural(paid.filter(o => o.total > 0).length, 'paid order'))}${A.stat('fa-receipt', 'bg-sky-50 text-sky-700', 'Average order', ui.money(paid.filter(o => o.total > 0).length ? total / paid.filter(o => o.total > 0).length : 0))}${A.stat('fa-arrow-right-arrow-left', 'bg-gold-50 text-gold-700', 'Trial conversion', (trials.length ? Math.round(converted.length / trials.length * 100) : 0) + '%', `${converted.length} of ${trials.length} trials paid`)}${A.stat('fa-rotate-left', 'bg-rose-50 text-rose-700', 'Refunds', ui.money(refunds))}</div>`
            + `<div class="grid xl:grid-cols-2 gap-5">${A.card(A.cardTitle('Revenue by month', '<span class="text-xs text-slate-500">Last 6 months</span>') + A.barChart(months, { fmt: v => ui.money(v), empty: 'No revenue yet' }))}${A.card(A.cardTitle('Revenue by course') + A.barChart(byCourse, { fmt: v => ui.money(v), empty: 'No paid orders yet' }))}</div>`
            + A.card(A.cardTitle('Coupon usage') + A.table([{ label: 'Code', render: x => `<span class="font-mono font-semibold">${esc(x.c.code)}</span>` }, { label: 'Orders', render: x => x.orders.length }, { label: 'Discount given', render: x => ui.money(x.orders.reduce((a, o) => a + (o.discount || 0), 0)) }, { label: 'Revenue', render: x => ui.money(A.revenueOf(x.orders)) }], coupons, '<p class="text-sm text-slate-500">No coupon redemptions yet.</p>'), 'p-5 mt-5');
        document.getElementById('exp').onclick = () => A.csv('orders.csv', [['Order', 'Date', 'Student', 'Courses', 'Subtotal', 'Discount', 'Total', 'Status']].concat(orders.map(o => [o.id, o.createdAt, A.userName(o.userId), db.where('order_items', { orderId: o.id }).map(i => A.courseTitle(i.courseId)).join('; '), o.subtotal, o.discount, o.total, o.status])));
    });
})();
