@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 原生层自检（检查光标特效所需的 koffi 绑定是否正常）
echo.
node scripts\verify-native.cjs
echo.
pause
