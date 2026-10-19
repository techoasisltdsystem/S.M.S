// Public site: routing, header, homepage sections and catalog. Everything renders from the LMS database.
const { db, lms, ui, auth } = TOS;
const { esc } = ui;

// ---------------- Routing ----------------
const PUBLIC_PAGES = ['home', 'catalog', 'about', 'contact'];
const PAGE_TITLES = {
    home: 'Tech Oasis School | Practical technology courses',
    catalog: 'Courses | Tech Oasis School',
    about: 'About | Tech Oasis School',
    contact: 'Contact | Tech Oasis School'
};
function go(page, anchor, opts) {
    if (page === 'catalog' && opts) Object.assign(catalogState, opts, { page: 1 });
    showPage(page);
    history.replaceState(null, '', page === 'home' ? (anchor ? '#' + anchor : location.pathname + location.search) : '#' + page);
    if (anchor) setTimeout(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60);
    return false;
}
function showPage(pageId) {
    const me = auth.current();
    ui.$$('.page-view').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-' + pageId).classList.remove('hidden');
    window.scrollTo(0, 0);
    const shell = false;
    document.getElementById('siteHeader').classList.toggle('hidden', shell);
    document.getElementById('siteFooter').classList.toggle('hidden', shell);
    document.title = PAGE_TITLES[pageId] || PAGE_TITLES.home;
    ui.$$('[data-nav]').forEach(a => { if (a.dataset.nav === pageId) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (pageId === 'catalog') renderCatalog();
    if (pageId === 'about') renderAbout();
    if (pageId === 'contact') renderContact();
    renderAuthArea();
    ui.initReveal();
}
function goToPortal() {
    const me = auth.current();
    if (!me) { location.href = '/student/login'; return false; }
    location.href = me.role === 'staff' ? '/staff/dashboard' : '/student/dashboard';
    return false;
    history.replaceState(null, '', '#my-learning');
    return false;
}
const courseUrl = c => 'course.html?c=' + encodeURIComponent(c.slug);
function openCourseDetail(slugOrId) { const c = lms.courseBySlug(slugOrId); if (c) location.href = courseUrl(c); }

// ---------------- Header ----------------
function renderAuthArea() {
    const me = auth.current(), el = document.getElementById('authArea');
    if (!me) {
        el.innerHTML = `<div class="relative hidden sm:block" id="signinWrap">
                <button type="button" id="signinBtn" onclick="toggleSignin()" class="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-forest hover:text-forest-600 px-2 h-10" aria-haspopup="true" aria-expanded="false" aria-controls="signinMenu">Sign in <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true"></i></button>
                <div id="signinMenu" class="hidden absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lift border border-slate-200 py-2 z-50">
                    <a href="/student/login" class="block px-4 py-2.5 hover:bg-ivory"><span class="block text-sm font-semibold text-ink">Student sign in</span><span class="block text-xs text-slate-500">Your courses, progress and certificates</span></a>
                    <a href="/staff/login" class="block px-4 py-2.5 hover:bg-ivory"><span class="block text-sm font-semibold text-ink">Staff dashboard sign in</span><span class="block text-xs text-slate-500">For approved instructors and staff</span></a>
                </div></div>
            <span class="hidden sm:inline-flex"><a href="#catalog" onclick="return go('catalog')" class="btn btn-forest h-10 whitespace-nowrap">Explore courses</a></span>`;
        return;
    }
    el.innerHTML = `<button onclick="goToPortal()" class="hidden sm:inline-flex text-sm font-semibold text-forest hover:text-forest-600 px-2">${me.role === 'staff' ? 'Staff Portal' : 'My Learning'}</button>
        <div class="relative">
            <button onclick="document.getElementById('userMenu').classList.toggle('hidden')" class="flex items-center gap-2 rounded-full pl-1 pr-3 h-11 border border-slate-200 hover:border-forest" aria-label="Account menu">
                <span class="w-9 h-9 rounded-full bg-forest text-gold text-xs font-bold flex items-center justify-center">${esc(ui.initials(me.name))}</span><i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i></button>
            <div id="userMenu" class="hidden absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-lift border border-slate-100 py-2 text-sm z-50">
                <div class="px-4 py-2 border-b mb-1"><div class="font-semibold text-ink truncate">${esc(me.name)}</div><div class="text-xs text-slate-500 truncate">${esc(me.email)}</div></div>
                <button onclick="goToPortal()" class="w-full text-left px-4 py-2 hover:bg-ivory"><i class="fa-solid fa-graduation-cap w-5 text-slate-400"></i>${me.role === 'staff' ? 'Staff Portal' : 'My Learning'}</button>
                <a href="verify.html" class="block px-4 py-2 hover:bg-ivory"><i class="fa-solid fa-award w-5 text-slate-400"></i>Certificates</a>
                <button onclick="logoutUser()" class="w-full text-left px-4 py-2 hover:bg-ivory text-rose-700"><i class="fa-solid fa-right-from-bracket w-5"></i>Log out</button>
            </div>
        </div>`;
}
function toggleSignin(force) {
    const m = document.getElementById('signinMenu'), b = document.getElementById('signinBtn'); if (!m) return;
    const open = force === undefined ? m.classList.contains('hidden') : force;
    m.classList.toggle('hidden', !open); b.setAttribute('aria-expanded', open);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = document.getElementById('signinMenu'); if (m && !m.classList.contains('hidden')) { toggleSignin(false); document.getElementById('signinBtn').focus(); } } });
document.addEventListener('click', e => {
    if (!e.target.closest('#signinWrap')) toggleSignin(false);
    const m = document.getElementById('userMenu'); if (m && !e.target.closest('#authArea')) m.classList.add('hidden');
});

const topCategories = () => db.ordered('categories', c => !c.parentId);
const subCategories = id => db.ordered('categories', { parentId: id });
const coursesInCategory = id => lms.listedCourses().filter(c => c.categoryId === id || c.subcategoryId === id);

function renderExplore() {
    const cats = topCategories();
    document.getElementById('drawerCats').innerHTML = cats.map(c => `<a href="#catalog" onclick="toggleDrawer(false); return go('catalog', null, {cat:'${c.id}'})" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ivory"><i class="fa-solid ${esc(c.icon)} w-5 text-forest"></i>${esc(c.name)}</a>`).join('');
    document.getElementById('footerCats').innerHTML = cats.map(c => `<li><a href="#catalog" onclick="return go('catalog', null, {cat:'${c.id}'})" class="hover:text-gold">${esc(c.name)}</a></li>`).join('');
}
function toggleDrawer(open) {
    document.getElementById('drawer').classList.toggle('hidden', !open);
    document.body.style.overflow = open ? 'hidden' : '';
    const btn = document.getElementById('menuBtn'); btn.setAttribute('aria-expanded', open);
    if (open) document.getElementById('drawerClose').focus(); else btn.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('drawer').classList.contains('hidden')) toggleDrawer(false);
    if (e.key === 'Tab' && !document.getElementById('drawer').classList.contains('hidden')) {   // keep focus inside the open menu
        const f = [...document.querySelectorAll('#drawer a, #drawer button, #drawer input')].filter(x => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
});

// Course search (used by the catalogue)
function searchCourses(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    return lms.listedCourses().map(c => {
        const ins = lms.primaryInstructor(c.id), hay = [c.title, c.shortDescription, lms.categoryName(c.categoryId), lms.categoryName(c.subcategoryId), ins && ins.name].join(' ').toLowerCase();
        const score = c.title.toLowerCase().startsWith(q) ? 3 : c.title.toLowerCase().includes(q) ? 2 : hay.includes(q) ? 1 : 0;
        return { c, score };
    }).filter(x => x.score).sort((a, b) => b.score - a.score).map(x => x.c);
}
// The drawer search box and the header's search icon both land on the catalogue, whose search filters live as you type.
function submitSearch(mobile) {
    const q = document.getElementById('mSearchInput').value;
    if (mobile) toggleDrawer(false);
    return go('catalog', null, { q, cat: '', level: '', price: '' });
}
function goSearch() { go('catalog'); setTimeout(() => document.getElementById('catSearch').focus(), 60); return false; }

// ---------------- Shared course card ----------------
function popularCourses() { return lms.listedCourses().sort((a, b) => db.count('enrollments', { courseId: b.id }) - db.count('enrollments', { courseId: a.id }) || lms.rating(b.id).avg - lms.rating(a.id).avg); }
function priceLabel(c) { return lms.priceOf(c) ? ui.money(lms.priceOf(c)) : 'Free'; }
// Card images are shown ~320px wide, so ask the CDN for 640px (2x) instead of the 900px stored with the course
const cardImg = c => String(c.thumbnail).replace(/([?&]w=)\d+/, '$1640');
function courseCard(c) {
    const ins = lms.primaryInstructor(c.id), r = lms.rating(c.id), meta = lms.courseMeta(c.id), cert = db.settings().certificates.enabled;
    return `<a href="${courseUrl(c)}" class="group flex flex-col rounded-xl overflow-hidden bg-white border border-slate-200 hover:border-forest hover:shadow-luxe transition">
        <div class="relative aspect-[16/9] overflow-hidden bg-slate-100"><img src="${esc(cardImg(c))}" alt="" loading="lazy" width="640" height="360" class="w-full h-full object-cover">
            <span class="absolute top-3 left-3 pill ${lms.priceOf(c) ? 'bg-white text-ink' : 'bg-gold text-ink'}">${priceLabel(c)}</span></div>
        <div class="p-4 flex-1 flex flex-col">
            <div class="text-xs font-semibold text-forest-600">${esc(lms.categoryName(c.categoryId))}</div>
            <h3 class="font-semibold text-ink mt-1 leading-snug">${esc(c.title)}</h3>
            <p class="text-sm text-slate-600 mt-1.5 line-clamp-2">${esc(c.shortDescription)}</p>
            <p class="text-xs text-slate-500 mt-3">${esc(c.level)} · ${meta.hours}h · ${ui.plural(meta.lessons, 'lesson')}</p>
            <p class="text-xs text-slate-500 mt-1 truncate">${esc(ins ? ins.name : 'Tech Oasis Faculty')}</p>
            <div class="mt-auto pt-4 flex items-center justify-between gap-3 text-xs">
                <span class="text-slate-500">${r.count ? `<i class="fa-solid fa-star text-gold" aria-hidden="true"></i> <b class="text-slate-700">${r.avg.toFixed(1)}</b>` : cert ? 'Certificate on completion' : ''}</span>
                <span class="font-semibold text-forest group-hover:underline">View course <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
            </div>
        </div></a>`;
}
function courseRow(c) {
    const ins = lms.primaryInstructor(c.id), r = lms.rating(c.id);
    return `<a href="${courseUrl(c)}" data-peek="${esc(c.id)}" class="flex gap-4 p-3 rounded-xl bg-white hover:shadow-luxe transition group">
        <img src="${esc(c.thumbnail)}" alt="" loading="lazy" class="w-24 h-24 rounded-lg object-cover bg-slate-100 shrink-0">
        <div class="min-w-0 py-1">
            <div class="flex items-center gap-2 text-xs text-slate-500"><span class="w-5 h-5 rounded border border-slate-200 flex items-center justify-center text-[9px] text-forest"><i class="fa-solid ${esc((lms.category(c.categoryId) || {}).icon || 'fa-book')}"></i></span><span class="truncate">${esc(ins ? ins.name : 'Tech Oasis Faculty')}</span></div>
            <div class="font-semibold text-ink mt-1.5 leading-snug group-hover:text-forest-600 line-clamp-2">${esc(c.title)}</div>
            <div class="text-xs text-slate-500 mt-1.5">${lms.priceOf(c) ? 'Career Programme' : 'Free Course'}${r.count ? ` · <i class="fa-solid fa-star text-gold"></i> <b class="text-slate-700">${r.avg.toFixed(1)}</b>` : ''}</div>
        </div></a>`;
}

// Hover preview: a short, motivating intro shown beside a course row (pointer devices only)
const coursePeek = (() => {
    const box = document.createElement('div');
    box.className = 'fixed z-[60] w-[320px] rounded-2xl bg-white border border-slate-200 shadow-lift p-5 hidden';
    box.setAttribute('role', 'tooltip');
    document.body.appendChild(box);
    let hideTimer = null, current = null;
    const hide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => { box.classList.add('hidden'); current = null; }, 120); };
    const keep = () => clearTimeout(hideTimer);
    const show = a => {
        keep();
        const c = lms.courseBySlug(a.dataset.peek); if (!c) return;
        if (current !== a) {
            const meta = lms.courseMeta(c.id), outs = (c.outcomes || []).slice(0, 3);
            box.innerHTML = `<div class="eyebrow">${esc(c.level)} · ${meta.hours}h · ${ui.plural(meta.lessons, 'lesson')}</div>
                <div class="font-display text-xl text-ink mt-1.5 leading-snug">${esc(c.title)}</div>
                <p class="text-sm text-slate-600 mt-2">${esc(c.shortDescription)}</p>
                ${outs.length ? `<div class="text-xs font-semibold text-ink mt-4">What you'll walk away with</div>
                <ul class="mt-2 space-y-1.5">${outs.map(o => `<li class="flex gap-2 text-xs text-slate-600"><i class="fa-solid fa-circle-check text-forest mt-0.5"></i><span>${esc(o)}</span></li>`).join('')}</ul>` : ''}
                <a href="${courseUrl(c)}" class="btn btn-forest w-full mt-5">${lms.priceOf(c) ? 'Start learning' : 'Start free'} <i class="fa-solid fa-arrow-right text-xs"></i></a>`;
            current = a;
        }
        box.classList.remove('hidden');
        const r = a.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight, gap = 12;
        const left = r.right + gap + w <= innerWidth ? r.right + gap : Math.max(8, r.left - gap - w);
        box.style.left = left + 'px';
        box.style.top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, innerHeight - h - 8)) + 'px';
    };
    const hoverable = matchMedia('(hover: hover)');
    document.addEventListener('mouseover', e => { const a = hoverable.matches && e.target.closest('[data-peek]'); if (a) show(a); });
    document.addEventListener('mouseout', e => { if (e.target.closest('[data-peek]')) hide(); });
    document.addEventListener('focusin', e => { const a = e.target.closest('[data-peek]'); if (a) show(a); });
    document.addEventListener('focusout', e => { if (e.target.closest('[data-peek]')) hide(); });
    box.addEventListener('mouseenter', keep);
    box.addEventListener('mouseleave', hide);
    addEventListener('scroll', () => { clearTimeout(hideTimer); box.classList.add('hidden'); current = null; }, { passive: true });
    return { hide };
})();

// ---------------- Hero ----------------
// Photos slide sideways behind the headline and the featured card follows, cycling through programmes from different categories.
let heroSlides = [], heroIdx = 0, heroTimer = null, heroUserPaused = false;
// Background photos supplied by the school (assets/img). Slide i shows photo i next to programme i.
const HERO_PHOTOS = [['learners', '35% 40%'], ['laptop-city', 'center'], ['study-desk', 'center'], ['laptop-blue', 'center']];
const heroPhoto = i => HERO_PHOTOS[i % HERO_PHOTOS.length];
function heroCourses() {
    const out = [], first = lms.courseBySlug('web-development');   // the flagship programme leads, then one per other category
    if (first) out.push(first);
    topCategories().forEach(cat => { const c = lms.listedCourses().find(x => x.categoryId === cat.id); if (c && !out.some(o => o.categoryId === c.categoryId)) out.push(c); });
    return out.slice(0, HERO_PHOTOS.length);
}
function heroCard(c) {
    const ins = lms.primaryInstructor(c.id), meta = lms.courseMeta(c.id);
    return `<a href="${courseUrl(c)}" class="group block rounded-xl bg-white border border-slate-200 overflow-hidden shadow-luxe hover:border-forest transition hero-card-in">
        <div class="aspect-[16/9] bg-slate-100 overflow-hidden"><img src="${esc(cardImg(c))}" alt="${esc(c.title)} course preview" width="640" height="360" class="w-full h-full object-cover"></div>
        <div class="p-5">
            <p class="eyebrow">${esc(lms.categoryName(c.categoryId))}</p>
            <h2 class="font-display text-2xl text-ink mt-1.5 group-hover:text-forest-600">${esc(c.title)}</h2>
            <p class="text-sm text-slate-600 mt-2 line-clamp-2">${esc(c.shortDescription)}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-slate-500">
                <span>${esc(c.level)}</span><span>${meta.hours}h</span><span>${meta.lessons} ${meta.lessons === 1 ? 'lesson' : 'lessons'}</span>${ins ? `<span>${esc(ins.name)}</span>` : ''}<span class="font-semibold text-ink">${priceLabel(c)}</span>
            </div>
            <span class="btn btn-forest mt-5">View course <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i></span>
        </div></a>`;
}
function renderHero() {
    const all = lms.listedCourses(), cats = topCategories().filter(c => coursesInCategory(c.id).length), free = all.filter(c => !lms.priceOf(c)).length;
    const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
    document.getElementById('heroFacts').textContent = n(all.length, 'programme', 'programmes') + ' across ' + n(cats.length, 'category', 'categories') + (free ? ' · ' + free + ' free' : '');
    heroSlides = heroCourses();
    const track = document.getElementById('heroBgTrack');
    if (!heroSlides.length) { track.innerHTML = ''; document.getElementById('heroFeature').innerHTML = ''; document.getElementById('heroDots').innerHTML = ''; return; }
    track.innerHTML = heroSlides.concat(heroSlides[0]).map((c, i) => { const [f, pos] = heroPhoto(i % heroSlides.length); return `<div class="hero-bg-slide"><img src="assets/img/${f}.webp" alt="" style="object-position:${pos}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></div>`; }).join('');
    document.getElementById('heroDots').innerHTML = heroSlides.map((c, i) => `<button type="button" onclick="heroShow(${i})" class="hero-dot h-2.5 rounded-full transition-all" aria-label="Show ${esc(c.title)}"></button>`).join('');
    heroIdx = 0; heroPaint(false);
    document.getElementById('heroToggle').classList.toggle('hidden', heroSlides.length < 2);
    heroUserPaused = false; heroSyncToggle(); heroSchedule();
}
// Advances on its own every 6 s. Only the Pause button stops it (hovering or clicking a dot does not), and picking a slide restarts the timer.
// Visitors who ask their system for reduced motion still get the automatic change, but without the sliding animation (see tos.css).
function heroSchedule() {
    clearTimeout(heroTimer);
    if (heroSlides.length < 2 || heroUserPaused) return;
    heroTimer = setTimeout(() => heroShow(document.hidden ? heroIdx : heroIdx + 1), 6000);
}
// idx may equal heroSlides.length: that is the repeated first slide, after which the track snaps back to the start without animating
function heroShow(idx) {
    const track = document.getElementById('heroBgTrack'), n = heroSlides.length;
    if (idx < 0) idx = n - 1;
    heroIdx = idx;
    track.style.transform = `translateX(-${idx * 100}%)`;
    if (idx === n) setTimeout(() => { if (heroIdx !== n) return; track.style.transition = 'none'; heroIdx = 0; track.style.transform = 'translateX(0)'; void track.offsetWidth; track.style.transition = ''; }, 1000);
    heroPaint(true);
    heroSchedule();
}
function heroPaint(animate) {
    const i = heroIdx % heroSlides.length, c = heroSlides[i];
    const box = document.getElementById('heroFeature');
    box.innerHTML = heroCard(c); if (!animate) box.firstElementChild.classList.remove('hero-card-in');
    ui.$$('.hero-dot').forEach((d, k) => { d.className = 'hero-dot h-2.5 rounded-full transition-all ' + (k === i ? 'w-8 bg-forest' : 'w-2.5 bg-slate-300 hover:bg-slate-400'); if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
}
function heroSyncToggle() {
    const b = document.getElementById('heroToggle'); b.setAttribute('aria-label', heroUserPaused ? 'Play slideshow' : 'Pause slideshow');
    b.innerHTML = `<i class="fa-solid ${heroUserPaused ? 'fa-play' : 'fa-pause'} text-xs" aria-hidden="true"></i>`;
}
function heroToggle() { heroUserPaused = !heroUserPaused; heroSyncToggle(); heroSchedule(); }

// ---------------- Scroll hints ----------------
// Rows of chips that scroll sideways show a fade and an arrow on the side that has more. Rows marked data-autoscroll also pan slowly
// back and forth by themselves so students can see there are more; the panning stops for good once the student touches, clicks, scrolls or tabs into the row.
function initScrollHints() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    ui.$$('[data-scroll-hint]').forEach(wrap => {
        const sc = wrap.querySelector('.overflow-x-auto');
        const update = () => { wrap.classList.toggle('can-prev', sc.scrollLeft > 4); wrap.classList.toggle('can-next', sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 4); };
        sc.addEventListener('scroll', update, { passive: true }); addEventListener('resize', update);
        new MutationObserver(update).observe(sc, { childList: true }); new ResizeObserver(update).observe(sc);
        wrap.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('click', () => sc.scrollBy({ left: +b.dataset.dir * Math.max(160, sc.clientWidth * 0.7), behavior: 'smooth' })));
        update();
        if (!wrap.hasAttribute('data-autoscroll') || reduce) return;
        const SPEED = 32, HOLD = 1400;                        // pixels per second; pause at each end in ms
        let pos = 0, dir = 1, last = 0, holdUntil = performance.now() + 1800, visible = false, hovering = false, stopped = false;
        const stop = () => { stopped = true; };
        ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin'].forEach(ev => wrap.addEventListener(ev, stop, { passive: true }));
        wrap.addEventListener('mouseenter', () => { hovering = true; }); wrap.addEventListener('mouseleave', () => { hovering = false; });
        new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.6 }).observe(sc);
        const tick = t => {
            if (stopped) return;
            const dt = Math.min((t - (last || t)) / 1000, 0.05); last = t;
            const max = sc.scrollWidth - sc.clientWidth;
            if (visible && !hovering && max > 8 && t >= holdUntil && !document.hidden) {
                pos = Math.max(0, Math.min(max, pos + dir * SPEED * dt));
                sc.scrollLeft = pos;
                if (pos >= max && dir > 0) { dir = -1; holdUntil = t + HOLD; } else if (pos <= 0 && dir < 0) { dir = 1; holdUntil = t + HOLD; }
            } else if (!visible || max <= 8) pos = sc.scrollLeft;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

// ---------------- Homepage sections ----------------
function renderPopular() {
    const all = lms.listedCourses();
    const isAi = c => [c.categoryId, c.subcategoryId].some(id => /ai|data|machine/i.test(lms.categoryName(id)));
    const cols = [
        ['Featured programmes', popularCourses().slice(0, 3), "go('catalog', null, {sort:'popular'})"],
        ['Newest programmes', all.slice().sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt)).slice(0, 3), "go('catalog', null, {sort:'newest'})"],
        ['AI & Data programmes', all.filter(isAi).sort((a, b) => db.count('enrollments', { courseId: b.id }) - db.count('enrollments', { courseId: a.id })).slice(0, 3), "go('catalog', null, {q:'AI'})"]
    ];
    document.getElementById('popularCols').innerHTML = cols.map(([t, list, act]) => `
        <div class="min-w-0 rounded-xl bg-forest-50/70 border border-forest-100 p-4 sm:p-5">
            <button onclick="${act}" class="flex items-center gap-2 font-semibold text-ink hover:text-forest-600 px-1 mb-3">${t} <i class="fa-solid fa-arrow-right text-xs"></i></button>
            <div class="space-y-3">${list.map(courseRow).join('') || '<p class="text-sm text-slate-500 p-3">Coming soon.</p>'}</div>
        </div>`).join('');
}
function renderPromo() {
    const c = lms.courseBySlug('artificial-intelligence-ai') || popularCourses()[0]; if (!c) return;
    document.getElementById('promoAi').innerHTML = `
        <div class="org-slider absolute inset-0 opacity-30" aria-hidden="true"><div class="org-slider-track" style="animation-delay:-10s"><img src="assets/img/study-desk.webp" alt="" loading="lazy"><img src="assets/img/laptop-city.webp" alt="" loading="lazy"><img src="assets/img/laptop-blue.webp" alt="" loading="lazy"><img src="assets/img/study-desk.webp" alt="" loading="lazy"></div></div>
        <div class="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/30"></div>
        <div class="absolute right-0 bottom-0 w-[42%] h-full hidden sm:block"><img src="${esc(c.thumbnail)}" alt="" class="absolute right-6 bottom-6 w-[85%] max-w-[220px] aspect-[4/3] object-cover rounded-2xl shadow-lift rotate-2"><span class="absolute left-0 top-10 w-14 h-14 rounded-full bg-forest text-gold flex items-center justify-center shadow-lift text-xl"><i class="fa-solid fa-wand-magic-sparkles"></i></span></div>
        <div class="relative sm:max-w-[55%]"><div class="flex items-center gap-2 text-sm font-semibold text-slate-600">${ui.logoMark(22)} Tech Oasis AI</div>
            <h3 class="font-display text-3xl sm:text-[34px] leading-tight text-ink mt-4">From prompt to production with applied AI</h3>
            <p class="text-sm text-slate-600 mt-3">${esc(c.shortDescription)}</p></div>
        <a href="${courseUrl(c)}" class="relative btn btn-outline border-forest text-forest self-start mt-6">Enroll now <i class="fa-solid fa-arrow-right text-xs"></i></a>`;
}
const TOOLS = [['fa-brands fa-html5', 'HTML & CSS', 'web'], ['fa-brands fa-js', 'JavaScript', 'javascript'], ['fa-brands fa-python', 'Python', 'python'], ['fa-brands fa-react', 'React', 'react'], ['fa-brands fa-figma', 'Figma', 'figma'], ['fa-brands fa-aws', 'AWS', 'aws'], ['fa-brands fa-docker', 'Docker', 'devops'], ['fa-solid fa-database', 'SQL', 'sql'], ['fa-brands fa-git-alt', 'Git', 'coding'], ['fa-brands fa-ethereum', 'Solidity', 'solidity'], ['fa-solid fa-brain', 'Machine Learning', 'machine learning'], ['fa-brands fa-google', 'SEO', 'seo']];
function renderTools() {
    // Two identical copies side by side; the track slides by exactly one copy (-50%) for a seamless loop.
    const items = (hidden) => TOOLS.map(([ic, name, q]) => `<button onclick="go('catalog', null, {q:'${q}', cat:''})" ${hidden ? 'aria-hidden="true" tabindex="-1"' : ''} class="shrink-0 flex items-center gap-3 rounded-full bg-white border border-slate-200 px-5 h-14 mr-3 hover:border-forest hover:shadow-luxe transition"><i class="${ic} text-lg text-forest"></i><span class="text-sm font-semibold text-ink whitespace-nowrap">${name}</span></button>`).join('');
    document.getElementById('toolStrip').innerHTML = `<div class="tool-marquee-track">${items(false)}${items(true)}</div>`;
}
const PATHS = [
    ['Web Developer', ['web-development', 'web-design', 'coding', 'app-development']],
    ['AI Engineer', ['artificial-intelligence-ai', 'machine-learning', 'data-science', 'coding']],
    ['Data Analyst', ['data-science', 'machine-learning', 'coding', 'digital-marketing']],
    ['Product Designer', ['ui-ux-design', 'web-design', 'web-development', 'digital-marketing']],
    ['Cloud & Security', ['cloud-computing', 'cybersecurity', 'blockchain', 'coding']],
    ['Digital Marketer', ['digital-marketing', 'web-design', 'data-science', 'ui-ux-design']]
];
let pathIdx = 0, pathFx = 0;
const PATH_FX = ['swipe', 'window', 'curtain', 'flip', 'drop'];
// Career-path tabs rotate on their own (each tab's progress bar drives the next step) until the student picks one.
let pathAuto = !matchMedia('(prefers-reduced-motion: reduce)').matches;
function pathPick(i) { pathAuto = false; pathIdx = i; renderPaths(); }
function pathNext() { pathIdx = (pathIdx + 1) % PATHS.length; renderPaths(); }
function renderPaths() {
    const tabs = document.getElementById('pathTabs');
    tabs.innerHTML = PATHS.map(([t], i) => `<button role="tab" aria-selected="${i === pathIdx}" onclick="pathPick(${i})" class="relative overflow-hidden shrink-0 h-10 px-5 rounded-full text-sm font-semibold transition ${i === pathIdx ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20 border border-white/15'}">${t}${pathAuto && i === pathIdx ? '<span class="path-progress" onanimationend="pathNext()"></span>' : ''}</button>`).join('');
    const on = tabs.children[pathIdx];
    if (on) tabs.scrollTo({ left: on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
    const list = PATHS[pathIdx][1].map(s => lms.courseBySlug(s)).filter(c => c && c.status === 'published');
    const cards = document.getElementById('pathCards');
    cards.innerHTML = list.map(c => courseCard(c)).join('').replace(/loading="lazy"/g, 'loading="eager" decoding="async"');
    // Each switch brings the cards in with the next style (swipe, window, curtain, flip, drop), staggered left to right
    cards.className = cards.className.replace(/\bpt-\w+/g, '').trim() + ' pt-' + PATH_FX[pathFx++ % PATH_FX.length];
    [...cards.children].forEach((el, i) => el.style.setProperty('--i', i));
}
// Warm the browser cache with every path's course images (next path first) so a switch never waits on the network
function preloadPaths() {
    const seen = new Set();
    for (let k = 1; k <= PATHS.length; k++) PATHS[(pathIdx + k) % PATHS.length][1].forEach(slug => {
        const c = lms.courseBySlug(slug);
        if (c && c.status === 'published' && !seen.has(c.id)) { seen.add(c.id); new Image().src = cardImg(c); }
    });
}
(window.requestIdleCallback || setTimeout)(preloadPaths);
// Hold the rotation while the section is off screen
new IntersectionObserver(([e]) => document.getElementById('pathBox').classList.toggle('path-offscreen', !e.isIntersecting)).observe(document.getElementById('pathBox'));
let catTab = null;
function renderCatTabs() {
    const cats = topCategories().filter(c => coursesInCategory(c.id).length);
    if (!catTab && cats[0]) catTab = cats[0].id;
    document.getElementById('catTabs').innerHTML = cats.map(c => `<button role="tab" aria-selected="${c.id === catTab}" onclick="catTab='${c.id}'; renderCatTabs()" class="shrink-0 h-10 px-4 rounded-full text-sm font-semibold transition ${c.id === catTab ? 'bg-ink text-white' : 'bg-white text-ink border border-slate-200 hover:border-ink'}">${esc(c.name)}</button>`).join('');
    document.getElementById('catCards').innerHTML = coursesInCategory(catTab).slice(0, 4).map(c => courseCard(c)).join('');
}
function renderReviews() {
    const rs = db.where('reviews', r => r.status === 'published' && r.comment).sort((a, b) => b.rating - a.rating || new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);
    document.getElementById('reviewsSection').classList.toggle('hidden', !rs.length);
    const all = db.where('reviews', r => r.status === 'published'), avg = all.length ? all.reduce((a, r) => a + r.rating, 0) / all.length : 0;
    document.getElementById('reviewSummary').innerHTML = all.length ? `<span class="text-gold">${ui.stars(avg)}</span> <b class="text-white ml-1">${avg.toFixed(1)}</b> average from ${ui.plural(all.length, 'review')}` : '';
    document.getElementById('reviewCards').innerHTML = rs.map(r => {
        const u = db.get('users', r.userId), c = db.get('courses', r.courseId);
        return `<figure class="rounded-xl bg-white/5 border border-white/10 p-7 flex flex-col">
            <div class="text-gold text-sm">${ui.stars(r.rating)}</div>
            <blockquote class="font-display text-xl leading-snug mt-4 flex-1">“${esc(r.comment)}”</blockquote>
            <figcaption class="flex items-center gap-3 mt-6"><span class="w-10 h-10 rounded-full bg-gold text-ink text-xs font-bold flex items-center justify-center">${esc(ui.initials(u ? u.name : '?'))}</span>
                <span><span class="block text-sm font-semibold">${esc(u ? u.name : 'Learner')}</span><span class="block text-xs text-white/50">${esc(c ? c.title : '')}</span></span></figcaption></figure>`;
    }).join('');
}
function renderFaq() {
    const st = db.settings(), p = st.payments, c = st.certificates, school = st.school;
    const paid = lms.listedCourses().map(x => lms.priceOf(x)).filter(x => x > 0).sort((a, b) => a - b);
    const priceText = !paid.length ? 'Courses are currently free.' : paid[0] === paid[paid.length - 1] ? `Paid programmes are a one-time ${ui.money(paid[0])} each.` : `Paid programmes are priced individually, from ${ui.money(paid[0])} to ${ui.money(paid[paid.length - 1])}, as a one-time payment per programme.`;
    const trialText = p.trialDays ? `Paid programmes start with a ${p.trialDays}-day free trial with full access. No payment details are requested to start it, and nothing is charged automatically. When the trial ends, the lessons lock until payment is arranged; your progress is kept.` : 'Paid programmes unlock once payment is arranged.';
    const payText = lms.onlinePayments() ? 'You can pay online when you enrol.' : `Online payment is not available yet. To pay for a programme, email ${school.studentEmail}; the school confirms your payment and keeps your access open.`;
    const certText = `A certificate is issued when you complete ${c.minLessonPct}% of the lessons${c.requireQuizPass ? ', pass the quizzes' : ''}${c.requireAssignments ? ` and have your assignments graded (at least ${c.minAssignmentPct}%)` : ''}. It carries a unique ID. There is no separate certificate fee.`;
    const faqs = [
        ['How do I enrol?', 'Create a free student account, open a course page and choose Enrol (or Start free trial for paid programmes). Free courses open immediately.'],
        ['Do I need any experience first?', 'Each course page lists its level and its requirements. Beginner courses are written for people starting out; Intermediate and Advanced courses list what you should already know.'],
        ['How long does a course take?', 'Each course page shows the estimated hours and the number of lessons. Everything is self-paced, so you can study when it suits you and pick up where you left off.'],
        ['How do I access my lessons?', 'Sign in and open My Courses. Lessons, quizzes, assignments and resources are in the course, and your progress is saved as you go.'],
        ['How much does it cost?', priceText + ' Some courses are free. The price is shown on every course page before you enrol.'],
        ['How does the free trial work?', trialText],
        ['How do I pay?', payText],
        ['How do I earn a certificate?', certText],
        ['I forgot my password. What do I do?', `Use "Forgot password?" on the sign-in page, or email ${school.studentEmail}.`],
        ['I have a technical problem or need help. Who do I contact?', `Email student support at ${school.studentEmail}. For admissions or organisation enquiries, email ${school.email}, or use the contact page.`]
    ];
    document.getElementById('faq').innerHTML = faqs.map(([q, a], i) => `<div class="py-1"><h3><button type="button" class="faq-q w-full flex items-center justify-between gap-4 py-4 text-left font-semibold text-ink" aria-expanded="false" aria-controls="faq-a${i}" id="faq-q${i}">${esc(q)}<span class="faq-icon w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center shrink-0 transition" aria-hidden="true"><i class="fa-solid fa-plus text-xs"></i></span></button></h3><div id="faq-a${i}" role="region" aria-labelledby="faq-q${i}" class="hidden"><p class="text-slate-600 text-sm pb-4 pr-10">${esc(a)}</p></div></div>`).join('');
    // Pricing section
    document.getElementById('priceFlat').textContent = paid.length ? (paid[0] === paid[paid.length - 1] ? ui.money(paid[0]) : 'From ' + ui.money(paid[0])) : 'Free';
    document.getElementById('trialLine').textContent = p.trialDays ? p.trialDays + '-day free trial, no payment details needed' : 'Access unlocks once payment is arranged';
    document.getElementById('payLine').textContent = lms.onlinePayments() ? 'Pay online when you enrol' : 'Online payment is not available yet. Email ' + school.studentEmail + ' to pay.';
}
document.addEventListener('click', e => {
    const b = e.target.closest('.faq-q'); if (!b) return;
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', open);
    document.getElementById(b.getAttribute('aria-controls')).classList.toggle('hidden', !open);
    b.querySelector('.faq-icon').style.transform = open ? 'rotate(45deg)' : '';
});

// ---------------- Catalogue ----------------
// cat, level and price may be a single value (older callers, e.g. go('catalog', null, {price:'free'})) or a list; min/max are price limits.
const catalogState = { q: '', cat: '', level: '', price: '', min: null, max: null, sort: 'popular', view: 'grid', page: 1 };
const CATALOG_PAGE_SIZE = 9;
const asList = v => Array.isArray(v) ? v : v ? [v] : [];
function catalogMaxPrice() { return Math.max(0, ...lms.listedCourses().map(c => lms.priceOf(c))); }
function catalogFiltered() {
    const s = catalogState, cats = asList(s.cat), levels = asList(s.level), prices = asList(s.price);
    let list = s.q ? searchCourses(s.q) : lms.listedCourses();
    if (cats.length) list = list.filter(c => cats.includes(c.categoryId) || cats.includes(c.subcategoryId));
    if (levels.length) list = list.filter(c => levels.includes(c.level));
    if (prices.length === 1) list = list.filter(c => (prices[0] === 'free') === !lms.priceOf(c));
    if (s.min != null) list = list.filter(c => lms.priceOf(c) >= s.min);
    if (s.max != null) list = list.filter(c => lms.priceOf(c) <= s.max);
    const enr = id => db.count('enrollments', { courseId: id });
    if (s.sort === 'popular' && !s.q) list = list.slice().sort((a, b) => enr(b.id) - enr(a.id));
    if (s.sort === 'newest') list = list.slice().sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
    if (s.sort === 'rating') list = list.slice().sort((a, b) => lms.rating(b.id).avg - lms.rating(a.id).avg);
    if (s.sort === 'az') list = list.slice().sort((a, b) => a.title.localeCompare(b.title));
    return list;
}
function catalogCard(c, view) {
    const ins = lms.primaryInstructor(c.id), r = lms.rating(c.id), meta = lms.courseMeta(c.id), cert = db.settings().certificates.enabled, list = view === 'list';
    const avatar = ins && ins.avatar ? `<img src="${esc(ins.avatar)}" alt="" class="w-7 h-7 rounded-full object-cover">` : `<span class="w-7 h-7 rounded-full bg-forest text-gold text-[10px] font-bold flex items-center justify-center" aria-hidden="true">${esc(ui.initials(ins ? ins.name : 'TO'))}</span>`;
    return `<a href="${courseUrl(c)}" class="group flex ${list ? 'flex-col sm:flex-row' : 'flex-col'} rounded-xl overflow-hidden bg-white border border-slate-200 hover:border-forest hover:shadow-luxe transition">
        <div class="relative ${list ? 'sm:w-64 sm:shrink-0 aspect-[16/9] sm:aspect-auto' : 'aspect-[16/9]'} overflow-hidden bg-slate-100"><img src="${esc(cardImg(c))}" alt="" loading="lazy" width="640" height="360" class="w-full h-full object-cover">
            ${lms.priceOf(c) ? '' : '<span class="absolute top-3 left-3 pill bg-gold text-ink">Free</span>'}</div>
        <div class="p-4 flex-1 flex flex-col min-w-0">
            <span class="self-start rounded-md bg-forest-50 text-forest-600 text-[11px] font-semibold px-2 py-0.5">${esc(lms.categoryName(c.categoryId))}</span>
            <h3 class="font-semibold text-ink mt-2 leading-snug">${esc(c.title)}</h3>
            <p class="text-sm text-slate-600 mt-1.5 line-clamp-3">${esc(c.shortDescription)}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-600"><span><i class="fa-solid fa-chart-simple mr-1.5 text-slate-400" aria-hidden="true"></i>${esc(c.level)}</span><span><i class="fa-regular fa-clock mr-1.5 text-slate-400" aria-hidden="true"></i>${meta.hours}h</span><span><i class="fa-regular fa-file-lines mr-1.5 text-slate-400" aria-hidden="true"></i>${ui.plural(meta.lessons, 'lesson')}</span></div>
            <div class="flex items-center gap-2 mt-3 text-xs text-slate-600">${avatar}<span class="truncate">${esc(ins ? ins.name : 'Tech Oasis Faculty')}</span>${r.count ? `<span class="ml-auto shrink-0"><i class="fa-solid fa-star text-gold" aria-hidden="true"></i> <b class="text-slate-700">${r.avg.toFixed(1)}</b></span>` : ''}</div>
            <div class="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100"><span class="text-lg font-semibold text-ink">${priceLabel(c)}</span>${cert ? '<span class="text-xs text-slate-600"><i class="fa-solid fa-award mr-1 text-forest" aria-hidden="true"></i>Certificate on completion</span>' : ''}</div>
            <span class="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-forest text-forest group-hover:bg-forest group-hover:text-white text-sm font-semibold h-10 transition">View course <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i></span>
        </div></a>`;
}
function renderCatalog() {
    const s = catalogState, cats = topCategories(), all = lms.listedCourses(), maxP = catalogMaxPrice();
    const selCats = asList(s.cat), selLevels = asList(s.level), selPrices = asList(s.price);
    document.getElementById('catSearch').value = s.q || '';
    document.getElementById('catSort').value = s.sort;
    const box = (group, value, label, count, on) => `<label class="flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm cursor-pointer hover:bg-slate-50 ${on ? 'bg-forest-50 font-semibold text-forest' : 'text-slate-700'}"><input type="checkbox" data-f="${group}" value="${esc(value)}" ${on ? 'checked' : ''} class="w-4 h-4 rounded accent-[#0C3B2E]"><span class="flex-1">${esc(label)}</span><span class="text-xs text-slate-500">${count}</span></label>`;
    document.getElementById('filterCats').innerHTML = box('cat', '', 'All categories', all.length, !selCats.length) + cats.map(c => box('cat', c.id, c.name, coursesInCategory(c.id).length, selCats.includes(c.id))).join('');
    document.getElementById('filterLevels').innerHTML = db.settings().courses.levels.map(l => box('level', l, l, all.filter(c => c.level === l).length, selLevels.includes(l))).join('');
    document.getElementById('filterPrice').innerHTML = box('price', 'free', 'Free', all.filter(c => !lms.priceOf(c)).length, selPrices.includes('free')) + box('price', 'paid', 'Paid', all.filter(c => lms.priceOf(c)).length, selPrices.includes('paid'));
    // Price range (only worth showing when courses have different prices)
    const lo = s.min == null ? 0 : s.min, hi = s.max == null ? maxP : s.max, cur = db.settings().payments.currency, sym = cur === 'USD' ? '$' : cur + ' ';
    document.getElementById('priceRange').innerHTML = maxP > 0 ? `<div class="flex items-center gap-2 text-xs"><label class="flex-1"><span class="sr-only">Minimum price</span><span class="flex items-center rounded-lg border border-slate-300 bg-white h-9 px-2 text-slate-500">${sym}<input id="priceMin" type="number" min="0" max="${maxP}" step="1" value="${lo}" class="w-full min-w-0 pl-1 text-slate-900 focus:outline-none bg-transparent"></span></label><span class="text-slate-400">to</span>
        <label class="flex-1"><span class="sr-only">Maximum price</span><span class="flex items-center rounded-lg border border-slate-300 bg-white h-9 px-2 text-slate-500">${sym}<input id="priceMax" type="number" min="0" max="${maxP}" step="1" value="${hi}" class="w-full min-w-0 pl-1 text-slate-900 focus:outline-none bg-transparent"></span></label></div>
        <div class="range-dual mt-3"><div class="range-track"></div><div class="range-fill" style="left:${lo / maxP * 100}%;right:${100 - hi / maxP * 100}%"></div><input id="rangeMin" type="range" min="0" max="${maxP}" step="1" value="${lo}" aria-label="Minimum price"><input id="rangeMax" type="range" min="0" max="${maxP}" step="1" value="${hi}" aria-label="Maximum price"></div>` : '';
    const list = catalogFiltered(), pages = Math.max(1, Math.ceil(list.length / CATALOG_PAGE_SIZE));
    s.page = Math.min(Math.max(1, s.page || 1), pages);
    const view = s.view === 'list' ? 'list' : 'grid', shown = list.slice((s.page - 1) * CATALOG_PAGE_SIZE, s.page * CATALOG_PAGE_SIZE);
    ui.$$('[data-view]').forEach(b => { const on = b.dataset.view === view; b.setAttribute('aria-pressed', on); b.className = 'w-10 h-10 flex items-center justify-center ' + (b.dataset.view === 'list' ? 'border-l border-slate-300 ' : '') + (on ? 'bg-forest text-white' : 'text-slate-600 hover:bg-slate-50'); });
    const active = selCats.length + selLevels.length + (selPrices.length ? 1 : 0) + (s.min != null || s.max != null ? 1 : 0);
    document.getElementById('filterCount').textContent = active ? '(' + active + ')' : '';
    document.getElementById('catalogLead').textContent = `${all.length} programmes across ${cats.length} categories, each built section by section with projects and certificates.`;
    document.getElementById('catalogCount').innerHTML = `<b class="text-ink">${list.length}</b> ${list.length === 1 ? 'course' : 'courses'} found${s.q ? ` for "<b class="text-ink">${esc(s.q)}</b>"` : ''}`;
    document.getElementById('catalogGrid').className = view === 'list' ? 'space-y-4' : 'grid sm:grid-cols-2 xl:grid-cols-3 gap-5';
    document.getElementById('catalogGrid').innerHTML = shown.map(c => catalogCard(c, view)).join('') || `<div class="col-span-full text-center py-16 bg-white rounded-xl border border-dashed border-slate-300"><i class="fa-solid fa-magnifying-glass text-3xl text-slate-300" aria-hidden="true"></i><p class="font-semibold text-ink mt-3">No programmes match these filters</p><button onclick="clearCatalogFilters()" class="btn btn-outline btn-sm mt-4">Clear filters</button></div>`;
    const btn = (label, page, extra, aria) => `<button type="button" data-page="${page}" ${aria || ''} class="min-w-9 h-9 px-2 rounded-lg border text-sm font-semibold ${extra}">${label}</button>`;
    document.getElementById('catalogPages').innerHTML = pages > 1
        ? btn('<i class="fa-solid fa-arrow-left text-xs" aria-hidden="true"></i>', s.page - 1, 'border-slate-300 bg-white text-slate-700 hover:border-forest ' + (s.page === 1 ? 'opacity-40 pointer-events-none' : ''), 'aria-label="Previous page"')
            + Array.from({ length: pages }, (_, i) => btn(i + 1, i + 1, i + 1 === s.page ? 'border-forest bg-forest text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-forest', `aria-label="Page ${i + 1}" ${i + 1 === s.page ? 'aria-current="page"' : ''}`)).join('')
            + btn('<i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i>', s.page + 1, 'border-slate-300 bg-white text-slate-700 hover:border-forest ' + (s.page === pages ? 'opacity-40 pointer-events-none' : ''), 'aria-label="Next page"')
        : '';
}
function clearCatalogFilters() { Object.assign(catalogState, { q: '', cat: '', level: '', price: '', min: null, max: null, page: 1 }); renderCatalog(); }
document.getElementById('catSearch').addEventListener('input', e => { catalogState.q = e.target.value; catalogState.page = 1; renderCatalog(); document.getElementById('catSearch').focus(); });
document.getElementById('catSort').addEventListener('change', e => { catalogState.sort = e.target.value; catalogState.page = 1; renderCatalog(); });
document.getElementById('clearFilters').addEventListener('click', clearCatalogFilters);
document.getElementById('filtersToggle').addEventListener('click', e => { const f = document.getElementById('catFilters'), open = f.classList.toggle('hidden') === false; e.currentTarget.setAttribute('aria-expanded', open); });
document.getElementById('page-catalog').addEventListener('change', e => {
    const t = e.target, f = t.dataset && t.dataset.f, S = catalogState;
    if (f) { S[f] = t.value === '' ? '' : [...document.querySelectorAll(`#catFilters [data-f="${f}"]`)].filter(i => i.checked && i.value !== '').map(i => i.value); S.page = 1; renderCatalog(); const again = [...document.querySelectorAll(`#catFilters [data-f="${f}"]`)].find(i => i.value === t.value); if (again) again.focus(); return; }
    if (t.id === 'priceMin' || t.id === 'priceMax' || t.id === 'rangeMin' || t.id === 'rangeMax') {
        const maxP = catalogMaxPrice(), isMin = t.id.endsWith('Min'), v = Math.min(maxP, Math.max(0, +t.value || 0));
        let lo = S.min == null ? 0 : S.min, hi = S.max == null ? maxP : S.max;
        if (isMin) lo = Math.min(v, hi); else hi = Math.max(v, lo);
        S.min = lo <= 0 ? null : lo; S.max = hi >= maxP ? null : hi; S.page = 1; renderCatalog(); const again = document.getElementById(t.id); if (again) again.focus();
    }
});
document.getElementById('page-catalog').addEventListener('input', e => { const t = e.target; if (t.id === 'rangeMin' || t.id === 'rangeMax') t.dispatchEvent(new Event('change', { bubbles: true })); });
document.getElementById('page-catalog').addEventListener('click', e => {
    const v = e.target.closest('[data-view]'); if (v) { catalogState.view = v.dataset.view; return renderCatalog(); }
    const pg = e.target.closest('[data-page]'); if (pg) { catalogState.page = +pg.dataset.page; renderCatalog(); document.getElementById('catTitle').scrollIntoView({ behavior: 'smooth' }); }
});

function renderAbout() {
    document.getElementById('aboutInstructors').innerHTML = db.all('instructors').filter(i => db.count('course_instructors', { instructorId: i.id })).map(i => `
        <div class="bg-white rounded-xl border border-slate-200/70 p-6 shadow-luxe">
            <div class="flex items-center gap-4">${i.avatar ? `<img src="${esc(i.avatar)}" alt="" class="w-16 h-16 rounded-2xl object-cover">` : `<span class="w-16 h-16 rounded-2xl bg-forest text-gold flex items-center justify-center font-bold">${esc(ui.initials(i.name))}</span>`}
            <div><div class="font-display text-lg text-ink">${esc(i.name)}</div><div class="text-xs text-forest-600 font-semibold">${esc(i.title)}</div></div></div>
            <p class="text-sm text-slate-600 mt-4">${esc(i.bio)}</p>
            <p class="text-xs text-slate-400 mt-3">${ui.plural(db.count('course_instructors', { instructorId: i.id }), 'programme')}</p></div>`).join('');
}

// Contact details come from School Settings. Social accounts and phone only appear once the school has filled them in.
function applyEmails() {
    const st = db.settings().school, map = { school: st.email, students: st.studentEmail };
    ui.$$('[data-email]').forEach(a => {
        const addr = map[a.dataset.email]; if (!addr) return;
        a.href = 'mailto:' + addr + (a.dataset.subject ? '?subject=' + encodeURIComponent(a.dataset.subject) : '');
        const t = a.querySelector('[data-email-text]'); if (t) t.textContent = addr;
    });
    const social = [['socialLinkedin', 'LinkedIn', 'fa-linkedin-in'], ['socialX', 'X', 'fa-x-twitter'], ['socialInstagram', 'Instagram', 'fa-instagram'], ['socialYoutube', 'YouTube', 'fa-youtube'], ['socialFacebook', 'Facebook', 'fa-facebook-f']]
        .filter(([k]) => /^https:\/\//i.test(st[k] || ''));
    document.getElementById('footerSocial').innerHTML = social.map(([k, label, ic]) => `<a href="${esc(st[k])}" target="_blank" rel="noopener noreferrer" aria-label="${label}" class="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center hover:border-gold hover:text-gold"><i class="fa-brands ${ic}" aria-hidden="true"></i></a>`).join('');
    const phone = (st.phone || '').trim();
    document.getElementById('contactPhone').classList.toggle('hidden', !phone);
    document.getElementById('contactPhoneText').textContent = phone;
}

// ---------------- Contact ----------------
// There is no server to receive messages yet, so the form composes an email in the visitor's own mail app.
// It never claims a message was sent: the school only receives it when the visitor presses Send there.
function renderContact() { document.getElementById('contactStatus').classList.add('hidden'); }
document.getElementById('contactForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, v = k => f.elements[k].value.trim(), st = db.settings().school;
    const errs = {};
    if (v('name').length < 2) errs.cName = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) errs.cEmail = 'Enter a valid email address, such as name@example.com.';
    if (v('message').length < 10) errs.cMsg = 'Write at least a short sentence so we can help (10 characters or more).';
    ['cName', 'cEmail', 'cMsg'].forEach(id => {
        const el = document.getElementById(id), msg = document.getElementById(id + '-err');
        el.setAttribute('aria-invalid', errs[id] ? 'true' : 'false');
        msg.textContent = errs[id] ? 'Error: ' + errs[id] : ''; msg.classList.toggle('hidden', !errs[id]);
    });
    const box = document.getElementById('contactErrors'), status = document.getElementById('contactStatus');
    status.classList.add('hidden');
    if (Object.keys(errs).length) {
        box.innerHTML = 'Please fix the following before continuing:<ul class="list-disc ml-5 mt-1">' + Object.values(errs).map(m => '<li>' + esc(m) + '</li>').join('') + '</ul>';
        box.classList.remove('hidden'); box.focus(); return;
    }
    box.classList.add('hidden');
    const topic = v('topic'), to = topic === 'students' ? st.studentEmail : st.email;
    const subject = { general: 'Enquiry', students: 'Student support', org: 'Organisation training enquiry' }[topic] + ' from ' + v('name');
    const body = v('message') + '\n\n' + v('name') + '\n' + v('email');
    location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    status.innerHTML = 'Your email app should now open with your message to <b>' + esc(to) + '</b>. The message is only sent when you press Send there. If nothing opened, email us directly at <a class="underline" href="mailto:' + esc(to) + '">' + esc(to) + '</a>.';
    status.classList.remove('hidden');
});

function renderHome() {
    renderExplore(); renderHero(); renderPopular(); renderPromo(); renderTools(); renderPaths(); renderCatTabs(); renderReviews(); renderFaq();
    document.getElementById('certLogo').innerHTML = ui.brandLogo(false, 40);
    const c = db.settings().certificates;
    document.getElementById('certRules').textContent = `A certificate is issued when you complete ${c.minLessonPct}% of a course's lessons${c.requireQuizPass ? ', pass its quizzes' : ''}${c.requireAssignments ? ` and have your assignments graded (at least ${c.minAssignmentPct}%)` : ''}.`;
    document.getElementById('priceCurrency').textContent = db.settings().payments.currency;
}

// ---------------- Boot ----------------
window.addEventListener('load', () => setTimeout(() => { const p = document.getElementById('preloader'); p.style.opacity = '0'; setTimeout(() => p.remove(), 700); }, sessionStorage.getItem('tos_seen') ? 150 : 600));
sessionStorage.setItem('tos_seen', '1');
document.getElementById('year').textContent = new Date().getFullYear();
// Boot after every script (including portal.js, which defines the sign-in modal) has loaded
document.addEventListener('DOMContentLoaded', function route() {
    ui.applyBrandLogos(); applyEmails(); renderHome(); initScrollHints();
    const h = location.hash.slice(1), p = ui.qs('login');
    if (p === 'student') { location.replace('/student/' + (ui.qs('mode') === 'register' ? 'register' : 'login') + (ui.qs('next') ? '?next=' + encodeURIComponent('/' + ui.qs('next').replace(/^\/+/, '')) : '')); return; }
    if (p === 'staff') { location.replace('/staff/login'); return; }
    if (PUBLIC_PAGES.includes(h)) return showPage(h);
    if (h === 'my-learning' || h === 'portal') return auth.current() ? goToPortal() : showPage('home');
    showPage('home');
    if (h && document.getElementById(h)) setTimeout(() => document.getElementById(h).scrollIntoView(), 100);
});
db.onChange(() => { if (!document.getElementById('page-home').classList.contains('hidden')) { renderPopular(); renderReviews(); } });
