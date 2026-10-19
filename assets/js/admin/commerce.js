// Commerce (payments, orders, coupons) and Engagement (reviews, discussions, announcements).
(function () {
    const orderCourses = o => db.where('order_items', { orderId: o.id }).map(it => A.courseTitle(it.courseId)).join(', ');

    // ---------------- Payments ----------------
    A.route('payments', () => {
        A.crumbs('Payments');
        const pays = db.all('payments'), orders = db.all('orders');
        const revenue = pays.filter(p => p.status === 'succeeded').reduce((a, p) => a + p.amount, 0), refunds = pays.filter(p => p.status === 'refunded').reduce((a, p) => a + Math.abs(p.amount), 0);
        const outstanding = db.all('enrollments').filter(e => ['overdue', 'trial', 'pending'].includes(lms.paymentState(e)));
        const draw = () => {
            const rows = pays.filter(p => { const o = db.get('orders', p.orderId); return A.matches(o && A.userName(o.userId), o && orderCourses(o), p.provider, p.providerRef); }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'Date', render: p => ui.fmtDateTime(p.createdAt) },
                { label: 'Student', render: p => { const o = db.get('orders', p.orderId); return A.person(o ? A.userName(o.userId) : '—'); } },
                { label: 'Course', render: p => { const o = db.get('orders', p.orderId); return `<span class="text-sm">${esc(o ? orderCourses(o) : '—')}</span>`; } },
                { label: 'Amount', render: p => `<b class="${p.amount < 0 ? 'text-rose-700' : 'text-ink'}">${ui.money(p.amount)}</b>` },
                { label: 'Method', render: p => `<span class="text-xs capitalize">${esc(p.provider)}</span>${p.providerRef ? `<div class="text-[11px] text-slate-400 font-mono truncate max-w-[140px]">${esc(p.providerRef)}</div>` : ''}` },
                { label: 'Status', render: p => A.pill(p.status === 'succeeded' ? 'paid' : p.status) }
            ], rows, A.empty('fa-credit-card', 'No payments yet'));
        };
        A.view().innerHTML = A.header('Payments', 'Every payment and refund recorded by the school.', '<a href="#/settings/payments" class="btn btn-outline btn-sm"><i class="fa-solid fa-gear"></i>Payment settings</a>')
            + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">${A.stat('fa-sack-dollar', 'bg-emerald-50 text-emerald-700', 'Collected', ui.money(revenue), ui.plural(pays.filter(p => p.status === 'succeeded').length, 'payment'))}${A.stat('fa-rotate-left', 'bg-rose-50 text-rose-700', 'Refunded', ui.money(refunds))}${A.stat('fa-hourglass-half', 'bg-gold-50 text-gold-700', 'Outstanding', ui.money(outstanding.reduce((a, e) => { const o = e.orderId && db.get('orders', e.orderId); return a + (o ? o.total : 0); }, 0)), ui.plural(outstanding.length, 'enrollment') + ' unpaid')}${A.stat('fa-receipt', 'bg-sky-50 text-sky-700', 'Orders', orders.length, db.count('orders', { status: 'pending' }) + ' pending')}</div>`
            + (outstanding.filter(e => lms.paymentState(e) === 'overdue').length ? A.card(A.cardTitle('Overdue after free trial', '<span class="text-xs text-slate-500">Follow up or record payment</span>') + `<div class="divide-y divide-slate-100">${outstanding.filter(e => lms.paymentState(e) === 'overdue').map(e => { const u = db.get('users', e.userId); return `<div class="flex flex-wrap items-center gap-3 py-3">${A.person(u ? u.name : '—', A.courseTitle(e.courseId))}<span class="text-xs text-slate-500 ml-auto">Trial ended ${ui.timeAgo(e.trialEndsAt)}</span>${u ? `<a href="mailto:${esc(u.email)}?subject=${encodeURIComponent('Continue your ' + A.courseTitle(e.courseId) + ' program')}" class="btn btn-outline btn-sm"><i class="fa-regular fa-envelope"></i>Email</a>` : ''}${e.orderId ? `<button data-paid="${e.orderId}" class="btn btn-forest btn-sm">Mark paid</button>` : ''}</div>`; }).join('')}</div>`, 'p-5 mb-5') : '')
            + A.card(A.cardTitle('Transactions') + '<div id="tbl"></div>');
        ui.$$('[data-paid]').forEach(b => b.onclick = () => { lms.markOrderPaid(b.dataset.paid, 'manual', 'admin'); ui.toast('Payment recorded'); A.refresh(); });
        A.bindSearch(draw); draw();
    });

    // ---------------- Orders ----------------
    A.route('orders', (_, p) => {
        A.crumbs('Orders');
        let status = p.status || '';
        const draw = () => {
            const rows = db.all('orders').filter(o => (!status || o.status === status) && A.matches(A.userName(o.userId), orderCourses(o), o.id)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'Order', render: o => `<span class="font-mono text-xs">${esc(o.id.slice(-8).toUpperCase())}</span><div class="text-[11px] text-slate-400">${ui.fmtDate(o.createdAt)}</div>` },
                { label: 'Student', render: o => A.person(A.userName(o.userId)) },
                { label: 'Items', render: o => `<span class="text-sm">${esc(orderCourses(o))}</span>` },
                { label: 'Total', render: o => `<b>${ui.money(o.total)}</b>${o.discount ? `<div class="text-[11px] text-forest-600">−${ui.money(o.discount)} ${o.couponId && db.get('coupons', o.couponId) ? esc(db.get('coupons', o.couponId).code) : ''}</div>` : ''}` },
                { label: 'Status', render: o => A.pill(o.status) },
                { label: '', cls: 'text-right whitespace-nowrap', render: o => o.status === 'pending' ? `<button data-paid="${o.id}" class="btn btn-forest btn-sm">Mark paid</button>` : o.status === 'paid' && o.total > 0 ? `<button data-refund="${o.id}" class="btn btn-ghost btn-sm text-rose-700">Refund</button>` : '' }
            ], rows, A.empty('fa-receipt', 'No orders'));
            ui.$$('[data-paid]').forEach(b => b.onclick = () => { lms.markOrderPaid(b.dataset.paid, 'manual', 'admin'); ui.toast('Order marked as paid'); draw(); });
            ui.$$('[data-refund]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Record a refund for this order? The student loses access to the course. Issue the actual refund in your payment provider.', { okText: 'Record refund', danger: true })) { lms.refundOrder(b.dataset.refund); draw(); } });
        };
        A.view().innerHTML = A.header('Orders', 'Course purchases, including free enrollments and trials.')
            + `<div class="flex gap-2 mb-4">${[['', 'All'], ['pending', 'Pending'], ['paid', 'Paid'], ['refunded', 'Refunded']].map(([k, l]) => `<button data-st="${k}" class="h-9 px-4 rounded-full text-sm font-semibold ${status === k ? 'bg-ink text-white' : 'bg-white border border-slate-200'}">${l}</button>`).join('')}</div>` + A.card('<div id="tbl"></div>');
        ui.$$('[data-st]').forEach(b => b.onclick = () => { status = b.dataset.st; ui.$$('[data-st]').forEach(x => x.className = 'h-9 px-4 rounded-full text-sm font-semibold ' + (x === b ? 'bg-ink text-white' : 'bg-white border border-slate-200')); draw(); });
        A.bindSearch(draw); draw();
    });

    // ---------------- Coupons ----------------
    A.route('coupons', () => {
        A.crumbs('Coupons');
        const draw = () => {
            const rows = db.all('coupons').filter(c => A.matches(c.code));
            document.getElementById('tbl').innerHTML = A.table([
                { label: 'Code', render: c => `<span class="font-mono font-semibold text-ink">${esc(c.code)}</span>` },
                { label: 'Discount', render: c => c.type === 'percent' ? c.value + '%' : ui.money(c.value) },
                { label: 'Applies to', render: c => c.courseId ? esc(A.courseTitle(c.courseId)) : 'All courses' },
                { label: 'Used', render: c => `${c.used || 0}${c.maxUses ? ' / ' + c.maxUses : ''}` },
                { label: 'Expires', render: c => c.expiresAt ? ui.fmtDate(c.expiresAt) : 'Never' },
                { label: 'Status', render: c => A.pill(!c.active ? 'inactive' : c.expiresAt && new Date(c.expiresAt) < new Date() ? 'expired' : 'active') },
                { label: '', cls: 'text-right whitespace-nowrap', render: c => A.iconBtn('fa-pen', 'Edit', `data-edit="${c.id}"`) + A.iconBtn('fa-trash', 'Delete', `data-del="${c.id}"`, true) }
            ], rows, A.empty('fa-ticket', 'No coupons yet', 'Create discount codes for scholarships, partners and promotions.'));
            ui.$$('[data-edit]').forEach(b => b.onclick = () => couponModal(db.get('coupons', b.dataset.edit), draw));
            ui.$$('[data-del]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Delete this coupon?', { okText: 'Delete', danger: true })) { db.remove('coupons', b.dataset.del); draw(); } });
        };
        A.view().innerHTML = A.header('Coupons', 'Discount codes students enter at checkout.', '<button id="add" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>New coupon</button>') + A.card('<div id="tbl"></div>');
        document.getElementById('add').onclick = () => couponModal(null, draw);
        A.bindSearch(draw); draw();
    });
    function couponModal(c, done) {
        const m = ui.modal({ title: c ? 'Edit coupon' : 'New coupon', body: `<form class="space-y-4">
            ${A.field('Code *', A.input('code', c ? c.code : '', 'required minlength="3" maxlength="24" style="text-transform:uppercase" placeholder="SCHOLAR50"'))}
            <div class="grid grid-cols-2 gap-3">${A.field('Type', A.select('type', [['percent', 'Percent off'], ['fixed', 'Fixed amount off']], c ? c.type : 'percent'))}${A.field('Value *', A.input('value', c ? c.value : 20, 'type="number" min="0" step="0.01" required'))}</div>
            ${A.field('Applies to', A.select('courseId', A.courseOptions('All courses'), c ? c.courseId : ''))}
            <div class="grid grid-cols-2 gap-3">${A.field('Max uses', A.input('maxUses', c ? c.maxUses : '', 'type="number" min="0" placeholder="Unlimited"'))}${A.field('Expires', A.input('expiresAt', c && c.expiresAt ? c.expiresAt.slice(0, 10) : '', 'type="date"'))}</div>
            ${A.toggle('active', c ? c.active : true, 'Active')}
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Save coupon</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => {
            e.preventDefault(); const d = A.formData(e.target);
            d.code = d.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
            if (d.code.length < 3) return ui.toast('Use at least 3 letters or numbers for the code.', 'error');
            if (db.first('coupons', x => x.code === d.code && (!c || x.id !== c.id))) return ui.toast('That code already exists.', 'error');
            if (d.type === 'percent' && d.value > 100) return ui.toast('Percent discount cannot exceed 100.', 'error');
            Object.assign(d, { courseId: d.courseId || null, maxUses: d.maxUses || 0, expiresAt: d.expiresAt ? new Date(d.expiresAt + 'T23:59:00').toISOString() : null });
            if (c) db.update('coupons', c.id, d); else db.insert('coupons', Object.assign(d, { used: 0 }));
            m.close(); done(); ui.toast('Coupon saved');
        };
    }

    // ---------------- Reviews ----------------
    A.route('reviews', () => {
        A.crumbs('Reviews');
        const draw = () => {
            const rows = db.all('reviews').filter(r => A.matches(A.userName(r.userId), A.courseTitle(r.courseId), r.comment)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('list').innerHTML = rows.map(r => `<div class="bg-white rounded-2xl border border-slate-200/80 p-5 ${r.status === 'hidden' ? 'opacity-60' : ''}">
                <div class="flex flex-wrap items-center gap-3">${A.person(A.userName(r.userId), A.courseTitle(r.courseId))}<span class="text-gold text-sm ml-auto">${ui.stars(r.rating)}</span></div>
                <p class="text-sm text-slate-700 mt-3">${esc(r.comment) || '<span class="text-slate-400">No comment</span>'}</p>
                <div class="flex items-center gap-2 mt-4 text-xs text-slate-400"><span>${ui.timeAgo(r.createdAt)}</span>${r.status === 'hidden' ? A.pill('hidden') : ''}<span class="ml-auto"></span>
                    <button data-toggle="${r.id}" class="btn btn-ghost btn-sm">${r.status === 'hidden' ? 'Publish' : 'Hide'}</button>${A.iconBtn('fa-trash', 'Delete', `data-del="${r.id}"`, true)}</div></div>`).join('') || A.card(A.empty('fa-star', 'No reviews yet'));
            ui.$$('[data-toggle]').forEach(b => b.onclick = () => { const r = db.get('reviews', b.dataset.toggle); db.update('reviews', r.id, { status: r.status === 'hidden' ? 'published' : 'hidden' }); draw(); });
            ui.$$('[data-del]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Delete this review permanently?', { okText: 'Delete', danger: true })) { db.remove('reviews', b.dataset.del); draw(); } });
        };
        const all = db.all('reviews'), avg = all.length ? all.reduce((a, r) => a + r.rating, 0) / all.length : 0;
        A.view().innerHTML = A.header('Reviews', 'Moderate learner reviews. Hidden reviews are removed from course pages and ratings.') + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">${A.stat('fa-star', 'bg-gold-50 text-gold-700', 'Average rating', avg ? avg.toFixed(1) : '—', ui.plural(all.length, 'review'))}${A.stat('fa-eye-slash', 'bg-slate-100 text-slate-600', 'Hidden', all.filter(r => r.status === 'hidden').length)}</div><div id="list" class="grid md:grid-cols-2 gap-4"></div>`;
        A.bindSearch(draw); draw();
    });

    // ---------------- Discussions ----------------
    A.route('discussions', () => {
        A.crumbs('Discussions');
        const draw = () => {
            const roots = db.where('discussions', d => !d.parentId).filter(d => A.matches(d.body, A.userName(d.userId), A.courseTitle(d.courseId))).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('list').innerHTML = roots.map(d => {
                const replies = db.where('discussions', { parentId: d.id }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), l = db.get('lessons', d.lessonId), c = db.get('courses', d.courseId);
                const who = x => x.userId ? A.userName(x.userId) : (x.authorName || 'Tech Oasis Team');
                return `<div class="bg-white rounded-2xl border border-slate-200/80 p-5">
                    <div class="text-xs text-slate-500 mb-3"><i class="fa-solid fa-book-open mr-1"></i>${esc(c ? c.title : '—')} · ${esc(l ? l.title : '—')}${c && l ? ` · <a target="_blank" href="learn.html?c=${encodeURIComponent(c.slug)}&l=${l.id}&preview=1" class="underline">open lesson</a>` : ''}</div>
                    <div class="flex gap-3">${A.avatar(who(d))}<div class="flex-1"><div class="text-sm"><b>${esc(who(d))}</b> <span class="text-xs text-slate-400">${ui.timeAgo(d.createdAt)}</span></div><p class="text-sm text-slate-700 mt-1 whitespace-pre-line">${esc(d.body)}</p></div>${A.iconBtn('fa-trash', 'Delete thread', `data-del="${d.id}"`, true)}</div>
                    ${replies.map(r => `<div class="flex gap-3 ml-12 mt-3 pt-3 border-t border-slate-100">${A.avatar(who(r), r.userId ? '' : 'bg-gold text-ink')}<div class="flex-1"><div class="text-sm"><b>${esc(who(r))}</b>${r.userId ? '' : ' <span class="pill bg-gold-100 text-gold-700">Staff</span>'} <span class="text-xs text-slate-400">${ui.timeAgo(r.createdAt)}</span></div><p class="text-sm text-slate-700 mt-1 whitespace-pre-line">${esc(r.body)}</p></div>${A.iconBtn('fa-trash', 'Delete reply', `data-del="${r.id}"`, true)}</div>`).join('')}
                    <form data-reply="${d.id}" class="flex gap-2 mt-4 ml-12"><input class="field" required placeholder="Reply as Tech Oasis Team"><button class="btn btn-forest btn-sm">Reply</button></form></div>`;
            }).join('') || A.card(A.empty('fa-comments', 'No discussions yet', 'Learner questions and comments on lessons appear here.'));
            ui.$$('[data-del]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Delete this post (and its replies)?', { okText: 'Delete', danger: true })) { db.remove('discussions', b.dataset.del); draw(); } });
            ui.$$('[data-reply]').forEach(f => f.onsubmit = e => { e.preventDefault(); const root = db.get('discussions', f.dataset.reply); db.insert('discussions', { courseId: root.courseId, lessonId: root.lessonId, userId: null, authorName: 'Tech Oasis Team', parentId: root.id, body: f.querySelector('input').value.trim() }); draw(); ui.toast('Reply posted'); });
        };
        A.view().innerHTML = A.header('Discussions', 'Lesson conversations across all courses. Reply as staff or remove posts.') + '<div id="list" class="space-y-4"></div>';
        A.bindSearch(draw); draw();
    });

    // ---------------- Announcements ----------------
    A.route('announcements', () => {
        A.crumbs('Announcements');
        const draw = () => {
            const rows = db.all('announcements').filter(a => A.matches(a.title, a.body)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('list').innerHTML = rows.map(a => `<div class="bg-white rounded-2xl border border-slate-200/80 p-5 flex gap-4"><span class="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0"><i class="fa-solid fa-bullhorn"></i></span>
                <div class="flex-1 min-w-0"><div class="flex flex-wrap items-center gap-2"><b class="text-ink">${esc(a.title)}</b><span class="pill bg-slate-100 text-slate-600">${a.courseId ? esc(A.courseTitle(a.courseId)) : 'All students'}</span></div><p class="text-sm text-slate-600 mt-1">${esc(a.body)}</p><div class="text-xs text-slate-400 mt-2">${esc(a.authorName || 'Admin')} · ${ui.timeAgo(a.createdAt)}</div></div>
                <div class="flex">${A.iconBtn('fa-pen', 'Edit', `data-edit="${a.id}"`)}${A.iconBtn('fa-trash', 'Delete', `data-del="${a.id}"`, true)}</div></div>`).join('') || A.card(A.empty('fa-bullhorn', 'No announcements', 'Announcements show on students\' My Learning page.'));
            ui.$$('[data-edit]').forEach(b => b.onclick = () => annModal(db.get('announcements', b.dataset.edit), draw));
            ui.$$('[data-del]').forEach(b => b.onclick = async () => { if (await ui.confirmBox('Delete this announcement?', { okText: 'Delete', danger: true })) { db.remove('announcements', b.dataset.del); draw(); } });
        };
        A.view().innerHTML = A.header('Announcements', 'Messages shown to students on their My Learning page.', '<button id="add" class="btn btn-forest btn-sm"><i class="fa-solid fa-plus"></i>New announcement</button>') + '<div id="list" class="space-y-3"></div>';
        document.getElementById('add').onclick = () => annModal(null, draw);
        A.bindSearch(draw); draw();
    });
    function annModal(a, done) {
        const m = ui.modal({ title: a ? 'Edit announcement' : 'New announcement', body: `<form class="space-y-4">${A.field('Title *', A.input('title', a ? a.title : '', 'required maxlength="120"'))}${A.field('Message *', A.textarea('body', a ? a.body : '', 4, 'required maxlength="1000"'))}${A.field('Audience', A.select('courseId', A.courseOptions('All students'), a ? a.courseId : ''))}
            ${A.toggle('important', a && a.important, 'Important', 'Pinned for students and shown on their calendar.')}
            ${A.field('Event date (optional)', A.input('eventDate', a && a.eventDate ? new Date(new Date(a.eventDate) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '', 'type="datetime-local"'), 'For announcements about a dated event, e.g. a workshop.')}
            <p class="text-xs text-slate-500"><i class="fa-regular fa-bell mr-1"></i>New announcements notify every student in the audience.</p>
            <div class="flex justify-end gap-2"><button type="button" data-c class="btn btn-outline btn-sm">Cancel</button><button class="btn btn-forest btn-sm">Publish</button></div></form>` });
        m.el.querySelector('[data-c]').onclick = m.close;
        m.el.querySelector('form').onsubmit = e => { e.preventDefault(); const d = A.formData(e.target); d.courseId = d.courseId || null; d.eventDate = d.eventDate ? new Date(d.eventDate).toISOString() : null; if (a) db.update('announcements', a.id, d); else db.insert('announcements', Object.assign(d, { authorName: db.settings().school.name })); m.close(); done(); ui.toast('Announcement published'); };
    }
})();
