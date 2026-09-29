/**
 * 配置持久化
 * 存储位置：%APPDATA%/桌面UI美化/config.json
 * 采用"写入临时文件 + 重命名"的方式，避免异常中断导致配置损坏。
 */
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, deepMerge, normalizeConfig } from '../shared/config';
import type { AppConfig, DeepPartial } from '../shared/types';
import { logger } from './util/logger';

type Listener = (config: AppConfig) => void;

class ConfigStore {
  private data: AppConfig = DEFAULT_CONFIG;
  private listeners = new Set<Listener>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.read();
  }

  private get file(): string {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, 'config.json');
  }

  private read(): AppConfig {
    try {
      const file = this.file;
      if (!existsSync(file)) return normalizeConfig(DEFAULT_CONFIG);
      // 去除可能存在的 UTF-8 BOM（某些编辑器保存时会写入）
      const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      const raw = JSON.parse(text) as unknown;
      return normalizeConfig(raw);
    } catch (err) {
      logger.warn('store', `读取配置失败，使用默认配置：${String(err)}`);
      return normalizeConfig(DEFAULT_CONFIG);
    }
  }

  /** 延迟写入，避免拖动滑块时频繁落盘 */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        const target = this.file;
        const tmp = `${target}.tmp`;
        writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
        renameSync(tmp, target);
      } catch (err) {
        logger.error('store', `写入配置失败：${String(err)}`);
      }
    }, 250);
  }

  get(): AppConfig {
    return this.data;
  }

  /** 增量更新配置 */
  patch(patch: DeepPartial<AppConfig>): AppConfig {
    this.data = normalizeConfig(deepMerge(this.data, patch));
    this.scheduleSave();
    this.emit();
    return this.data;
  }

  /** 整体替换（导入配置时使用） */
  replace(config: unknown): AppConfig {
    this.data = normalizeConfig(config);
    this.scheduleSave();
    this.emit();
    return this.data;
  }

  reset(): AppConfig {
    this.data = normalizeConfig(DEFAULT_CONFIG);
    this.scheduleSave();
    this.emit();
    return this.data;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.data);
      } catch (err) {
        logger.error('store', `配置监听回调异常：${String(err)}`);
      }
    }
  }
}

export const configStore = new ConfigStore();

export { DEFAULT_CONFIG };
