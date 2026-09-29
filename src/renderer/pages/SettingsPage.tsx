/** 设置页：通用行为、权限、配置导入导出、诊断 */
import { useEffect, useState } from 'react';
import type { AutoStartStatus, ThemeMode } from '@shared/types';
import { Card, Notice, SettingRow } from '../components/Card';
import { ColorField } from '../components/ColorField';
import { Segmented } from '../components/Segmented';
import { Switch } from '../components/Switch';
import { useAppStore } from '../store/appStore';

const MODE_OPTIONS = [
  { value: 'system' as ThemeMode, label: '跟随系统' },
  { value: 'dark' as ThemeMode, label: '深色' },
  { value: 'light' as ThemeMode, label: '浅色' },
];

/** 定时重启间隔选项（0 = 关闭） */
const RESTART_OPTIONS = [
  { value: '0', label: '关闭' },
  { value: '15', label: '15 分钟' },
  { value: '30', label: '30 分钟' },
  { value: '60', label: '60 分钟' },
];

export function SettingsPage() {
  const config = useAppStore((s) => s.config);
  const status = useAppStore((s) => s.status);
  const patch = useAppStore((s) => s.patchConfig);
  const toast = useAppStore((s) => s.toast);
  const replaceConfig = useAppStore((s) => s.replaceConfig);
  const [busy, setBusy] = useState(false);
  // 开机自启的真实状态由计划任务决定，与配置项分开管理
  const [autoStart, setAutoStart] = useState<AutoStartStatus | null>(null);

  const sys = config.system;

  useEffect(() => {
    void window.api.app.getAutoStartStatus().then(setAutoStart);
  }, []);

  const handleAutoStartChange = async (enabled: boolean) => {
    patch({ system: { startWithWindows: enabled } });
    const status = await window.api.app.setAutoStart(enabled);
    setAutoStart(status);
    if (status.error && enabled && !status.enabled) toast(status.error, 'error');
    else toast(enabled ? '已启用开机自启' : '已关闭开机自启', 'success');
  };

  return (
    <div className="page">
      <div className="page__head">
        <h2 className="page__title">设置</h2>
        <p className="page__desc">运行行为、界面外观与诊断信息。所有配置会保存在用户数据目录。</p>
      </div>

      <div className="grid grid--2">
        <Card title="通用行为">
          <SettingRow
            label="开机自动启动"
            hint="写入注册表登录项，静默启动并驻留托盘（不弹主界面，也不占用窗口内存）"
          >
            <Switch
              checked={sys.startWithWindows}
              disabled={autoStart ? !autoStart.available : false}
              onChange={(v) => void handleAutoStartChange(v)}
            />
          </SettingRow>

          {autoStart?.available ? (
            <div className="kv">
              <span>自启任务状态</span>
              <span>{autoStart.enabled ? '已注册（登录后静默启动）' : '未注册'}</span>
            </div>
          ) : null}

          {autoStart && !autoStart.available ? <Notice>{autoStart.error}</Notice> : null}

          {autoStart?.available && sys.startWithWindows && !autoStart.enabled ? (
            <Notice kind="error">自启未生效：{autoStart.error ?? '未知原因'}。可关闭后重新开启试试。</Notice>
          ) : null}

          <SettingRow label="关闭时最小化到托盘" hint="关闭后依然保持美化效果">
            <Switch
              checked={sys.minimizeToTray}
              onChange={(v) => patch({ system: { minimizeToTray: v } })}
            />
          </SettingRow>

          <SettingRow label="全屏应用时自动暂停" hint="播放视频或玩游戏时自动还原系统外观，避免干扰">
            <Switch
              checked={sys.autoPauseFullscreen}
              onChange={(v) => patch({ system: { autoPauseFullscreen: v } })}
            />
          </SettingRow>

          <SettingRow label="启动时自动应用上次配置">
            <Switch
              checked={sys.autoApplyOnStart}
              onChange={(v) => patch({ system: { autoApplyOnStart: v } })}
            />
          </SettingRow>

          <SettingRow
            label="定时自动重启"
            hint="长时间运行后跟手手感可能逐渐变差，定期重启进程可立即恢复；重启瞬间特效会中断约 1 秒。也可随时用托盘菜单「立即重启」"
            stack
          >
            <Segmented
              value={String(sys.autoRestartMinutes)}
              options={RESTART_OPTIONS}
              onChange={(v) => patch({ system: { autoRestartMinutes: Number(v) } })}
            />
          </SettingRow>
        </Card>

        <Card title="界面外观" desc="只影响本程序自身的显示效果">
          <SettingRow label="深浅色模式" hint="跟随系统时读取 Windows 的应用主题设置" stack>
            <Segmented
              value={config.appearance.mode}
              options={MODE_OPTIONS}
              onChange={(v) => patch({ appearance: { mode: v } })}
            />
          </SettingRow>

          <SettingRow label="强调色" hint="用于按钮、滑块与选中状态" stack>
            <ColorField
              pickerId="appearance.accent"
              value={config.appearance.accent}
              allowNone={false}
              allowDefault={false}
              onChange={(v) => patch({ appearance: { accent: v } })}
            />
          </SettingRow>

          <div className="kv">
            <span>主界面玻璃层</span>
            <span>{status?.selfAcrylic ? '系统亚克力（半透明）' : '不透明回退'}</span>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="诊断">
          <SettingRow label="原生能力自检" hint="任何一项失败都会自动降级，不会导致程序不可用" stack>
            <div className="stack" style={{ width: '100%' }}>
              {status?.features.map((f) => (
                <div className="kv" key={f.key}>
                  <span>
                    <i className={`dot dot--${f.ok ? 'on' : 'error'}`} style={{ display: 'inline-block', marginRight: 8 }} />
                    {f.label}
                  </span>
                  <span>{f.ok ? '正常' : (f.detail ?? '不可用')}</span>
                </div>
              ))}
            </div>
          </SettingRow>

          <div className="row-inline">
            <button className="btn btn--sm" type="button" onClick={() => void window.api.app.openUserData()}>
              打开数据目录
            </button>
            <button className="btn btn--sm" type="button" onClick={() => void window.api.app.openLog()}>
              查看日志文件
            </button>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="配置管理">
          <SettingRow label="导出 / 导入配置" hint="导出的 json 包含全部美化参数，可用于换机迁移" stack>
            <div className="row-inline">
              <button
                className="btn btn--sm"
                type="button"
                onClick={() => void window.api.config.exportFile().then((r) => toast(r.message, r.ok ? 'success' : 'error'))}
              >
                导出配置
              </button>
              <button
                className="btn btn--sm"
                type="button"
                onClick={async () => {
                  const res = await window.api.config.importFile();
                  if (res.ok && res.config) replaceConfig(res.config);
                  toast(res.message, res.ok ? 'success' : 'error');
                }}
              >
                导入配置
              </button>
              <button
                className="btn btn--sm btn--danger"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const next = await window.api.config.reset();
                  replaceConfig(next);
                  setBusy(false);
                  toast('已恢复系统默认外观与设置', 'success');
                }}
              >
                恢复所有默认设置
              </button>
            </div>
          </SettingRow>

          <Notice kind="ok">
            退出程序时会自动关闭特效；如需把系统光标大小也还原，可在系统托盘右键选择「恢复系统默认光标与特效」。
          </Notice>
        </Card>
      </div>
    </div>
  );
}
