/**
 * 原生层自检（纯 Node 运行，不依赖 Electron）
 * 用途：排查「光标涟漪不触发 / 光标缩放无效」时，判断是 koffi 绑定问题还是系统问题。
 *
 * 运行：node scripts/verify-native.cjs
 *
 * 注意：本程序只创建光标覆盖层，不修改任何系统窗口或注册表，
 *       因此没有「还原」参数，也不需要在管理员权限下运行。
 */
const path = require('node:path');

let pass = 0;
let fail = 0;

function check(label, fn) {
  try {
    const detail = fn();
    pass += 1;
    console.log(`  [OK]   ${label}${detail ? ` -> ${detail}` : ''}`);
    return true;
  } catch (err) {
    fail += 1;
    console.log(`  [FAIL] ${label} -> ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

console.log('=== 桌面UI美化 · 原生能力自检 ===\n');

console.log('[1] koffi 加载');
const koffi = require(path.join(__dirname, '..', 'node_modules', 'koffi'));
let user32 = null;
check('koffi.load user32.dll', () => {
  user32 = koffi.load('user32.dll');
  return 'ok';
});

console.log('\n[2] 函数绑定');
let GetAsyncKeyState = null;
check('GetAsyncKeyState（鼠标按键轮询）', () => {
  GetAsyncKeyState = user32.func('int16_t GetAsyncKeyState(int vKey)');
  return 'ok';
});
check('GetSystemMetrics', () => {
  const fn = user32.func('int GetSystemMetrics(int nIndex)');
  return `${fn(0)} px`;
});
check('GetForegroundWindow', () => {
  const fn = user32.func('void *GetForegroundWindow()');
  return `handle = ${koffi.address(fn())}`;
});
check('GetWindowRect（全屏检测）', () => {
  user32.func('int GetWindowRect(void *hWnd, void *lpRect)');
  return 'ok';
});
check('SystemParametersInfoW（光标缩放）', () => {
  user32.func('int SystemParametersInfoW(uint32_t uiAction, uint32_t uiParam, void *pvParam, uint32_t fWinIni)');
  return 'ok';
});

console.log('\n[3] 鼠标按键轮询');
if (GetAsyncKeyState) {
  check('GetAsyncKeyState(VK_LBUTTON)', () => `0x${(GetAsyncKeyState(1) & 0xffff).toString(16)}`);
}

console.log(`\n=== 结果：${pass} 项通过，${fail} 项失败 ===`);
if (fail > 0) {
  console.log('提示：失败通常意味着 koffi 未正确安装，请执行 npm install 后重试。');
}
process.exitCode = fail > 0 ? 1 : 0;
