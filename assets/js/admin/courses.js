// Courses: list, create/edit course information, and the Course Builder (sections + lessons, drag-and-drop).
(function () {
    const STATUS_TABS = [['', 'All'], ['published', 'Published'], ['draft', 'Draft'], ['archived', 'Archived']];

    // ---------------- Course list ----------------
    A.route('courses', (_, p) => {
        A.crumbs('Courses');
        const status = p.status || '', cat = p.cat || '';
        const draw = () => {
            const list = db.all('courses').filter(c => (!status || c.status === status) && (!cat || c.categoryId === cat) && A.matches(c.title, lms.categoryName(c.categoryId), (lms.primaryInstructor(c.id) || {}).name))
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            document.getElementById('courseRows').innerHTML = list.length ? list.map(row).join('') : A.empty('fa-book-open', 'No courses found', 'Try another filter, or create a new course.', '<a href="#/courses/new" class="btn btn-forest btn-sm">Create course</a>');
            bindRowActions();
        };
        const row = c => {
            const m = lms.courseMeta(c.id, true), ins = lms.primaryInstructor(c.id);
            return `<div class="flex flex-col md:flex-row md:items-center gap-4 p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <a href="#/courses/${c.id}" class="flex items-center gap-4 flex-1 min-w-0">
                    <img src="${esc(c.thumbnail)}" alt="" class="w-24 h-16 rounded-xl object-cover bg-slate-100 shrink-0">
                    <div class="min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="font-semibold text-ink truncate hover:underline">${esc(c.title)}</span>${A.pill(c.status)}${c.visibility !== 'public' ? A.pill(c.visibility === 'private' ? 'hidden' : 'unlisted') : ''}${c.featured ? '<span class="pill bg-gold-100 text-gold-700"><i class="fa-solid fa-star"></i>Featured</span>' : ''}</div>
                    <div class="text-xs text-slate-500 mt-1">${esc(lms.categoryName(c.categoryId))} · ${esc(ins ? ins.name : 'No instructor')} · ${m.sections} sections · ${m.lessons} lessons</div></div></a>
                <div class="flex items-center gap-6 text-sm md:w-[340px] shrink-0">
                    <div class="w-20"><div class="text-xs text-slate-500">Students</div><div class="font-semibold text-ink">${m.enrollments}</div></div>
                    <div class="w-20"><div class="text-xs text-slate-500">Price</div><div class="font-semibold text-ink">${lms.priceOf(c) ? ui.money(lms.priceOf(c)) : 'Free'}</div></div>
                    <div class="flex-1 flex justify-end gap-1">
                        ${A.iconBtn('fa-pen', 'Open course builder', `onclick="location.hash='#/courses/${c.id}'"`)}
                        ${A.iconBtn('fa-eye', 'Preview course', `onclick="window.open('course.html?c=${encodeURIComponent(c.slug)}&preview=1')"`)}
                        ${A.iconBtn('fa-copy', 'Duplicate', `data-dup="${c.id}"`)}
                        ${c.status !== 'archived' ? A.iconBtn('fa-box-archive', 'Archive', `data-archive="${c.id}"`) : A.iconBtn('fa-rotate-left', 'Restore to draft', `data-restore="${c.id}"`)}
                        ${A.iconBtn('fa-trash', 'Delete', `data-del="${c.id}"`, true)}
                    </div></div></div>`;
        };
        A.view().innerHTML = A.header('Courses', 'Create, organise and publish your programs.', `<a href="#/courses/new" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>Create course</a>`)
            + `<div class="flex flex-wrap items-center gap-2 mb-4">${STATUS_TABS.map(([v, l]) => `<a href="#/courses${v || cat ? '?' + new URLSearchParams(Object.assign(v ? { status: v } : {}, cat ? { cat } : {})) : ''}" class="h-9 px-4 rounded-full text-sm font-semibold flex items-center ${status === v ? 'bg-ink text-white' : 'bg-white border border-slate-200 hover:border-ink'}">${l} <span class="ml-2 text-xs opacity-60">${v ? db.count('courses', { status: v }) : db.count('courses')}</span></a>`).join('')}
                <div class="ml-auto w-56">${A.select('catFilter', [['', 'All categories']].concat(db.ordered('categories', c => !c.parentId).map(c => [c.id, c.name])), cat, 'id="catFilter"')}</div></div>`
            + A.card('<div id="courseRows"></div>', 'p-0 overflow-hidden');
        document.getElementById('catFilter').onchange = e => location.hash = '#/courses?' + new URLSearchParams(Object.assign(status ? { status } : {}, e.target.value ? { cat: e.target.value } : {}));
        A.bindSearch(draw);
        draw();
    });

    function bindRowActions() {
        ui.$$('[data-dup]').forEach(b => b.onclick = () => { const c = lms.duplicateCourse(b.dataset.dup); ui.toast('Duplicated as "' + c.title + '"'); location.hash = '#/courses/' + c.id; });
        ui.$$('[data-archive]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Archive this course? It will be hidden from the catalog. Enrolled students keep their records.', { okText: 'Archive' })) { db.update('courses', b.dataset.archive, { status: 'archived' }); ui.toast('Course archived'); A.refresh(); } });
        ui.$$('[data-restore]').forEach(b => b.onclick = () => { db.update('courses', b.dataset.restore, { status: 'draft' }); ui.toast('Restored as draft'); A.refresh(); });
        ui.$$('[data-del]').forEach(b => b.onclick = () => deleteCourse(b.dataset.del));
    }
    async function deleteCourse(id) {
        const c = db.get('courses', id), n = db.count('enrollments', { courseId: id });
        if (!await ui.confirmBox(`Permanently delete "${c.title}" with all its sections, lessons, quizzes and resources?${n ? ` ${n} enrollment(s) and their progress will also be removed. Consider archiving instead.` : ''} Issued certificates are kept.`, { okText: 'Delete course', danger: true })) return;
        db.remove('courses', id); ui.toast('Course deleted'); location.hash = '#/courses';
    }

    // ---------------- Course information form (create + edit) ----------------
    function courseForm(c) {
        const cats = db.ordered('categories', x => !x.parentId), subs = c.categoryId ? db.ordered('categories', { parentId: c.categoryId }) : [];
        const ins = db.all('instructors').sort((a, b) => a.name.localeCompare(b.name)), lead = c.id && lms.primaryInstructor(c.id);
        const levels = db.settings().courses.levels;
        return `<form id="courseForm" class="grid xl:grid-cols-3 gap-5">
            <div class="xl:col-span-2 space-y-5">
                ${A.card(A.cardTitle('Basics') + `<div class="grid sm:grid-cols-2 gap-4">
                    ${A.field('Course title *', A.input('title', c.title, 'required maxlength="120"'), '', 'sm:col-span-2')}
                    ${A.field('URL slug', A.input('slug', c.slug, 'placeholder="generated from the title"'), 'course.html?c=<b>slug</b>', 'sm:col-span-2')}
                    ${A.field('Short description *', A.textarea('shortDescription', c.shortDescription, 2, 'required maxlength="220"'), 'One or two sentences shown on cards and search results.', 'sm:col-span-2')}
                    ${A.field('Full description *', A.textarea('description', c.description, 8, 'required'), 'Supports **bold**, *italic*, lists, ## headings and [links](https://…).', 'sm:col-span-2')}
                </div>`)}
                ${A.card(A.cardTitle('Learning details') + `<div class="grid sm:grid-cols-3 gap-4">
                    ${A.field('What students will learn', `<textarea name="outcomes" data-list rows="6" class="field">${esc((c.outcomes || []).join('\n'))}</textarea>`, 'One outcome per line.')}
                    ${A.field('Requirements', `<textarea name="requirements" data-list rows="6" class="field">${esc((c.requirements || []).join('\n'))}</textarea>`, 'One per line.')}
                    ${A.field('Target audience', `<textarea name="audience" data-list rows="6" class="field">${esc((c.audience || []).join('\n'))}</textarea>`, 'One per line.')}
                </div>`)}
                ${A.card(A.cardTitle('Organisation') + `<div class="grid sm:grid-cols-2 gap-4">
                    ${A.field('Instructor *', A.select('instructorId', [['', 'Select instructor…']].concat(ins.map(i => [i.id, i.name])), lead ? lead.id : '', 'required'), '<a href="#/instructors" class="underline">Manage instructors</a>')}
                    ${A.field('Category', A.select('categoryId', [['', 'Uncategorised']].concat(cats.map(x => [x.id, x.name])), c.categoryId, 'id="catSel"'))}
                    ${A.field('Subcategory', A.select('subcategoryId', [['', 'None']].concat(subs.map(x => [x.id, x.name])), c.subcategoryId, 'id="subSel"'))}
                    ${A.field('Skill level', A.select('level', levels, c.level))}
                    ${A.field('Language', A.input('language', c.language))}
                    ${A.field('Estimated duration (hours)', A.input('estimatedHours', c.estimatedHours, 'type="number" min="0" step="0.5" placeholder="auto from lessons"'))}
                </div>`)}
            </div>
            <div class="space-y-5">
                ${A.card(A.cardTitle('Thumbnail') + `<div class="aspect-video rounded-xl bg-slate-100 overflow-hidden mb-3 flex items-center justify-center text-slate-300" id="thumbPrev">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" class="w-full h-full object-cover">` : '<i class="fa-regular fa-image text-3xl"></i>'}</div>
                    ${A.input('thumbnail', c.thumbnail && !c.thumbnail.startsWith('data:') ? c.thumbnail : '', 'id="thumbUrl" placeholder="https://… image URL"')}
                    <label class="btn btn-outline btn-sm w-full mt-2 cursor-pointer"><i class="fa-solid fa-upload"></i>Upload image (max 1 MB)<input type="file" accept="image/*" id="thumbFile" class="hidden"></label><p class="field-hint">Recommended 1280×720 (16:9).</p>`)}
                ${A.card(A.cardTitle('Pricing') + `<div class="space-y-4">${A.toggle('isFree', c.isFree, 'Free course', 'Anyone can enroll at no cost.')}
                    ${A.field('Price (' + esc(db.settings().payments.currency) + ')', A.input('price', c.price, 'type="number" min="0" step="0.01" id="priceIn"'))}</div>`)}
                ${A.card(A.cardTitle('Publishing') + `<div class="space-y-4">
                    ${A.field('Status', A.select('status', [['draft', 'Draft'], ['published', 'Published'], ['archived', 'Archived']], c.status))}
                    ${A.field('Visibility', A.select('visibility', [['public', 'Public: listed in catalog'], ['unlisted', 'Unlisted: link only'], ['private', 'Private: admins only']], c.visibility))}
                    ${A.toggle('certificateEnabled', c.certificateEnabled, 'Certificate available', 'Issue a certificate on completion.')}
                    ${A.toggle('featured', c.featured, 'Featured', 'Highlight on the homepage.')}
                    ${A.toggle('discussionsEnabled', c.discussionsEnabled !== false, 'Discussions', 'Allow comments on lessons.')}
                    ${A.toggle('sequential', c.sequential, 'Sequential learning', 'Lessons unlock in order.')}</div>`)}
                <button class="btn btn-forest w-full h-12"><i class="fa-solid fa-floppy-disk"></i>${c.id ? 'Save course information' : 'Create course & open builder'}</button>
            </div></form>`;
    }
    function bindCourseForm(c, onSaved) {
        const f = document.getElementById('courseForm');
        let thumbData = c.thumbnail && c.thumbnail.startsWith('data:') ? c.thumbnail : null;
        const setPrev = src => document.getElementById('thumbPrev').innerHTML = src ? `<img src="${esc(src)}" alt="" class="w-full h-full object-cover">` : '<i class="fa-regular fa-image text-3xl"></i>';
        document.getElementById('thumbUrl').oninput = e => { thumbData = null; setPrev(e.target.value); };
        document.getElementById('thumbFile').onchange = async e => { const u = await A.upload(e.target.files[0]); if (u) { thumbData = u.url; document.getElementById('thumbUrl').value = ''; setPrev(u.url); } };
        document.getElementById('catSel').onchange = e => { document.getElementById('subSel').innerHTML = '<option value="">None</option>' + db.ordered('categories', { parentId: e.target.value }).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); };
        const free = f.elements.isFree, price = document.getElementById('priceIn');
        const syncPrice = () => { price.disabled = free.checked; }; free.onchange = syncPrice; syncPrice();
        f.onsubmit = e => {
            e.preventDefault();
            const d = A.formData(f);
            d.thumbnail = thumbData || d.thumbnail;
            d.categoryId = d.categoryId || null; d.subcategoryId = d.subcategoryId || null;
            if (d.isFree) d.price = 0; else if (d.price == null) d.price = db.settings().payments.defaultPrice;
            if (d.status === 'published' && c.id) {
                const block = lms.publishChecklist(c.id).filter(x => !x.ok && x.block);
                if (block.length) { ui.toast('Fix before publishing: ' + block[0].label, 'error'); return; }
            }
            if (d.status === 'published' && !c.id) { ui.toast('Save as draft first, then add sections and lessons before publishing.', 'error'); return; }
            const instructorId = d.instructorId; delete d.instructorId;
            if (c.id) {
                d.slug = lms.uniqueSlug('courses', d.slug || d.title, null, c.id);
                if (d.status === 'published' && !c.publishedAt) d.publishedAt = db.now();
                db.update('courses', c.id, d); lms.setPrimaryInstructor(c.id, instructorId);
                ui.toast('Course information saved'); onSaved(db.get('courses', c.id));
            } else {
                const nc = lms.createCourse(Object.assign(d, { instructorId, slug: d.slug || undefined }));
                lms.addSection(nc.id, { title: 'Introduction', description: '' });
                ui.toast('Course created. Now build the curriculum.'); onSaved(nc);
            }
        };
    }

    A.route('courses/new', () => {
        A.crumbs(['Courses', 'courses'], 'Create course');
        const draft = { title: '', slug: '', shortDescription: '', description: '', thumbnail: '', categoryId: '', subcategoryId: '', level: 'Beginner', language: db.settings().courses.defaultLanguage, estimatedHours: null, price: db.settings().payments.defaultPrice, isFree: false, certificateEnabled: true, outcomes: [], requirements: [], audience: [], status: 'draft', visibility: 'public', discussionsEnabled: true, sequential: false, featured: false };
        A.view().innerHTML = A.header('Create course', 'Step 1 of 2: course information. Next you\'ll add sections and lessons in the builder.') + courseForm(draft);
        bindCourseForm(draft, c => location.hash = '#/courses/' + c.id);
    });

    // ---------------- Course Builder ----------------
    const TABS = [['', 'Curriculum', 'fa-layer-group'], ['info', 'Course Information', 'fa-circle-info'], ['resources', 'Resources', 'fa-paperclip'], ['students', 'Students', 'fa-user-graduate'], ['analytics', 'Analytics', 'fa-chart-column']];
    function builderShell(c, tab) {
        const m = lms.courseMeta(c.id, true);
        return `<div class="bg-white rounded-2xl border border-slate-200/80 p-5 mb-5">
            <div class="flex flex-col lg:flex-row lg:items-center gap-5">
                <img src="${esc(c.thumbnail)}" alt="" class="w-full lg:w-40 aspect-video rounded-xl object-cover bg-slate-100">
                <div class="flex-1 min-w-0"><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">Course builder</div>
                    <h1 class="font-display text-3xl text-ink mt-1 truncate">${esc(c.title)}</h1>
                    <div class="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">${A.pill(c.status)}<span>${esc(lms.categoryName(c.categoryId))}</span>·<span>${m.sections} sections · ${m.lessons} lessons · ${ui.fmtDuration(m.durationMin)}</span>·<span>${m.enrollments} students</span>·<span>Updated ${ui.timeAgo(c.updatedAt)}</span></div></div>
                <div class="flex flex-wrap gap-2">
                    <a href="course.html?c=${encodeURIComponent(c.slug)}&preview=1" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-eye"></i>Preview Course</a>
                    <button id="dupCourse" class="btn btn-outline btn-sm"><i class="fa-solid fa-copy"></i>Duplicate</button>
                    ${c.status === 'published' ? '<button id="unpublish" class="btn btn-outline btn-sm"><i class="fa-solid fa-eye-slash"></i>Unpublish</button>' : '<button id="publish" class="btn btn-gold btn-sm"><i class="fa-solid fa-rocket"></i>Publish</button>'}
                    <div class="relative"><button id="moreBtn" class="btn btn-outline btn-sm" aria-label="More actions"><i class="fa-solid fa-ellipsis"></i></button>
                        <div id="moreMenu" class="hidden absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lift border py-1 z-10 text-sm">
                            ${c.status !== 'archived' ? '<button data-act="archive" class="w-full text-left px-4 py-2 hover:bg-slate-50"><i class="fa-solid fa-box-archive w-5 text-slate-400"></i>Archive</button>' : '<button data-act="restore" class="w-full text-left px-4 py-2 hover:bg-slate-50"><i class="fa-solid fa-rotate-left w-5 text-slate-400"></i>Restore</button>'}
                            <button data-act="delete" class="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-700"><i class="fa-solid fa-trash w-5"></i>Delete course</button></div></div>
                </div></div>
            <nav class="flex gap-1 mt-5 -mb-5 border-t border-slate-100 pt-1 overflow-x-auto no-scrollbar">${TABS.map(([k, l, ic]) => `<a href="#/courses/${c.id}${k ? '/' + k : ''}" class="px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 ${tab === k ? 'border-gold text-ink' : 'border-transparent text-slate-500 hover:text-ink'}"><i class="fa-solid ${ic} mr-1.5 text-xs"></i>${l}</a>`).join('')}</nav></div>
            <div id="builderBody"></div>`;
    }
    function bindShell(c) {
        document.getElementById('dupCourse').onclick = () => { const d = lms.duplicateCourse(c.id); ui.toast('Duplicated'); location.hash = '#/courses/' + d.id; };
        const pub = document.getElementById('publish'), unpub = document.getElementById('unpublish');
        if (pub) pub.onclick = () => publish(c.id);
        if (unpub) unpub.onclick = () => { db.update('courses', c.id, { status: 'draft' }); ui.toast('Course unpublished (now draft)'); A.refresh(); };
        const mb = document.getElementById('moreBtn'), mm = document.getElementById('moreMenu');
        mb.onclick = e => { e.stopPropagation(); mm.classList.toggle('hidden'); };
        document.addEventListener('click', () => mm.classList.add('hidden'), { once: true });
        ui.$$('[data-act]', mm).forEach(b => b.onclick = async () => {
            if (b.dataset.act === 'delete') return deleteCourse(c.id);
            if (b.dataset.act === 'archive' && await ui.confirmBox('Archive this course?', { okText: 'Archive' })) { db.update('courses', c.id, { status: 'archived' }); A.refresh(); }
            if (b.dataset.act === 'restore') { db.update('courses', c.id, { status: 'draft' }); A.refresh(); }
        });
    }
    function publish(courseId) {
        const list = lms.publishChecklist(courseId), block = list.filter(x => !x.ok && x.block);
        const m = ui.modal({ title: block.length ? 'Almost ready to publish' : 'Publish this course?', size: 'max-w-md', body: `
            <ul class="space-y-2.5">${list.map(x => `<li class="flex items-start gap-3 text-sm"><i class="fa-solid ${x.ok ? 'fa-circle-check text-forest-400' : x.block ? 'fa-circle-xmark text-rose-600' : 'fa-triangle-exclamation text-amber-500'} mt-0.5"></i><span class="${x.ok ? 'text-slate-600' : 'text-ink font-medium'}">${esc(x.label)}${!x.ok && !x.block ? ' <span class="text-xs text-slate-400">(recommended)</span>' : ''}</span></li>`).join('')}</ul>
            ${block.length ? '<p class="text-sm text-rose-700 mt-4">Fix the items marked in red, then publish.</p>' : '<p class="text-sm text-slate-600 mt-4">Published sections and lessons become visible to students immediately. Draft items stay hidden.</p>'}
            <div class="flex justify-end gap-2 mt-6"><button data-x class="btn btn-outline btn-sm">Close</button>${block.length ? '' : '<button data-go class="btn btn-gold btn-sm"><i class="fa-solid fa-rocket"></i>Publish now</button>'}</div>` });
        m.el.querySelector('[data-x]').onclick = m.close;
        const go = m.el.querySelector('[data-go]');
        if (go) go.onclick = () => { const c = db.get('courses', courseId); db.update('courses', courseId, { status: 'published', publishedAt: c.publishedAt || db.now() }); m.close(); ui.toast('Course published'); A.refresh(); };
    }

    A.route('courses/:id', ({ id }) => builder(id, ''));
    A.route('courses/:id/:tab', ({ id, tab }) => builder(id, tab));

    function builder(id, tab) {
        const c = db.get('courses', id);
        if (!c) { A.view().innerHTML = A.empty('fa-book', 'Course not found', '', '<a href="#/courses" class="btn btn-forest btn-sm">All courses</a>'); return; }
        A.crumbs(['Courses', 'courses'], c.title);
        A.view().innerHTML = builderShell(c, tab);
        bindShell(c);
        const body = document.getElementById('builderBody');
        if (tab === '') curriculum(c, body);
        if (tab === 'info') { body.innerHTML = courseForm(c); bindCourseForm(c, () => A.refresh()); }
        if (tab === 'resources') A.resourcesPanel(body, { courseId: c.id });
        if (tab === 'students') A.courseStudents(body, c);
        if (tab === 'analytics') A.courseAnalyticsPanel(body, c);
    }

    // ---- Curriculum (sections + lessons) ----
    const sortables = [];
    function curriculum(c, body) {
        const sections = db.ordered('sections', { courseId: c.id });
        const checklist = lms.publishChecklist(c.id), done = checklist.filter(x => x.ok).length;
        body.innerHTML = `<div class="grid xl:grid-cols-[1fr_300px] gap-5 items-start">
            <div>
                <div class="flex flex-wrap items-center justify-between gap-3 mb-3"><div class="text-sm text-slate-500"><i class="fa-solid fa-grip-vertical mr-1"></i>Drag <b>☰</b> handles to reorder sections and lessons. Lessons can move between sections.</div>
                    <div class="flex gap-2"><button id="expandAll" class="btn btn-ghost btn-sm">Collapse all</button><button id="publishAll" class="btn btn-outline btn-sm"><i class="fa-solid fa-check-double"></i>Publish all items</button></div></div>
                <div id="sectionList" class="space-y-4">${sections.map((s, i) => sectionCard(c, s, i)).join('')}</div>
                ${!sections.length ? A.card(A.empty('fa-layer-group', 'No sections yet', 'Sections (modules) group your lessons, e.g. "HTML Fundamentals".')) : ''}
                <form id="addSection" class="mt-4 bg-white rounded-2xl border-2 border-dashed border-slate-200 p-4 flex flex-col sm:flex-row gap-3">
                    <input name="title" required maxlength="120" class="field" placeholder="New section title, e.g. CSS Fundamentals">
                    <input name="description" maxlength="240" class="field" placeholder="Short description (optional)">
                    <button class="btn btn-forest shrink-0"><i class="fa-solid fa-plus"></i>Add Section</button></form>
            </div>
            <aside class="space-y-5 xl:sticky xl:top-24">
                ${A.card(A.cardTitle('Ready to publish?', `<span class="text-xs font-semibold text-slate-500">${done}/${checklist.length}</span>`) + `<div class="h-1.5 bg-slate-100 rounded-full mb-4"><div class="h-1.5 rounded-full bg-forest-600" style="width:${done / checklist.length * 100}%"></div></div>
                    <ul class="space-y-2">${checklist.map(x => `<li class="flex items-start gap-2.5 text-xs"><i class="fa-solid ${x.ok ? 'fa-circle-check text-forest-400' : x.block ? 'fa-circle text-slate-200' : 'fa-circle text-amber-200'} mt-0.5"></i><span class="${x.ok ? 'text-slate-500' : 'text-ink'}">${esc(x.label)}</span></li>`).join('')}</ul>`)}
                ${A.card(A.cardTitle('Lesson types') + `<ul class="space-y-2 text-xs text-slate-600">${Object.entries(ui.LESSON_TYPES).map(([k, t]) => `<li class="flex items-center gap-2.5"><span class="w-7 h-7 rounded-lg bg-forest-50 text-forest flex items-center justify-center"><i class="fa-solid ${t.icon}"></i></span>${t.label}</li>`).join('')}</ul>`)}
            </aside></div>`;
        bindCurriculum(c);
    }
    function sectionCard(c, s, i) {
        const lessons = db.ordered('lessons', { sectionId: s.id });
        const mins = lessons.reduce((a, l) => a + (+l.durationMin || 0), 0);
        return `<div class="bg-white rounded-2xl border border-slate-200/80 overflow-hidden" data-section="${s.id}">
            <div class="flex items-center gap-3 px-4 py-3 bg-ivory/70 border-b border-slate-100">
                <span class="drag-handle sec-handle w-8 h-8 rounded-lg hover:bg-white flex items-center justify-center text-slate-400 shrink-0" title="Drag to reorder section" aria-label="Drag to reorder section">☰</span>
                <button data-collapse="${s.id}" class="flex-1 min-w-0 text-left"><div class="text-[11px] font-bold uppercase tracking-[0.15em] text-gold-600">Section ${i + 1}</div>
                    <div class="font-semibold text-ink truncate">${esc(s.title)}</div></button>
                <span class="hidden sm:block text-xs text-slate-500 whitespace-nowrap">${ui.plural(lessons.length, 'lesson')} · ${ui.fmtDuration(mins)}</span>
                <button data-sec-status="${s.id}" class="pill pill-${s.status} cursor-pointer" title="Click to ${s.status === 'published' ? 'unpublish' : 'publish'}">${s.status}</button>
                <div class="flex shrink-0">${A.iconBtn('fa-pen', 'Edit section', `data-sec-edit="${s.id}"`)}<span class="hidden sm:flex">${A.iconBtn('fa-copy', 'Duplicate section', `data-sec-dup="${s.id}"`)}</span>${A.iconBtn('fa-trash', 'Delete section', `data-sec-del="${s.id}"`, true)}</div>
            </div>
            <div data-body="${s.id}">
                <ul class="lesson-list min-h-[12px] divide-y divide-slate-100" data-section-id="${s.id}">${lessons.map((l, j) => lessonRow(c, l, j)).join('')}</ul>
                <div class="px-4 py-3 border-t border-slate-100"><button data-add-lesson="${s.id}" class="text-sm font-semibold text-forest hover:text-forest-600"><i class="fa-solid fa-plus mr-1.5"></i>Add Lesson</button></div>
            </div></div>`;
    }
    function lessonRow(c, l, j) {
        const T = ui.LESSON_TYPES[l.type] || ui.LESSON_TYPES.article;
        const video = l.type === 'video' && lms.contentsOf(l.id).find(x => x.kind === 'video');
        const warn = (l.type === 'video' && !(video && video.url)) ? 'No video yet' : (l.type === 'quiz' && !(lms.quizOf(l.id) && lms.questionsOf(lms.quizOf(l.id).id).length)) ? 'No questions yet' : '';
        return `<li class="flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-50/70" data-lesson-id="${l.id}">
            <span class="drag-handle les-handle shrink-0 w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-300 text-sm" title="Drag to reorder lesson" aria-label="Drag to reorder lesson">☰</span>
            <span class="w-8 h-8 rounded-lg bg-forest-50 text-forest hidden sm:flex items-center justify-center text-xs shrink-0" title="${T.label}"><i class="fa-solid ${T.icon}"></i></span>
            <a href="#/courses/${c.id}/lessons/${l.id}" class="flex-1 min-w-0"><div class="text-sm font-medium text-ink truncate hover:underline"><span class="text-slate-400 font-normal hidden sm:inline">Lesson ${j + 1} · </span>${esc(l.title)}</div>
                <div class="text-[11px] text-slate-500 flex flex-wrap gap-x-2"><span class="sm:hidden capitalize">${l.status} ·</span>${T.label}${l.durationMin ? ' · ' + ui.fmtDuration(l.durationMin) : ''}${l.isPreview ? ' · <span class="text-forest-600 font-semibold">Free preview</span>' : ''}${warn ? ` · <span class="text-amber-600 font-semibold"><i class="fa-solid fa-triangle-exclamation"></i> ${warn}</span>` : ''}</div></a>
            <button data-les-status="${l.id}" class="pill pill-${l.status} cursor-pointer hidden sm:inline-flex" title="Click to ${l.status === 'published' ? 'unpublish' : 'publish'}">${l.status}</button>
            <div class="flex shrink-0">${A.iconBtn('fa-pen', 'Edit lesson', `onclick="location.hash='#/courses/${c.id}/lessons/${l.id}'"`)}<span class="hidden sm:flex">${A.iconBtn('fa-eye', 'Preview lesson', `onclick="window.open('learn.html?c=${encodeURIComponent(c.slug)}&l=${l.id}&preview=1')"`)}${A.iconBtn('fa-copy', 'Duplicate lesson', `data-les-dup="${l.id}"`)}</span>${A.iconBtn('fa-trash', 'Delete lesson', `data-les-del="${l.id}"`, true)}</div></li>`;
    }
    function bindCurriculum(c) {
        const redraw = () => { const b = document.getElementById('builderBody'); curriculum(db.get('courses', c.id), b); };
        sortables.splice(0).forEach(s => s.destroy());
        if (window.Sortable) {
            sortables.push(Sortable.create(document.getElementById('sectionList'), {
                handle: '.sec-handle', animation: 180, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen',
                onEnd: () => { db.reorder('sections', ui.$$('#sectionList > [data-section]').map(el => el.dataset.section)); redraw(); ui.toast('Section order saved'); }
            }));
            ui.$$('.lesson-list').forEach(list => sortables.push(Sortable.create(list, {
                group: 'lessons', handle: '.les-handle', animation: 180, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen',
                onEnd: e => {
                    const ids = el => ui.$$('[data-lesson-id]', el).map(x => x.dataset.lessonId);
                    db.tx(() => {
                        db.reorder('lessons', ids(e.to), { sectionId: e.to.dataset.sectionId });
                        if (e.from !== e.to) db.reorder('lessons', ids(e.from), { sectionId: e.from.dataset.sectionId });
                    });
                    redraw(); ui.toast(e.from !== e.to ? 'Lesson moved to another section' : 'Lesson order saved');
                }
            })));
        }
        document.getElementById('addSection').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target); lms.addSection(c.id, d); db.update('courses', c.id, {}); redraw(); ui.toast('Section added'); };
        const expandBtn = document.getElementById('expandAll');
        expandBtn.onclick = () => { const collapse = expandBtn.textContent.includes('Collapse'); ui.$$('[data-body]').forEach(b => b.classList.toggle('hidden', collapse)); expandBtn.textContent = collapse ? 'Expand all' : 'Collapse all'; };
        ui.$$('[data-collapse]').forEach(b => b.onclick = () => document.querySelector(`[data-body="${b.dataset.collapse}"]`).classList.toggle('hidden'));
        document.getElementById('publishAll').onclick = async () => {
            if (!await ui.confirmBox('Publish every section and lesson in this course? (The course itself is published separately.)', { okText: 'Publish all' })) return;
            db.tx(() => db.where('sections', { courseId: c.id }).forEach(s => { db.update('sections', s.id, { status: 'published' }); db.where('lessons', { sectionId: s.id }).forEach(l => db.update('lessons', l.id, { status: 'published' })); }));
            redraw(); ui.toast('All sections and lessons published');
        };
        ui.$$('[data-sec-status]').forEach(b => b.onclick = () => { const s = db.get('sections', b.dataset.secStatus); db.update('sections', s.id, { status: s.status === 'published' ? 'draft' : 'published' }); redraw(); });
        ui.$$('[data-les-status]').forEach(b => b.onclick = () => { const l = db.get('lessons', b.dataset.lesStatus); db.update('lessons', l.id, { status: l.status === 'published' ? 'draft' : 'published' }); redraw(); });
        ui.$$('[data-sec-edit]').forEach(b => b.onclick = () => editSection(db.get('sections', b.dataset.secEdit), redraw));
        ui.$$('[data-sec-dup]').forEach(b => b.onclick = () => { lms.duplicateSection(b.dataset.secDup); redraw(); ui.toast('Section duplicated (as draft)'); });
        ui.$$('[data-sec-del]').forEach(b => b.onclick = async () => {
            const s = db.get('sections', b.dataset.secDel), n = db.count('lessons', { sectionId: s.id });
            if (await ui.confirmBox(`Delete section "${s.title}"${n ? ` and its ${ui.plural(n, 'lesson')} (with their content, quizzes and student progress)` : ''}?`, { okText: 'Delete', danger: true })) { db.remove('sections', s.id); redraw(); ui.toast('Section deleted'); }
        });
        ui.$$('[data-les-dup]').forEach(b => b.onclick = () => { lms.duplicateLesson(b.dataset.lesDup); redraw(); ui.toast('Lesson duplicated (as draft)'); });
        ui.$$('[data-les-del]').forEach(b => b.onclick = async () => {
            const l = db.get('lessons', b.dataset.lesDel);
            if (await ui.confirmBox(`Delete lesson "${l.title}" with its content and student progress?`, { okText: 'Delete', danger: true })) { db.remove('lessons', l.id); redraw(); ui.toast('Lesson deleted'); }
        });
        ui.$$('[data-add-lesson]').forEach(b => b.onclick = () => addLessonModal(c, b.dataset.addLesson));
    }
    function editSection(s, done) {
        const m = ui.modal({ title: 'Edit section', body: `<form class="space-y-4">${A.field('Section title', A.input('title', s.title, 'required maxlength="120"'))}${A.field('Description', A.textarea('description', s.description, 3))}${A.field('Status', A.select('status', [['draft', 'Draft'], ['published', 'Published']], s.status))}<div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save section</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => { e.preventDefault(); db.update('sections', s.id, A.formData(e.target)); m.close(); done(); ui.toast('Section saved'); };
    }
    function addLessonModal(c, sectionId) {
        const m = ui.modal({ title: 'Add lesson', size: 'max-w-xl', body: `<form class="space-y-5">
            ${A.field('Lesson title', A.input('title', '', 'required maxlength="140" placeholder="e.g. Headings and Paragraphs"'))}
            <div><div class="field-label">Content type</div><div class="grid sm:grid-cols-2 gap-2">${Object.entries(ui.LESSON_TYPES).map(([k, t], i) => `<label class="flex items-center gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:border-forest has-[:checked]:border-forest has-[:checked]:bg-forest-50"><input type="radio" name="type" value="${k}" ${i === 0 ? 'checked' : ''} class="accent-[#0C3B2E]"><i class="fa-solid ${t.icon} text-forest w-4"></i><span class="text-sm font-medium">${t.label}</span></label>`).join('')}</div></div>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button name="go" value="stay" class="btn btn-outline btn-sm">Add & add another</button><button name="go" value="edit" class="btn btn-forest btn-sm">Add & edit content</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        const f = m.el.querySelector('form');
        f.onsubmit = e => {
            e.preventDefault();
            const d = A.formData(f), l = lms.addLesson(sectionId, { title: d.title, type: d.type });
            if (e.submitter && e.submitter.value === 'stay') { f.reset(); f.title.focus(); ui.toast('Lesson added'); curriculum(db.get('courses', c.id), document.getElementById('builderBody')); return; }
            m.close(); location.hash = `#/courses/${c.id}/lessons/${l.id}`;
        };
    }
})();
