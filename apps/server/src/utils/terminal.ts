/**
 * 恢复交互式终端状态。
 * prompts 会把 stdin 切换到 raw mode；如果进程被 Ctrl+C 结束而没有切回，
 * PowerShell 会把退格和 Ctrl 组合键显示为 ^H、^C。
 */
export const restoreTerminal = () => {
  const input = process.stdin as NodeJS.ReadStream & {
    setRawMode?: (mode: boolean) => void;
    isRaw?: boolean;
  };
  try {
    // 先 resume 再关 raw mode，确保 stdin 恢复正常可读状态
    input.resume();
    if (input.isRaw) {
      input.setRawMode?.(false);
    }
    input.removeAllListeners('keypress');
    input.removeAllListeners('data');
    // 恢复默认编码
    input.setEncoding?.('utf8');
  } catch { /* 进程退出阶段 stdin 可能已经被关闭 */ }

  try {
    // 重置终端：颜色复位 + 显示光标 + 确保回显
    process.stdout.write('[0m[?25h');
    // 在 Windows 上，raw mode 关闭后可能需要显式恢复回显
    if (process.platform === 'win32') {
      process.stdout.write('[?1l');
    }
  } catch { /* 忽略终端输出错误 */ }
};
