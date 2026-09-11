import fs from 'fs';
import path from 'path';

const logDirectory = path.join(__dirname, '../logs');

const ensureLogDirectory = () => {
  if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory, { recursive: true });
};

/** 以 JSONL 保存监听过程和超星 IM 原始消息，便于按行检索而不破坏原始结构。 */
export const writeMonitorLog = (phone: string, type: string, payload: any) => {
  try {
    ensureLogDirectory();
    const safePhone = String(phone || 'unknown').replace(/[^\w.-]/g, '_');
    const filename = path.join(logDirectory, `monitor-${safePhone}.jsonl`);
    const line = JSON.stringify({ time: new Date().toISOString(), type, payload });
    fs.appendFileSync(filename, `${line}\n`, 'utf8');
  } catch (error) {
    console.error('[监听日志写入失败]', error);
  }
};
