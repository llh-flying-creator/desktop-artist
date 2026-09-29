/**
 * 打包产物兜底修复：写入应用图标与版本信息
 *
 * 【为什么需要这个脚本】
 * electron-builder 在 Windows 上依赖 winCodeSign 包内的 rcedit 来修改 exe 资源。
 * 若系统未开启「开发者模式」，解压 winCodeSign 时会因无法创建符号链接而报错：
 *     ERROR: Cannot create symbolic link : 客户端没有所需的特权
 * 该步骤失败会导致 rcedit 被跳过，产出的 exe 沿用 Electron 默认图标。
 *
 * 此外，在部分目录（如被安全软件托管的盘符）下，rcedit 直接原地重写会报
 *     Fatal error: Unable to commit changes
 * 因此这里采用「复制到临时目录 → 修改副本 → 覆盖回原位」的方式规避。
 *
 * 运行：node scripts/fix-exe-resources.cjs
 * 幂等：重复执行安全，已修复的 exe 会被再次写入同样的资源。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const UNPACKED_DIR = path.join(ROOT, 'release', 'win-unpacked');
const ICON = path.join(ROOT, 'build', 'icon.ico');

const COMPANY = 'DesktopUIBeautify';
const PRODUCT = 'Desktop UI Beautify';
const FILE_VERSION = '1.0.0.0';
/**
 * 必须与 electron-builder.yml 中 win.requestedExecutionLevel 保持一致。
 * 本程序只做光标覆盖层，不需要系统级注入，因此使用 asInvoker：
 * 双击即启动，不会弹 UAC。
 */
const EXECUTION_LEVEL = 'asInvoker';
/** 从 manifest 中读取当前提权级别，判断是否需要写入 */
function readExecutionLevel(exe) {
  try {
    const text = fs.readFileSync(exe).toString('utf8');
    const match = text.match(/requestedExecutionLevel\s+level="(\w+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const log = (msg) => console.log(`[fix-resources] ${msg}`);

/** 在 electron-builder 缓存中查找 rcedit */
function findRcedit() {
  const cacheRoot = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
  if (!fs.existsSync(cacheRoot)) return null;
  for (const entry of fs.readdirSync(cacheRoot)) {
    for (const name of ['rcedit-x64.exe', 'rcedit-ia32.exe']) {
      const candidate = path.join(cacheRoot, entry, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** 找到 win-unpacked 下体积最大的 exe（即主程序） */
function findTargetExe() {
  if (!fs.existsSync(UNPACKED_DIR)) return null;
  let best = null;
  for (const name of fs.readdirSync(UNPACKED_DIR)) {
    if (!name.toLowerCase().endsWith('.exe')) continue;
    const full = path.join(UNPACKED_DIR, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (!best || stat.size > best.size) best = { full, size: stat.size };
  }
  return best ? best.full : null;
}

function main() {
  const exe = findTargetExe();
  if (!exe) {
    log('未找到打包产物（release/win-unpacked/*.exe），跳过。请先执行 electron-builder。');
    return;
  }
  if (!fs.existsSync(ICON)) {
    log(`未找到图标文件 ${ICON}，跳过。可执行 python scripts/make-icon.py 生成。`);
    return;
  }
  const rcedit = findRcedit();
  if (!rcedit) {
    log('未在 electron-builder 缓存中找到 rcedit，跳过图标修复。');
    log('提示：先执行一次 electron-builder（会下载 winCodeSign），再重新运行本脚本。');
    return;
  }

  log(`目标 exe：${exe}`);
  log(`rcedit  ：${rcedit}`);

  const currentLevel = readExecutionLevel(exe);
  log(`当前提权级别：${currentLevel ?? '未知'}`);

  const tmp = path.join(os.tmpdir(), `dui-fix-${Date.now()}.exe`);
  try {
    // 1. 复制到临时目录（绕开部分目录下 rcedit 原地重写失败的问题）
    fs.copyFileSync(exe, tmp);

    // 2. 在副本上写入图标、版本信息与提权清单
    execFileSync(
      rcedit,
      [
        tmp,
        '--set-icon', ICON,
        '--set-version-string', 'CompanyName', COMPANY,
        '--set-version-string', 'ProductName', PRODUCT,
        '--set-version-string', 'FileDescription', PRODUCT,
        '--set-version-string', 'LegalCopyright', 'MIT',
        '--set-file-version', FILE_VERSION,
        '--set-product-version', FILE_VERSION,
        '--set-requested-execution-level', EXECUTION_LEVEL,
      ],
      { stdio: 'inherit' },
    );

    // 3. 覆盖回原位置
    fs.copyFileSync(tmp, exe);

    const applied = readExecutionLevel(exe);
    if (applied !== EXECUTION_LEVEL) {
      log(`警告：提权级别写入后为 ${applied ?? '未知'}，期望 ${EXECUTION_LEVEL}。`);
      process.exitCode = 1;
      return;
    }
    log(`已写入应用图标、版本信息与提权清单（${applied}）。`);
  } catch (err) {
    log(`修复失败：${err instanceof Error ? err.message : String(err)}`);
    log('提示：若主程序正在运行，请先退出后重试。失败不影响程序功能，仅 exe 图标为默认图标。');
    process.exitCode = 1;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* 临时文件清理失败忽略 */
    }
  }
}

main();
