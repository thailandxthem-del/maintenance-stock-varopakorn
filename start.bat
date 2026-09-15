@echo off
title Maintenance Spare Parts Inventory Management System
echo ======================================================================
echo    Starting Maintenance Spare Parts Inventory Management System
echo    ระบบบริหารจัดการ Stock อะไหล่และวัสดุงานซ่อมบำรุง
echo ======================================================================
echo.
echo [1] เปิดบนเครื่องนี้ (Local):        http://localhost:3000
echo [2] ลิงก์สำหรับเครื่องอื่นในโรงงาน (LAN/Wi-Fi): http://140.140.1.51:3000
echo.
echo * ระบบมี Real-time Live Sync: เมื่อมีการบันทึกเบิก/รับเข้า
echo   ทุกเครื่องที่เปิดเว็บอยู่จะอัปเดตข้อมูลตรงกันแบบ Real-time ทันที!
echo ======================================================================
echo.
cd /d "%~dp0"
start http://localhost:3000
node server.js
pause
