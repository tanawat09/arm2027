# Earn & Arm Guestbook backend

เตรียมโปรเจกต์ที่ผูกกับ Google Sheet เดิมไว้แล้ว:
https://script.google.com/u/0/home/projects/1DEpL6LbP3lzOOUHTaHgENi-xImPTYFa5wBAgvTerzoBSU0LOyj7uSaw5/edit

## เปิดใช้งาน

1. โค้ดใน `Code.gs` และ `appsscript.json` ต้องตรงกับโปรเจกต์ Google
2. เปิดใช้งานเป็น Web app โดยทำงานในนามเจ้าของ และรับข้อมูลจากทุกคน
3. เจ้าของต้องอนุญาต Google Sheets และ `drive.file` ก่อนรับข้อมูลจริง
4. ใส่ URL `/exec` ที่ได้รับลง `dist/guestbook-config.js` ในค่า `endpoint` แล้วเผยแพร่ Site ใหม่
5. ทดสอบหน้า `/wishes.html?test=1` และตรวจรายการในแท็บ **ทดสอบการเชื่อมต่อ** แยกจากคำอวยพรจริง

Google ขอ scope Sheets ทั้งหมดเพราะ web app ใช้ `openById` แต่โค้ดกำหนด ID ของชีตปลายทางตายตัว ไม่อ่านหรือเขียนชีตอื่น การใช้ `getActiveSpreadsheet` ของ bound script ไม่รองรับเมื่อทำงานเป็น web app

ไฟล์แนบสร้างผ่าน Advanced Drive API v3 โดยใช้ `drive.file` เท่านั้น ไม่เปิดสิทธิ์สาธารณะ ไม่ขอ Gmail หรือ Drive ทั้งหมด ชื่อและข้อความเก็บใน **คำอวยพร Earn & Arm** พร้อมลิงก์ไฟล์ส่วนตัว

Client ส่งแบบฟอร์มผ่าน iframe และรอ `postMessage` จาก Google ที่มี request ID ตรงกัน Backend ตอบสำเร็จหลัง append และ flush เท่านั้น ไม่มีการใช้ fetch แบบ no-cors แล้วอ้างว่าสำเร็จ

Backend ป้องกันการกดส่งซ้ำด้วย request ID/ScriptLock ตรวจชนิดไฟล์และ signature จำกัดไฟล์ละ 5 MB และป้องกันข้อความถูกตีความเป็นสูตรใน Sheet

ตราบใดที่ `endpoint` ว่าง หน้าเว็บจะปิดการส่ง พร้อมให้ดูโปสการ์ดตัวอย่าง โดยไม่อ้างว่าบันทึกคำอวยพรแล้ว

## สถานะที่ยืนยันแล้ว

- ผู้ใช้อนุญาตเปิดเว็บรับข้อมูลและให้สิทธิ์ Google เมื่อวันที่ 26 ตุลาคม 2569
- Endpoint ที่ใช้งาน: https://script.google.com/macros/s/AKfycbz4mO6i_FcfiA9omLkbyRVZoYzcFA8A62XuyfaZqxQhoRrbfMxhgEoEMRb39dA9LIvz/exec
- ทดสอบชื่อ ข้อความ รูป และไฟล์แนบเข้าชีตจริงในแท็บทดสอบแล้ว รายการทดสอบแยกจากข้อมูลแขก ไม่มีการโอนเงิน
- ตรวจสิทธิ์ไฟล์แนบจริงผ่าน Google Drive พบว่าเป็นส่วนตัวสำหรับเจ้าของเท่านั้น
- ใช้ QR รับเงินฉบับธนาคารที่ผู้ใช้ส่งภายหลัง แทน QR ที่สร้างขึ้น และอ่านรหัสได้ว่าตรงกับหมายเลขพร้อมเพย์เดิม
- Google Apps Script เวอร์ชัน 2 เผยแพร่วันที่ 27 ตุลาคม 2569 แก้การเก็บหมายเลขพร้อมเพย์ให้เป็นข้อความครบ 10 หลัก ยืนยันจากแถวทดสอบจริงแล้ว
- `setupGuestbook` ทำงานสำเร็จและเตรียมแท็บคำอวยพรจริงแล้ว เก็บรายการทดสอบ 2 แถวแยกไว้ในแท็บทดสอบ
