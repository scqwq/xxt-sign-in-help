import cryptojs from 'crypto-js';
import { blue } from 'kolorist';
import { ACCOUNTMANAGE, COURSELIST, LOGIN, PANTOKEN, WEBIM } from '../configs/api';
import { getAppConfig } from '../config';
import { dbGetAllUsers } from '../utils/db';
import { writeMonitorLog } from '../utils/monitorLogger';
import { cookieSerialize, request } from '../utils/request';

const DefaultParams: UserCookieType = {
  fid: '-1',
  pid: '-1',
  refer: 'http%3A%2F%2Fi.chaoxing.com',
  _blank: '1',
  t: true,
  vc3: '',
  _uid: '',
  _d: '',
  uf: '',
  lv: '',
};

export const userLogin = async (uname: string, password: string): Promise<string | UserCookieType> => {
  // 密码加密
  const wordArray = cryptojs.enc.Utf8.parse('u2oh6Vu^HWe40fj');
  const encryptedPassword = cryptojs.DES.encrypt(password, wordArray, {
    mode: cryptojs.mode.ECB,
    padding: cryptojs.pad.Pkcs7,
  });
  password = encryptedPassword.ciphertext.toString();

  const formdata = `uname=${uname}&password=${password}&fid=-1&t=true&refer=https%253A%252F%252Fi.chaoxing.com&forbidotherlogin=0&validate=`;

  // 发送请求
  const result = await request(
    LOGIN.URL,
    {
      method: LOGIN.METHOD,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
    },
    formdata
  );

  // 获取结果
  if (JSON.parse(result.data).status) {
    const cookies = result.headers['set-cookie'];
    let c_equal, c_semi, itemName, itemValue;

    // 将每一项 cookie 以键值对形式存入 Map，再转为对象，合并到默认参数中
    const map = new Map();
    if (!cookies) {
      console.log('网络异常，换个环境重试');
      return 'AuthFailed';
    }

    for (let i = 0; i < cookies!.length; i++) {
      c_equal = cookies![i].indexOf('=');
      c_semi = cookies![i].indexOf(';');
      itemName = cookies![i].substring(0, c_equal);
      itemValue = cookies![i].substring(c_equal + 1, c_semi);
      map.set(itemName, itemValue);
    }
    const rt_cookies = Object.fromEntries(map.entries());

    console.log('登陆成功');
    const loginResult = Object.assign({ ...DefaultParams }, rt_cookies);
    return loginResult;
  }

  console.log('登陆失败');
  return 'AuthFailed';
};

// 返回全部课程
export const getCourses = async (_uid: string, _d: string, vc3: string): Promise<CourseType[] | string> => {
  const formdata = 'courseType=1&courseFolderId=0&courseFolderSize=0';
  const result = await request(
    COURSELIST.URL,
    {
      gzip: true,
      method: COURSELIST.METHOD,
      headers: {
        Accept: 'text/html, */*; q=0.01',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8;',
        Cookie: `_uid=${_uid}; _d=${_d}; vc3=${vc3}`,
      },
    },
    formdata
  );

  if (result.statusCode === 302) {
    console.log('身份过期，程序将关闭，请你使用手动填写用户名密码的方式登录！手动登录后身份信息刷新，之后可继续使用本地凭证！\n');
    return 'AuthFailed';
  }

  // 从 HTMl* 页面内容，解析出所有 courseId、classId 和课程名，填充到数组返回
  const data = result.data;
  const arr: CourseType[] = [];
  let end_of_courseid;
  for (let i = 1; ; i++) {
    i = data.indexOf('course_', i);
    if (i === -1) break;
    end_of_courseid = data.indexOf('_', i + 7);
    const courseId = data.slice(i + 7, end_of_courseid);
    const classId = data.slice(end_of_courseid + 1, data.indexOf('"', i + 1));
    // 尝试从 course_ 标记附近提取课程名：找最近的非空文本内容
    let courseName = '';
    const searchRegion = data.slice(i, i + 2000);
    const nameMatch = searchRegion.match(/>([^<>]{2,60})</);
    if (nameMatch && nameMatch[1].trim()) courseName = nameMatch[1].trim();
    arr.push({ courseId, classId, courseName });
  }

  if (arr.length === 0) {
    console.log(`${blue('[提示]')}无课程可查.`);
    return 'NoCourse';
  }

  return arr;
};

// 获取用户名
export const getAccountInfo = async (cookies: BasicCookie): Promise<string> => {
  const result = await request(ACCOUNTMANAGE.URL, {
    headers: {
      Cookie: cookieSerialize(cookies),
    },
  });
  const data = result.data;
  const end_of_messageName = data.indexOf('messageName') + 20;
  const name = data.slice(end_of_messageName, data.indexOf('"', end_of_messageName));
  return name;
};

// 获取用户鉴权token
export const getPanToken = async (cookies: BasicCookie) => {
  const result = await request(PANTOKEN.URL, {
    headers: {
      Cookie: cookieSerialize(cookies),
    },
  });
  return result.data;
};

/**
 * 返回用户列表
 * @returns [ { title: '手机号码', value: 索引 } , ...]
 */
export const getLocalUsers = () => {
  const users = dbGetAllUsers();
  const arr = [];
  for (let i = 0; i < users.length; i++) {
    arr.push({
      title: users[i].phone,
      value: i,
    });
  }
  arr.push({ title: '手动登录', value: -1 });
  return [...arr];
};

/**
 * 读取根目录配置的 webim 配置，构造请求头与目标 URL。
 * 抓包手机端后，把 UA（必要时再加 url / extraHeaders）填入根目录配置即可生效。
 */
const loadWebIMConfig = () => {
  const cfg = getAppConfig().webim;
  const headers: Record<string, string> = {};
  if (cfg.userAgent) headers['User-Agent'] = cfg.userAgent;
  for (const [k, v] of Object.entries(cfg.extraHeaders)) {
    if (typeof v === 'string') headers[k] = v;
  }
  return {
    url: cfg.url || WEBIM.URL,
    headers,
    credentials: cfg.credentials,
  };
};

// 在对象里按候选字段名找第一个非空字符串值（大小写不敏感，递归一层）
const findField = (obj: any, candidates: string[]): string | null => {
  if (obj === null || typeof obj !== 'object') return null;
  const lower = new Map<string, any>();
  for (const [k, v] of Object.entries(obj)) lower.set(k.toLowerCase(), v);
  for (const c of candidates) {
    const v = lower.get(c.toLowerCase());
    if (typeof v === 'string' && v.length > 0) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  // 递归一层嵌套对象/数组
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === 'object') {
      for (const c of candidates) {
        const vv = (v as any)[c];
        if (typeof vv === 'string' && vv.length > 0) return vv.trim();
        if (typeof vv === 'number') return String(vv);
      }
    }
  }
  return null;
};

/**
 * @returns \{ myName, myToken, myTuid, myPuid \}
 *
 * 默认请求 im.chaoxing.com/webim/me 解析 HTML 隐藏域。
 * 当根目录配置设置了手机端 UA / URL / 凭证时，
 * 改用该配置请求，并兼容 JSON 响应（手机端接口常返回 JSON）。
 */
export const getIMParams = async (cookies: BasicCookie): Promise<IMParamsType | 'AuthFailed' | 'WebIMUnavailable'> => {
  const webimCfg = loadWebIMConfig();
  const logId = String(cookies._uid || 'unknown');

  // 手动覆盖：webim.credentials 填了 tuid+token 就直接用，跳过 HTTP 请求。
  // 用于 webim/me 维护期间，从抓包（WebSocket 握手帧 SASL PLAIN）手动提取凭证的场景。
  const cred = webimCfg.credentials;
  if (cred && cred.tuid && cred.token) {
    const myName = cred.name || String(cookies._uid || '');
    writeMonitorLog(logId, 'webim_credentials_override', {
      myTuid: cred.tuid,
      myToken: `${cred.token.slice(0, 20)}...`,
      myName,
      message: '使用根目录 webim.credentials 手动覆盖，跳过 HTTP 取 token。',
    });
    console.log(blue('[IM凭证] 使用根目录配置手动填入的 tuid/token，跳过在线获取。'));
    return { myName, myToken: cred.token, myTuid: cred.tuid, myPuid: cookies._uid };
  }

  const reqHeaders = { ...webimCfg.headers, Cookie: cookieSerialize(cookies) };

  const result = await request(webimCfg.url, { headers: reqHeaders });
  const data = result.data;

  writeMonitorLog(logId, 'webim_response_raw', {
    url: webimCfg.url,
    userAgent: webimCfg.headers['User-Agent'] || null,
    statusCode: result.statusCode,
    headers: result.headers,
    length: typeof data === 'string' ? data.length : -1,
    containsMyName: typeof data === 'string' && data.includes('myName'),
    containsMyToken: typeof data === 'string' && data.includes('myToken'),
    containsMyTuid: typeof data === 'string' && data.includes('myTuid'),
    containsIdMyName: typeof data === 'string' && data.includes('id="myName"'),
    containsIdMyToken: typeof data === 'string' && data.includes('id="myToken"'),
    containsIdMyTuid: typeof data === 'string' && data.includes('id="myTuid"'),
    snippet: typeof data === 'string' ? data.slice(0, 12000) : String(data).slice(0, 12000),
  });

  if (data === '' || data === null || data === undefined) {
    console.log('身份凭证似乎过期，请手动登录');
    writeMonitorLog(logId, 'webim_response_empty', { statusCode: result.statusCode, headers: result.headers });
    return 'AuthFailed';
  }

  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const isWebIMMaintenancePage = /系统维护中|功能暂时无法使用|暂时无法使用/i.test(text);
  if (isWebIMMaintenancePage) {
    writeMonitorLog(logId, 'webim_service_unavailable', {
      statusCode: result.statusCode,
      headers: result.headers,
      message: 'WebIM 服务端返回维护页，当前无法获取 myName/myToken/myTuid。',
      snippet: text.slice(0, 12000),
    });
    return 'WebIMUnavailable';
  }

  // 1) 优先尝试 JSON 解析：自动探测常见字段名，无需在配置中手动映射
  const tryJson = (): { myName: string | null; myToken: string; myTuid: string } | null => {
    let obj: any = data;
    if (typeof data === 'string') {
      try { obj = JSON.parse(data); } catch { return null; }
    }
    if (obj === null || typeof obj !== 'object') return null;
    const tuid = findField(obj, ['tuid', 'myTuid', 'username', 'userName', 'imUsername', 'uid', 'userId']);
    const token = findField(obj, ['token', 'accessToken', 'access_token', 'imToken', 'im_token', 'authToken']);
    const name = findField(obj, ['name', 'myName', 'realName', 'nickname', 'nickName']);
    if (tuid && token) return { myTuid: tuid, myToken: token, myName: name };
    return null;
  };

  // 2) HTML 隐藏域解析（webim/me 的默认格式）
  const tryHtml = (): { myName: string | null; myToken: string; myTuid: string } | null => {
    if (typeof data !== 'string') return null;
    const extractValue = (id: string) => {
      const match = data.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`, 'i'));
      return match?.[1]?.trim() ?? null;
    };
    const n = extractValue('myName');
    const t = extractValue('myToken');
    const u = extractValue('myTuid');
    if (u && t) return { myName: n, myToken: t, myTuid: u };
    return null;
  };

  const jsonResult = tryJson();
  const htmlResult = !jsonResult ? tryHtml() : null;
  const parsed = jsonResult || htmlResult;
  const parsedFrom = jsonResult ? 'json' : (htmlResult ? 'html' : 'none');

  writeMonitorLog(logId, 'webim_parse_attempt', {
    parsedFrom,
    myName: parsed?.myName ?? null,
    myToken: parsed?.myToken ? `${parsed.myToken.slice(0, 20)}...` : null,
    myTuid: parsed?.myTuid ?? null,
    jsonFieldsConfig: 'auto-detect',
    htmlIdPatterns: typeof data === 'string' ? {
      myName: !!data.match(/id="myName"/i),
      myToken: !!data.match(/id="myToken"/i),
      myTuid: !!data.match(/id="myTuid"/i),
    } : null,
  });

  if (!parsed) {
    console.log('WebIM 页面结构已变化，无法解析 myName/myToken/myTuid，建议重新登录或检查学习通页面结构。');
    writeMonitorLog(logId, 'webim_parse_failure', {
      message: 'WebIM 页面结构已变化，无法解析 myName/myToken/myTuid，建议重新登录或检查学习通页面结构。',
      seenTags: typeof data === 'string' ? {
        myName: data.includes('myName'),
        myToken: data.includes('myToken'),
        myTuid: data.includes('myTuid'),
      } : null,
      snippet: text.slice(0, 20000),
    });
    return 'AuthFailed';
  }

  // name 在 JSON 路径下可能取不到，用 _uid 兜底，避免下游因 myName 为空而异常
  return {
    myName: parsed.myName || String(cookies._uid || ''),
    myToken: parsed.myToken,
    myTuid: parsed.myTuid,
    myPuid: cookies._uid,
  };
};
