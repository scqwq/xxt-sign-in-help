# 超星学习通自动签到

![NodeJS](https://img.shields.io/badge/node.js-22.5%2B-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/react-18-%2320232a.svg?style=for-the-badge&logo=react&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)

超星学习通自动签到工具，支持普通签到、拍照签到、位置签到、二维码签到、手势签到、签到码签到。提供 Web 界面和 CLI 两种使用方式。

## 当前功能
- **多签到类型**：普通、拍照、位置
- **拍照签到**：支持本地上传图片、以及快速上传照片至云端
- **定位签到**：可接入高德的key，也可以自己设定地图起始位置，支持使用地图签到，支持多种定位转换协议

- **关于二维码签到**：当前还未实现，由于WebIM已经无效，以下是思路
扫码后，会获取enc，获取的enc相当于可以让你确认签到的“密钥”，此时设备会在URL中发送附带enc参数至服务器，综合其他的请求信息让用户签到成功，也就是说，我们需要一个脚本，需要在图片发送的一瞬间（例如动态时间为10s），解析enc，并使用附带enc的URL实现签到，目前考虑使用挂载到服务器的QQ上的bot实现

## 最终功能（未实现，或者说之前已经实现了但是现在不管用了）

- **多签到类型**：普通、拍照、手势、位置、二维码、签到码
- **位置签到**：集成高德地图，支持地址搜索、点击选点、坐标自动转换（BD-09/WGS-84/GCJ-02）
- **自动监听**：HTTP 轮询检测签到活动，自动完成签到
- **多用户管理**：凭证存入 SQLite + 浏览器 IndexedDB
- **Web 界面**：React + MUI，拟态风格，可视化管理课程和签到
- **通知推送**：支持邮件、QQ 机器人（go-cqhttp）

## 技术栈

| 层 | 技术 |
|---|---|
| 包管理 | pnpm workspaces + turbo |
| 后端 | Koa 2 + TypeScript，端口 5000 |
| 前端 | React 18 + TypeScript + Vite + MUI + Leaflet |
| 数据库 | SQLite（Node.js 内置 `node:sqlite`，无需安装） |

## 环境要求

- **Node.js >= 22.5**（使用内置 `node:sqlite`，无需额外安装数据库）
- **pnpm**（包管理器）

### 安装 Node.js

| 系统 | 方式 |
|---|---|
| Windows | 官网下载 LTS 安装包 https://nodejs.org 或用 `winget install OpenJS.NodeJS.LTS` |
| macOS | `brew install node` 或官网下载 |
| Linux (Ubuntu/Debian) | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -` && `sudo apt install -y nodejs` |
| Linux (CentOS/RHEL) | `curl -fsSL https://rpm.nodesource.com/setup_22.x \| sudo bash -` && `sudo yum install -y nodejs` |

### 安装 pnpm

```bash
npm install -g pnpm
```

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/cxOrz/chaoxing-signin.git
cd chaoxing-signin
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置
项目根目录的 `.env` 是主要配置入口。如已有旧版 `apps/server/src/env.json`，可先把它复制为根目录 `env.json`；后端会继续读取这个根目录 JSON 作为兼容配置，`.env` 中填入的非空值优先。

```bash
cp .env.example .env
```

编辑 `.env`，填入 `CHAOXING_USER_AGENT`，并按需修改 `PORT` 和 `VITE_PORT`。


### 4. 生产部署

```bash
pnpm build      # 构建前后端
pnpm dev        #前后端同时启动
pnpm serve      # 启动后端服务（提供静态页面 + API）
```

按默认配置，前端开发服务器在 `http://localhost:3000`，后端 API 在 `http://localhost:5000`。

### 5. CLI 模式（命令行签到）

```bash
pnpm build
pnpm start      # 交互式命令行签到
```

## Docker 部署

```bash
docker pull ghcr.io/cxorz/chaoxing-signin:latest
docker run -d -p 80:80 -p 5000:5000 ghcr.io/cxorz/chaoxing-signin
```

访问 `http://localhost` 即可。详见 [DockerGuide.md](./DockerGuide.md)。

## 配置说明

### 根目录 env.json（兼容配置）

######总结注意：userAgent是最重要的，先填这个，获取UA一般要通过手机抓包获取

| 字段 | 说明 |
|---|---|
| `webim.userAgent` | 手机端超星 App 的 User-Agent（抓包获取），用于拍照和位置签到 |
| `webim.credentials` | 环信 IM 凭证（可选，用于 WebSocket 监听模式） |
| `monitor.mode` | 监听模式：`poll`（轮询，默认）或 `websocket`（IM） |
| `monitor.pollInterval` | 轮询间隔秒数（默认 30） |
| `photo.auto` | 是否自动拍照签到 |
| `photo.defaultPath` | 默认照片路径 |

### .env（项目根目录）

| 字段 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 后端服务端口 | 5000 |
| `VITE_PORT` | 前端开发服务器端口（仅开发模式） | 3000 |
| `CHAOXING_USER_AGENT` | 手机端超星 App 的 User-Agent；填入后覆盖 `env.json` 中的同名字段 | 空 |
| `VITE_API_URL` | 前端请求的后端地址；不填时使用当前主机名 + `PORT` | 空 |

### 地图设置（Web 界面左下角）

在 Web 界面的左下角「地图设置」面板中可配置：

- **默认城市 / 自定义坐标**：地图初始定位，可选城市或直接填经纬度
- **高德 API Key**：填入后启用地址搜索功能（在 https://lbs.amap.com 免费申请「Web服务」Key）
- **坐标转换**：默认 `→ BD-09 (百度坐标)`，已确认与超星学习通匹配。如偏差大可尝试其他选项
- **签到成功自动隐藏**：签到成功后多少秒自动从任务流消失（默认 30，设 0 不隐藏）

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 同时启动前端 (Vite) + 后端 (Koa) 开发服务器 |
| `pnpm build` | 构建前后端（turbo run build） |
| `pnpm serve` | 运行构建后的后端服务 |
| `pnpm start` | CLI 交互模式签到 |
| `pnpm reset` | 重置终端状态（Ctrl+C 后终端异常时使用） |

## 平台注意事项

### Windows

- 推荐使用 PowerShell 或 Windows Terminal
- 若 Ctrl+C 后终端异常，运行 `pnpm reset` 恢复
- 路径中的反斜杠在配置拍照图片路径时注意转义

### macOS

- Apple Silicon (M1/M2) 需确保 Node.js >= 22.5 的 arm64 版本
- 若 `pnpm install` 报权限错误，不要用 sudo，改用 `pnpm config set store-dir ~/.pnpm-store`

### Linux

- 确保 `curl` 已安装（用于 NodeSource 安装脚本）
- 服务器部署时建议用 `pm2` 或 `systemd` 管理进程：
  ```bash
  npm install -g pm2
  pnpm build
  pm2 start "pnpm serve" --name chaoxing-signin
  ```

### Android (Termux)

在安卓手机上用 Termux 运行 Node.js，详见 [Termux 教程](./apps/server/src/docs/termux.md)。

## 使用须知

- 只对 2 小时以内的活动签到
- 若同时有多个有效签到活动，只签最新发布的
- 位置签到坐标已默认转换为百度 BD-09 坐标系，与超星学习通匹配
- 防作弊滑动验证码无法绕过，遇到时需在手机端 App 手动完成

## 免责声明

本项目仅作为交流学习使用，请勿用作商业用途。任何人或组织使用项目中代码进行的任何违法行为与本人无关。
