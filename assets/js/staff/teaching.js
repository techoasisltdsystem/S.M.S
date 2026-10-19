// Staff teaching tools: courses, lesson management, assignment & quiz builders, grading, quiz results.
(function () {
    // ---------------- My courses ----------------
    S.route('/staff/courses', { title: 'My Courses', nav: 'courses', live: true, skeleton: 'list', render: async el => {
        if (!has(S.me, 'view_courses')) { el.innerHTML = S.pageHeader('My Courses') + SP.permNote('view_courses'); return; }
        const list = await sapi.courses();
        el.innerHTML = S.pageHeader('My Courses', 'Courses the school has assigned to you.') + (list.length ? `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">${list.map(c => `<a href="/staff/courses/${c.id}" class="s-card s-card-hover overflow-hidden flex flex-col">
            <div class="relative aspect-[16/9] bg-slate-100"><img src="${esc(c.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover"><span class="absolute top-3 left-3">${S.statusChip(c.status)}</span></div>
            <div class="p-4 flex-1 flex flex-col"><div class="text-xs s-muted">${esc(c.category)}</div><h3 class="font-semibold text-slate-900">${esc(c.title)}</h3>
            <div class="grid grid-cols-3 gap-2 mt-4 text-center">${[['Students', c.students], ['Lessons', c.lessons], ['Completed', c.completed]].map(([l, v]) => `<div class="rounded-lg bg-[#F7F8FA] py-2"><div class="text-lg font-bold text-slate-900">${v}</div><div class="text-[11px] s-muted">${l}</div></div>`).join('')}</div>
            <div class="mt-auto pt-4"><div class="flex justify-between text-xs mb-1.5"><span class="s-muted">Average progress</span><b>${c.avgProgress}%</b></div>${S.bar(c.avgProgress)}</div></div></a>`).join('')}</div>`
            : S.empty('fa-book-open', 'No courses assigned yet', 'The school administration assigns courses to staff. They will appear here.'));
    } });

    // ---------------- Course workspace ----------------
    S.route('/staff/courses/:id', { title: 'Course', nav: 'courses', live: true, render: async (el, { id }) => {
        const c = await sapi.course(id);
        S.setTitle(c.title);
        const canLessons = c.can.manage_lessons, canA = c.can.create_assignments, canQ = c.can.create_quizzes;
        el.innerHTML = `<a href="/staff/courses" class="text-sm s-muted hover:text-slate-900"><i class="fa-solid fa-arrow-left mr-2"></i>My Courses</a>
            <div class="s-card p-6 mt-4 flex flex-col md:flex-row md:items-center gap-5"><img src="${esc(c.thumbnail)}" alt="" class="w-full md:w-40 aspect-video rounded-xl object-cover bg-slate-100">
                <div class="flex-1 min-w-0"><div class="flex items-center gap-2">${S.statusChip(c.status)}</div><h1 class="text-2xl font-bold text-slate-900 mt-1">${esc(c.title)}</h1><p class="text-sm s-muted mt-1">${esc(c.shortDescription)}</p></div>
                <a href="/course.html?c=${encodeURIComponent(c.slug)}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i>Public page</a></div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">${[['Students', c.stats.students, 'fa-user-graduate'], ['Active (14 days)', c.stats.active, 'fa-bolt'], ['Average progress', c.stats.avgProgress + '%', 'fa-chart-simple'], ['Completion rate', c.stats.completionRate + '%', 'fa-flag-checkered']].map(([l, v, ic]) => `<div class="s-card p-4"><div class="flex items-center justify-between text-sm s-muted">${l}<i class="fa-solid ${ic}"></i></div><div class="text-2xl font-bold text-slate-900 mt-1">${v}</div></div>`).join('')}</div>
            ${!canLessons && !canA && !canQ ? `<div class="mt-5">${SP.permNote('manage_lessons')}</div>` : ''}
            <div class="space-y-4 mt-5">${c.sections.map((s, si) => `<section class="s-card overflow-hidden">
                <div class="flex flex-wrap items-center gap-3 px-5 py-4 bg-[#F7F8FA] border-b border-[#EEF0F3]"><div class="flex-1 min-w-0"><div class="text-[11px] font-bold uppercase tracking-[0.15em] s-muted">Section ${si + 1}</div><div class="font-semibold text-slate-900 truncate">${esc(s.title)}</div></div>${S.statusChip(s.status)}
                    <div class="flex flex-wrap gap-2">${canLessons ? `<button data-add-lesson="${s.id}" class="btn btn-outline btn-sm"><i class="fa-solid fa-plus"></i>Lesson</button>` : ''}${canA ? `<button data-add-asg="${s.id}" class="btn btn-outline btn-sm"><i class="fa-solid fa-file-pen"></i>Assignment</button>` : ''}${canQ ? `<button data-add-quiz="${s.id}" class="btn btn-outline btn-sm"><i class="fa-solid fa-circle-question"></i>Quiz</button>` : ''}</div></div>
                <ul class="divide-y divide-[#F1F3F5]">${s.lessons.map((l, li) => `<li class="flex items-center gap-3 px-5 py-3"><span class="w-8 h-8 rounded-lg bg-forest-50 text-forest flex items-center justify-center text-xs shrink-0"><i class="fa-solid ${S.LESSON_ICON(l.type)}"></i></span>
                    <div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-900 truncate">${li + 1}. ${esc(l.title)}</div><div class="text-xs s-muted">${(ui.LESSON_TYPES[l.type] || {}).label || ''}${l.durationMin ? ' · ' + ui.fmtDuration(l.durationMin) : ''} · ${l.completionRate}% of students completed</div></div>
                    <div class="hidden sm:block w-24">${S.bar(l.completionRate)}</div>${S.statusChip(l.status)}
                    ${canLessons && !['quiz', 'assignment'].includes(l.type) ? `<button data-edit="${l.id}" class="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Edit lesson"><i class="fa-solid fa-pen text-xs"></i></button>` : ''}</li>`).join('') || '<li class="px-5 py-4 text-sm s-muted">No lessons yet.</li>'}</ul></section>`).join('') || S.empty('fa-layer-group', 'No sections yet', 'The administration creates course sections. You can then add lessons to them.')}</div>`;
        const reload = () => S.dispatchQuiet();
        el.querySelectorAll('[data-add-lesson]').forEach(b => b.onclick = () => lessonModal(null, b.dataset.addLesson, reload));
        el.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => lessonModal(await sapi.lesson(b.dataset.edit), null, reload));
        el.querySelectorAll('[data-add-asg]').forEach(b => b.onclick = () => assignmentModal(b.dataset.addAsg, reload));
        el.querySelectorAll('[data-add-quiz]').forEach(b => b.onclick = () => quizModal(b.dataset.addQuiz, reload));
    } });

    function lessonModal(l, sectionId, done) {
        const type = l ? l.type : 'video';
        const m = ui.modal({ title: l ? 'Edit lesson' : 'Add lesson', size: 'max-w-xl', body: `<form class="space-y-4">
            <div class="grid sm:grid-cols-[1fr_160px] gap-3"><div><label class="field-label" for="lt">Title</label><input id="lt" required maxlength="140" class="field" value="${esc(l ? l.title : '')}"></div>
                <div><label class="field-label" for="ly">Type</label><select id="ly" class="field" ${l ? 'disabled' : ''}>${[['video', 'Video'], ['article', 'Article'], ['document', 'PDF / document'], ['external', 'External link']].map(([v, n]) => `<option value="${v}" ${v === type ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
            <div><label class="field-label" for="ls">Short description</label><input id="ls" maxlength="300" class="field" value="${esc(l ? l.summary : '')}"></div>
            <div data-for="video"><label class="field-label" for="lv">Video link</label><input id="lv" type="url" class="field" placeholder="https://youtu.be/… or https://vimeo.com/…" value="${esc(l ? l.videoUrl : '')}"><p class="field-hint">YouTube, Vimeo, MP4 and other hosts are detected automatically.</p></div>
            <div data-for="article"><label class="field-label" for="la">Article</label><textarea id="la" rows="8" class="field" placeholder="Markdown supported">${esc(l ? l.article : '')}</textarea></div>
            <div data-for="document"><label class="field-label" for="ld">Document link</label><input id="ld" type="url" class="field" placeholder="https://…/notes.pdf" value="${esc(l ? l.documentUrl : '')}"></div>
            <div data-for="external"><label class="field-label" for="le">External link</label><input id="le" type="url" class="field" placeholder="https://…" value="${esc(l ? l.externalUrl : '')}"></div>
            <div class="grid sm:grid-cols-2 gap-3"><div><label class="field-label" for="lm">Duration (minutes)</label><input id="lm" type="number" min="1" class="field" value="${l ? l.durationMin : 10}"></div>
                <label class="flex items-center gap-3 pt-6 cursor-pointer"><span class="switch"><input type="checkbox" id="lp" ${!l || l.status === 'published' ? 'checked' : ''}><span></span></span><span class="text-sm font-medium">Published</span></label></div>
            <p class="text-xs s-muted">Publishing a new lesson notifies every student in the course.</p>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">${l ? 'Save lesson' : 'Add lesson'}</button></div></form>` });
        const g = id => m.el.querySelector(id);
        const sync = () => m.el.querySelectorAll('[data-for]').forEach(x => x.classList.toggle('hidden', x.dataset.for !== g('#ly').value));
        g('#ly').onchange = sync; sync();
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = async e => {
            e.preventDefault();
            const d = { title: g('#lt').value, summary: g('#ls').value, durationMin: g('#lm').value, videoUrl: g('#lv').value, article: g('#la').value, documentUrl: g('#ld').value, externalUrl: g('#le').value };
            try {
                if (l) await sapi.updateLesson(l.id, Object.assign(d, { status: g('#lp').checked ? 'published' : 'draft' }));
                else await sapi.addLesson(sectionId, Object.assign(d, { type: g('#ly').value, publish: g('#lp').checked }));
                m.close(); ui.toast(l ? 'Lesson saved' : 'Lesson added'); done();
            } catch (x) { ui.toast(x.message, 'error'); }
        };
    }

    function assignmentModal(sectionId, done) {
        let rubric = [{ criterion: 'Quality of work', description: '', points: 60 }, { criterion: 'Completeness', description: '', points: 40 }];
        const m = ui.modal({ title: 'New assignment', size: 'max-w-2xl', body: `<form class="space-y-4">
            <div><label class="field-label" for="at">Title</label><input id="at" required maxlength="140" class="field"></div>
            <div><label class="field-label" for="ai">Instructions</label><textarea id="ai" required rows="5" class="field" placeholder="What should students do and submit? Markdown supported."></textarea></div>
            <div class="grid sm:grid-cols-3 gap-3"><div><label class="field-label" for="am">Max score</label><input id="am" type="number" min="1" value="100" class="field"></div><div><label class="field-label" for="ad">Due (days after enrolling)</label><input id="ad" type="number" min="1" value="7" class="field"></div><div><label class="field-label" for="af">Or fixed due date</label><input id="af" type="date" class="field"></div></div>
            <div class="flex flex-wrap gap-6"><label class="flex items-center gap-3 cursor-pointer"><span class="switch"><input type="checkbox" id="atx" checked><span></span></span><span class="text-sm">Text answer</span></label><label class="flex items-center gap-3 cursor-pointer"><span class="switch"><input type="checkbox" id="afl" checked><span></span></span><span class="text-sm">File upload</span></label><label class="flex items-center gap-3 cursor-pointer"><span class="switch"><input type="checkbox" id="apb"><span></span></span><span class="text-sm">Publish now</span></label></div>
            <div><div class="flex items-center justify-between"><span class="field-label mb-0">Rubric</span><button type="button" id="ar" class="text-xs font-semibold text-forest-600"><i class="fa-solid fa-plus mr-1"></i>Add criterion</button></div><div id="rb" class="space-y-2 mt-2"></div></div>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Create assignment</button></div></form>` });
        const drawR = () => { m.el.querySelector('#rb').innerHTML = rubric.map((r, i) => `<div class="grid grid-cols-[1fr_90px_auto] gap-2"><input data-r="${i}" data-k="criterion" value="${esc(r.criterion)}" class="field" placeholder="Criterion" aria-label="Criterion"><input data-r="${i}" data-k="points" type="number" min="0" value="${r.points}" class="field" aria-label="Points"><button type="button" data-rx="${i}" class="w-9 text-rose-600" aria-label="Remove criterion"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
            m.el.querySelectorAll('[data-r]').forEach(x => x.oninput = () => rubric[x.dataset.r][x.dataset.k] = x.value);
            m.el.querySelectorAll('[data-rx]').forEach(x => x.onclick = () => { rubric.splice(+x.dataset.rx, 1); drawR(); }); };
        drawR(); m.el.querySelector('#ar').onclick = () => { rubric.push({ criterion: '', description: '', points: 10 }); drawR(); };
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = async e => { e.preventDefault(); const g = id => m.el.querySelector(id);
            try { await sapi.createAssignment(sectionId, { title: g('#at').value, instructions: g('#ai').value, maxScore: g('#am').value, dueDays: g('#ad').value, dueDate: g('#af').value, allowText: g('#atx').checked, allowFile: g('#afl').checked, publish: g('#apb').checked, rubric }); m.close(); ui.toast('Assignment created'); done(); }
            catch (x) { ui.toast(x.message, 'error'); } };
    }

    function quizModal(sectionId, done) {
        const blank = () => ({ type: 'single', prompt: '', options: [{ id: 'o1', text: '' }, { id: 'o2', text: '' }, { id: 'o3', text: '' }, { id: 'o4', text: '' }], correct: [], explanation: '', points: 1 });
        const qs = [blank()];
        const m = ui.modal({ title: 'New quiz', size: 'max-w-3xl', body: `<form class="space-y-4">
            <div class="grid sm:grid-cols-[1fr_120px_120px_120px] gap-3"><div><label class="field-label" for="qt">Title</label><input id="qt" required class="field"></div><div><label class="field-label" for="qp">Pass mark %</label><input id="qp" type="number" min="0" max="100" value="70" class="field"></div><div><label class="field-label" for="ql">Time (min)</label><input id="ql" type="number" min="0" value="0" class="field"></div><div><label class="field-label" for="qa">Attempts</label><input id="qa" type="number" min="0" value="3" class="field"></div></div>
            <p class="field-hint -mt-2">Time 0 = no limit · Attempts 0 = unlimited</p>
            <div id="qq" class="space-y-4"></div>
            <button type="button" id="qadd" class="btn btn-outline btn-sm"><i class="fa-solid fa-plus"></i>Add question</button>
            <label class="flex items-center gap-3 cursor-pointer"><span class="switch"><input type="checkbox" id="qpub"><span></span></span><span class="text-sm">Publish now (students are notified)</span></label>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Create quiz</button></div></form>` });
        const draw = () => {
            m.el.querySelector('#qq').innerHTML = qs.map((q, i) => `<div class="rounded-xl border border-[#E6E8EC] p-4 space-y-3"><div class="flex items-center gap-3"><b class="text-sm">Q${i + 1}</b><select data-qt="${i}" class="field h-9 w-auto py-0" aria-label="Question type"><option value="single" ${q.type === 'single' ? 'selected' : ''}>One answer</option><option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>Multiple answers</option><option value="truefalse" ${q.type === 'truefalse' ? 'selected' : ''}>True / False</option></select>${qs.length > 1 ? `<button type="button" data-qx="${i}" class="ml-auto text-rose-600 text-sm" aria-label="Remove question"><i class="fa-solid fa-trash"></i></button>` : ''}</div>
                <input data-qprompt="${i}" class="field" placeholder="Question" value="${esc(q.prompt)}" aria-label="Question ${i + 1}">
                <div class="space-y-2">${q.options.map(o => `<div class="flex items-center gap-2"><input type="${q.type === 'multiple' ? 'checkbox' : 'radio'}" name="c${i}" data-qc="${i}" value="${o.id}" ${q.correct.includes(o.id) ? 'checked' : ''} class="w-4 h-4 accent-[#0C3B2E]" aria-label="Correct answer"><input data-qo="${i}:${o.id}" class="field h-9" placeholder="Answer" value="${esc(o.text)}" ${q.type === 'truefalse' ? 'readonly' : ''}></div>`).join('')}</div>
                <input data-qe="${i}" class="field h-9" placeholder="Explanation shown after submitting (optional)" value="${esc(q.explanation)}"></div>`).join('');
            m.el.querySelectorAll('[data-qt]').forEach(s => s.onchange = () => { const q = qs[+s.dataset.qt]; q.type = s.value; if (q.type === 'truefalse') { q.options = [{ id: 'o1', text: 'True' }, { id: 'o2', text: 'False' }]; q.correct = []; } else if (q.options.length < 3) q.options = [{ id: 'o1', text: '' }, { id: 'o2', text: '' }, { id: 'o3', text: '' }, { id: 'o4', text: '' }]; draw(); });
            m.el.querySelectorAll('[data-qprompt]').forEach(x => x.oninput = () => qs[+x.dataset.qprompt].prompt = x.value);
            m.el.querySelectorAll('[data-qe]').forEach(x => x.oninput = () => qs[+x.dataset.qe].explanation = x.value);
            m.el.querySelectorAll('[data-qo]').forEach(x => x.oninput = () => { const [i, id] = x.dataset.qo.split(':'); qs[+i].options.find(o => o.id === id).text = x.value; });
            m.el.querySelectorAll('[data-qc]').forEach(x => x.onchange = () => { const i = +x.dataset.qc; qs[i].correct = [...m.el.querySelectorAll(`[data-qc="${i}"]:checked`)].map(c => c.value); });
            m.el.querySelectorAll('[data-qx]').forEach(x => x.onclick = () => { qs.splice(+x.dataset.qx, 1); draw(); });
        };
        draw();
        m.el.querySelector('#qadd').onclick = () => { qs.push(blank()); draw(); };
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = async e => { e.preventDefault(); const g = id => m.el.querySelector(id).value;
            try { await sapi.createQuiz(sectionId, { title: g('#qt'), passingScore: g('#qp'), timeLimitMin: g('#ql'), maxAttempts: g('#qa'), publish: m.el.querySelector('#qpub').checked, questions: qs }); m.close(); ui.toast('Quiz created'); done(); }
            catch (x) { ui.toast(x.message, 'error'); } };
    }

    // ---------------- Grading ----------------
    S.route('/staff/grading', { title: 'Grading', nav: 'grading', live: true, skeleton: 'list', render: async el => {
        if (!has(S.me, 'grade_students')) { el.innerHTML = S.pageHeader('Grading') + SP.permNote('grade_students'); return; }
        const all = await sapi.submissions();
        let tab = 'pending';
        const draw = () => {
            const list = all.filter(s => tab === 'all' || (tab === 'pending' ? s.status !== 'graded' : s.status === 'graded'));
            el.querySelector('#gl').innerHTML = list.length ? `<div class="s-card divide-y divide-[#F1F3F5]">${list.map(s => `<div class="flex flex-wrap items-center gap-4 p-4"><div class="flex-1 min-w-[200px]">${SP.personRow({ name: s.student }, esc(s.title) + ' · ' + esc(s.course))}</div><span class="text-xs s-muted">${ui.timeAgo(s.submittedAt)}</span>${S.statusChip(s.status)}${s.status === 'graded' ? `<b class="text-sm w-16 text-right">${s.score}/${s.maxScore}</b>` : ''}<button data-g="${s.id}" class="btn ${s.status === 'graded' ? 'btn-outline' : 'btn-forest'} btn-sm">${s.status === 'graded' ? 'Review' : 'Grade'}</button></div>`).join('')}</div>`
                : S.empty('fa-mug-hot', tab === 'pending' ? 'Nothing to grade' : 'No graded work yet', tab === 'pending' ? "You're all caught up." : '');
            el.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
            el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => gradeModal(b.dataset.g));
        };
        el.innerHTML = S.pageHeader('Grading', 'Submissions from your courses.') + `<div class="mb-5">${S.tabs([['pending', 'Needs grading', all.filter(s => s.status !== 'graded').length], ['graded', 'Graded', all.filter(s => s.status === 'graded').length], ['all', 'All', all.length]], tab)}</div><div id="gl"></div>`;
        el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
        draw();
        if (S.q('s')) { gradeModal(S.q('s')); history.replaceState({}, '', '/staff/grading'); }
    } });
    async function gradeModal(id) {
        let s; try { s = await sapi.submission(id); } catch (x) { return ui.toast(x.message, 'error'); }
        const total = s.rubric.reduce((a, r) => a + (+r.points || 0), 0);
        const m = ui.modal({ title: 'Grade: ' + s.title, size: 'max-w-3xl', body: `<div class="grid lg:grid-cols-2 gap-6">
            <div><div class="text-sm"><b>${esc(s.student)}</b> · ${esc(s.course)}</div><div class="text-xs s-muted">Submitted ${ui.fmtDateTime(s.submittedAt)}${s.late ? ' · <span class="text-amber-700 font-semibold">late</span>' : ''}</div>
                ${s.text ? `<div class="mt-3 rounded-xl bg-[#F7F8FA] border border-[#EEF0F3] p-4 text-sm whitespace-pre-line break-words max-h-72 overflow-y-auto thin-scroll">${esc(s.text)}</div>` : ''}
                ${s.files.length ? `<div class="mt-3 space-y-2">${s.files.map(f => `<div class="flex items-center gap-2 text-sm"><i class="fa-solid fa-paperclip text-slate-400"></i><span class="flex-1 truncate">${esc(f.name)}</span>${f.url ? `<a href="${esc(f.url)}" ${String(f.url).startsWith('data:') ? `download="${esc(f.name)}"` : 'target="_blank" rel="noopener noreferrer"'} class="btn btn-outline btn-sm">Open</a>` : ''}</div>`).join('')}</div>` : ''}
                <details class="mt-4"><summary class="text-xs font-semibold text-forest-600 cursor-pointer">Assignment instructions</summary><div class="prose-tos text-sm mt-2">${ui.md(s.instructions)}</div></details></div>
            <form class="space-y-4">${s.rubric.length ? `<div><div class="field-label">Rubric</div><div class="space-y-2">${s.rubric.map((r, i) => `<div class="flex items-center gap-3"><span class="flex-1 text-sm">${esc(r.criterion)}</span><input type="number" min="0" max="${r.points}" data-rs="${i}" value="${s.rubricScores[i] != null ? s.rubricScores[i] : ''}" class="field w-20" aria-label="${esc(r.criterion)} score"><span class="text-xs s-muted w-10">/ ${r.points}</span></div>`).join('')}</div></div>` : ''}
                <div><label class="field-label" for="gs">Score (out of ${s.maxScore})</label><input id="gs" type="number" min="0" max="${s.maxScore}" required class="field" value="${s.score != null ? s.score : ''}"></div>
                <div><label class="field-label" for="gf">Feedback for the student</label><textarea id="gf" rows="5" class="field">${esc(s.feedback || '')}</textarea></div>
                <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm"><i class="fa-solid fa-check"></i>Save grade</button></div></form></div>` });
        const sc = m.el.querySelector('#gs');
        m.el.querySelectorAll('[data-rs]').forEach(x => x.oninput = () => { const sum = [...m.el.querySelectorAll('[data-rs]')].reduce((a, y) => a + (+y.value || 0), 0); sc.value = total ? Math.round(sum / total * s.maxScore) : sum; });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = async e => { e.preventDefault(); const rs = {}; m.el.querySelectorAll('[data-rs]').forEach(x => { if (x.value !== '') rs[x.dataset.rs] = +x.value; });
            try { await sapi.grade(id, { score: sc.value, feedback: m.el.querySelector('#gf').value, rubricScores: rs }); m.close(); ui.toast('Grade saved. The student has been notified.'); S.dispatchQuiet(); S.refreshCounts(); } catch (x) { ui.toast(x.message, 'error'); } };
    }

    // ---------------- Quiz results ----------------
    S.route('/staff/quizzes', { title: 'Quiz Results', nav: 'quizzes', live: true, skeleton: 'list', render: async el => {
        if (!has(S.me, 'view_courses')) { el.innerHTML = S.pageHeader('Quiz Results') + SP.permNote('view_courses'); return; }
        const list = await sapi.quizResults();
        el.innerHTML = S.pageHeader('Quiz Results', 'How students are performing on quizzes in your courses.') + (list.length ? `<div class="s-card overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-[11px] uppercase tracking-wider s-muted border-b border-[#EEF0F3]"><th class="p-4">Quiz</th><th class="p-4">Questions</th><th class="p-4">Attempts</th><th class="p-4">Average</th><th class="p-4">Pass rate</th><th class="p-4">Status</th></tr></thead>
            <tbody class="divide-y divide-[#F1F3F5]">${list.map(q => `<tr><td class="p-4"><div class="font-medium text-slate-900">${esc(q.title)}</div><div class="text-xs s-muted">${esc(q.course)} · pass mark ${q.passingScore}%</div></td><td class="p-4">${q.questions}</td><td class="p-4">${q.attempts}<span class="text-xs s-muted"> · ${ui.plural(q.students, 'student')}</span></td><td class="p-4 font-semibold">${q.avg != null ? q.avg + '%' : '—'}</td><td class="p-4 w-40">${q.passRate != null ? S.bar(q.passRate) + `<div class="text-xs s-muted mt-1">${q.passRate}%</div>` : '—'}</td><td class="p-4">${S.statusChip(q.status)}</td></tr>`).join('')}</tbody></table></div>`
            : S.empty('fa-square-poll-vertical', 'No quizzes yet', 'Quizzes in your courses and their results appear here.'));
    } });
})();
