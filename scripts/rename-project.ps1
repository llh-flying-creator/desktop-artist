<#
.SYNOPSIS
    将项目文件夹重命名为 desktop-artist，并重建桌面快捷方式。

.DESCRIPTION
    必须在关闭 VS Code（或关闭其中的该文件夹）之后运行，否则会因目录被占用而失败：
        另一个进程正在使用此文件，因此该进程无法访问此文件。

    重命名后请在新路径重新打开工作区：
        D:\HuaweiMoveData\Users\19870\Desktop\desktop-artist
#>

$ErrorActionPreference = 'Stop'

$src = Split-Path -Parent $PSScriptRoot          # 项目根目录（本脚本位于 <项目>/scripts 下）
$parent = Split-Path -Parent $src
$dst = Join-Path $parent 'desktop-artist'

Write-Host "源目录：$src"
Write-Host "目标  ：$dst"
Write-Host ""

if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "[失败] 源目录不存在。" -ForegroundColor Red
    exit 1
}

if ((Split-Path -Leaf $src) -eq 'desktop-artist') {
    Write-Host "[跳过] 该文件夹已经是 desktop-artist 了。" -ForegroundColor Yellow
    exit 0
}

if (Test-Path -LiteralPath $dst) {
    Write-Host "[跳过] 目标目录已存在：$dst" -ForegroundColor Yellow
    exit 1
}

# 切到父目录，确保当前工作目录不在被重命名的目录里
Set-Location -LiteralPath $parent

try {
    Rename-Item -LiteralPath $src -NewName 'desktop-artist' -ErrorAction Stop
    Write-Host "[完成] 已改名为 desktop-artist" -ForegroundColor Green
} catch {
    Write-Host "[失败] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "       请先关闭 VS Code 中的该文件夹（或退出 VS Code），然后重新运行本脚本。" -ForegroundColor Yellow
    exit 1
}

# 快捷方式记录的是绝对路径，目录变了必须重建
$shortcutScript = Join-Path $dst 'scripts\create-shortcut.ps1'
if (Test-Path -LiteralPath $shortcutScript) {
    Write-Host ""
    Write-Host "正在重建桌面快捷方式..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File $shortcutScript
}

# 开机自启的计划任务若已存在，同样需要指向新路径
$task = schtasks /Query /TN "DesktopUIBeautify" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "检测到已注册的开机自启任务，正在更新为新路径..." -ForegroundColor Yellow
    $exe = Join-Path $dst 'release\win-unpacked\桌面UI美化.exe'
    if (Test-Path -LiteralPath $exe) {
        schtasks /Create /TN "DesktopUIBeautify" /TR "`"$exe`" --hidden" /SC ONLOGON /RL HIGHEST /F | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[完成] 自启任务已指向新路径。" -ForegroundColor Green
        } else {
            Write-Host "[提示] 更新自启任务失败（需要管理员权限），请以管理员身份重新运行本脚本。" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "全部完成。请在 VS Code 中重新打开：$dst" -ForegroundColor Green
