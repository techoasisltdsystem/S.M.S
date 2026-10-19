// Tech Oasis dashboard kit: the shared building blocks for every dashboard (admin, staff, student and the roles to come).
// Welcome banner, stat cards, panels, quick actions, schedule list, charts (bar, line, donut), mini calendar and a data
// table with search, filters, pagination and loading / empty / error states. Styles are the .k-* rules in tos.css.
// Every helper returns HTML (escaped), except mountCalendar and dataTable, which render into an element and wire events.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const TONES = ['forest', 'gold', 'sky', 'violet', 'rose', 'emerald', 'amber', 'slate'];
    const tone = t => 'k-tone-' + (TONES.includes(t) ? t : 'forest');
    const link = (href, label, cls) => href ? `<a href="${esc(href)}" class="${cls || 'k-link'}">${esc(label)}</a>` : '';

    // ---------------- Layout pieces ----------------
    // Greeting banner. aside = HTML for the right-hand side (today's schedule, a fee notice, etc.)
    function welcome({ greeting, name, sub, aside }) {
        return `<section class="k-welcome fade-in" aria-label="Welcome">
            <div class="min-w-0"><p class="k-welcome-greet">${esc(greeting || greetingNow())},</p>
                <h1 class="k-welcome-name">${esc(name || '')}</h1>${sub ? `<p class="k-welcome-sub">${esc(sub)}</p>` : ''}</div>
            ${aside ? `<div class="k-welcome-aside">${aside}</div>` : ''}</section>`;
    }
    const greetingNow = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

    // Summary card. meter = 0..100 shows a progress bar under the value (e.g. attendance)
    function stat({ icon, tone: t, label, value, sub, href, meter }) {
        const tag = href ? 'a' : 'div';
        const m = meter == null ? '' : `<div class="k-meter" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${Math.round(meter)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, meter))}%"></span></div>`;
        return `<${tag} ${href ? `href="${esc(href)}"` : ''} class="k-stat ${href ? 'k-hover' : ''}">
            <span class="k-icon ${tone(t)}" aria-hidden="true"><i class="fa-solid ${esc(icon || 'fa-chart-simple')}"></i></span>
            <span class="min-w-0 flex-1"><span class="k-stat-label">${esc(label)}</span><span class="k-stat-value">${esc(value)}</span>${sub ? `<span class="k-stat-sub">${esc(sub)}</span>` : ''}${m}</span></${tag}>`;
    }
    const stats = items => `<div class="k-stats">${items.map(stat).join('')}</div>`;

    // Titled card. link = [href, label] shown top right; actions = extra HTML (a select, buttons)
    function panel({ id, title, icon, tone: t, link: l, actions, body, cls }) {
        const hid = id || 'k' + Math.random().toString(36).slice(2, 8);
        return `<section class="k-panel ${cls || ''}" aria-labelledby="${hid}">
            <div class="k-panel-head">${icon ? `<span class="k-icon k-icon-sm ${tone(t)}" aria-hidden="true"><i class="fa-solid ${esc(icon)}"></i></span>` : ''}
                <h2 id="${hid}" class="k-panel-title">${esc(title)}</h2><span class="ml-auto flex items-center gap-2">${actions || ''}${l ? link(l[0], l[1]) : ''}</span></div>
            <div class="k-panel-body">${body || ''}</div></section>`;
    }

    // Quick action tiles. Every tile must point at a real page: pass only actions the user is allowed to take.
    const quickActions = items => items.length ? `<div class="k-actions">${items.map(a => `<a href="${esc(a.href)}" class="k-action ${tone(a.tone)}">
        <span class="k-action-icon" aria-hidden="true"><i class="fa-solid ${esc(a.icon)}"></i></span><span class="k-action-label">${esc(a.label)}</span>${a.sub ? `<span class="k-action-sub">${esc(a.sub)}</span>` : ''}
        <i class="fa-solid fa-arrow-right k-action-go" aria-hidden="true"></i></a>`).join('')}</div>` : emptyState({ icon: 'fa-bolt', title: 'No quick actions', text: 'Nothing here needs your attention.' });

    // Time-ordered rows: [{ time, title, sub, tone, href }]
    const schedule = (items, emptyText) => items.length ? `<ul class="k-schedule">${items.map(s => `<li>${s.href ? `<a href="${esc(s.href)}" class="k-schedule-row">` : '<div class="k-schedule-row">'}
        <span class="k-dot ${tone(s.tone)}" aria-hidden="true"></span><span class="k-schedule-time">${esc(s.time)}</span><span class="min-w-0"><span class="block truncate font-medium text-slate-900">${esc(s.title)}</span>${s.sub ? `<span class="block truncate text-xs s-muted">${esc(s.sub)}</span>` : ''}</span>
        ${s.href ? '</a>' : '</div>'}</li>`).join('')}</ul>` : `<p class="k-empty-line">${esc(emptyText || 'Nothing scheduled.')}</p>`;

    // Small centred empty state, for inside a panel
    const emptyState = ({ icon, title, text, action }) => `<div class="k-empty"><span class="k-icon ${tone('slate')}" aria-hidden="true"><i class="fa-solid ${esc(icon || 'fa-inbox')}"></i></span>
        <p class="font-semibold text-slate-900 mt-3">${esc(title)}</p>${text ? `<p class="text-sm s-muted mt-1">${esc(text)}</p>` : ''}${action ? `<div class="mt-4">${action}</div>` : ''}</div>`;

    // Skeletons shaped like what is coming
    const skeleton = {
        stats: n => `<div class="k-stats">${Array.from({ length: n || 4 }, () => '<div class="k-stat"><span class="sk k-icon"></span><span class="flex-1 space-y-2"><span class="sk block h-3 w-1/2"></span><span class="sk block h-6 w-1/3"></span></span></div>').join('')}</div>`,
        rows: n => Array.from({ length: n || 5 }, () => '<div class="sk h-9 my-2"></div>').join(''),
        panel: h => `<div class="k-panel"><div class="k-panel-head"><span class="sk block h-4 w-1/3"></span></div><div class="k-panel-body"><div class="sk" style="height:${h || 160}px"></div></div></div>`
    };

    // ---------------- Charts ----------------
    // Single shared tooltip; ui.chartTip exists on pages that load ui.js, a local one otherwise
    let tipEl;
    const tip = (e, html) => {
        if (TOS.ui && TOS.ui.chartTip) return TOS.ui.chartTip(e, html);
        if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
        if (!html) { tipEl.style.display = 'none'; return; }
        tipEl.innerHTML = html; tipEl.style.display = 'block'; tipEl.style.left = e.clientX + 'px'; tipEl.style.top = e.clientY + 'px';
    };
    const noData = (opts, h) => `<div class="flex items-center justify-center text-sm text-slate-400" style="height:${h || 192}px">${esc(opts.empty || 'No data yet')}</div>`;

    // Vertical bars. data: [{ label, value, tip, short }]
    function barChart(data, opts) {
        opts = opts || {};
        if (!data.length || data.every(d => !d.value)) return noData(opts);
        // opts.minMax keeps tiny counts (e.g. one enrollment a day) from filling the whole chart height
        const max = Math.max(opts.minMax || 0, ...data.map(d => d.value)), h = opts.height || 180;
        const ticks = [...new Set([0, .5, 1].map(f => Math.round(max * f)))];
        const fmt = v => opts.fmt ? opts.fmt(v) : v;
        return `<div class="relative" style="height:${h + 28}px" role="img" aria-label="${esc(opts.label || 'Bar chart')}">
            ${ticks.map(t => `<div class="absolute left-0 right-0 border-t border-dashed border-slate-200" style="bottom:${28 + (max ? t / max : 0) * h}px"><span class="absolute -top-2 left-0 text-[10px] text-slate-400 bg-white pr-1">${esc(fmt(t))}</span></div>`).join('')}
            <div class="absolute left-8 right-0 bottom-0 top-0 flex items-end gap-[2px]">${data.map(d => `<div class="flex-1 min-w-0 h-full flex flex-col justify-end items-center group cursor-default" data-tip="${esc(d.tip || d.label + ': ' + fmt(d.value))}">
                <div class="w-full max-w-[36px] rounded-t bg-forest-600 group-hover:bg-gold transition-colors" style="height:${Math.max(d.value ? 3 : 0, d.value / max * h)}px"></div>
                <div class="h-7 pt-1.5 text-[10px] text-slate-500 whitespace-nowrap w-full flex justify-center">${esc(d.short == null ? d.label : d.short)}</div></div>`).join('')}</div></div>`;
    }

    // Line/area over time. data: [{ label, value }]. opts: fmt, max (fixed top, e.g. 100 for percentages), dots, empty
    function lineChart(data, opts) {
        opts = opts || {};
        if (!data.length || data.every(d => !d.value)) return noData(opts);
        const W = 600, H = 180, P = 8, max = opts.max || Math.max(1, ...data.map(d => d.value));
        const pts = data.map((d, i) => [P + i * (W - 2 * P) / Math.max(1, data.length - 1), H - P - d.value / max * (H - 2 * P)]);
        const line = pts.map(p => p.join(',')).join(' ');
        const id = 'lc' + Math.random().toString(36).slice(2, 7);
        const fmt = v => opts.fmt ? opts.fmt(v) : v;
        return `<div class="relative" data-line="${id}" role="img" aria-label="${esc(opts.label || 'Line chart')}"><svg viewBox="0 0 ${W} ${H}" class="w-full h-48" preserveAspectRatio="none">
            <defs><linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#14584A" stop-opacity=".22"/><stop offset="100%" stop-color="#14584A" stop-opacity="0"/></linearGradient></defs>
            ${[.25, .5, .75].map(f => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" stroke="#E2E8F0" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`).join('')}
            <polygon points="${P},${H - P} ${line} ${W - P},${H - P}" fill="url(#${id}g)"/>
            <polyline points="${line}" fill="none" stroke="#14584A" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
            <line class="xh" x1="0" x2="0" y1="0" y2="${H}" stroke="#C4A649" stroke-width="1" vector-effect="non-scaling-stroke" style="display:none"/></svg>
            ${opts.dots ? `<div class="absolute inset-x-0 top-0 h-48 pointer-events-none">${pts.map(p => `<span class="k-line-dot" style="left:${p[0] / W * 100}%;top:${p[1] / H * 100}%"></span>`).join('')}</div>` : ''}
            <div class="flex justify-between text-[10px] text-slate-400 mt-1"><span>${esc(data[0].label)}</span><span>${esc(data[Math.floor(data.length / 2)].label)}</span><span>${esc(data[data.length - 1].label)}</span></div>
            <script type="application/json">${JSON.stringify(data.map((d, i) => ({ x: pts[i][0] / W, l: d.label, v: fmt(d.value) }))).replace(/</g, '\\u003c')}</script></div>`;
    }

    // Donut with a centre figure and a legend. segments: [{ label, value, tone }]
    const DONUT = { forest: '#14584A', gold: '#C4A649', sky: '#0284C7', violet: '#7C3AED', rose: '#E11D48', emerald: '#10B981', amber: '#F59E0B', slate: '#94A3B8' };
    function donut(segments, opts) {
        opts = opts || {};
        const total = segments.reduce((a, s) => a + (+s.value || 0), 0);
        if (!total) return noData(opts, 160);
        const size = opts.size || 148, w = opts.stroke || 18, r = (size - w) / 2, c = 2 * Math.PI * r;
        let off = 0;
        const pct = s => Math.round(s.value / total * 100);
        const arcs = segments.filter(s => s.value > 0).map(s => {
            const len = s.value / total * c, el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${DONUT[s.tone] || DONUT.forest}" stroke-width="${w}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" data-tip="${esc(s.label + ': ' + (opts.fmt ? opts.fmt(s.value) : s.value) + ' (' + pct(s) + '%)')}"/>`;
            off += len; return el;
        }).join('');
        const summary = segments.map(s => `${s.label} ${pct(s)}%`).join(', ');
        return `<div class="k-donut"><div class="relative shrink-0" style="width:${size}px;height:${size}px" role="img" aria-label="${esc((opts.label ? opts.label + ': ' : '') + summary)}">
            <svg width="${size}" height="${size}" class="-rotate-90"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EEF0F3" stroke-width="${w}"/>${arcs}</svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center text-center"><span class="text-2xl font-bold text-slate-900 leading-none">${esc(opts.center != null ? opts.center : total)}</span>${opts.centerSub ? `<span class="text-[11px] s-muted mt-1">${esc(opts.centerSub)}</span>` : ''}</div></div>
            <ul class="k-legend">${segments.map(s => `<li><span class="k-dot" style="background:${DONUT[s.tone] || DONUT.forest}" aria-hidden="true"></span><span class="flex-1">${esc(s.label)}</span><span class="font-semibold text-slate-900 tabular-nums">${pct(s)}%</span></li>`).join('')}</ul></div>`;
    }

    // Hover wiring for every chart (event delegation, registered once)
    if (!window.__kitCharts) {
        window.__kitCharts = true;
        document.addEventListener('mousemove', e => {
            const t = e.target.closest && e.target.closest('[data-tip]');
            if (t) return tip(e, esc(t.dataset.tip));
            const lc = e.target.closest && e.target.closest('[data-line]');
            if (lc) {
                const svg = lc.querySelector('svg'), r = svg.getBoundingClientRect(), pts = JSON.parse(lc.querySelector('script').textContent);
                const fx = (e.clientX - r.left) / r.width, p = pts.reduce((a, b) => Math.abs(b.x - fx) < Math.abs(a.x - fx) ? b : a);
                const xh = svg.querySelector('.xh'); xh.style.display = ''; xh.setAttribute('x1', p.x * 600); xh.setAttribute('x2', p.x * 600);
                return tip(e, `<b>${esc(p.l)}</b> · ${esc(p.v)}`);
            }
            tip(e, null);
            document.querySelectorAll('[data-line] .xh').forEach(x => x.style.display = 'none');
        });
    }

    // ---------------- Mini calendar ----------------
    // Month grid with a dot on days that have events. events: [{ startsAt, title }]. opts.href(dateISO) links a day.
    function mountCalendar(el, events, opts) {
        opts = opts || {};
        const byDay = {};
        events.forEach(ev => { const d = new Date(ev.startsAt); const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); (byDay[k] = byDay[k] || []).push(ev.title); });
        let view = new Date(opts.month || Date.now()); view.setDate(1);
        const render = () => {
            const y = view.getFullYear(), m = view.getMonth(), today = new Date();
            const lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
            const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const cells = [];
            for (let i = 0; i < lead; i++) cells.push('<span class="k-cal-day k-cal-out" aria-hidden="true"></span>');
            for (let d = 1; d <= days; d++) {
                const k = y + '-' + (m + 1) + '-' + d, evs = byDay[k] || [], isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
                const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const label = new Date(y, m, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + (evs.length ? ': ' + evs.join(', ') : '');
                const cls = `k-cal-day ${isToday ? 'k-cal-today' : ''} ${evs.length ? 'k-cal-has' : ''}`;
                cells.push(opts.href && evs.length ? `<a href="${esc(opts.href(iso))}" class="${cls}" aria-label="${esc(label)}" title="${esc(evs.join(', '))}">${d}</a>` : `<span class="${cls}" aria-label="${esc(label)}" ${evs.length ? `title="${esc(evs.join(', '))}"` : ''}>${d}</span>`);
            }
            el.innerHTML = `<div class="k-cal"><div class="k-cal-head"><button type="button" class="k-cal-nav" data-cal="-1" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button>
                <span class="font-semibold text-slate-900 text-sm" aria-live="polite">${view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                <button type="button" class="k-cal-nav" data-cal="1" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button></div>
                <div class="k-cal-grid">${names.map(n => `<span class="k-cal-name">${n}</span>`).join('')}${cells.join('')}</div></div>`;
            el.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => { view.setMonth(view.getMonth() + +b.dataset.cal); render(); });
        };
        render();
    }

    // ---------------- Data table ----------------
    // Renders into el and returns { reload }. Options:
    //   columns: [{ key, label, render(row) → HTML, sort: true, cls }]
    //   load: async () → rows (the server or API call; errors show a retry state)
    //   search: [keys] searched as text · filters: [{ key, label, options: [[value, label]] }] · pageSize (default 10)
    //   empty: { icon, title, text, action } · caption: accessible table description · rowHref(row) makes rows links
    function dataTable(el, opts) {
        const st = { rows: null, error: null, q: '', f: {}, page: 1, sort: null, dir: 1 };
        const size = opts.pageSize || 10, uid = 'dt' + Math.random().toString(36).slice(2, 7);
        const text = (r, k) => { const v = typeof k === 'function' ? k(r) : r[k]; return v == null ? '' : String(v); };
        const filtered = () => {
            const q = st.q.trim().toLowerCase();
            let rows = st.rows.filter(r => (!q || (opts.search || []).some(k => text(r, k).toLowerCase().includes(q))) && Object.entries(st.f).every(([k, v]) => !v || text(r, k) === v));
            if (st.sort) rows = rows.slice().sort((a, b) => { const x = a[st.sort], y = b[st.sort]; return (x > y ? 1 : x < y ? -1 : 0) * st.dir; });
            return rows;
        };
        const toolbar = () => (opts.search || opts.filters) ? `<div class="k-toolbar">
            ${opts.search ? `<label class="k-search"><span class="sr-only">Search ${esc(opts.caption || 'records')}</span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q value="${esc(st.q)}" placeholder="${esc(opts.placeholder || 'Search')}" autocomplete="off"></label>` : ''}
            ${(opts.filters || []).map(f => `<label class="k-filter"><span class="sr-only">${esc(f.label)}</span><select data-f="${esc(f.key)}"><option value="">${esc(f.label)}: all</option>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${st.f[f.key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}
            <span class="k-count" aria-live="polite" data-count></span></div>` : '';
        const body = () => {
            if (st.error) return `<div class="k-state">${emptyState({ icon: 'fa-plug-circle-exclamation', title: 'Could not load this list', text: st.error, action: '<button type="button" data-retry class="btn btn-forest btn-sm"><i class="fa-solid fa-rotate-right"></i>Try again</button>' })}</div>`;
            if (!st.rows) return `<div class="k-state" aria-busy="true">${skeleton.rows(Math.min(size, 6))}</div>`;
            const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / size));
            st.page = Math.min(st.page, pages);
            if (!st.rows.length) return `<div class="k-state">${emptyState(opts.empty || { icon: 'fa-inbox', title: 'Nothing here yet' })}</div>`;
            if (!rows.length) return `<div class="k-state">${emptyState({ icon: 'fa-filter-circle-xmark', title: 'No matches', text: 'Try another search or clear the filters.', action: '<button type="button" data-clear class="btn btn-outline btn-sm">Clear search and filters</button>' })}</div>`;
            const slice = rows.slice((st.page - 1) * size, st.page * size);
            return `<div class="k-table-wrap"><table class="k-table">${opts.caption ? `<caption class="sr-only">${esc(opts.caption)}</caption>` : ''}
                <thead><tr>${opts.columns.map(c => `<th scope="col" class="${esc(c.cls || '')}" ${c.sort ? `aria-sort="${st.sort === c.key ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}>${c.sort ? `<button type="button" data-sort="${esc(c.key)}">${esc(c.label)}<i class="fa-solid ${st.sort === c.key ? (st.dir > 0 ? 'fa-arrow-up' : 'fa-arrow-down') : 'fa-sort'}" aria-hidden="true"></i></button>` : esc(c.label)}</th>`).join('')}</tr></thead>
                <tbody>${slice.map(r => `<tr ${opts.rowHref ? `data-href="${esc(opts.rowHref(r))}" class="k-row-link"` : ''}>${opts.columns.map((c, i) => `<td class="${esc(c.cls || '')}">${i === 0 && opts.rowHref ? `<a href="${esc(opts.rowHref(r))}">${c.render ? c.render(r) : esc(text(r, c.key))}</a>` : c.render ? c.render(r) : esc(text(r, c.key))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
                ${pages > 1 ? `<nav class="k-pager" aria-label="Pages"><button type="button" data-page="${st.page - 1}" ${st.page === 1 ? 'disabled' : ''} aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i></button>
                    <span>Page ${st.page} of ${pages}</span><button type="button" data-page="${st.page + 1}" ${st.page === pages ? 'disabled' : ''} aria-label="Next page"><i class="fa-solid fa-chevron-right"></i></button></nav>` : ''}`;
        };
        const paint = () => {
            el.querySelector('[data-body]').innerHTML = body();
            const count = el.querySelector('[data-count]');
            if (count) count.textContent = st.rows && st.rows.length && !st.error ? `${filtered().length} of ${st.rows.length}` : '';
            el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { st.dir = st.sort === b.dataset.sort ? -st.dir : 1; st.sort = b.dataset.sort; paint(); });
            el.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { st.page = +b.dataset.page; paint(); });
            const retry = el.querySelector('[data-retry]'); if (retry) retry.onclick = reload;
            const clear = el.querySelector('[data-clear]'); if (clear) clear.onclick = () => { st.q = ''; st.f = {}; el.querySelector('[data-toolbar]').innerHTML = toolbar(); bindToolbar(); paint(); };
        };
        let t;
        const bindToolbar = () => {
            const q = el.querySelector('[data-q]'); if (q) q.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = q.value; st.page = 1; paint(); }, 150); };
            el.querySelectorAll('[data-f]').forEach(s => s.onchange = () => { st.f[s.dataset.f] = s.value; st.page = 1; paint(); });
        };
        async function reload() {
            st.error = null; st.rows = null; paint();
            try { st.rows = await opts.load() || []; } catch (e) { st.error = (e && e.message) || 'A connection problem stopped this list from loading.'; }
            paint();
        }
        el.innerHTML = `<div class="k-datatable"><div data-toolbar>${toolbar()}</div><div data-body></div></div>`;
        bindToolbar();
        // Whole-row click for linked rows (the first cell holds the real, keyboard-focusable link)
        el.addEventListener('click', e => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button')) tr.querySelector('a').click(); });
        reload();
        return { reload };
    }

    TOS.kit = { TONES, welcome, greetingNow, stat, stats, panel, quickActions, schedule, emptyState, skeleton, barChart, lineChart, donut, mountCalendar, dataTable };
})();
