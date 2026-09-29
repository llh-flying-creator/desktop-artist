@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   桌面UI美化 - 开发模式（热重载）
echo ============================================
echo.

if not exist "node_modules" (
  echo 正在安装依赖...
  call npm install --no-audit --no-fund || goto :error
)

echo 正在启动开发服务器...
call npx electron-vite dev
exit /b 0

:error
echo 依赖安装失败，请检查网络或 npm 配置。
pause
exit /b 1
