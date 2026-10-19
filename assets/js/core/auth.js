// Accounts & sessions shared by every page.
// NOTE: this static build keeps accounts in the browser, so it is a working demo, not real security.
// For production, replace these functions with calls to your auth provider (e.g. Supabase Auth) and
// keep the same signatures so pages don't change.
//
// Passwords are never stored in plain text: any write of `password` to a user is converted to a salted
// PBKDF2 hash (`passwordHash`) by a data-layer trigger, so every form and admin action is covered.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const db = TOS.db, C = TOS.crypto;
    const SESSION_KEY = 'to_current_user';
    const ADMIN_KEY = 'tos_admin_session';
    const ADMIN_TTL = 8 * 3600000;

    // ---- Password storage ----
    function hashIncomingPassword(row) {
        if (!('password' in row)) return;
        const pw = row.password; delete row.password;
        if (pw) { row.passwordHash = C.hashPassword(pw); row.passwordChangedAt = db.now(); }
    }
    db.on('users', (evt, row) => { if (evt === 'insert' || evt === 'update') hashIncomingPassword(row); });
    const verifyUser = (u, pw) => !!u && !!pw && C.verifyPassword(pw, u.passwordHash);
    // Migration: hash any plain-text passwords left by earlier versions, and the admin passcode
    (TOS.migrations = TOS.migrations || []).unshift(function (db) {
        // Writes go through db.update so the trigger hashes them and the change is saved
        db.all('users').filter(u => 'password' in u).forEach(u => db.update('users', u.id, { password: u.password }));
        const st = db.settings().school;
        if (!st.adminPasscodeHash || 'adminPasscode' in st) {
            db.updateSettings('school', { adminPasscodeHash: st.adminPasscodeHash || C.hashPassword(st.adminPasscode || 'admin123') });
            delete db.settings().school.adminPasscode;
        }
    });

    // ---- Sessions ----
    // Session lives in localStorage when 'remember me' is ticked, otherwise only for this browser tab session.
    const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } };
    const isActive = u => !u.status || u.status === 'active';
    function current() {
        const s = readSession(); if (!s) return null;
        const u = s.id && db.get('users', s.id);
        if (!u || !isActive(u)) return null;
        return { id: u.id, name: u.name, email: u.email, role: u.role, studentId: u.studentId || null, mustChangePassword: !!u.mustChangePassword };
    }
    // Why there is no valid session: 'none' | 'deleted' | the account status ('suspended', 'banned', 'archived'…)
    function sessionProblem() {
        const s = readSession(); if (!s) return 'none';
        const u = s.id && db.get('users', s.id);
        return !u ? 'deleted' : isActive(u) ? null : u.status;
    }
    function start(user, remember) {
        const data = JSON.stringify({ id: user.id, role: user.role, ts: Date.now() });
        localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY);
        (remember === false ? sessionStorage : localStorage).setItem(SESSION_KEY, data);
        return current();
    }
    function logout() { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); }

    // Messages shown for accounts that exist but may not sign in. Never reveal internal notes.
    const contact = () => db.settings().school.email;
    const STATUS_MESSAGES = {
        suspended: r => r === 'staff' ? 'Your staff account is currently suspended. Please contact administration.' : 'This account is suspended. Please contact ' + db.settings().school.studentEmail + '.',
        banned: r => r === 'staff' ? 'Your staff account has been disabled. Please contact administration.' : 'This account has been disabled. Please contact ' + db.settings().school.studentEmail + '.',
        archived: () => 'This account is no longer active. Please contact ' + contact() + '.',
        deleted: () => 'This account is no longer active. Please contact ' + contact() + '.'
    };
    const statusMessage = u => (STATUS_MESSAGES[u.status] || STATUS_MESSAGES.archived)(u.role);

    // Students may sign in with their email or their student ID. Both the password AND the account status must pass.
    function login(email, password, role, remember) {
        email = String(email || '').trim().toLowerCase();
        const u = db.first('users', x => x.email === email || (x.studentId && x.studentId.toLowerCase() === email));
        if (!verifyUser(u, password)) return { error: 'Incorrect email, student ID or password.' };
        if (!isActive(u)) return { error: statusMessage(u), status: u.status };
        if (role && u.role !== role) return { error: u.role === 'staff' ? 'This is a staff account. Sign in at the Staff Portal.' : 'This is a student account. Sign in at the Student Portal.' };
        db.update('users', u.id, { lastLoginAt: db.now() });
        return { user: start(u, remember) };
    }
    function changePassword(userId, currentPassword, newPassword) {
        const u = db.get('users', userId);
        if (!verifyUser(u, currentPassword)) return { error: 'Your current password is incorrect.' };
        if (String(newPassword).length < 8) return { error: 'Use at least 8 characters for your new password.' };
        if (currentPassword === newPassword) return { error: 'Choose a password different from your current one.' };
        db.update('users', userId, { password: newPassword, mustChangePassword: false });
        return { ok: true };
    }
    function register({ name, email, password }) {
        email = String(email || '').trim().toLowerCase();
        if (db.settings().portal && db.settings().portal.allowSelfRegistration === false) return { error: 'New accounts are created by the school. Please contact ' + db.settings().school.email + '.' };
        if (db.first('users', { email })) return { error: 'An account with this email already exists. Please log in.' };
        const u = db.insert('users', { role: 'student', name: (name || '').trim() || email.split('@')[0], email, password, lastLoginAt: db.now() });
        return { user: start(u) };
    }

    // ---- Admin (separate session, separate login page) ----
    const isAdmin = () => { try { const s = JSON.parse(localStorage.getItem(ADMIN_KEY)); return !!s && Date.now() - s.ts < ADMIN_TTL; } catch (e) { return false; } };
    function adminLogin(id, pass) {
        const st = db.settings().school;
        const okId = [String(st.adminEmail).toLowerCase(), 'admin'].includes(String(id).trim().toLowerCase());
        if (okId && C.verifyPassword(pass, st.adminPasscodeHash)) { localStorage.setItem(ADMIN_KEY, JSON.stringify({ ts: Date.now() })); return true; }
        return false;
    }
    const setAdminPasscode = pass => db.updateSettings('school', { adminPasscodeHash: C.hashPassword(pass) });
    const adminLogout = () => localStorage.removeItem(ADMIN_KEY);

    // ---- One-time import of data saved by the previous (flat) version of the site ----
    TOS.migrateLegacy = function (db) {
        const st = db.settings(); if (st._legacyMigrated) return;
        st._legacyMigrated = true; // saved with the next write; re-running is harmless (it skips existing rows)
        let users = [], students = [];
        try { users = JSON.parse(localStorage.getItem('to_users')) || []; } catch (e) { }
        try { students = JSON.parse(localStorage.getItem('to_students')) || []; } catch (e) { }
        users.forEach(u => {
            const email = String(u.email || '').toLowerCase(); if (!email || db.first('users', { email })) return;
            db.insert('users', { role: u.role === 'staff' ? 'staff' : 'student', name: u.name || email.split('@')[0], email, password: u.password || '' });
        });
        students.forEach(s => {
            const email = String(s.email || '').toLowerCase(); if (!email) return;
            const user = db.first('users', { email }) || db.insert('users', { role: 'student', name: s.name || email, email, password: '' });
            const course = db.first('courses', c => c.title === s.course); if (!course || db.first('enrollments', { userId: user.id, courseId: course.id })) return;
            const paid = /^paid/i.test(s.status || '');
            const order = db.insert('orders', { userId: user.id, couponId: null, subtotal: 5, discount: 0, total: 5, currency: 'USD', status: paid ? 'paid' : 'pending', provider: 'manual', paidAt: paid ? db.now() : null });
            db.insert('order_items', { orderId: order.id, courseId: course.id, price: 5 });
            db.insert('enrollments', { userId: user.id, courseId: course.id, status: paid ? 'active' : 'trial', enrolledAt: new Date(new Date(s.trialEnd || Date.now()).getTime() - 7 * 86400000).toISOString(), trialEndsAt: s.trialEnd || null, orderId: order.id, currentLessonId: null, lastAccessAt: null, source: 'legacy' });
        });
    };

    TOS.auth = { current, sessionProblem, start, logout, login, register, changePassword, verifyUser, isActive, statusMessage, isAdmin, adminLogin, adminLogout, setAdminPasscode };
})();
