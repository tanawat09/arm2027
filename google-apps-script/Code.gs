/** Earn & Arm guestbook. Writes only to the spreadsheet configured below. */
const SETTINGS = Object.freeze({
  spreadsheetId: '1-zkWa1JVysEYSBg4mWLF6uIUvKdSEZSFIwWMOHwSwfk',
  sheetName: 'คำอวยพร Earn & Arm',
  testSheetName: 'ทดสอบการเชื่อมต่อ',
  allowedOrigins: [
    'https://ever-after-wedding-invitation-261026.tanawat-noi09.chatgpt.site',
    'http://127.0.0.1:4173'
  ],
  promptPayId: '0623452359',
  maxBytesPerFile: 5 * 1024 * 1024
});
const HEADERS = ['รหัสรายการ', 'เวลาส่ง (ไทย)', 'ชื่อผู้ร่วมอวยพร', 'ความสัมพันธ์', 'ข้อความอวยพร', 'รูปถ่าย (ส่วนตัว)', 'สลิป (ส่วนตัว)', 'หมายเลขพร้อมเพย์', 'สถานะ'];
const RELATIONS = ['เพื่อนเจ้าสาว', 'เพื่อนเจ้าบ่าว', 'ญาติฝ่ายเจ้าสาว', 'ญาติฝ่ายเจ้าบ่าว', 'เพื่อนร่วมงาน', 'แขกผู้มีเกียรติ'];

function doGet(event) {
  const params = event && event.parameter || {};
  if (params.action === 'ping') {
    try {
      validateOrigin_(params.origin);
      SpreadsheetApp.openById(SETTINGS.spreadsheetId).getId();
      return reply_({ ok: true, channel: 'earn-arm-guestbook', requestId: params.requestId, kind: 'health' }, params.origin);
    } catch (error) {
      return reply_({ ok: false, channel: 'earn-arm-guestbook', requestId: params.requestId, error: 'ระบบยังไม่พร้อมรับคำอวยพร กรุณาติดต่อคู่บ่าวสาว' }, params.origin);
    }
  }
  return HtmlService.createHtmlOutput('<!doctype html><html lang="th"><meta charset="utf-8"><title>Earn & Arm Guestbook</title><body style="font:16px sans-serif;padding:40px;color:#65402f;background:#fffaf4"><h1>Earn &amp; Arm</h1><p>ระบบรับคำอวยพรสำหรับการ์ดแต่งงาน</p><p>กรุณาเปิดแบบฟอร์มจากเว็บไซต์การ์ดเชิญ</p></body></html>');
}

function doPost(event) {
  let data = {};
  try {
    data = JSON.parse(event.parameter.payload || '{}');
    validateOrigin_(data.origin);
    validateSubmission_(data);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('ระบบกำลังรับคำอวยพรหลายรายการ กรุณาลองอีกครั้ง');
    try {
      const book = SpreadsheetApp.openById(SETTINGS.spreadsheetId);
      const sheet = getSheet_(book, data.isTest ? SETTINGS.testSheetName : SETTINGS.sheetName);
      const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(data.requestId).matchEntireCell(true).findNext() : null;
      if (!existing) {
        const photo = parseImage_(data.photo, 'รูปถ่าย');
        const slip = parseImage_(data.slip, 'สลิป');
        const folder = photo || slip ? getUploadFolder_() : null;
        const photoUrl = photo ? uploadFile_(photo, folder, data.requestId + '-photo') : '';
        const slipUrl = slip ? uploadFile_(slip, folder, data.requestId + '-slip') : '';
        sheet.appendRow([
          data.requestId,
          Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'),
          sheetText_(data.name.trim()),
          sheetText_(data.relation),
          sheetText_(data.message.trim()),
          photoUrl, slipUrl, "'" + SETTINGS.promptPayId,
          data.isTest ? 'ทดสอบระบบ' : 'รับคำอวยพรแล้ว'
        ]);
        SpreadsheetApp.flush();
      }
      return reply_({ ok: true, channel: 'earn-arm-guestbook', requestId: data.requestId, duplicate: Boolean(existing) }, data.origin);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    const safeErrors = ['กรุณากรอกชื่อให้ครบถ้วน', 'กรุณาเลือกความสัมพันธ์', 'กรุณากรอกข้อความอวยพร', 'ไฟล์แนบไม่ถูกต้อง', 'ไฟล์แนบมีขนาดเกิน 5 MB', 'ระบบกำลังรับคำอวยพรหลายรายการ กรุณาลองอีกครั้ง'];
    const message = safeErrors.indexOf(error.message) >= 0 ? error.message : 'ยังบันทึกคำอวยพรไม่สำเร็จ กรุณาลองใหม่ ข้อความของคุณยังอยู่ในฟอร์ม';
    console.error('Guestbook write failed: ' + error.message);
    return reply_({ ok: false, channel: 'earn-arm-guestbook', requestId: data.requestId, error: message }, data.origin);
  }
}

function setupGuestbook() {
  const book = SpreadsheetApp.openById(SETTINGS.spreadsheetId);
  getSheet_(book, SETTINGS.sheetName);
  getSheet_(book, SETTINGS.testSheetName);
  const folderId = getUploadFolder_();
  console.log('พร้อมรับคำอวยพรสำหรับ Earn & Arm แล้ว ไฟล์แนบเป็นส่วนตัวใน Drive ของเจ้าของ');
  return { spreadsheetId: book.getId(), uploadFolderId: folderId };
}

function validateOrigin_(origin) {
  if (SETTINGS.allowedOrigins.indexOf(origin) < 0) throw new Error('Origin not allowed');
}

function validateSubmission_(data) {
  if (!/^[a-f0-9-]{36}$/i.test(String(data.requestId || '')) || data.website) throw new Error('Invalid request');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100) throw new Error('กรุณากรอกชื่อให้ครบถ้วน');
  if (RELATIONS.indexOf(data.relation) < 0) throw new Error('กรุณาเลือกความสัมพันธ์');
  if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > 1500) throw new Error('กรุณากรอกข้อความอวยพร');
  if (data.consent !== true) throw new Error('Consent required');
  if (data.isTest !== undefined && typeof data.isTest !== 'boolean') throw new Error('Invalid test flag');
}

function sheetText_(value) {
  return /^[=+\-@\t\r]/.test(value.trimStart()) ? "'" + value : value;
}

function getSheet_(book, name) {
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#8f5b40').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, HEADERS.length, 180);
    sheet.setColumnWidth(5, 420);
    sheet.getRange('E:E').setWrap(true);
    sheet.getRange('H:H').setNumberFormat('@');
  } else {
    const actual = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (actual.join('|') !== HEADERS.join('|')) throw new Error('Unexpected sheet headers; refusing to overwrite existing data');
  }
  return sheet;
}

function parseImage_(dataUrl) {
  if (!dataUrl) return null;
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(SETTINGS.maxBytesPerFile * 4 / 3) + 100) throw new Error('ไฟล์แนบมีขนาดเกิน 5 MB');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('ไฟล์แนบไม่ถูกต้อง');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > SETTINGS.maxBytesPerFile) throw new Error('ไฟล์แนบมีขนาดเกิน 5 MB');
  const u = bytes.slice(0, 12).map(function (b) { return (b + 256) % 256; });
  const valid = match[1] === 'image/jpeg' ? u[0] === 255 && u[1] === 216 && u[2] === 255 : match[1] === 'image/png' ? u[0] === 137 && u[1] === 80 && u[2] === 78 && u[3] === 71 : String.fromCharCode.apply(null, u.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, u.slice(8, 12)) === 'WEBP';
  if (!valid) throw new Error('ไฟล์แนบไม่ถูกต้อง');
  return { bytes: bytes, mime: match[1], extension: match[1].split('/')[1].replace('jpeg', 'jpg') };
}

function getUploadFolder_() {
  const properties = PropertiesService.getScriptProperties();
  let id = properties.getProperty('EARN_ARM_UPLOAD_FOLDER');
  if (!id) {
    id = Drive.Files.create({ name: 'Earn & Arm — รูปและสลิป (ส่วนตัว)', mimeType: 'application/vnd.google-apps.folder' }).id;
    properties.setProperty('EARN_ARM_UPLOAD_FOLDER', id);
  }
  return id;
}

function uploadFile_(file, folder, name) {
  const metadata = { name: name + '.' + file.extension, mimeType: file.mime, parents: [folder] };
  const result = Drive.Files.create(metadata, Utilities.newBlob(file.bytes, file.mime, metadata.name), { fields: 'id,webViewLink' });
  return result.webViewLink || 'https://drive.google.com/file/d/' + result.id + '/view';
}

function reply_(result, origin) {
  const safeOrigin = SETTINGS.allowedOrigins.indexOf(origin) >= 0 ? origin : SETTINGS.allowedOrigins[0];
  const encoded = JSON.stringify(result).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><meta charset="utf-8"><body><script>window.top.postMessage(' + encoded + ',' + JSON.stringify(safeOrigin) + ');</script><p>' + (result.ok ? 'บันทึกคำอวยพรแล้ว' : 'ยังบันทึกไม่สำเร็จ') + '</p></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
