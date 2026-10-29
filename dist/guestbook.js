'use strict';
(() => {
  const cfg = window.EARN_ARM_GUESTBOOK;
  const $ = selector => document.querySelector(selector);
  const form = $('#wishesForm');
  const state = { photo: '', slip: '', preparing: 0, postcard: null, busy: false, ready: false, saved: false, pending: null, health: null, attempt: null, toast: null };
  const endpointValid = () => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.endpoint || '');
  function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(state.toast); state.toast = setTimeout(() => $('#toast').hidden = true, 4500); }
  function status(message, ready = false) { $('#connectionStatus').textContent = message; $('#connectionStatus').classList.toggle('ready', ready); }
  // There is a send button under the photo and another under the slip; both submit the same form.
  const sendButtons = () => [...form.querySelectorAll('button[type=submit]')];
  function setBusy(busy) { state.busy = busy; [...form.elements].forEach(el => el.disabled = busy); sendButtons().forEach(button => { button.disabled = busy || !state.ready; button.querySelector('span').textContent = busy ? 'กำลังส่งคำอวยพร…' : button.dataset.label; }); }
  function showError(message) { $('#formError').textContent = message; $('#formError').hidden = !message; if (message) $('#formError').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
  function celebrate() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = $('#petals'), ctx = canvas.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2), colors = ['#f7c95c', '#f2aeb6', '#fff7ec', '#f8dca6', '#d4a283', '#f6bdc3'];
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const petals = Array.from({ length: 90 }, () => ({ x: Math.random() * innerWidth, y: (Math.random() * .75 - .6) * innerHeight, vy: 1.1 + Math.random() * 1.2, r: 5 + Math.random() * 7, rot: Math.random() * 6.28, vr: (Math.random() - .5) * .12, flip: Math.random() * 6.28, sway: Math.random() * 6.28, color: colors[Math.random() * colors.length | 0] }));
    (function step() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of petals) {
        p.sway += .035; p.flip += .06; p.rot += p.vr; p.x += Math.sin(p.sway) * .8; p.y += p.vy;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, .35 + Math.abs(Math.cos(p.flip)) * .65);
        ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.quadraticCurveTo(p.r * .95, -p.r * .15, 0, p.r); ctx.quadraticCurveTo(-p.r * .95, -p.r * .15, 0, -p.r);
        ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = '#9c5a3c22'; ctx.stroke(); ctx.restore();
      }
      if (petals.some(p => p.y < innerHeight + 30)) requestAnimationFrame(step); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }
  function trustedMessage(origin) { try { const u = new URL(origin); return u.protocol === 'https:' && (u.hostname === 'script.google.com' || u.hostname === 'script.googleusercontent.com' || u.hostname.endsWith('-script.googleusercontent.com')); } catch { return false; } }
  function connect() {
    state.ready = false; sendButtons().forEach(button => button.disabled = true);
    if (!endpointValid()) { status('สมุดคำอวยพรออนไลน์กำลังเตรียมเปิดรับ · สามารถดูโปสการ์ดตัวอย่างได้ก่อน'); return; }
    if (state.health) clearTimeout(state.health.timer);
    const requestId = crypto.randomUUID();
    const url = new URL(cfg.endpoint); url.searchParams.set('action', 'ping'); url.searchParams.set('origin', location.origin); url.searchParams.set('requestId', requestId);
    state.health = { requestId, timer: setTimeout(() => { state.health = null; status('ยังเชื่อมต่อสมุดคำอวยพรไม่ได้ กรุณาเปิดหน้าใหม่อีกครั้ง'); }, 45000) };
    status('กำลังเชื่อมต่อสมุดคำอวยพร…'); $('#submitFrame').src = url.href;
  }
  window.addEventListener('message', event => {
    if (!trustedMessage(event.origin)) return;
    const result = event.data;
    if (!result || result.channel !== 'earn-arm-guestbook' || typeof result.ok !== 'boolean') return;
    if (state.health && result.requestId === state.health.requestId) {
      clearTimeout(state.health.timer); state.health = null;
      if (result.ok) { state.ready = true; sendButtons().forEach(button => button.disabled = state.busy); status('พร้อมรับคำอวยพรของคุณแล้ว ♡', true); }
      else status('สมุดคำอวยพรยังไม่พร้อมรับข้อความ กรุณากลับมาอีกครั้ง');
      return;
    }
    if (!state.pending || result.requestId !== state.pending.requestId) return;
    clearTimeout(state.pending.timer); state.pending = null; setBusy(false); status('พร้อมรับคำอวยพรของคุณแล้ว ♡', true);
    if (!result.ok) { showError(result.error || 'ยังบันทึกไม่สำเร็จ กรุณาลองอีกครั้ง'); return; }
    state.saved = true; showError(''); $('#formCard').hidden = true; $('#successCard').hidden = false;
    $('#savedReference').textContent = 'รหัสคำอวยพร: ' + result.requestId.slice(0, 8).toUpperCase();
    $('#successCard').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    celebrate();
  });
  const MAX_BYTES = 5 * 1024 * 1024;
  // Phone photos are often HEIC or larger than the 5 MB the guestbook accepts, so redraw them as a JPEG that fits.
  async function shrinkImage(file) {
    const source = URL.createObjectURL(file);
    try {
      const image = await loadImage(source);
      for (const [side, quality] of [[2400, .86], [2000, .8], [1600, .75], [1200, .7]]) {
        const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', quality);
        if ((url.length - url.indexOf(',') - 1) * .75 <= MAX_BYTES * .95) return url;
      }
      throw new Error('Image is still too large');
    } finally { URL.revokeObjectURL(source); }
  }
  async function readImage(input, kind) {
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 40 * 1024 * 1024) { input.value = ''; toast('รูปนี้ใหญ่เกินไป กรุณาเลือกรูปอื่น'); return; }
    state.preparing++; $('#' + kind + 'Filename').textContent = 'กำลังเตรียมรูป…'; $('#' + kind + 'Preview').hidden = false;
    try {
      const url = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= MAX_BYTES
        ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); })
        : await shrinkImage(file);
      await loadImage(url); state[kind] = url;
      $('#' + kind + 'Thumb').src = url; $('#' + kind + 'Filename').textContent = file.name; state.attempt = null;
    } catch { input.value = ''; state[kind] = ''; $('#' + kind + 'Thumb').removeAttribute('src'); $('#' + kind + 'Preview').hidden = true; toast('เปิดรูปนี้ไม่ได้ กรุณาเลือกรูปอื่น'); }
    finally { state.preparing--; }
  }
  function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
  for (const kind of ['photo', 'slip']) {
    $('#' + kind + 'Input').addEventListener('change', event => readImage(event.target, kind));
    $('#remove' + kind[0].toUpperCase() + kind.slice(1)).addEventListener('click', () => { state[kind] = ''; $('#' + kind + 'Input').value = ''; $('#' + kind + 'Thumb').removeAttribute('src'); $('#' + kind + 'Preview').hidden = true; state.attempt = null; });
  }
  $('#blessing').addEventListener('input', () => $('#messageCount').textContent = $('#blessing').value.length);
  form.addEventListener('input', () => { if (!state.busy) state.attempt = null; showError(''); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (state.busy) return;
    if (!state.ready) { showError('ยังไม่ได้เชื่อมต่อสมุดคำอวยพร จึงยังส่งข้อความไม่ได้'); return; }
    if (state.preparing) { showError('กำลังเตรียมรูป กรุณารอสักครู่แล้วกดส่งอีกครั้ง'); return; }
    if (!form.reportValidity()) return;
    const name = $('#guestName').value.trim(), message = $('#blessing').value.trim();
    if (!name || !message) { showError('กรุณากรอกชื่อและข้อความอวยพรให้ครบถ้วน'); return; }
    showError('');
    const requestId = state.attempt || crypto.randomUUID(); state.attempt = requestId;
    const data = { requestId, origin: location.origin, name, relation: $('#relation').value, message, photo: state.photo, slip: state.slip, consent: $('#consent').checked, website: $('#website').value, isTest: new URLSearchParams(location.search).get('test') === '1' };
    const delivery = document.createElement('form'); delivery.method = 'post'; delivery.action = cfg.endpoint; delivery.target = 'earnArmSubmitFrame'; delivery.hidden = true;
    const payload = document.createElement('input'); payload.name = 'payload'; payload.value = JSON.stringify(data); delivery.append(payload); document.body.append(delivery);
    setBusy(true); status('กำลังส่งคำอวยพรและไฟล์แนบ กรุณารอสักครู่…');
    state.pending = { requestId, timer: setTimeout(() => { state.pending = null; setBusy(false); showError('ยังไม่ได้รับการยืนยันว่าบันทึกสำเร็จ กรุณาลองส่งอีกครั้ง ระบบจะใช้รหัสเดิมเพื่อป้องกันรายการซ้ำ'); status('ข้อมูลยังอยู่ในฟอร์ม สามารถลองส่งอีกครั้งได้'); }, 90000) };
    delivery.submit(); delivery.remove();
  });
  $('#copyPromptpay').addEventListener('click', async () => { try { await navigator.clipboard.writeText(cfg.promptPay); toast('คัดลอกหมายเลขพร้อมเพย์ ' + cfg.promptPay + ' แล้ว'); } catch { toast('หมายเลขพร้อมเพย์: ' + cfg.promptPay); } });
  $('#zoomQr').addEventListener('click', () => $('#qrDialog').showModal());
  $('#closeQr').addEventListener('click', () => $('#qrDialog').close());
  $('#accountName').textContent = cfg.accountName;
  $('#promptpayNumber').textContent = cfg.promptPay.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  async function showPostcard() {
    const name = $('#guestName').value.trim(); const message = $('#blessing').value.trim();
    if (!name || !message) { showError('ใส่ชื่อและข้อความอวยพร เพื่อดูตัวอย่างโปสการ์ด'); $('#guestName').focus(); return; }
    if (state.preparing) { showError('กำลังเตรียมรูป กรุณารอสักครู่'); return; }
    try {
      state.postcard = await drawPostcard(name, message);
      $('#postcardImage').src = state.postcard.toDataURL('image/jpeg', .9);
      $('#postcardStatus').textContent = state.saved ? 'โปสการ์ดความทรงจำ · บันทึกคำอวยพรแล้ว' : 'ตัวอย่างโปสการ์ด · ยังไม่ได้ส่งคำอวยพร';
      $('#postcardDialog').showModal();
    } catch { toast('สร้างโปสการ์ดไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  }
  $('#previewButton').addEventListener('click', showPostcard); $('#successPostcard').addEventListener('click', showPostcard); $('#closePostcard').addEventListener('click', () => $('#postcardDialog').close());
  function wrapText(context, text, maxWidth) {
    const lines = [];
    // Thai has no spaces between words, so break lines at the word boundaries the browser finds.
    const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
    for (const paragraph of text.split('\n')) {
      let line = ''; const parts = segmenter ? [...segmenter.segment(paragraph)].map(part => part.segment) : paragraph.split(/(\s+)/);
      for (const part of parts) {
        if (!line && !part.trim()) continue;
        if (line && context.measureText(line + part).width > maxWidth) { lines.push(line.trimEnd()); line = part.trimStart(); } else line += part;
        while (context.measureText(line).width > maxWidth) { let cut = line.length - 1; while (cut > 1 && context.measureText(line.slice(0, cut)).width > maxWidth) cut--; lines.push(line.slice(0, cut)); line = line.slice(cut); }
      }
      lines.push(line.trimEnd());
    }
    return lines;
  }
  // The postcard is drawn once on a canvas; the preview shows that same picture and the download saves it.
  function archPath(ctx, x, y, w, h) { const r = w / 2; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }
  function drawPetal(ctx, x, y, r, angle, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * .95, -r * .15, 0, r); ctx.quadraticCurveTo(-r * .95, -r * .15, 0, -r);
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = 'rgba(156,90,60,.18)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  async function drawPostcard(name, message) {
    await Promise.all(['700 42px "Charm"', '40px "Noto Serif Thai"', '26px "Noto Sans Thai"'].map(font => document.fonts.load(font)));
    const [logo, photo] = await Promise.all([loadImage('assets/earn-arm-monogram.png'), state.photo ? loadImage(state.photo) : null]);
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1600; const ctx = canvas.getContext('2d');
    const paper = ctx.createLinearGradient(0, 0, 0, 1600); paper.addColorStop(0, '#fbe2d2'); paper.addColorStop(.45, '#fff8f1'); paper.addColorStop(1, '#fdf0e5'); ctx.fillStyle = paper; ctx.fillRect(0, 0, 1200, 1600);
    const glow = ctx.createRadialGradient(600, 300, 0, 600, 300, 640); glow.addColorStop(0, 'rgba(255,211,143,.32)'); glow.addColorStop(1, 'rgba(255,211,143,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1200, 1600);
    // A few petals in the corners above the arch.
    [[110, 130, 24, .5, '#f2aeb6'], [215, 78, 16, 2.1, '#f7c95c'], [80, 270, 18, 1.2, '#fff3e6'], [262, 170, 12, 2.8, '#e7b48f'], [1090, 130, 24, -.6, '#f7c95c'], [985, 78, 16, -2.2, '#f2aeb6'], [1120, 270, 18, -1.1, '#e7b48f'], [938, 170, 12, -2.7, '#fff3e6']]
      .forEach(([x, y, r, angle, color]) => drawPetal(ctx, x, y, r, angle, color));
    ctx.strokeStyle = '#c99a72'; ctx.lineWidth = 4; archPath(ctx, 54, 54, 1092, 1492); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,154,114,.45)'; ctx.lineWidth = 2; archPath(ctx, 76, 76, 1048, 1448); ctx.stroke();
    let area;
    if (photo) {
      ctx.drawImage(logo, 500, 150, 200, 200 * logo.height / logo.width);
      const x = 290, y = 330, w = 620, h = 580;
      ctx.save(); ctx.shadowColor = 'rgba(110,60,30,.22)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16; archPath(ctx, x, y, w, h); ctx.fillStyle = '#fffaf3'; ctx.fill(); ctx.restore();
      ctx.save(); archPath(ctx, x, y, w, h); ctx.clip(); const scale = Math.max(w / photo.width, h / photo.height); ctx.drawImage(photo, x + (w - photo.width * scale) / 2, y + (h - photo.height * scale) / 2, photo.width * scale, photo.height * scale); ctx.restore();
      ctx.strokeStyle = '#d9b496'; ctx.lineWidth = 2; archPath(ctx, x - 16, y - 16, w + 32, h + 32); ctx.stroke();
      area = { top: 975, bottom: 1270, largest: 46 };
    } else {
      const height = 400 * logo.height / logo.width; ctx.drawImage(logo, 400, 200, 400, height);
      area = { top: 560, bottom: 1250, largest: 60 };
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#5e3424';
    let size = area.largest, lines;
    for (; size >= 22; size -= 2) { ctx.font = size + 'px "Noto Serif Thai"'; lines = wrapText(ctx, message, 860); if (lines.length * size * 1.75 <= area.bottom - area.top) break; }
    const lineHeight = size * 1.75, first = area.top + (area.bottom - area.top - lines.length * lineHeight) / 2 + lineHeight * .72;
    lines.forEach((line, index) => ctx.fillText(line, 600, first + index * lineHeight));
    const divider = area.bottom + 34;
    ctx.strokeStyle = '#d2a77f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(500, divider); ctx.lineTo(574, divider); ctx.moveTo(626, divider); ctx.lineTo(700, divider); ctx.stroke();
    ctx.fillStyle = '#c27a52'; ctx.font = '30px "Noto Sans Thai"'; ctx.fillText('♡', 600, divider + 10);
    const from = 'ด้วยความปรารถนาดีจาก ' + name; let fromSize = 42;
    for (; fromSize > 28; fromSize -= 2) { ctx.font = '700 ' + fromSize + 'px "Charm"'; if (ctx.measureText(from).width <= 880) break; }
    ctx.fillStyle = '#7a3e2a'; wrapText(ctx, from, 880).slice(0, 2).forEach((line, index, all) => ctx.fillText(line, 600, divider + (all.length > 1 ? 66 : 80) + index * 46));
    ctx.fillStyle = '#a07a5a'; ctx.font = '26px "Noto Sans Thai"'; ctx.fillText('เสาร์ที่ 23 มกราคม 2570', 600, 1478);
    return canvas;
  }
  $('#downloadPostcard').addEventListener('click', async () => {
    const button = $('#downloadPostcard'); button.disabled = true; button.textContent = 'กำลังเตรียมโปสการ์ด…';
    try {
      const blob = await new Promise(resolve => state.postcard.toBlob(resolve, 'image/png')); if (!blob) throw new Error('Canvas export failed');
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'Earn-Arm-Wedding-Wish.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast('บันทึกโปสการ์ดแล้ว ♡');
    } catch { toast('สร้างโปสการ์ดไม่สำเร็จ กรุณาลองอีกครั้ง'); } finally { button.disabled = false; button.textContent = 'ดาวน์โหลดโปสการ์ด ↓'; }
  });
  connect();
})();
