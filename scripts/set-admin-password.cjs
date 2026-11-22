#!/usr/bin/env node
// Sets the owner-page password. Only a salted PBKDF2 hash is written to dist/admin-auth.js; the password itself is never stored.
// Usage: node scripts/set-admin-password.cjs        (asks twice, typing is hidden)
//        node scripts/set-admin-password.cjs --clear (removes the password; the login page then says none is set)
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const target = path.join(__dirname, '..', 'dist', 'admin-auth.js');
const ITERATIONS = 310000;
const write = auth => fs.writeFileSync(target, '// Written by scripts/set-admin-password.cjs. Holds only a salted hash, never the password.\nwindow.EARN_ARM_ADMIN_AUTH = ' + JSON.stringify(auth) + ';\n');

function ask(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let value = ''; stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = key => {
      if (key === '\u0003') process.exit(1);
      if (key === '\r' || key === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(value); return; }
      if (key === '\u007f') value = value.slice(0, -1); else value += key;
    };
    stdin.on('data', onData);
  });
}
let asked = 0, piped = null;
async function read(question) {
  if (process.stdin.isTTY) return ask(question);
  piped ??= await new Promise(resolve => { let data = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => data += c); process.stdin.on('end', () => resolve(data.split(/\r?\n/))); });
  process.stdout.write(question + '\n'); return piped[asked++] || '';
}

(async () => {
  if (process.argv.includes('--clear')) { write(null); console.log('ลบรหัสผ่านหลังบ้านแล้ว'); return; }
  const password = await read('ตั้งรหัสผ่านหลังบ้าน (อย่างน้อย 10 ตัวอักษร): ');
  if (password.length < 10) { console.error('รหัสผ่านสั้นเกินไป ต้องมีอย่างน้อย 10 ตัวอักษร'); process.exit(1); }
  if (await read('พิมพ์รหัสผ่านอีกครั้ง: ') !== password) { console.error('รหัสผ่านสองครั้งไม่ตรงกัน'); process.exit(1); }
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.pbkdf2Sync(password.normalize('NFC'), Buffer.from(salt, 'base64'), ITERATIONS, 32, 'sha256').toString('base64');
  write({ salt, iterations: ITERATIONS, hash });
  console.log('ตั้งรหัสผ่านแล้ว บันทึกเฉพาะค่า hash ใน dist/admin-auth.js');
})();
