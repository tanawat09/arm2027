'use strict';
// Owner page for the card. It edits a draft of the card data, shows it live in the guest card (index.html?preview)
// and builds the files that go on the web. Guests never load this page.
(() => {
  // Where the guest card lives on the web: used for guest links and for the guestbook link inside the one-file card.
  const SITE = 'https://tanawat09.github.io/arm2027/';
  const SHEET = 'https://docs.google.com/spreadsheets/d/1-zkWa1JVysEYSBg4mWLF6uIUvKdSEZSFIwWMOHwSwfk/edit';
  const SCRIPT = 'https://script.google.com/home/projects/1DEpL6LbP3lzOOUHTaHgENi-xImPTYFa5wBAgvTerzoBSU0LOyj7uSaw5/edit';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const frame = $('#preview');
  let siteHtml = '', publishedSnapshot = '', initial = null, cfg = null, db = null, saveTimer = 0, previewTimer = 0, previewReady = false, toastTimer = 0;

  function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4200); }
  function safeUrl(value) { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } }
  function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T12:00:00+07:00').getTime()); }
  function youtubeId(value) {
    try {
      const u = new URL(value); let id = '';
      if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(u.hostname)) id = u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] || '';
      return /^[\w-]{11}$/.test(id) ? id : '';
    } catch { return ''; }
  }
  function clockTime(seconds) { const n = Math.max(0, Math.floor(Number(seconds) || 0)); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
  function parseClock(value) { const s = value.trim(); if (/^\d+$/.test(s)) return Number(s); const m = s.match(/^(\d{1,3}):([0-5]\d)$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }
  function musicIsBlocked() { return cfg.musicSource === 'youtube' && youtubeId(cfg.musicYoutube) === cfg.blockedMusicId; }
  function toDataURL(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
  async function readMedia(input, kind, max) {
    const f = input.files?.[0]; if (!f) return null;
    if (f.size > max * 1024 * 1024) { notify('ไฟล์ต้องมีขนาดไม่เกิน ' + max + ' MB'); input.value = ''; return null; }
    if (!f.type.startsWith(kind + '/')) { notify('ชนิดไฟล์ไม่รองรับ กรุณาเลือกไฟล์' + { image: 'รูปภาพ', audio: 'เสียง', video: 'วิดีโอ' }[kind]); input.value = ''; return null; }
    try { return { url: await toDataURL(f), name: f.name }; } catch { notify('อ่านไฟล์ไม่สำเร็จ กรุณาเลือกใหม่'); return null; }
  }

  // The preview frame is the real guest card; it says when it is ready and then takes every draft change.
  function sendPreview(play = false) { if (previewReady && cfg) frame.contentWindow.postMessage({ type: 'earn-arm-preview', cfg, play }, location.origin); }
  addEventListener('message', e => { if (e.origin === location.origin && e.source === frame.contentWindow && e.data?.type === 'earn-arm-preview-ready') { previewReady = true; sendPreview(); } });
  function changed() { renderStatus(); clearTimeout(previewTimer); previewTimer = setTimeout(sendPreview, 150); scheduleSave(); }

  function renderStatus() {
    $('#musicStatus').textContent = 'เพลง: ' + (cfg.musicSource === 'youtube' ? (cfg.musicTitle || 'เพลงจาก YouTube') + ' · ' + clockTime(cfg.musicStart) + '–' + clockTime(cfg.musicEnd) : cfg.musicName);
    $('#videoStatus').textContent = cfg.video ? 'วิดีโอ: ' + cfg.videoName : cfg.youtube ? 'ใช้วิดีโอจาก YouTube' : 'ยังไม่ได้เพิ่มวิดีโอ';
    $('#youtubeMusicSettings').hidden = cfg.musicSource !== 'youtube'; $('#fileMusicSettings').hidden = cfg.musicSource === 'youtube'; $('#musicSource').value = cfg.musicSource || 'file';
    $('#musicTimingHint').textContent = musicIsBlocked() ? 'คลิปนี้ไม่อนุญาตให้ฝัง: ลิงก์เปิด YouTube จะเริ่มตามเวลาที่เลือก ส่วนเวลาจบและวนซ้ำใช้ได้เมื่อคลิปอนุญาตให้ฝัง หรือเลือกไฟล์เพลง' : 'เลือกเวลาเริ่ม–จบเพื่อฟังและเล่นช่วงที่เลือกวนซ้ำ';
    // Compared with what was last published from this browser, or else with the card on the web.
    const draft = JSON.stringify(cfg) !== (publishedSnapshot || JSON.stringify(initial));
    $('#draftNote').hidden = !draft;
    $('#draftNote').textContent = 'มีการแก้ไขที่ยังไม่ได้นำขึ้นเว็บ แขกยังเห็นการ์ดฉบับเดิมจนกว่าจะนำ index.html ฉบับใหม่ขึ้นเว็บ';
  }

  // Drafts stay in this browser only, under the same name the card page used before, so earlier drafts carry over.
  function initDB() { return new Promise((resolve, reject) => { const request = indexedDB.open('ever-after-wedding-draft-' + (initial.draftId || 'v1'), 1); request.onupgradeneeded = () => request.result.createObjectStore('draft'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  function scheduleSave() { clearTimeout(saveTimer); $('#saveStatus').textContent = 'กำลังบันทึกร่าง…'; saveTimer = setTimeout(saveDraft, 450); }
  function savePublished() { if (!db) return Promise.resolve(); return new Promise(resolve => { const tx = db.transaction('draft', 'readwrite'); tx.objectStore('draft').put(publishedSnapshot, 'published'); tx.oncomplete = tx.onerror = () => resolve(); }); }
  function saveDraft() {
    if (!db) { $('#saveStatus').textContent = 'เบราว์เซอร์นี้บันทึกร่างไม่ได้ ดาวน์โหลดไฟล์เพื่อเก็บงาน'; return Promise.resolve(false); }
    return new Promise(resolve => {
      const tx = db.transaction('draft', 'readwrite'); tx.objectStore('draft').put(cfg, 'current');
      tx.oncomplete = () => { $('#saveStatus').textContent = 'บันทึกร่างในเบราว์เซอร์นี้แล้ว ✓'; resolve(true); };
      tx.onerror = () => { $('#saveStatus').textContent = 'พื้นที่เก็บข้อมูลไม่พอ ดาวน์โหลดไฟล์เพื่อเก็บงาน'; resolve(false); };
    });
  }

  function switchTab(tab) { $$('[data-tab]').forEach(e => e.setAttribute('aria-selected', String(e.dataset.tab === tab))); $$('[data-panel]').forEach(e => e.hidden = e.dataset.panel !== tab); }
  function populateEditor() {
    $$('[data-field]').forEach(e => e.value = cfg[e.dataset.field] || '');
    $('#demoCheck').checked = !!cfg.demo; $('#youtubeInput').value = cfg.youtube || ''; $('#musicYoutubeInput').value = cfg.musicYoutube || '';
    $('#musicStartInput').value = clockTime(cfg.musicStart); $('#musicEndInput').value = clockTime(cfg.musicEnd); $('#musicLoopCheck').checked = !!cfg.musicLoop;
    $('#fileStartInput').value = clockTime(cfg.fileStart); $('#fileEndInput').value = cfg.fileEnd ? clockTime(cfg.fileEnd) : ''; $('#fileLoopCheck').checked = cfg.fileLoop !== false;
    renderPhotos();
    $('#scheduleEditor').replaceChildren();
    cfg.events.forEach((event, i) => {
      const title = document.createElement('h3'); title.className = 'editor-section-title'; title.textContent = 'ช่วงที่ ' + (i + 1); $('#scheduleEditor').append(title);
      for (const [key, label] of [['time', 'เวลา'], ['title', 'ชื่อพิธี'], ['detail', 'คำอธิบายสั้น ๆ']]) {
        const wrap = document.createElement('label'); wrap.className = 'field'; const span = document.createElement('span'); span.textContent = label;
        const input = document.createElement('input'); input.type = key === 'time' ? 'time' : 'text'; input.value = event[key]; input.maxLength = 100;
        input.addEventListener('input', () => { if (key === 'time' && !input.value) return; cfg.events[i][key] = input.value; changed(); });
        wrap.append(span, input); $('#scheduleEditor').append(wrap);
      }
    });
    $('#colorEditor').replaceChildren();
    cfg.colors.forEach((color, i) => {
      const label = document.createElement('label'); label.className = 'field'; const span = document.createElement('span'); span.textContent = 'สีชุด ' + (i + 1);
      const input = document.createElement('input'); input.type = 'color'; input.value = color; input.addEventListener('input', () => { cfg.colors[i] = input.value; changed(); });
      label.append(span, input); $('#colorEditor').append(label);
    });
  }
  // Photos: big pictures are redrawn as JPEG no larger than maxSide, so the card file stays light on phones.
  const GALLERY_LIMIT = 20;
  async function prepareImage(file, maxSide = 2000) {
    if (!file.type.startsWith('image/')) throw Error('Not an image');
    const source = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = source; });
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && ['image/jpeg', 'image/webp'].includes(file.type)) { const src = await toDataURL(file); return { src, bytes: file.size }; }
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL('image/jpeg', .86); return { src, bytes: Math.round((src.length - src.indexOf(',') - 1) * .75) };
    } finally { URL.revokeObjectURL(source); }
  }
  function fileButton(label, multiple, onFiles) {
    const wrap = document.createElement('label'); wrap.className = 'small-button file-button'; wrap.textContent = label;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = multiple;
    input.addEventListener('change', async () => { const files = [...input.files]; input.value = ''; if (files.length) await onFiles(files); });
    wrap.append(input); return wrap;
  }
  function iconButton(label, text, onClick, disabled = false) { const b = document.createElement('button'); b.type = 'button'; b.className = 'photo-tool'; b.textContent = text; b.setAttribute('aria-label', label); b.title = label; b.disabled = disabled; b.addEventListener('click', onClick); return b; }

  const SLOTS = [
    { key: 'heroImage', alt: 'heroAlt', title: 'รูปหน้าปกและหน้าแรก', hint: 'แนะนำภาพแนวตั้ง 2:3 ใช้ทั้งหน้าปกที่เปิดเหมือนประตูและกรอบโค้งหน้าแรก', side: 2000 },
    { key: 'storyImage', alt: 'storyAlt', title: 'รูปเรื่องราวและปกวิดีโอ', hint: 'แนะนำภาพแนวนอน', side: 2000 },
    { key: 'originalImage', title: 'การ์ดเชิญฉบับเต็ม', hint: 'เปิดเมื่อแขกกด “ดูการ์ดเชิญฉบับเต็ม” ย่อน้อยกว่ารูปอื่นเพื่อให้อ่านตัวหนังสือได้', side: 2600 },
  ];
  function renderSlots() {
    $('#photoSlots').replaceChildren(...SLOTS.map(slot => {
      const card = document.createElement('div'); card.className = 'photo-slot';
      const img = document.createElement('img'); img.src = cfg[slot.key]; img.alt = slot.title;
      const body = document.createElement('div'); const title = document.createElement('strong'); title.textContent = slot.title; const hint = document.createElement('small'); hint.textContent = slot.hint;
      const tools = document.createElement('div'); tools.className = 'photo-slot-tools';
      tools.append(fileButton('เปลี่ยนรูป', false, async ([file]) => {
        try { cfg[slot.key] = (await prepareImage(file, slot.side)).src; renderSlots(); changed(); notify('เปลี่ยน' + slot.title + 'แล้ว'); } catch { notify('เปิดรูปนี้ไม่ได้ กรุณาเลือกรูปอื่น'); }
      }));
      const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'text-button'; restore.textContent = 'ใช้รูปเดิมบนเว็บ'; restore.disabled = cfg[slot.key] === initial[slot.key];
      restore.addEventListener('click', () => { cfg[slot.key] = initial[slot.key]; renderSlots(); changed(); });
      tools.append(restore); body.append(title, hint, tools);
      if (slot.alt) {
        const field = document.createElement('label'); field.className = 'field'; const span = document.createElement('span'); span.textContent = 'คำอธิบายรูป (สำหรับโปรแกรมอ่านหน้าจอ)';
        const input = document.createElement('input'); input.value = cfg[slot.alt] || ''; input.maxLength = 160; input.addEventListener('input', () => { cfg[slot.alt] = input.value; changed(); });
        field.append(span, input); body.append(field);
      }
      card.append(img, body); return card;
    }));
  }

  async function addGalleryPhotos(files) {
    cfg.gallery ??= []; let added = 0, skipped = 0;
    for (const file of files) {
      if (cfg.gallery.length >= GALLERY_LIMIT) { notify('แกลเลอรีใส่ได้สูงสุด ' + GALLERY_LIMIT + ' รูป'); break; }
      try { const photo = await prepareImage(file); cfg.gallery.push({ id: crypto.randomUUID(), src: photo.src, caption: '', bytes: photo.bytes }); added++; } catch { skipped++; }
    }
    renderGalleryEditor();
    if (added) { changed(); notify('เพิ่มรูปแล้ว ' + added + ' รูป' + (skipped ? ' · ข้ามไฟล์ที่เปิดไม่ได้ ' + skipped + ' ไฟล์' : '')); } else if (skipped) notify('เปิดรูปที่เลือกไม่ได้ กรุณาเลือกรูปอื่น');
  }
  function moveGalleryPhoto(from, to) { if (to < 0 || to >= cfg.gallery.length || from === to) return; const [photo] = cfg.gallery.splice(from, 1); cfg.gallery.splice(to, 0, photo); renderGalleryEditor(); changed(); }
  function renderGalleryEditor() {
    const photos = cfg.gallery || [];
    $('#galleryTally').textContent = photos.length + ' / ' + GALLERY_LIMIT;
    $('#galleryDrop').hidden = photos.length >= GALLERY_LIMIT;
    $('#galleryEditor').replaceChildren(...photos.map((photo, i) => {
      const tile = document.createElement('figure'); tile.className = 'photo-tile'; tile.draggable = true; tile.dataset.index = i;
      const img = document.createElement('img'); img.src = photo.src; img.alt = 'รูปที่ ' + (i + 1) + ' ในแกลเลอรี';
      const number = document.createElement('span'); number.className = 'photo-number'; number.textContent = i + 1;
      const caption = document.createElement('input'); caption.value = photo.caption || ''; caption.maxLength = 100; caption.placeholder = 'คำบรรยายใต้รูป'; caption.setAttribute('aria-label', 'คำบรรยายรูปที่ ' + (i + 1));
      caption.addEventListener('input', () => { cfg.gallery[i].caption = caption.value; changed(); });
      const tools = document.createElement('div'); tools.className = 'photo-tools';
      tools.append(
        iconButton('เลื่อนรูปที่ ' + (i + 1) + ' ไปก่อน', '←', () => moveGalleryPhoto(i, i - 1), i === 0),
        iconButton('เลื่อนรูปที่ ' + (i + 1) + ' ไปหลัง', '→', () => moveGalleryPhoto(i, i + 1), i === photos.length - 1),
        fileButton('เปลี่ยน', false, async ([file]) => { try { const next = await prepareImage(file); cfg.gallery[i] = { ...cfg.gallery[i], src: next.src, bytes: next.bytes }; renderGalleryEditor(); changed(); } catch { notify('เปิดรูปนี้ไม่ได้ กรุณาเลือกรูปอื่น'); } }),
        iconButton('ลบรูปที่ ' + (i + 1), 'ลบ', () => { if (!confirm('ลบรูปที่ ' + (i + 1) + ' ออกจากแกลเลอรี?')) return; cfg.gallery.splice(i, 1); renderGalleryEditor(); changed(); }),
      );
      tile.append(number, img, caption, tools); return tile;
    }));
  }
  function renderPhotos() { renderSlots(); renderGalleryEditor(); }
  function bindGallery() {
    const drop = $('#galleryDrop'), grid = $('#galleryEditor'); let dragFrom = null;
    $('#galleryUpload').addEventListener('change', async e => { const files = [...e.target.files]; e.target.value = ''; await addGalleryPhotos(files); });
    drop.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('is-over'); } });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); addGalleryPhotos([...e.dataTransfer.files]); });
    // Tiles can also be dragged onto each other to change the order.
    grid.addEventListener('dragstart', e => { const tile = e.target.closest('.photo-tile'); if (!tile) return; dragFrom = Number(tile.dataset.index); e.dataTransfer.effectAllowed = 'move'; });
    grid.addEventListener('dragover', e => { if (dragFrom !== null && e.target.closest('.photo-tile')) e.preventDefault(); });
    grid.addEventListener('drop', e => { const tile = e.target.closest('.photo-tile'); if (dragFrom === null || !tile) return; e.preventDefault(); moveGalleryPhoto(dragFrom, Number(tile.dataset.index)); dragFrom = null; });
    grid.addEventListener('dragend', () => dragFrom = null);
  }
  function commitMusicTiming(source, report) {
    const file = source === 'file', startInput = $(file ? '#fileStartInput' : '#musicStartInput'), endInput = $(file ? '#fileEndInput' : '#musicEndInput');
    const start = parseClock(startInput.value), end = file && !endInput.value.trim() ? 0 : parseClock(endInput.value);
    const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= 0 && (file && end === 0 || end > start) && end <= 36000;
    startInput.setCustomValidity(''); endInput.setCustomValidity('');
    if (!valid) { endInput.setCustomValidity('กรอกเวลาเป็น นาที:วินาที และให้เวลาจบมากกว่าเวลาเริ่ม' + (file ? ' หรือเว้นเวลาจบว่างไว้' : '')); if (report) endInput.reportValidity(); return false; }
    const startKey = file ? 'fileStart' : 'musicStart', endKey = file ? 'fileEnd' : 'musicEnd';
    if (cfg[startKey] !== start || cfg[endKey] !== end) { cfg[startKey] = start; cfg[endKey] = end; changed(); }
    return true;
  }

  // Files for the web: the card page with this draft written into its card data, or one file that also carries every picture and song.
  function siteFile() {
    const json = JSON.stringify(cfg).replaceAll('<', '\\u003c');
    return siteHtml.replace(/(<script type="application\/json" id="card-data">)[\s\S]*?(<\/script>)/, (_, open, close) => open + json + close);
  }
  async function singleFile() {
    const html = siteFile().replaceAll('href="wishes.html"', 'href="' + new URL('wishes.html', SITE).href + '"');
    const inline = {};
    for (const path of new Set(html.match(/assets\/[\w.-]+/g) || [])) { const response = await fetch(path); if (!response.ok) throw Error('Missing ' + path); inline[path] = await toDataURL(await response.blob()); }
    return html.replace(/assets\/[\w.-]+/g, path => inline[path]);
  }
  function download(text, name) { const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  // Publishing: uploaded pictures, songs and videos become files under assets/uploads/, and the card page with
  // this draft is committed to the web branch (gh-pages) and to the project branch (main, under dist/) in one go.
  const GITHUB = { owner: 'tanawat09', repo: 'arm2027', targets: [{ branch: 'gh-pages', prefix: '' }, { branch: 'main', prefix: 'dist/' }] };
  const TOKEN_KEY = 'earn-arm-github-token';
  const readToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  async function github(path, token, options = {}) {
    const response = await fetch('https://api.github.com/repos/' + GITHUB.owner + '/' + GITHUB.repo + path, { ...options, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(Error(data?.message || 'GitHub ' + response.status), { status: response.status });
    return data;
  }
  async function checkToken(token) { const repo = await github('', token); if (!repo.permissions?.push) throw Error('token นี้ไม่มีสิทธิ์เขียน repo ' + GITHUB.repo); return repo; }
  function renderGithubState() {
    const token = readToken();
    $('#githubState').textContent = token ? 'เชื่อม GitHub แล้วในเครื่องนี้ กด “บันทึกขึ้นเว็บ” ได้เลย' : 'ยังไม่ได้เชื่อม ใส่ token ด้านล่างก่อนบันทึกขึ้นเว็บครั้งแรก';
    $('#githubState').classList.toggle('is-on', !!token); $('#githubForget').hidden = !token; $('#githubToken').value = '';
  }
  const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'video/webm': 'webm' };
  async function uploadPath(dataUrl) {
    const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl)));
    return 'assets/uploads/' + [...digest.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('') + '.' + (EXTENSIONS[mime] || 'bin');
  }
  // A copy of the draft where every uploaded file points at its path on the web, plus the files to send.
  async function publishedCopy() {
    const out = structuredClone(cfg), files = new Map();
    const swap = async value => { if (typeof value !== 'string' || !value.startsWith('data:')) return value; const path = await uploadPath(value); files.set(path, value.slice(value.indexOf(',') + 1)); return path; };
    for (const key of ['heroImage', 'storyImage', 'originalImage', 'music', 'video']) out[key] = await swap(out[key]);
    for (const photo of out.gallery || []) { photo.src = await swap(photo.src); delete photo.bytes; }
    return { out, files };
  }
  async function publish(progress) {
    const token = readToken();
    if (!token) { switchTab('share'); setView('edit'); $('#githubTitle').scrollIntoView({ block: 'start', behavior: 'smooth' }); throw Object.assign(Error('no-token'), { quiet: true }); }
    if (!commitMusicTiming(cfg.musicSource === 'youtube' ? 'youtube' : 'file', true)) throw Object.assign(Error('timing'), { quiet: true });
    progress('กำลังเตรียมไฟล์…');
    const { out, files } = await publishedCopy();
    const json = JSON.stringify(out).replaceAll('<', '\\u003c');
    const page = siteHtml.replace(/(<script type="application\/json" id="card-data">)[\s\S]*?(<\/script>)/, (_, open, close) => open + json + close);
    // Blobs belong to the whole repo, so each file is sent once and used on both branches.
    const blobs = new Map(); let sent = 0;
    for (const [path, base64] of files) { progress('กำลังอัปโหลดไฟล์ ' + (++sent) + ' / ' + files.size + '…'); blobs.set(path, (await github('/git/blobs', token, { method: 'POST', body: JSON.stringify({ content: base64, encoding: 'base64' }) })).sha); }
    const pageBlob = (await github('/git/blobs', token, { method: 'POST', body: JSON.stringify({ content: page, encoding: 'utf-8' }) })).sha;
    for (const target of GITHUB.targets) {
      progress('กำลังบันทึกลง ' + target.branch + '…');
      const head = (await github('/git/ref/heads/' + target.branch, token)).object.sha;
      const baseTree = (await github('/git/commits/' + head, token)).tree.sha;
      const tree = [{ path: target.prefix + 'index.html', mode: '100644', type: 'blob', sha: pageBlob }, ...[...blobs].map(([path, sha]) => ({ path: target.prefix + path, mode: '100644', type: 'blob', sha }))];
      const newTree = (await github('/git/trees', token, { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) })).sha;
      const commit = (await github('/git/commits', token, { method: 'POST', body: JSON.stringify({ message: 'Update the card from the owner page', tree: newTree, parents: [head] }) })).sha;
      await github('/git/refs/heads/' + target.branch, token, { method: 'PATCH', body: JSON.stringify({ sha: commit }) });
    }
    siteHtml = page; initial = structuredClone(out); publishedSnapshot = JSON.stringify(cfg);
    await saveDraft(); await savePublished(); renderStatus();
  }

  async function withButton(button, busyText, work) {
    const label = button.textContent; button.disabled = true; button.textContent = busyText;
    try { await work(); } catch { notify('เตรียมไฟล์ไม่สำเร็จ กรุณาลองใหม่เมื่ออินเทอร์เน็ตพร้อม'); } finally { button.disabled = false; button.textContent = label; }
  }

  // Personal invitation links: the cover greets the guest named in ?to=.
  function readBase() { try { return localStorage.getItem('earn-arm-site-base') || SITE; } catch { return SITE; } }
  function renderLinks() {
    const base = safeUrl($('#siteBase').value.trim()) || SITE;
    try { localStorage.setItem('earn-arm-site-base', base); } catch {}
    const names = $('#guestNames').value.split('\n').map(name => name.trim()).filter(Boolean);
    $('#guestLinks').replaceChildren(...names.map(name => {
      const url = new URL(base); url.searchParams.set('to', name);
      const row = document.createElement('div'); row.className = 'guest-link';
      const text = document.createElement('div'); const who = document.createElement('strong'); who.textContent = name; const link = document.createElement('small'); link.textContent = decodeURI(url.href); text.append(who, link);
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'small-button'; copy.textContent = 'คัดลอก'; copy.addEventListener('click', () => copyText(url.href, 'คัดลอกลิงก์ของ ' + name + ' แล้ว'));
      row.append(text, copy); return row;
    }));
    $('#copyAllLinks').hidden = names.length < 2;
  }
  async function copyText(text, done) { try { await navigator.clipboard.writeText(text); notify(done); } catch { notify('คัดลอกไม่ได้ กดค้างที่ลิงก์เพื่อคัดลอกเอง'); } }

  function setView(view) { document.body.dataset.view = view; $$('.admin-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view))); fitPreview(); }
  function setSize(size) { $('#previewStage').dataset.size = size; $$('.preview-size button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === size))); fitPreview(); }
  // The frame keeps a real phone or desktop width and is scaled down to fit the stage.
  function fitPreview() {
    const stage = $('#previewStage'); if (!stage.clientWidth) return;
    const [width, height] = stage.dataset.size === 'desktop' ? [1280, 800] : [390, 844];
    stage.style.setProperty('--frame-width', width + 'px'); stage.style.setProperty('--frame-height', height + 'px');
    stage.style.setProperty('--scale', String(Math.min(1, (stage.clientWidth - 32) / width, (stage.clientHeight - 32) / height)));
  }

  function bindEditor() {
    $$('[data-tab]').forEach(e => e.addEventListener('click', () => switchTab(e.dataset.tab)));
    $$('[data-field]').forEach(e => e.addEventListener('input', () => { const key = e.dataset.field; if (key === 'date' && !validDate(e.value) || key === 'start' && !e.value) return; cfg[key] = e.value; changed(); }));
    $('#demoCheck').addEventListener('change', e => { cfg.demo = e.target.checked; changed(); });
    bindGallery();
    $('#githubSave').addEventListener('click', e => withButton(e.currentTarget, 'กำลังตรวจ token…', async () => {
      const token = $('#githubToken').value.trim(); if (!token) { notify('วาง token ก่อนกดเชื่อม'); return; }
      try { await checkToken(token); } catch (error) { notify(error.status === 401 ? 'token ไม่ถูกต้องหรือหมดอายุ' : error.status === 404 ? 'token นี้เข้า repo ' + GITHUB.repo + ' ไม่ได้' : error.message); return; }
      try { localStorage.setItem(TOKEN_KEY, token); } catch { notify('เบราว์เซอร์นี้จำ token ไม่ได้'); return; }
      renderGithubState(); notify('เชื่อม GitHub แล้ว');
    }));
    $('#githubForget').addEventListener('click', () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} renderGithubState(); notify('เลิกเชื่อม GitHub ในเครื่องนี้แล้ว'); });
    $('#publishButton').addEventListener('click', async e => {
      const button = e.currentTarget, label = button.textContent; button.disabled = true;
      try { await publish(text => { button.textContent = text; $('#saveStatus').textContent = text; }); $('#saveStatus').textContent = 'บันทึกขึ้นเว็บแล้ว ✓ แขกจะเห็นภายใน 1–2 นาที'; notify('บันทึกขึ้นเว็บแล้ว แขกจะเห็นการ์ดใหม่ภายใน 1–2 นาที'); }
      catch (error) {
        if (error.message === 'no-token') notify('เชื่อม GitHub ก่อน แล้วกดบันทึกขึ้นเว็บอีกครั้ง');
        else if (!error.quiet) { $('#saveStatus').textContent = 'บันทึกขึ้นเว็บไม่สำเร็จ'; notify(error.status === 401 ? 'token หมดอายุหรือถูกยกเลิก กรุณาเชื่อม GitHub ใหม่' : 'บันทึกขึ้นเว็บไม่สำเร็จ: ' + error.message); }
      } finally { button.disabled = false; button.textContent = label; }
    });
    $('#musicUpload').addEventListener('change', async e => { const file = await readMedia(e.target, 'audio', 15); if (file) { cfg.music = file.url; cfg.musicName = file.name; cfg.musicSource = 'file'; changed(); notify('เพิ่มเพลงแล้ว แตะปุ่มเพลงในตัวอย่างเพื่อฟัง'); } });
    $('#resetMusic').addEventListener('click', () => { cfg.music = initial.music; cfg.musicName = initial.musicName; cfg.musicSource = 'file'; $('#musicUpload').value = ''; changed(); });
    $('#musicYoutubeInput').addEventListener('change', e => { const value = e.target.value.trim(); if (!youtubeId(value)) { e.target.setCustomValidity('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง'); e.target.reportValidity(); return; } e.target.setCustomValidity(''); cfg.musicYoutube = value; cfg.musicTitle = youtubeId(value) === 'WtcKJtwMD2E' ? 'ดาวหางฮัลเลย์ — fellow fellow' : 'เพลงของเรา · YouTube'; cfg.musicSource = 'youtube'; changed(); });
    $('#musicYoutubeInput').addEventListener('input', e => e.target.setCustomValidity(''));
    for (const source of ['youtube', 'file']) for (const id of source === 'file' ? ['fileStartInput', 'fileEndInput'] : ['musicStartInput', 'musicEndInput']) { const input = $('#' + id); input.addEventListener('input', () => commitMusicTiming(source, false)); input.addEventListener('change', () => commitMusicTiming(source, true)); }
    $('#musicLoopCheck').addEventListener('change', e => { cfg.musicLoop = e.target.checked; changed(); });
    $('#fileLoopCheck').addEventListener('change', e => { cfg.fileLoop = e.target.checked; changed(); });
    $('#previewYoutubeMusic').addEventListener('click', () => { if (!commitMusicTiming('youtube', true)) return; setView('preview'); sendPreview(true); });
    $('#youtubeInput').addEventListener('change', e => { const value = e.target.value.trim(); if (value && !youtubeId(value)) { e.target.setCustomValidity('กรุณาใส่ลิงก์วิดีโอ YouTube ที่ถูกต้อง'); e.target.reportValidity(); return; } e.target.setCustomValidity(''); cfg.youtube = value; if (value) { cfg.video = ''; cfg.videoName = ''; $('#videoUpload').value = ''; } changed(); });
    $('#youtubeInput').addEventListener('input', e => e.target.setCustomValidity(''));
    $('#videoUpload').addEventListener('change', async e => { const file = await readMedia(e.target, 'video', 30); if (file) { cfg.video = file.url; cfg.videoName = file.name; cfg.youtube = ''; $('#youtubeInput').value = ''; changed(); notify('เพิ่มวิดีโอแล้ว'); } });
    $('#removeVideo').addEventListener('click', () => { cfg.video = ''; cfg.videoName = ''; cfg.youtube = ''; $('#youtubeInput').value = ''; $('#videoUpload').value = ''; changed(); });
    $('#resetButton').addEventListener('click', () => { if (!confirm('ทิ้งร่างนี้แล้วกลับไปใช้ข้อมูลการ์ดบนเว็บ? ข้อความและสื่อที่แก้ไว้ในเบราว์เซอร์นี้จะหายไป')) return; cfg = structuredClone(initial); populateEditor(); changed(); });
    $('#downloadSite').addEventListener('click', e => withButton(e.currentTarget, 'กำลังเตรียมไฟล์…', async () => { if (!commitMusicTiming(cfg.musicSource === 'youtube' ? 'youtube' : 'file', true)) return; download(siteFile(), 'index.html'); notify('ดาวน์โหลด index.html แล้ว นำไปแทนไฟล์บนเว็บเพื่อให้แขกเห็นฉบับใหม่'); }));
    $('#downloadSingle').addEventListener('click', e => withButton(e.currentTarget, 'กำลังรวมรูปและเพลง…', async () => { download(await singleFile(), 'earn-arm-wedding-invitation.html'); notify('ดาวน์โหลดการ์ดไฟล์เดียวแล้ว เปิดได้แม้ไม่มีอินเทอร์เน็ต'); }));
    $('#siteBase').value = readBase(); $('#siteBase').addEventListener('change', renderLinks); $('#guestNames').addEventListener('input', renderLinks);
    $('#copyAllLinks').addEventListener('click', () => { const base = safeUrl($('#siteBase').value.trim()) || SITE; const lines = $('#guestNames').value.split('\n').map(n => n.trim()).filter(Boolean).map(name => { const url = new URL(base); url.searchParams.set('to', name); return name + ' ' + url.href; }); copyText(lines.join('\n'), 'คัดลอกลิงก์ทั้งหมดแล้ว'); });
    $('#sheetLink').href = SHEET; $('#scriptLink').href = SCRIPT;
    $('#logoutButton').addEventListener('click', () => { for (const store of [sessionStorage, localStorage]) try { store.removeItem('earn-arm-admin'); } catch {} location.replace('login.html'); });
    $$('.admin-switch button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $$('.preview-size button').forEach(b => b.addEventListener('click', () => setSize(b.dataset.size)));
    addEventListener('resize', fitPreview);
  }

  async function init() {
    try {
      siteHtml = await (await fetch('index.html', { cache: 'no-store' })).text();
      initial = JSON.parse(new DOMParser().parseFromString(siteHtml, 'text/html').querySelector('#card-data').textContent);
    } catch {
      $('#saveStatus').textContent = 'โหลดข้อมูลการ์ดไม่ได้ เปิดหน้านี้ผ่านเว็บ (http) ในโฟลเดอร์เดียวกับ index.html'; return;
    }
    cfg = structuredClone(initial);
    try {
      db = await initDB();
      publishedSnapshot = await new Promise(resolve => { const r = db.transaction('draft').objectStore('draft').get('published'); r.onsuccess = () => resolve(r.result || ''); r.onerror = () => resolve(''); });
      const saved = await new Promise((resolve, reject) => { const r = db.transaction('draft').objectStore('draft').get('current'); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
      if (saved && validDate(saved.date)) {
        cfg = { ...cfg, ...saved }; delete cfg.guestMode;
        if (saved.musicRevision !== initial.musicRevision) for (const key of ['music', 'musicName', 'musicSource', 'fileStart', 'fileEnd', 'fileLoop', 'musicRevision']) cfg[key] = initial[key];
      }
    } catch { db = null; }
    bindEditor(); populateEditor(); renderGithubState(); renderStatus(); renderLinks(); setSize('phone'); sendPreview();
    $('#saveStatus').textContent = db ? 'ร่างบันทึกอัตโนมัติในเบราว์เซอร์นี้' : 'เบราว์เซอร์นี้บันทึกร่างไม่ได้ ดาวน์โหลดไฟล์เพื่อเก็บงาน';
  }
  init();
})();
