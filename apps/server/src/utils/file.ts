import filehandle from 'fs';
import path from 'path';
import { dbStoreUser, dbGetUser } from './db';

/**
 * 储存用户凭证（写入 SQLite）
 */
export const storeUser = (phone: string, user: User): void => {
  dbStoreUser(phone, {
    params: user.params,
    monitor: user.monitor,
    mailing: user.mailing,
    cqserver: user.cqserver,
  });
};

export const getStoredUser = (phone: string): User | null => {
  return dbGetUser(phone);
};

/**
 * 读取 JSON 配置文件（仅用于 env.json 等静态配置，不再用于 storage.json）
 */
export const getJsonObject = (fileURL: string) => {
  return JSON.parse(filehandle.readFileSync(path.join(__dirname, '../' + fileURL), 'utf8'));
};
