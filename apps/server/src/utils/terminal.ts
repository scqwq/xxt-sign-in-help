/**
 * 恢复交互式终端状态。
 * prompts 会把 stdin 切换到 raw mode；如果进程被 Ctrl+C 结束而没有切回，
 * PowerShell 会把退格和 Ctrl 组合键显示为 ^H、^C。
 */
export const restoreTerminal = () => {
  const input = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void; };
  try {
    // 不依赖 isTTY 判断：pnpm/turbo 转发信号时 isTTY 可能已经变成 false，
    // 但底层控制台仍然可能保持 raw mode。
    input.setRawMode?.(false);
    input.removeAllListeners('keypress');
    input.removeAllListeners('data');
    input.pause();
  } catch { /* 进程退出阶段 stdin 可能已经被关闭 */ }

  try {
    if (process.stdout.isTTY) process.stdout.write('\u001b[0m\u001b[?25h\n');
  } catch { /* 忽略终端输出错误 */ }
};
