/** IPC 通道常量：统一管理，避免字符串散落在各处 */

export const IPC = {
  /* 应用级 */
  APP_STATUS: 'app:status',
  APP_STATUS_CHANGED: 'app:status-changed',
  APP_PAUSE: 'app:pause',
  APP_QUIT: 'app:quit',
  APP_MINIMIZE_TRAY: 'app:minimize-to-tray',
  APP_OPEN_USER_DATA: 'app:open-user-data',
  APP_OPEN_LOG: 'app:open-log',
  APP_AUTOSTART_STATUS: 'app:autostart-status',
  APP_AUTOSTART_SET: 'app:autostart-set',

  /* 配置 */
  CONFIG_GET: 'config:get',
  CONFIG_PATCH: 'config:patch',
  CONFIG_RESET: 'config:reset',
  CONFIG_EXPORT: 'config:export',
  CONFIG_IMPORT: 'config:import',
  CONFIG_CHANGED: 'config:changed',

  /* 光标 */
  CURSOR_OVERLAY_SYNC: 'cursor:overlay-sync',
  CURSOR_FRAME: 'cursor:frame',
  CURSOR_CONFIG: 'cursor:config',

  /* 覆盖层窗口与主进程的私有通道 */
  OVERLAY_BOUNDS: 'overlay:bounds',
  OVERLAY_REQUEST_BOUNDS: 'overlay:request-bounds',
  OVERLAY_REQUEST_CONFIG: 'overlay:request-config',

  /* 吸色器 */
  PICKER_CAPTURE: 'picker:capture',

  /* 主窗口控制 */
  WIN_MINIMIZE: 'win:minimize',
  WIN_MAXIMIZE: 'win:maximize',
  WIN_CLOSE: 'win:close',
  WIN_IS_MAXIMIZED: 'win:is-maximized',
  WIN_MAXIMIZED_CHANGED: 'win:maximized-changed',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
