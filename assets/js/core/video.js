// Video provider registry.
//
// A video content item stores { provider, url, ref, ... }. Providers are plug-ins: each knows how to
// recognise a URL, extract a reference, and mount a player that reports progress. Add a provider
// with TOS.video.register({...}); nothing else in the LMS needs to change.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const providers = [];

    function register(p) {
        const i = providers.findIndex(x => x.id === p.id);
        if (i >= 0) providers[i] = p; else providers.push(p);
    }
    const get = id => providers.find(p => p.id === id) || providers.find(p => p.id === 'embed');
    // Find the provider for a pasted URL (falls back to a generic iframe embed)
    const detect = url => providers.find(p => p.match && p.match(url || '')) || get('embed');

    function loadScript(src, globalName) {
        if (globalName && window[globalName]) return Promise.resolve();
        return new Promise((res, rej) => {
            const ex = document.querySelector(`script[src="${src}"]`);
            if (ex) { ex.addEventListener('load', res); if (ex.dataset.loaded) res(); return; }
            const s = document.createElement('script'); s.src = src; s.async = true;
            s.onload = () => { s.dataset.loaded = '1'; res(); }; s.onerror = rej;
            document.head.appendChild(s);
        });
    }

    // Common progress plumbing: calls hooks.onProgress(posSec, durSec) at most every 2s, and onEnded.
    function reporter(hooks) {
        let last = 0;
        return {
            tick(pos, dur) { if (!dur) return; const t = Date.now(); if (t - last > 2000) { last = t; hooks.onProgress && hooks.onProgress(pos, dur); } },
            flush(pos, dur) { if (dur) hooks.onProgress && hooks.onProgress(pos, dur); },
            ended() { hooks.onEnded && hooks.onEnded(); }
        };
    }

    // ---------- Native file / direct URL (MP4, WebM, uploaded files) ----------
    register({
        id: 'file', label: 'Direct file (MP4 / WebM)', hint: 'A direct link to a video file, or an uploaded file.',
        match: url => /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url) || /^(blob|data):video/i.test(url),
        parse: url => url,
        thumbnail: () => '',
        mount(el, item, hooks) {
            const v = document.createElement('video');
            v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.className = 'w-full h-full bg-black';
            v.src = item.url; if (item.thumbnail) v.poster = item.thumbnail;
            (item.captions || []).forEach((c, i) => { if (!c.url) return; const t = document.createElement('track'); t.kind = 'subtitles'; t.label = c.label || c.lang; t.srclang = c.lang || 'en'; t.src = c.url; if (i === 0) t.default = true; v.appendChild(t); });
            const r = reporter(hooks);
            v.addEventListener('loadedmetadata', () => { if (hooks.startAt && hooks.startAt < v.duration - 5) v.currentTime = hooks.startAt; });
            v.addEventListener('timeupdate', () => r.tick(v.currentTime, v.duration));
            v.addEventListener('pause', () => r.flush(v.currentTime, v.duration));
            v.addEventListener('ended', () => { r.flush(v.duration, v.duration); r.ended(); });
            el.innerHTML = ''; el.appendChild(v);
            return { destroy() { r.flush(v.currentTime, v.duration); v.pause(); v.removeAttribute('src'); v.load(); } };
        }
    });

    // ---------- YouTube (IFrame Player API for real progress tracking) ----------
    const ytId = url => { const m = String(url).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/); return m ? m[1] : (/^[\w-]{11}$/.test(url) ? url : null); };
    register({
        id: 'youtube', label: 'YouTube', hint: 'Paste any YouTube watch, share or embed link.',
        match: url => !!ytId(url) && /youtu/.test(url),
        parse: ytId,
        thumbnail: ref => ref ? `https://i.ytimg.com/vi/${ref}/hqdefault.jpg` : '',
        mount(el, item, hooks) {
            const ref = item.ref || ytId(item.url);
            const host = document.createElement('div'); host.className = 'w-full h-full';
            el.innerHTML = ''; el.appendChild(host);
            const r = reporter(hooks); let player, timer, dead = false;
            loadScript('https://www.youtube.com/iframe_api').then(() => new Promise(res => {
                if (window.YT && window.YT.Player) return res();
                const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev && prev(); res(); };
            })).then(() => {
                if (dead) return;
                player = new YT.Player(host, {
                    videoId: ref, width: '100%', height: '100%',
                    playerVars: { rel: 0, modestbranding: 1, start: Math.floor(hooks.startAt || 0), cc_load_policy: (item.captions || []).length ? 1 : 0 },
                    events: {
                        onStateChange: e => {
                            if (e.data === 0) { r.flush(player.getDuration(), player.getDuration()); r.ended(); }
                            if (e.data === 2) r.flush(player.getCurrentTime(), player.getDuration());
                        }
                    }
                });
                timer = setInterval(() => { try { if (player.getPlayerState && player.getPlayerState() === 1) r.tick(player.getCurrentTime(), player.getDuration()); } catch (e) { } }, 1000);
            }).catch(() => { host.innerHTML = `<iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${ref}" allowfullscreen></iframe>`; });
            return { destroy() { dead = true; clearInterval(timer); try { r.flush(player.getCurrentTime(), player.getDuration()); player.destroy(); } catch (e) { } } };
        }
    });

    // ---------- Vimeo (Player.js SDK) ----------
    const vimeoId = url => { const m = String(url).match(/vimeo\.com\/(?:video\/|channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?(\d+)/); return m ? m[1] : null; };
    register({
        id: 'vimeo', label: 'Vimeo', hint: 'Paste a vimeo.com or player.vimeo.com link.',
        match: url => /vimeo\.com/.test(url) && !!vimeoId(url),
        parse: vimeoId,
        thumbnail: () => '',
        mount(el, item, hooks) {
            const ref = item.ref || vimeoId(item.url);
            el.innerHTML = `<iframe class="w-full h-full" src="https://player.vimeo.com/video/${ref}?dnt=1#t=${Math.floor(hooks.startAt || 0)}s" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
            const r = reporter(hooks); let p;
            loadScript('https://player.vimeo.com/api/player.js', 'Vimeo').then(() => {
                p = new Vimeo.Player(el.querySelector('iframe'));
                p.on('timeupdate', d => r.tick(d.seconds, d.duration));
                p.on('pause', d => r.flush(d.seconds, d.duration));
                p.on('ended', d => { r.flush(d.duration, d.duration); r.ended(); });
            }).catch(() => { });
            return { destroy() { try { p && p.unload(); } catch (e) { } } };
        }
    });

    // ---------- Hosted streaming services (iframe embeds; progress = manual completion) ----------
    const iframeProvider = (id, label, hint, re, toEmbed) => register({
        id, label, hint, match: re ? url => re.test(url) : null, parse: url => url, thumbnail: () => '',
        mount(el, item) { el.innerHTML = `<iframe class="w-full h-full" src="${TOS.ui.esc(toEmbed(item.url))}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`; return { destroy() { } }; }
    });
    iframeProvider('bunny', 'Bunny Stream', 'Paste the iframe.mediadelivery.net embed URL.', /mediadelivery\.net|b-cdn\.net/, u => u);
    iframeProvider('cloudflare', 'Cloudflare Stream', 'Paste the videodelivery.net / cloudflarestream.com URL.', /videodelivery\.net|cloudflarestream\.com/, u => u);
    iframeProvider('loom', 'Loom', 'Paste a loom.com share link.', /loom\.com\/(share|embed)\//, u => u.replace('/share/', '/embed/'));
    iframeProvider('embed', 'Other (embed URL)', 'Any https:// URL that can be shown in an iframe.', null, u => u);

    // Render a video item into an element. Returns a controller with destroy().
    function mount(el, item, hooks) {
        if (!item || !item.url) { el.innerHTML = '<div class="w-full h-full flex items-center justify-center text-white/60 text-sm"><i class="fa-solid fa-video-slash mr-2"></i>No video added yet</div>'; return { destroy() { } }; }
        if (!/^(https?:|blob:|data:video)/i.test(item.url)) { el.innerHTML = '<div class="w-full h-full flex items-center justify-center text-white/60 text-sm">Unsupported video link</div>'; return { destroy() { } }; }
        return get(item.provider || detect(item.url).id).mount(el, item, hooks || {});
    }

    TOS.video = { register, get, detect, mount, list: () => providers.slice(), thumbnailFor: item => item && (item.thumbnail || (get(item.provider).thumbnail || (() => ''))(item.ref)) };
})();
