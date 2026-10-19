// Lesson / video learning page: /student/learn/:lessonId (focus layout, no app sidebar)
(function () {
    let player = null, quizTimer = null, noteTimer = null;
    const cleanup = () => { if (player) { try { player.destroy(); } catch (e) { } player = null; } clearInterval(quizTimer); clearTimeout(noteTimer); };
    window.addEventListener('popstate', cleanup);
    document.addEventListener('click', e => { const a = e.target.closest('a[href^="/student"]'); if (a) cleanup(); }, true);

    S.route('/student/learn/:lessonId', { title: 'Learning', nav: 'learn', layout: 'focus', skeleton: 'learn', render: async (el, { lessonId }, token) => {
        cleanup();
        const [L, course] = await Promise.all([api.lesson(lessonId), api.course((TOS.lms.lessonContext(lessonId) || { course: {} }).course.id)]);
        if (token !== S.renderToken) return;
        S.setTitle(L.courseTitle);
        if (!L.locked && course.enrolled) await api.openLesson(lessonId);
        const p = course.progress;

        const curriculum = `<div class="p-5 border-b border-[#EEF0F3]">
                <a href="/student/course/${course.id}" class="text-xs font-semibold s-muted hover:text-slate-900"><i class="fa-solid fa-arrow-left mr-1.5"></i>Course overview</a>
                <div class="font-semibold text-slate-900 mt-2 leading-snug">${esc(course.title)}</div>
                ${p ? `<div class="mt-3"><div class="flex justify-between text-xs mb-1.5"><span class="s-muted">${p.done}/${p.total} lessons</span><b class="text-slate-900" data-course-pct>${p.pct}%</b></div>${S.bar(p.pct)}</div>` : ''}</div>
            <nav aria-label="Course contents">${course.sections.map(s => `<details ${s.lessons.some(l => l.id === lessonId) ? 'open' : ''} class="group border-b border-[#EEF0F3]">
                <summary class="list-none cursor-pointer px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50"><span class="text-xs font-bold text-slate-400 mt-0.5 w-4">${s.index}</span><span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-slate-900">${esc(s.title)}</span><span class="block text-xs s-muted mt-0.5">${s.status === 'complete' ? '<span class="text-emerald-600">✓ Complete</span>' : s.lessons.length ? `${s.lessons.filter(l => l.completed).length}/${s.lessons.length} lessons` : 'Coming soon'}</span></span><i class="fa-solid fa-chevron-down text-[10px] text-slate-400 mt-1.5 group-open:rotate-180 transition"></i></summary>
                <ul class="pb-2">${s.lessons.map(l => {
                    const cur = l.id === lessonId;
                    const ic = l.completed ? 'fa-circle-check text-emerald-500' : l.locked ? 'fa-lock text-slate-300' : S.LESSON_ICON(l.type) + ' text-slate-400';
                    const inner = `<i class="fa-solid ${ic} mt-0.5 w-4"></i><span class="flex-1 min-w-0"><span class="block leading-snug">${esc(l.title)}</span><span class="block text-xs text-slate-400 font-normal mt-0.5">${(ui.LESSON_TYPES[l.type] || {}).label || ''}${l.durationMin ? ' · ' + ui.fmtDuration(l.durationMin) : ''}</span></span>`;
                    return `<li>${l.locked ? `<div class="flex items-start gap-3 pl-12 pr-5 py-2.5 text-sm text-slate-400">${inner}</div>` : `<a href="/student/learn/${l.id}" ${cur ? 'aria-current="page"' : ''} class="flex items-start gap-3 pl-12 pr-5 py-2.5 text-sm border-l-[3px] ${cur ? 'border-gold bg-forest-50/70 text-slate-900 font-semibold' : 'border-transparent text-slate-600 hover:bg-slate-50'}">${inner}</a>`}</li>`;
                }).join('')}</ul></details>`).join('')}</nav>`;

        el.innerHTML = `<div class="flex min-h-[calc(100vh-64px)]">
            <aside id="curr" class="learn-curriculum fixed lg:sticky top-16 left-0 z-20 h-[calc(100vh-64px)] bg-white border-r border-[#E6E8EC] overflow-y-auto thin-scroll -translate-x-full lg:translate-x-0 transition-transform shrink-0">${curriculum}</aside>
            <div id="currScrim" class="hidden fixed inset-0 top-16 z-10 bg-slate-900/40 lg:hidden"></div>
            <div class="flex-1 min-w-0">
                <div class="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border-b border-[#E6E8EC]"><button id="currBtn" class="btn btn-outline btn-sm"><i class="fa-solid fa-list-ul"></i>Contents</button><span class="text-xs s-muted truncate">Lesson ${L.index} of ${L.total}</span></div>
                <div id="stage"></div>
                <div class="max-w-[980px] mx-auto px-4 sm:px-8 py-6 pb-24 lg:pb-10">
                    <div class="text-xs s-muted flex flex-wrap items-center gap-x-2 gap-y-1"><span>${esc(L.sectionTitle)}</span><span>·</span><span>Lesson ${L.index} of ${L.total}</span>${L.durationMin ? `<span>·</span><span>${ui.fmtDuration(L.durationMin)}</span>` : ''}${L.previewOnly ? '<span class="s-chip bg-gold-100 text-gold-700">Free preview</span>' : ''}</div>
                    <h1 class="text-2xl sm:text-[28px] font-bold text-slate-900 leading-tight mt-1.5">${esc(L.title)}</h1>
                    ${L.summary ? `<p class="s-muted mt-1.5">${esc(L.summary)}</p>` : ''}
                    <div class="flex flex-wrap items-center gap-2 mt-5 pb-5 border-b border-[#E6E8EC]">
                        ${L.prevId ? `<a href="/student/learn/${L.prevId}" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-left text-xs"></i>Previous</a>` : '<span class="btn btn-outline btn-sm opacity-40 cursor-not-allowed" aria-disabled="true"><i class="fa-solid fa-arrow-left text-xs"></i>Previous</span>'}
                        <span id="completeSlot"></span>
                        ${L.nextId ? `<a href="/student/learn/${L.nextId}" class="btn btn-gold btn-sm ml-auto">Next<i class="fa-solid fa-arrow-right text-xs"></i></a>` : `<a href="/student/course/${course.id}" class="btn btn-gold btn-sm ml-auto">Finish<i class="fa-solid fa-flag-checkered text-xs"></i></a>`}
                    </div>
                    <div id="tabs" class="mt-5"></div><div id="tabBody" class="py-5"></div>
                </div>
            </div></div>`;
        const curr = el.querySelector('#curr'), scrim = el.querySelector('#currScrim');
        el.querySelector('#currBtn').onclick = () => { curr.classList.remove('-translate-x-full'); scrim.classList.remove('hidden'); };
        scrim.onclick = () => { curr.classList.add('-translate-x-full'); scrim.classList.add('hidden'); };
        const active = curr.querySelector('[aria-current]'); if (active) active.scrollIntoView({ block: 'center' });

        if (L.locked) return lockedStage(el, L, course);
        renderComplete(el, L, course);
        renderStage(el, L, course);
        renderTabs(el, L);
    } });

    function lockedStage(el, L, course) {
        const why = { enroll: ['Enroll to unlock this lesson', 'Join the course to access every lesson, quiz and assignment.', `<a href="/student/course/${course.id}" class="btn btn-gold">View enrollment options</a>`],
            payment: ['Complete payment to continue', 'Your free trial has ended. Complete payment to pick up where you left off.', `<a href="/student/course/${course.id}" class="btn btn-gold">Complete payment</a>`],
            sequential: ['Finish the previous lessons first', 'This course unlocks lessons in order.', `<a href="/student/course/${course.id}" class="btn btn-gold">Back to course</a>`] }[L.lockReason] || ['This lesson is locked', '', ''];
        el.querySelector('#stage').innerHTML = `<div class="bg-ink text-white aspect-video max-h-[65vh] w-full flex items-center justify-center p-8 text-center"><div class="max-w-md"><span class="w-16 h-16 mx-auto rounded-full bg-white/10 flex items-center justify-center text-gold text-2xl"><i class="fa-solid fa-lock"></i></span><h2 class="text-2xl font-semibold mt-5">${why[0]}</h2><p class="text-white/70 text-sm mt-2">${why[1]}</p><div class="mt-6">${why[2]}</div></div></div>`;
    }

    function renderComplete(el, L, course) {
        const slot = el.querySelector('#completeSlot');
        if (!course.enrolled || L.previewOnly) { slot.innerHTML = ''; return; }
        if (L.type === 'quiz' || L.type === 'assignment') { slot.innerHTML = `<span class="text-xs s-muted px-2">${L.completed ? '<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i>Completed' : L.type === 'quiz' ? 'Completes when you pass the quiz' : 'Completes when you submit'}</span>`; return; }
        slot.innerHTML = `<button id="completeBtn" class="btn btn-sm ${L.completed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'btn-forest'}" aria-pressed="${!!L.completed}"><i class="fa-solid ${L.completed ? 'fa-circle-check' : 'fa-check'}"></i>${L.completed ? 'Completed' : 'Mark as complete'}</button>`;
        el.querySelector('#completeBtn').onclick = async () => {
            const btn = el.querySelector('#completeBtn'); btn.disabled = true;
            try {
                const r = await api.completeLesson(L.id, !L.completed);
                L.completed = !L.completed;
                if (L.completed) { ui.toast('Lesson complete'); if (await afterProgress(r, course)) return; if (L.nextId) return S.go('/student/learn/' + L.nextId); }
                S.dispatchQuiet();
            } catch (e) { btn.disabled = false; ui.toast(e.message, 'error'); }
        };
    }
    // Course completion: celebrate and offer the certificate. Returns true if a dialog was shown.
    async function afterProgress(r, course) {
        S.refreshCounts();
        if (!r || !r.courseCompleted) return false;
        const m = ui.modal({ title: 'Course complete!', size: 'max-w-md', body: `<div class="text-center"><span class="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-white flex items-center justify-center text-3xl shadow-lift"><i class="fa-solid fa-trophy"></i></span>
            <p class="text-slate-700 mt-5">You've completed every lesson in <b>${esc(course.title)}</b>.</p>
            ${r.eligible ? '<button data-claim class="btn btn-gold w-full h-12 mt-6"><i class="fa-solid fa-award"></i>Claim my certificate</button>' : `<p class="text-sm s-muted mt-3">Your certificate unlocks once every requirement is met (for example passing quizzes or graded assignments).</p><a href="/student/course/${course.id}" class="btn btn-outline w-full mt-6">See certificate requirements</a>`}</div>` });
        const b = m.el.querySelector('[data-claim]');
        if (b) b.onclick = async () => { try { const c = await api.claimCertificate(course.id); m.close(); ui.toast('Certificate issued: ' + c.code); S.go('/student/certificates'); } catch (e) { ui.toast(e.message, 'error'); } };
        return true;
    }

    // ---------------- Stage (main content area) ----------------
    function renderStage(el, L, course) {
        const stage = el.querySelector('#stage'), c0 = L.contents[0] || {};
        if (L.type === 'video') {
            const v = L.contents.find(c => c.kind === 'video');
            stage.innerHTML = `<div class="bg-black"><div class="max-w-[1280px] mx-auto aspect-video max-h-[70vh]" id="videoHost"></div></div>
                ${L.position > 10 && !L.completed ? `<div class="bg-ink text-white/80 text-xs text-center py-2"><i class="fa-solid fa-clock-rotate-left mr-1 text-gold"></i>Resuming from ${ui.fmtSecs(L.position)}</div>` : ''}`;
            let completedNow = false;
            player = TOS.video.mount(stage.querySelector('#videoHost'), v, {
                startAt: L.completed ? 0 : L.position,
                onProgress: async (pos, dur) => {
                    if (!course.enrolled || L.previewOnly) return;
                    const r = await api.saveVideoProgress(L.id, pos, dur).catch(() => null);
                    if (r && r.completed && !completedNow) {
                        completedNow = true; L.completed = true; ui.toast('Lesson complete'); renderComplete(el, L, course);
                        const res = await api.completeLesson(L.id, true).catch(() => null); afterProgress(res, course);
                    }
                },
                onEnded: () => { if (L.nextId) ui.toast('Up next: use Next to continue'); }
            });
        } else if (L.type === 'document') {
            stage.innerHTML = c0.url ? `<div class="bg-slate-200"><iframe src="${esc(c0.url)}" title="${esc(L.title)}" class="w-full h-[72vh] bg-white"></iframe></div><div class="text-center py-2 bg-white border-b"><a href="${esc(c0.url)}" ${c0.url.startsWith('data:') ? `download="${esc(c0.fileName || 'document')}"` : 'target="_blank" rel="noopener noreferrer"'} class="text-sm font-semibold text-forest-600"><i class="fa-solid fa-download mr-1"></i>Download document</a></div>` : '';
        } else if (L.type === 'external') {
            stage.innerHTML = `<div class="bg-gradient-to-br from-forest to-ink text-white"><div class="max-w-[980px] mx-auto px-4 sm:px-8 py-12 flex flex-col sm:flex-row sm:items-center gap-6"><span class="w-14 h-14 rounded-2xl bg-white/10 text-gold flex items-center justify-center text-xl"><i class="fa-solid fa-arrow-up-right-from-square"></i></span><div class="flex-1 min-w-0"><div class="text-white/60 text-xs uppercase tracking-[0.2em] font-bold">External resource</div><div class="font-semibold mt-1 break-all">${esc(c0.url || 'Link not added yet')}</div></div>${/^https?:/.test(c0.url || '') ? `<a href="${esc(c0.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-gold">${esc(c0.label || 'Open resource')}<i class="fa-solid fa-arrow-up-right-from-square text-xs"></i></a>` : ''}</div></div>`;
        } else if (L.type === 'quiz') {
            stage.innerHTML = `<div class="bg-gradient-to-b from-forest-50 to-[#F4F5F7]"><div id="quizHost" class="max-w-[820px] mx-auto px-4 sm:px-8 py-8"></div></div>`;
            quizIntro(el, L, course);
        } else if (L.type === 'assignment') {
            stage.innerHTML = `<div class="bg-gradient-to-b from-gold-50 to-[#F4F5F7]"><div class="max-w-[820px] mx-auto px-4 sm:px-8 py-8"><div class="s-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5"><span class="w-14 h-14 rounded-2xl bg-gold-100 text-gold-700 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-file-pen"></i></span><div class="flex-1"><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">Assignment</div><div class="text-lg font-semibold text-slate-900">${esc(L.title)}</div><p class="text-sm s-muted mt-1">Read the instructions, submit your work and track your grade.</p></div><a href="/student/assignments/${L.assignmentId}" class="btn btn-forest">Open assignment<i class="fa-solid fa-arrow-right text-xs"></i></a></div></div></div>`;
        } else stage.innerHTML = '';
    }

    // ---------------- Tabs ----------------
    function renderTabs(el, L) {
        const video = L.contents.find(c => c.kind === 'video'), article = L.contents.find(c => c.kind === 'article');
        const tabs = [['overview', 'Overview'], ['resources', `Resources${L.resources.length ? ' (' + L.resources.length + ')' : ''}`]].concat(video && video.transcript ? [['transcript', 'Transcript']] : [], L.previewOnly ? [] : [['notes', 'Notes']], L.discussionsEnabled ? [['discussion', 'Discussion']] : []);
        let tab = 'overview';
        const box = el.querySelector('#tabs'), body = el.querySelector('#tabBody');
        const draw = async () => {
            box.innerHTML = `<div class="flex gap-6 border-b border-[#E6E8EC] overflow-x-auto no-scrollbar" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-t="${k}" class="py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${k === tab ? 'border-gold text-slate-900' : 'border-transparent s-muted hover:text-slate-900'}">${l}</button>`).join('')}</div>`;
            box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
            if (tab === 'overview') {
                const html = (ui.md(L.body) || '') + (article && article.body ? ui.md(article.body) : '');
                body.innerHTML = (L.type === 'quiz' && L.quizInstructions ? `<div class="prose-tos">${ui.md(L.quizInstructions)}</div>` : '') + (html ? `<div class="prose-tos">${html}</div>` : (L.type === 'quiz' ? '' : '<p class="text-sm s-muted">No additional notes for this lesson.</p>'));
            }
            if (tab === 'resources') body.innerHTML = L.resources.length ? `<div class="grid sm:grid-cols-2 gap-3">${L.resources.map(r => `<div class="s-card p-4 flex items-center gap-3"><span class="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center"><i class="fa-solid ${S.fileIcon(r.fileType)}"></i></span><div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-900 truncate">${esc(r.name)}</div><div class="text-xs s-muted uppercase">${esc(r.fileType)} · ${ui.fmtBytes(r.sizeBytes)}${r.courseWide ? ' · Course resource' : ''}</div></div>${S.download(r)}</div>`).join('')}</div>` : '<p class="text-sm s-muted">No resources for this lesson.</p>';
            if (tab === 'transcript') body.innerHTML = `<div class="s-card p-6 text-sm leading-7 text-slate-700 whitespace-pre-line max-h-[460px] overflow-y-auto thin-scroll">${esc(video.transcript)}</div>`;
            if (tab === 'notes') {
                body.innerHTML = `<label for="note" class="text-sm font-semibold text-slate-900">My notes <span class="font-normal s-muted">· private, saved automatically</span></label><textarea id="note" rows="9" class="field mt-2" placeholder="Write key ideas, questions, code snippets…">${esc(L.note)}</textarea><p id="noteStatus" class="field-hint">${L.note ? 'Saved' : ''}</p>`;
                const ta = body.querySelector('#note'), st = body.querySelector('#noteStatus');
                ta.oninput = () => { st.textContent = 'Saving…'; clearTimeout(noteTimer); noteTimer = setTimeout(async () => { L.note = ta.value; await api.saveNote(L.id, ta.value).catch(() => { st.textContent = 'Could not save. Check your connection.'; }); st.textContent = 'Saved ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }, 600); };
            }
            if (tab === 'discussion') renderDiscussion(body, L);
        };
        draw();
    }
    async function renderDiscussion(body, L) {
        body.innerHTML = '<div class="sk h-24"></div>';
        const posts = await api.discussion(L.id);
        const item = (p, reply) => `<div class="flex gap-3 ${reply ? 'mt-4' : ''}">${S.avatar({ name: p.name }, 34)}<div class="flex-1 min-w-0"><div class="text-sm"><b class="text-slate-900">${esc(p.name)}</b>${p.staff ? ' <span class="s-chip bg-gold-100 text-gold-700">Staff</span>' : ''}${p.mine ? ' <span class="s-chip">You</span>' : ''} <span class="text-xs text-slate-400 ml-1">${ui.timeAgo(p.createdAt)}</span></div><p class="text-sm text-slate-700 mt-1 whitespace-pre-line break-words">${esc(p.body)}</p>
            ${!reply && !L.previewOnly ? `<button data-reply="${p.id}" class="text-xs font-semibold text-forest-600 mt-2">Reply</button><form data-rf="${p.id}" class="hidden mt-2 flex gap-2"><input class="field" required maxlength="2000" placeholder="Write a reply" aria-label="Reply"><button class="btn btn-forest btn-sm">Reply</button></form>` : ''}
            ${(p.replies || []).map(r => item(r, true)).join('')}</div></div>`;
        body.innerHTML = (L.previewOnly ? '<p class="text-sm s-muted s-card p-4">Enroll to join the discussion.</p>' : `<form id="pf" class="s-card p-4"><label for="pt" class="sr-only">Post to discussion</label><textarea id="pt" rows="3" required maxlength="4000" class="field" placeholder="Ask a question or share an insight with classmates"></textarea><div class="flex justify-end mt-2"><button class="btn btn-forest btn-sm">Post</button></div></form>`)
            + `<div class="mt-5 space-y-4">${posts.map(p => `<div class="s-card p-5">${item(p)}</div>`).join('') || '<p class="text-sm s-muted">No posts yet. Start the conversation.</p>'}</div>`;
        const pf = body.querySelector('#pf');
        if (pf) pf.onsubmit = async e => { e.preventDefault(); try { await api.postDiscussion(L.id, body.querySelector('#pt').value); renderDiscussion(body, L); } catch (err) { ui.toast(err.message, 'error'); } };
        body.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => body.querySelector(`[data-rf="${b.dataset.reply}"]`).classList.toggle('hidden'));
        body.querySelectorAll('[data-rf]').forEach(f => f.onsubmit = async e => { e.preventDefault(); try { await api.postDiscussion(L.id, f.querySelector('input').value, f.dataset.rf); renderDiscussion(body, L); } catch (err) { ui.toast(err.message, 'error'); } });
    }

    // ---------------- Quiz ----------------
    async function quizIntro(el, L, course) {
        const host = el.querySelector('#quizHost'), q = L.quiz;
        const history = course.enrolled ? await api.quizHistory(q.id) : [];
        const left = q.attemptsLeft == null ? Infinity : q.attemptsLeft;
        host.innerHTML = `<div class="s-card p-6 sm:p-8">
            <div class="flex flex-wrap items-start justify-between gap-4"><div><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-600">Graded quiz</div><h2 class="text-2xl font-bold text-slate-900 mt-1">${esc(q.title)}</h2></div>${q.best != null ? `<div class="text-right"><div class="text-xs s-muted">Best score</div><div class="text-3xl font-bold ${q.status === 'completed' ? 'text-emerald-600' : 'text-slate-900'}">${q.best}%</div></div>` : ''}</div>
            ${L.quizInstructions ? `<div class="prose-tos text-sm mt-4">${ui.md(L.quizInstructions)}</div>` : ''}
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 text-sm">${[['fa-list-ol', ui.plural(q.questions, 'question')], ['fa-bullseye', q.passingScore + '% to pass'], ['fa-stopwatch', q.timeLimitMin ? q.timeLimitMin + ' min limit' : 'No time limit'], ['fa-rotate', q.maxAttempts ? `${q.attempts}/${q.maxAttempts} attempts used` : 'Unlimited attempts']].map(([ic, t]) => `<div class="rounded-xl bg-[#F7F8FA] p-3.5"><i class="fa-solid ${ic} text-violet-500"></i><div class="font-medium text-slate-900 mt-1.5">${t}</div></div>`).join('')}</div>
            <div class="mt-7 flex flex-wrap gap-3 items-center">${!course.enrolled || L.previewOnly ? '<p class="text-sm s-muted">Enroll in this course to take the quiz.</p>' : !q.questions ? '<p class="text-sm s-muted">This quiz has no questions yet.</p>' : left > 0 ? `<button id="startQuiz" class="btn btn-forest h-12 px-6">${q.attempts ? 'Retake quiz' : 'Start quiz'}<i class="fa-solid fa-arrow-right text-xs"></i></button>` : '<p class="text-sm text-rose-700"><i class="fa-solid fa-circle-info mr-1"></i>You have used all your attempts. Message your instructor if you need another.</p>'}</div>
            ${history.length ? `<div class="mt-8"><div class="text-sm font-semibold text-slate-900 mb-2">Your attempts</div><div class="divide-y divide-[#F1F3F5] border border-[#E6E8EC] rounded-xl">${history.map((a, i) => `<div class="flex items-center justify-between px-4 py-3 text-sm"><span>Attempt ${history.length - i} <span class="s-muted">· ${ui.fmtDateTime(a.submittedAt)}</span></span><span class="flex items-center gap-3"><b>${a.percent}%</b>${a.passed ? '<span class="s-chip bg-emerald-50 text-emerald-700">Passed</span>' : '<span class="s-chip bg-rose-50 text-rose-700">Not passed</span>'}</span></div>`).join('')}</div></div>` : ''}</div>`;
        const sb = host.querySelector('#startQuiz');
        if (sb) sb.onclick = async () => { sb.disabled = true; try { runQuiz(el, L, course, await api.startQuiz(q.id)); } catch (e) { sb.disabled = false; ui.toast(e.message, 'error'); } };
    }
    function runQuiz(el, L, course, quiz) {
        const host = el.querySelector('#quizHost'), answers = {}, n = quiz.questions.length;
        let i = 0, end = quiz.timeLimitMin ? Date.now() + quiz.timeLimitMin * 60000 : null, submitting = false;
        const answered = () => quiz.questions.filter(x => (answers[x.id] || []).length).length;
        const draw = () => {
            const x = quiz.questions[i], multi = x.type === 'multiple';
            host.innerHTML = `<div class="s-card overflow-hidden">
                <div class="px-6 pt-5 pb-4 border-b border-[#EEF0F3]"><div class="flex items-center justify-between gap-3"><div class="text-sm font-semibold text-slate-900">${esc(quiz.title)}</div>${end ? '<span id="timer" class="s-chip bg-ink text-white !text-sm !px-3 !py-1"></span>' : ''}</div>
                    <div class="flex items-center justify-between text-xs s-muted mt-3"><span>Question ${i + 1} of ${n}</span><span>${answered()} answered</span></div><div class="mt-1.5">${S.bar(Math.round((i + 1) / n * 100))}</div></div>
                <fieldset class="p-6 sm:p-8"><legend class="text-xs s-muted mb-2">${x.points} point${x.points > 1 ? 's' : ''}${multi ? ' · Select all that apply' : ''}</legend>
                    <p class="text-lg font-semibold text-slate-900 leading-snug">${esc(x.prompt)}</p>
                    <div class="mt-5 space-y-2.5">${x.options.map((o, k) => `<label class="flex items-center gap-3 rounded-xl border border-[#E6E8EC] px-4 py-3.5 cursor-pointer hover:border-forest-300 has-[:checked]:border-forest-600 has-[:checked]:bg-forest-50"><input type="${multi ? 'checkbox' : 'radio'}" name="opt" value="${o.id}" ${(answers[x.id] || []).includes(o.id) ? 'checked' : ''} class="w-4 h-4 accent-[#0C3B2E]"><span class="w-6 h-6 rounded-md bg-slate-100 text-xs font-semibold flex items-center justify-center shrink-0">${String.fromCharCode(65 + k)}</span><span class="text-sm text-slate-800">${esc(o.text)}</span></label>`).join('')}</div></fieldset>
                <div class="px-6 pb-6 flex flex-wrap items-center gap-3">
                    <button data-prev class="btn btn-outline btn-sm" ${i ? '' : 'disabled'}><i class="fa-solid fa-arrow-left text-xs"></i>Previous</button>
                    <div class="flex flex-wrap gap-1.5 mx-auto" aria-label="Jump to question">${quiz.questions.map((q2, k) => `<button data-jump="${k}" aria-label="Question ${k + 1}" class="w-7 h-7 rounded-lg text-xs font-semibold ${k === i ? 'bg-ink text-white' : (answers[q2.id] || []).length ? 'bg-forest-100 text-forest' : 'bg-slate-100 text-slate-500'}">${k + 1}</button>`).join('')}</div>
                    ${i < n - 1 ? '<button data-next class="btn btn-forest btn-sm">Next<i class="fa-solid fa-arrow-right text-xs"></i></button>' : '<button data-submit class="btn btn-gold btn-sm"><i class="fa-solid fa-paper-plane text-xs"></i>Submit quiz</button>'}
                </div></div>`;
            host.querySelectorAll('input[name=opt]').forEach(inp => inp.onchange = () => { answers[x.id] = [...host.querySelectorAll('input[name=opt]:checked')].map(c => c.value); draw(); });
            host.querySelector('[data-prev]').onclick = () => { i--; draw(); };
            const nx = host.querySelector('[data-next]'); if (nx) nx.onclick = () => { i++; draw(); };
            host.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { i = +b.dataset.jump; draw(); });
            const sb = host.querySelector('[data-submit]'); if (sb) sb.onclick = () => submit(false);
            tick();
        };
        const tick = () => { const t = host.querySelector('#timer'); if (!t || !end) return; const s = Math.max(0, (end - Date.now()) / 1000); t.innerHTML = `<i class="fa-solid fa-stopwatch mr-1"></i>${ui.fmtSecs(s)}`; if (s <= 0) { ui.toast('Time is up. Your answers were submitted.'); submit(true); } };
        if (end) quizTimer = setInterval(tick, 1000);
        const submit = async auto => {
            if (submitting) return;
            const blank = n - answered();
            if (!auto && blank && !(await ui.confirmBox(`You have ${ui.plural(blank, 'unanswered question')}. Submit anyway?`, { okText: 'Submit quiz' }))) return;
            submitting = true; clearInterval(quizTimer);
            try { results(el, L, course, await api.submitQuiz(quiz.id, answers, quiz.startedAt)); }
            catch (e) { submitting = false; ui.toast(e.message, 'error'); }
        };
        draw();
    }
    function results(el, L, course, r) {
        const host = el.querySelector('#quizHost');
        host.innerHTML = `<div class="s-card p-6 sm:p-8 text-center">
            ${S.ring(r.percent, 120, 10)}
            <h2 class="text-2xl font-bold mt-4 ${r.passed ? 'text-emerald-700' : 'text-slate-900'}">${r.passed ? 'Passed! Well done.' : 'Not passed yet'}</h2>
            <p class="s-muted mt-1">${r.score} of ${r.max} points · ${r.passingScore}% needed to pass</p>
            <div class="flex justify-center gap-3 mt-5 text-sm"><span class="s-chip bg-emerald-50 text-emerald-700 !text-sm !px-3 !py-1"><i class="fa-solid fa-check"></i>${r.correct} correct</span><span class="s-chip bg-rose-50 text-rose-700 !text-sm !px-3 !py-1"><i class="fa-solid fa-xmark"></i>${r.incorrect} incorrect</span><span class="s-chip !text-sm !px-3 !py-1"><i class="fa-solid fa-rotate"></i>${r.attemptsLeft == null ? 'Unlimited attempts' : ui.plural(r.attemptsLeft, 'attempt') + ' left'}</span></div>
            <div class="flex flex-wrap justify-center gap-3 mt-6">${!r.passed && (r.attemptsLeft == null || r.attemptsLeft > 0) ? '<button data-retake class="btn btn-forest">Retake quiz</button>' : ''}${L.nextId ? `<a href="/student/learn/${L.nextId}" class="btn ${r.passed ? 'btn-gold' : 'btn-outline'}">Next lesson<i class="fa-solid fa-arrow-right text-xs"></i></a>` : ''}</div></div>
            <h3 class="text-sm font-semibold text-slate-900 mt-8 mb-3">Review your answers</h3>
            <div class="space-y-3">${r.review.map((x, k) => `<div class="s-card p-5 ${x.ok ? 'border-l-4 !border-l-emerald-400' : 'border-l-4 !border-l-rose-400'}">
                <div class="text-xs font-semibold ${x.ok ? 'text-emerald-700' : 'text-rose-700'}"><i class="fa-solid ${x.ok ? 'fa-circle-check' : 'fa-circle-xmark'} mr-1"></i>Question ${k + 1} · ${x.ok ? 'Correct' : 'Incorrect'}</div>
                <p class="font-medium text-slate-900 mt-1.5">${esc(x.prompt)}</p>
                <ul class="mt-3 space-y-1.5 text-sm">${x.options.map(o => { const right = x.correct.includes(o.id), picked = x.given.includes(o.id); return `<li class="flex items-center gap-2 ${right ? 'text-emerald-700 font-medium' : picked ? 'text-rose-700' : 'text-slate-600'}"><i class="fa-solid ${right ? 'fa-check' : picked ? 'fa-xmark' : 'fa-circle text-[5px] text-slate-300'} w-4"></i>${esc(o.text)}${picked ? ' <span class="text-xs font-normal text-slate-400">(your answer)</span>' : ''}</li>`; }).join('')}</ul>
                ${x.explanation ? `<p class="text-sm text-slate-600 bg-[#F7F8FA] rounded-xl p-3 mt-3"><i class="fa-solid fa-lightbulb text-gold-600 mr-1"></i>${esc(x.explanation)}</p>` : ''}</div>`).join('')}</div>`;
        const rt = host.querySelector('[data-retake]'); if (rt) rt.onclick = () => S.dispatch();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        S.refreshCounts();
        if (r.passed) { L.completed = true; renderComplete(el, L, course); api.course(course.id).then(cc => { const pct = el.querySelector('[data-course-pct]'); if (pct) pct.textContent = cc.progress.pct + '%'; if (cc.progress.pct === 100) afterProgress({ courseCompleted: true, eligible: r.eligible }, course); }); }
    }
})();
