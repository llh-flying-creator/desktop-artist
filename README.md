# 桌面UI美化 (Desktop UI Beautify)

Windows 光标特效工具：**鼠标拖尾 + 点击涟漪**，可选系统光标缩放。

- **技术栈**：Electron 33 + React 18 + TypeScript（严格模式）+ Vite 6（electron-vite）+ koffi（Win32 FFI）
- **平台**：Windows 10 / 11（x64）
- **权限**：普通权限运行（`asInvoker`），**不弹 UAC**
- **系统侵入性：零** —— 不修改任何系统窗口、不写注册表、不重启资源管理器
- **界面风格**：Glassmorphism（毛玻璃 + 半透明 + 圆角），深浅色自动跟随系统

> **与其他"美化工具"的区别**
> 本程序只做一件事：为每个显示器创建一个**全屏透明、鼠标穿透、置顶**的覆盖层窗口，
> 用 Canvas 以 60fps 绘制光标特效。所有点击都会穿透到下层真实窗口，不拦截任何输入。
>
> 早先版本包含的「任务栏透明化 / 窗口特效 / 主题系统」已全部移除。它们依赖未公开接口
> （`SetWindowCompositionAttribute`、`DwmSetWindowAttribute`），在 Windows 11 上会破坏任务栏
> 的 XAML 合成，导致**开始菜单闪退 / 显示不全**，且只有重启 `explorer.exe` 才能复原；
> 注册表方案还会重启资源管理器。移除后本程序不再具备破坏系统的能力，也因此不再需要管理员权限。

> 为什么用 koffi 而不是 Rust/C++ 模块？
> 本机没有 Rust / .NET 工具链，koffi 是**预编译原生模块**，无需 C++ 编译环境即可直接调用
> `user32.dll`，在满足「单个 exe、无外部依赖」的前提下实现同等能力。

---

## 一、项目目录结构

```
desktop-artist/
├── build.bat                     # 一键打包（类型检查 → 构建 → 生成 exe）
├── dev.bat                       # 开发模式（热重载）
├── run-native-check.bat          # 原生能力自检（排查"涟漪无效"问题）
├── package.json                  # 依赖与脚本
├── tsconfig.json                 # TypeScript 严格模式配置
├── electron.vite.config.ts       # 三端构建配置（main / preload / renderer）
├── electron-builder.yml          # 打包配置（NSIS、asInvoker、asar 解包 koffi）
│
├── build/                        # 打包资源（图标，由 scripts/make-icon.py 生成）
│   ├── icon.ico
│   └── icon.png
│
├── scripts/
│   ├── make-icon.py              # 生成多尺寸 .ico（Pillow）
│   ├── verify-native.cjs         # 原生层自检脚本（纯 Node 运行）
│   ├── fix-exe-resources.cjs     # 打包兜底：写入 exe 图标、版本信息与提权清单
│   ├── create-shortcut.ps1       # 在桌面创建快捷方式（普通权限，不带 UAC 标志）
│   └── rename-project.ps1        # 重命名项目文件夹并重建桌面快捷方式
│
├── src/
│   ├── shared/                   # 主进程 / 渲染进程共享（无副作用）
│   │   ├── types.ts              #   全局类型定义（AppConfig / SystemStatus / CursorFxConfig ...）
│   │   ├── ipc.ts                #   IPC 通道常量
│   │   ├── config.ts             #   默认配置 + 深合并 + 规范化（含遗留字段清理）
│   │   └── color.ts              #   颜色换算工具
│   │
│   ├── main/                     # 主进程
│   │   ├── index.ts              #   入口：低内存开关、单实例、生命周期、异常兜底、事件广播
│   │   ├── ipc.ts                #   全部 IPC 路由（唯一对外能力出口）
│   │   ├── store.ts              #   配置持久化（原子写入 userData/config.json）
│   │   ├── windows.ts            #   主窗口（无边框 + 透明 + 自我亚克力）
│   │   ├── overlay.ts            #   光标特效覆盖层（每显示器一个穿透窗口）
│   │   ├── cursorTracker.ts      #   光标位置/按键轮询，变化时才推送
│   │   ├── tray.ts               #   系统托盘与右键菜单
│   │   ├── paths.ts              #   构建产物路径
│   │   ├── native/               #   ── Win32 原生层（koffi FFI，只读操作）──
│   │   │   ├── ffi.ts            #      函数绑定 / 结构体 / 内存工具 / 能力自检
│   │   │   ├── winEnum.ts        #      前台窗口、窗口矩形、全屏检测
│   │   │   └── cursorNative.ts   #      鼠标按键轮询、系统光标缩放
│   │   ├── services/
│   │   │   ├── beautify.ts       #   ★ 核心编排：配置 → 覆盖层 → 状态广播
│   │   │   └── picker.ts         #   吸色器截屏（截屏前自动隐藏本窗口）
│   │   └── util/
│   │       ├── logger.ts         #   文件日志（1MB 轮转 + 内存尾部）
│   │       ├── debounce.ts       #   防抖 / 节流
│   │       ├── autostart.ts      #   开机自启（注册表登录项）
│   │       └── systemInfo.ts     #   Windows 版本探测
│   │
│   ├── preload/
│   │   └── index.ts              # contextBridge 白名单 API（渲染进程唯一入口）
│   │
│   └── renderer/                 # 渲染进程
│       ├── index.html            #   主界面入口
│       ├── overlay.html          #   光标特效覆盖层入口
│       ├── main.tsx / App.tsx    #   外壳：标题栏 + 侧边栏 + 状态栏 + 页面路由
│       ├── env.d.ts              #   window.api 类型声明
│       ├── store/appStore.ts     #   zustand 全局状态（乐观更新）
│       ├── hooks/useAppearance.ts#   强调色 / 深浅色 / 玻璃强度同步
│       ├── styles/               #   variables.css + global.css + components.css
│       ├── components/           #   Card / Switch / Slider / Segmented / ColorField
│       │   ├── ColorPickerModal.tsx  # 吸色器（放大镜 + 像素取色）
│       │   ├── Sidebar.tsx / TopBar.tsx / WindowControls.tsx
│       │   └── Toasts.tsx
│       ├── pages/                #   3 个功能页面
│       │   ├── DashboardPage.tsx     # 首页：状态总览 + 系统能力自检
│       │   ├── CursorFxPage.tsx      # 光标：拖尾 / 涟漪 / 缩放 + 实时预览
│       │   └── SettingsPage.tsx      # 设置：行为 / 外观 / 配置 / 诊断
│       └── overlay/
│           ├── engine.ts         #   ★ 特效引擎（粒子/渐变/光晕 + 涟漪），页面预览复用
│           ├── OverlayStage.tsx  #   接收主进程光标帧并驱动引擎
│           └── main.tsx
│
└── out/                          # 构建产物（electron-vite 生成）
```

---

## 二、快速开始

### 1. 环境要求

| 项目 | 要求 |
| --- | --- |
| Node.js | ≥ 18（推荐 20/22/24） |
| 操作系统 | Windows 10 1809+ / Windows 11 |
| Python（可选） | 仅用于重新生成图标，需 Pillow |

### 2. 安装与运行

```powershell
npm install

npm run dev            # 开发模式（热重载）
node scripts/verify-native.cjs   # 原生层自检（强烈建议）
```

### 3. 打包

```powershell
npm run dist            # NSIS 安装包 → release/桌面UI美化-Setup-1.0.0.exe
npm run dist:portable   # 免安装单文件 exe
npm run dist:dir        # 只解包，便于调试
npm run icon            # 兜底补写 exe 图标 / 版本信息 / 提权清单
```

或直接双击 **`build.bat`**（依次完成：类型检查 → 构建 → 打包 → 补图标 → 建桌面快捷方式）。

### 4. 桌面快捷方式与开机自启

```powershell
npm run shortcut        # 在桌面创建/更新快捷方式
```

开机自启使用 **Electron 内置登录项**（写入 `HKCU\...\Run`），启动参数 `--hidden`：

- 普通权限即可设置，不需要管理员
- 启动时**不创建主窗口**，只驻留托盘，因此后台不占用窗口内存
- 在「设置 → 开机自动启动」中开关即可；程序启动时也会自动与配置对齐

### 5. 自检

```powershell
node scripts/verify-native.cjs
```

检查 koffi 与 `user32.dll` 绑定是否正常（鼠标按键轮询、光标缩放、全屏检测所需函数）。
本程序不修改任何系统设置，因此**没有"还原"步骤**。

---

## 三、核心实现说明

### 1. 光标覆盖层（模块：`main/overlay.ts` + `renderer/overlay/`）

```
主进程                                    渲染进程（每显示器一个覆盖窗口）
screen.getCursorScreenPoint() ─┐
GetAsyncKeyState() ────────────┴─► IPC ──► CursorFxEngine.moveTo / ripple
（8ms 轮询，仅变化时推送）                    requestAnimationFrame 60fps 绘制
```

- 覆盖窗口：`transparent + frame:false + focusable:false + skipTaskbar`
  + `setIgnoreMouseEvents(true, {forward:true})`
  → 完全**鼠标穿透**，所有点击照常落到下层窗口，不影响正常使用。
- 窗口性质决定了它收不到鼠标事件，因此按键状态通过 `GetAsyncKeyState` 轮询，
  只在「新按下」那一帧触发涟漪（长按不会重复触发）。
- 特效引擎 `engine.ts` 同时被光标页的**实时预览**复用，做到「所见即所得」。

**位置来源只有一条**：主进程轮询。曾经尝试过同时用覆盖层的 `mousemove` 驱动位置，
但两个来源的到达延迟不同，会交替把引擎的「上一次位置」往回拉 —— 而粒子是按
「与上一次位置的位移」生成的，位移被反复归零后就不再生成粒子（表现为不跟随），
因此已回退为单一来源。

**绘制开销**：光晕不再逐粒子 `createRadialGradient`，而是预渲染成一张 128×128 贴图
后逐帧 `drawImage`（配 `globalAlpha` 控制淡出），这是保持满帧的关键。

**跟随手感**：光晕样式下会在最新光标位置额外绘制一个「头部光点」（停止移动后约 420ms 淡出），
让「跟着光标走的那个点」足够明确；粒子透明度改为幂次衰减，头部更实、尾巴更快淡出。
粒子的随机发散量（`spread`）也调小了，光点更聚焦。

**抗挂起**：窗口被判定为不可见/被遮挡时 Chromium 会挂起 `requestAnimationFrame`，
画布会停在最后一帧（表现为「特效卡在原地」）。为此：关闭 `CalculateNativeWinOcclusion`、
引擎内置 rAF 看门狗（超 200ms 无帧则用定时器兜底驱动）、可见性变化时清空画布。

### 2. 全屏自动暂停（模块：`main/services/beautify.ts`）

播放视频 / 玩游戏时自动隐藏覆盖层。判定每秒采样一次，并做了两层保护：

- **忽略本程序自身的窗口**（按 PID 过滤），避免切换界面时误判；
- **抖动抑制**：全屏状态需连续 3 次采样一致才真正切换，避免弹出对话框或窗口切换
  造成特效反复开关（表现为闪烁）。

### 3. 内存优化

| 手段 | 说明 |
| --- | --- |
| 后台不创建主窗口 | 以 `--hidden` 自启时不创建 `BrowserWindow`，省掉一个常驻渲染进程 |
| 关闭窗口即销毁 | 「最小化到托盘」直接 `destroy()` 而非 `hide()`；隐藏窗口仍会常驻一个渲染进程（约 60–90MB），托盘再点开时按需重建 |
| 限制 V8 堆 | `--js-flags=--max-old-space-size=192`，避免长时间驻留后堆无节制增长 |
| 关闭无用特性 | `--disable-features` 停用 MediaRouter / Translate / OptimizationHints 等 Chromium 组件 |
| 光晕预渲染贴图 | 光晕从「逐粒子创建径向渐变」改为一次性贴图 + `drawImage`，大幅降低每帧绘制开销 |
| 空闲不重绘 | 画布无内容时跳过整帧绘制，避免鼠标静止时仍每帧「全屏 clear + 重新合成」（省 GPU、少发热） |
| 高精度定时器 | `timeBeginPeriod(1)`：否则 `setInterval(8)` 会被 Windows 夹到 ~15.6ms，采样率与刷新率不匹配会产生「拍频」式抖动 |
| 关闭后台节能节流 | `SetProcessInformation(ProcessPowerThrottling)` 声明不使用 EcoQoS，避免被系统按后台进程限速（限速会拉长定时器间隔） |
| 定时自动重启 | 每 30 分钟重启进程（可关闭，或随时用托盘「立即重启」），把手感恢复到初始状态 |
| 精简原生层 | 移除 DWM / 合成属性 / 注册表 / 窗口枚举等绑定，只保留 5 个只读函数 |

### 4. 容错与降级（模块：`native/ffi.ts`）

原生层**任何一步失败都不会让程序崩溃**：

```
koffi 加载失败        → nativeReady = false，界面正常可用，特效相关项显示为不可用
user32 绑定失败       → 对应功能单独降级（涟漪不触发 / 缩放无效）
系统版本不支持        → 相关提示自动出现在设置页
全屏应用运行中        → 自动暂停特效，退出全屏后自动恢复
```

全局 `uncaughtException` / `unhandledRejection` 均已兜底记录到日志。

---

## 四、配置文件

### 应用配置 `%APPDATA%/桌面UI美化/config.json`

```jsonc
{
  "version": 1,
  "appearance": { "mode": "system", "accent": "#7c8cff" },   // mode: system | dark | light
  "cursorFx": {
    "enabled": true,
    "trail": { "enabled": true, "style": "glow", "color": "#7c8cff", "length": 26, "size": 6, "life": 620 },
    "ripple": { "enabled": true, "color": "#7c8cff", "size": 96, "duration": 520 },
    "scale": 1                 // 1-3，系统光标缩放
  },
  "system": {
    "startWithWindows": false,
    "minimizeToTray": true,
    "autoPauseFullscreen": true,
    "autoApplyOnStart": true
  }
}
```

配置写入采用「临时文件 + rename」原子替换，异常中断不会损坏配置；
读取时会经过 `normalizeConfig()` 补齐缺失字段、按范围限幅，并**清理已移除功能的遗留字段**
（旧版本的 `taskbar`、`windowFx` 会被自动丢弃）。

---

## 五、已知限制

| # | 限制 | 说明与应对 |
| --- | --- | --- |
| 1 | **内存占用** | 含覆盖层的常驻后台约 350–420MB（Electron 多进程架构的固有开销）。关闭光标特效后仅剩主进程与托盘，可显著回落。若必须进一步压到 100MB 以内，建议整体迁移到 Tauri + Rust。 |
| 2 | **多显示器光标特效** | 每个显示器一个覆盖窗口，跨屏移动时光标帧是全局坐标、按显示器边界换算，正常情况下连续；极端 DPI 混合场景可能出现轻微偏移。 |
| 3 | **覆盖层无法接收输入** | 这是「鼠标穿透」的设计代价：涟漪靠轮询按键状态实现，因此按下瞬间的判定精度取决于轮询间隔（16ms）。 |
| 4 | **亚克力背景** | 主界面自身的玻璃背景需要 Windows 11 22H2+，不支持时自动回退为纯色。 |

---

## 六、后续扩展建议

- 光标特效增加更多样式（拖影、光点跟随、点击音效）。
- 把 `src/main/native/` 替换为 Rust 模块（napi-rs），并通过 Tauri 重构以把内存降到 40–80MB。
- 按显示器分别配置特效参数（多屏各自不同样式）。

---

## 七、排查手册

| 现象 | 排查步骤 |
| --- | --- |
| 光标特效不显示 | ① 首页确认「光标特效」已启用（注意「恢复系统默认」会把它一起关掉）；② 检查是否被「全屏应用自动暂停」触发；③ 多显示器可尝试关闭再开启模块 |
| 特效卡在某个位置不动 | 已由「关闭遮挡计算 + rAF 看门狗 + 可见性变化清空画布」处理；若仍复现，看日志中是否有全屏暂停记录 |
| 跟随不够跟手 | 在光标页降低「拖尾长度 / 存活时间」，或把样式从「光晕」换成「粒子」 |
| 涟漪不触发（无拖尾问题） | 执行 `node scripts/verify-native.cjs`，确认 `GetAsyncKeyState` 一项通过 |
| 光标缩放无效 | 自检中 `SystemParametersInfoW` 是否通过；该设置同时会改变系统的鼠标指针大小 |
| 原生功能全不可用 | 执行 `npm install` 重新安装 koffi（需允许 install scripts） |
| 打包时提示 `Cannot create symbolic link / 客户端没有所需的特权` | 解压 winCodeSign 时缺少符号链接权限所致，**不影响 Windows 产物**，`build.bat` 会自动补上图标；也可开启「开发者模式」或改用管理员终端 |
| 生成的 exe 显示 Electron 默认图标 | 执行 `npm run icon` 兜底写入图标与版本信息 |
| 桌面快捷方式失效 | `release` 目录被删除或移动了。重新打包后执行 `npm run shortcut` 重建 |

日志位置：`%APPDATA%/桌面UI美化/logs/app.log`（设置页可直接打开）。

---

## 八、许可

MIT
