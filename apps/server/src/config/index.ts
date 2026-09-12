import fs from 'fs';
import path from 'path';

interface WebIMCredentials {
  tuid: string;
  token: string;
  name: string;
}

export interface AppConfig {
  env: { SERVERLESS: boolean };
  server: { port: number };
  web: { port: number };
  tencent: { secretId: string; secretKey: string };
  webim: {
    userAgent: string;
    url: string;
    extraHeaders: Record<string, string>;
    credentials: WebIMCredentials | null;
  };
  monitor: { mode: 'poll' | 'websocket'; pollInterval: number };
  photo: { auto: boolean; defaultPath: string };
}

const findProjectRoot = (): string => {
  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(__dirname, '../../../..');
    dir = parent;
  }
  return dir;
};

const projectRoot = findProjectRoot();

const parseDotEnv = (): Record<string, string> => {
  const file = path.join(projectRoot, '.env');
  if (!fs.existsSync(file)) return {};

  const values: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
};

const readJsonConfig = (): any => {
  const file = path.join(projectRoot, 'env.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error: any) {
    console.warn(`[配置] 根目录 env.json 解析失败：${error?.message || error}`);
    return {};
  }
};

const dotEnv = parseDotEnv();
const jsonConfig = readJsonConfig();

const readValue = (key: string): string | undefined => {
  if (process.env[key] !== undefined) return process.env[key];
  if (Object.prototype.hasOwnProperty.call(dotEnv, key)) return dotEnv[key];
  return undefined;
};

const textValue = (key: string, jsonValue: unknown, fallback = ''): string => {
  const value = readValue(key);
  if (value !== undefined && value.length > 0) return value;
  if (typeof jsonValue === 'string' && jsonValue.length > 0) return jsonValue;
  return fallback;
};

const numberValue = (key: string, jsonValue: unknown, fallback: number): number => {
  const value = readValue(key);
  const raw = value !== undefined && value.length > 0
    ? value
    : (typeof jsonValue === 'number' ? String(jsonValue) : undefined);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const boolValue = (key: string, jsonValue: unknown, fallback: boolean): boolean => {
  const value = readValue(key);
  if (value === undefined || value.length === 0) {
    return typeof jsonValue === 'boolean' ? jsonValue : fallback;
  }
  return !['false', '0', 'no', 'off'].includes(value.toLowerCase());
};

let cachedConfig: AppConfig | null = null;

export const getAppConfig = (): AppConfig => {
  if (cachedConfig) return cachedConfig;

  const jsonWebim = jsonConfig.webim || {};
  let extraHeaders: Record<string, string> = {};
  const jsonExtraHeaders = jsonWebim.extraHeaders;
  if (jsonExtraHeaders && typeof jsonExtraHeaders === 'object') extraHeaders = { ...jsonExtraHeaders };

  const envExtraHeaders = readValue('WEBIM_EXTRA_HEADERS');
  if (envExtraHeaders) {
    try {
      const parsed = JSON.parse(envExtraHeaders);
      if (parsed && typeof parsed === 'object') extraHeaders = { ...extraHeaders, ...parsed };
    } catch {
      console.warn('[配置] WEBIM_EXTRA_HEADERS 不是有效 JSON，已忽略。');
    }
  }

  const credentials: WebIMCredentials | null = (() => {
    const tuid = textValue('WEBIM_TUID', jsonWebim.credentials?.tuid);
    const token = textValue('WEBIM_TOKEN', jsonWebim.credentials?.token);
    if (!tuid || !token) return null;
    return {
      tuid,
      token,
      name: textValue('WEBIM_NAME', jsonWebim.credentials?.name),
    };
  })();

  const mode = textValue('MONITOR_MODE', jsonConfig.monitor?.mode, 'poll');

  cachedConfig = {
    env: {
      SERVERLESS: boolValue('SERVERLESS', jsonConfig.env?.SERVERLESS, false),
    },
    server: {
      port: numberValue('PORT', jsonConfig.server?.port, 5000),
    },
    web: {
      port: numberValue('VITE_PORT', jsonConfig.web?.port, 3000),
    },
    tencent: {
      secretId: textValue('TENCENT_SECRET_ID', jsonConfig.tencent?.secretId),
      secretKey: textValue('TENCENT_SECRET_KEY', jsonConfig.tencent?.secretKey),
    },
    webim: {
      userAgent: textValue('CHAOXING_USER_AGENT', jsonWebim.userAgent),
      url: textValue('WEBIM_URL', jsonWebim.url),
      extraHeaders,
      credentials,
    },
    monitor: {
      mode: mode === 'websocket' ? 'websocket' : 'poll',
      pollInterval: numberValue('MONITOR_POLL_INTERVAL', jsonConfig.monitor?.pollInterval, 30),
    },
    photo: {
      auto: boolValue('PHOTO_AUTO', jsonConfig.photo?.auto, true),
      defaultPath: textValue('PHOTO_DEFAULT_PATH', jsonConfig.photo?.defaultPath),
    },
  };
  return cachedConfig;
};
