# QR-Relay 临时云盘与二维码快传中转站

<div align="center">

> 🚀 **极简 · 现代 · 沉浸 · 跨平台**  
> 专为个人与团队打造的高性能**文字、图片与小文件临时中转站**。  
> 现已深度适配**原生 App 质感移动端体验**，并全面支持 **本地局域网 / Linux VPS / Cloudflare Serverless** 三大部署生态！

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-F38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://docker.com)

</div>

---

## ✨ 核心特性

- 📱 **移动端极致沉浸与有序适配**：
  - **原生 App 质感 Dock 栏**：移动端专享底部毛玻璃悬浮导航栏，大拇指单手丝滑切换。
  - **iOS 防跳屏优化**：严格适配 16px 视口与防放大机制，彻底解决 iPhone Safari 聚焦缩放排版错乱。
  - **安全区全覆盖**：全面避让 iPhone 灵动岛、刘海屏与底部 Home 虚拟按键。
  - **触控人体工学**：告别细小单选框，引入现代胶囊分段选择器与 `active:scale-95` 按压微动效。
- 📝 **文字与离线二维码快传**：
  - **离线内容码**：短文本直接编码至二维码黑白矩阵，手机自带相机扫码即可离线读取，无需经过网络。
  - **6位口令取件**：长文本或格式文件自动生成 6 位提取口令（如 `782338`）与专属取件链接，支持一键复制好友文案。
- 📁 **多媒体与图片临时云盘**：
  - **截图即贴**：电脑端网页任意位置按 `Ctrl + V` 自动捕获剪贴板图片秒级上传。
  - **手机极速传**：手机端轻触即可直通手机摄像头拍照或挑选相册大图。
- ⏱️ **自动物理清理与生命周期 (TTL)**：
  - 支持 10分钟、1小时、24小时、7天、阅后即焚、或永久保存。
  - 后台物理定时清理过期文件，坚决不浪费服务器磁盘空间。
- ☁️ **OpenList / AList 多网盘容灾备份**：
  - 支持网页端一键可视化配置 WebDAV，支持探测已挂载网盘目录。
  - 文件在本地或 R2 落盘的同时，异步备份至阿里云盘、夸克、OneDrive、百度网盘或 NAS。
- 🛡️ **轻量鉴权与数据隔离**：
  - 访客模式免密极速取件；可选上传防刷密码（`UPLOAD_PASSWORD`）；内置管理员密码修改与全站管理面板。

---

## 🗺️ 三大部署架构选型指南

本项目提供完全一致的前端界面与 API 规范，你可以根据手头的设备与预算灵活选择最合适的部署方案：

| 选型对比 | 方案 A：本地 / 局域网部署 | 方案 B：自建 Linux VPS 部署 | 方案 C：Cloudflare 全托管 |
| :--- | :--- | :--- | :--- |
| **适用场景** | 个人电脑、家庭/办公室 WiFi 跨设备快传 | 个人域名拥有者、7×24h 公网常驻服务 | 追求 $0 免费、免买 VPS、免系统运维 |
| **运行环境** | Windows / macOS / Linux 电脑 | 云服务器 (阿里云/腾讯云/海外VPS) | Cloudflare 边缘计算全球网络 |
| **底层技术** | Python 3.10+ / SQLite / Uvicorn | Docker Compose / Nginx / SSL 证书 | Workers + Static Assets + D1 + R2 |
| **服务器成本**| **¥0**（本机运行） | 需购买 VPS（约 ¥100~300/年） | **$0 / 完全免费**（利用 CF 免费额度） |
| **外网访问** | 仅限内网（可搭配内网穿透） | 全网随时随地直连 | 全球 Anycast CDN 边缘秒开 |
| **详细指南** | [📖 本地部署人类指南](docs/deployment/local.md) | [📖 服务器部署人类指南](docs/deployment/server.md) | [📖 Cloudflare 部署人类指南](docs/deployment/cloudflare.md) |
| **Agent 手册**| [🤖 本地 Agent 执行手册](docs/agent/DEPLOY_LOCAL_AGENT.md) | [🤖 服务器 Agent 执行手册](docs/agent/DEPLOY_SERVER_AGENT.md) | [🤖 Cloudflare Agent 手册](docs/agent/DEPLOY_CLOUDFLARE_AGENT.md) |

---

## 🚀 极速上手概要

### 方案 A：本地快速运行（局域网 WiFi 手机扫码直通）
```bash
# 1. 克隆代码并安装依赖
git clone https://github.com/ccccplus/Self-Hosted-Cloud-Drive.git qr-relay
cd qr-relay
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. 启动服务 (绑定 0.0.0.0 允许局域网接入)
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
```
👉 [查看完整的《本地与局域网部署详细文档》](docs/deployment/local.md)

---

### 方案 B：Linux VPS 生产部署（Docker Compose 一键启动）
```bash
# 独立运行 QR-Relay
docker compose up -d

# 或：联合编排（同时拉起 QR-Relay + OpenList 多网盘挂载器）
docker compose -f docker-compose.with-openlist.yml up -d
```
👉 [查看完整的《Linux VPS 与 Nginx 反向代理配置指南》](docs/deployment/server.md)

---

### 方案 C：Cloudflare Serverless 部署（$0 成本全球高可用）
```bash
# 1. 登录 Cloudflare 并创建资源
npx wrangler login
npx wrangler d1 create qr-relay-db
npx wrangler d1 execute qr-relay-db --file=./cloudflare/schema.sql --remote
npx wrangler r2 bucket create qr-relay-files

# 2. 一键发布到全球边缘节点
npx wrangler deploy
```
👉 [查看完整的《Cloudflare Workers + D1 + R2 全托管指南》](docs/deployment/cloudflare.md)

---

## 🤖 专供 AI Coding Agent 阅读的执行手册

如果你正在使用 **Antigravity、Cursor、Claude Code、AutoGPT、DevOps 自动化脚本** 等智能体为你部署或运维本项目，可直接指引 Agent 读取对应文档：

- 🛠️ **本地环境 Agent 手册**：[`docs/agent/DEPLOY_LOCAL_AGENT.md`](docs/agent/DEPLOY_LOCAL_AGENT.md)  
  *(包含无交互预检、端口冲突自解、环境注入与 TestClient 自动探针)*
- 🐧 **Linux 服务器 Agent 手册**：[`docs/agent/DEPLOY_SERVER_AGENT.md`](docs/agent/DEPLOY_SERVER_AGENT.md)  
  *(包含 Docker 自动安装、Nginx 反代自动生成、合成健康探针与故障自愈决策树)*
- ☁️ **Cloudflare 边缘 Agent 手册**：[`docs/agent/DEPLOY_CLOUDFLARE_AGENT.md`](docs/agent/DEPLOY_CLOUDFLARE_AGENT.md)  
  *(包含 Wrangler 自动化配置、D1/R2 自动关联、防 307 重定向探针及 API 校验)*

---

## ⚙️ 核心环境变量参考

| 变量名 | 默认值 | 作用说明 |
| :--- | :--- | :--- |
| `BASE_URL` | `http://localhost:8080` | **核心**：生成二维码与分享 URL 的前缀（局域网填 `http://电脑IP:8080`，公网填绑定域名） |
| `PORT` | `8080` | 本地与容器监听端口 |
| `MAX_FILE_SIZE_MB` | `100` | 单个文件最大上传上限（MB） |
| `UPLOAD_PASSWORD` | *(空)* | 可选：上传验证密码（留空允许访客自由上传，填写则上传需验密，取件永远免密） |
| `AUTO_CLEANUP_INTERVAL_SECONDS` | `60` | 本地过期文件物理清理线程执行间隔（秒） |
| `OPENLIST_WEBDAV_URL` | *(空)* | 可选：OpenList / AList 的 WebDAV 地址（如 `http://openlist:5244/dav`） |
| `OPENLIST_USERNAME` | `admin` | WebDAV 登录账号 |
| `OPENLIST_PASSWORD` | *(空)* | WebDAV 登录密码 |
| `OPENLIST_BACKUP_PATH` | `/QR-Relay-Backup` | 网盘存储前缀（如 `/aliyun/QR-Relay-Backup`） |

---

## 📂 仓库代码组织

```text
Self-Hosted-Cloud-Drive/
├── docs/
│   ├── deployment/                     # 人类阅读：超详细保姆级图文指南
│   │   ├── local.md                    # 1. 本地极速开发与局域网快传部署指南
│   │   ├── server.md                   # 2. Linux VPS / Docker / Nginx 生产环境部署指南
│   │   └── cloudflare.md               # 3. Cloudflare 全栈 Serverless 免费托管指南
│   └── agent/                          # 专供 AI Agent 阅读：确定性指令、无交互参数、健康检查探针
│       ├── DEPLOY_LOCAL_AGENT.md       # Agent 本地部署执行手册
│       ├── DEPLOY_SERVER_AGENT.md      # Agent 服务器/Docker 自动化部署手册
│       └── DEPLOY_CLOUDFLARE_AGENT.md  # Agent Cloudflare 无服务器部署手册
├── backend/                            # Python FastAPI 后端
│   ├── config.py                       # 环境变量与应用配置
│   ├── database.py                     # SQLite 数据库模型与取件码生成
│   ├── main.py                         # 主路由与文件存取业务
│   └── services/
│       ├── cleanup_worker.py           # 本地 TTL 自动物理清理守护线程
│       ├── openlist_sync.py            # OpenList 异步 WebDAV 同步客户端
│       └── qrcode_service.py           # 高清二维码生成服务
├── cloudflare/                         # Cloudflare Serverless 版本
│   ├── worker.js                       # 边缘 Worker 业务逻辑与防 307 路由
│   ├── schema.sql                      # D1 数据库初始化表结构
│   └── README_CLOUDFLARE.md            # Cloudflare 原生特性说明
├── frontend/                           # 现代化响应式前端 (双模自适应)
│   ├── index.html                      # 主页面 (移动端底部毛玻璃 Dock + 桌面顶部药丸)
│   └── share.html                      # 极速取件页面 (触控大按钮 + 自动解析)
├── docker-compose.yml                  # 独立 Docker 编排模版
├── docker-compose.with-openlist.yml    # 与 OpenList 联合编排模版
├── Dockerfile                          # 极轻量容器构建文件
├── wrangler.toml                       # Cloudflare Workers / D1 / R2 绑定配置
├── requirements.txt                    # Python 依赖包清单
└── README.md                           # 项目总览入口
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源发布，欢迎提交 Issue 与 Pull Request！
