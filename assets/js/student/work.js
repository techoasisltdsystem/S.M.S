// Assignments, quizzes, certificates and learning progress
(function () {
    // ---------------- Assignments ----------------
    S.route('/student/assignments', { title: 'Assignments', nav: 'assignments', live: true, skeleton: 'list', render: async el => {
        const all = await api.assignments();
        const counts = s => all.filter(a => a.status === s).length;
        let tab = S.q('tab') || (counts('overdue') ? 'overdue' : 'upcoming');
        const draw = () => {
            const list = all.filter(a => a.status === tab);
            el.querySelector('#list').innerHTML = list.length ? `<div class="grid md:grid-cols-2 gap-4">${list.map(a => `<a href="/student/assignments/${a.id}" class="s-card s-card-hover p-5 flex flex-col">
                <div class="flex items-start justify-between gap-3"><div class="min-w-0"><div class="text-xs s-muted truncate">${esc(a.course)}</div><h3 class="font-semibold text-slate-900 mt-0.5">${esc(a.title)}</h3></div>${S.statusChip(a.status)}</div>
                <div class="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-sm"><span class="${a.status === 'overdue' ? 'text-rose-700 font-medium' : 's-muted'}"><i class="fa-regular fa-calendar mr-1.5"></i>${a.due ? 'Due ' + S.relDate(a.due) : 'No due date'}</span>${a.submittedAt ? `<span class="s-muted"><i class="fa-solid fa-paper-plane mr-1.5"></i>Submitted ${ui.timeAgo(a.submittedAt)}${a.late ? ' (late)' : ''}</span>` : ''}</div>
                <div class="flex items-center justify-between mt-auto pt-4"><span class="text-sm">${a.score != null ? `Score <b class="text-slate-900 text-base">${a.score}</b><span class="s-muted">/${a.maxScore}</span>` : `<span class="s-muted">Out of ${a.maxScore} points</span>`}</span><span class="text-sm font-semibold text-forest-600">View assignment<i class="fa-solid fa-arrow-right text-xs ml-1.5"></i></span></div></a>`).join('')}</div>`
                : S.empty(tab === 'overdue' ? 'fa-face-smile' : 'fa-file-circle-check', { upcoming: 'No assignments due', submitted: 'Nothing waiting for grading', graded: 'No graded work yet', overdue: 'Nothing overdue' }[tab], tab === 'upcoming' && !all.length ? 'Assignments from your courses will appear here with their due dates.' : '');
            el.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
        };
        el.innerHTML = S.pageHeader('Assignments', 'Projects and written work from your courses.') + `<div class="mb-5">${S.tabs([['upcoming', 'Upcoming', counts('upcoming')], ['submitted', 'Submitted', counts('submitted')], ['graded', 'Graded', counts('graded')], ['overdue', 'Overdue', counts('overdue')]], tab)}</div><div id="list"></div>`;
        el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
        draw();
    } });

    S.route('/student/assignments/:id', { title: 'Assignment', nav: 'assignments', live: true, render: async (el, { id }) => {
        const a = await api.assignment(id), sub = a.submission;
        S.setTitle(a.title);
        const rubricTotal = a.rubric.reduce((s, r) => s + (+r.points || 0), 0);
        el.innerHTML = `<a href="/student/assignments" class="text-sm s-muted hover:text-slate-900"><i class="fa-solid fa-arrow-left mr-2"></i>Assignments</a>
            <div class="grid xl:grid-cols-[1fr_340px] gap-5 mt-4 items-start">
                <div class="space-y-5">
                    <section class="s-card p-6 sm:p-8">
                        <div class="text-xs s-muted">${esc(a.course)} · ${esc(a.section)}</div>
                        <div class="flex flex-wrap items-start justify-between gap-3 mt-1"><h1 class="text-2xl font-bold text-slate-900">${esc(a.title)}</h1>${S.statusChip(a.status || 'upcoming')}</div>
                        <div class="prose-tos text-[15px] mt-5">${ui.md(a.instructions) || '<p>Instructions will be added by your instructor.</p>'}</div>
                        ${a.resources.length ? `<h2 class="s-h2 mt-6">Resources</h2><div class="grid sm:grid-cols-2 gap-3 mt-3">${a.resources.map(r => `<div class="flex items-center gap-3 rounded-xl border border-[#E6E8EC] p-3"><i class="fa-solid ${S.fileIcon(r.fileType)} w-5"></i><span class="flex-1 min-w-0 text-sm truncate">${esc(r.name)}</span>${S.download(r)}</div>`).join('')}</div>` : ''}
                        ${a.rubric.length ? `<h2 class="s-h2 mt-6">Grading rubric</h2><div class="overflow-x-auto mt-3 rounded-xl border border-[#E6E8EC]"><table class="w-full text-sm"><thead class="bg-[#F7F8FA] text-left text-xs s-muted uppercase"><tr><th class="p-3">Criterion</th><th class="p-3 text-right">Points</th>${sub && sub.status === 'graded' ? '<th class="p-3 text-right">Your score</th>' : ''}</tr></thead><tbody class="divide-y divide-[#F1F3F5]">${a.rubric.map((r, i) => `<tr><td class="p-3"><div class="font-medium text-slate-900">${esc(r.criterion)}</div>${r.description ? `<div class="text-xs s-muted">${esc(r.description)}</div>` : ''}</td><td class="p-3 text-right">${r.points}</td>${sub && sub.status === 'graded' ? `<td class="p-3 text-right font-semibold">${sub.rubricScores && sub.rubricScores[i] != null ? sub.rubricScores[i] : '—'}</td>` : ''}</tr>`).join('')}<tr class="font-semibold bg-[#F7F8FA]"><td class="p-3">Total</td><td class="p-3 text-right">${rubricTotal}</td>${sub && sub.status === 'graded' ? `<td class="p-3 text-right">${sub.score}</td>` : ''}</tr></tbody></table></div>` : ''}
                    </section>
                    <section class="s-card p-6 sm:p-8" id="subArea"></section>
                </div>
                <aside class="space-y-5">
                    <section class="s-card p-5 space-y-4 text-sm">
                        <div><div class="text-xs s-muted">Deadline</div><div class="font-semibold ${a.status === 'overdue' ? 'text-rose-700' : 'text-slate-900'} mt-0.5">${a.due ? new Date(a.due).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'No due date'}</div>${a.due && a.status === 'upcoming' ? `<div class="text-xs s-muted mt-0.5">${Math.max(0, Math.ceil((new Date(a.due) - Date.now()) / 864e5))} days left</div>` : ''}</div>
                        <div><div class="text-xs s-muted">Maximum score</div><div class="font-semibold text-slate-900 mt-0.5">${a.maxScore} points</div></div>
                        <div><div class="text-xs s-muted">Grading status</div><div class="mt-1">${sub ? (sub.status === 'graded' ? '<span class="s-chip bg-emerald-50 text-emerald-700">Graded</span>' : '<span class="s-chip bg-amber-50 text-amber-700">Awaiting grading</span>') : '<span class="s-chip">Not submitted</span>'}</div></div>
                        <div><div class="text-xs s-muted">Accepted formats</div><div class="text-slate-700 mt-0.5">${[a.allowText ? 'Text answer' : '', a.allowFile ? 'File upload' : ''].filter(Boolean).join(' · ')}</div></div>
                    </section>
                    <a href="/student/learn/${a.lessonId}" class="btn btn-outline w-full"><i class="fa-solid fa-book-open"></i>Open the lesson</a>
                    <a href="/student/messages?new=1" class="btn btn-ghost w-full"><i class="fa-regular fa-envelope"></i>Ask your instructor</a>
                </aside></div>`;
        const area = el.querySelector('#subArea');
        const showSubmitted = () => {
            area.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3"><h2 class="s-h2">Your submission</h2><span class="text-xs s-muted">Submitted ${ui.fmtDateTime(sub.submittedAt)}${sub.status === 'late' ? ' · late' : ''}</span></div>
                ${sub.status === 'graded' ? `<div class="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-5 flex flex-col sm:flex-row gap-5"><div class="text-center sm:text-left"><div class="text-xs text-emerald-800 font-semibold uppercase tracking-wider">Score</div><div class="text-4xl font-bold text-slate-900">${sub.score}<span class="text-lg s-muted">/${a.maxScore}</span></div></div>${sub.feedback ? `<div class="flex-1 sm:border-l sm:border-emerald-200 sm:pl-5"><div class="text-xs text-emerald-800 font-semibold uppercase tracking-wider">Instructor feedback</div><p class="text-sm text-slate-700 mt-1 whitespace-pre-line">${esc(sub.feedback)}</p></div>` : ''}</div>`
                : '<p class="text-sm s-muted mt-3"><i class="fa-solid fa-hourglass-half text-amber-500 mr-1"></i>Your instructor will review your work. You will be notified when it is graded.</p>'}
                ${sub.text ? `<div class="mt-4"><div class="text-xs s-muted mb-1">Your answer</div><div class="rounded-xl bg-[#F7F8FA] border border-[#EEF0F3] p-4 text-sm whitespace-pre-line break-words">${esc(sub.text)}</div></div>` : ''}
                ${(sub.files || []).length ? `<div class="mt-3 flex flex-wrap gap-2">${sub.files.map(f => f.url ? `<a href="${esc(f.url)}" download="${esc(f.name)}" class="s-chip !py-1.5 hover:bg-slate-200"><i class="fa-solid fa-paperclip"></i>${esc(f.name)} · ${ui.fmtBytes(f.size)}</a>` : `<span class="s-chip !py-1.5"><i class="fa-solid fa-paperclip"></i>${esc(f.name)}</span>`).join('')}</div>` : ''}
                ${sub.status !== 'graded' ? '<button id="editSub" class="btn btn-outline btn-sm mt-5"><i class="fa-solid fa-pen"></i>Edit submission</button>' : ''}`;
            const eb = area.querySelector('#editSub'); if (eb) eb.onclick = showForm;
        };
        const showForm = () => {
            area.innerHTML = `<h2 class="s-h2">Submit your work</h2><form id="sf" class="space-y-4 mt-4">
                ${a.allowText ? `<div><label class="field-label" for="st">Answer, links or notes</label><textarea id="st" rows="7" maxlength="20000" class="field" placeholder="Paste links to your work and explain your approach">${esc(sub ? sub.text : '')}</textarea></div>` : ''}
                ${a.allowFile ? `<div><label class="field-label" for="sfile">Attach files</label><input id="sfile" type="file" multiple class="field text-sm"><p class="field-hint">Up to 3 files, 1 MB each. Share a link for larger projects.</p>${sub && (sub.files || []).length ? `<p class="field-hint">Currently attached: ${sub.files.map(f => esc(f.name)).join(', ')}</p>` : ''}</div>` : ''}
                <div class="flex flex-wrap gap-2"><button class="btn btn-forest h-11 px-6"><i class="fa-solid fa-paper-plane"></i>Submit assignment</button>${sub ? '<button type="button" id="cancelEdit" class="btn btn-outline h-11">Cancel</button>' : ''}</div></form>`;
            const ce = area.querySelector('#cancelEdit'); if (ce) ce.onclick = showSubmitted;
            area.querySelector('#sf').onsubmit = async e => {
                e.preventDefault();
                const btn = e.target.querySelector('button:not([type])'); btn.disabled = true;
                const files = [];
                for (const f of Array.from((area.querySelector('#sfile') || {}).files || []).slice(0, 3)) {
                    if (f.size > 1048576) { ui.toast(`"${f.name}" is over 1 MB. Share a link instead.`, 'error'); btn.disabled = false; return; }
                    files.push({ name: f.name, size: f.size, type: f.type, url: await ui.readFile(f) });
                }
                try {
                    const r = await api.submitAssignment(a.id, { text: (area.querySelector('#st') || {}).value || '', files: files.length ? files : (sub ? sub.files : []) });
                    ui.toast('Submitted. Your instructor has been notified.'); S.dispatch();
                } catch (err) { btn.disabled = false; ui.toast(err.message, 'error'); }
            };
        };
        sub ? showSubmitted() : showForm();
    } });

    // ---------------- Quizzes ----------------
    S.route('/student/quizzes', { title: 'Quizzes', nav: 'quizzes', live: true, skeleton: 'list', render: async el => {
        const all = await api.quizzes();
        const n = s => all.filter(q => q.status === s || (s === 'pending' && q.status === 'failed')).length;
        let tab = 'available';
        const draw = () => {
            const list = all.filter(q => q.status === tab || (tab === 'pending' && q.status === 'failed'));
            el.querySelector('#list').innerHTML = list.length ? `<div class="s-card divide-y divide-[#F1F3F5]">${list.map(q => `<div class="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <span class="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-circle-question"></i></span>
                <div class="flex-1 min-w-0"><div class="font-semibold text-slate-900">${esc(q.title)}</div><div class="text-xs s-muted mt-0.5">${esc(q.course)} · ${ui.plural(q.questions, 'question')} · ${q.passingScore}% to pass${q.timeLimitMin ? ' · ' + q.timeLimitMin + ' min' : ''}</div></div>
                <div class="flex items-center gap-5 text-sm shrink-0"><div class="text-center"><div class="text-xs s-muted">Best</div><div class="font-bold ${q.status === 'completed' ? 'text-emerald-600' : 'text-slate-900'}">${q.best != null ? q.best + '%' : '—'}</div></div><div class="text-center"><div class="text-xs s-muted">Attempts</div><div class="font-bold text-slate-900">${q.attempts}${q.maxAttempts ? '/' + q.maxAttempts : ''}</div></div>${S.statusChip(q.status)}
                <a href="/student/learn/${q.lessonId}" class="btn ${q.status === 'available' ? 'btn-forest' : 'btn-outline'} btn-sm">${q.status === 'available' ? 'Start' : q.status === 'pending' ? 'Retake' : 'View'}</a></div></div>`).join('')}</div>`
                : S.empty('fa-circle-question', { available: 'No new quizzes', completed: 'No passed quizzes yet', pending: 'Nothing pending' }[tab], !all.length ? 'Quizzes from your courses will appear here.' : '');
            el.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
        };
        const done = all.filter(q => q.best != null);
        el.innerHTML = S.pageHeader('Quizzes', 'Check your understanding across all your courses.')
            + `<div class="grid grid-cols-3 gap-4 mb-5">${[['Available', n('available')], ['Passed', n('completed')], ['Average best score', done.length ? Math.round(done.reduce((a, q) => a + q.best, 0) / done.length) + '%' : '—']].map(([l, v]) => `<div class="s-card p-4"><div class="text-xs s-muted">${l}</div><div class="text-2xl font-bold text-slate-900 mt-1">${v}</div></div>`).join('')}</div>`
            + `<div class="mb-5">${S.tabs([['available', 'Available', n('available')], ['pending', 'Pending', n('pending')], ['completed', 'Completed', n('completed')]], tab)}</div><div id="list"></div>`;
        el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
        draw();
    } });

    // ---------------- Certificates ----------------
    S.route('/student/certificates', { title: 'Certificates', nav: 'certificates', live: true, skeleton: 'list', render: async el => {
        const certs = await api.certificates();
        el.innerHTML = S.pageHeader('Certificates', 'Verified certificates issued by Tech Oasis School.')
            + (certs.length ? `<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5">${certs.map(c => {
                const url = '/verify.html?code=' + encodeURIComponent(c.code);
                return `<article class="s-card overflow-hidden ${c.revoked ? 'opacity-70' : ''}">
                <div class="relative bg-gradient-to-br from-gold-50 via-white to-forest-50 p-6 border-b border-[#EEF0F3]">
                    <div class="absolute inset-3 border border-gold/40 rounded-xl pointer-events-none"></div>
                    <div class="relative flex items-start justify-between gap-3"><span class="w-12 h-12 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-white flex items-center justify-center text-xl shadow"><i class="fa-solid fa-award"></i></span>${c.revoked ? '<span class="s-chip bg-rose-50 text-rose-700">Revoked</span>' : '<span class="s-chip bg-emerald-50 text-emerald-700"><i class="fa-solid fa-shield-halved"></i>Verified</span>'}</div>
                    <div class="relative text-[10px] font-bold uppercase tracking-[0.25em] text-gold-600 mt-4">Certificate of completion</div>
                    <h3 class="relative font-display text-xl text-slate-900 mt-1 leading-snug">${esc(c.courseTitle)}</h3></div>
                <dl class="p-5 grid grid-cols-2 gap-3 text-sm"><div><dt class="text-xs s-muted">Completed</dt><dd class="font-medium text-slate-900">${ui.fmtDate(c.issuedAt)}</dd></div><div><dt class="text-xs s-muted">Certificate ID</dt><dd class="font-mono font-medium text-slate-900">${esc(c.code)}</dd></div></dl>
                <div class="px-5 pb-5 grid grid-cols-3 gap-2"><a href="${url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-eye"></i>View</a><a href="${url}&print=1" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-download"></i>Download</a><button data-verify="${esc(location.origin + url)}" class="btn btn-outline btn-sm"><i class="fa-solid fa-link"></i>Verify</button></div></article>`;
            }).join('')}</div>` : S.empty('fa-award', 'No certificates earned yet', 'Complete a course and meet its requirements to earn a verified certificate.', '<a href="/student/my-courses" class="btn btn-forest btn-sm">Go to my courses</a>'));
        el.querySelectorAll('[data-verify]').forEach(b => b.onclick = () => {
            const m = ui.modal({ title: 'Verification link', size: 'max-w-md', body: `<p class="text-sm s-muted">Anyone can confirm this certificate at this link. Add it to your CV or LinkedIn.</p><div class="flex gap-2 mt-4"><input readonly value="${esc(b.dataset.verify)}" class="field text-xs font-mono" aria-label="Verification link"><button data-copy class="btn btn-forest btn-sm">Copy</button></div><a href="${esc(b.dataset.verify)}" target="_blank" class="inline-block text-sm font-semibold text-forest-600 mt-4">Open verification page<i class="fa-solid fa-arrow-up-right-from-square text-xs ml-1"></i></a>` });
            m.el.querySelector('[data-copy]').onclick = () => navigator.clipboard.writeText(b.dataset.verify).then(() => ui.toast('Link copied'), () => ui.toast('Copy the link above', 'error'));
        });
    } });

    // ---------------- Learning progress ----------------
    S.route('/student/progress', { title: 'Learning Progress', nav: 'progress', live: true, render: async el => {
        const p = await api.progress();
        const h = Math.floor(p.watchSeconds / 3600), m = Math.round(p.watchSeconds % 3600 / 60);
        const max = Math.max(1, ...p.daily.map(d => d.value));
        el.innerHTML = S.pageHeader('Learning Progress', 'Your learning activity and performance across every course.')
            + `<div class="grid lg:grid-cols-[300px_1fr] gap-5">
                <section class="s-card p-6 flex flex-col items-center text-center"><h2 class="s-h2 self-start">Overall progress</h2><div class="my-5">${S.ring(p.overall, 150, 12)}</div><p class="text-sm s-muted">${p.lessonsDone} of ${p.lessonsTotal} lessons completed across ${ui.plural(p.courses.length, 'course')}</p></section>
                <div class="grid grid-cols-2 xl:grid-cols-3 gap-4">
                    ${[['fa-list-check', 'bg-forest-50 text-forest', 'Lessons completed', p.lessonsDone], ['fa-clock', 'bg-sky-50 text-sky-700', 'Video watch time', h ? `${h}h ${m}m` : `${m}m`], ['fa-fire', 'bg-gold-50 text-gold-700', 'Learning streak', ui.plural(p.streak, 'day')], ['fa-circle-question', 'bg-violet-50 text-violet-700', 'Quiz average', p.quizzes.avg != null ? p.quizzes.avg + '%' : '—', p.quizzes.attempts ? `${p.quizzes.passRate}% pass rate · ${ui.plural(p.quizzes.attempts, 'attempt')}` : 'No attempts yet'], ['fa-file-pen', 'bg-amber-50 text-amber-700', 'Assignment average', p.assignments.avg != null ? p.assignments.avg + '%' : '—', `${p.assignments.graded} graded of ${p.assignments.submitted} submitted`], ['fa-award', 'bg-emerald-50 text-emerald-700', 'Certificates', p.certificates]]
                        .map(([ic, tone, l, v, sub]) => `<div class="s-card p-5"><div class="flex items-center justify-between"><span class="text-sm s-muted">${l}</span><span class="w-9 h-9 rounded-xl ${tone} flex items-center justify-center text-sm"><i class="fa-solid ${ic}"></i></span></div><div class="text-2xl font-bold text-slate-900 mt-2">${v}</div>${sub ? `<div class="text-xs s-muted mt-1">${sub}</div>` : ''}</div>`).join('')}
                </div></div>
            <div class="grid xl:grid-cols-2 gap-5 mt-5">
                <section class="s-card p-5"><div class="flex items-center justify-between"><h2 class="s-h2">Lessons completed</h2><span class="text-xs s-muted">Last 14 days</span></div>
                    ${p.daily.some(d => d.value) ? `<div class="flex items-end gap-1.5 h-44 mt-5 border-b border-[#EEF0F3]">${p.daily.map(d => `<div class="flex-1 h-full flex flex-col justify-end items-center group" title="${esc(d.label)}: ${ui.plural(d.value, 'lesson')}"><span class="text-[10px] font-semibold text-slate-600 opacity-0 group-hover:opacity-100">${d.value}</span><div class="w-full max-w-[26px] rounded-t bg-forest-600 group-hover:bg-gold transition-colors" style="height:${d.value ? Math.max(4, d.value / max * 150) : 0}px"></div></div>`).join('')}</div>
                    <div class="flex gap-1.5 mt-1.5">${p.daily.map((d, i) => `<span class="flex-1 text-center text-[9px] s-muted">${i % 2 ? '' : esc(d.label.split(' ')[0])}</span>`).join('')}</div>` : '<p class="text-sm s-muted mt-6">No lessons completed in the last two weeks. Your next lesson is a great place to start.</p>'}</section>
                <section class="s-card p-5"><h2 class="s-h2">Course progress</h2>
                    ${p.courses.length ? `<div class="space-y-4 mt-4">${p.courses.map(c => `<a href="/student/course/${c.id}" class="block group"><div class="flex justify-between text-sm mb-1.5"><span class="font-medium text-slate-900 group-hover:underline truncate">${esc(c.title)}</span><span class="s-muted shrink-0 ml-3">${c.done}/${c.total} · <b class="text-slate-900">${c.pct}%</b></span></div>${S.bar(c.pct)}</a>`).join('')}</div>` : '<p class="text-sm s-muted mt-4">Enroll in a course to see your progress.</p>'}</section>
            </div>
            <div class="grid xl:grid-cols-2 gap-5 mt-5">
                <section class="s-card p-5"><h2 class="s-h2">Quiz performance</h2>
                    ${p.quizzes.rows.length ? `<div class="divide-y divide-[#F1F3F5] mt-2">${p.quizzes.rows.map(q => `<div class="flex items-center gap-3 py-3"><div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-900 truncate">${esc(q.title)}</div><div class="text-xs s-muted truncate">${esc(q.course)}</div></div><div class="w-28">${q.best != null ? S.bar(q.best) : ''}</div><span class="w-12 text-right text-sm font-semibold ${q.status === 'completed' ? 'text-emerald-600' : 'text-slate-700'}">${q.best != null ? q.best + '%' : '—'}</span></div>`).join('')}</div>` : '<p class="text-sm s-muted mt-4">No quizzes in your courses yet.</p>'}</section>
                <section class="s-card p-5"><h2 class="s-h2">Recent activity</h2>
                    ${p.activity.length ? `<ol class="relative mt-4 ml-3 border-l border-[#E6E8EC] space-y-4">${p.activity.map(a => `<li class="ml-5"><span class="absolute -left-[11px] w-[22px] h-[22px] rounded-full bg-white border border-[#E6E8EC] flex items-center justify-center text-[10px] text-forest-600"><i class="fa-solid ${a.icon}"></i></span><a href="${a.link}" class="text-sm text-slate-800 hover:underline">${esc(a.text)}</a><div class="text-xs text-slate-400">${ui.timeAgo(a.at)}</div></li>`).join('')}</ol>` : '<p class="text-sm s-muted mt-4">Your learning activity will appear here.</p>'}</section>
            </div>`;
    } });
})();
