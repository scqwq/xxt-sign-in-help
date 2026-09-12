import fs from 'fs';
import jsdom from 'jsdom';
import { blue, red } from 'kolorist';
import path from 'path';
import prompts from 'prompts';
import WebSocket from 'ws';
import { getPPTActiveInfo, getSignType, preSign, preSign2, speculateType } from './functions/activity';
import CQ from './functions/cq';
import { GeneralSign, GeneralSign_2 } from './functions/general';
import { LocationSign, LocationSign_2 } from './functions/location';
import { getObjectIdFromcxPan, PhotoSign, PhotoSign_2 } from './functions/photo';
import { QRCodeSign } from './functions/qrcode';
import { QrCodeScan } from './functions/tencent.qrcode';
import { getIMParams, getLocalUsers, userLogin } from './functions/user';
import { getJsonObject, getStoredUser, storeUser } from './utils/file';
import { dbGetUser, dbGetAllUsers, dbUpdateUserConfig } from './utils/db';
import { delay } from './utils/helper';
import { sendEmail } from './utils/mailer';
import { writeMonitorLog } from './utils/monitorLogger';
import { restoreTerminal } from './utils/terminal';
import { PromptsOptions, addressPrompts, monitorPromptsQuestions } from './configs/prompts';
// pnpm/turbo 退出异常后可能遗留控制台 raw mode，监听子进程启动时主动复位。
restoreTerminal();
const JSDOM = new jsdom.JSDOM('', { url: 'https://im.chaoxing.com/webim/me' });
const setGlobalValue = (name: string, value: any) => {
  try {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  } catch {
    (globalThis as any)[name] = value;
  }
};
setGlobalValue('window', JSDOM.window);
setGlobalValue('WebSocket', WebSocket);
setGlobalValue('navigator', JSDOM.window.navigator);
setGlobalValue('location', JSDOM.window.location);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const webIM = require('./utils/websdk3.1.4.js').default;

const WebIMConfig = {
  xmppURL: 'https://im-api-vip6-v2.easecdn.com/ws',
  apiURL: 'https://a1-vip6.easecdn.com',
  appkey: 'cx-dev#cxstudy',
  Host: 'easemob.com',
  https: true,
  isHttpDNS: false,
  isMultiLoginSessions: true,
  isAutoLogin: true,
  isWindowSDK: false,
  isSandBox: false,
  isDebug: false,
  autoReconnectNumMax: 2,
  autoReconnectInterval: 2,
  isWebRTC: false,
  heartBeatWait: 4500,
  delivery: false,
};

const conn = new webIM.connection({
  isMultiLoginSessions: WebIMConfig.isMultiLoginSessions,
  https: WebIMConfig.https,
  url: WebIMConfig.xmppURL,
  apiUrl: WebIMConfig.apiURL,
  isAutoLogin: WebIMConfig.isAutoLogin,
  heartBeatWait: WebIMConfig.heartBeatWait,
  autoReconnectNumMax: WebIMConfig.autoReconnectNumMax,
  autoReconnectInterval: WebIMConfig.autoReconnectInterval,
  appKey: WebIMConfig.appkey,
  isHttpDNS: WebIMConfig.isHttpDNS,
});

async function configure(phone: string) {
  const config = getStoredUser(phone);
  let local = false;
  console.log(blue('自动签到支持 [普通/手势/拍照/签到码/位置]'));
  if (config?.monitor) {
    local = (
      await prompts(
        {
          type: 'confirm',
          name: 'local',
          message: '是否用本地缓存的签到信息?',
          initial: true,
        },
        PromptsOptions
      )
    ).local;
  }
  // 若不使用本地，则配置并写入本地
  if (!local) {
    const presetAddress = await addressPrompts();
    const response = await prompts(monitorPromptsQuestions, PromptsOptions);
    const monitor: any = {};
    const mailing: any = {};
    const cqserver: any = {};
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
    cqserver.cq_enabled = response.cq_enabled;
    cqserver.ws_url = response.ws_url;
    cqserver.target_type = response.target_type;
    cqserver.target_id = response.target_id;
    config!.monitor = monitor;
    config!.mailing = mailing;
    config!.cqserver = cqserver;

    dbUpdateUserConfig(phone, { monitor, mailing, cqserver });
  }

  return JSON.parse(JSON.stringify({ mailing: config!.mailing, monitor: config!.monitor, cqserver: config!.cqserver }));
}

type DetectedActivity = Omit<Activity, 'courseId' | 'classId' | 'otherId'> & {
  courseId?: string;
  classId?: string;
  otherId?: number;
};

async function Sign(realname: string, params: UserCookieType & { tuid: string; }, config: any, activity: DetectedActivity) {
  let result = null;
  // 群聊签到，无课程
  if (!activity.courseId) {
    const page = await preSign2({ ...activity, ...params, chatId: activity.chatId as string });
    const activityType = speculateType(page);
    switch (activityType) {
      case 'general': {
        result = await GeneralSign_2({ activeId: activity.activeId, ...params });
        break;
      }
      case 'photo': {
        const objectId = await getObjectIdFromcxPan(params);
        if (objectId === null) return null;
        result = await PhotoSign_2({ objectId, activeId: activity.activeId, ...params });
        break;
      }
      case 'location': {
        result = await LocationSign_2({
          name: realname,
          presetAddress: config.presetAddress,
          activeId: activity.activeId,
          ...params,
        });
        break;
      }
      case 'qr': {
        result = '[二维码]请发送二维码照片';
        console.log(red('二维码签到，需人工干预！'));
        break;
      }
    }
    return result;
  }

  // 课程签到
  await preSign({ ...activity, courseId: activity.courseId!, classId: activity.classId!, ...params });
  switch (activity.otherId) {
    case 2: {
      // 二维码签到
      result = '[二维码]请发送二维码照片';
      console.log(red('二维码签到，需人工干预！'));
      break;
    }
    case 4: {
      // 位置签到
      result = await LocationSign({
        name: realname,
        presetAddress: config.presetAddress,
        activeId: activity.activeId,
        ...params,
      });
      break;
    }
    case 3: {
      // 手势签到
      result = await GeneralSign({ name: realname, activeId: activity.activeId, ...params });
      break;
    }
    case 5: {
      // 签到码签到
      result = await GeneralSign({ name: realname, activeId: activity.activeId, ...params });
      break;
    }
    case 0: {
      if (activity.ifphoto === 0) {
        result = await GeneralSign({ name: realname, activeId: activity.activeId, ...params });
        break;
      } else {
        const objectId = await getObjectIdFromcxPan(params);
        if (objectId === null) return null;
        result = await PhotoSign({ name: realname, activeId: activity.activeId, objectId, ...params });
        break;
      }
    }
  }
  return result;
}

/**
 * 从超星 IM 消息中提取签到活动。
 *
 * 课程签到通常位于 att_chat_course，群聊签到可能没有 courseInfo，
 * 也可能使用带有 sign/active 标记的其他附件结构。这里只负责发现活动，
 * 具体签到仍统一交给 Sign() 处理。
 */
function getSignActivity(message: any): DetectedActivity | null {
  const attachment = message?.ext?.attachment;

  const visited = new Set<any>();
  let activity: DetectedActivity | null = null;

  const visit = (value: any, fieldName = '') => {
    if (activity || value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);

    const activeId = value.aid ?? value.activeId ?? value.activeid ?? value.activityId;
    const url = [value.url, value.signUrl, value.activeUrl]
      .find((item) => typeof item === 'string' && item.length > 0);
    const courseInfo = value.courseInfo;
    const hasCourse = !!(courseInfo?.courseid || courseInfo?.courseId);
    const signMarked = (typeof url === 'string' && /sign|签到/i.test(url))
      || /sign|签到|active/i.test(fieldName);
    // 无课程群聊活动常见为 att_chat_course，但没有 courseInfo。
    // 普通签到卡片也可能没有 sign URL；att_chat_course + aid 本身就是活动消息。
    const isChatActivity = fieldName === 'att_chat_course' && activeId;

    if (activeId && (signMarked || isChatActivity)) {
      activity = {
        activeId: String(activeId),
        courseId: courseInfo?.courseid ?? courseInfo?.courseId,
        classId: courseInfo?.classid ?? courseInfo?.classId,
        chatId: message?.to,
      };
      return;
    }

    for (const [key, child] of Object.entries(value)) visit(child, key);
  };

  if (attachment && typeof attachment === 'object') visit(attachment);
  else if (typeof attachment === 'string') {
    try { visit(JSON.parse(attachment)); } catch { /* 非 JSON 附件 */ }
  }
  // 某些版本把附件序列化成 JSON 字符串，补充解析消息正文中的 JSON。
  if (!activity) {
    const candidates = [message?.data, message?.body, message?.msg, message?.content];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      try {
        visit(JSON.parse(candidate));
      } catch { /* 普通文本不是活动载荷 */ }
      if (activity) break;
    }
  }
  return activity;
}

async function handleMsg(this: CQ, data: string) {
  // 处理图片，是否二维码，发送一些其他反馈
  if (CQ.hasImage(data) && this.getCache('params') !== undefined) {
    console.log('[图片]尝试二维码识别');
    const img_url = data.match(/https:\/\/[\S]+[^\]]/g)![0];
    const params = this.getCache('params');
    const qr_str = (await QrCodeScan(img_url, 'url')).CodeResults?.[0].Url;

    if (typeof qr_str === 'undefined') this.send('是否已配置腾讯云OCR？图像是否包含清晰二维码？', this.getTargetID());
    else {
      params.enc = qr_str.match(/(?<=&enc=)[\dA-Z]+/)?.[0];
      const result = await QRCodeSign(params);
      this.send(`${result} - ${params.name}`, this.getTargetID());
      // 签到成功则清理缓存
      result === '[二维码]签到成功' ? this.clearCache() : this.send(result, this.getTargetID());
    }
  }
}

let shuttingDown = false;
let reconnectTimer: NodeJS.Timeout | undefined;

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  restoreTerminal();
  writeMonitorLog(process.argv[2] === '--auth' ? process.argv[3] : 'cli', 'shutdown', { reason: 'SIGINT' });
  setTimeout(() => process.exit(0), 50).unref();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('exit', restoreTerminal);
process.on('uncaughtException', (error) => {
  writeMonitorLog(process.argv[2] === '--auth' ? process.argv[3] : 'cli', 'uncaughtException', { message: error.message, stack: error.stack });
  console.error('[监听异常]', error);
});
process.on('unhandledRejection', (reason) => {
  writeMonitorLog(process.argv[2] === '--auth' ? process.argv[3] : 'cli', 'unhandledRejection', reason);
});

// 开始运行
(async () => {
  let params: any = {};
  let config: any = {};
  // 若凭证由命令参数传来，直接解析赋值；否则，直接用户名密码登录获取凭证
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
    config.cqserver = { ...auth_config.config.cqserver };
    writeMonitorLog(params.phone, 'startup', { mode: 'web', config: config.monitor });
  } else {
    // 打印本地用户列表，并返回用户数量
    const userItem = (
      await prompts(
        { type: 'select', name: 'userItem', message: '选择用户', choices: getLocalUsers(), initial: 0 },
        PromptsOptions
      )
    ).userItem;
    // 手动登录
    if (userItem === -1) {
      const phone = (await prompts({ type: 'text', name: 'phone', message: '手机号' }, PromptsOptions)).phone;
      const password = (await prompts({ type: 'password', name: 'password', message: '密码' }, PromptsOptions)).password;
      // 登录获取各参数
      params = await userLogin(phone, password);
      if (params === 'AuthFailed') process.exit(0);
      storeUser(phone, { phone, params }); // 储存到本地
      params.phone = phone;
    } else {
      // 使用本地储存的参数
      const users = dbGetAllUsers();
      const user = users[userItem];
      params = user.params;
      params.phone = user.phone;
    }
    // 手动配置签到信息
    config = await configure(params.phone);
  }

  // 获取IM参数
  const IM_Params = await getIMParams(params as UserCookieType);
  if (IM_Params === 'AuthFailed') {
    if (process.send) process.send('authfail');
    process.exit(0);
  }
  if (IM_Params === 'WebIMUnavailable') {
    const message = 'WebIM 服务端当前维护中，无法获取 IM 参数，监听进程将退出。';
    writeMonitorLog(params.phone || 'cli', 'webim_unavailable', { message });
    if (process.send) process.send({ type: 'startup_error', message });
    process.exit(1);
  }
  params.tuid = IM_Params.myTuid;
  params.name = IM_Params.myName;
  writeMonitorLog(params.phone || 'cli', 'im_params_ready', { tuid: IM_Params.myTuid });

  let cq: CQ;
  // 建立连接，添加监听事件并绑定处理函数
  if (config.cqserver?.cq_enabled) {
    cq = new CQ(config.cqserver.ws_url, config.cqserver.target_type, config.cqserver.target_id);
    cq.connect();
    cq.onMessage(handleMsg);
  }

  const openConnection = () => conn.open({
    apiUrl: WebIMConfig.apiURL,
    user: IM_Params.myTuid,
    accessToken: IM_Params.myToken,
    appKey: WebIMConfig.appkey,
  });

  conn.listen({
    onOpened: () => {
      writeMonitorLog(params.phone || 'cli', 'connection_opened', {});
      if (process.send) process.send('success');
    },
    onClosed: () => {
      writeMonitorLog(params.phone || 'cli', 'connection_closed', {});
      if (shuttingDown) return;
      console.log('[监听连接关闭] 5 秒后自动重连');
      reconnectTimer = setTimeout(openConnection, 5000);
    },
    onTextMessage: async (message: any) => {
      writeMonitorLog(params.phone || 'cli', 'raw_message', message);
      const IM_ActivityInfo = getSignActivity(message);
      if (IM_ActivityInfo) {
        process.send?.({
          type: 'sign_event',
          event: { type: 'detected', activeId: IM_ActivityInfo.activeId, time: Date.now() }
        });
        const PPTActiveInfo = await getPPTActiveInfo({ activeId: IM_ActivityInfo.activeId, ...(params as UserCookieType) });

        // 签到 & 推送消息
        // 签到检测通知推送
        if (config.cqserver?.cq_enabled) {
          cq.send(`${IM_Params.myName}，检测到${getSignType(PPTActiveInfo)}，将在${config.monitor.delay}秒后处理`, config.cqserver.target_id);
          cq.setCache('params', { ...params, activeId: IM_ActivityInfo.activeId });
        }

        process.send?.({
          type: 'sign_event',
          event: { type: 'processing', activeId: IM_ActivityInfo.activeId, signType: getSignType(PPTActiveInfo), time: Date.now() }
        });

        await delay(config.monitor.delay);
        const result = await Sign(IM_Params.myName, params, config.monitor, {
          classId: IM_ActivityInfo.classId,
          courseId: IM_ActivityInfo.courseId,
          activeId: IM_ActivityInfo.activeId,
          otherId: PPTActiveInfo.otherId,
          ifphoto: PPTActiveInfo.ifphoto,
          chatId: IM_ActivityInfo.chatId,
        });
        process.send?.({
          type: 'sign_event',
          event: { type: 'result', activeId: IM_ActivityInfo.activeId, signType: getSignType(PPTActiveInfo), result: result || '未返回结果', time: Date.now() }
        });
        // 邮件推送签到结果
        if (config.mailing?.enabled) {
          sendEmail({
            aid: IM_ActivityInfo.activeId,
            uid: params._uid,
            realname: IM_Params.myName,
            status: result,
            mailing: config.mailing,
          });
        }
        // CQ 推送签到结果
        if (config.cqserver?.cq_enabled) {
          cq.send(`${result} - ${IM_Params.myName}`, config.cqserver.target_id);
        }

      }
    },
    // 签到卡片在不同版本可能通过自定义/命令消息到达，先完整记录以便确认真实协议。
    onCustomMessage: (message: any) => {
      writeMonitorLog(params.phone || 'cli', 'raw_custom_message', message);
    },
    onCmdMessage: (message: any) => {
      writeMonitorLog(params.phone || 'cli', 'raw_cmd_message', message);
    },
    onPresence: (message: any) => {
      writeMonitorLog(params.phone || 'cli', 'presence_message', message);
    },
    onError: (msg: string) => {
      writeMonitorLog(params.phone || 'cli', 'connection_error', msg);
      console.log(red('[发生异常]'), msg);
    },
  });

  openConnection();

  console.log(blue(`[监听中] ${config.cqserver.cq_enabled ? 'CQ服务器已连接' : ''} ${config.mailing?.enabled ? '邮件推送已开启' : ''}...`));
})().catch((error) => {
  const phone = process.argv[2] === '--auth' ? process.argv[3] : 'cli';
  writeMonitorLog(phone, 'startup_error', { message: error?.message, stack: error?.stack });
  console.error(red('[监听启动失败]'), error);
  restoreTerminal();
  if (process.send) process.send({ type: 'startup_error', message: error?.message || '未知错误' });
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 50).unref();
});
