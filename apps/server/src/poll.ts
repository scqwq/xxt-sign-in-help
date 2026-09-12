/**
 * HTTP 轮询监听模式。
 * 定时遍历课程活动列表，发现有效签到则自动完成，不依赖 WebIM / WebSocket。
 * 用于 im.chaoxing.com/webim/me 维护、无法获取环信 token 的场景。
 *
 * 既可 CLI 交互运行（pnpm poll），也可由 serve.ts 以 --auth 参数 fork。
 */
import fs from 'fs';
import path from 'path';
import { blue, red } from 'kolorist';
import prompts from 'prompts';
import { getPPTActiveInfo, preSign, getActivity, getSignType } from './functions/activity';
import { GeneralSign } from './functions/general';
import { LocationSign } from './functions/location';
import { getObjectIdFromcxPan, PhotoSign, uploadPhoto } from './functions/photo';
import { getLocalUsers, userLogin, getCourses, getAccountInfo, getPanToken } from './functions/user';
import { getJsonObject, getStoredUser, storeUser } from './utils/file';
import { dbGetUser, dbGetAllUsers, dbGetUserCourses, dbUpdateUserConfig } from './utils/db';
import { delay } from './utils/helper';
import { writeMonitorLog } from './utils/monitorLogger';
import { restoreTerminal } from './utils/terminal';
import { PromptsOptions, addressPrompts, monitorPromptsQuestions } from './configs/prompts';
import { sendEmail } from './utils/mailer';

restoreTerminal();

/** 读取 env.json 的 monitor 段，控制轮询模式与间隔。 */
const loadMonitorConfig = () => {
  let cfg: any = {};
  try { cfg = getJsonObject('env.json').monitor || {}; } catch { /* 缺失走默认 */ }
  return {
    pollInterval: Number(cfg.pollInterval) > 0 ? Number(cfg.pollInterval) : 60,
  };
};

/** 交互式配置签到信息，与 monitor.ts 的 configure 行为一致。 */
async function configure(phone: string) {
  const config = getStoredUser(phone);
  let local = false;
  console.log(blue('轮询签到支持 [普通 / 手势 / 拍照 / 签到码 / 位置]'));
  if (config?.monitor) {
    local = (await prompts({ type: 'confirm', name: 'local', message: '是否用本地缓存的签到信息?', initial: true }, PromptsOptions)).local;
  }
  if (!local) {
    const presetAddress = await addressPrompts();
    const response = await prompts(monitorPromptsQuestions, PromptsOptions);
    const monitor: any = {};
    const mailing: any = {};
    monitor.delay = response.delay;
    monitor.lon = response.lon;
    monitor.lat = response.lat;
    monitor.presetAddress = presetAddress;
    mailing.enabled = response.mail;
    mailing.host = response.host;
    mailing.ssl = response.ssl;
    mailing.port = response.port;
    mailing.user = response.user;
    mailing.pass = response.pass;
    mailing.to = response.to;
    config!.monitor = monitor;
    config!.mailing = mailing;

    dbUpdateUserConfig(phone, { monitor, mailing });
  }
  return JSON.parse(JSON.stringify({ mailing: config!.mailing, monitor: config!.monitor }));
}

/** 读取 env.json 的 photo 段。 */
const loadPhotoConfig = (): { auto: boolean; defaultPath: string } => {
  let cfg: any = {};
  try { cfg = getJsonObject('env.json').photo || {}; } catch { /* 缺失走默认 */ }
  return {
    auto: cfg.auto !== false,
    defaultPath: cfg.defaultPath || '',
  };
};

/**
 * 获取拍照签到的 objectId。
 * 优先级：coursePhotoPath（课程记录里的路径）→ defaultPath（env.json 全局默认）→ 云盘 0.jpg/0.png。
 */
async function getPhotoObjectId(cookies: BasicCookie, coursePhotoPath?: string): Promise<string | null> {
  const photoCfg = loadPhotoConfig();
  const localPath = coursePhotoPath || photoCfg.defaultPath;
  if (localPath && fs.existsSync(localPath)) {
    try {
      const buffer = fs.readFileSync(localPath);
      const tokenRes = await getPanToken(cookies);
      const token = JSON.parse(tokenRes)._token;
      const uploadRes = await uploadPhoto({ ...cookies, buffer, token });
      const objectId = JSON.parse(uploadRes).objectId;
      if (objectId) {
        console.log(blue(`[拍照]已上传本地图片 ${localPath}，objectId=${objectId}`));
        return objectId;
      }
      console.log(red(`[拍照]本地图片上传返回无 objectId：${uploadRes}`));
    } catch (e: any) {
      console.log(red(`[拍照]本地图片上传失败：${e?.message || e}，尝试云盘兜底`));
    }
  }
  // 兜底：从云盘找 0.jpg/0.png
  return getObjectIdFromcxPan(cookies);
}

/** 对单个活动执行签到，返回结果描述。二维码签到需人工干预，返回提示。 */
async function signActivity(
  realname: string,
  params: UserCookieType,
  monitorCfg: any,
  activity: { activeId: string; courseId: string; classId: string; otherId: number; },
  coursePhotoPath?: string,
): Promise<string | null> {
  await preSign({ ...activity, ...params });
  let result: string | null = null;
  switch (activity.otherId) {
    case 2:
      result = '[二维码]需人工干预，轮询模式无法自动完成';
      console.log(red(result));
      break;
    case 4:
      result = await LocationSign({ name: realname, presetAddress: monitorCfg.presetAddress, activeId: activity.activeId, ...params });
      break;
    case 3:
    case 5:
      result = await GeneralSign({ name: realname, activeId: activity.activeId, ...params });
      break;
    case 0: {
      const info = await getPPTActiveInfo({ activeId: activity.activeId, ...params });
      if (info.ifphoto === 1) {
        const photoCfg = loadPhotoConfig();
        if (!photoCfg.auto) {
          result = '[拍照]自动签到已关闭，需手动处理';
          console.log(red(result));
          break;
        }
        const objectId = await getPhotoObjectId(params, coursePhotoPath);
        if (objectId === null) return '[拍照]未找到可用图片（本地路径无效且云盘无 0.jpg/0.png）';
        result = await PhotoSign({ name: realname, activeId: activity.activeId, objectId, ...params });
      } else {
        result = await GeneralSign({ name: realname, activeId: activity.activeId, ...params });
      }
      break;
    }
  }
  return result;
}

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  restoreTerminal();
  writeMonitorLog(process.argv[2] === '--auth' ? process.argv[3] : 'cli', 'poll_shutdown', { reason: 'signal' });
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('SIGHUP', shutdown);
process.once('SIGBREAK', shutdown);
process.once('exit', restoreTerminal);
process.on('uncaughtException', (error) => {
  writeMonitorLog(process.argv[2] === '--auth' ? process.argv[3] : 'cli', 'poll_uncaughtException', { message: error.message, stack: error.stack });
  console.error('[轮询异常]', error);
});
process.on('unhandledRejection', (reason) => {
  writeMonitorLog(process.argv[2] === '--auth' ? process.argv[3] : 'cli', 'poll_unhandledRejection', reason);
});

// 开始运行
(async () => {
  let params: any = {};
  let config: any = {};
  let realname = '';

  if (process.argv[2] === '--auth') {
    const auth_config = JSON.parse(Buffer.from(process.argv[4], 'base64').toString('utf8'));
    params.phone = auth_config.credentials.phone;
    params.uf = auth_config.credentials.uf;
    params._d = auth_config.credentials._d;
    params.vc3 = auth_config.credentials.vc3;
    params._uid = auth_config.credentials.uid;
    params.lv = auth_config.credentials.lv;
    params.fid = auth_config.credentials.fid;
    config.monitor = { ...auth_config.config.monitor };
    config.mailing = { ...auth_config.config.mailing };
    writeMonitorLog(params.phone, 'poll_startup', { mode: 'web', pollInterval: loadMonitorConfig().pollInterval });
  } else {
    const userItem = (await prompts({ type: 'select', name: 'userItem', message: '选择用户', choices: getLocalUsers(), initial: 0 }, PromptsOptions)).userItem;
    if (userItem === -1) {
      const phone = (await prompts({ type: 'text', name: 'phone', message: '手机号' }, PromptsOptions)).phone;
      const password = (await prompts({ type: 'password', name: 'password', message: '密码' }, PromptsOptions)).password;
      params = await userLogin(phone, password);
      if (params === 'AuthFailed') process.exit(0);
      storeUser(phone, { phone, params });
      params.phone = phone;
    } else {
      const users = dbGetAllUsers();
      const user = users[userItem];
      params = user.params;
      params.phone = user.phone;
    }
    config = await configure(params.phone);
  }

  // 获取真实姓名
  try { realname = await getAccountInfo(params); } catch { realname = String(params._uid || ''); }
  writeMonitorLog(params.phone || 'cli', 'poll_ready', { realname });
  if (process.send) process.send('success');

  const { pollInterval } = loadMonitorConfig();
  const signedSet = new Set<string>();
  const cookies = params as UserCookieType;

  // 加载该用户的已记录课程配置（autoSign、photoPath 等）
  const loadUserCourses = (): { courseId: string; courseName: string; autoSign: boolean; photoPath: string }[] => {
    return dbGetUserCourses(params.phone);
  };

  console.log(blue(`[轮询监听中] 每 ${pollInterval} 秒检查一次课程签到活动...`));

  while (!shuttingDown) {
    let courses: any = null;
    try {
      courses = await getCourses(params._uid, params._d, params.vc3);
    } catch (e) {
      writeMonitorLog(params.phone || 'cli', 'poll_getCourses_error', { message: String(e) });
    }

    if (Array.isArray(courses) && courses.length > 0) {
      // 并发检查各课程，每轮 5 个
      for (let i = 0; i < courses.length; i += 5) {
        const batch = courses.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map((course: CourseType) => getActivity({ course, ...cookies }))
        );
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          if (r.status !== 'fulfilled' || typeof r.value === 'string') continue;
          const activity = r.value as Activity;
          if (signedSet.has(activity.activeId)) continue;
          signedSet.add(activity.activeId);

          const info = await getPPTActiveInfo({ activeId: activity.activeId, ...cookies });
          const signType = getSignType(info);
          const courseRecords = loadUserCourses();
          const courseRecord = courseRecords.find((c) => c.courseId === activity.courseId);
          const courseFromList = batch[j] as CourseType;
          const courseName = courseRecord?.courseName || courseFromList?.courseName || activity.courseId;
          const shouldAutoSign = courseRecord?.autoSign === true;

          // 增强的 detected 事件，带完整信息供 UI 操作
          process.send?.({
            type: 'sign_event',
            event: { type: 'detected', activeId: activity.activeId, courseId: activity.courseId, courseName, signType, otherId: activity.otherId, ifphoto: info.ifphoto, autoSign: shouldAutoSign, time: Date.now() },
          });
          writeMonitorLog(params.phone || 'cli', 'poll_activity_detected', { activeId: activity.activeId, name: activity.name, courseId: activity.courseId, courseName, signType, shouldAutoSign });

          console.log(blue(`[检测到签到] ${courseName} - ${signType} ${shouldAutoSign ? '(自动)' : '(手动)'}`));

          if (!shouldAutoSign) {
            // 未记录或 autoSign 关闭 → 只通知不签，等 UI 手动操作
            continue;
          }

          process.send?.({ type: 'sign_event', event: { type: 'processing', activeId: activity.activeId, signType, time: Date.now() } });
          await delay(config.monitor?.delay || 0);
          let result: string | null = null;
          try {
            result = await signActivity(realname, cookies, config.monitor, {
              activeId: activity.activeId, courseId: activity.courseId, classId: activity.classId, otherId: activity.otherId,
            }, courseRecord?.photoPath);
          } catch (e: any) {
            result = `[异常]${e?.message || e}`;
          }
          writeMonitorLog(params.phone || 'cli', 'poll_sign_result', { activeId: activity.activeId, signType, result });
          process.send?.({ type: 'sign_event', event: { type: 'result', activeId: activity.activeId, signType, result: result || '未返回结果', time: Date.now() } });
          console.log(`[签到结果] ${result} - ${realname}`);

          if (config.mailing?.enabled) {
            sendEmail({ aid: activity.activeId, uid: params._uid, realname, status: result, mailing: config.mailing });
          }
        }
      }
    } else if (typeof courses === 'string') {
      writeMonitorLog(params.phone || 'cli', 'poll_courses_status', { status: courses });
    }

    await delay(pollInterval);
  }
})().catch((error) => {
  const phone = process.argv[2] === '--auth' ? process.argv[3] : 'cli';
  writeMonitorLog(phone, 'poll_startup_error', { message: error?.message, stack: error?.stack });
  console.error(red('[轮询启动失败]'), error);
  restoreTerminal();
  if (process.send) process.send({ type: 'startup_error', message: error?.message || '未知错误' });
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 50).unref();
});
