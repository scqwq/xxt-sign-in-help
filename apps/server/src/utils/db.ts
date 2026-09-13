/**
 * SQLite 数据库模块 — 替换原 storage.json 的所有持久化操作。
 * 使用 Node.js 内置 node:sqlite（Node 22.5+ 实验性内置，无需安装原生模块）。
 * 模块加载时自动建表。
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const DB_PATH = path.join(__dirname, '../configs/data.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// 建表（幂等）
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone    TEXT PRIMARY KEY,
    params   TEXT NOT NULL DEFAULT '{}',
    monitor  TEXT DEFAULT '{}',
    mailing  TEXT DEFAULT '{}',
    cqserver TEXT DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS courses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phone      TEXT NOT NULL,
    courseId   TEXT NOT NULL,
    courseName TEXT DEFAULT '',
    autoSign   INTEGER DEFAULT 0,
    photoPath  TEXT DEFAULT '',
    UNIQUE(phone, courseId)
  );
`);

// ===================== 预编译语句 =====================

const upsertUser = db.prepare(`
  INSERT INTO users (phone, params, monitor, mailing, cqserver)
  VALUES (@phone, @params, @monitor, @mailing, @cqserver)
  ON CONFLICT(phone) DO UPDATE SET
    params   = excluded.params,
    monitor  = excluded.monitor,
    mailing  = excluded.mailing,
    cqserver = excluded.cqserver
`);

const getUserStmt = db.prepare('SELECT * FROM users WHERE phone = ?');
const getAllUsersStmt = db.prepare('SELECT * FROM users');
const updateUserConfigStmt = db.prepare(`
  UPDATE users SET monitor = @monitor, mailing = @mailing, cqserver = @cqserver WHERE phone = @phone
`);

const getCoursesStmt = db.prepare('SELECT courseId, courseName, autoSign, photoPath FROM courses WHERE phone = ?');
const upsertCourseStmt = db.prepare(`
  INSERT INTO courses (phone, courseId, courseName, autoSign, photoPath)
  VALUES (@phone, @courseId, @courseName, @autoSign, @photoPath)
  ON CONFLICT(phone, courseId) DO UPDATE SET
    courseName = excluded.courseName,
    autoSign   = excluded.autoSign,
    photoPath  = excluded.photoPath
`);
const deleteCourseStmt = db.prepare('DELETE FROM courses WHERE phone = ? AND courseId = ?');

// ===================== 导出函数 =====================

/** upsert 用户（凭证 + 配置），params/monitor/mailing/cqserver 均为对象，内部 JSON 序列化。 */
export const dbStoreUser = (phone: string, user: { params?: any; monitor?: any; mailing?: any; cqserver?: any }) => {
  upsertUser.run({
    phone,
    params: JSON.stringify(user.params || {}),
    monitor: JSON.stringify(user.monitor || {}),
    mailing: JSON.stringify(user.mailing || {}),
    cqserver: JSON.stringify(user.cqserver || {}),
  });
};

/** 按 phone 查用户，返回 { phone, params, monitor, mailing, cqserver }（均为已反序列化对象）或 null。 */
export const dbGetUser = (phone: string): { phone: string; params: any; monitor: any; mailing: any; cqserver: any } | null => {
  const row = getUserStmt.get(phone) as any;
  if (!row) return null;
  return {
    phone: row.phone,
    params: JSON.parse(row.params || '{}'),
    monitor: JSON.parse(row.monitor || '{}'),
    mailing: JSON.parse(row.mailing || '{}'),
    cqserver: JSON.parse(row.cqserver || '{}'),
  };
};

/** 返回全部用户，供 CLI 列表选择。 */
export const dbGetAllUsers = (): { phone: string; params: any; monitor: any; mailing: any; cqserver: any }[] => {
  const rows = getAllUsersStmt.all() as any[];
  return rows.map((row) => ({
    phone: row.phone,
    params: JSON.parse(row.params || '{}'),
    monitor: JSON.parse(row.monitor || '{}'),
    mailing: JSON.parse(row.mailing || '{}'),
    cqserver: JSON.parse(row.cqserver || '{}'),
  }));
};

/** 返回某用户的课程记录列表。 */
export const dbGetUserCourses = (phone: string): { courseId: string; courseName: string; autoSign: boolean; photoPath: string }[] => {
  const rows = getCoursesStmt.all(phone) as any[];
  return rows.map((row) => ({
    courseId: row.courseId,
    courseName: row.courseName || '',
    autoSign: !!row.autoSign,
    photoPath: row.photoPath || '',
  }));
};

/** 新增或更新单门课程记录。 */
export const dbUpsertCourse = (phone: string, course: { courseId: string; courseName?: string; autoSign?: boolean; photoPath?: string }) => {
  const courseId = String(course.courseId);
  const existing = dbGetUserCourses(phone).find(c => c.courseId === courseId);
  upsertCourseStmt.run({
    phone,
    courseId,
    courseName: course.courseName ?? existing?.courseName ?? '',
    autoSign: (course.autoSign ?? existing?.autoSign ?? false) ? 1 : 0,
    photoPath: course.photoPath ?? existing?.photoPath ?? '',
  });
};

/** 删除单门课程记录。 */
export const dbDeleteCourse = (phone: string, courseId: string) => {
  deleteCourseStmt.run(phone, courseId);
};

/** 更新用户的监听/邮件/CQ 配置（不影响凭证 params）。 */
export const dbUpdateUserConfig = (phone: string, config: { monitor?: any; mailing?: any; cqserver?: any }) => {
  const existing = dbGetUser(phone);
  updateUserConfigStmt.run({
    phone,
    monitor: JSON.stringify(config.monitor ?? existing?.monitor ?? {}),
    mailing: JSON.stringify(config.mailing ?? existing?.mailing ?? {}),
    cqserver: JSON.stringify(config.cqserver ?? existing?.cqserver ?? {}),
  });
};
