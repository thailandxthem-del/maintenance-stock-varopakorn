# ระบบบริหารจัดการ Stock อะไหล่และวัสดุงานซ่อมบำรุง
### (Maintenance Spare Parts Inventory Management System)
สำหรับห้องอะไหล่ช่าง (Tool Room) โรงงานอุตสาหกรรม

---

> [!IMPORTANT]
> ### 🔒 กฎเหล็กประจำโปรเจกต์ (Project Ironclad Rule)
> **ลิงก์หลักประจำระบบ (Primary Link):**  
> 👉 **https://they-customers-certification-scales.trycloudflare.com**  
> * ทุกการแก้ไข อัปเดต ปรับปรุงฟังก์ชัน หรือแก้ไขบักก์ **ต้องกระทำและแสดงผลในลิงก์นี้เท่านั้น**
> * ห้ามเปลี่ยนลิงก์หรือสร้างลิงก์ใหม่โดยพลการ ทุกอุปกรณ์จะใช้ลิงก์นี้เป็นมาตรฐานหลักร่วมกัน
> * โค้ดของระบบทั้งหมดเชื่อมโยงกับลิงก์นี้แบบ Real-time โดยตรง

---

## 🌟 ภาพรวมระบบ (System Overview)

Web Application นี้พัฒนาขึ้นเพื่อใช้เป็นระบบควบคุมและบริหารจัดการ Stock อะไหล่ วัสดุสิ้นเปลือง และเครื่องมือช่างสำหรับฝ่ายซ่อมบำรุงในโรงงานอุตสาหกรรม โดยนำเข้าข้อมูลจริงจากไฟล์ Excel:
1. `C:\Users\thail\Desktop\Stock tool room\รายการอะไหล่ Tool Room 2022 (2).xlsx` (อะไหล่ 346+ รายการ)
2. `C:\Users\thail\Desktop\Stock tool room\รายการอะไหล่_เครื่องมือช่าง.xlsx` (เครื่องมือ 31 รายการ)

รวมทั้งสิ้น **376 รายการ** พร้อมกำหนดตำแหน่งจัดเก็บในโรงงาน (Zone, Rack, Shelf, Bin) ผูกข้อมูลเครื่องจักร (CNC, Press, Air Compressor, Overhead Crane, Workshop) และตั้งค่า Min / Max / Reorder Point ไว้อย่างสมบูรณ์

---

## 🚀 วิธีการเปิดใช้งาน (How to Run)

### วิธีที่ 1: ดับเบิลคลิกไฟล์ `start.bat`
เพียงเข้าไปที่โฟลเดอร์:
`C:\Users\thail\.gemini\antigravity\scratch\maintenance-stock-system\`
แล้วดับเบิลคลิกไฟล์ **`start.bat`** ระบบจะเปิด Browser ไปที่ `http://localhost:3000` โดยอัตโนมัติ

### วิธีที่ 2: รันผ่าน Command Line
```bash
cd C:\Users\thail\.gemini\antigravity\scratch\maintenance-stock-system
node server.js
```
เปิดเบราว์เซอร์ไปที่: **`http://localhost:3000`**

---

## 🛠️ สรุปฟังก์ชันการทำงานครบทั้ง 22 ข้อกำหนด (Feature Highlights)

1. **User Roles & Granular Permissions (ข้อ 1)**:
   - สลับบทบาทได้ทันทีจากเมนูมุมขวาบน:
     - **Store (เจ้าหน้าที่สโตร์)**: รับเข้า, เบิกจ่าย, คืนอะไหล่, ตรวจนับสต็อก
     - **Maintenance Engineer (วิศวกรซ่อมบำรุง)**: วิเคราะห์การใช้, อะไหล่วิกฤต, เสนอแนะสั่งซื้อ (Purchase Recommendation)
     - **Admin (ผู้ดูแลระบบ)**: สิทธิ์สูงสุด จัดการ Master Data, ผู้ใช้งาน, และ Audit Log
2. **Real-time Dashboard & 5 Charts (ข้อ 2)**:
   - 9 การ์ดสรุป KPI (อะไหล่ทั้งหมด, สต็อกปกติ, ต่ำกว่า Min, Stock=0, Critical, รับเข้า/เบิกจ่ายเดือนนี้, มูลค่ารวมทั้งคลัง)
   - 5 กราฟวิเคราะห์แบบโต้ตอบ:
     1. Stock Movement รายวัน/รายเดือน (In vs Out)
     2. Top 10 อะไหล่ที่ถูกเบิกมากที่สุด
     3. สัดส่วนอะไหล่ตามหมวดหมู่ (Category Donut)
     4. อะไหล่ที่ต่ำกว่า Min (Deficit Chart)
     5. มูลค่าสต็อกแยกตาม Category
3. **Spare Parts Master Database (ข้อ 3)**:
   - ตารางอะไหล่ 376 รายการ ค้นหาได้หลายมิติ (Part No, ชื่อ, เครื่องจักร, ยี่ห้อ, ตำแหน่งจัดเก็บ)
   - Badge สีสถานะสต็อก: ปกติ (เขียว), สต็อกต่ำ (เหลือง), จุดสั่งซื้อ (ส้ม), หมดสต็อก (แดงกะพริบ)
   - ปุ่มพิมพ์ป้าย QR Code และ Barcode ติดหน้าชั้นวาง
4. **Stock In — รับอะไหล่เข้า (ข้อ 4)**:
   - คำนวณมูลค่ารวมอัตโนมัติ อัปเดต `CurrentStock = CurrentStock + Qty` พร้อมบันทึก Ledger และ Audit Log ทันที
5. **Stock Issue — เบิกอะไหล่ (ข้อ 5)**:
   - รองรับประเภทงานซ่อม: PM, BM, CM, PdM, Kaizen
   - **กฎเหล็ก**: ห้ามเบิกเกินยอดคงเหลือโดยเด็ดขาด พร้อมแจ้งเตือนหากเบิกแล้วทำให้สต็อกต่ำกว่า Min
6. **Spare Parts Return — รับคืนอะไหล่ (ข้อ 6)**:
   - ตรวจสอบสภาพ: หากเป็น *New / Good / Used* จะเพิ่มยอดสต็อกใช้งาน แต่หากเป็น *Damaged / Scrap* จะไม่เพิ่มยอดคงเหลือ (แยกกักกันเพื่อตัดทิ้ง)
7. **Stock Adjustment — ปรับปรุงยอด (ข้อ 7)**:
   - ปรับปรุงยอดกรณีตรวจนับ, สูญหาย, เสียหาย, หรือพบเกิน พร้อมบันทึกผู้อนุมัติและเหตุผล
8. **Stock Movement Ledger (ข้อ 8)**:
   - บัญชีคุมการเคลื่อนไหวสต็อก (In, Out, Return, Adjustment) พร้อมตัวกรองครบวงจร และปุ่ม Export Excel (.xlsx)
9. **Minimum / Maximum / Reorder Point (ข้อ 9)**:
   - คำนวณสถานะสต็อกและแสดงผลด้วย Badge ชัดเจน
10. **Automatic Stock Alerts (ข้อ 10)**:
    - ศูนย์แจ้งเตือนอัจฉริยะ (Critical Spare=0 แจ้งเตือนระดับ P1, อะไหล่หมด, อะไหล่ต่ำกว่า Min)
11. **Purchase Recommendation — ระบบเสนอแนะการสั่งซื้อ (ข้อ 11)**:
    - คำนวณจำนวนที่ควรสั่งจาก Average Monthly Usage, Lead Time, Min/Max และจำแนก Priority (Critical, High, Medium, Low) พร้อมปุ่มสร้างใบขอซื้อ (Purchase Proposal) ส่งออกเป็น Excel ได้ทันที
12. **Spare Parts Usage Analytics (ข้อ 12)**:
    - วิเคราะห์ Top 10 Most Used, Top 10 Highest Cost, สถิติการเบิกแยกตามเครื่องจักร และประเภทงานซ่อม
    - KPI ด้าน Stock Turnover Ratio, Stock Accuracy, และ Stock-out Rate
13. **Machine-wise Spare Parts (ข้อ 13)**:
    - เลือกเครื่องจักร (เช่น M-001 CNC, M-002 Stamping, M-003 Compressor) เพื่อดูอะไหล่และประวัติการเบิกใช้ของเครื่องจักรนั้นๆ
14. **Critical Spare Management (ข้อ 14)**:
    - ติดตามอะไหล่ที่มีผลต่อการหยุดสายการผลิต พร้อมแบนเนอร์แจ้งเตือนสีแดงหากมีอะไหล่วิกฤตชิ้นใดหมดสต็อก
15. **Barcode / QR Code System (ข้อ 15)**:
    - มีตัวสร้าง QR Code และหน้าสแกนเนอร์จำลอง พร้อมปุ่ม Quick Actions (รับเข้า, เบิกจ่าย, คืนอะไหล่, ดูประวัติ) ในคลิกเดียว
16. **Location Management (ข้อ 16)**:
    - แผนผังจำลอง Tool Room (Zone A, B, C, D & Rack R01-R09 & Shelf S01-S05) คลิกดูของในชั้นวางได้
17. **Physical Stock Count (ข้อ 17)**:
    - ระบบตรวจนับสต็อกแบบ Cycle Count คำนวณผลต่าง (Variance) และกดปรับยอดอัตโนมัติ (Auto-Reconcile)
18. **13 Exportable Reports (ข้อ 18)**:
    - รวมรายงาน 13 ฉบับ ส่งออกเป็น Excel (.xlsx) และสั่งพิมพ์ PDF ได้
19. **Global Search (ข้อ 19)**:
    - กดคีย์ลัด `Ctrl + K` เพื่อค้นหาอะไหล่ เครื่องจักร หรือสถานที่จัดเก็บได้จากทุกหน้าจอ
20. **Audit Log Trail (ข้อ 20)**:
    - บันทึกประวัติการกระทำทั้งหมด ไม่มีการลบข้อมูลย้อนหลัง
21. **Factory-Grade Responsive UI (ข้อ 21)**:
    - รองรับการเปิดใช้งานบนคอมพิวเตอร์ตั้งโต๊ะและ Tablet ของช่างในห้องสโตร์
22. **Real Factory Data Integration (ข้อ 22)**:
    - บรรจุข้อมูลจริงจากโฟลเดอร์ `Stock tool room` ของผู้ใช้เรียบร้อย 100%
