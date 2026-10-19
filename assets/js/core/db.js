// Tech Oasis LMS: relational data store.
//
// Every entity lives in its own table and references others by ID only (no copied course data).
// RELATIONS declares each foreign key and what happens on delete (cascade / set null), mirroring
// db/schema.sql. Persistence goes through an adapter: LocalStorageAdapter for this static build;
// swap in an adapter that talks to your API / Supabase without touching any page code.
(function () {
    const TOS = window.TOS = window.TOS || {};

    const TABLES = [
        'users', 'instructors', 'categories', 'courses', 'course_instructors', 'sections', 'lessons', 'contents',
        'quizzes', 'quiz_questions', 'quiz_attempts', 'assignments', 'submissions', 'resources',
        'enrollments', 'lesson_progress', 'certificates', 'reviews', 'orders', 'order_items', 'payments',
        'coupons', 'discussions', 'announcements', 'subscribers',
        // Student portal
        'notifications', 'announcement_reads', 'conversations', 'messages', 'calendar_events', 'lesson_notes', 'support_tickets',
        // Staff: application -> account -> permissions
        'staff_applications', 'staff_audit', 'password_resets', 'email_outbox'
    ];

    // child table -> [{ fk, parent, onDelete }]
    const RELATIONS = {
        instructors: [{ fk: 'userId', parent: 'users', onDelete: 'setNull' }],
        categories: [{ fk: 'parentId', parent: 'categories', onDelete: 'cascade' }],
        courses: [{ fk: 'categoryId', parent: 'categories', onDelete: 'setNull' }, { fk: 'subcategoryId', parent: 'categories', onDelete: 'setNull' }],
        course_instructors: [{ fk: 'courseId', parent: 'courses', onDelete: 'cascade' }, { fk: 'instructorId', parent: 'instructors', onDelete: 'cascade' }],
        sections: [{ fk: 'courseId', parent: 'courses', onDelete: 'cascade' }],
        lessons: [{ fk: 'sectionId', parent: 'sections', onDelete: 'cascade' }],
        contents: [{ fk: 'lessonId', parent: 'lessons', onDelete: 'cascade' }],
        quizzes: [{ fk: 'lessonId', parent: 'lessons', onDelete: 'cascade' }],
        quiz_questions: [{ fk: 'quizId', parent: 'quizzes', onDelete: 'cascade' }],
        quiz_attempts: [{ fk: 'quizId', parent: 'quizzes', onDelete: 'cascade' }, { fk: 'userId', parent: 'users', onDelete: 'cascade' }],
        assignments: [{ fk: 'lessonId', parent: 'lessons', onDelete: 'cascade' }],
        submissions: [{ fk: 'assignmentId', parent: 'assignments', onDelete: 'cascade' }, { fk: 'userId', parent: 'users', onDelete: 'cascade' }],
        resources: [{ fk: 'courseId', parent: 'courses', onDelete: 'cascade' }, { fk: 'lessonId', parent: 'lessons', onDelete: 'cascade' }],
        enrollments: [{ fk: 'userId', parent: 'users', onDelete: 'cascade' }, { fk: 'courseId', parent: 'courses', onDelete: 'cascade' }, { fk: 'currentLessonId', parent: 'lessons', onDelete: 'setNull' }],
        lesson_progress: [{ fk: 'userId', parent: 'users', onDelete: 'cascade' }, { fk: 'lessonId', parent: 'lessons', onDelete: 'cascade' }],
        // Certificates are permanent records: they keep a snapshot and survive course/user deletion.
        certificates: [{ fk: 'userId', parent: 'users', onDelete: 'setNull' }, { fk: 'courseId', parent: 'courses', onDelete: 'setNull' }],
        reviews: [{ fk: 'courseId', parent: 'courses', onDelete: 'cascade' }, { fk: 'userId', parent: 'users', onDelete: 'cascade' }],
        orders: [{ fk: 'userId', parent: 'users', onDelete: 'setNull' }, { fk: 'couponId', parent: 'coupons', onDelete: 'setNull' }],
        order_items: [{ fk: 'orderId', parent: 'orders', onDelete: 'cascade' }, { fk: 'courseId', parent: 'courses', onDelete: 'setNull' }],
        payments: [{ fk: 'orderId', parent: 'orders', onDelete: 'cascade' }],
        coupons: [{ fk: 'courseId', parent: 'courses', onDelete: 'cascade' }],
        discussions: [{ fk: 'courseId', parent: 'courses', onDelete: 'cascade' }, { fk: 'lessonId', parent: 'lessons', onDelete: 'cascade' }, { fk: 'parentId', parent: 'discussions', onDelete: 'cascade' }, { fk: 'userId', parent: 'users', onDelete: 'cascade' }],
        announcements: [{ fk: 'courseId', parent: 'courses', onDelete: 'cascade' }],
        notifications: [{ fk: 'userId', parent: 'users', onDelete: 'cascade' }],
        announcement_reads: [{ fk: 'announcementId', parent: 'announcements', onDelete: 'cascade' }, { fk: 'userId', parent: 'users', onDelete: 'cascade' }],
        // recipientUserId = instructor/staff user; null means the school support/admin team
        conversations: [{ fk: 'studentId', parent: 'users', onDelete: 'cascade' }, { fk: 'recipientUserId', parent: 'users', onDelete: 'setNull' }, { fk: 'courseId', parent: 'courses', onDelete: 'setNull' }],
        messages: [{ fk: 'conversationId', parent: 'conversations', onDelete: 'cascade' }, { fk: 'senderId', parent: 'users', onDelete: 'setNull' }],
        calendar_events: [{ fk: 'courseId', parent: 'courses', onDelete: 'cascade' }],
        lesson_notes: [{ fk: 'userId', parent: 'users', onDelete: 'cascade' }, { fk: 'lessonId', parent: 'lessons', onDelete: 'cascade' }],
        support_tickets: [{ fk: 'userId', parent: 'users', onDelete: 'cascade' }],
        // The application stays linked to the staff account it produced (StaffApplication -> Staff)
        staff_applications: [{ fk: 'staffUserId', parent: 'users', onDelete: 'setNull' }],
        staff_audit: [{ fk: 'userId', parent: 'users', onDelete: 'setNull' }, { fk: 'applicationId', parent: 'staff_applications', onDelete: 'setNull' }],
        password_resets: [{ fk: 'userId', parent: 'users', onDelete: 'cascade' }]
    };

    const ID_PREFIX = {
        users: 'usr', instructors: 'ins', categories: 'cat', courses: 'crs', course_instructors: 'cin', sections: 'sec', lessons: 'les',
        contents: 'cnt', quizzes: 'qz', quiz_questions: 'qq', quiz_attempts: 'qa', assignments: 'asg', submissions: 'sub', resources: 'res',
        enrollments: 'enr', lesson_progress: 'prg', certificates: 'cert', reviews: 'rev', orders: 'ord', order_items: 'oit', payments: 'pay',
        coupons: 'cpn', discussions: 'dsc', announcements: 'ann', subscribers: 'nws',
        notifications: 'ntf', announcement_reads: 'anr', conversations: 'cnv', messages: 'msg', calendar_events: 'evt', lesson_notes: 'nte', support_tickets: 'tkt',
        staff_applications: 'app', staff_audit: 'aud', password_resets: 'pwr', email_outbox: 'eml'
    };

    const DEFAULT_SETTINGS = {
        school: {
            name: 'Tech Oasis School', tagline: 'Where Innovation Meets Expertise',
            website: 'https://school.techoasisltd.com',
            email: 'school@techoasisltd.com', studentEmail: 'students@techoasisltd.com',
            adminEmail: 'school@techoasisltd.com',
            // Optional public contact details. Left empty until the school supplies verified ones; the site only shows what is filled in.
            phone: '', socialLinkedin: '', socialX: '', socialInstagram: '', socialYoutube: '', socialFacebook: ''
        },
        courses: { defaultLanguage: 'English', discussionsEnabled: true, sequentialByDefault: false, videoCompleteAt: 90, levels: ['Beginner', 'Intermediate', 'Advanced'] },
        certificates: {
            enabled: true, minLessonPct: 100, requireQuizPass: true, requireAssignments: true, minAssignmentPct: 50,
            signatoryName: 'Office of the Registrar', signatoryTitle: 'Tech Oasis School', prefix: 'TOS', accent: '#C4A649'
        },
        payments: { currency: 'USD', defaultPrice: 5, trialDays: 7, provider: 'manual', publicKey: '' },
        // Student portal permissions
        portal: { allowSelfRegistration: true, allowAdminMessages: false, allowInstructorMessages: true, studentIdPrefix: 'TOS', assignmentReminderHours: 48 }
    };

    // ---------- Persistence adapters ----------
    const STORAGE_KEY = 'tos_lms_v1';
    const LocalStorageAdapter = {
        load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; } },
        save(state) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
            catch (e) { console.error('Save failed', e); TOS.ui && TOS.ui.toast('Storage is full. Remove large uploads or use links instead.', 'error'); return false; }
        },
        clear() { localStorage.removeItem(STORAGE_KEY); },
        // Fires when another tab writes (e.g. admin edits while the preview tab is open)
        onExternalChange(cb) { window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) cb(); }); }
    };

    let adapter = LocalStorageAdapter;
    let state = null;
    let batching = 0, dirty = false;
    const listeners = new Set();
    // Row triggers: table -> [fn(event, row, prev)]. They run after the write, inside the same save,
    // so side effects (e.g. notifications) are stored atomically with the change that caused them.
    const triggers = {};
    function fire(t, evt, row, prev) {
        (triggers[t] || []).forEach(fn => { try { fn(evt, row, prev); } catch (e) { console.error('Trigger failed on ' + t, e); } });
    }

    const now = () => new Date().toISOString();
    const clone = o => JSON.parse(JSON.stringify(o));
    const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    const newId = table => (ID_PREFIX[table] || 'id') + '_' + rand(10);

    function deepMerge(base, over) {
        const out = clone(base);
        Object.keys(over || {}).forEach(k => {
            out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object' ? deepMerge(base[k], over[k]) : over[k];
        });
        return out;
    }

    function emptyState() {
        const tables = {}; TABLES.forEach(t => tables[t] = []);
        return { meta: { version: 1, createdAt: now() }, settings: clone(DEFAULT_SETTINGS), tables };
    }

    function ensure() {
        if (state) return state;
        const loaded = adapter.load();
        if (loaded && loaded.tables) {
            state = loaded;
            TABLES.forEach(t => { if (!state.tables[t]) state.tables[t] = []; });
            state.settings = deepMerge(DEFAULT_SETTINGS, state.settings);
        } else {
            state = emptyState();
            if (TOS.seed) { batching++; TOS.seed(api); batching--; }
            persist();
        }
        batching++;
        if (TOS.migrateLegacy) TOS.migrateLegacy(api);
        (TOS.migrations || []).forEach(fn => { try { fn(api); } catch (e) { console.error('Migration failed', e); } });
        batching--; if (dirty) persist();
        return state;
    }

    function persist() {
        if (batching) { dirty = true; return; }
        dirty = false;
        adapter.save(state);
        listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    }

    const rows = t => { ensure(); if (!state.tables[t]) throw new Error('Unknown table: ' + t); return state.tables[t]; };
    const matches = (row, where) => typeof where === 'function' ? where(row) : Object.keys(where).every(k => row[k] === where[k]);

    const api = {
        TABLES, RELATIONS, DEFAULT_SETTINGS, newId, now,

        all: t => rows(t).slice(),
        get: (t, id) => id == null ? null : rows(t).find(r => r.id === id) || null,
        where: (t, where) => rows(t).filter(r => matches(r, where)),
        first: (t, where) => rows(t).find(r => matches(r, where)) || null,
        count: (t, where) => where ? rows(t).filter(r => matches(r, where)).length : rows(t).length,
        // Ordered children (sections of a course, lessons of a section, questions of a quiz...)
        ordered: (t, where) => rows(t).filter(r => matches(r, where)).sort((a, b) => (a.order || 0) - (b.order || 0)),

        insert(t, data) {
            const row = Object.assign({ id: newId(t), createdAt: now(), updatedAt: now() }, data);
            batching++; rows(t).push(row); fire(t, 'insert', row, null); batching--;
            persist(); return row;
        },
        update(t, id, patch) {
            const row = api.get(t, id); if (!row) return null;
            const prev = triggers[t] ? clone(row) : null;
            batching++;
            Object.assign(row, typeof patch === 'function' ? patch(clone(row)) : patch, { updatedAt: now() });
            fire(t, 'update', row, prev); batching--;
            persist(); return row;
        },
        upsert(t, where, data) {
            const ex = api.first(t, where);
            return ex ? api.update(t, ex.id, data) : api.insert(t, Object.assign({}, where, data));
        },
        // Delete with relational integrity: cascades to children, nulls optional references.
        remove(t, id) {
            const list = rows(t), i = list.findIndex(r => r.id === id); if (i < 0) return false;
            batching++;
            const [removed] = list.splice(i, 1); fire(t, 'remove', removed, removed);
            Object.keys(RELATIONS).forEach(child => RELATIONS[child].forEach(rel => {
                if (rel.parent !== t) return;
                rows(child).filter(r => r[rel.fk] === id).forEach(r => {
                    if (rel.onDelete === 'cascade') api.remove(child, r.id);
                    else { r[rel.fk] = null; r.updatedAt = now(); }
                });
            }));
            batching--; persist(); return true;
        },
        // Rewrite `order` to match the given ID sequence (drag-and-drop), optionally moving rows to a new parent.
        reorder(t, ids, parentPatch) {
            batching++;
            ids.forEach((id, i) => { const r = api.get(t, id); if (r) Object.assign(r, parentPatch || {}, { order: i + 1, updatedAt: now() }); });
            batching--; persist();
        },
        nextOrder: (t, where) => api.where(t, where).reduce((m, r) => Math.max(m, r.order || 0), 0) + 1,

        // Run many writes and save once.
        tx(fn) { batching++; try { return fn(api); } finally { batching--; if (!batching && dirty) persist(); } },

        settings: () => ensure().settings,
        // Absolute link for emails and certificates: the live domain, or this server while testing locally
        siteUrl(path) {
            const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/.test(location.hostname);
            const base = local || !ensure().settings.school.website ? location.origin : ensure().settings.school.website;
            try { return new URL(path || '/', base).href; } catch (e) { return path; }
        },
        updateSettings(group, patch) { ensure(); state.settings[group] = Object.assign({}, state.settings[group], patch); persist(); },

        onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        on(t, fn) { (triggers[t] = triggers[t] || []).push(fn); },
        exportJSON: () => JSON.stringify(ensure(), null, 2),
        importJSON(json) {
            const data = typeof json === 'string' ? JSON.parse(json) : json;
            if (!data || !data.tables) throw new Error('Not a Tech Oasis export file');
            state = data; TABLES.forEach(t => { if (!state.tables[t]) state.tables[t] = []; });
            state.settings = deepMerge(DEFAULT_SETTINGS, state.settings); persist();
        },
        // Start again with sample content (seed=true) or a completely empty school (seed=false). Keeps settings.
        reset(seed) {
            const keep = state && state.settings;
            state = emptyState(); if (keep) state.settings = keep;
            // Sample portal content (calendar, sample conversation) is re-created only when reseeding
            state.settings._portalSeeded = !seed;
            batching++;
            if (seed && TOS.seed) TOS.seed(api);
            (TOS.migrations || []).forEach(fn => { try { fn(api); } catch (e) { console.error('Migration failed', e); } });
            batching--;
            persist();
        },
        setAdapter(a) { adapter = a; state = null; },
        reload() { state = null; ensure(); listeners.forEach(fn => fn()); }
    };

    LocalStorageAdapter.onExternalChange(() => { if (adapter === LocalStorageAdapter) api.reload(); });

    TOS.db = api;

    // Site address is school.techoasisltd.com. Older saved data may still hold earlier addresses
    // (techoasisschool.com or techoasis.com), so move those school emails, the website address and the sample instructor over.
    (TOS.migrations = TOS.migrations || []).push(function (db) {
        const st = db.settings().school, patch = {}, MAIL = /@(techoasisschool\.com|techoasis\.com)$/i;
        ['email', 'studentEmail', 'adminEmail'].forEach(k => { if (MAIL.test(st[k] || '')) patch[k] = st[k].replace(MAIL, '@techoasisltd.com'); });
        if (!st.website || /^https?:\/\/(www\.)?techoasisschool\.com\/?$/i.test(st.website)) patch.website = DEFAULT_SETTINGS.school.website;
        if (Object.keys(patch).length) db.updateSettings('school', patch);
        const NEW = 'instructor@techoasisltd.com';
        ['instructor@techoasis.com', 'instructor@techoasisschool.com'].forEach(OLD => {
            db.where('users', { email: OLD }).forEach(u => { if (!db.first('users', { email: NEW })) db.update('users', u.id, { email: NEW }); });
            db.where('instructors', { email: OLD }).forEach(i => db.update('instructors', i.id, { email: NEW }));
        });
    });
})();
