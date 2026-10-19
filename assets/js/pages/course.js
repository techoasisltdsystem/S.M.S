// Course landing page. With ?preview=1 (admin session) it shows drafts exactly as students will see them.
(function () {
    const { db, lms, ui, auth } = TOS, esc = ui.esc;
    const slug = ui.qs('c');
    const preview = ui.qs('preview') === '1' && auth.isAdmin();
    const app = document.getElementById('app');
    TOS.chrome.mount();

    function notFound(msg) {
        app.innerHTML = `<div class="max-w-xl mx-auto text-center py-24 px-4"><span class="w-16 h-16 mx-auto rounded-2xl bg-forest text-gold flex items-center justify-center text-2xl"><i class="fa-solid fa-compass"></i></span>
            <h1 class="font-display text-3xl text-ink mt-6">${esc(msg)}</h1><p class="text-slate-600 mt-2">It may have been moved, renamed or not published yet.</p><a href="index.html#catalog" class="btn btn-forest mt-6">Browse all programmes</a></div>`;
    }

    function render() {
        const course = lms.courseBySlug(slug);
        if (!course) return notFound('We couldn\'t find that programme');
        const visible = preview || (course.status === 'published' && course.visibility !== 'private');
        if (!visible) return notFound('This programme isn\'t available');
        document.title = course.title + ' | Tech Oasis School';

        const me = auth.current();
        const t = lms.tree(course.id, preview), meta = lms.courseMeta(course.id, preview), r = meta.rating;
        const instructors = lms.courseInstructors(course.id), lead = instructors[0];
        const cat = lms.category(course.categoryId), sub = lms.category(course.subcategoryId);
        const enr = me && lms.enrollmentOf(me.id, course.id);
        const pay = enr && lms.paymentState(enr);
        const price = lms.priceOf(course), st = db.settings();
        const prog = enr ? lms.progress(me.id, course.id) : null;
        const lessonUrl = l => preview ? `learn.html?c=${encodeURIComponent(course.slug)}${l ? '&l=' + l.id : ''}&preview=1` : l ? '/student/learn/' + l.id : '/student/course/' + course.id;
        const durTotal = t.sections.reduce((a, s) => a + s.lessons.reduce((b, l) => b + (+l.durationMin || 0), 0), 0);

        const ctaMain = preview ? `<a href="${lessonUrl()}" class="btn btn-gold w-full h-12">Open the learner view <i class="fa-solid fa-arrow-right text-xs"></i></a>`
            : enr && (pay === 'overdue' || pay === 'pending') ? `<button onclick="TOS.coursePage.checkout()" class="btn btn-gold w-full h-12"><i class="fa-solid fa-lock-open"></i> Complete payment to continue</button>`
            : enr ? `<a href="${lessonUrl()}" class="btn btn-gold w-full h-12"><i class="fa-solid fa-play text-xs"></i> ${prog && prog.done ? 'Continue learning' : 'Start learning'}</a>`
            : `<button onclick="TOS.coursePage.enroll()" class="btn btn-gold w-full h-12">${price ? (st.payments.trialDays ? `Start ${st.payments.trialDays}-day free trial` : 'Enroll now') : 'Enroll for free'}</button>`;

        app.innerHTML = `
        ${preview ? `<div class="bg-gold text-ink text-sm no-print"><div class="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <span><i class="fa-solid fa-eye mr-2"></i><b>Preview mode.</b> This is exactly what students see. Course status: <span class="pill pill-${course.status} ml-1">${course.status}</span> Draft sections and lessons are included.</span>
            <a href="admin.html#/courses/${course.id}" class="btn btn-ink btn-sm"><i class="fa-solid fa-arrow-left"></i> Back to course builder</a></div></div>` : ''}

        <section class="bg-ink text-white relative overflow-hidden grain">
            <div class="absolute -right-32 -top-32 w-[520px] h-[520px] rounded-full bg-gold/10 blur-3xl"></div>
            <div class="relative max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14 grid lg:grid-cols-[1fr_380px] gap-10">
                <div>
                    <nav class="text-xs text-white/60 flex flex-wrap items-center gap-2" aria-label="Breadcrumb"><a href="index.html" class="hover:text-gold">Home</a><i class="fa-solid fa-chevron-right text-[8px]"></i><a href="index.html#catalog" class="hover:text-gold">${esc(cat ? cat.name : 'Programmes')}</a>${sub ? `<i class="fa-solid fa-chevron-right text-[8px]"></i><span>${esc(sub.name)}</span>` : ''}</nav>
                    <h1 class="font-display text-4xl sm:text-5xl leading-[1.08] mt-5">${esc(course.title)}</h1>
                    <p class="text-white/75 text-lg mt-4 max-w-2xl">${esc(course.shortDescription)}</p>
                    <div class="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6 text-sm">
                        ${lead ? `<span class="flex items-center gap-2">${lead.avatar ? `<img src="${esc(lead.avatar)}" alt="" class="w-8 h-8 rounded-full object-cover">` : ''}Instructor: <a href="#instructor" class="font-semibold text-gold-200 underline underline-offset-4">${esc(lead.name)}</a></span>` : ''}
                        ${r.count ? `<span class="flex items-center gap-2"><b class="text-gold">${r.avg.toFixed(1)}</b><span class="text-gold text-xs">${ui.stars(r.avg)}</span><a href="#reviews" class="text-white/60 underline underline-offset-4">${ui.plural(r.count, 'review')}</a></span>` : ''}
                        <span class="text-white/60"><b class="text-white">${meta.enrollments.toLocaleString()}</b> already enrolled</span>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 max-w-3xl">
                        ${[['fa-signal', course.level, 'Level'], ['fa-clock', meta.hours + ' hours', 'Estimated'], ['fa-language', course.language, 'Language'], ['fa-award', course.certificateEnabled ? 'Certificate' : 'No certificate', course.certificateEnabled ? 'On completion' : '']]
                            .map(([ic, v, l]) => `<div class="rounded-2xl bg-white/5 border border-white/10 p-4"><i class="fa-solid ${ic} text-gold"></i><div class="font-semibold mt-2 text-sm">${esc(v)}</div><div class="text-[11px] text-white/50">${esc(l)}</div></div>`).join('')}
                    </div>
                </div>
                <aside>
                    <div class="bg-white text-ink rounded-xl shadow-lift overflow-hidden">
                        <div class="relative aspect-video bg-slate-200">${course.thumbnail ? `<img src="${esc(course.thumbnail)}" alt="" class="w-full h-full object-cover">` : ''}
                            ${t.sections.some(s => s.lessons.some(l => l.isPreview)) ? `<a href="${lessonUrl(t.sections.flatMap(s => s.lessons).find(l => l.isPreview))}" class="absolute inset-0 flex items-center justify-center bg-ink/30 hover:bg-ink/40 transition group"><span class="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center text-forest text-xl shadow-lift group-hover:scale-110 transition"><i class="fa-solid fa-play ml-1"></i></span><span class="absolute bottom-3 text-white text-xs font-semibold">Preview this programme</span></a>` : ''}</div>
                        <div class="p-6">
                            ${enr && !preview ? `<div class="mb-4"><div class="flex justify-between text-xs font-semibold text-slate-500 mb-1"><span>Your progress</span><span>${prog.pct}%</span></div><div class="h-2 bg-slate-100 rounded-full"><div class="h-2 rounded-full bg-gradient-to-r from-forest-600 to-gold" style="width:${prog.pct}%"></div></div>
                                ${pay === 'trial' ? `<p class="text-xs text-gold-700 mt-2"><i class="fa-solid fa-hourglass-half mr-1"></i>Free trial ends ${ui.fmtDate(enr.trialEndsAt)}. <button onclick="TOS.coursePage.checkout()" class="underline font-semibold">Pay now</button></p>` : ''}</div>`
                                : `<div class="flex items-baseline gap-2"><span class="font-display text-4xl">${price ? ui.money(price) : 'Free'}</span>${price ? '<span class="text-sm text-slate-500">one-time</span>' : ''}</div>
                                   ${price && st.payments.trialDays ? `<p class="text-sm text-forest-600 font-semibold mt-1"><i class="fa-solid fa-gift mr-1"></i>${st.payments.trialDays}-day free trial, then ${ui.money(price)}</p>` : ''}`}
                            <div class="mt-5">${ctaMain}</div>
                            <ul class="mt-6 space-y-2.5 text-sm text-slate-600">
                                <li><i class="fa-solid fa-layer-group w-5 text-forest-400"></i>${ui.plural(meta.sections, 'section')} · ${ui.plural(meta.lessons, 'lesson')}</li>
                                ${meta.videos ? `<li><i class="fa-solid fa-circle-play w-5 text-forest-400"></i>${ui.fmtDuration(durTotal)} of learning content</li>` : ''}
                                ${meta.quizzes ? `<li><i class="fa-solid fa-circle-question w-5 text-forest-400"></i>${ui.plural(meta.quizzes, 'quiz', 'quizzes')}</li>` : ''}
                                ${meta.assignments ? `<li><i class="fa-solid fa-file-pen w-5 text-forest-400"></i>${ui.plural(meta.assignments, 'graded assignment')}</li>` : ''}
                                ${lms.resourcesOf({ courseId: course.id }).length ? `<li><i class="fa-solid fa-download w-5 text-forest-400"></i>Downloadable resources</li>` : ''}
                                ${course.certificateEnabled ? `<li><i class="fa-solid fa-award w-5 text-forest-400"></i>Certificate of completion</li>` : ''}
                                <li><i class="fa-solid fa-mobile-screen w-5 text-forest-400"></i>Learn on any device, at your pace</li>
                            </ul>
                        </div>
                    </div>
                </aside>
            </div>
        </section>

        <div class="sticky top-[68px] z-30 bg-white border-b border-slate-200/70 no-print"><nav class="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 overflow-x-auto no-scrollbar text-sm font-semibold text-slate-600">
            ${[['about', 'About'], ['outcomes', 'Outcomes'], ['curriculum', 'Curriculum'], ['instructor', 'Instructor'], ['reviews', 'Reviews'], ['enroll', 'Enrollment']].map(([id, l]) => `<a href="#${id}" class="py-4 border-b-2 border-transparent hover:border-gold hover:text-ink whitespace-nowrap">${l}</a>`).join('')}</nav></div>

        <div class="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div class="min-w-0 max-w-[880px] py-10 space-y-14">
            <section id="about" class="scroll-mt-36"><h2 class="font-display text-3xl text-ink">About this programme</h2><div class="prose-tos mt-4">${ui.md(course.description)}</div></section>

            ${(course.outcomes || []).length ? `<section id="outcomes" class="scroll-mt-36 rounded-xl border border-slate-200/70 bg-white p-7 shadow-luxe"><h2 class="font-display text-2xl text-ink">What you'll learn</h2>
                <ul class="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-5">${course.outcomes.map(o => `<li class="flex gap-3 text-sm text-slate-700"><i class="fa-solid fa-check text-forest-400 mt-1"></i>${esc(o)}</li>`).join('')}</ul></section>` : '<span id="outcomes"></span>'}

            <div class="grid sm:grid-cols-2 gap-5">
                ${(course.requirements || []).length ? `<section class="rounded-xl bg-ivory-100 border border-ivory-200 p-6"><h3 class="font-display text-xl text-ink">Requirements</h3><ul class="mt-3 space-y-2 text-sm text-slate-700">${course.requirements.map(x => `<li class="flex gap-3"><i class="fa-solid fa-circle text-[6px] text-gold mt-2"></i>${esc(x)}</li>`).join('')}</ul></section>` : ''}
                ${(course.audience || []).length ? `<section class="rounded-xl bg-ivory-100 border border-ivory-200 p-6"><h3 class="font-display text-xl text-ink">Who this programme is for</h3><ul class="mt-3 space-y-2 text-sm text-slate-700">${course.audience.map(x => `<li class="flex gap-3"><i class="fa-solid fa-circle text-[6px] text-gold mt-2"></i>${esc(x)}</li>`).join('')}</ul></section>` : ''}
            </div>

            <section id="curriculum" class="scroll-mt-36">
                <div class="flex flex-wrap items-end justify-between gap-3"><div><h2 class="font-display text-3xl text-ink">Curriculum</h2><p class="text-sm text-slate-500 mt-1">${ui.plural(meta.sections, 'section')} · ${ui.plural(meta.lessons, 'lesson')} · ${ui.fmtDuration(durTotal)} total</p></div>
                    <button onclick="document.querySelectorAll('#curriculumList details').forEach(d => d.open = !this.dataset.open); this.dataset.open = this.dataset.open ? '' : '1'; this.textContent = this.dataset.open ? 'Collapse all' : 'Expand all'" class="text-sm font-semibold text-forest">Expand all</button></div>
                <div id="curriculumList" class="mt-5 rounded-xl border border-slate-200/70 bg-white overflow-hidden divide-y divide-slate-200/70 shadow-luxe">
                    ${t.sections.map((s, i) => {
                        const sp = prog && prog.sections.find(x => x.id === s.id);
                        return `<details ${i === 0 ? 'open' : ''} class="group">
                        <summary class="list-none cursor-pointer flex items-center gap-4 px-5 sm:px-6 py-5 hover:bg-ivory/60">
                            <span class="w-9 h-9 rounded-xl ${sp && sp.status === 'complete' ? 'bg-forest text-gold' : 'bg-forest-50 text-forest'} flex items-center justify-center text-sm font-bold shrink-0">${sp && sp.status === 'complete' ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>
                            <span class="flex-1 min-w-0"><span class="block font-semibold text-ink">${esc(s.title)}${preview && s.status !== 'published' ? ' <span class="pill pill-draft ml-1">draft</span>' : ''}</span>
                            <span class="block text-xs text-slate-500 mt-0.5">${ui.plural(s.lessons.length, 'lesson')} · ${ui.fmtDuration(s.lessons.reduce((a, l) => a + (+l.durationMin || 0), 0))}${sp ? ` · ${sp.pct}% complete` : ''}</span></span>
                            <i class="fa-solid fa-chevron-down text-xs text-slate-400 group-open:rotate-180 transition"></i></summary>
                        ${s.description ? `<p class="px-5 sm:px-6 pl-[4.25rem] sm:pl-[4.5rem] -mt-2 pb-3 text-sm text-slate-500">${esc(s.description)}</p>` : ''}
                        <ul class="pb-3">${s.lessons.map(l => {
                            const T = ui.LESSON_TYPES[l.type] || ui.LESSON_TYPES.article, done = me && lms.isComplete(me.id, l.id);
                            const open = preview || l.isPreview || (enr && pay !== 'overdue' && pay !== 'pending');
                            return `<li><${open ? `a href="${lessonUrl(l)}"` : 'div'} class="flex items-center gap-4 px-5 sm:px-6 py-2.5 ${open ? 'hover:bg-ivory/60' : ''}">
                                <i class="fa-solid ${done ? 'fa-circle-check text-forest-400' : T.icon + ' text-slate-400'} w-9 text-center"></i>
                                <span class="flex-1 min-w-0 text-sm ${open ? 'text-ink' : 'text-slate-600'} truncate">${esc(l.title)}${preview && l.status !== 'published' ? ' <span class="pill pill-draft ml-1">draft</span>' : ''}</span>
                                ${l.isPreview && !enr ? '<span class="text-xs font-semibold text-forest underline underline-offset-2">Preview</span>' : ''}
                                <span class="text-xs text-slate-400 w-14 text-right">${l.durationMin ? ui.fmtDuration(l.durationMin) : ''}</span>
                                ${open ? '' : '<i class="fa-solid fa-lock text-[11px] text-slate-300"></i>'}</${open ? 'a' : 'div'}></li>`;
                        }).join('') || '<li class="px-6 py-3 text-sm text-slate-400">Lessons coming soon.</li>'}</ul></details>`;
                    }).join('') || '<p class="p-6 text-sm text-slate-500">The curriculum is being prepared.</p>'}
                </div>
            </section>

            <section id="instructor" class="scroll-mt-36"><h2 class="font-display text-3xl text-ink">${instructors.length > 1 ? 'Instructors' : 'Instructor'}</h2>
                ${instructors.map(i => `<div class="mt-5 rounded-xl bg-white border border-slate-200/70 p-7 shadow-luxe flex flex-col sm:flex-row gap-6">
                    ${i.avatar ? `<img src="${esc(i.avatar)}" alt="" class="w-24 h-24 rounded-2xl object-cover">` : `<span class="w-24 h-24 rounded-2xl bg-forest text-gold text-2xl font-bold flex items-center justify-center">${esc(ui.initials(i.name))}</span>`}
                    <div><div class="font-display text-2xl text-ink">${esc(i.name)}</div><div class="text-sm text-gold-600 font-semibold">${esc(i.title)}</div>
                    <p class="text-sm text-slate-600 mt-3">${esc(i.bio)}</p><p class="text-xs text-slate-400 mt-3">${ui.plural(db.count('course_instructors', { instructorId: i.id }), 'programme')} at Tech Oasis</p></div></div>`).join('') || '<p class="text-sm text-slate-500 mt-3">Instructor to be announced.</p>'}
            </section>

            <section id="reviews" class="scroll-mt-36"><h2 class="font-display text-3xl text-ink">Learner reviews</h2>
                <div class="mt-5 grid sm:grid-cols-[220px_1fr] gap-8 rounded-xl bg-white border border-slate-200/70 p-7 shadow-luxe">
                    <div class="text-center sm:text-left"><div class="font-display text-6xl text-ink">${r.count ? r.avg.toFixed(1) : '—'}</div><div class="text-gold mt-1">${ui.stars(r.avg)}</div><div class="text-sm text-slate-500 mt-1">${ui.plural(r.count, 'review')}</div></div>
                    <div class="space-y-2">${[5, 4, 3, 2, 1].map(n => { const c = r.reviews.filter(x => x.rating === n).length, w = r.count ? c / r.count * 100 : 0; return `<div class="flex items-center gap-3 text-sm"><span class="w-12 text-slate-600">${n} star</span><div class="flex-1 h-2 bg-slate-100 rounded-full"><div class="h-2 rounded-full bg-gold" style="width:${w}%"></div></div><span class="w-10 text-right text-slate-500">${Math.round(w)}%</span></div>`; }).join('')}</div>
                </div>
                ${enr && !preview ? reviewForm(me, course) : ''}
                <div class="mt-6 grid md:grid-cols-2 gap-5">${r.reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(rv => { const u = db.get('users', rv.userId); return `<figure class="rounded-xl bg-white border border-slate-200/70 p-6">
                    <div class="flex items-center gap-3"><span class="w-10 h-10 rounded-full bg-forest text-gold text-xs font-bold flex items-center justify-center">${esc(ui.initials(u ? u.name : '?'))}</span><div><div class="font-semibold text-sm text-ink">${esc(u ? u.name : 'Learner')}</div><div class="text-gold text-xs">${ui.stars(rv.rating)} <span class="text-slate-400 ml-1">${ui.timeAgo(rv.createdAt)}</span></div></div></div>
                    <blockquote class="text-sm text-slate-700 mt-4">${esc(rv.comment)}</blockquote></figure>`; }).join('') || '<p class="text-sm text-slate-500">No reviews yet. Enrolled learners can leave the first one.</p>'}</div>
            </section>

            <section id="enroll" class="scroll-mt-36 rounded-[28px] bg-forest text-white p-8 sm:p-10 relative overflow-hidden grain">
                <div class="absolute -right-20 -bottom-20 w-72 h-72 rounded-full bg-gold/20 blur-3xl"></div>
                <div class="relative grid md:grid-cols-2 gap-8">
                    <div><h2 class="font-display text-3xl">Enrollment information</h2>
                        <dl class="mt-6 space-y-3 text-sm">
                            <div class="flex justify-between border-b border-white/10 pb-3"><dt class="text-white/60">Tuition</dt><dd class="font-semibold">${price ? ui.money(price) + ' one-time' : 'Free'}</dd></div>
                            ${price && st.payments.trialDays ? `<div class="flex justify-between border-b border-white/10 pb-3"><dt class="text-white/60">Free trial</dt><dd class="font-semibold">${st.payments.trialDays} days, full access</dd></div>` : ''}
                            <div class="flex justify-between border-b border-white/10 pb-3"><dt class="text-white/60">Format</dt><dd class="font-semibold">Online, self-paced</dd></div>
                            <div class="flex justify-between border-b border-white/10 pb-3"><dt class="text-white/60">Language</dt><dd class="font-semibold">${esc(course.language)}</dd></div>
                            <div class="flex justify-between"><dt class="text-white/60">Questions?</dt><dd><a href="mailto:${esc(st.school.studentEmail)}" class="font-semibold text-gold-200 underline">${esc(st.school.studentEmail)}</a></dd></div>
                        </dl></div>
                    <div><h3 class="font-display text-xl">${course.certificateEnabled && st.certificates.enabled ? 'How to earn your certificate' : 'Completing this programme'}</h3>
                        <ul class="mt-4 space-y-3 text-sm text-white/85">
                            <li class="flex gap-3"><i class="fa-solid fa-circle-check text-gold mt-0.5"></i>Complete ${st.certificates.minLessonPct}% of lessons</li>
                            ${meta.quizzes && st.certificates.requireQuizPass ? '<li class="flex gap-3"><i class="fa-solid fa-circle-check text-gold mt-0.5"></i>Pass every quiz</li>' : ''}
                            ${meta.assignments && st.certificates.requireAssignments ? `<li class="flex gap-3"><i class="fa-solid fa-circle-check text-gold mt-0.5"></i>Submit assignments and score ${st.certificates.minAssignmentPct}% or more</li>` : ''}
                            ${course.certificateEnabled && st.certificates.enabled ? '<li class="flex gap-3"><i class="fa-solid fa-award text-gold mt-0.5"></i>Claim your certificate</li>' : ''}
                        </ul>
                        <div class="mt-7 max-w-xs">${ctaMain}</div></div>
                </div>
            </section>
        </div>
        </div>`;
        bindReviewForm(me, course);
        if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
    }

    function reviewForm(me, course) {
        const mine = db.first('reviews', { userId: me.id, courseId: course.id });
        return `<form id="reviewForm" class="mt-5 rounded-xl bg-ivory-100 border border-ivory-200 p-6">
            <div class="font-semibold text-ink">${mine ? 'Update your review' : 'Share your experience'}</div>
            <div class="flex gap-1 mt-3 text-2xl" id="starPick" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" role="radio" aria-label="${n} star${n > 1 ? 's' : ''}" class="text-gold"><i class="fa-${mine && mine.rating >= n ? 'solid' : 'regular'} fa-star"></i></button>`).join('')}</div>
            <input type="hidden" id="reviewRating" value="${mine ? mine.rating : 0}">
            <textarea id="reviewText" class="field mt-3" rows="3" maxlength="800" placeholder="What did you think of this programme?">${esc(mine ? mine.comment : '')}</textarea>
            <button class="btn btn-forest btn-sm mt-3">${mine ? 'Update review' : 'Post review'}</button></form>`;
    }
    function bindReviewForm(me, course) {
        const f = document.getElementById('reviewForm'); if (!f) return;
        ui.$$('#starPick button').forEach(b => b.onclick = () => {
            document.getElementById('reviewRating').value = b.dataset.n;
            ui.$$('#starPick button').forEach(x => x.innerHTML = `<i class="fa-${+x.dataset.n <= +b.dataset.n ? 'solid' : 'regular'} fa-star"></i>`);
        });
        f.onsubmit = e => {
            e.preventDefault();
            const rating = +document.getElementById('reviewRating').value, comment = document.getElementById('reviewText').value.trim();
            if (!rating) return ui.toast('Choose a star rating first.', 'error');
            db.upsert('reviews', { userId: me.id, courseId: course.id }, { rating, comment, status: 'published' });
            ui.toast('Thanks for your review!'); render();
        };
    }

    // ---------- Enrollment & checkout ----------
    function requireStudent() {
        const me = auth.current();
        if (!me) { location.href = '/student/register?next=' + encodeURIComponent('/course.html?c=' + slug); return null; }
        if (me.role !== 'student') { ui.toast('Only student accounts can enroll. Log in with a student account.', 'error'); return null; }
        return me;
    }
    function enroll() {
        const me = requireStudent(); if (!me) return;
        const course = lms.courseBySlug(slug);
        if (!lms.priceOf(course)) {
            const res = lms.checkout(me.id, course.id);
            if (res.error) return ui.toast(res.error, 'error');
            ui.toast('You are enrolled. Enjoy the programme!');
            return setTimeout(() => location.href = '/student/course/' + course.id, 500);
        }
        checkout();
    }
    function checkout() {
        const me = requireStudent(); if (!me) return;
        const course = lms.courseBySlug(slug), st = db.settings().payments;
        const enr = lms.enrollmentOf(me.id, course.id);
        const order = enr && enr.orderId && db.get('orders', enr.orderId);
        let q = order ? { subtotal: order.subtotal, discount: order.discount, total: order.total } : lms.quote(course.id);
        const m = ui.modal({ title: enr ? 'Complete your payment' : 'Enroll in ' + course.title, size: 'max-w-md', body: `
            <div class="flex gap-4 items-center"><img src="${esc(course.thumbnail)}" alt="" class="w-20 h-14 rounded-xl object-cover"><div><div class="font-semibold text-ink">${esc(course.title)}</div><div class="text-xs text-slate-500">${esc(course.level)} · ${esc(lms.categoryName(course.categoryId))}</div></div></div>
            ${enr ? '' : `<form id="couponForm" class="flex gap-2 mt-5"><input id="couponInput" class="field" placeholder="Coupon code" autocomplete="off"><button class="btn btn-outline btn-sm">Apply</button></form><p id="couponMsg" class="text-xs mt-1.5 hidden"></p>`}
            <dl id="quoteBox" class="mt-5 text-sm space-y-2"></dl>
            ${!enr && st.trialDays ? `<p class="text-xs text-slate-500 mt-4 bg-ivory rounded-xl p-3"><i class="fa-solid fa-gift text-gold-600 mr-1"></i>Start with a <b>${st.trialDays}-day free trial</b>, with full access and nothing to pay today. Pay any time before the trial ends to keep learning.</p>` : ''}
            <div class="mt-5 space-y-2">
                ${!enr && st.trialDays ? `<button data-act="trial" class="btn btn-forest w-full h-12">Start free trial</button>` : ''}
                ${lms.onlinePayments()
                    ? `<button data-act="pay" class="btn ${!enr && st.trialDays ? 'btn-outline' : 'btn-gold'} w-full h-12"><i class="fa-solid fa-lock text-xs"></i> Pay <span data-total></span> now</button>`
                    : `<div class="rounded-xl border border-slate-200 bg-ivory p-4 text-sm text-slate-700"><div class="font-semibold text-ink"><i class="fa-regular fa-credit-card mr-1.5 text-slate-500"></i>Online payment is not available yet</div><p class="mt-1">To pay <b data-total></b> for this programme, email <a class="font-semibold text-forest underline" href="mailto:${esc(db.settings().school.studentEmail)}?subject=${encodeURIComponent('Payment for ' + course.title)}">${esc(db.settings().school.studentEmail)}</a>. The school confirms your payment and keeps your access open.</p></div>`}
            </div>` });
        let coupon = '';
        const paint = () => {
            m.el.querySelector('#quoteBox').innerHTML = `<div class="flex justify-between"><dt class="text-slate-500">Tuition</dt><dd>${ui.money(q.subtotal)}</dd></div>
                ${q.discount ? `<div class="flex justify-between text-forest-600"><dt>Discount${coupon ? ' (' + esc(coupon.toUpperCase()) + ')' : ''}</dt><dd>−${ui.money(q.discount)}</dd></div>` : ''}
                <div class="flex justify-between border-t pt-2 font-semibold text-ink"><dt>Total</dt><dd>${ui.money(q.total)}</dd></div>`;
            m.el.querySelector('[data-total]').textContent = ui.money(q.total);
        };
        paint();
        const cf = m.el.querySelector('#couponForm');
        if (cf) cf.onsubmit = e => {
            e.preventDefault();
            const code = m.el.querySelector('#couponInput').value.trim(), nq = lms.quote(course.id, code), msg = m.el.querySelector('#couponMsg');
            msg.classList.remove('hidden');
            if (nq.error) { msg.className = 'text-xs mt-1.5 text-rose-700'; msg.textContent = nq.error; return; }
            coupon = code; q = nq; paint();
            msg.className = 'text-xs mt-1.5 text-forest-600'; msg.textContent = 'Coupon applied.';
        };
        m.el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
            let res = enr ? { order, enrollment: enr } : lms.checkout(me.id, course.id, coupon);
            if (res.error) return ui.toast(res.error, 'error');
            if (b.dataset.act === 'pay') { if (!lms.onlinePayments()) return ui.toast('Online payment is not available yet.', 'error'); if (res.order.status !== 'paid') lms.markOrderPaid(res.order.id, st.provider, 'demo-' + Date.now()); }
            m.close();
            ui.toast(b.dataset.act === 'trial' ? 'Your free trial has started. Welcome!' : 'Payment received. Welcome to the programme!');
            setTimeout(() => location.href = '/student/course/' + course.id, 600);
        });
    }

    TOS.coursePage = { enroll, checkout };
    render();
    db.onChange(() => { if (preview) render(); });
})();
