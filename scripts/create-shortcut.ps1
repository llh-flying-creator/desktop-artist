<#
.SYNOPSIS
    在桌面创建/更新「桌面UI美化」快捷方式。

.DESCRIPTION
    1. 目标指向打包产物 release\win-unpacked\桌面UI美化.exe
    2. 图标使用 build\icon.ico（即使 exe 内嵌图标写入失败也能保证桌面图标正确）
    3. 写入「以管理员身份运行」标志位，因为系统级 UI 注入需要管理员权限

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\create-shortcut.ps1
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'release\win-unpacked\桌面UI美化.exe'
$ico = Join-Path $root 'build\icon.ico'
$shortcutName = '桌面UI美化.lnk'

if (-not (Test-Path $exe)) {
    Write-Host "[shortcut] 未找到 $exe" -ForegroundColor Red
    Write-Host "[shortcut] 请先执行打包：npx electron-builder --win --dir" -ForegroundColor Yellow
    exit 1
}

# 桌面路径通过系统 API 获取，兼容 OneDrive / 自定义重定向的桌面
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop $shortcutName

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $exe
$link.WorkingDirectory = Split-Path -Parent $exe
$link.Description = '桌面UI美化 - 任务栏 / 窗口 / 光标 / 主题一键美化'
if (Test-Path $ico) {
    $link.IconLocation = "$ico,0"
}
$link.Save()

# 程序以普通权限运行（asInvoker），不需要「以管理员身份运行」标志：
# 该位为 1 时双击仍会触发 UAC，因此这里显式清除（.lnk 偏移 0x15 的 bit5）
try {
    $bytes = [System.IO.File]::ReadAllBytes($linkPath)
    if (($bytes[0x15] -band 0x20) -ne 0) {
        $bytes[0x15] = $bytes[0x15] -band 0xDF
        [System.IO.File]::WriteAllBytes($linkPath, $bytes)
    }
} catch {
    # 忽略：标志位写失败不影响使用
}

Write-Host "[shortcut] 已创建：$linkPath"
Write-Host "[shortcut] 目标  ：$exe"
