// Student sign-in pages: /student/login, /student/register, /student/forgot-password
(function () {
    const safeNext = n => n && n.startsWith('/') && !n.startsWith('//') ? n : '/student/dashboard';
    const layout = (title, sub, body) => `<main class="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
        <section class="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-forest via-forest-600 to-ink text-white p-12 flex-col justify-between grain">
            <div class="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-gold/15 blur-3xl"></div><div class="absolute -left-24 bottom-0 w-80 h-80 rounded-full bg-forest-400/20 blur-3xl"></div>
            <a href="/" class="relative" aria-label="Tech Oasis School website">${ui.brandLogo(true, 44)}</a>
            <div class="relative max-w-md">
                <span class="text-[11px] font-bold uppercase tracking-[0.25em] text-gold-200">Student Portal</span>
                <h2 class="font-display text-[44px] leading-[1.08] mt-4">Your learning, all in one place.</h2>
                <ul class="mt-8 space-y-4 text-white/85 text-[15px]">
                    <li class="flex gap-3"><span class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0"><i class="fa-solid fa-circle-play"></i></span><span>Pick up exactly where you left off, on any device</span></li>
                    <li class="flex gap-3"><span class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0"><i class="fa-solid fa-list-check"></i></span><span>Assignments, quizzes and deadlines in one calendar</span></li>
                    <li class="flex gap-3"><span class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0"><i class="fa-solid fa-award"></i></span><span>Verified certificates when you complete a program</span></li>
                </ul>
            </div>
            <p class="relative text-xs text-white/50">&copy; ${new Date().getFullYear()} Tech Oasis School · <a href="mailto:${esc(db.settings().school.studentEmail)}" class="underline">${esc(db.settings().school.studentEmail)}</a></p>
        </section>
        <section class="flex items-center justify-center p-6 sm:p-10">
            <div class="w-full max-w-[400px]">
                <a href="/" class="lg:hidden inline-block mb-10">${ui.brandLogo(false, 40)}</a>
                <h1 class="text-[28px] font-bold text-slate-900 tracking-tight">${title}</h1>
                <p class="text-sm s-muted mt-1.5">${sub}</p>
                ${ui.demoNotice()}
                <div class="mt-8">${body}</div>
            </div>
        </section></main>`;
    const notice = (kind, html) => `<div class="mb-5 rounded-xl px-4 py-3 text-sm ${kind === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-100' : kind === 'warn' ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}" role="${kind === 'error' ? 'alert' : 'status'}">${html}</div>`;
    const pwField = (id, label, auto) => `<div><div class="flex items-center justify-between"><label class="field-label" for="${id}">${label}</label>${id === 'pw' ? '<a href="/student/forgot-password" class="text-xs font-semibold text-forest-600 hover:underline">Forgot password?</a>' : ''}</div>
        <div class="relative"><input id="${id}" type="password" required minlength="${id === 'pw' ? 1 : 8}" autocomplete="${auto}" class="field h-12 pr-11"><button type="button" data-eye="${id}" class="absolute right-1 top-1 w-10 h-10 rounded-lg text-slate-400 hover:text-slate-700" aria-label="Show password"><i class="fa-regular fa-eye"></i></button></div></div>`;
    const bindEyes = () => document.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = document.getElementById(b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; b.innerHTML = `<i class="fa-regular ${i.type === 'password' ? 'fa-eye' : 'fa-eye-slash'}"></i>`; b.setAttribute('aria-label', i.type === 'password' ? 'Show password' : 'Hide password'); });

    // Sign in and Create account share one card. A forest-green panel with the animated Tech Oasis mark slides
    // between the two forms; below 768 px the panel is hidden and a text link switches the form instead.
    const field = (id, type, auto, placeholder, label, extra) => `<div class="relative"><label for="${id}" class="sr-only">${label}</label>
        <input id="${id}" type="${type}" required autocomplete="${auto}" placeholder="${placeholder}" class="w-full h-12 rounded-lg bg-slate-100 border border-transparent px-4 ${extra ? 'pr-16' : ''} text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:bg-white focus:border-forest-600 focus:ring-2 focus:ring-forest-600/20 transition">${extra || ''}</div>`;
    const showBtn = id => `<button type="button" data-show="${id}" class="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold tracking-wider text-forest-600 hover:underline px-1" aria-label="Show password" aria-pressed="false">SHOW</button>`;
    const errP = id => `<p id="${id}" class="hidden text-sm font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3 text-left" role="alert"></p>`;
    const PATHS = { login: '/student/login', register: '/student/register' }, TITLES = { login: 'Student sign in', register: 'Create account' };

    function renderAuth(el, mode0) {
        const q = S.q, school = db.settings().school, allowReg = db.settings().portal.allowSelfRegistration !== false;
        let mode = allowReg ? mode0 : 'login';
        const msg = q('expired') ? notice('warn', '<i class="fa-solid fa-clock mr-1"></i>Your session has expired. Please sign in again.')
            : (q('suspended') || q('state')) ? notice('error', `<i class="fa-solid fa-ban mr-1"></i>This account is suspended. Contact <a class="underline" href="mailto:${esc(school.studentEmail)}">${esc(school.studentEmail)}</a>.`)
            : q('signedout') ? notice('ok', '<i class="fa-solid fa-circle-check mr-1"></i>You have been signed out.')
            : q('reset') ? notice('ok', '<i class="fa-solid fa-circle-check mr-1"></i>Your request was saved on this device. The school only sees it when it is connected to a server, so please also email ' + esc(school.studentEmail) + ' to get your password reset.') : '';
        const loginForm = `<div class="auth-form auth-login px-7 sm:px-10 py-10 flex flex-col justify-center text-center">
                <a href="/" class="md:hidden self-center mb-5" aria-label="Tech Oasis School website">${ui.brandLogo(false, 34)}</a>
                <h1 class="text-[28px] font-extrabold text-ink tracking-tight">Sign in</h1>
                <p class="text-sm text-slate-500 mt-1">Use your email or student ID</p>
                <div class="mt-5 text-left">${msg}</div>
                <form id="loginForm" class="space-y-3.5 text-left" novalidate>
                    ${field('who', 'text', 'username', 'Email or student ID', 'Email or student ID')}
                    ${field('pw', 'password', 'current-password', 'Password', 'Password', showBtn('pw'))}
                    <div class="flex items-center justify-between gap-3 text-xs">
                        <label class="flex items-center gap-2 text-slate-600 cursor-pointer"><input id="remember" type="checkbox" checked class="w-4 h-4 rounded accent-[#0C3B2E]">Remember me</label>
                        <a href="/student/forgot-password" class="font-semibold text-forest-600 hover:underline">Forgot password?</a></div>
                    ${errP('loginErr')}
                    <div class="text-center pt-1"><button class="btn btn-forest h-11 px-12 uppercase tracking-wider text-xs">Sign in</button></div>
                </form>
                <p class="md:hidden mt-6 text-sm text-slate-600">${allowReg ? `New to Tech Oasis? <button type="button" data-switch="register" class="font-semibold text-forest-600 hover:underline">Create an account</button>` : `Accounts are created by the school: <a href="mailto:${esc(school.email)}" class="font-semibold text-forest-600 underline">${esc(school.email)}</a>`}</p>
                <p class="mt-5 text-xs text-slate-500">Staff or instructor? <a href="/staff/login" class="underline">Staff dashboard sign in</a> · <a href="/" class="underline">Back to website</a></p></div>`;
        const regForm = allowReg ? `<div class="auth-form auth-reg px-7 sm:px-10 py-10 flex flex-col justify-center text-center">
                <a href="/" class="md:hidden self-center mb-5" aria-label="Tech Oasis School website">${ui.brandLogo(false, 34)}</a>
                <h1 class="text-[28px] font-extrabold text-ink tracking-tight">Create Account</h1>
                <p class="text-sm text-slate-500 mt-1">Register with your email, then enrol in any course</p>
                <form id="regForm" class="space-y-3.5 mt-6 text-left" novalidate>
                    ${field('nm', 'text', 'name', 'Full name', 'Full name')}
                    ${field('em', 'email', 'email', 'Email', 'Email')}
                    ${field('pw1', 'password', 'new-password', 'Password (at least 8 characters)', 'Password', showBtn('pw1'))}
                    ${errP('regErr')}
                    <div class="text-center pt-1"><button class="btn btn-forest h-11 px-10 uppercase tracking-wider text-xs">Create account</button></div>
                </form>
                <p class="md:hidden mt-6 text-sm text-slate-600">Already registered? <button type="button" data-switch="login" class="font-semibold text-forest-600 hover:underline">Sign in</button></p></div>` : '';
        const panelText = m => m === 'login'
            ? (allowReg ? ['New to Tech Oasis?', 'Create your student account and start learning.', `<button type="button" data-switch="register" class="btn h-11 px-8 uppercase tracking-wider text-xs border border-white text-white hover:bg-white hover:text-forest">Create account</button>`]
                : ['Need an account?', 'Accounts are created by the school.', `<a href="mailto:${esc(school.email)}" class="btn h-11 px-8 uppercase tracking-wider text-xs border border-white text-white hover:bg-white hover:text-forest">Email admissions</a>`])
            : ['Already registered?', 'Sign in with your email or student ID.', `<button type="button" data-switch="login" class="btn h-11 px-8 uppercase tracking-wider text-xs border border-white text-white hover:bg-white hover:text-forest">Sign in</button>`];
        el.innerHTML = `<main class="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-forest-600 via-forest to-ink">
            <div id="authCard" data-mode="${mode}" class="auth-card relative w-full max-w-[900px] rounded-2xl overflow-hidden bg-white shadow-lift md:min-h-[560px] grid md:grid-cols-2">
                ${loginForm}${regForm}
                <aside class="auth-panel hidden md:flex flex-col items-center justify-center text-center text-white px-8 bg-gradient-to-br from-forest-600 to-forest" aria-label="Switch between sign in and create account">
                    ${ui.animatedLogo(140, 'student')}
                    <div class="text-white text-lg font-extrabold tracking-[0.2em] mt-4">TECH <span class="gold-text">OASIS</span></div>
                    <div id="panelText" class="mt-8" aria-live="polite"></div>
                </aside>
            </div>
            <div class="w-full max-w-[900px]">${ui.demoNotice()}</div>
            <p class="text-xs text-white/60 mt-5">&copy; ${new Date().getFullYear()} Tech Oasis School · <a href="mailto:${esc(school.studentEmail)}" class="underline">${esc(school.studentEmail)}</a></p></main>`;
        const card = el.querySelector('#authCard');
        const paint = () => {
            card.dataset.mode = mode;
            const [t, sub, action] = panelText(mode);
            el.querySelector('#panelText').innerHTML = `<div class="text-xl font-bold">${t}</div><p class="text-sm text-white/80 mt-2 mb-5">${sub}</p>${action}`;
            // The covered form is made inert so keyboard and screen-reader users only reach the visible one
            el.querySelectorAll('.auth-login').forEach(f => f.toggleAttribute('inert', mode !== 'login'));
            el.querySelectorAll('.auth-reg').forEach(f => f.toggleAttribute('inert', mode !== 'register'));
            document.title = TITLES[mode] + ' | Tech Oasis School';
        };
        const switchTo = m => {
            if (m === mode || (m === 'register' && !allowReg)) return;
            mode = m; paint();
            history.replaceState(null, '', PATHS[m] + location.search);
            setTimeout(() => { const f = el.querySelector(m === 'login' ? '#who' : '#nm'); if (f) f.focus({ preventScroll: true }); }, 60);
        };
        paint();
        el.addEventListener('click', e => { const b = e.target.closest('[data-switch]'); if (b) switchTo(b.dataset.switch); });
        el.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { const i = el.querySelector('#' + b.dataset.show), show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'HIDE' : 'SHOW'; b.setAttribute('aria-pressed', show); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });
        const first = el.querySelector(mode === 'login' ? '#who' : '#nm'); if (first) first.focus({ preventScroll: true });
        el.querySelector('#loginForm').onsubmit = e => {
            e.preventDefault();
            const err = el.querySelector('#loginErr'), who = el.querySelector('#who').value.trim(), pw = el.querySelector('#pw').value;
            if (!who || !pw) { err.textContent = 'Enter your email or student ID and your password.'; return err.classList.remove('hidden'); }
            const r = auth.login(who, pw, null, el.querySelector('#remember').checked);
            if (r.error) { err.textContent = r.error; return err.classList.remove('hidden'); }
            if (r.user.role !== 'student') { auth.logout(); err.innerHTML = r.user.role === 'staff' ? 'This is a staff account. Use the <a class="underline" href="/staff/login">Staff dashboard sign-in</a>.' : 'This account cannot sign in to the student portal.'; return err.classList.remove('hidden'); }
            S.me = null;
            const next = safeNext(q('next'));
            if (next.startsWith('/student')) S.go(next, { replace: true }); else location.href = next;
        };
        if (allowReg) el.querySelector('#regForm').onsubmit = e => {
            e.preventDefault();
            const err = el.querySelector('#regErr'), name = el.querySelector('#nm').value.trim(), email = el.querySelector('#em').value.trim(), pass = el.querySelector('#pw1').value;
            const bad = name.length < 2 ? 'Enter your full name.' : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Enter a valid email address, such as name@example.com.' : pass.length < 8 ? 'Use a password of at least 8 characters.' : '';
            if (bad) { err.textContent = bad; return err.classList.remove('hidden'); }
            const r = auth.register({ name, email, password: pass });
            if (r.error) { err.textContent = r.error; return err.classList.remove('hidden'); }
            S.me = null; ui.toast('Welcome to Tech Oasis! Your student ID is ' + (r.user.studentId || ''));
            const next = safeNext(S.q('next'));
            if (next.startsWith('/student')) S.go(next, { replace: true }); else location.href = next;
        };
    }
    S.route('/student/login', { title: 'Student sign in', layout: 'auth', render: el => renderAuth(el, 'login') });
    S.route('/student/register', { title: 'Create account', layout: 'auth', render: el => renderAuth(el, 'register') });

    S.route('/student/forgot-password', { title: 'Reset password', layout: 'auth', render: el => {
        el.innerHTML = layout('Reset your password', 'Enter your email or student ID to request a new password. If you need it urgently, email the school directly.', `<form id="fpForm" class="space-y-5">
            <div><label class="field-label" for="who">Email or student ID</label><input id="who" required class="field h-12"></div>
            <div><label class="field-label" for="note">Anything we should know? <span class="font-normal s-muted">(optional)</span></label><textarea id="note" rows="3" class="field" placeholder="e.g. best phone number to reach you"></textarea></div>
            <button class="btn btn-forest w-full h-12">Request password reset</button></form>
            <a href="/student/login" class="block text-center text-sm font-semibold text-forest-600 mt-6">Back to sign in</a>`);
        document.getElementById('fpForm').onsubmit = e => {
            e.preventDefault();
            const who = document.getElementById('who').value.trim().toLowerCase();
            const u = db.first('users', x => x.role === 'student' && (x.email === who || (x.studentId || '').toLowerCase() === who));
            // Same response whether or not the account exists, so emails can't be probed
            if (u) TOS.engage.openTicket(u.id, { category: 'account', subject: 'Password reset request', body: 'Password reset requested from the sign-in page.' + (document.getElementById('note').value ? '\n\nNote: ' + document.getElementById('note').value : '') });
            S.go('/student/login?reset=1', { replace: true });
        };
    } });
})();
