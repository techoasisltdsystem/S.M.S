// Lesson editor: lesson details + content by type (video, article, document, external, download),
// quiz builder, assignment builder and lesson resources.
(function () {
    A.route('courses/:cid/lessons/:lid', ({ cid, lid }) => {
        const c = db.get('courses', cid), l = db.get('lessons', lid);
        if (!c || !l) { A.view().innerHTML = A.empty('fa-circle-play', 'Lesson not found', '', `<a href="#/courses/${cid}" class="btn btn-forest btn-sm">Back to builder</a>`); return; }
        const s = db.get('sections', l.sectionId);
        A.crumbs(['Courses', 'courses'], [c.title, 'courses/' + c.id], l.title);
        const all = lms.flatLessons(c.id, true), i = all.findIndex(x => x.id === l.id), prev = all[i - 1], next = all[i + 1];
        const T = ui.LESSON_TYPES[l.type];
        A.view().innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <a href="#/courses/${c.id}" class="text-sm font-semibold text-slate-500 hover:text-ink"><i class="fa-solid fa-arrow-left mr-2"></i>Back to course builder</a>
                <div class="flex gap-2">${prev ? `<a href="#/courses/${c.id}/lessons/${prev.id}" class="btn btn-ghost btn-sm"><i class="fa-solid fa-chevron-left text-xs"></i>Previous lesson</a>` : ''}${next ? `<a href="#/courses/${c.id}/lessons/${next.id}" class="btn btn-ghost btn-sm">Next lesson<i class="fa-solid fa-chevron-right text-xs"></i></a>` : ''}</div>
            </div>
            <form id="lessonForm">
            <div class="bg-white rounded-2xl border border-slate-200/80 p-5 mb-5 flex flex-col md:flex-row md:items-center gap-4">
                <span class="w-12 h-12 rounded-xl bg-forest text-gold flex items-center justify-center text-lg shrink-0"><i class="fa-solid ${T.icon}"></i></span>
                <div class="flex-1 min-w-0"><div class="text-xs text-slate-500">${esc(s.title)} · Lesson ${l.order} · ${T.label}</div><h1 class="font-display text-2xl text-ink truncate">${esc(l.title)}</h1></div>
                <div class="flex flex-wrap gap-2"><a href="learn.html?c=${encodeURIComponent(c.slug)}&l=${l.id}&preview=1" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-eye"></i>Preview lesson</a>
                    <button class="btn btn-forest btn-sm"><i class="fa-solid fa-floppy-disk"></i>Save lesson</button></div>
            </div>
            <div class="grid xl:grid-cols-[1fr_340px] gap-5 items-start">
                <div class="space-y-5" id="mainCol">
                    ${A.card(A.cardTitle('Lesson details') + `<div class="grid sm:grid-cols-2 gap-4">
                        ${A.field('Title *', A.input('title', l.title, 'required maxlength="140"'), '', 'sm:col-span-2')}
                        ${A.field('Slug', A.input('slug', l.slug, 'placeholder="generated from the title"'))}
                        ${A.field('Content type', A.select('type', Object.entries(ui.LESSON_TYPES).map(([k, t]) => [k, t.label]), l.type, 'id="typeSel"'), 'Changing type keeps existing content.')}
                        ${A.field('Short description', A.textarea('summary', l.summary, 2, 'maxlength="300"'), 'Shown under the lesson title.', 'sm:col-span-2')}
                        ${A.field('Full lesson description', A.textarea('body', l.body, 6), 'Lesson notes shown in the Overview tab. Markdown supported.', 'sm:col-span-2')}
                    </div>`)}
                    <div id="contentPanel"></div>
                </div>
                <aside class="space-y-5 xl:sticky xl:top-24">
                    ${A.card(A.cardTitle('Settings') + `<div class="space-y-4">
                        ${A.field('Status', A.select('status', [['draft', 'Draft'], ['published', 'Published']], l.status))}
                        ${A.field('Estimated duration (minutes)', A.input('durationMin', l.durationMin, 'type="number" min="0"'))}
                        ${A.field('Section', A.select('sectionId', db.ordered('sections', { courseId: c.id }).map(x => [x.id, x.title]), l.sectionId))}
                        ${A.toggle('isPreview', l.isPreview, 'Free preview', 'Visitors can watch without enrolling.')}
                        ${A.toggle('discussionsEnabled', l.discussionsEnabled !== false, 'Discussion', 'Show the comments tab.')}</div>`)}
                    <div id="resPanel"></div>
                    ${A.card(`<button type="button" id="dupLesson" class="btn btn-outline btn-sm w-full mb-2"><i class="fa-solid fa-copy"></i>Duplicate lesson</button><button type="button" id="delLesson" class="btn btn-sm w-full text-rose-700 hover:bg-rose-50"><i class="fa-solid fa-trash"></i>Delete lesson</button>`)}
                </aside>
            </div></form>`;
        const ctx = { c, l, contentSave: null };
        renderContent(ctx);
        A.resourcesPanel(document.getElementById('resPanel'), { lessonId: l.id }, true);
        document.getElementById('typeSel').onchange = e => { ensureTypeRecords(l.id, e.target.value); l.type = e.target.value; renderContent(ctx); };
        document.getElementById('lessonForm').onsubmit = e => {
            e.preventDefault();
            const d = pick(A.formData(e.target), ['title', 'slug', 'type', 'summary', 'body', 'status', 'durationMin', 'sectionId', 'isPreview', 'discussionsEnabled']);
            if (d.sectionId !== l.sectionId) d.order = db.nextOrder('lessons', { sectionId: d.sectionId });
            d.slug = lms.uniqueSlug('lessons', d.slug || d.title, { sectionId: d.sectionId }, l.id);
            if (ctx.contentSave && ctx.contentSave() === false) return;
            db.update('lessons', l.id, d); db.update('courses', c.id, {});
            ui.toast('Lesson saved'); A.refresh();
        };
        document.getElementById('dupLesson').onclick = () => { const d = lms.duplicateLesson(l.id); ui.toast('Lesson duplicated'); location.hash = `#/courses/${c.id}/lessons/${d.id}`; };
        document.getElementById('delLesson').onclick = async () => { if (await ui.confirmBox(`Delete "${l.title}" and its content?`, { okText: 'Delete', danger: true })) { db.remove('lessons', l.id); ui.toast('Lesson deleted'); location.hash = '#/courses/' + c.id; } };
    });

    const pick = (o, keys) => keys.reduce((a, k) => (k in o ? (a[k] = o[k], a) : a), {});
    // Create the record a lesson type needs, without destroying other content
    function ensureTypeRecords(lessonId, type) {
        const has = kind => lms.contentsOf(lessonId).some(x => x.kind === kind);
        const order = db.nextOrder('contents', { lessonId });
        if (type === 'video' && !has('video')) db.insert('contents', { lessonId, kind: 'video', order, provider: 'youtube', url: '', ref: '', durationSec: 0, thumbnail: '', captions: [], transcript: '', videoStatus: 'draft' });
        if (type === 'article' && !has('article')) db.insert('contents', { lessonId, kind: 'article', order, body: '' });
        if (type === 'document' && !has('document')) db.insert('contents', { lessonId, kind: 'document', order, url: '', fileName: '', sizeBytes: 0 });
        if (type === 'external' && !has('external')) db.insert('contents', { lessonId, kind: 'external', order, url: '', label: 'Open resource', newTab: true });
        const l = db.get('lessons', lessonId);
        if (type === 'quiz' && !lms.quizOf(lessonId)) db.insert('quizzes', { lessonId, title: l.title, instructions: 'Answer every question, then submit.', passingScore: 70, timeLimitMin: 0, maxAttempts: 3, shuffle: false });
        if (type === 'assignment' && !lms.assignmentOf(lessonId)) db.insert('assignments', { lessonId, title: l.title, instructions: '', dueDays: 7, dueDate: null, maxScore: 100, allowFile: true, allowText: true, rubric: [] });
    }

    function renderContent(ctx) {
        const panel = document.getElementById('contentPanel'), l = ctx.l;
        ctx.contentSave = null;
        if (l.type === 'video') return videoPanel(panel, ctx);
        if (l.type === 'article') return articlePanel(panel, ctx);
        if (l.type === 'document') return documentPanel(panel, ctx);
        if (l.type === 'external') return externalPanel(panel, ctx);
        if (l.type === 'quiz') return quizPanel(panel, ctx);
        if (l.type === 'assignment') return assignmentPanel(panel, ctx);
        if (l.type === 'download') panel.innerHTML = A.card(A.cardTitle('Downloadable resources') + '<p class="text-sm text-slate-600">This lesson presents its files as downloads. Add files in the <b>Lesson resources</b> panel; course-wide resources are listed too.</p>');
    }

    // ---------- Video ----------
    function videoPanel(panel, ctx) {
        const v = lms.contentsOf(ctx.l.id).find(x => x.kind === 'video');
        const providers = TOS.video.list();
        const mmss = s => s ? Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') : '';
        panel.innerHTML = A.card(A.cardTitle('Video', `<span class="text-xs text-slate-500">Provider-agnostic: paste a link from any supported host</span>`) + `
            <div class="grid lg:grid-cols-2 gap-5">
                <div class="space-y-4">
                    ${A.field('Video URL *', A.input('v_url', v.url, 'id="vUrl" type="url" placeholder="https://www.youtube.com/watch?v=…"'), '<span id="vDetect"></span>')}
                    ${A.field('Video provider', A.select('v_provider', providers.map(p => [p.id, p.label]), v.provider, 'id="vProv"'), 'Detected automatically from the URL. Add providers in assets/js/core/video.js.')}
                    <div class="grid grid-cols-2 gap-3">
                        ${A.field('Duration (mm:ss)', A.input('v_duration', mmss(v.durationSec), 'pattern="\\d{1,3}:\\d{2}" placeholder="12:30"'))}
                        ${A.field('Video status', A.select('v_status', [['draft', 'Draft'], ['processing', 'Processing'], ['ready', 'Ready'], ['error', 'Error']], v.videoStatus))}</div>
                    ${A.field('Thumbnail URL', A.input('v_thumb', v.thumbnail, 'id="vThumb" placeholder="Auto for YouTube; or paste an image URL"'))}
                    <div class="rounded-xl bg-ivory border border-ivory-200 p-3 text-xs text-slate-600"><i class="fa-solid fa-circle-info text-gold-600 mr-1"></i>To upload video files directly, connect a video host (Bunny Stream, Cloudflare Stream, Vimeo or S3) and paste the hosted URL here. Large files can't be stored in the browser.</div>
                </div>
                <div><div class="field-label">Preview</div><div id="vPreview" class="aspect-video rounded-xl bg-ink overflow-hidden"></div><button type="button" id="vLoad" class="btn btn-outline btn-sm mt-2"><i class="fa-solid fa-play"></i>Load preview</button></div>
            </div>
            <div class="mt-6"><div class="flex items-center justify-between mb-2"><div class="field-label mb-0">Captions / subtitles</div><button type="button" id="addCap" class="text-xs font-semibold text-forest"><i class="fa-solid fa-plus mr-1"></i>Add caption track</button></div>
                <div id="caps" class="space-y-2"></div><p class="field-hint">WebVTT (.vtt) files for direct-file videos. YouTube and Vimeo use captions uploaded to their platform.</p></div>
            <div class="mt-6">${A.field('Transcript', A.textarea('v_transcript', v.transcript, 6), 'Shown in the Transcript tab. Helps accessibility and search.')}</div>`);
        let caps = (v.captions || []).slice();
        const drawCaps = () => {
            document.getElementById('caps').innerHTML = caps.map((c, i) => `<div class="grid grid-cols-[90px_1fr_2fr_auto] gap-2"><input data-cap="${i}" data-k="lang" value="${esc(c.lang)}" class="field" placeholder="en"><input data-cap="${i}" data-k="label" value="${esc(c.label)}" class="field" placeholder="English"><input data-cap="${i}" data-k="url" value="${esc(c.url)}" class="field" placeholder="https://…/captions.vtt">${A.iconBtn('fa-xmark', 'Remove caption', `type="button" data-capdel="${i}"`, true)}</div>`).join('') || '<p class="text-xs text-slate-400">No caption tracks.</p>';
            ui.$$('[data-cap]').forEach(inp => inp.oninput = () => caps[inp.dataset.cap][inp.dataset.k] = inp.value);
            ui.$$('[data-capdel]').forEach(b => b.onclick = () => { caps.splice(+b.dataset.capdel, 1); drawCaps(); });
        };
        drawCaps();
        document.getElementById('addCap').onclick = () => { caps.push({ lang: 'en', label: 'English', url: '' }); drawCaps(); };
        const url = document.getElementById('vUrl'), prov = document.getElementById('vProv');
        const detect = () => { const p = TOS.video.detect(url.value); if (url.value) prov.value = p.id; document.getElementById('vDetect').textContent = url.value ? 'Detected: ' + p.label : ''; const th = p.thumbnail(p.parse(url.value)); if (th && !document.getElementById('vThumb').value) document.getElementById('vThumb').placeholder = th; };
        url.oninput = detect; detect();
        // Keep the lesson's duration in step with the video length
        const fe = document.getElementById('lessonForm').elements;
        fe.v_duration.oninput = () => { const [mm, ss] = fe.v_duration.value.split(':').map(Number); if (/^\d{1,3}:\d{2}$/.test(fe.v_duration.value)) fe.durationMin.value = Math.max(1, Math.ceil(((mm || 0) * 60 + (ss || 0)) / 60)); };
        let prevPlayer = null;
        const load = () => { if (prevPlayer) prevPlayer.destroy(); const p = TOS.video.get(prov.value); prevPlayer = TOS.video.mount(document.getElementById('vPreview'), { url: url.value, provider: p.id, ref: p.parse(url.value), captions: caps }, {}); };
        document.getElementById('vLoad').onclick = load;
        if (v.url) load(); else TOS.video.mount(document.getElementById('vPreview'), null);
        ctx.contentSave = () => {
            const f = document.getElementById('lessonForm').elements;
            const p = TOS.video.get(f.v_provider.value), u = f.v_url.value.trim();
            if (u && !/^https?:\/\//i.test(u)) { ui.toast('Video URL must start with https://', 'error'); return false; }
            const [mm, ss] = (f.v_duration.value || '').split(':').map(Number);
            const durationSec = f.v_duration.value ? (mm || 0) * 60 + (ss || 0) : 0;
            db.update('contents', v.id, { url: u, provider: p.id, ref: p.parse(u) || '', durationSec, videoStatus: u && f.v_status.value === 'draft' ? 'ready' : f.v_status.value, thumbnail: f.v_thumb.value.trim() || p.thumbnail(p.parse(u)) || '', captions: caps.filter(c => c.url), transcript: f.v_transcript.value });
        };
    }

    // ---------- Article / document / external ----------
    function articlePanel(panel, ctx) {
        const a = lms.contentsOf(ctx.l.id).find(x => x.kind === 'article');
        panel.innerHTML = A.card(A.cardTitle('Article', '<button type="button" id="prevArt" class="text-xs font-semibold text-forest">Toggle preview</button>') + `${A.textarea('a_body', a.body, 16, 'id="artBody" style="font-family:ui-monospace,Menlo,monospace;font-size:13px"')}<div id="artPrev" class="hidden prose-tos border rounded-xl p-5 min-h-[200px]"></div>
            <p class="field-hint">Markdown: ## Heading, **bold**, *italic*, - lists, 1. numbered, \`code\`, \`\`\`code blocks\`\`\`, > quotes, [link](https://…)</p>`);
        document.getElementById('prevArt').onclick = () => { const p = document.getElementById('artPrev'), t = document.getElementById('artBody'); p.innerHTML = ui.md(t.value); p.classList.toggle('hidden'); t.classList.toggle('hidden'); };
        ctx.contentSave = () => db.update('contents', a.id, { body: document.getElementById('artBody').value });
    }
    function documentPanel(panel, ctx) {
        const d = lms.contentsOf(ctx.l.id).find(x => x.kind === 'document');
        panel.innerHTML = A.card(A.cardTitle('PDF / Document') + `<div class="space-y-4">
            ${A.field('Document URL', A.input('d_url', d.url && !d.url.startsWith('data:') ? d.url : '', 'id="dUrl" placeholder="https://…/handbook.pdf"'), d.url && d.url.startsWith('data:') ? `Uploaded file: <b>${esc(d.fileName)}</b> (${ui.fmtBytes(d.sizeBytes)})` : 'PDFs display inline in the lesson.')}
            <label class="btn btn-outline btn-sm cursor-pointer"><i class="fa-solid fa-upload"></i>Upload file (max 1 MB)<input type="file" id="dFile" accept=".pdf,.doc,.docx,.ppt,.pptx" class="hidden"></label></div>`);
        let up = null;
        document.getElementById('dFile').onchange = async e => { up = await A.upload(e.target.files[0]); if (up) ui.toast('File ready. Save the lesson to attach it.'); };
        ctx.contentSave = () => { const u = document.getElementById('dUrl').value.trim(); db.update('contents', d.id, up ? { url: up.url, fileName: up.name, sizeBytes: up.size } : u ? { url: u, fileName: u.split('/').pop(), sizeBytes: 0 } : {}); };
    }
    function externalPanel(panel, ctx) {
        const x = lms.contentsOf(ctx.l.id).find(k => k.kind === 'external');
        panel.innerHTML = A.card(A.cardTitle('External resource') + `<div class="grid sm:grid-cols-2 gap-4">${A.field('URL *', A.input('x_url', x.url, 'type="url" placeholder="https://…"'), '', 'sm:col-span-2')}${A.field('Button label', A.input('x_label', x.label))}</div>`);
        ctx.contentSave = () => { const f = document.getElementById('lessonForm').elements; db.update('contents', x.id, { url: f.x_url.value.trim(), label: f.x_label.value.trim() || 'Open resource' }); };
    }

    // ---------- Quiz builder ----------
    function quizPanel(panel, ctx) {
        const q = lms.quizOf(ctx.l.id);
        const qs = lms.questionsOf(q.id), attempts = db.where('quiz_attempts', a => a.quizId === q.id && a.submittedAt);
        const totalPts = qs.reduce((a, x) => a + (+x.points || 1), 0);
        panel.innerHTML = A.card(A.cardTitle('Quiz settings', attempts.length ? `<a href="#/quizzes/${q.id}" class="text-xs font-semibold text-forest">${ui.plural(attempts.length, 'attempt')} · view results</a>` : '') + `<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                ${A.field('Quiz title', A.input('q_title', q.title), '', 'sm:col-span-2 lg:col-span-4')}
                ${A.field('Instructions', A.textarea('q_instructions', q.instructions, 3), '', 'sm:col-span-2 lg:col-span-4')}
                ${A.field('Passing score (%)', A.input('q_pass', q.passingScore, 'type="number" min="0" max="100"'))}
                ${A.field('Time limit (min)', A.input('q_time', q.timeLimitMin, 'type="number" min="0"'), '0 = no limit')}
                ${A.field('Attempts allowed', A.input('q_attempts', q.maxAttempts, 'type="number" min="0"'), '0 = unlimited')}
                <div class="flex items-end pb-2">${A.toggle('q_shuffle', q.shuffle, 'Shuffle questions')}</div></div>`)
            + `<div class="mt-5">${A.card(A.cardTitle(`Questions <span class="text-slate-400 font-normal text-sm">· ${qs.length} · ${totalPts} points</span>`, '<button type="button" id="addQ" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Add question</button>')
                + (qs.length ? `<ol id="qList" class="space-y-2">${qs.map((x, i) => `<li data-q="${x.id}" class="flex items-start gap-3 rounded-xl border border-slate-200 p-3 bg-white">
                    <span class="drag-handle q-handle w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-300" aria-label="Drag to reorder">☰</span>
                    <div class="flex-1 min-w-0"><div class="text-xs text-slate-500">Q${i + 1} · ${{ single: 'Multiple choice', multiple: 'Multiple answers', truefalse: 'True / False' }[x.type]} · ${x.points || 1} pt</div>
                    <div class="text-sm font-medium text-ink">${esc(x.prompt)}</div>
                    <div class="text-xs text-slate-500 mt-1">${(x.options || []).map(o => `<span class="${(x.correct || []).includes(o.id) ? 'text-forest-600 font-semibold' : ''}">${(x.correct || []).includes(o.id) ? '✓ ' : ''}${esc(o.text)}</span>`).join(' · ')}</div></div>
                    ${A.iconBtn('fa-pen', 'Edit question', `type="button" data-qedit="${x.id}"`)}${A.iconBtn('fa-copy', 'Duplicate question', `type="button" data-qdup="${x.id}"`)}${A.iconBtn('fa-trash', 'Delete question', `type="button" data-qdel="${x.id}"`, true)}</li>`).join('')}</ol>`
                    : A.empty('fa-circle-question', 'No questions yet', 'Add multiple-choice, multiple-answer or true/false questions.')))}</div>`;
        const redraw = () => quizPanel(panel, ctx);
        document.getElementById('addQ').onclick = () => questionModal(q, null, redraw);
        ui.$$('[data-qedit]').forEach(b => b.onclick = () => questionModal(q, db.get('quiz_questions', b.dataset.qedit), redraw));
        ui.$$('[data-qdup]').forEach(b => b.onclick = () => { const o = db.get('quiz_questions', b.dataset.qdup); const d = JSON.parse(JSON.stringify(o)); delete d.id; d.order = db.nextOrder('quiz_questions', { quizId: q.id }); db.insert('quiz_questions', d); redraw(); });
        ui.$$('[data-qdel]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Delete this question?', { okText: 'Delete', danger: true })) { db.remove('quiz_questions', b.dataset.qdel); redraw(); } });
        const list = document.getElementById('qList');
        if (list && window.Sortable) Sortable.create(list, { handle: '.q-handle', animation: 160, ghostClass: 'drag-ghost', onEnd: () => { db.reorder('quiz_questions', ui.$$('[data-q]', list).map(x => x.dataset.q)); redraw(); } });
        ctx.contentSave = () => {
            const f = document.getElementById('lessonForm').elements;
            db.update('quizzes', q.id, { title: f.q_title.value.trim() || ctx.l.title, instructions: f.q_instructions.value, passingScore: Math.min(100, Math.max(0, +f.q_pass.value || 0)), timeLimitMin: Math.max(0, +f.q_time.value || 0), maxAttempts: Math.max(0, +f.q_attempts.value || 0), shuffle: f.q_shuffle.checked });
        };
    }
    function questionModal(quiz, q, done) {
        const data = q ? JSON.parse(JSON.stringify(q)) : { type: 'single', prompt: '', options: [{ id: 'o1', text: '' }, { id: 'o2', text: '' }, { id: 'o3', text: '' }, { id: 'o4', text: '' }], correct: [], explanation: '', points: 1 };
        const m = ui.modal({ title: q ? 'Edit question' : 'Add question', size: 'max-w-2xl', body: `<form class="space-y-4">
            <div class="grid sm:grid-cols-[1fr_120px] gap-3">${A.field('Question type', A.select('type', [['single', 'Multiple choice (one answer)'], ['multiple', 'Multiple answers (select all)'], ['truefalse', 'True / False']], data.type, 'id="qType"'))}${A.field('Points', A.input('points', data.points || 1, 'type="number" min="1"'))}</div>
            ${A.field('Question *', A.textarea('prompt', data.prompt, 2, 'required'))}
            <div><div class="flex items-center justify-between"><div class="field-label mb-0">Answers <span class="font-normal text-slate-400">· mark the correct one(s)</span></div><button type="button" id="addOpt" class="text-xs font-semibold text-forest"><i class="fa-solid fa-plus mr-1"></i>Add answer</button></div><div id="opts" class="space-y-2 mt-2"></div></div>
            ${A.field('Explanation', A.textarea('explanation', data.explanation, 2), 'Shown to students after they submit.')}
            <p id="qErr" class="hidden text-xs text-rose-700"></p>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save question</button></div></form>` });
        const f = m.el.querySelector('form');
        const draw = () => {
            const multi = data.type === 'multiple', tf = data.type === 'truefalse';
            if (tf) { data.options = [{ id: 'o1', text: 'True' }, { id: 'o2', text: 'False' }]; data.correct = data.correct.filter(c => c === 'o1' || c === 'o2').slice(0, 1); }
            m.el.querySelector('#addOpt').classList.toggle('hidden', tf);
            m.el.querySelector('#opts').innerHTML = data.options.map((o, i) => `<div class="flex items-center gap-2"><input type="${multi ? 'checkbox' : 'radio'}" name="correctPick" data-ci="${o.id}" ${data.correct.includes(o.id) ? 'checked' : ''} class="w-4 h-4 accent-[#0C3B2E]" aria-label="Correct answer">
                <input data-oi="${i}" value="${esc(o.text)}" ${tf ? 'readonly' : ''} class="field" placeholder="Answer ${i + 1}">${tf || data.options.length <= 2 ? '' : A.iconBtn('fa-xmark', 'Remove answer', `type="button" data-od="${i}"`, true)}</div>`).join('');
            ui.$$('[data-oi]', m.el).forEach(inp => inp.oninput = () => data.options[+inp.dataset.oi].text = inp.value);
            ui.$$('[data-ci]', m.el).forEach(inp => inp.onchange = () => { data.correct = ui.$$('[data-ci]', m.el).filter(x => x.checked).map(x => x.dataset.ci); });
            ui.$$('[data-od]', m.el).forEach(b => b.onclick = () => { const o = data.options.splice(+b.dataset.od, 1)[0]; data.correct = data.correct.filter(c => c !== o.id); draw(); });
        };
        draw();
        m.el.querySelector('#qType').onchange = e => { const wasTf = data.type === 'truefalse'; data.type = e.target.value; if (wasTf && data.type !== 'truefalse') data.options = [{ id: 'o1', text: 'True' }, { id: 'o2', text: 'False' }, { id: 'o3', text: '' }]; if (data.type === 'single') data.correct = data.correct.slice(0, 1); draw(); };
        m.el.querySelector('#addOpt').onclick = () => { data.options.push({ id: 'o' + (Math.max(0, ...data.options.map(o => +o.id.slice(1))) + 1), text: '' }); draw(); };
        m.el.querySelector('[data-c]').onclick = m.close;
        f.onsubmit = e => {
            e.preventDefault();
            const err = m.el.querySelector('#qErr'), opts = data.options.filter(o => o.text.trim());
            const correct = data.correct.filter(c => opts.some(o => o.id === c));
            const fail = msg => { err.textContent = msg; err.classList.remove('hidden'); };
            if (opts.length < 2) return fail('Add at least two answers.');
            if (!correct.length) return fail('Mark the correct answer.');
            const d = A.formData(f);
            const row = { type: data.type, prompt: d.prompt, options: opts, correct, explanation: d.explanation, points: Math.max(1, +d.points || 1) };
            if (q) db.update('quiz_questions', q.id, row); else db.insert('quiz_questions', Object.assign(row, { quizId: quiz.id, order: db.nextOrder('quiz_questions', { quizId: quiz.id }) }));
            m.close(); done(); ui.toast('Question saved');
        };
    }

    // ---------- Assignment builder ----------
    function assignmentPanel(panel, ctx) {
        const a = lms.assignmentOf(ctx.l.id), subs = db.where('submissions', { assignmentId: a.id });
        let rubric = (a.rubric || []).map(r => Object.assign({}, r));
        panel.innerHTML = A.card(A.cardTitle('Assignment', subs.length ? `<a href="#/assignments?a=${a.id}" class="text-xs font-semibold text-forest">${ui.plural(subs.length, 'submission')} · grade</a>` : '') + `<div class="grid sm:grid-cols-2 gap-4">
            ${A.field('Assignment title', A.input('a_title', a.title), '', 'sm:col-span-2')}
            ${A.field('Instructions', A.textarea('a_instructions', a.instructions, 6), 'Markdown supported.', 'sm:col-span-2')}
            ${A.field('Due', A.select('a_dueMode', [['days', 'Days after enrolling'], ['date', 'Fixed date'], ['none', 'No due date']], a.dueDate ? 'date' : a.dueDays ? 'days' : 'none', 'id="dueMode"'))}
            <div id="dueWrap"></div>
            ${A.field('Maximum score', A.input('a_max', a.maxScore, 'type="number" min="1"'))}
            <div class="space-y-3 pt-6">${A.toggle('a_text', a.allowText !== false, 'Text submission')}${A.toggle('a_file', a.allowFile, 'File upload')}</div>
        </div>
        <div class="mt-6"><div class="flex items-center justify-between mb-2"><div class="field-label mb-0">Rubric</div><button type="button" id="addRub" class="text-xs font-semibold text-forest"><i class="fa-solid fa-plus mr-1"></i>Add criterion</button></div><div id="rub" class="space-y-2"></div><p id="rubTotal" class="field-hint"></p></div>`);
        const dueWrap = document.getElementById('dueWrap');
        const drawDue = () => { const mode = document.getElementById('dueMode').value; dueWrap.innerHTML = mode === 'days' ? A.field('Days after enrolling', A.input('a_dueDays', a.dueDays || 7, 'type="number" min="1"')) : mode === 'date' ? A.field('Due date', A.input('a_dueDate', a.dueDate ? a.dueDate.slice(0, 10) : '', 'type="date"')) : ''; };
        document.getElementById('dueMode').onchange = drawDue; drawDue();
        const drawRub = () => {
            document.getElementById('rub').innerHTML = rubric.map((r, i) => `<div class="grid grid-cols-[1fr_90px_auto] sm:grid-cols-[1fr_2fr_90px_auto] gap-2"><input data-r="${i}" data-k="criterion" value="${esc(r.criterion)}" class="field" placeholder="Criterion"><input data-r="${i}" data-k="description" value="${esc(r.description || '')}" class="field hidden sm:block" placeholder="What good looks like"><input data-r="${i}" data-k="points" type="number" min="0" value="${esc(r.points)}" class="field" placeholder="Pts">${A.iconBtn('fa-xmark', 'Remove criterion', `type="button" data-rd="${i}"`, true)}</div>`).join('') || '<p class="text-xs text-slate-400">No rubric. Add criteria to grade consistently.</p>';
            document.getElementById('rubTotal').textContent = rubric.length ? 'Rubric total: ' + rubric.reduce((s, r) => s + (+r.points || 0), 0) + ' points' : '';
            ui.$$('[data-r]').forEach(inp => inp.oninput = () => { rubric[inp.dataset.r][inp.dataset.k] = inp.dataset.k === 'points' ? +inp.value : inp.value; document.getElementById('rubTotal').textContent = 'Rubric total: ' + rubric.reduce((s, r) => s + (+r.points || 0), 0) + ' points'; });
            ui.$$('[data-rd]').forEach(b => b.onclick = () => { rubric.splice(+b.dataset.rd, 1); drawRub(); });
        };
        drawRub();
        document.getElementById('addRub').onclick = () => { rubric.push({ criterion: '', description: '', points: 10 }); drawRub(); };
        ctx.contentSave = () => {
            const f = document.getElementById('lessonForm').elements, mode = f.a_dueMode.value;
            db.update('assignments', a.id, { title: f.a_title.value.trim() || ctx.l.title, instructions: f.a_instructions.value, maxScore: Math.max(1, +f.a_max.value || 100), allowText: f.a_text.checked, allowFile: f.a_file.checked,
                dueDays: mode === 'days' ? Math.max(1, +f.a_dueDays.value || 7) : null, dueDate: mode === 'date' && f.a_dueDate.value ? new Date(f.a_dueDate.value + 'T23:59:00').toISOString() : null,
                rubric: rubric.filter(r => r.criterion.trim()) });
        };
    }
})();
