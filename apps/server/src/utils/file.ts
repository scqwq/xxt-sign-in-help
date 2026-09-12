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
