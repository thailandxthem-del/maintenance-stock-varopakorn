# PROJECT RULES & CONSTRAINTS

## 🔒 กฎเหล็กประจำโปรเจกต์ (Ironclad Rule #1)
- **PRIMARY SYSTEM URL**: `https://they-customers-certification-scales.trycloudflare.com`
- ทุกการแก้ไข อัปเดต ปรับปรุงฟังก์ชัน หรือแก้ไขโค้ด **ต้องกระทำและแสดงผลในลิงก์นี้เท่านั้น**
- ห้ามเปลี่ยน URL หรือรันคำสั่งที่ทำให้ tunnel สร้าง URL ใหม่
- โปรเซส Tunnel (`task-973` หรือ cloudflared ไปยัง port 3000) ต้องได้รับการปกป้องและเปิดค้างไว้เสมอ
- เมื่อแก้ไขไฟล์ใน `public/` หรือ `server.js` โค้ดจะอัปเดตลงลิงก์นี้โดยตรงทันที
