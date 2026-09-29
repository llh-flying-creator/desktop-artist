/**
 * 轻量日志：写入 userData/logs/app.log，同时保留最近 300 条供 UI 查看
 */
import { app } from 'electron';
import { appendFileSync, mkdirSync, existsSync, statSync, renameSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Level = 'info' | 'warn' | 'error';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB 后轮转
const MEMORY_LIMIT = 300;

class Logger {
  private dir = '';
  private file = '';
  private memory: string[] = [];
  private ready = false;

  private init(): void {
    if (this.ready) return;
    try {
      this.dir = join(app.getPath('userData'), 'logs');
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
      this.file = join(this.dir, 'app.log');
      if (existsSync(this.file) && statSync(this.file).size > MAX_FILE_SIZE) {
        renameSync(this.file, join(this.dir, 'app.old.log'));
      }
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  private write(level: Level, scope: string, message: string): void {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const line = `[${time}] [${level.toUpperCase()}] [${scope}] ${message}`;
    this.memory.push(line);
    if (this.memory.length > MEMORY_LIMIT) this.memory.splice(0, this.memory.length - MEMORY_LIMIT);

    // 开发环境下同时输出到终端
    if (!app.isPackaged) {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(line);
    }

    this.init();
    if (!this.ready) return;
    try {
      appendFileSync(this.file, `${line}\n`, 'utf8');
    } catch {
      /* 日志写入失败不影响主流程 */
    }
  }

  info(scope: string, message: string): void {
    this.write('info', scope, message);
  }
  warn(scope: string, message: string): void {
    this.write('warn', scope, message);
  }
  error(scope: string, message: string): void {
    this.write('error', scope, message);
  }

  /** 读取最近的日志（供设置页展示） */
  tail(limit = 120): string[] {
    this.init();
    if (this.ready && existsSync(this.file)) {
      try {
        const content = readFileSync(this.file, 'utf8');
        return content.trim().split(/\r?\n/).slice(-limit);
      } catch {
        /* 回退到内存日志 */
      }
    }
    return this.memory.slice(-limit);
  }

  get logFilePath(): string {
    this.init();
    return this.file;
  }
}

export const logger = new Logger();
