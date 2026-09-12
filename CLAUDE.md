# Chaoxing Sign-in (超星学习通自动签到)

## 项目简介

超星学习通自动签到工具，支持普通签到、拍照签到、位置签到、二维码签到、手势签到、签到码签到。采用 monorepo 架构（pnpm workspaces + turbo），后端为 Koa + TypeScript，前端为 React + TypeScript + Vite，使用拟态 (Neumorphic) UI 风格。

## 技术栈

- **包管理**: pnpm workspaces + turbo
- **后端**: Koa 2 + TypeScript，HTTP API (默认端口 5000，通过根目录 `.env` 的 `PORT` 配置)
- **前端**: React 18 + TypeScript + Vite + MUI + Leaflet (地图选点)
- **数据库**: SQLite (Node.js 内置 `node:sqlite`，无需安装)
- **通信**: 前后端通过 HTTP REST API 交互；后端 fork 子进程做签到监听，通过 IPC 通信

## 常用命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 同时启动前端 (Vite) + 后端 (Koa) 开发服务器
pnpm build            # 构建前后端 (turbo run build)
pnpm serve            # 运行构建后的后端 (node build/serve.js)
pnpm start            # 运行 CLI 交互模式 (node build/index.js)
pnpm reset            # 重置终端状态 (Ctrl+C 后终端异常时使用)
```

后端单独命令 (在 apps/server 下):
```bash
pnpm dev:serve        # ts-node 启动后端
pnpm dev:poll         # ts-node 启动轮询监听 (CLI)
pnpm dev:upload-pan   # ts-node 启动云盘上传工具 (CLI)
```

## 项目功能

1. **账号登录**: 手机号+密码登录超星，凭证存入 SQLite + 浏览器 IndexedDB
2. **签到监听**: 两种模式 — HTTP 轮询 (poll.ts, 默认) 和 WebSocket IM (monitor.ts, 需环信 token)
3. **自动签到**: 按课程配置自动签到开关，检测到签到活动后自动完成
4. **手动签到**: Web 界面手动触发签到，支持选本地图片 / 云盘图片 / 地图选点
5. **拍照签到**: 上传图片到超星云盘获取 objectId，再调签到接口；支持本地图片和云盘已有图片两种方式
6. **位置签到**: 集成高德地图，支持地址搜索自动补全（需配置高德API Key）、点击选位置、坐标自动转换（默认BD-09百度坐标，可切换WGS-84/GCJ-02）
7. **课程管理**: 记录课程、设置自动签到、设置拍照图片路径
8. **云盘上传**: Web 界面上传图片到超星云盘，或 CLI 工具 `pnpm dev:upload-pan`
9. **错误处理**: 签到失败显示具体错误信息 + "再次签到"按钮，支持重试

## 目录结构

```
chaoxing-signin/
├── package.json              # 根 monorepo 配置，scripts: dev / build / serve / start
├── .env                      # 主要配置入口: 端口、手机 UA、监听/拍照/凭证等
├── env.json                  # 兼容配置: .env 非空值优先，未配置项从此读取
├── turbo.json                # turbo pipeline 配置
├── CLAUDE.md                 # 本文件
│
├── apps/
│   ├── server/               # 后端 (Koa + TypeScript)
│   │   ├── package.json      # 后端依赖与脚本
│   │   ├── tsconfig.json     # TS 编译配置，输出到 build/
│   │   ├── types/
│   │   │   └── global.d.ts   # 全局类型: User, UserCookieType, CourseType, Activity 等 + node:sqlite 类型声明
│   │   └── src/
│   │       ├── index.ts      # CLI 交互入口 — 选用户/登录/查签到/签到 (pnpm start)
│   │       ├── serve.ts      # Web API 服务入口 — Koa 路由 + fork 监听子进程 (pnpm serve)
│   │       ├── monitor.ts    # WebSocket IM 监听模式 — 通过环信 IM 长连接接收签到消息
│   │       ├── poll.ts       # HTTP 轮询监听模式 — 定时遍历课程活动列表找签到 (默认模式)
│   │       ├── upload-pan.ts # CLI 云盘上传工具 — 选用户上传图片到超星云盘
│   │       ├── config/
│   │       │   └── index.ts # 根目录 .env + env.json 统一配置加载器
│   │       ├── configs/
│   │       │   ├── api.ts    # 超星 API 端点常量 (登录/课程/签到/云盘/WebIM)
│   │       │   ├── prompts.ts # CLI 交互提示问题定义
│   │       │   ├── storage.json # [已废弃] 旧 JSON 存储，已被 SQLite 替代
│   │       │   └── data.db   # SQLite 数据库 (自动创建)
│   │       ├── functions/    # 超星 API 封装
│   │       │   ├── user.ts       # userLogin 登录, getCourses 课程列表, getAccountInfo 用户名, getPanToken 云盘 token, getLocalUsers 本地用户列表, getIMParams 环信 token
│   │       │   ├── activity.ts   # getActivity 查签到活动, preSign 预签, traverseCourseActivity 遍历课程找活动, getSignType 签到类型, getPPTActiveInfo 活动详情
│   │       │   ├── general.ts    # GeneralSign 普通签到
│   │       │   ├── photo.ts      # PhotoSign 拍照签到(带手机UA), uploadPhoto 上传图片到云盘(带手机UA), getObjectIdFromcxPan 从云盘找已有图片
│   │       │   ├── location.ts   # LocationSign 位置签到(带手机UA)
│   │       │   ├── qrcode.ts     # QRCodeSign 二维码签到
│   │       │   ├── cq.ts         # CQ HTTP 上报 (go-cqhttp 对接)
│   │       │   └── tencent.qrcode.ts # 腾讯云 OCR 识别二维码
│   │       ├── utils/
│   │       │   ├── db.ts         # SQLite 数据库模块 — 建表 + CRUD (dbStoreUser/dbGetUser/dbGetAllUsers/dbGetUserCourses/dbUpsertCourse/dbDeleteCourse/dbUpdateUserConfig)
│   │       │   ├── file.ts       # storeUser/getStoredUser (代理 db.ts)
│   │       │   ├── request.ts    # HTTP 请求封装 + cookieSerialize
│   │       │   ├── helper.ts     # delay 等工具函数
│   │       │   ├── terminal.ts   # restoreTerminal 恢复终端状态 — stty sane + /dev/tty 直写 + 所有信号处理 (SIGINT/SIGTERM/SIGHUP/SIGBREAK)
│   │       │   ├── mailer.ts     # 邮件通知
│   │       │   ├── monitorLogger.ts # 签到日志写入 (JSONL 格式, logs/ 目录)
│   │       │   ├── copyFiles.ts  # 文件复制工具
│   │       │   └── websdk3.1.4.js # 超星 Web SDK
│   │       └── scripts/
│   │           └── cplibs.js     # 构建后复制 websdk 到 build 目录
│   │
│   └── web/                  # 前端 (React + TypeScript + Vite)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── src/
│           ├── index.tsx     # 入口 — BrowserRouter + Routes
│           ├── App.tsx       # 布局壳 — 返回按钮 + Outlet
│           ├── App.css
│           ├── config/
│           │   └── api.ts    # 后端 API 端点常量 (默认 localhost:5000，可由根目录 .env 配置)
│           ├── pages/
│           │   ├── Start/    # 登录页 — 输入手机号密码登录
│           │   │   ├── Start.tsx
│           │   │   ├── ConfigDialog.tsx  # 监听配置弹窗
│           │   │   └── Start.module.css
│           │   └── DashBoard/ # 签到控制台 (左右分栏布局)
│           │       ├── DashBoard.tsx   # 布局容器 — 管理用户参数/监听状态/事件轮询
│           │       ├── LeftPanel.tsx   # 左侧 — 监听开关/手动刷新/云盘上传/已记录课程列表(自动签到Switch+图片路径)
│           │       ├── RightPanel.tsx  # 右侧 — 签到任务流/手动签到(本地图片+云盘图片)/记录课程/再次签到/地图选点
│           │       ├── MapPicker.tsx   # 地图选点弹窗 — Leaflet + 高德地图瓦片，点击地图获取经纬度
│           │       ├── Helper.ts       # API 封装 — generalSign/photoSign/locationSign/qrcodeSign/课程CRUD/手动签到/云盘上传/云盘图片查询
│           │       └── DashBoard.css  # 拟态风格 grid 左右分栏
│           ├── components/
│           │   └── UserCard/ # 用户卡片组件 (登录后展示)
│           ├── hooks/
│           │   └── useLongPress.ts  # 长按手势 hook
│           ├── utils/
│           │   └── request.ts # Fetch 封装 (支持 GET/POST/DELETE)
│           └── types/
│               └── global.d.ts # 前端全局类型 (UserParamsType)
│
└── packages/                 # 共享包
    ├── crypto-js/            # 加密工具 (workspace 依赖)
    ├── eslint-config-custom/ # 共享 ESLint 配置
    └── tsconfig/             # 共享 TS 配置 (base/server/web)
```

## 数据库结构 (SQLite)

DB 文件: `apps/server/src/configs/data.db` (dev) 或 `apps/server/build/configs/data.db` (build)

```sql
users 表:
  phone     TEXT PRIMARY KEY    -- 手机号
  params    TEXT (JSON)         -- 登录凭证 (uf, _d, vc3, _uid, fid, lv, name 等)
  monitor   TEXT (JSON)         -- 监听配置 (delay, lon, lat, address, presetAddress)
  mailing   TEXT (JSON)         -- 邮件通知配置
  cqserver  TEXT (JSON)         -- CQ HTTP 上报配置

courses 表:
  id         INTEGER PK AUTOINCREMENT
  phone      TEXT               -- 关联用户手机号
  courseId   TEXT               -- 课程 ID
  courseName TEXT               -- 课程名
  autoSign   INTEGER (0/1)      -- 是否自动签到
  photoPath  TEXT               -- 拍照签到图片本地路径
  UNIQUE(phone, courseId)
```

## 关键配置

### 根目录 .env + env.json

后端通过 `apps/server/src/config/index.ts` 定位项目根目录：`.env` 中非空值优先，剩余配置兼容读取根目录 `env.json`。Vite 也会从项目根目录读取 `.env`。

```dotenv
PORT=5000
VITE_PORT=3000
CHAOXING_USER_AGENT=手机端 UA (抓包获取，用于拍照签到和位置签到)
MONITOR_MODE=poll
MONITOR_POLL_INTERVAL=30
PHOTO_AUTO=true
PHOTO_DEFAULT_PATH=
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
```

根目录 `env.json` 兼容旧配置：

```json
{
  "env": { "SERVERLESS": false },
  "webim": {
    "userAgent": "手机端 UA (抓包获取，用于拍照签到和 WebIM)",
    "url": "",
    "credentials": { "tuid": "", "token": "", "name": "" }  // 手动填入环信凭证 (可选)
  },
  "monitor": { "mode": "poll", "pollInterval": 30 },  // poll=轮询, websocket=IM
  "photo": { "auto": true, "defaultPath": "" }         // 全局拍照签到设置
}
```

## 签到流程

### 轮询模式 (默认, poll.ts)

1. `userLogin` 登录获取 cookies
2. 定时 (默认 30 秒) 调 `getCourses` 获取课程列表
3. 并发调 `getActivity` 检查各课程是否有签到活动
4. 检测到活动 → 查 `courses` 表看是否记录了该课程
   - `autoSign: true` → 自动签到 (发 detected + processing + result 事件)
   - `autoSign: false` 或未记录 → 只发 detected 事件 (等用户手动操作)
5. 前端 5 秒轮询 `/monitor/events` 获取事件并显示

### 拍照签到流程

1. `getPanToken` 获取云盘 token
2. `uploadPhoto` 上传图片到 `pan-yz.chaoxing.com` 获取 `objectId`（带手机端 UA）
3. `PhotoSign` 调 `mobilelearn.chaoxing.com/pptSign/stuSignajax` 完成签到（带手机端 UA）
4. 或: 直接用云盘已有图片的 `objectId` 签到 (跳过上传，点"使用云盘图片签到")

### 位置签到流程

1. 用户点击「📍 点击地图选择位置」→ 弹出高德地图 → 点击地图获取经纬度
2. 填入地址 → 点「位置签到」
3. `LocationSign` 调 `pptSign/stuSignajax` 带经纬度、地址、手机端 UA 完成签到

## API 路由 (后端, 默认端口 5000)

| 方法 | 路径 | 作用 |
|------|------|------|
| POST | `/login` | 登录，凭证存入 SQLite |
| POST | `/activity` | 查询当前签到活动 |
| POST | `/general` | 普通签到 |
| POST | `/photo` | 拍照签到 (旧接口) |
| POST | `/location` | 位置签到 |
| POST | `/qrcode` | 二维码签到 |
| POST | `/uvtoken` | 获取云盘 token |
| POST | `/upload` | 上传图片 (旧接口) |
| GET  | `/monitor/status/:phone` | 查监听状态 |
| POST | `/monitor/start/:phone` | 启动监听 (fork poll.ts/monitor.ts) |
| POST | `/monitor/stop/:phone` | 停止监听 |
| GET  | `/monitor/events/:phone` | 获取签到事件列表 |
| GET  | `/courses/:phone` | 获取用户课程记录 |
| POST | `/courses/:phone` | 新增/更新课程记录 |
| DELETE | `/courses/:phone/:courseId` | 删除课程记录 |
| POST | `/monitor/sign/:phone` | 手动签到统一入口 (支持 multipart 图片 / objectId 云盘图片) |
| POST | `/upload-pan/:phone` | 上传图片到云盘 |
| GET  | `/pan-photos/:phone` | 查询云盘图片 objectId |
| GET  | `/activity-info/:phone/:activeId` | 获取活动详情 (含签到类型、是否需拍照等) |

## 注意事项

- `node:sqlite` 需要 Node.js 22.5+，当前项目要求 Node >= 18，实际运行需 >= 22.5
- 根目录 `.env` 的 `CHAOXING_USER_AGENT`（兼容 `env.json` 的 `webim.userAgent`）需要抓包手机端获取，用于拍照签到和位置签到（填入 URL 的 `useragent` 参数 + HTTP `User-Agent` 请求头）
- WebIM (环信 IM) 接口 `im.chaoxing.com/webim/me` 可能处于维护状态，故默认使用轮询模式
- 拍照签到可能遇到服务端错误 `photoAuthError_PCR007`，位置签到可能遇到 `locationAuthError_LCR007`，均为超星服务端验证，已通过填入手机端 UA 尝试修复，若仍失败则可能是超星增加了无法绕过的内容验证
- 防作弊滑动验证码：超星服务端反作弊机制，无法绕过；遇到时需在手机端 App 手动完成
- 前端用户凭证存在 IndexedDB (浏览器) + SQLite (服务端) 双份
- Ctrl+C 退出后终端异常时，运行 `pnpm reset` 或手动输入 `stty sane` 恢复
- 二维码签到 (otherId=2) 需要 `enc` 参数（从二维码解析），当前前端尚未提供 enc 输入表单
- 签到码签到 (otherId=5) 前端有输入框但后端未将签到码传给超星，实际执行普通签到
## 地图设置 (Web 界面左下角)

存储在浏览器 localStorage 的 map_settings 中，全局生效：

| 设置项 | 说明 | 默认值 |
|---|---|---|
| defaultCity / defaultLat / defaultLon | 默认城市及中心坐标 | 北京 39.9042, 116.4074 |
| centerMode | 地图初始位置模式：city（默认城市）或 custom（自定义坐标） | city |
| customLat / customLon | 自定义初始坐标 | 39.9042, 116.4074 |
| mapKey | 高德 Web 服务 API Key，填入后启用地址搜索 | 空 |
| coordMode | 坐标转换模式：d09（百度，默认）/ wgs84（GPS）/ gcj02（高德）/ 
one（不转换） | d09 |
| successAutoHide | 签到成功后自动隐藏秒数，0=不隐藏 | 30 |

## 手动签到状态显示

- 手动签到后，RightPanel 通过 manualResults 本地状态立即更新任务流显示（✅/❌）
- 签到成功后，按 successAutoHide 秒数自动将条目加入 hiddenIds 隐藏
- 坐标转换工具：pps/web/src/utils/gcoord.ts（GCJ-02 ↔ WGS-84 ↔ BD-09）
