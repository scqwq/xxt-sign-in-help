// node:sqlite 类型声明（@types/node@18 尚未内置，Node 22.5+ 实验性模块）
declare module 'node:sqlite' {
  interface StatementSync {
    run(...params: any[]): void;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }
  class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

interface MonitorConfig {
  delay: number;
  lon: number;
  lat: number;
  address: string;
}

interface MailConfig {
  enabled: boolean;
  host: string;
  ssl: boolean;
  port: number;
  user: string;
  pass: string;
  to: string;
}

interface cqServerConfig {
  cq_enabled: boolean;
  target_type: string;
  target_id: number;
  ws_url: string;
}

interface BasicCookie {
  _uid: string;
  _d: string;
  uf: string;
  vc3: string;
}

type UserParams = BasicCookie & {
  fid: string;
  lv: string;
};

interface User {
  phone?: string;
  params?: UserParams;
  monitor?: MonitorConfig;
  mailing?: MailConfig;
  cqserver?: cqServerConfig;
}

interface CourseType {
  courseId: string;
  classId: string;
  courseName?: string;
}

interface Activity {
  activeId: string;
  name?: string;
  courseId: string;
  classId: string;
  otherId: number;
  ifphoto?: number;
  chatId?: string;
}

interface IMParamsType {
  myName: string;
  myToken: string;
  myTuid: string;
  myPuid: string;
}

interface UserCookieType {
  name?: string;
  fid: string;
  pid: string;
  refer: string;
  _blank: string;
  t: boolean;
  vc3: string;
  _uid: string;
  _d: string;
  uf: string;
  lv: string;
  UID?: string;
}
