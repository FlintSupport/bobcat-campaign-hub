// Shared player for the "See it in action" demos: seek bar with chapter ticks and buttons, play/pause, full screen,
// Space to play/pause, ←/→ to skip 5s, F for full screen. Plays once and stops on the last frame.
// Controls only show while the pointer is over the video (or after a tap, or while a control has keyboard focus).
//
// startPlayer({ D, render, holds, chapters, replay })
//   D        length of the scripted timeline in seconds
//   render   render(scriptTime) draws one frame
//   holds    [[scriptTime, extraSeconds]] pauses at fully shown moments so there's time to read (optional)
//   chapters [[startInRealTime, label]] (optional)
//   replay   selector of an end-card Replay button (optional)
// ?t=12 in the URL freezes on that (real) time; reduced-motion users start paused on the last frame.
(function () {
  const CSS = `
#wrap{container-type:inline-size}
.pl-ctrl{position:absolute;left:0;right:0;bottom:0;z-index:30;padding:26px 12px 8px;background:linear-gradient(transparent,rgba(0,0,0,.75));display:flex;flex-direction:column;gap:6px;opacity:0;pointer-events:none;transition:opacity .2s;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
#wrap.pl-show .pl-ctrl,.pl-ctrl:has(:focus-visible){opacity:1;pointer-events:auto}
.pl-chaps{display:flex;gap:6px;flex-wrap:wrap}
@container (max-width:600px){.pl-chaps{display:none}.pl-ctrl{padding-top:18px}}
.pl-chaps button{border:0;border-radius:12px;background:rgba(255,255,255,.16);color:#fff;font-size:12px;font-weight:700;padding:4px 10px;cursor:pointer}
.pl-chaps button:hover{background:rgba(255,255,255,.3)}
.pl-chaps button.on{background:#ff3600}
.pl-row{display:flex;align-items:center;gap:10px}
.pl-pp{width:32px;height:32px;flex:none;border:0;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center;cursor:pointer}
.pl-track{position:relative;flex:1;height:20px;cursor:pointer;touch-action:none}
.pl-track::before{content:"";position:absolute;left:0;right:0;top:8px;height:4px;border-radius:2px;background:rgba(255,255,255,.3)}
.pl-fill{position:absolute;left:0;top:8px;height:4px;border-radius:2px;background:#ff3600}
.pl-tick{position:absolute;top:6px;width:2px;height:8px;margin-left:-1px;background:rgba(255,255,255,.7)}
.pl-knob{position:absolute;top:4px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#fff}
.pl-time{font-size:12px;font-weight:600;color:#fff;min-width:72px;text-align:right;font-variant-numeric:tabular-nums}
.pl-fs{width:32px;height:32px;flex:none;border:0;border-radius:8px;background:rgba(255,255,255,.18);display:grid;place-items:center;cursor:pointer}
#wrap:fullscreen{border-radius:0;background:#000}
#wrap:-webkit-full-screen{border-radius:0;background:#000}`;
  const PLAY = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z" fill="#fff"/></svg>';
  const PAUSE = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2.5" y="1.5" width="3" height="11" fill="#fff"/><rect x="8.5" y="1.5" width="3" height="11" fill="#fff"/></svg>';
  const FULL = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M1.5 6V1.5H6M10 1.5h4.5V6M14.5 10v4.5H10M6 14.5H1.5V10" stroke="#fff" stroke-width="2" fill="none"/></svg>';
  const EXIT = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 1.5V6H1.5M14.5 6H10V1.5M10 14.5V10h4.5M1.5 10H6v4.5" stroke="#fff" stroke-width="2" fill="none"/></svg>';

  window.startPlayer = function ({ D, render, holds = [], chapters = [], replay }) {
    const wrap = document.getElementById('wrap');
    document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
    const oldBar = document.getElementById('bar');
    if (oldBar) oldBar.style.display = 'none';

    const total = D + holds.reduce((a, [, x]) => a + x, 0);
    const script = r => {
      let off = 0;
      for (const [h, x] of holds) { if (r <= h + off) return r - off; if (r <= h + off + x) return h; off += x; }
      return Math.min(r - off, D);
    };

    wrap.insertAdjacentHTML('beforeend', `<div class="pl-ctrl">
      ${chapters.length ? `<div class="pl-chaps">${chapters.map(([s, l]) => `<button type="button" data-s="${s}">${l}</button>`).join('')}</div>` : ''}
      <div class="pl-row"><button class="pl-pp" type="button"></button>
        <div class="pl-track" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="${total}">
          ${chapters.slice(1).map(([s]) => `<i class="pl-tick" style="left:${s / total * 100}%"></i>`).join('')}
          <div class="pl-fill"></div><div class="pl-knob"></div></div>
        <span class="pl-time"></span><button class="pl-fs" type="button"></button></div></div>`);
    const q = s => wrap.querySelector(s);
    const pp = q('.pl-pp'), track = q('.pl-track'), fill = q('.pl-fill'), knob = q('.pl-knob'), time = q('.pl-time');
    const chapBtns = [...wrap.querySelectorAll('.pl-chaps button')];

    const qs = new URLSearchParams(location.search);
    const fixed = qs.has('t') ? parseFloat(qs.get('t')) : null;
    let paused = fixed !== null || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let held = fixed ?? (paused ? total : 0), base = performance.now();
    const now = () => paused ? held : (performance.now() - base) / 1000;
    const seek = t => { held = Math.max(0, Math.min(total, t)); base = performance.now() - held * 1000; };
    const ui = () => { pp.innerHTML = paused ? PLAY : PAUSE; pp.setAttribute('aria-label', paused ? 'Play' : 'Pause'); };
    const play = () => { seek(now() >= total ? 0 : now()); paused = false; ui(); };
    const pause = () => { held = now(); paused = true; ui(); };
    const toggle = () => paused ? play() : pause();
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    // show the controls while the pointer moves over the video (or after a tap); hide them when it's idle or leaves
    let hideT;
    const peek = () => { wrap.classList.add('pl-show'); clearTimeout(hideT); hideT = setTimeout(() => wrap.classList.remove('pl-show'), 2500); };
    wrap.addEventListener('pointermove', peek);
    wrap.addEventListener('pointerdown', peek);
    wrap.addEventListener('pointerleave', () => { clearTimeout(hideT); wrap.classList.remove('pl-show'); });

    // full screen (the hub's iframe needs allow="fullscreen"); hidden where the browser doesn't allow it
    const fsBtn = q('.pl-fs');
    const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
    const fsToggle = () => fsOn()
      ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      : (wrap.requestFullscreen || wrap.webkitRequestFullscreen).call(wrap);
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
      const fsIcon = () => { fsBtn.innerHTML = fsOn() ? EXIT : FULL; fsBtn.setAttribute('aria-label', fsOn() ? 'Exit full screen' : 'Full screen'); };
      fsBtn.addEventListener('click', fsToggle);
      document.addEventListener('fullscreenchange', fsIcon);
      document.addEventListener('webkitfullscreenchange', fsIcon);
      fsIcon();
    } else fsBtn.remove();

    pp.addEventListener('click', toggle);
    chapBtns.forEach(b => b.addEventListener('click', () => { seek(+b.dataset.s + .05); if (paused) play(); }));
    if (replay && document.querySelector(replay)) document.querySelector(replay).addEventListener('click', () => { seek(0); play(); });
    const fromX = x => { const r = track.getBoundingClientRect(); return (x - r.left) / r.width * total; };
    track.addEventListener('pointerdown', e => { track.setPointerCapture(e.pointerId); seek(fromX(e.clientX)); });
    track.addEventListener('pointermove', e => { if (track.hasPointerCapture(e.pointerId)) seek(fromX(e.clientX)); });
    addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.code === 'KeyF' && fsBtn.isConnected) fsToggle();
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); seek(now() + (e.code === 'ArrowLeft' ? -5 : 5)); peek(); }
    });
    ui();
    // handy for reviewing frames from the console: demoPlayer.pause(); demoPlayer.seek(20)
    window.demoPlayer = { seek, play, pause, total };

    (function frame() {
      let e = now();
      if (!paused && e >= total) { e = held = total; paused = true; ui(); }
      e = Math.min(e, total);
      render(script(e));
      const pct = e / total * 100;
      fill.style.width = pct + '%';
      knob.style.left = pct + '%';
      time.textContent = `${fmt(e)} / ${fmt(total)}`;
      track.setAttribute('aria-valuenow', e.toFixed(1));
      const ch = chapters.filter(([s]) => e >= s).length - 1;
      chapBtns.forEach((b, i) => b.classList.toggle('on', i === ch));
      requestAnimationFrame(frame);
    })();
  };
})();
