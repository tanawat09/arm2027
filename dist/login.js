'use strict';
// Owner login. The page has no server, so this only keeps casual visitors out of admin.html:
// the typed password is hashed with the salt in admin-auth.js and compared with the stored hash.
(() => {
  const auth = window.EARN_ARM_ADMIN_AUTH, KEY = 'earn-arm-admin', $ = s => document.querySelector(s);
  let failures = 0;
  const store = remember => { try { return remember ? localStorage : sessionStorage; } catch { return null; } };
  const signedIn = () => { try { return !!auth && [sessionStorage, localStorage].some(s => s.getItem(KEY) === auth.hash); } catch { return false; } };
  const next = () => location.replace('admin.html');

  if (!auth) { $('#loginForm').hidden = true; $('#loginSetup').hidden = false; return; }
  if (signedIn()) { next(); return; }

  async function hash(password) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
    const salt = Uint8Array.from(atob(auth.salt), c => c.charCodeAt(0));
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: auth.iterations }, key, 256);
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  }
  function showError(message) { $('#loginError').textContent = message; $('#loginError').hidden = !message; }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const password = $('#password').value; if (!password) { showError('กรุณาใส่รหัสผ่าน'); return; }
    const button = $('#loginButton'); button.disabled = true; button.textContent = 'กำลังตรวจรหัสผ่าน…'; showError('');
    try {
      if (await hash(password) === auth.hash) {
        store($('#remember').checked)?.setItem(KEY, auth.hash);
        next(); return;
      }
      failures++;
      // Each wrong try waits a little longer before the form can be used again.
      await new Promise(resolve => setTimeout(resolve, Math.min(failures, 5) * 800));
      showError('รหัสผ่านไม่ถูกต้อง'); $('#password').select();
    } catch { showError('เบราว์เซอร์นี้ตรวจรหัสผ่านไม่ได้ กรุณาเปิดผ่าน https หรือใช้เบราว์เซอร์อื่น'); }
    finally { button.disabled = false; button.textContent = 'เข้าสู่หลังบ้าน'; }
  });
})();
