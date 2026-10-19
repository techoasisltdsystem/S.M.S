// Header + footer shared by sub-pages (course landing, certificate verification). Mirrors the homepage navigation and footer.
(function () {
    const { ui, auth, db } = TOS, esc = ui.esc;
    const W = 'max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8';
    const LINKS = [['Home', 'index.html'], ['Courses', 'index.html#catalog'], ['For Individuals', 'index.html#how-it-works'], ['For Organisations', 'index.html#organisations'], ['About', 'index.html#about'], ['Contact', 'index.html#contact']];
    function header() {
        const me = auth.current(), here = encodeURIComponent('/' + location.pathname.split('/').pop() + location.search);
        const cta = me
            ? `<a href="${me.role === 'student' ? '/student/dashboard' : '/staff/dashboard'}" class="btn btn-outline btn-sm"><span class="w-6 h-6 -ml-1 rounded-full bg-forest text-gold text-[10px] font-bold flex items-center justify-center">${esc(ui.initials(me.name))}</span>${me.role === 'staff' ? 'Staff Portal' : 'My Learning'}</a>`
            : `<div class="relative hidden sm:block" id="signinWrap"><button type="button" id="signinBtn" class="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-forest px-2 h-10" aria-haspopup="true" aria-expanded="false" aria-controls="signinMenu">Sign in <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true"></i></button>
                <div id="signinMenu" class="hidden absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lift border border-slate-200 py-2 z-50">
                    <a href="/student/login?next=${here}" class="block px-4 py-2.5 hover:bg-ivory"><span class="block text-sm font-semibold text-ink">Student sign in</span><span class="block text-xs text-slate-500">Your courses, progress and certificates</span></a>
                    <a href="/staff/login" class="block px-4 py-2.5 hover:bg-ivory"><span class="block text-sm font-semibold text-ink">Staff dashboard sign in</span><span class="block text-xs text-slate-500">For approved instructors and staff</span></a></div></div><span class="hidden sm:inline-flex"><a href="index.html#catalog" class="btn btn-forest h-10 whitespace-nowrap">Explore courses</a></span>`;
        return `<header id="siteHeader" class="sticky top-0 z-40 bg-white border-b border-slate-200 no-print">
            <div class="${W} h-16 flex items-center gap-3 xl:gap-8">
                <button id="chromeMenuBtn" class="xl:hidden w-11 h-11 -ml-2 rounded-lg hover:bg-slate-100" aria-label="Open menu" aria-expanded="false" aria-controls="chromeMenu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
                <a href="index.html" aria-label="Tech Oasis School home" class="shrink-0">${ui.brandLogo(false, 36)}</a>
                <nav class="hidden xl:flex items-center gap-1 text-sm font-semibold text-slate-700" aria-label="Main">${LINKS.map(([t, h]) => `<a href="${h}" class="nav-link">${t}</a>`).join('')}</nav>
                <div class="ml-auto flex items-center gap-2 sm:gap-3">${cta}</div>
            </div>
            <nav id="chromeMenu" class="hidden xl:hidden border-t border-slate-200 bg-white px-4 py-2 text-sm font-semibold" aria-label="Mobile">${LINKS.concat([['Check a certificate', 'verify.html'], ['Student sign in', '/student/login'], ['Staff dashboard sign in', '/staff/login']]).map(([t, h]) => `<a href="${h}" class="block px-3 py-3 rounded-lg hover:bg-ivory">${t}</a>`).join('')}</nav>
        </header>`;
    }
    function footer() {
        const st = db.settings().school;
        const social = [['socialLinkedin', 'LinkedIn', 'fa-linkedin-in'], ['socialX', 'X', 'fa-x-twitter'], ['socialInstagram', 'Instagram', 'fa-instagram'], ['socialYoutube', 'YouTube', 'fa-youtube'], ['socialFacebook', 'Facebook', 'fa-facebook-f']].filter(([k]) => /^https:\/\//i.test(st[k] || ''));
        const col = (t, items) => `<div><h2 class="text-white font-semibold text-sm mb-3">${t}</h2><ul class="space-y-2 text-sm">${items.map(([l, h]) => `<li><a href="${h}" class="hover:text-gold">${l}</a></li>`).join('')}</ul></div>`;
        return `<footer id="siteFooter" class="bg-ink text-white/75 mt-20 no-print"><div class="${W} py-12">
            <div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                <div><a href="index.html" aria-label="Tech Oasis School home">${ui.brandLogo(true, 36)}</a>
                    ${social.length ? `<div class="flex gap-2 mt-5">${social.map(([k, l, ic]) => `<a href="${esc(st[k])}" target="_blank" rel="noopener noreferrer" aria-label="${l}" class="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center hover:border-gold hover:text-gold"><i class="fa-brands ${ic}" aria-hidden="true"></i></a>`).join('')}</div>` : ''}</div>
                ${col('School', [['Courses', 'index.html#catalog'], ['About', 'index.html#about'], ['For organisations', 'index.html#organisations'], ['Contact', 'index.html#contact'], ['Check a certificate', 'verify.html']])}
                ${col('Sign in', [['Student sign in', '/student/login'], ['Create a student account', '/student/register'], ['Instructor and staff sign in', '/staff/login'], ['Teach at Tech Oasis', '/staff/apply']])}
                <div><h2 class="text-white font-semibold text-sm mb-3">Contact</h2><ul class="space-y-3 text-sm"><li><span class="block text-white/50 text-xs">General &amp; admissions</span><a href="mailto:${esc(st.email)}" class="hover:text-gold break-all">${esc(st.email)}</a></li><li><span class="block text-white/50 text-xs">Student support</span><a href="mailto:${esc(st.studentEmail)}" class="hover:text-gold break-all">${esc(st.studentEmail)}</a></li></ul></div>
            </div>
            <p class="mt-10 pt-6 border-t border-white/10 text-xs text-white/50">&copy; ${new Date().getFullYear()} ${esc(st.name)}. All rights reserved.</p></div></footer>`;
    }
    TOS.chrome = { mount() {
        const h = document.getElementById('siteHeader'), f = document.getElementById('siteFooter');
        if (h) h.outerHTML = header(); if (f) f.outerHTML = footer();
        const btn = document.getElementById('chromeMenuBtn'), menu = document.getElementById('chromeMenu');
        if (btn) btn.onclick = () => { const open = menu.classList.toggle('hidden') === false; btn.setAttribute('aria-expanded', open); };
        const sb = document.getElementById('signinBtn'), sm = document.getElementById('signinMenu');
        const setSignin = open => { if (!sm) return; sm.classList.toggle('hidden', !open); sb.setAttribute('aria-expanded', open); };
        if (sb) { sb.onclick = () => setSignin(sm.classList.contains('hidden')); document.addEventListener('click', e => { if (!e.target.closest('#signinWrap')) setSignin(false); }); document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sm.classList.contains('hidden')) { setSignin(false); sb.focus(); } }); }
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu && !menu.classList.contains('hidden')) { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
    } };
})();
