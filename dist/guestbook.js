'use strict';
(() => {
  const cfg = window.EARN_ARM_GUESTBOOK;
  const $ = selector => document.querySelector(selector);
  const form = $('#wishesForm');
  const state = { photo: '', slip: '', preparing: 0, busy: false, ready: false, saved: false, pending: null, health: null, attempt: null, toast: null };
  const endpointValid = () => /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.endpoint || '');
  function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(state.toast); state.toast = setTimeout(() => $('#toast').hidden = true, 4500); }
  function status(message, ready = false) { $('#connectionStatus').textContent = message; $('#connectionStatus').classList.toggle('ready', ready); }
  function setBusy(busy) { state.busy = busy; [...form.elements].forEach(el => el.disabled = busy); $('#submitButton').disabled = busy || !state.ready; $('#submitButton span').textContent = busy ? 'กำลังส่งคำอวยพร…' : 'ส่งคำอวยพร & สร้างโปสการ์ด'; }
  function showError(message) { $('#formError').textContent = message; $('#formError').hidden = !message; }
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
    state.ready = false; $('#submitButton').disabled = true;
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
      if (result.ok) { state.ready = true; $('#submitButton').disabled = state.busy; status('พร้อมรับคำอวยพรของคุณแล้ว ♡', true); }
      else status('สมุดคำอวยพรยังไม่พร้อมรับข้อความ กรุณากลับมาอีกครั้ง');
      return;
    }
    if (!state.pending || result.requestId !== state.pending.requestId) return;
    clearTimeout(state.pending.timer); state.pending = null; setBusy(false);
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
  function showPostcard() {
    const name = $('#guestName').value.trim(); const message = $('#blessing').value.trim();
    if (!name || !message) { showError('ใส่ชื่อและข้อความอวยพร เพื่อดูตัวอย่างโปสการ์ด'); $('#guestName').focus(); return; }
    $('#postcardWish').textContent = message; $('#postcardFrom').textContent = 'ด้วยความปรารถนาดีจาก ' + name;
    $('#postcardPhoto').hidden = !state.photo; if (state.photo) $('#postcardPhoto').src = state.photo; else $('#postcardPhoto').removeAttribute('src');
    $('#postcardStatus').textContent = state.saved ? 'โปสการ์ดความทรงจำ · บันทึกคำอวยพรแล้ว' : 'ตัวอย่างโปสการ์ด · ยังไม่ได้ส่งคำอวยพร';
    $('#postcardDialog').showModal();
  }
  $('#previewButton').addEventListener('click', showPostcard); $('#successPostcard').addEventListener('click', showPostcard); $('#closePostcard').addEventListener('click', () => $('#postcardDialog').close());
  function wrapText(context, text, maxWidth) {
    const lines = [];
    const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
    for (const paragraph of text.split('\n')) {
      let line = ''; const parts = segmenter ? [...segmenter.segment(paragraph)].map(part => part.segment) : [...paragraph];
      for (const part of parts) { if (line && context.measureText(line + part).width > maxWidth) { lines.push(line); line = part; } else line += part; }
      lines.push(line);
    }
    return lines;
  }
  $('#downloadPostcard').addEventListener('click', async () => {
    const button = $('#downloadPostcard'); button.disabled = true; button.textContent = 'กำลังเตรียมโปสการ์ด…';
    try {
      await Promise.all(['italic 44px "Cormorant Garamond"', '500 130px "Cormorant Garamond"', '150px "Great Vibes"', '700 40px "Charm"', '38px "Noto Serif Thai"'].map(font => document.fonts.load(font)));
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1600; const ctx = canvas.getContext('2d');
      const paper = ctx.createLinearGradient(0, 0, 0, 1600); paper.addColorStop(0, '#fbe4d6'); paper.addColorStop(.7, '#fffaf3'); ctx.fillStyle = paper; ctx.fillRect(0, 0, 1200, 1600);
      if (state.photo) {
        const image = await loadImage(state.photo); const scale = Math.max(1200 / image.width, 1600 / image.height); ctx.drawImage(image, (1200 - image.width * scale) / 2, (1600 - image.height * scale) / 2, image.width * scale, image.height * scale);
        const gradient = ctx.createLinearGradient(0, 0, 0, 1600); gradient.addColorStop(0, 'rgba(255,250,244,.94)'); gradient.addColorStop(.35, 'rgba(255,250,244,.88)'); gradient.addColorStop(1, 'rgba(255,250,244,.98)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 1600);
      }
      // The same arch as the printed card and the postcard preview.
      const arch = inset => { const r = 600 - inset; ctx.beginPath(); ctx.moveTo(inset, 1600 - inset); ctx.lineTo(inset, inset + r); ctx.arc(600, inset + r, r, Math.PI, 0); ctx.lineTo(1200 - inset, 1600 - inset); ctx.closePath(); ctx.stroke(); };
      ctx.strokeStyle = '#c99a72'; ctx.lineWidth = 4; arch(54); ctx.strokeStyle = 'rgba(201,154,114,.45)'; ctx.lineWidth = 2; arch(78);
      ctx.textAlign = 'center'; ctx.fillStyle = '#9c7353'; ctx.font = 'italic 44px "Cormorant Garamond"'; ctx.fillText('A little wish for your forever', 600, 430);
      ctx.textAlign = 'left'; ctx.font = '500 130px "Cormorant Garamond"'; const earn = ctx.measureText('Earn ').width, arm = ctx.measureText(' Arm').width; ctx.font = '150px "Great Vibes"'; const amp = ctx.measureText('&').width;
      let x = 600 - (earn + amp + arm) / 2; ctx.fillStyle = '#5e3424'; ctx.font = '500 130px "Cormorant Garamond"'; ctx.fillText('Earn ', x, 570); x += earn;
      ctx.fillStyle = '#c27a52'; ctx.font = '150px "Great Vibes"'; ctx.fillText('&', x, 575); x += amp; ctx.fillStyle = '#5e3424'; ctx.font = '500 130px "Cormorant Garamond"'; ctx.fillText(' Arm', x, 570);
      ctx.textAlign = 'center'; ctx.fillStyle = '#65402f';
      const message = $('#blessing').value.trim(); let fontSize = 38, lines;
      do { ctx.font = fontSize + 'px "Noto Serif Thai"'; lines = wrapText(ctx, message, 920); if (lines.length * fontSize * 1.8 <= 660) break; fontSize -= 2; } while (fontSize >= 16);
      const lineHeight = fontSize * 1.8, startY = 640 + (660 - lines.length * lineHeight) / 2 + lineHeight * .75;
      lines.forEach((line, index) => ctx.fillText(line, 600, startY + index * lineHeight));
      ctx.fillStyle = '#7a3e2a'; ctx.font = '700 40px "Charm"'; wrapText(ctx, 'ด้วยความปรารถนาดีจาก ' + $('#guestName').value.trim(), 920).forEach((line, index) => ctx.fillText(line, 600, 1385 + index * 56));
      ctx.fillStyle = '#9c7353'; ctx.font = 'italic 34px "Cormorant Garamond"'; ctx.fillText('23 January 2027', 600, 1490);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('Canvas export failed');
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'Earn-Arm-Wedding-Wish.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast('บันทึกโปสการ์ดแล้ว ♡');
    } catch { toast('สร้างโปสการ์ดไม่สำเร็จ กรุณาลองอีกครั้ง'); } finally { button.disabled = false; button.textContent = 'ดาวน์โหลดโปสการ์ด ↓'; }
  });
  connect();
})();
