import Router from '@koa/router';
import { ChildProcess, fork } from 'child_process';
import fs from 'fs';
import Koa from 'koa';
import bodyparser from 'koa-bodyparser';
import multiparty from 'multiparty';
import path from 'path';
import serverless from 'serverless-http';
import { getPPTActiveInfo, getSignType, preSign, traverseCourseActivity } from './functions/activity';
import { GeneralSign } from './functions/general';
import { LocationSign } from './functions/location';
import { PhotoSign, uploadPhoto, getObjectIdFromcxPan } from './functions/photo';
import { QRCodeSign } from './functions/qrcode';
import { QrCodeScan } from './functions/tencent.qrcode';
import { getAccountInfo, getCourses, getPanToken, userLogin } from './functions/user';
import { getJsonObject, storeUser } from './utils/file';
import { dbGetUser, dbGetUserCourses, dbUpsertCourse, dbDeleteCourse } from './utils/db';
import { delay } from './utils/helper';
import { writeMonitorLog } from './utils/monitorLogger';
import { restoreTerminal } from './utils/terminal';
const ENVJSON = getJsonObject('env.json');

// pnpm/turbo 退出异常后可能遗留控制台 raw mode，服务启动时主动复位。
restoreTerminal();

const app = new Koa();
const router = new Router();
const processMap = new Map<string, ChildProcess>();
const monitorEvents = new Map<string, any[]>();

process.on('uncaughtException', (error) => {
  writeMonitorLog('server', 'uncaughtException', { message: error.message, stack: error.stack });
  console.error('[服务端未捕获异常]', error);
});
process.on('unhandledRejection', (reason) => {
  writeMonitorLog('server', 'unhandledRejection', reason);
  console.error('[服务端未处理异步异常]', reason);
});

const appendMonitorEvent = (phone: string, event: any) => {
  const events = monitorEvents.get(phone) || [];
  events.unshift({ ...event, id: `${Date.now()}-${Math.random()}` });
  monitorEvents.set(phone, events.slice(0, 100));
};

router.get('/', async (ctx) => {
  ctx.body = '<h1 style="text-align: center">Welcome, chaoxing-sign-cli API service is running.</h1>';
});

router.post('/login', async (ctx) => {
  const { phone, password } = ctx.request.body as any;
  const params = await userLogin(phone, password);
  // 登陆失败
  if (typeof params === 'string') {
    ctx.body = params;
    return;
  }
  params.name = (await getAccountInfo(params)) || '获取失败';
  // 保存到 storage.json，使手动签到 / 课程记录 / 云盘上传等功能可按 phone 查到凭证
  storeUser(phone, { phone, params });
  console.log(ctx.request.body);
  ctx.body = params;
});

router.post('/activity', async (ctx) => {
  const { uid, _d, vc3, uf } = ctx.request.body as any;
  const courses = await getCourses(uid, _d, vc3);
  // 身份凭证过期
  if (typeof courses === 'string') {
    ctx.body = courses;
    return;
  }
  const activity = await traverseCourseActivity({
    courses,
    uf: uf,
    _d: _d,
    _uid: uid,
    vc3: vc3,
  });
  // 无活动
  if (typeof activity === 'string') {
    ctx.body = activity;
    return;
  }
  // 对活动进行预签
  await preSign({
    uf,
    _d,
    vc3,
    _uid: uid,
    ...activity,
  });
  console.log(uid);
  ctx.body = activity;
});

router.post('/qrcode', async (ctx) => {
  const { name, fid, uid, activeId, uf, _d, vc3, enc, lat, lon, address, altitude } = ctx.request.body as any;
  const res = await QRCodeSign({
    enc,
    name,
    fid,
    _uid: uid,
    activeId,
    uf,
    _d,
    vc3,
    lat,
    lon,
    address,
    altitude
  });
  console.log(name, uid);
  if (res === 'success') {
    ctx.body = 'success';
    return;
  } else {
    ctx.body = res;
  }
});

router.post('/location', async (ctx) => {
  const { uf, _d, vc3, name, uid, lat, lon, fid, address, activeId } = ctx.request.body as any;
  const res = await LocationSign({
    uf,
    _d,
    vc3,
    name,
    address,
    activeId,
    _uid: uid,
    lat,
    lon,
    fid,
  });
  console.log(name, uid);
  if (res === 'success') {
    ctx.body = 'success';
    return;
  } else {
    ctx.body = res;
  }
});

router.post('/general', async (ctx) => {
  const { uf, _d, vc3, name, activeId, uid, fid } = ctx.request.body as any;
  const res = await GeneralSign({
    uf,
    _d,
    vc3,
    name,
    activeId,
    _uid: uid,
    fid,
  });
  console.log(name, uid);
  if (res === 'success') {
    ctx.body = 'success';
    return;
  } else {
    ctx.body = res;
  }
});

router.post('/uvtoken', async (ctx) => {
  const { uf, _d, uid, vc3 } = ctx.request.body as any;
  const res = await getPanToken({
    uf,
    _d,
    _uid: uid,
    vc3,
  });
  ctx.body = JSON.parse(res); // 获得的是个JSON字符串，需转换
});

router.post('/upload', async (ctx) => {
  const form = new multiparty.Form();
  const fields: any = {};
  const data: any[] = [];

  const result = await new Promise((resolve) => {
    // 解析到part时，判断是否为文件
    form.on('part', (part: any) => {
      if (part.filename !== undefined) {
        // 存入data数组
        part.on('data', (chunk: any) => {
          data.push(chunk);
        });
        // 存完继续
        part.on('close', () => {
          part.resume();
        });
      }
    });
    // 解析遇到文本时
    form.on('field', (name: string, str: string) => {
      fields[name] = str;
    });
    // 解析完成后
    form.on('close', async () => {
      const buffer = Buffer.concat(data);
      const res = await uploadPhoto({
        uf: fields['uf'],
        _d: fields['_d'],
        _uid: fields['_uid'],
        vc3: fields['vc3'],
        token: ctx.query._token as string,
        buffer,
      });
      resolve(res);
      // console.log(res);
    });
    // 解析请求表单
    form.parse(ctx.req);
  });
  ctx.body = result;
});

router.post('/photo', async (ctx) => {
  const { uf, _d, uid, vc3, name, activeId, fid, objectId } = ctx.request.body as any;
  const res = await PhotoSign({
    uf,
    _d,
    vc3,
    name,
    activeId,
    _uid: uid,
    fid,
    objectId,
  });
  console.log(name, uid);
  if (res === 'success') {
    ctx.body = 'success';
    return;
  } else {
    ctx.body = res;
  }
});

router.post('/qrocr', async (ctx) => {
  const form = new multiparty.Form();
  const data: any[] = [];
  const result = await new Promise((resolve) => {
    form.on('part', (part: any) => {
      if (part.filename !== undefined) {
        part.on('data', (chunk: any) => {
          data.push(chunk);
        });
        part.on('close', () => {
          part.resume();
        });
      }
    });
    form.on('close', async () => {
      const buffer = Buffer.concat(data);
      const base64str = buffer.toString('base64');
      let res: any;
      try {
        res = await QrCodeScan(base64str, 'base64');
        const url = res.CodeResults[0].Url;
        const enc_start = url.indexOf('enc=') + 4;
        const result = url.substring(enc_start, url.indexOf('&', enc_start));
        resolve(result);
      } catch (error) {
        resolve('识别失败');
      }
    });
    form.parse(ctx.req);
  });
  ctx.body = result;
});

// 200:监听中，201:未监听，202:登录失败
router.get('/monitor/status/:phone', (ctx) => {
  // 状态为正在监听
  if (processMap.get(ctx.params.phone)) {
    ctx.body = { code: 200, msg: 'Monitoring' };
  } else {
    ctx.body = { code: 201, msg: 'Suspended' };
  }
});

router.post('/monitor/stop/:phone', (ctx) => {
  const phone = ctx.params.phone;
  const process_monitor = processMap.get(phone);
  if (process_monitor !== undefined) {
    process_monitor.kill('SIGKILL');
    processMap.delete(phone);
  }
  ctx.body = { code: 201, msg: 'Suspended' };
});

router.get('/monitor/events/:phone', (ctx) => {
  ctx.body = { code: 200, events: monitorEvents.get(ctx.params.phone) || [] };
});

router.post('/monitor/events/:phone/clear', (ctx) => {
  monitorEvents.delete(ctx.params.phone);
  ctx.body = { code: 200, events: [] };
});

// base64字串需包含 credentials, monitor, mailing, cqserver 内容
router.post('/monitor/start/:phone', async (ctx) => {
  const phone = ctx.params.phone;
  const rawBody = (ctx.request as any).rawBody;
  const parsedBody = (ctx.request as any).body;
  writeMonitorLog(phone, 'start_request', {
    contentType: ctx.request.headers['content-type'],
    rawBodyType: typeof rawBody,
    parsedBodyType: typeof parsedBody,
    bodyKeys: parsedBody && typeof parsedBody === 'object' ? Object.keys(parsedBody) : [],
  });
  if (processMap.get(ctx.params.phone) !== undefined) {
    ctx.body = { code: 200, msg: 'Already started' };
    return;
  }
  const monitorIsTypeScript = !fs.existsSync(path.join(__dirname, 'monitor.js'));
  // env.json 的 monitor.mode 为 "poll" 时走 HTTP 轮询（不依赖 WebIM），否则走 WebSocket 监听。
  let monitorMode = 'websocket';
  try { monitorMode = getJsonObject('env.json').monitor?.mode || 'websocket'; } catch { /* 缺失走默认 */ }
  const monitorFile = monitorMode === 'poll' ? 'poll' : 'monitor';
  const monitorScript = path.join(__dirname, monitorIsTypeScript ? `${monitorFile}.ts` : `${monitorFile}.js`);
  let authPayload: string | undefined;
  // 当前 Web 端发送 { payload: base64 }；兼容旧版本直接发送 base64 字符串。
  if (parsedBody && typeof parsedBody === 'object' && typeof parsedBody.payload === 'string') {
    authPayload = parsedBody.payload;
  } else if (typeof parsedBody === 'string') {
    authPayload = parsedBody;
  } else if (typeof rawBody === 'string') {
    try {
      const rawJson = JSON.parse(rawBody);
      authPayload = typeof rawJson?.payload === 'string' ? rawJson.payload : rawBody;
    } catch {
      authPayload = rawBody;
    }
  }
  if (typeof authPayload !== 'string' || authPayload.length === 0) {
    writeMonitorLog(phone, 'start_rejected', { reason: 'empty_payload' });
    ctx.status = 400;
    ctx.body = { code: 400, msg: '监听启动参数为空' };
    return;
  }

  writeMonitorLog(phone, 'fork_prepare', {
    script: monitorScript,
    exists: fs.existsSync(monitorScript),
    isTypeScript: monitorIsTypeScript,
    payloadLength: authPayload.length,
    execPath: process.execPath,
  });
  let process_monitor: ChildProcess;
  try {
    process_monitor = fork(monitorScript,
      ['--auth', phone, authPayload],
      {
        cwd: __dirname,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        // pnpm dev 下 fork 的是 TypeScript 文件，需要显式加载 ts-node。
        execArgv: monitorIsTypeScript ? ['-r', require.resolve('ts-node/register')] : [],
      }
    );
  } catch (error: any) {
    writeMonitorLog(phone, 'fork_throw', { message: error?.message, stack: error?.stack });
    ctx.status = 500;
    ctx.body = { code: 500, msg: `监听进程启动失败：${error?.message || '未知错误'}` };
    return;
  }
  writeMonitorLog(phone, 'child_process_forked', { pid: process_monitor.pid });
  processMap.set(ctx.params.phone, process_monitor);
  process_monitor.on('message', (msg) => {
    const monitorMessage = msg as any;
    if (monitorMessage?.type === 'sign_event') {
      appendMonitorEvent(ctx.params.phone, monitorMessage.event);
    } else if (monitorMessage?.type === 'startup_error') {
      writeMonitorLog(phone, 'child_startup_error', monitorMessage);
    }
  });
  process_monitor.on('error', (error) => {
    console.error('[监听进程异常]', error);
    writeMonitorLog(ctx.params.phone, 'child_process_error', { message: error.message, stack: error.stack });
    processMap.delete(ctx.params.phone);
  });
  process_monitor.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    console.error('[监听子进程]', text.trim());
    writeMonitorLog(phone, 'child_stderr', text);
  });
  process_monitor.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    console.log('[监听子进程]', text.trim());
    writeMonitorLog(phone, 'child_stdout', text);
  });
  process_monitor.on('exit', (code, signal) => {
    writeMonitorLog(phone, 'child_process_exit', { code, signal, pid: process_monitor.pid });
    processMap.delete(ctx.params.phone);
  });
  // 监听服务已启动即立即响应，不等待 IM 长连接建立，避免前端按钮永久卡住。
  ctx.body = { code: 200, msg: 'Monitor starting' };
});

// ===================== 课程管理 CRUD =====================

router.get('/courses/:phone', (ctx) => {
  ctx.body = { code: 200, courses: dbGetUserCourses(ctx.params.phone) };
});

router.post('/courses/:phone', (ctx) => {
  const body = ctx.request.body as any;
  const { courseId, courseName, autoSign, photoPath } = body;
  if (!courseId) { ctx.status = 400; ctx.body = { code: 400, msg: '缺少 courseId' }; return; }
  dbUpsertCourse(ctx.params.phone, { courseId: String(courseId), courseName, autoSign, photoPath });
  ctx.body = { code: 200, courses: dbGetUserCourses(ctx.params.phone) };
});

router.delete('/courses/:phone/:courseId', (ctx) => {
  dbDeleteCourse(ctx.params.phone, ctx.params.courseId);
  ctx.body = { code: 200, courses: dbGetUserCourses(ctx.params.phone) };
});

// ===================== 云盘上传 =====================

router.post('/upload-pan/:phone', async (ctx) => {
  const phone = ctx.params.phone;
  const user = dbGetUser(phone);
  if (!user || !user.params || !user.params._uid) { ctx.body = { success: false, msg: '用户凭证不存在，请重新登录' }; return; }
  const cookies = { ...user.params } as any;

  const contentType = ctx.request.headers['content-type'] || '';
  if (!contentType.includes('multipart')) { ctx.body = { success: false, msg: '请上传文件' }; return; }

  const form = new multiparty.Form();
  const fileChunks: any[] = [];
  await new Promise<void>((resolve) => {
    form.on('part', (part: any) => {
      if (part.filename !== undefined) {
        part.on('data', (chunk: any) => fileChunks.push(chunk));
        part.on('close', () => part.resume());
      }
    });
    form.on('close', () => resolve());
    form.parse(ctx.req);
  });
  const buffer = Buffer.concat(fileChunks);
  if (buffer.length === 0) { ctx.body = { success: false, msg: '未收到文件' }; return; }

  try {
    const tokenRes = await getPanToken(cookies);
    const token = JSON.parse(tokenRes)._token;
    const uploadRes = await uploadPhoto({ ...cookies, buffer, token });
    const objectId = JSON.parse(uploadRes).objectId;
    if (objectId) {
      ctx.body = { success: true, msg: '上传成功', objectId };
    } else {
      ctx.body = { success: false, msg: '上传失败，未获取到 objectId', raw: uploadRes };
    }
  } catch (e: any) {
    ctx.body = { success: false, msg: `上传异常：${e?.message || e}` };
  }
});

// ===================== 云盘图片列表 =====================

router.get('/pan-photos/:phone', async (ctx) => {
  const phone = ctx.params.phone;
  const user = dbGetUser(phone);
  if (!user || !user.params || !user.params._uid) { ctx.body = { success: false, msg: '用户凭证不存在，请重新登录' }; return; }
  const cookies = { ...user.params } as any;
  try {
    const objectId = await getObjectIdFromcxPan(cookies);
    if (objectId) {
      ctx.body = { success: true, objectId, msg: '找到云盘图片 0.jpg/0.png' };
    } else {
      ctx.body = { success: false, msg: '云盘中未找到 0.jpg 或 0.png，请先上传' };
    }
  } catch (e: any) {
    ctx.body = { success: false, msg: `查询云盘失败：${e?.message || e}` };
  }
});

// ===================== 手动签到统一入口 =====================

router.post('/monitor/sign/:phone', async (ctx) => {
  const phone = ctx.params.phone;
  const contentType = ctx.request.headers['content-type'] || '';

  // 从 SQLite 查该用户的凭证
  const user = dbGetUser(phone);
  if (!user || !user.params || !user.params._uid) { ctx.body = { success: false, msg: '用户凭证不存在，请重新登录账号' }; return; }
  const cookies = { ...user.params } as any;
  const name = user.params.name || phone;

  let body: any;
  let photoBuffer: Buffer | null = null;

  if (contentType.includes('multipart')) {
    // 拍照签到：multipart 表单（文件 + 字段）
    const form = new multiparty.Form();
    const fields: any = {};
    const fileChunks: any[] = [];
    await new Promise<void>((resolve) => {
      form.on('part', (part: any) => {
        if (part.filename !== undefined) {
          part.on('data', (chunk: any) => fileChunks.push(chunk));
          part.on('close', () => part.resume());
        }
      });
      form.on('field', (n: string, v: string) => { fields[n] = v; });
      form.on('close', () => { photoBuffer = Buffer.concat(fileChunks); resolve(); });
      form.parse(ctx.req);
    });
    body = fields;
  } else {
    body = ctx.request.body as any;
  }

  const { activeId, otherId, courseId, classId } = body;
  if (!activeId) { ctx.body = { success: false, msg: '缺少 activeId' }; return; }
  const oid = Number(otherId);

  writeMonitorLog(phone, 'manual_sign_request', { activeId, otherId: oid, courseId, hasPhoto: !!photoBuffer });

  try {
    // 预签
    if (courseId && classId) {
      await preSign({ activeId, courseId, classId, ...cookies });
    }

    let result = '';
    if (oid === 2) {
      // 二维码签到
      const { enc, lat, lon, address, altitude } = body;
      result = await QRCodeSign({ enc, name, activeId, address, lat, lon, altitude, ...cookies });
    } else if (oid === 4) {
      // 位置签到
      const { lat, lon, address } = body;
      result = await LocationSign({ name, activeId, lat, lon, address, ...cookies });
    } else if (oid === 0 && photoBuffer) {
      // 拍照签到（上传本地文件）
      const tokenRes = await getPanToken(cookies);
      const token = JSON.parse(tokenRes)._token;
      const uploadRes = await uploadPhoto({ ...cookies, buffer: photoBuffer, token });
      const objectId = JSON.parse(uploadRes).objectId;
      if (!objectId) { result = '[拍照]上传失败，未获取到 objectId'; }
      else { result = await PhotoSign({ name, activeId, objectId, ...cookies }); }
    } else if (oid === 0 && body.objectId) {
      // 拍照签到（使用云盘已有图片的 objectId）
      result = await PhotoSign({ name, activeId, objectId: body.objectId, ...cookies });
    } else {
      // 普通 / 手势 / 签到码
      result = await GeneralSign({ name, activeId, ...cookies });
    }

    const success = result.includes('签到成功');
    writeMonitorLog(phone, 'manual_sign_result', { activeId, result, success });
    // 注入到 monitor 事件流，让右侧任务流能看到手动签到结果
    appendMonitorEvent(phone, { type: 'result', activeId, signType: getSignType({ otherId: oid, ifphoto: photoBuffer ? 1 : 0 }), result, time: Date.now(), manual: true });
    ctx.body = { success, msg: result };
  } catch (e: any) {
    writeMonitorLog(phone, 'manual_sign_error', { activeId, message: e?.message, stack: e?.stack });
    ctx.body = { success: false, msg: `签到异常：${e?.message || e}` };
  }
});

app.use(bodyparser({ enableTypes: ['json', 'form', 'text'] }));
app.use(async (ctx, next) => {
  await next();
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Access-Control-Allow-Headers', 'Content-Type');
  if (ctx.method === 'OPTIONS') {
    ctx.set('Access-Control-Max-Age', '300');
    ctx.body = '';
  }
});
app.use(router.routes());

// Ctrl + C 终止程序
let serverShuttingDown = false;
const shutdownServer = () => {
  if (serverShuttingDown) return;
  serverShuttingDown = true;
  restoreTerminal();
  processMap.forEach((pcs) => {
    if (!pcs.killed) pcs.kill('SIGTERM');
  });
  setTimeout(() => process.exit(0), 300);
};

process.once('SIGINT', shutdownServer);
process.once('SIGTERM', shutdownServer);
process.once('exit', restoreTerminal);

// 若在服务器，直接运行
if (!ENVJSON.env.SERVERLESS)
  app.listen(5000, () => {
    console.log('API Server: http://localhost:5000');
  });

// 导出云函数
export const main = serverless(app);
export const handler = main;
export const main_handler = main;
