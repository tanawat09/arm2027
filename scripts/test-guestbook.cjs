const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rows = [], driveCalls = [], sheets = new Map(), properties = new Map();
let failWrite = false;
const makeRange = () => ({
  setValues(values) { rows.splice(0, 1, values[0]); return this; },
  getValues: () => [rows[0]],
  setBackground() { return this; }, setFontColor() { return this; }, setFontWeight() { return this; }, setWrap() { return this; }, setNumberFormat() { return this; },
  createTextFinder(value) { return { matchEntireCell() { return this; }, findNext: () => rows.slice(1).some(row => row[0] === value) ? {} : null }; }
});
const sheet = { getLastRow: () => rows.length, getRange: makeRange, setFrozenRows() {}, setColumnWidths() {}, setColumnWidth() {}, appendRow(row) { if (failWrite) throw Error('Write failed'); rows.push(row); } };
const book = { getId: () => 'target-sheet', getSheetByName: name => sheets.get(name), insertSheet(name) { sheets.set(name, sheet); return sheet; } };
const context = vm.createContext({
  console: { error() {}, log() {} }, Date,
  SpreadsheetApp: { openById(id) { assert.equal(id, '1-zkWa1JVysEYSBg4mWLF6uIUvKdSEZSFIwWMOHwSwfk'); return book; }, flush() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
  Drive: { Files: { create(metadata) { driveCalls.push(metadata); assert.equal(metadata.permissions, undefined); return { id: metadata.parents ? 'private-file' : 'private-folder', webViewLink: metadata.parents ? 'https://drive.google.com/file/d/private-file/view' : undefined }; } } },
  Utilities: { formatDate: () => '2026-10-26 22:30:00', base64Decode: value => [...Buffer.from(value, 'base64')], newBlob: bytes => bytes },
  HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }, createHtmlOutput: html => ({ html, setXFrameOptionsMode() { return this; } }) }
});
vm.runInContext(fs.readFileSync('google-apps-script/Code.gs', 'utf8'), context);
const data = { requestId: '12345678-1234-1234-1234-123456789abc', origin: 'http://127.0.0.1:4173', name: '=IMPORTXML("https://example.com")', relation: 'เพื่อนเจ้าสาว', message: 'ขอให้มีความสุขมาก ๆ', consent: true, photo: '', slip: '', isTest: true };
const send = payload => { const result = context.doPost({ parameter: { payload: JSON.stringify(payload) } }); return JSON.parse(result.html.match(/postMessage\((\{.*\}),"http/)[1]); };
assert.equal(send(data).ok, true);
assert.equal(rows.length, 2);
assert.equal(rows[1][2][0], "'", 'Untrusted text must not become a spreadsheet formula');
assert.equal(send(data).duplicate, true);
assert.equal(rows.length, 2, 'A retried request must not append twice');
assert.equal(send({ ...data, requestId: '22345678-1234-1234-1234-123456789abc', message: '' }).ok, false);
assert.equal(rows.length, 2);
assert.equal(send({ ...data, requestId: '32345678-1234-1234-1234-123456789abc', photo: 'data:image/png;base64,SGVsbG8=' }).ok, false, 'Forged MIME types must be rejected');
failWrite = true;
assert.equal(send({ ...data, requestId: '42345678-1234-1234-1234-123456789abc' }).ok, false, 'A failed write must never report success');
failWrite = false;
const image = 'data:image/jpeg;base64,' + fs.readFileSync('dist/assets/promptpay-bank-original.jpg').toString('base64');
assert.equal(send({ ...data, requestId: '52345678-1234-1234-1234-123456789abc', photo: image, slip: image }).ok, true);
assert.equal(rows[2][5], 'https://drive.google.com/file/d/private-file/view');
assert.equal(rows[2][6], 'https://drive.google.com/file/d/private-file/view');
assert.equal(driveCalls.filter(call => call.parents).length, 2);
assert.equal(rows[2][7], "'0623452359", 'Keep the leading zero when Sheets parses appended rows');
assert.equal(rows[2][8], 'ทดสอบระบบ');
console.log('Passed: valid submission, duplicate retry, formula protection, required fields, image signature validation, write-failure handling, private photo/slip references and target sheet.');
