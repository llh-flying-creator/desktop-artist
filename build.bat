@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   桌面UI美化 - 一键打包
echo ============================================
echo.

echo [1/7] 检查依赖...
if not exist "node_modules" (
  echo   未安装依赖，正在执行 npm install ...
  call npm install --no-audit --no-fund || goto :error
) else (
  echo   依赖已就绪
)

echo.
echo [2/7] 生成应用图标...
where python >nul 2>nul
if %errorlevel%==0 (
  python scripts\make-icon.py || echo   图标生成失败，将使用已有图标
) else (
  echo   未检测到 python，跳过图标生成
)

echo.
echo [3/7] 类型检查（严格模式）...
call npm run typecheck || goto :error

echo.
echo [4/7] 构建产物...
call npx electron-vite build || goto :error

echo.
echo [5/7] 打包为 exe ...
call npx electron-builder --win --x64 %*
if errorlevel 1 (
  echo.
  echo   注意：electron-builder 返回了非 0 状态码。
  echo   若日志中出现 "Cannot create symbolic link / 客户端没有所需的特权"，
  echo   那是解压 winCodeSign 时缺少符号链接权限所致（不影响 Windows 产物），
  echo   后续步骤会自动补上图标，可继续。
)

echo.
echo [6/7] 兜底写入 exe 图标与版本信息...
call node scripts\fix-exe-resources.cjs

echo.
echo [7/7] 创建桌面快捷方式...
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\create-shortcut.ps1

echo.
echo ============================================
echo   打包完成！
echo   安装包位置： %cd%\release
echo   主程序名：   桌面UI美化.exe（需管理员权限运行）
echo   桌面快捷方式已创建，可直接双击启动。
echo ============================================
pause
exit /b 0

:error
echo.
echo [失败] 构建过程中出现错误，请查看上方日志。
pause
exit /b 1
