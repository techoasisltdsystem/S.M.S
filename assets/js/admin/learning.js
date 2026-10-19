// Learning Management: categories, lessons, quizzes, assignments (grading), resources, certificates.
(function () {
    const lessonLink = l => { const ctx = lms.lessonContext(l.id); return ctx && ctx.course ? `#/courses/${ctx.course.id}/lessons/${l.id}` : '#/lessons'; };

    // ---------------- Categories ----------------
    A.route('categories', () => {
        A.crumbs('Categories');
        const draw = () => {
            const tops = db.ordered('categories', c => !c.parentId);
            const count = id => db.count('courses', c => c.categoryId === id || c.subcategoryId === id);
            document.getElementById('catTree').innerHTML = tops.length ? tops.filter(t => A.matches(t.name, ...db.where('categories', { parentId: t.id }).map(s => s.name))).map(t => `
                <div class="bg-white rounded-2xl border border-slate-200/80 overflow-hidden" data-cat="${t.id}">
                    <div class="flex items-center gap-3 p-4">
                        <span class="drag-handle cat-handle w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-300" aria-label="Drag to reorder">☰</span>
                        <span class="w-10 h-10 rounded-xl bg-forest text-gold flex items-center justify-center"><i class="fa-solid ${esc(t.icon || 'fa-folder')}"></i></span>
                        <div class="flex-1 min-w-0"><div class="font-semibold text-ink">${esc(t.name)}</div><div class="text-xs text-slate-500">${ui.plural(count(t.id), 'course')} · ${ui.plural(db.count('categories', { parentId: t.id }), 'subcategory', 'subcategories')}</div></div>
                        <button data-addsub="${t.id}" class="btn btn-ghost btn-sm"><i class="fa-solid fa-plus"></i>Subcategory</button>
                        ${A.iconBtn('fa-pen', 'Edit', `data-edit="${t.id}"`)}${A.iconBtn('fa-trash', 'Delete', `data-del="${t.id}"`, true)}
                    </div>
                    <div class="border-t border-slate-100 divide-y divide-slate-100">${db.ordered('categories', { parentId: t.id }).map(s => `<div class="flex items-center gap-3 pl-16 pr-4 py-2.5 text-sm"><i class="fa-solid ${esc(s.icon || 'fa-tag')} text-slate-400 w-4"></i><span class="flex-1 text-ink">${esc(s.name)}</span><span class="text-xs text-slate-500">${ui.plural(count(s.id), 'course')}</span>${A.iconBtn('fa-pen', 'Edit', `data-edit="${s.id}"`)}${A.iconBtn('fa-trash', 'Delete', `data-del="${s.id}"`, true)}</div>`).join('')}</div>
                </div>`).join('') : A.card(A.empty('fa-folder-tree', 'No categories yet', 'Categories organise your catalog and power the Explore menu.'));
            if (window.Sortable) Sortable.create(document.getElementById('catTree'), { handle: '.cat-handle', animation: 160, ghostClass: 'drag-ghost', onEnd: () => db.reorder('categories', ui.$$('#catTree > [data-cat]').map(e => e.dataset.cat)) });
            ui.$$('[data-addsub]').forEach(b => b.onclick = () => edit(null, b.dataset.addsub));
            ui.$$('[data-edit]').forEach(b => b.onclick = () => edit(db.get('categories', b.dataset.edit)));
            ui.$$('[data-del]').forEach(b => b.onclick = async () => {
                const c = db.get('categories', b.dataset.del);
                if (await ui.confirmBox(`Delete "${c.name}"${c.parentId ? '' : ' and its subcategories'}? Courses keep their content and become uncategorised.`, { okText: 'Delete', danger: true })) { db.remove('categories', c.id); draw(); }
            });
        };
        const edit = (c, parentId) => {
            const m = ui.modal({ title: c ? 'Edit category' : parentId ? 'Add subcategory' : 'Add category', body: `<form class="space-y-4">
                ${A.field('Name *', A.input('name', c ? c.name : '', 'required maxlength="60"'))}
                ${A.field('Icon', A.input('icon', c ? c.icon : 'fa-folder', 'placeholder="fa-code"'), 'A <a class="underline" target="_blank" rel="noopener" href="https://fontawesome.com/search?o=r&m=free&s=solid">Font Awesome</a> solid icon name, e.g. fa-code')}
                ${A.field('Description', A.textarea('description', c ? c.description : '', 2))}
                <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save</button></div></form>` });
            m.el.querySelector('[data-c]').onclick = m.close;
            m.el.querySelector('form').onsubmit = e => {
                e.preventDefault(); const d = A.formData(e.target); d.slug = lms.slugify(d.name);
                if (c) db.update('categories', c.id, d); else db.insert('categories', Object.assign(d, { parentId: parentId || null, order: db.nextOrder('categories', { parentId: parentId || null }) }));
                m.close(); draw(); ui.toast('Category saved');
            };
        };
        A.view().innerHTML = A.header('Categories', 'Top-level categories and subcategories. Drag to set their order in menus.', '<button id="addCat" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Add category</button>') + '<div id="catTree" class="space-y-3"></div>';
        document.getElementById('addCat').onclick = () => edit(null, null);
        A.bindSearch(draw); draw();
    });

    // ---------------- Lessons (all courses) ----------------
    A.route('lessons', (_, p) => {
        A.crumbs('Lessons');
        let course = p.course || '', type = p.type || '', status = p.status || '';
        const draw = () => {
            const rows = db.all('lessons').map(l => Object.assign({ ctx: lms.lessonContext(l.id) }, l)).filter(l => l.ctx && l.ctx.course
                && (!course || l.ctx.course.id === course) && (!type || l.type === type) && (!status || l.status === status) && A.matches(l.title, l.ctx.course.title, l.ctx.section.title))
                .sort((a, b) => a.ctx.course.title.localeCompare(b.ctx.course.title) || a.ctx.section.order - b.ctx.section.order || a.order - b.order);
            document.getElementById('tbl').innerHTML = `<p class="text-xs text-slate-500 mb-3">${rows.length} lessons</p>` + A.table([
                { label: 'Lesson', render: l => `<a href="${lessonLink(l)}" class="flex items-center gap-3"><span class="w-8 h-8 rounded-lg bg-forest-50 text-forest flex items-center justify-center text-xs"><i class="fa-solid ${ui.LESSON_TYPES[l.type].icon}"></i></span><span><span class="block font-medium text-ink hover:underline">${esc(l.title)}</span><span class="block text-xs text-slate-500">${ui.LESSON_TYPES[l.type].label}${l.isPreview ? ' · Free preview' : ''}</span></span></a>` },
                { label: 'Course / Section', render: l => `<div class="text-ink">${esc(l.ctx.course.title)}</div><div class="text-xs text-slate-500">${esc(l.ctx.section.title)}</div>` },
                { label: 'Duration', render: l => ui.fmtDuration(l.durationMin) },
                { label: 'Completed by', render: l => db.count('lesson_progress', { lessonId: l.id, status: 'completed' }) },
                { label: 'Status', render: l => A.pill(l.status) }
            ], rows, A.empty('fa-circle-play', 'No lessons match'));
        };
        A.view().innerHTML = A.header('Lessons', 'Every lesson across all courses. Add lessons from a course\'s builder.')
            + `<div class="grid sm:grid-cols-3 gap-3 mb-4">${A.select('f_course', A.courseOptions('All courses'), course, 'id="fc"')}${A.select('f_type', [['', 'All types']].concat(Object.entries(ui.LESSON_TYPES).map(([k, t]) => [k, t.label])), type, 'id="ft"')}${A.select('f_status', [['', 'Any status'], ['published', 'Published'], ['draft', 'Draft']], status, 'id="fs"')}</div>`
            + A.card('<div id="tbl"></div>');
        document.getElementById('fc').onchange = e => { course = e.target.value; draw(); };
        document.getElementById('ft').onchange = e => { type = e.target.value; draw(); };
        document.getElementById('fs').onchange = e => { status = e.target.value; draw(); };
        A.bindSearch(draw); draw();
    });

    // ---------------- Quizzes ----------------
    A.route('quizzes', () => {
        A.crumbs('Quizzes');
        const draw = () => {
            const rows = db.all('quizzes').map(q => { const ctx = lms.lessonContext(q.lessonId), at = db.where('quiz_attempts', a => a.quizId === q.id && a.submittedAt); return Object.assign({ ctx, at }, q); })
                .filter(q => q.ctx && q.ctx.course && A.matches(q.title, q.ctx.course.title));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'Quiz', render: q => `<a href="#/quizzes/${q.id}" class="font-medium text-ink hover:underline">${esc(q.title)}</a><div class="text-xs text-slate-500">${esc(q.ctx.course.title)} · ${esc(q.ctx.section.title)}</div>` },
                { label: 'Questions', render: q => lms.questionsOf(q.id).length },
                { label: 'Pass mark', render: q => q.passingScore + '%' },
                { label: 'Attempts', render: q => q.at.length },
                { label: 'Avg score', render: q => q.at.length ? Math.round(q.at.reduce((a, x) => a + x.percent, 0) / q.at.length) + '%' : '—' },
                { label: 'Pass rate', render: q => q.at.length ? A.progressBar(Math.round(q.at.filter(a => a.passed).length / q.at.length * 100), 'w-28') : '—' },
                { label: '', cls: 'text-right', render: q => `<a href="${lessonLink({ id: q.lessonId })}" class="btn btn-outline btn-sm">Edit</a>` }
            ], rows, A.empty('fa-circle-question', 'No quizzes yet', 'Create a lesson of type "Quiz" inside a course to add one.'));
        };
        A.view().innerHTML = A.header('Quizzes', 'Quiz performance across all courses.') + A.card('<div id="tbl"></div>');
        A.bindSearch(draw); draw();
    });
    A.route('quizzes/:id', ({ id }) => {
        const q = db.get('quizzes', id); if (!q) return location.hash = '#/quizzes';
        const ctx = lms.lessonContext(q.lessonId), qs = lms.questionsOf(q.id), at = db.where('quiz_attempts', a => a.quizId === q.id && a.submittedAt).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        A.crumbs(['Quizzes', 'quizzes'], q.title);
        A.view().innerHTML = A.header(esc(q.title), `${esc(ctx.course.title)} · ${esc(ctx.section.title)}`, `<a href="${lessonLink({ id: q.lessonId })}" class="btn btn-outline btn-sm"><i class="fa-solid fa-pen"></i>Edit quiz</a>`)
            + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">${A.stat('fa-users', 'bg-sky-50 text-sky-700', 'Attempts', at.length, new Set(at.map(a => a.userId)).size + ' students')}${A.stat('fa-chart-simple', 'bg-forest-50 text-forest', 'Average score', at.length ? Math.round(at.reduce((a, x) => a + x.percent, 0) / at.length) + '%' : '—')}${A.stat('fa-circle-check', 'bg-emerald-50 text-emerald-700', 'Pass rate', at.length ? Math.round(at.filter(a => a.passed).length / at.length * 100) + '%' : '—')}${A.stat('fa-list-ol', 'bg-gold-50 text-gold-700', 'Questions', qs.length, q.passingScore + '% to pass')}</div>`
            + `<div class="grid xl:grid-cols-2 gap-5">${A.card(A.cardTitle('Question difficulty', '<span class="text-xs text-slate-500">% of attempts correct</span>') + A.barChart(qs.map((x, i) => { const n = at.filter(a => { const g = (a.answers[x.id] || []).slice().sort(), c = (x.correct || []).slice().sort(); return g.length === c.length && g.every((v, j) => v === c[j]); }).length; return { label: 'Q' + (i + 1), value: at.length ? Math.round(n / at.length * 100) : 0, tip: `Q${i + 1}: ${x.prompt.slice(0, 60)} (${at.length ? Math.round(n / at.length * 100) : 0}% correct)` }; }), { fmt: v => v + '%', empty: 'No attempts yet' }))}
              ${A.card(A.cardTitle('Recent attempts') + A.table([
                { label: 'Student', render: a => A.person(A.userName(a.userId)) },
                { label: 'Score', render: a => `<b>${a.percent}%</b> <span class="text-xs text-slate-500">(${a.score}/${a.maxScore})</span>` },
                { label: 'Result', render: a => a.passed ? '<span class="pill pill-completed">Passed</span>' : '<span class="pill pill-failed">Not passed</span>' },
                { label: 'When', render: a => ui.fmtDateTime(a.submittedAt) }], at.slice(0, 15), A.empty('fa-hourglass', 'No attempts yet')))}</div>`;
    });

    // ---------------- Assignments & grading ----------------
    A.route('assignments', (_, p) => {
        A.crumbs('Assignments');
        let filter = p.status || 'pending', only = p.a || '';
        const draw = () => {
            const subs = db.all('submissions').filter(s => (!only || s.assignmentId === only) && (filter === 'all' || (filter === 'pending' ? s.status !== 'graded' : s.status === 'graded'))
                && A.matches(A.userName(s.userId), (db.get('assignments', s.assignmentId) || {}).title)).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
            document.getElementById('subs').innerHTML = A.table([
                { label: 'Student', render: s => A.person(A.userName(s.userId), (db.get('users', s.userId) || {}).email) },
                { label: 'Assignment', render: s => { const a = db.get('assignments', s.assignmentId), ctx = a && lms.lessonContext(a.lessonId); return `<div class="text-ink font-medium">${esc(a ? a.title : '—')}</div><div class="text-xs text-slate-500">${esc(ctx && ctx.course ? ctx.course.title : '')}</div>`; } },
                { label: 'Submitted', render: s => `<span class="text-sm">${ui.fmtDateTime(s.submittedAt)}</span>` },
                { label: 'Status', render: s => A.pill(s.status) },
                { label: 'Score', render: s => s.status === 'graded' ? `<b>${s.score}</b><span class="text-xs text-slate-500">/${(db.get('assignments', s.assignmentId) || {}).maxScore}</span>` : '—' },
                { label: '', cls: 'text-right', render: s => `<button data-grade="${s.id}" class="btn ${s.status === 'graded' ? 'btn-outline' : 'btn-forest'} btn-sm">${s.status === 'graded' ? 'Review' : 'Grade'}</button>` }
            ], subs, A.empty('fa-inbox', filter === 'pending' ? 'No submissions waiting' : 'No submissions', filter === 'pending' ? 'You are all caught up.' : ''));
            ui.$$('[data-grade]').forEach(b => b.onclick = () => grade(b.dataset.grade, draw));
            const all = db.all('assignments').map(a => ({ a, ctx: lms.lessonContext(a.lessonId), subs: db.where('submissions', { assignmentId: a.id }) })).filter(x => x.ctx && x.ctx.course);
            document.getElementById('asgList').innerHTML = all.map(x => `<button data-only="${x.a.id}" class="w-full text-left flex items-center gap-3 p-3 rounded-xl ${only === x.a.id ? 'bg-forest-50 ring-1 ring-forest-200' : 'hover:bg-slate-50'}"><span class="w-9 h-9 rounded-lg bg-gold-50 text-gold-700 flex items-center justify-center text-xs"><i class="fa-solid fa-file-pen"></i></span><span class="flex-1 min-w-0"><span class="block text-sm font-medium text-ink truncate">${esc(x.a.title)}</span><span class="block text-xs text-slate-500 truncate">${esc(x.ctx.course.title)}</span></span><span class="text-xs text-slate-500">${x.subs.filter(s => s.status !== 'graded').length}/${x.subs.length}</span></button>`).join('') || '<p class="text-sm text-slate-500">No assignments yet.</p>';
            ui.$$('[data-only]').forEach(b => b.onclick = () => { only = only === b.dataset.only ? '' : b.dataset.only; draw(); });
            ui.$$('[data-filter]').forEach(b => b.className = 'h-9 px-4 rounded-full text-sm font-semibold ' + (b.dataset.filter === filter ? 'bg-ink text-white' : 'bg-white border border-slate-200'));
        };
        A.view().innerHTML = A.header('Assignments', 'Review submissions, score them against the rubric and leave feedback.')
            + `<div class="grid xl:grid-cols-[320px_1fr] gap-5 items-start">${A.card(A.cardTitle('All assignments', '<span class="text-[11px] text-slate-400">to grade / total</span>') + '<div id="asgList" class="space-y-1"></div>')}
               <div><div class="flex gap-2 mb-3">${[['pending', 'Needs grading'], ['graded', 'Graded'], ['all', 'All']].map(([k, l]) => `<button data-filter="${k}">${l}</button>`).join('')}</div>${A.card('<div id="subs"></div>')}</div></div>`;
        ui.$$('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; draw(); });
        A.bindSearch(draw); draw();
        if (p.grade) grade(p.grade, draw);
    });
    function grade(subId, done) {
        const s = db.get('submissions', subId); if (!s) return;
        const a = db.get('assignments', s.assignmentId), u = db.get('users', s.userId), rub = a.rubric || [];
        const m = ui.modal({ title: 'Grade submission', size: 'max-w-3xl', body: `
            <div class="grid lg:grid-cols-2 gap-6">
                <div><div class="flex items-center gap-3">${A.person(u ? u.name : 'Deleted user', u && u.email)}</div>
                    <div class="text-sm font-semibold text-ink mt-4">${esc(a.title)}</div><div class="text-xs text-slate-500">Submitted ${ui.fmtDateTime(s.submittedAt)} ${s.status === 'late' ? '<span class="pill pill-late ml-1">late</span>' : ''}</div>
                    ${s.text ? `<div class="mt-3 text-sm bg-slate-50 rounded-xl border p-4 whitespace-pre-line break-words max-h-64 overflow-y-auto thin-scroll">${esc(s.text)}</div>` : ''}
                    ${(s.files || []).length ? `<div class="mt-3 space-y-2">${s.files.map(f => `<div class="flex items-center gap-2 text-sm"><i class="fa-solid fa-paperclip text-slate-400"></i><span class="flex-1 truncate">${esc(f.name)} <span class="text-xs text-slate-400">${ui.fmtBytes(f.size)}</span></span>${f.url ? `<a href="${esc(f.url)}" download="${esc(f.name)}" class="btn btn-outline btn-sm">Download</a>` : '<span class="text-xs text-slate-400">name only</span>'}</div>`).join('')}</div>` : ''}
                    ${!s.text && !(s.files || []).length ? '<p class="text-sm text-slate-500 mt-3">No content submitted.</p>' : ''}</div>
                <form class="space-y-4">
                    ${rub.length ? `<div><div class="field-label">Rubric</div><div class="space-y-2">${rub.map((r, i) => `<div class="flex items-center gap-3"><div class="flex-1 min-w-0"><div class="text-sm text-ink">${esc(r.criterion)}</div>${r.description ? `<div class="text-xs text-slate-500">${esc(r.description)}</div>` : ''}</div><input type="number" min="0" max="${r.points}" name="r${i}" value="${s.rubricScores && s.rubricScores[i] != null ? s.rubricScores[i] : ''}" class="field w-20" data-rub><span class="text-xs text-slate-500 w-10">/ ${r.points}</span></div>`).join('')}</div></div>` : ''}
                    ${A.field(`Score (out of ${a.maxScore}) *`, A.input('score', s.score != null ? s.score : '', `type="number" min="0" max="${a.maxScore}" required id="scoreIn"`), rub.length ? 'Fills in from the rubric automatically; you can adjust it.' : '')}
                    ${A.field('Feedback for the student', A.textarea('feedback', s.feedback, 5, 'placeholder="What went well, and what to improve next"'))}
                    <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm"><i class="fa-solid fa-check"></i>Save grade</button></div></form></div>` });
        const f = m.el.querySelector('form'), scoreIn = m.el.querySelector('#scoreIn');
        const rubTotal = rub.reduce((t, r) => t + (+r.points || 0), 0);
        ui.$$('[data-rub]', m.el).forEach(inp => inp.oninput = () => {
            const sum = ui.$$('[data-rub]', m.el).reduce((t, x) => t + (+x.value || 0), 0);
            scoreIn.value = rubTotal ? Math.round(sum / rubTotal * a.maxScore) : sum;
        });
        m.el.querySelector('[data-c]').onclick = m.close;
        f.onsubmit = e => {
            e.preventDefault();
            const d = A.formData(f), rubricScores = {};
            rub.forEach((r, i) => { if (d['r' + i] != null) rubricScores[i] = Math.min(+r.points, d['r' + i]); });
            lms.gradeSubmission(s.id, { score: Math.min(a.maxScore, Math.max(0, d.score || 0)), feedback: d.feedback, rubricScores });
            m.close(); ui.toast('Grade saved. The student can now see it.'); done(); A.renderNav('assignments');
        };
    }

    // ---------------- Resources ----------------
    // Reusable panel: scope { courseId } or { lessonId }. compact=true for the lesson sidebar (no nested forms).
    A.resourcesPanel = function (el, scope, compact) {
        const draw = () => {
            const list = lms.resourcesOf(scope);
            const rows = list.map(r => `<div class="flex items-center gap-3 ${compact ? 'py-2' : 'p-3 rounded-xl border border-slate-200'}"><span class="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center text-slate-500 text-xs uppercase font-bold">${esc(r.fileType).slice(0, 4)}</span>
                <div class="flex-1 min-w-0"><div class="text-sm font-medium text-ink truncate">${esc(r.name)}</div><div class="text-xs text-slate-500">${ui.fmtBytes(r.sizeBytes)} · ${r.access === 'public' ? 'Anyone' : 'Enrolled students'}</div></div>
                ${A.iconBtn('fa-pen', 'Edit resource', `type="button" data-redit="${r.id}"`)}${A.iconBtn('fa-trash', 'Remove resource', `type="button" data-rdel="${r.id}"`, true)}</div>`).join('');
            el.innerHTML = A.card(A.cardTitle(compact ? 'Lesson resources' : 'Course resources', `<button type="button" data-radd class="btn btn-outline btn-sm"><i class="fa-solid fa-plus"></i>Add</button>`)
                + (list.length ? `<div class="${compact ? 'divide-y divide-slate-100' : 'grid md:grid-cols-2 gap-3'}">${rows}</div>` : `<p class="text-sm text-slate-500">${compact ? 'Attach PDFs, templates, code or slides to this lesson.' : 'Course-wide downloads (cheat sheets, starter files, templates) shown to enrolled students.'}</p>`));
            el.querySelector('[data-radd]').onclick = () => A.resourceModal(null, scope, draw);
            ui.$$('[data-redit]', el).forEach(b => b.onclick = () => A.resourceModal(db.get('resources', b.dataset.redit), scope, draw));
            ui.$$('[data-rdel]', el).forEach(b => b.onclick = async () => { if (await ui.confirmBox('Remove this resource?', { okText: 'Remove', danger: true })) { db.remove('resources', b.dataset.rdel); draw(); } });
        };
        draw();
    };
    A.resourceModal = function (r, scope, done) {
        const pickScope = !scope;
        const m = ui.modal({ title: r ? 'Edit resource' : 'Add resource', body: `<form class="space-y-4">
            ${pickScope ? A.field('Course *', A.select('courseId', A.courseOptions(), '', 'required')) : ''}
            ${A.field('File name *', A.input('name', r ? r.name : '', 'required id="rName" placeholder="Starter files.zip"'))}
            ${A.field('Link (URL)', A.input('url', r && !String(r.url).startsWith('data:') ? r.url : '', 'id="rUrl" placeholder="https://…"'), 'Paste a link to the hosted file, or upload a small file below.')}
            <label class="btn btn-outline btn-sm cursor-pointer"><i class="fa-solid fa-upload"></i>Upload file (max 1 MB)<input type="file" id="rFile" class="hidden"></label><span id="rUp" class="text-xs text-slate-500 ml-2"></span>
            <div class="grid grid-cols-2 gap-3">${A.field('File type', A.select('fileType', [['pdf', 'PDF'], ['zip', 'ZIP'], ['image', 'Image'], ['template', 'Template'], ['code', 'Code'], ['doc', 'Document'], ['file', 'Other']], r ? r.fileType : 'pdf', 'id="rType"'))}${A.field('Size (KB)', A.input('sizeKb', r ? Math.round((r.sizeBytes || 0) / 1024) : '', 'type="number" min="0" id="rSize"'))}</div>
            ${A.field('Download permission', A.select('access', [['enrolled', 'Enrolled students only'], ['public', 'Anyone, including visitors']], r ? r.access : 'enrolled'))}
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save resource</button></div></form>` });
        let up = null;
        m.el.querySelector('#rFile').onchange = async e => { up = await A.upload(e.target.files[0]); if (up) { m.el.querySelector('#rUp').textContent = up.name + ' ready'; const n = m.el.querySelector('#rName'); if (!n.value) n.value = up.name; m.el.querySelector('#rType').value = A.fileType(up.name); m.el.querySelector('#rSize').value = Math.round(up.size / 1024); } };
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => {
            e.preventDefault();
            const d = A.formData(e.target), url = up ? up.url : d.url || (r && r.url) || '';
            if (!url) return ui.toast('Add a link or upload a file.', 'error');
            if (!up && d.url && !/^https?:\/\//i.test(d.url)) return ui.toast('Links must start with https://', 'error');
            const row = { name: d.name, url, fileType: d.fileType, sizeBytes: up ? up.size : (d.sizeKb || 0) * 1024, access: d.access };
            if (r) db.update('resources', r.id, row); else db.insert('resources', Object.assign(row, pickScope ? { courseId: d.courseId, lessonId: null } : { courseId: scope.courseId || null, lessonId: scope.lessonId || null }));
            m.close(); done(); ui.toast('Resource saved');
        };
    };
    A.route('resources', () => {
        A.crumbs('Resources');
        const draw = () => {
            const rows = db.all('resources').map(r => { const ctx = r.lessonId && lms.lessonContext(r.lessonId); return Object.assign({ course: r.courseId ? db.get('courses', r.courseId) : ctx && ctx.course, lesson: ctx && ctx.lesson }, r); }).filter(r => A.matches(r.name, r.course && r.course.title, r.lesson && r.lesson.title));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'File', render: r => `<div class="font-medium text-ink">${esc(r.name)}</div><div class="text-xs text-slate-500 uppercase">${esc(r.fileType)} · ${ui.fmtBytes(r.sizeBytes)}</div>` },
                { label: 'Attached to', render: r => `<div class="text-ink">${esc(r.course ? r.course.title : '—')}</div><div class="text-xs text-slate-500">${r.lesson ? 'Lesson: ' + esc(r.lesson.title) : 'Whole course'}</div>` },
                { label: 'Permission', render: r => r.access === 'public' ? '<span class="pill bg-sky-50 text-sky-700">Anyone</span>' : '<span class="pill bg-slate-100 text-slate-600">Enrolled</span>' },
                { label: '', cls: 'text-right whitespace-nowrap', render: r => `${/^https?:/.test(r.url) ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Open</a>` : ''}${A.iconBtn('fa-pen', 'Edit', `data-redit="${r.id}"`)}${A.iconBtn('fa-trash', 'Delete', `data-rdel="${r.id}"`, true)}` }
            ], rows, A.empty('fa-paperclip', 'No resources yet'));
            ui.$$('[data-redit]').forEach(b => b.onclick = () => A.resourceModal(db.get('resources', b.dataset.redit), {}, draw));
            ui.$$('[data-rdel]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Delete this resource?', { okText: 'Delete', danger: true })) { db.remove('resources', b.dataset.rdel); draw(); } });
        };
        A.view().innerHTML = A.header('Resources', 'Downloadable files attached to courses and lessons.', '<button id="addRes" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Add course resource</button>') + A.card('<div id="tbl"></div>');
        document.getElementById('addRes').onclick = () => A.resourceModal(null, null, draw);
        A.bindSearch(draw); draw();
    });

    // ---------------- Certificates ----------------
    A.route('certificates', () => {
        A.crumbs('Certificates');
        const draw = () => {
            const rows = db.all('certificates').filter(c => A.matches(c.code, c.studentName, c.courseTitle)).sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'Certificate ID', render: c => `<a href="verify.html?code=${encodeURIComponent(c.code)}" target="_blank" class="font-mono text-sm text-ink hover:underline">${esc(c.code)}</a>` },
                { label: 'Student', render: c => A.person(c.studentName) },
                { label: 'Course', render: c => esc(c.courseTitle) },
                { label: 'Issued', render: c => ui.fmtDate(c.issuedAt) },
                { label: 'Status', render: c => A.pill(c.revoked ? 'revoked' : 'valid') },
                { label: '', cls: 'text-right whitespace-nowrap', render: c => `<a href="verify.html?code=${encodeURIComponent(c.code)}" target="_blank" class="btn btn-ghost btn-sm">View</a>${c.revoked ? `<button data-restore="${c.id}" class="btn btn-ghost btn-sm">Reinstate</button>` : `<button data-revoke="${c.id}" class="btn btn-ghost btn-sm text-rose-700">Revoke</button>`}` }
            ], rows, A.empty('fa-award', 'No certificates issued yet', 'Students claim certificates once they meet the completion requirements.'));
            ui.$$('[data-revoke]').forEach(b => b.onclick = () => {
                const m = ui.modal({ title: 'Revoke certificate', body: `<form class="space-y-4"><p class="text-sm text-slate-600">The verification page will show this certificate as revoked.</p>${A.field('Reason', A.input('reason', '', 'required placeholder="e.g. Academic misconduct"'))}<div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-danger btn-sm">Revoke</button></div></form>` });
                m.el.querySelector('[data-c]').onclick = m.close;
                m.el.querySelector('form').onsubmit = e => { e.preventDefault(); db.update('certificates', b.dataset.revoke, { revoked: true, revokedReason: A.formData(e.target).reason }); m.close(); draw(); };
            });
            ui.$$('[data-restore]').forEach(b => b.onclick = () => { db.update('certificates', b.dataset.restore, { revoked: false, revokedReason: '' }); draw(); });
        };
        A.view().innerHTML = A.header('Certificates', 'Issued certificates and their public verification status.', '<a href="#/settings/certificates" class="btn btn-outline btn-sm"><i class="fa-solid fa-gear"></i>Certificate settings</a><button id="issue" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Issue manually</button>') + A.card('<div id="tbl"></div>');
        document.getElementById('issue').onclick = () => {
            const enrs = db.all('enrollments').filter(e => !lms.certificateOf(e.userId, e.courseId) && db.get('users', e.userId) && db.get('courses', e.courseId));
            const m = ui.modal({ title: 'Issue certificate manually', body: `<form class="space-y-4">${A.field('Enrollment', A.select('enr', enrs.map(e => [e.id, A.userName(e.userId) + ' — ' + A.courseTitle(e.courseId) + ` (${lms.progress(e.userId, e.courseId).pct}%)`]), '', 'required'), 'Overrides the completion requirements. Use for exceptional cases.')}<div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Issue certificate</button></div></form>` });
            m.el.querySelector('[data-c]').onclick = m.close;
            m.el.querySelector('form').onsubmit = e => { e.preventDefault(); const en = db.get('enrollments', A.formData(e.target).enr); if (en) { lms.issueCertificate(en.userId, en.courseId, true); ui.toast('Certificate issued'); } m.close(); draw(); };
        };
        A.bindSearch(draw); draw();
    });
})();
