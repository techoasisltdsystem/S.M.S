// Staff Portal (/staff/*): app config for the shared portal shell.
const sapi = TOS.staffApi, ST = TOS.staff;
const has = (me, perm) => !!me && (me.permissions || []).includes(perm);

S.APPS.staff = {
    base: '/staff', role: 'staff', label: 'Staff', name: 'Staff Portal', api: sapi,
    searchPlaceholder: 'Search courses, lessons, students',
    forcePasswordRoute: '/staff/change-password',
    // [key, label, icon, badgeKey, visibleIf(me)]
    nav: [
        { title: 'Teaching', items: [['dashboard', 'Dashboard', 'fa-house'], ['courses', 'My Courses', 'fa-book-open', null, me => has(me, 'view_courses')], ['students', 'Students', 'fa-user-graduate', null, me => has(me, 'view_students')], ['grading', 'Grading', 'fa-list-check', 'grading', me => has(me, 'grade_students')], ['quizzes', 'Quiz Results', 'fa-square-poll-vertical', null, me => has(me, 'view_courses')]] },
        { title: 'Communication', items: [['messages', 'Messages', 'fa-envelope', 'messages'], ['announcements', 'Announcements', 'fa-bullhorn'], ['notifications', 'Notifications', 'fa-bell', 'notifications']] },
        { title: 'Planning', items: [['schedule', 'Schedule', 'fa-calendar-days']] },
        { title: 'Account', items: [['profile', 'Profile', 'fa-user'], ['settings', 'Settings', 'fa-gear'], ['help', 'Help', 'fa-life-ring']] }
    ],
    bottom: [['dashboard', 'Home', 'fa-house'], ['courses', 'Courses', 'fa-book-open'], ['grading', 'Grade', 'fa-list-check', 'primary'], ['notifications', 'Alerts', 'fa-bell'], ['profile', 'Profile', 'fa-user']],
    roleLine: me => me.roleLabel || 'Staff',
    card: me => `<div class="text-[11px] text-forest-600 font-semibold truncate">${esc(me.roleLabel)}</div>${me.department ? `<div class="text-[11px] s-muted truncate">${esc(me.department)}</div>` : ''}`,
    menu: [['profile', 'My Profile', 'fa-regular fa-user'], ['settings', 'Settings', 'fa-solid fa-gear'], ['help', 'Help', 'fa-regular fa-circle-question']]
};

S.route('/staff/404', { title: 'Page not found', nav: '', render: el => { el.innerHTML = `<div class="max-w-xl mx-auto">${S.empty('fa-compass', 'Page not found', 'That page does not exist in the Staff Portal.', '<a href="/staff/dashboard" class="btn btn-forest btn-sm">Go to dashboard</a>')}</div>`; } });

// Shared bits for staff pages
const SP = {
    permNote: perm => `<div class="s-card p-5 text-sm text-slate-600 flex items-start gap-3"><i class="fa-solid fa-lock text-slate-400 mt-0.5"></i><span>Your role doesn't include <b>${esc(ST.PERMISSIONS[perm][0])}</b>. Contact the school administration if you need it.</span></div>`,
    personRow: (s, sub) => `<div class="flex items-center gap-3 min-w-0">${S.avatar(s, 36)}<div class="min-w-0"><div class="text-sm font-medium text-slate-900 truncate">${esc(s.name)}</div>${sub ? `<div class="text-xs s-muted truncate">${sub}</div>` : ''}</div></div>`
};
