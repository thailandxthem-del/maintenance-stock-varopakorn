@echo off
chcp 65001 >nul
title ปลดล็อค Windows Firewall สำหรับ Maintenance Stock System Port 3000
echo =========================================================================
echo    กำลังเปิดการเข้าถึง Port 3000 บน Windows Defender Firewall...
echo =========================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] กำลังขอสิทธิ์ Administrator (UAC Prompt)...
    powershell -Command "Start-Process cmd -ArgumentList '/c ""%~f0""' -Verb RunAs"
    exit /b
)

echo [+] ได้รับสิทธิ์ Administrator เรียบร้อย
echo [+] กำลังเพิ่มกฎ Inbound Firewall Rule สำหรับ Port 3000 (TCP)...

netsh advfirewall firewall delete rule name="Maintenance Stock System (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="Maintenance Stock System (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any

if %errorlevel% equ 0 (
    echo.
    echo =========================================================================
    echo [SUCCESS] เปิด Port 3000 บน Firewall สำเร็จเรียบร้อยแล้ว!
    echo.
    echo เครื่องอื่นๆ หรือมือถือที่ต่อ Wi-Fi / วง LAN เดียวกัน สามารถเข้าใช้งานได้ที่:
    echo   👉 http://140.140.1.51:3000
    echo =========================================================================
) else (
    echo.
    echo [ERROR] ไม่สามารถเพิ่มกฎ Firewall ได้ กรุณาตรวจสอบสิทธิ์ของท่าน
)

echo.
pause
