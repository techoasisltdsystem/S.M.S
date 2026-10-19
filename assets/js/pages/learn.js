// Student learning experience: curriculum sidebar, lesson player (video, article, document, quiz,
// assignment, downloads, external), progress tracking, resources, transcript, discussion, certificate.
(function () {
    const { db, lms, ui, auth } = TOS, esc = ui.esc;
    const preview = ui.qs('preview') === '1' && auth.isAdmin();
    const me = auth.current();
    const course = lms.courseBySlug(ui.qs('c'));
    const main = document.getElementById('lesson'), side = document.getElementById('sidebar');
    let lessonId = ui.qs('l'), player = null, tab = 'overview', quizState = null;
    // In preview mode progress is never saved; a student must be signed in otherwise.
    const uid = preview ? null : me && me.role === 'student' ? me.id : null;

    if (!preview) { const l = ui.qs('l'); location.replace(l ? '/student/learn/' + encodeURIComponent(l) : course ? '/student/course/' + course.id : '/student/my-courses'); return; }
    document.getElementById('homeMark').innerHTML = ui.logoMark(30, true);
    if (!course || (!preview && course.status !== 'published')) {
        main.innerHTML = `<div class="max-w-lg mx-auto text-center py-24 px-4"><h1 class="font-display text-3xl text-ink">Program not found</h1><a href="index.html#catalog" class="btn btn-forest mt-6">Browse programs</a></div>`;
        return;
    }
    document.title = course.title + ' | Tech Oasis School';
    const titleEl = document.getElementById('courseTitle');
    titleEl.textContent = course.title; titleEl.href = 'course.html?c=' + encodeURIComponent(course.slug) + (preview ? '&preview=1' : '');
    if (preview) {
        const bar = document.getElementById('previewBar'); bar.classList.remove('hidden');
        bar.innerHTML = `<div class="px-4 py-2 flex flex-wrap items-center justify-between gap-2"><span><i class="fa-solid fa-eye mr-2"></i><b>Student preview.</b> Progress, quiz attempts and submissions are not saved.</span><a href="admin.html#/courses/${course.id}" class="btn btn-ink btn-sm">Back to builder</a></div>`;
    }

    const lessons = () => lms.flatLessons(course.id, preview);
    const url = id => `learn.html?c=${encodeURIComponent(course.slug)}&l=${id}${preview ? '&preview=1' : ''}`;
    const done = id => uid && lms.isComplete(uid, id);

    // ---------- Sidebar ----------
    function renderSidebar() {
        const t = lms.tree(course.id, preview), prog = uid ? lms.progress(uid, course.id) : null;
        side.innerHTML = `<div class="p-5 border-b border-slate-200/70">
                <div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">Course contents</div>
                <div class="font-display text-lg text-ink mt-1 leading-snug">${esc(course.title)}</div>
                ${prog ? `<div class="mt-3"><div class="flex justify-between text-xs text-slate-500 mb-1"><span>${prog.done} of ${prog.total} lessons</span><b class="text-ink">${prog.pct}%</b></div><div class="h-1.5 bg-slate-100 rounded-full"><div class="h-1.5 rounded-full bg-gradient-to-r from-forest-600 to-gold" style="width:${prog.pct}%"></div></div></div>` : ''}
            </div>
            <nav aria-label="Course contents">${t.sections.map((s, i) => {
                const sp = prog && prog.sections.find(x => x.id === s.id);
                const label = !s.lessons.length ? 'Coming soon' : !sp ? ui.plural(s.lessons.length, 'lesson') : sp.status === 'complete' ? '<span class="text-forest-600 font-semibold"><i class="fa-solid fa-check mr-1"></i>Complete</span>' : sp.status === 'in_progress' ? `<span class="text-gold-700 font-semibold">${sp.pct}%</span>` : 'Not started';
                const open = s.lessons.some(l => l.id === lessonId) || (!lessonId && i === 0);
                return `<details ${open ? 'open' : ''} class="group border-b border-slate-200/70">
                    <summary class="list-none cursor-pointer px-5 py-4 flex items-start gap-3 hover:bg-ivory/70">
                        <span class="text-xs font-bold text-slate-400 mt-0.5 w-5">${i + 1}</span>
                        <span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-ink">${esc(s.title)}</span><span class="block text-xs text-slate-500 mt-0.5">${label}</span></span>
                        <i class="fa-solid fa-chevron-down text-[10px] text-slate-400 mt-1.5 group-open:rotate-180 transition"></i></summary>
                    <ul class="pb-2">${s.lessons.map(l => {
                        const T = ui.LESSON_TYPES[l.type] || ui.LESSON_TYPES.article, cur = l.id === lessonId, acc = lms.lessonAccess(uid, l.id, preview);
                        return `<li><a href="${url(l.id)}" data-lesson="${l.id}" class="flex items-start gap-3 pl-12 pr-5 py-2.5 text-sm ${cur ? 'bg-forest-50 border-l-[3px] border-forest -ml-0 text-ink font-semibold' : 'text-slate-600 hover:bg-ivory/70 border-l-[3px] border-transparent'}">
                            <i class="fa-solid ${done(l.id) ? 'fa-circle-check text-forest-400' : !acc.ok ? 'fa-lock text-slate-300' : T.icon + ' text-slate-400'} mt-0.5 w-4"></i>
                            <span class="flex-1 min-w-0"><span class="block leading-snug">${esc(l.title)}</span><span class="block text-xs text-slate-400 font-normal mt-0.5">${T.label}${l.durationMin ? ' · ' + ui.fmtDuration(l.durationMin) : ''}</span></span></a></li>`;
                    }).join('')}</ul></details>`;
            }).join('')}</nav>`;
        ui.$$('[data-lesson]', side).forEach(a => a.onclick = e => { e.preventDefault(); openLesson(a.dataset.lesson); closeSide(); });
        if (prog) {
            document.getElementById('ring').style.strokeDashoffset = 94.25 * (1 - prog.pct / 100);
            document.getElementById('progressPct').textContent = prog.pct + '%';
        } else document.getElementById('progressWrap').classList.add('hidden');
        const cert = uid && lms.certificateOf(uid, course.id), elig = uid && lms.eligibility(uid, course.id);
        const cb = document.getElementById('certBtn');
        cb.classList.toggle('hidden', !(cert || (elig && elig.enabled && prog && prog.pct > 0)));
        cb.onclick = () => openCertificate();
    }
    const sideToggle = document.getElementById('sideToggle'), scrim = document.getElementById('sideScrim');
    const closeSide = () => { side.classList.add('-translate-x-full'); scrim.classList.add('hidden'); };
    sideToggle.onclick = () => { side.classList.remove('-translate-x-full'); scrim.classList.remove('hidden'); };
    scrim.onclick = closeSide;

    // ---------- Lesson ----------
    function openLesson(id, replace) {
        if (player) { player.destroy(); player = null; }
        clearInterval(quizState && quizState.timer); quizState = null;
        lessonId = id; tab = 'overview';
        history[replace ? 'replaceState' : 'pushState']({ id }, '', url(id));
        if (uid) lms.touch(uid, course.id, id);
        renderSidebar(); renderLesson();
        main.scrollTo && window.scrollTo(0, 0);
    }
    window.addEventListener('popstate', e => { if (e.state && e.state.id) { lessonId = e.state.id; if (player) player.destroy(); renderSidebar(); renderLesson(); } });

    function lockedView(acc) {
        const msgs = {
            enroll: ['Enroll to unlock this lesson', 'Join the program to access every lesson, quiz and project.', `<a href="course.html?c=${encodeURIComponent(course.slug)}#enroll" class="btn btn-gold">See enrollment options</a>`],
            payment: ['Complete payment to continue', 'Your free trial has ended. Complete payment to pick up where you left off.', `<a href="course.html?c=${encodeURIComponent(course.slug)}#enroll" class="btn btn-gold">Complete payment</a>`],
            sequential: ['Finish the previous lessons first', 'This program unlocks lessons in order. Complete the earlier lessons to continue.', '']
        }[acc.reason] || ['Lesson unavailable', '', ''];
        if (acc.reason === 'enroll' && !me) msgs[2] = `<a href="index.html?login=student&mode=register&next=${encodeURIComponent('course.html?c=' + course.slug)}" class="btn btn-gold">Join for free</a>`;
        return `<div class="aspect-video max-h-[70vh] bg-ink text-white flex items-center justify-center p-8 text-center relative overflow-hidden grain"><div class="relative max-w-md">
            <span class="w-16 h-16 mx-auto rounded-full bg-white/10 flex items-center justify-center text-gold text-2xl"><i class="fa-solid fa-lock"></i></span>
            <h2 class="font-display text-3xl mt-5">${msgs[0]}</h2><p class="text-white/70 mt-2 text-sm">${msgs[1]}</p><div class="mt-6">${msgs[2]}</div></div></div>`;
    }

    function renderLesson() {
        const all = lessons();
        let l = all.find(x => x.id === lessonId);
        if (!l) {
            const p = uid && lms.progress(uid, course.id);
            l = (p && p.current) || all[0];
            if (!l) { main.innerHTML = '<p class="p-10 text-slate-500">This program has no published lessons yet.</p>'; return; }
            return openLesson(l.id, true);
        }
        const i = all.indexOf(l), prev = all[i - 1], next = all[i + 1];
        const ctx = lms.lessonContext(l.id), T = ui.LESSON_TYPES[l.type] || ui.LESSON_TYPES.article;
        const acc = lms.lessonAccess(uid, l.id, preview);
        const contents = lms.contentsOf(l.id), video = contents.find(c => c.kind === 'video');
        const res = lms.resourcesOf({ lessonId: l.id }).concat(i === 0 || l.type === 'download' ? lms.resourcesOf({ courseId: course.id }) : []);
        const discussOn = course.discussionsEnabled !== false && l.discussionsEnabled !== false && db.settings().courses.discussionsEnabled;
        const isDone = done(l.id), autoTypes = ['quiz', 'assignment'];
        const tabs = [['overview', 'Overview']].concat(video && video.transcript ? [['transcript', 'Transcript']] : [], res.length ? [['resources', `Resources (${res.length})`]] : [], discussOn ? [['discussion', `Discussion (${db.count('discussions', { lessonId: l.id })})`]] : []);

        main.innerHTML = `
            <div id="stage">${acc.ok ? stageHtml(l, contents) : lockedView(acc)}</div>
            <div class="max-w-[960px] mx-auto px-4 sm:px-8 py-8">
                <div class="text-xs text-slate-500 flex flex-wrap items-center gap-2"><span>${esc(ctx.section.title)}</span><i class="fa-solid fa-chevron-right text-[8px]"></i><span><i class="fa-solid ${T.icon} mr-1"></i>${T.label}</span>${l.durationMin ? `<span>· ${ui.fmtDuration(l.durationMin)}</span>` : ''}${acc.previewOnly ? '<span class="pill bg-gold-100 text-gold-700">Free preview</span>' : ''}</div>
                <h1 class="font-display text-3xl sm:text-4xl text-ink mt-2 leading-tight">${esc(l.title)}</h1>
                ${l.summary ? `<p class="text-slate-600 mt-2">${esc(l.summary)}</p>` : ''}

                <div class="flex flex-wrap items-center gap-3 mt-6 pb-6 border-b border-slate-200">
                    <button id="prevBtn" ${prev ? '' : 'disabled'} class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-left text-xs"></i>Previous</button>
                    ${uid && acc.ok && !acc.previewOnly ? (autoTypes.includes(l.type)
                        ? `<span class="text-xs text-slate-500 px-2">${isDone ? '<i class="fa-solid fa-circle-check text-forest-400 mr-1"></i>Completed' : l.type === 'quiz' ? 'Completes when you pass the quiz' : 'Completes when you submit'}</span>`
                        : `<button id="completeBtn" class="btn btn-sm ${isDone ? 'bg-forest-50 text-forest border border-forest-200' : 'btn-forest'}"><i class="fa-solid ${isDone ? 'fa-circle-check' : 'fa-check'}"></i>${isDone ? 'Completed' : 'Mark as complete'}</button>`) : ''}
                    <button id="nextBtn" ${next ? '' : 'disabled'} class="btn btn-gold btn-sm ml-auto">${next ? 'Next' : 'Last lesson'}<i class="fa-solid fa-arrow-right text-xs"></i></button>
                </div>
                ${next ? `<p class="text-xs text-slate-400 mt-2 text-right">Up next: ${esc(next.title)}</p>` : ''}

                <div class="flex gap-6 border-b border-slate-200 mt-6 overflow-x-auto no-scrollbar" role="tablist">${tabs.map(([k, label]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}" class="py-3 text-sm font-semibold whitespace-nowrap border-b-2 ${k === tab ? 'border-gold text-ink' : 'border-transparent text-slate-500 hover:text-ink'}">${label}</button>`).join('')}</div>
                <div id="tabBody" class="py-6"></div>
            </div>`;

        document.getElementById('prevBtn').onclick = () => prev && openLesson(prev.id);
        document.getElementById('nextBtn').onclick = () => next && openLesson(next.id);
        const cb = document.getElementById('completeBtn');
        if (cb) cb.onclick = () => {
            lms.setComplete(uid, l.id, !isDone);
            if (!isDone) { ui.toast('Lesson complete. Nice work!'); afterProgress(); if (next) return openLesson(next.id); }
            renderSidebar(); renderLesson();
        };
        ui.$$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; ui.$$('[data-tab]').forEach(x => { const on = x === b; x.setAttribute('aria-selected', on); x.className = 'py-3 text-sm font-semibold whitespace-nowrap border-b-2 ' + (on ? 'border-gold text-ink' : 'border-transparent text-slate-500 hover:text-ink'); }); renderTab(l, res, video); });
        renderTab(l, res, video);
        if (acc.ok) mountStage(l, contents);
    }

    // The main stage (above the title) per content type
    function stageHtml(l, contents) {
        const c = contents[0] || {};
        if (l.type === 'video') return `<div class="bg-black"><div class="max-w-[1280px] mx-auto aspect-video max-h-[72vh]" id="videoHost"></div></div>`;
        if (l.type === 'document') return c.url ? `<div class="bg-slate-200"><iframe src="${esc(c.url)}" title="${esc(l.title)}" class="w-full h-[75vh] bg-white"></iframe></div>` : '';
        if (l.type === 'quiz' || l.type === 'assignment') return `<div class="bg-gradient-to-b from-forest-50 to-ivory"><div id="activityHost" class="max-w-[960px] mx-auto px-4 sm:px-8 py-8"></div></div>`;
        if (l.type === 'external') return `<div class="bg-gradient-to-br from-forest to-ink text-white"><div class="max-w-[960px] mx-auto px-4 sm:px-8 py-14 flex flex-col sm:flex-row sm:items-center gap-6">
            <span class="w-16 h-16 rounded-2xl bg-white/10 text-gold flex items-center justify-center text-2xl"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>
            <div class="flex-1"><div class="text-white/60 text-xs uppercase tracking-[0.2em] font-bold">External resource</div><div class="text-lg font-semibold mt-1 break-all">${esc(c.url || 'Link not added yet')}</div></div>
            ${/^https?:\/\//.test(c.url || '') ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-gold" id="extLink">${esc(c.label || 'Open resource')} <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i></a>` : ''}</div></div>`;
        return '';
    }
    function mountStage(l, contents) {
        if (l.type === 'video') {
            const v = contents.find(c => c.kind === 'video'), row = uid && lms.progressRow(uid, l.id);
            player = TOS.video.mount(document.getElementById('videoHost'), v, {
                startAt: row ? row.videoPositionSec : 0,
                onProgress: (pos, dur) => { if (!uid) return; if (lms.saveVideoProgress(uid, l.id, pos, dur)) { ui.toast('Lesson complete'); afterProgress(); renderSidebar(); const b = document.getElementById('completeBtn'); if (b) { b.className = 'btn btn-sm bg-forest-50 text-forest border border-forest-200'; b.innerHTML = '<i class="fa-solid fa-circle-check"></i>Completed'; } } },
                onEnded: () => { const all = lessons(), n = all[all.findIndex(x => x.id === l.id) + 1]; if (n) ui.toast('Up next: ' + n.title); }
            });
        }
        if (l.type === 'quiz') renderQuiz(l);
        if (l.type === 'assignment') renderAssignment(l);
    }
    function afterProgress() {
        if (!uid) return;
        const e = lms.eligibility(uid, course.id);
        if (e.eligible && !lms.certificateOf(uid, course.id)) setTimeout(openCertificate, 600);
    }

    function renderTab(l, res, video) {
        const body = document.getElementById('tabBody');
        if (tab === 'overview') {
            const article = lms.contentsOf(l.id).find(c => c.kind === 'article');
            body.innerHTML = `<div class="prose-tos">${ui.md(l.body) || ''}${article && article.body ? ui.md(article.body) : ''}</div>`
                + (!l.body && !(article && article.body) ? '<p class="text-sm text-slate-500">No additional notes for this lesson.</p>' : '')
                + (l.type === 'download' && res.length ? `<div class="mt-6">${resourceList(res)}</div>` : '');
        }
        if (tab === 'transcript') body.innerHTML = `<div class="rounded-2xl bg-white border border-slate-200/70 p-6 text-sm leading-7 text-slate-700 whitespace-pre-line max-h-[480px] overflow-y-auto thin-scroll">${esc(video.transcript)}</div>`;
        if (tab === 'resources') body.innerHTML = resourceList(res);
        if (tab === 'discussion') renderDiscussion(l, body);
    }
    function resourceList(res) {
        const enrolled = preview || (uid && lms.enrollmentOf(uid, course.id));
        const icon = t => ({ pdf: 'fa-file-pdf text-rose-600', zip: 'fa-file-zipper text-amber-600', image: 'fa-file-image text-sky-600', code: 'fa-file-code text-violet-600', doc: 'fa-file-word text-blue-600', template: 'fa-file-lines text-forest' }[t] || 'fa-file text-slate-500');
        return `<div class="grid sm:grid-cols-2 gap-3">${res.map(r => {
            const ok = r.access === 'public' || enrolled;
            return `<div class="flex items-center gap-4 rounded-2xl bg-white border border-slate-200/70 p-4">
                <span class="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center text-lg"><i class="fa-solid ${icon(r.fileType)}"></i></span>
                <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-ink truncate">${esc(r.name)}</div><div class="text-xs text-slate-500 uppercase">${esc(r.fileType)} · ${ui.fmtBytes(r.sizeBytes)}${r.courseId ? ' · Course resource' : ''}</div></div>
                ${ok && /^(https?:|data:)/.test(r.url) ? `<a href="${esc(r.url)}" ${r.url.startsWith('data:') ? `download="${esc(r.name)}"` : 'target="_blank" rel="noopener noreferrer"'} class="btn btn-outline btn-sm" aria-label="Download ${esc(r.name)}"><i class="fa-solid fa-download"></i></a>` : '<i class="fa-solid fa-lock text-slate-300" title="Enroll to download"></i>'}</div>`;
        }).join('')}</div>`;
    }

    // ---------- Discussion ----------
    function renderDiscussion(l, body) {
        const posts = db.where('discussions', { lessonId: l.id }), roots = posts.filter(p => !p.parentId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const canPost = uid && lms.enrollmentOf(uid, course.id);
        const item = (p, reply) => { const u = db.get('users', p.userId); return `<div class="flex gap-3 ${reply ? 'mt-4' : ''}">
            <span class="w-9 h-9 rounded-full ${u && u.role !== 'student' ? 'bg-gold text-ink' : 'bg-forest text-gold'} text-[11px] font-bold flex items-center justify-center shrink-0">${esc(ui.initials(u ? u.name : (p.authorName || 'TO')))}</span>
            <div class="flex-1 min-w-0"><div class="text-sm"><b class="text-ink">${esc(u ? u.name : (p.authorName || 'Tech Oasis Team'))}</b>${!u || u.role !== 'student' ? ' <span class="pill bg-gold-100 text-gold-700 ml-1">Staff</span>' : ''} <span class="text-xs text-slate-400 ml-1">${ui.timeAgo(p.createdAt)}</span></div>
            <p class="text-sm text-slate-700 mt-1 whitespace-pre-line">${esc(p.body)}</p>
            ${!reply && canPost ? `<button data-reply="${p.id}" class="text-xs font-semibold text-forest mt-2">Reply</button><form data-replyform="${p.id}" class="hidden mt-2 flex gap-2"><input class="field" required maxlength="1000" placeholder="Write a reply"><button class="btn btn-forest btn-sm">Reply</button></form>` : ''}
            ${posts.filter(r => r.parentId === p.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(r => item(r, true)).join('')}</div></div>`; };
        body.innerHTML = (canPost ? `<form id="postForm" class="rounded-2xl bg-white border border-slate-200/70 p-4"><textarea class="field" rows="3" required maxlength="2000" placeholder="Ask a question or share an insight with classmates"></textarea><div class="flex justify-end mt-2"><button class="btn btn-forest btn-sm">Post</button></div></form>` : `<p class="text-sm text-slate-500 bg-white rounded-2xl border p-4">${preview ? 'Discussion is read-only in preview.' : 'Enroll in this program to join the discussion.'}</p>`)
            + `<div class="mt-6 space-y-6">${roots.map(p => `<div class="rounded-2xl bg-white border border-slate-200/70 p-5">${item(p)}</div>`).join('') || '<p class="text-sm text-slate-500">No posts yet. Start the conversation.</p>'}</div>`;
        const pf = document.getElementById('postForm');
        if (pf) pf.onsubmit = e => { e.preventDefault(); db.insert('discussions', { courseId: course.id, lessonId: l.id, userId: uid, parentId: null, body: pf.querySelector('textarea').value.trim() }); renderDiscussion(l, body); };
        ui.$$('[data-reply]', body).forEach(b => b.onclick = () => body.querySelector(`[data-replyform="${b.dataset.reply}"]`).classList.toggle('hidden'));
        ui.$$('[data-replyform]', body).forEach(f => f.onsubmit = e => { e.preventDefault(); db.insert('discussions', { courseId: course.id, lessonId: l.id, userId: uid, parentId: f.dataset.replyform, body: f.querySelector('input').value.trim() }); renderDiscussion(l, body); });
    }

    // ---------- Quiz ----------
    function renderQuiz(l) {
        const host = document.getElementById('activityHost'), quiz = lms.quizOf(l.id);
        if (!quiz) { host.innerHTML = '<p class="text-slate-500">Quiz not set up yet.</p>'; return; }
        const qs = lms.questionsOf(quiz.id), attempts = uid ? lms.attemptsOf(uid, quiz.id) : [], left = uid ? lms.attemptsLeft(uid, quiz) : Infinity;
        const best = uid && lms.bestAttempt(uid, quiz.id), totalPts = qs.reduce((a, q) => a + (+q.points || 1), 0);
        host.innerHTML = `<div class="bg-white rounded-3xl shadow-luxe border border-slate-200/70 p-7 sm:p-9">
            <div class="flex flex-wrap items-start justify-between gap-4"><div><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">Graded quiz</div><h2 class="font-display text-3xl text-ink mt-1">${esc(quiz.title)}</h2></div>
                ${best ? `<div class="text-right"><div class="text-xs text-slate-500">Your best score</div><div class="font-display text-3xl ${best.passed ? 'text-forest-600' : 'text-rose-700'}">${best.percent}%</div></div>` : ''}</div>
            <div class="prose-tos text-sm mt-4">${ui.md(quiz.instructions)}</div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 text-sm">
                ${[['fa-list-ol', ui.plural(qs.length, 'question'), totalPts + ' points'], ['fa-bullseye', quiz.passingScore + '%', 'to pass'], ['fa-stopwatch', quiz.timeLimitMin ? quiz.timeLimitMin + ' min' : 'No limit', 'time'], ['fa-rotate', quiz.maxAttempts ? `${attempts.length}/${quiz.maxAttempts}` : 'Unlimited', 'attempts']]
                    .map(([ic, v, s]) => `<div class="rounded-2xl bg-ivory p-4"><i class="fa-solid ${ic} text-gold-600"></i><div class="font-semibold text-ink mt-2">${v}</div><div class="text-xs text-slate-500">${s}</div></div>`).join('')}</div>
            <div class="mt-7 flex flex-wrap items-center gap-3">
                ${!qs.length ? '<p class="text-sm text-slate-500">No questions yet.</p>' : left > 0 || preview ? `<button id="startQuiz" class="btn btn-forest h-12 px-6">${attempts.length ? 'Retake quiz' : 'Start quiz'} <i class="fa-solid fa-arrow-right text-xs"></i></button>` : '<p class="text-sm text-rose-700"><i class="fa-solid fa-circle-info mr-1"></i>You have used all your attempts. Contact your instructor if you need another.</p>'}
                ${!uid && !preview ? '<p class="text-sm text-slate-500">Enroll to take this quiz.</p>' : ''}
            </div>
            ${attempts.length ? `<div class="mt-8"><div class="text-sm font-semibold text-ink mb-2">Attempt history</div><div class="divide-y border rounded-2xl">${attempts.map((a, i) => `<div class="flex items-center justify-between px-4 py-3 text-sm"><span>Attempt ${attempts.length - i} · <span class="text-slate-500">${ui.fmtDateTime(a.submittedAt)}</span></span><span class="flex items-center gap-3"><b>${a.percent}%</b><span class="pill ${a.passed ? 'pill-passed pill-completed' : 'pill-failed'}">${a.passed ? 'Passed' : 'Not passed'}</span></span></div>`).join('')}</div></div>` : ''}
        </div>`;
        const sb = document.getElementById('startQuiz'); if (sb && (uid || preview)) sb.onclick = () => takeQuiz(l, quiz, qs);
    }
    function takeQuiz(l, quiz, qs) {
        const host = document.getElementById('activityHost');
        const order = quiz.shuffle ? qs.slice().sort(() => Math.random() - .5) : qs;
        quizState = { answers: {}, startedAt: db.now(), timer: null };
        host.innerHTML = `<form id="quizForm" class="space-y-5">
            <div class="sticky top-16 z-10 bg-ivory/95 backdrop-blur py-3 flex items-center justify-between gap-3"><div class="font-display text-xl text-ink">${esc(quiz.title)}</div>
                <div class="flex items-center gap-3"><span id="answeredCount" class="text-sm text-slate-500">0/${order.length} answered</span>${quiz.timeLimitMin ? '<span id="quizTimer" class="pill bg-ink text-white text-sm px-3 py-1"></span>' : ''}</div></div>
            ${order.map((q, i) => `<fieldset class="bg-white rounded-3xl border border-slate-200/70 p-6 shadow-luxe" data-q="${q.id}">
                <legend class="sr-only">Question ${i + 1}</legend>
                <div class="flex justify-between gap-4 text-xs text-slate-500"><span class="font-bold uppercase tracking-[0.15em]">Question ${i + 1}</span><span>${q.points || 1} pt${(q.points || 1) > 1 ? 's' : ''}${q.type === 'multiple' ? ' · Select all that apply' : ''}</span></div>
                <p class="font-semibold text-ink mt-2">${esc(q.prompt)}</p>
                <div class="mt-4 space-y-2">${(q.options || []).map(o => `<label class="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 cursor-pointer hover:border-forest has-[:checked]:border-forest has-[:checked]:bg-forest-50">
                    <input type="${q.type === 'multiple' ? 'checkbox' : 'radio'}" name="${q.id}" value="${o.id}" class="accent-[#0C3B2E] w-4 h-4"><span class="text-sm">${esc(o.text)}</span></label>`).join('')}</div></fieldset>`).join('')}
            <div class="flex justify-end gap-3"><button type="button" id="cancelQuiz" class="btn btn-outline">Cancel</button><button class="btn btn-forest h-12 px-8">Submit answers</button></div></form>`;
        const form = document.getElementById('quizForm');
        const collect = () => { const a = {}; order.forEach(q => a[q.id] = ui.$$(`input[name="${q.id}"]:checked`, form).map(i => i.value)); return a; };
        form.onchange = () => { const a = collect(); document.getElementById('answeredCount').textContent = `${order.filter(q => a[q.id].length).length}/${order.length} answered`; };
        document.getElementById('cancelQuiz').onclick = () => { clearInterval(quizState.timer); renderQuiz(l); };
        const submit = async (auto) => {
            const answers = collect(), blank = order.filter(q => !answers[q.id].length).length;
            if (!auto && blank && !(await ui.confirmBox(`You have ${ui.plural(blank, 'unanswered question')}. Submit anyway?`, { okText: 'Submit' }))) return;
            clearInterval(quizState.timer);
            const result = uid ? lms.submitQuiz(uid, quiz.id, answers, quizState.startedAt) : lms.gradeQuiz(quiz.id, answers);
            showQuizResult(l, quiz, order, answers, result);
        };
        form.onsubmit = e => { e.preventDefault(); submit(false); };
        if (quiz.timeLimitMin) {
            const end = Date.now() + quiz.timeLimitMin * 60000, el = document.getElementById('quizTimer');
            const tick = () => { const s = Math.max(0, (end - Date.now()) / 1000); el.innerHTML = `<i class="fa-solid fa-stopwatch mr-1"></i>${ui.fmtSecs(s)}`; if (s <= 0) { ui.toast('Time is up. Your answers were submitted.'); submit(true); } };
            tick(); quizState.timer = setInterval(tick, 1000);
        }
    }
    function showQuizResult(l, quiz, order, answers, result) {
        const host = document.getElementById('activityHost');
        host.innerHTML = `<div class="bg-white rounded-3xl shadow-luxe border border-slate-200/70 p-7 sm:p-9 text-center">
            <span class="w-20 h-20 mx-auto rounded-full ${result.passed ? 'bg-forest text-gold' : 'bg-rose-50 text-rose-700'} flex items-center justify-center text-3xl"><i class="fa-solid ${result.passed ? 'fa-trophy' : 'fa-rotate-right'}"></i></span>
            <div class="font-display text-5xl text-ink mt-5">${result.percent}%</div>
            <p class="text-slate-600 mt-1">${result.score} of ${result.max} points · ${quiz.passingScore}% needed to pass</p>
            <p class="font-semibold mt-3 ${result.passed ? 'text-forest-600' : 'text-rose-700'}">${result.passed ? 'Passed! This lesson is now complete.' : 'Not quite. Review the explanations and try again.'}</p>
            <div class="flex flex-wrap justify-center gap-3 mt-6"><button id="quizBack" class="btn btn-outline">Back to quiz overview</button>${result.passed ? '<button id="quizNext" class="btn btn-gold">Continue <i class="fa-solid fa-arrow-right text-xs"></i></button>' : ''}</div></div>
            <div class="mt-6 space-y-4">${order.map((q, i) => { const r = result.results.find(x => x.questionId === q.id); return `<div class="bg-white rounded-3xl border ${r.ok ? 'border-forest-200' : 'border-rose-200'} p-6 text-left">
                <div class="flex items-center gap-2 text-sm font-semibold ${r.ok ? 'text-forest-600' : 'text-rose-700'}"><i class="fa-solid ${r.ok ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>Question ${i + 1} · ${r.ok ? 'Correct' : 'Incorrect'}</div>
                <p class="font-semibold text-ink mt-2">${esc(q.prompt)}</p>
                <ul class="mt-3 space-y-1.5 text-sm">${q.options.map(o => { const right = (q.correct || []).includes(o.id), picked = (answers[q.id] || []).includes(o.id); return `<li class="flex items-center gap-2 ${right ? 'text-forest-600 font-semibold' : picked ? 'text-rose-700' : 'text-slate-600'}"><i class="fa-solid ${right ? 'fa-check' : picked ? 'fa-xmark' : 'fa-circle text-[5px] text-slate-300'} w-4"></i>${esc(o.text)}${picked ? ' <span class="text-xs font-normal text-slate-400">(your answer)</span>' : ''}</li>`; }).join('')}</ul>
                ${q.explanation ? `<p class="text-sm text-slate-600 bg-ivory rounded-xl p-3 mt-3"><i class="fa-solid fa-lightbulb text-gold-600 mr-1"></i>${esc(q.explanation)}</p>` : ''}</div>`; }).join('')}</div>`;
        document.getElementById('quizBack').onclick = () => renderQuiz(l);
        const nb = document.getElementById('quizNext'); if (nb) nb.onclick = () => { const all = lessons(), n = all[all.findIndex(x => x.id === l.id) + 1]; n ? openLesson(n.id) : renderLesson(); };
        renderSidebar(); if (result.passed) afterProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ---------- Assignment ----------
    function renderAssignment(l) {
        const host = document.getElementById('activityHost'), a = lms.assignmentOf(l.id);
        if (!a) { host.innerHTML = '<p class="text-slate-500">Assignment not set up yet.</p>'; return; }
        const sub = uid && lms.submissionOf(uid, a.id), due = uid ? lms.assignmentDue(a, uid) : a.dueDate;
        const rubricTotal = (a.rubric || []).reduce((s, r) => s + (+r.points || 0), 0);
        host.innerHTML = `<div class="bg-white rounded-3xl shadow-luxe border border-slate-200/70 p-7 sm:p-9">
            <div class="flex flex-wrap items-start justify-between gap-4"><div><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">Assignment</div><h2 class="font-display text-3xl text-ink mt-1">${esc(a.title)}</h2></div>
                <div class="flex gap-3 text-sm"><div class="rounded-2xl bg-ivory px-4 py-3"><div class="text-xs text-slate-500">Due</div><div class="font-semibold text-ink">${due ? ui.fmtDate(due) : a.dueDays ? a.dueDays + ' days after enrolling' : 'No due date'}</div></div><div class="rounded-2xl bg-ivory px-4 py-3"><div class="text-xs text-slate-500">Max score</div><div class="font-semibold text-ink">${a.maxScore}</div></div></div></div>
            <div class="prose-tos text-[15px] mt-5">${ui.md(a.instructions) || '<p>Instructions coming soon.</p>'}</div>
            ${(a.rubric || []).length ? `<div class="mt-6"><div class="text-sm font-semibold text-ink mb-2">Grading rubric</div><div class="overflow-x-auto rounded-2xl border"><table class="w-full text-sm"><thead class="bg-ivory text-left text-xs text-slate-500 uppercase"><tr><th class="p-3">Criterion</th><th class="p-3 text-right">Points</th>${sub && sub.status === 'graded' ? '<th class="p-3 text-right">Your score</th>' : ''}</tr></thead><tbody class="divide-y">${a.rubric.map((r, i) => `<tr><td class="p-3"><div class="font-medium text-ink">${esc(r.criterion)}</div>${r.description ? `<div class="text-xs text-slate-500">${esc(r.description)}</div>` : ''}</td><td class="p-3 text-right">${r.points}</td>${sub && sub.status === 'graded' ? `<td class="p-3 text-right font-semibold">${sub.rubricScores && sub.rubricScores[i] != null ? sub.rubricScores[i] : '—'}</td>` : ''}</tr>`).join('')}<tr class="bg-ivory/60 font-semibold"><td class="p-3">Total</td><td class="p-3 text-right">${rubricTotal}</td>${sub && sub.status === 'graded' ? `<td class="p-3 text-right">${sub.score}</td>` : ''}</tr></tbody></table></div></div>` : ''}
            <div id="subArea" class="mt-8"></div></div>`;
        const area = document.getElementById('subArea');
        if (sub) {
            area.innerHTML = `<div class="rounded-2xl border ${sub.status === 'graded' ? 'border-forest-200 bg-forest-50/50' : 'border-gold-200 bg-gold-50'} p-5">
                <div class="flex flex-wrap items-center justify-between gap-3"><div class="font-semibold text-ink"><i class="fa-solid ${sub.status === 'graded' ? 'fa-circle-check text-forest-400' : 'fa-paper-plane text-gold-600'} mr-2"></i>${sub.status === 'graded' ? 'Graded' : 'Submitted'} ${ui.fmtDateTime(sub.submittedAt)}</div><span class="pill pill-${sub.status}">${sub.status}</span></div>
                ${sub.status === 'graded' ? `<div class="font-display text-4xl text-ink mt-4">${sub.score}<span class="text-lg text-slate-400">/${a.maxScore}</span></div>${sub.feedback ? `<div class="mt-3 text-sm text-slate-700 bg-white rounded-xl p-4 border"><div class="text-xs font-bold uppercase tracking-[0.15em] text-gold-600 mb-1">Instructor feedback</div>${esc(sub.feedback)}</div>` : ''}` : '<p class="text-sm text-slate-600 mt-2">Your instructor will review your work and leave a score and feedback here.</p>'}
                ${sub.text ? `<div class="mt-4 text-sm"><div class="text-xs text-slate-500 mb-1">Your answer</div><div class="bg-white rounded-xl border p-3 whitespace-pre-line break-words">${esc(sub.text)}</div></div>` : ''}
                ${(sub.files || []).length ? `<div class="mt-3 flex flex-wrap gap-2">${sub.files.map(f => `<span class="pill bg-white border text-slate-600"><i class="fa-solid fa-paperclip"></i>${esc(f.name)} · ${ui.fmtBytes(f.size)}</span>`).join('')}</div>` : ''}
                ${sub.status !== 'graded' ? '<button id="resubmit" class="btn btn-outline btn-sm mt-4">Edit submission</button>' : ''}</div>`;
            const rb = document.getElementById('resubmit'); if (rb) rb.onclick = () => submissionForm(area, a, l, sub);
        } else if (uid) submissionForm(area, a, l);
        else area.innerHTML = `<p class="text-sm text-slate-500">${preview ? 'Students submit their work here (disabled in preview).' : 'Enroll to submit this assignment.'}</p>`;
    }
    function submissionForm(area, a, l, sub) {
        area.innerHTML = `<form id="subForm" class="space-y-4"><div class="text-sm font-semibold text-ink">Your submission</div>
            ${a.allowText !== false ? `<div><label class="field-label" for="subText">Answer, links or notes</label><textarea id="subText" class="field" rows="5" maxlength="10000" placeholder="Paste links to your work and describe your approach">${esc(sub ? sub.text : '')}</textarea></div>` : ''}
            ${a.allowFile ? `<div><label class="field-label" for="subFile">Attach files</label><input id="subFile" type="file" multiple class="field text-sm"><p class="field-hint">Up to 3 files. In this demo files over 1 MB are recorded by name only; share a link for large projects.</p></div>` : ''}
            <button class="btn btn-forest h-12 px-6"><i class="fa-solid fa-paper-plane"></i>Submit assignment</button></form>`;
        document.getElementById('subForm').onsubmit = async e => {
            e.preventDefault();
            const text = (document.getElementById('subText') || {}).value || '', input = document.getElementById('subFile');
            const files = [];
            for (const f of Array.from((input && input.files) || []).slice(0, 3)) files.push({ name: f.name, size: f.size, type: f.type, url: f.size <= 1048576 ? await ui.readFile(f) : '' });
            if (!text.trim() && !files.length && !(sub && sub.files && sub.files.length)) return ui.toast('Add an answer or attach a file first.', 'error');
            lms.submitAssignment(uid, a.id, { text, files: files.length ? files : (sub ? sub.files : []) });
            ui.toast('Submitted. Your instructor has been notified.'); afterProgress();
            renderSidebar(); renderLesson();
        };
    }

    // ---------- Certificate ----------
    function openCertificate() {
        if (!uid) return;
        const cert = lms.certificateOf(uid, course.id);
        if (cert) return location.href = 'verify.html?code=' + encodeURIComponent(cert.code);
        const e = lms.eligibility(uid, course.id);
        const m = ui.modal({ title: e.eligible ? 'Congratulations!' : 'Your certificate', size: 'max-w-md', body: `
            ${e.eligible ? `<div class="text-center"><span class="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-white flex items-center justify-center text-3xl shadow-lift"><i class="fa-solid fa-award"></i></span><p class="text-slate-600 mt-4">You've met every requirement for <b class="text-ink">${esc(course.title)}</b>. Claim your verified certificate now.</p></div>` : `<p class="text-sm text-slate-600">${e.enabled ? 'Complete these requirements to earn your certificate:' : 'This program does not issue certificates.'}</p>`}
            <ul class="mt-5 space-y-3">${e.checks.map(c => `<li class="flex items-start gap-3 text-sm"><i class="fa-solid ${c.ok ? 'fa-circle-check text-forest-400' : 'fa-circle text-slate-200'} mt-0.5"></i><span><span class="${c.ok ? 'text-ink' : 'text-slate-600'}">${esc(c.label)}</span><span class="block text-xs text-slate-400">${esc(c.detail)}</span></span></li>`).join('')}</ul>
            ${e.eligible ? '<button id="claimBtn" class="btn btn-gold w-full h-12 mt-6"><i class="fa-solid fa-award"></i>Claim my certificate</button>' : ''}` });
        const cb = m.el.querySelector('#claimBtn');
        if (cb) cb.onclick = () => { const c = lms.issueCertificate(uid, course.id); if (c) location.href = 'verify.html?code=' + encodeURIComponent(c.code) + '&new=1'; };
    }

    // ---------- Boot ----------
    if (!preview && me && me.role === 'student' && !lms.enrollmentOf(me.id, course.id) && !lessonId) { location.replace('course.html?c=' + encodeURIComponent(course.slug)); return; }
    renderSidebar(); renderLesson();
    if (ui.qs('claim') === '1') openCertificate();
    window.addEventListener('beforeunload', () => { if (player) player.destroy(); });
})();
