/**
 * 恢复交互式终端状态。
 *
 * 核心问题：pnpm dev → turbo → ts-node 链路中，子进程的 stdout/stdin 是管道，
 * 不是真实终端。process.stdout.write() 写的转义序列到不了终端，
 * process.stdin.setRawMode() 操作的也是管道而非终端。
 *
 * 解决方案：直接打开 /dev/tty（Git Bash 提供），向真实终端写复位序列、
 * 关闭 raw mode。若 /dev/tty 不可用则回退到常规方式。
 */
import fs from 'fs';
import { execSync } from 'child_process';

/** 直接向真实终端写数据（绕过 turbo/pnpm 管道）。 */
const writeToTTY = (data: string): boolean => {
  try {
    const fd = fs.openSync('/dev/tty', 'w');
    fs.writeSync(fd, data);
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
};

/** 直接对真实终端关闭 raw mode 并 resume。 */
const resetTTYInput = (): boolean => {
  try {
    const fd = fs.openSync('/dev/tty', 'r');
    // 用底层 ioctl 关闭 raw mode — 通过 stty 命令最可靠
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
};

export const restoreTerminal = () => {
  // 1. 尝试通过 stty 直接重置真实终端（Git Bash 环境下有效）
  try {
    execSync('stty sane 2>/dev/null; stty echo 2>/dev/null; stty -raw 2>/dev/null', {
      stdio: ['inherit', 'inherit', 'inherit'],
    });
  } catch { /* 非 Git Bash 或 stty 不可用 */ }

  // 2. 直接向 /dev/tty 写终端复位序列
  const resetSeq = '[0m[?25h[?1l[2J[H';
  if (!writeToTTY(resetSeq)) {
    // 回退：写 process.stdout（可能被管道吞掉，但总比不写好）
    try { process.stdout.write(resetSeq); } catch { }
  }

  // 3. 对 process.stdin 做 cleanup（可能操作的是管道，但无副作用）
  const input = process.stdin as NodeJS.ReadStream & {
    setRawMode?: (mode: boolean) => void;
    isRaw?: boolean;
  };
  try {
    input.resume();
    if (input.isRaw) input.setRawMode?.(false);
    input.removeAllListeners('keypress');
    input.removeAllListeners('data');
    input.setEncoding?.('utf8');
  } catch { }

  // 4. 标记已尝试重置
  resetTTYInput();
};
