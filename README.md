# QR-Relay 临时云盘与二维码快传中转站

<div align="center">

> 🚀 **极简 · 现代 · 沉浸 · 跨平台**  
> 专为个人与团队打造的高性能**文字、图片与小文件临时中转站**。  
> 现已深度适配**原生 App 质感移动端体验（支持一键保存为独立桌面 Web App）**，并全面支持 **本地局域网 / Linux VPS / Cloudflare Serverless** 三大部署生态！

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-F38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://docker.com)

</div>

> [!CAUTION]
> ### ⚠️ 免责声明与使用风险告诫 (Legal Disclaimer)
> 1. **仅限个人学习与自用 · 严禁商业运营**：本项目开源代码与程序仅供个人技术研究、网络协议学习及家庭/个人私有网络日常传输自用。**严禁直接或间接将本项目用于任何形式的商业运营、营利性收费服务、广告变现或向公众提供大规模公用文件存储分发平台**。
> 2. **数据安全与隐私泄露风险警告**：本项目设计初衷为临时轻量快传，采用 6 位口令或短提取码。公网部署若未开启访问密码（`UPLOAD_PASSWORD`）或私网隔离，客观存在口令被穷举扫描、暴力遍历或被他人意外截获访问的潜在风险。**切勿使用本项目传输或存储任何涉及国家秘密、个人高敏隐私（如身份证、护照、人脸识别照）、核心商业机密、金融账密等绝密资产**！因使用者自行配置不当、弱密码或服务器遭受黑客攻击引发的数据泄露、损毁或灭失，本项目原作者概不承担任何责任。
> 3. **网络与法律合规零容忍**：使用者与服务器运营者必须严格遵守所在国家或地区的宪法、互联网安全法规及监管政策。**严禁利用本项目传输、存储、中转或散播任何侵犯他人知识产权、淫秽色情、赌博洗钱、电信网络诈骗、暴力恐怖、虚假有害信息、恶意木马病毒勒索软件等违法违规内容**！任何因使用者违规违法滥用所引发的民事侵权赔偿、行政处罚或刑事责任，均由使用者与部署者**完全独立承担全部法律责任**，与本项目作者没有任何连带关系。

---

## ✨ 核心特性

- 📱 **移动端极致沉浸与桌面 Web App (PWA) 适配**：
  - **保存为手机桌面 App**：支持 Safari / Chrome「添加到主屏幕」，免安装直接化身独立原生 Web App 样式，全屏沉浸无浏览器网址栏遮挡。
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
- 🚀 **超大文件直传与视频流式播放（突破 100MB 限制）**：
  - **R2 S3 v4 预签名直传**：纯原生 Web Crypto 算法签发入场券，大文件（>100MB，最高 5GB）直传存储桶，带 0%~100% 实时进度条。
  - **中文视频流畅播放**：支持 HTTP 206 Range 分段加载，iPhone / iPad Safari 与微信内置浏览器秒开且支持拖拽进度条。
  - **RFC 6266 双模式文件名**：下载时完整保留原始中文文件名与扩展名，彻底告别“下载变为纯数字无后缀未知文件”。
- 🛡️ **10GB 总存储配额安全熔断（$0 永不超额扣费）**：
  - **代码级物理熔断**：实时统计全站存储体积，超出 10GB 免费限度立即拒绝写入，报错完全脱敏，确保永久 $0 运行。
  - **实时配额仪表盘**：网页页脚实时展示 `存储配额: 已用 X MB / 10 GB`，上传或删除文件即时刷新。
- ⏱️ **自动物理清理与生命周期 (TTL) & 精确销毁时点可视化**：
  - **精准销毁倒计时**：中转箱彻底摒弃笼统的“定时销毁”，精准呈现具体到期时间与相对倒计时（如 `将于 今日 16:30 销毁 (45分钟后)`）。
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

## 📲 移动端保存为桌面 Web App 说明

本中转站已完整支持 PWA（渐进式 Web 应用）技术规范。手机端打开后，只需将网页添加到主屏幕，即可自动以独立 App 的形式全屏启动：

- **iPhone / iPad (Safari)**：点击 Safari 底部中间的分享按钮（`⎋`） -> 向上滑动选择 **「添加到主屏幕」** -> 点击右上角「添加」。
- **Android 安卓手机 (Chrome / 浏览器)**：点击右上角菜单（`⋮`） -> 点击 **「安装应用」** 或 **「添加到主屏幕」**。
- **微信中打开**：点击右上角选择「在默认浏览器中打开」，再按照上述指引添加到主屏幕。

---

## 📜 版本迭代与更新日志 (Changelog)

本项目保持高频敏捷迭代，每一次架构升级、体验优化与缺陷修复均有详尽记录：

| 版本 | 发布日期 | 核心迭代与更新亮点 |
| :--- | :--- | :--- |
| [**v1.6.0**](CHANGELOG.md#v160---2026-09-21) | 2026-09-21 | **中转箱销毁时点精确可视化**（告别模糊的“定时销毁”，实时展示精确销毁时点与动态倒计时）、取件页到期提示联动、项目更新历史文档沉淀 |
| [**v1.5.0**](CHANGELOG.md#v150---2026-09-21) | 2026-09-21 | **突破 100MB 限制：R2 浏览器预签名直传 (最高 5GB)**、纯原生 Web Crypto S3 v4 签名算法、0%~100% 真实进度条、账户 ID 深度容错清洗 |
| [**v1.4.0**](CHANGELOG.md#v140---2026-09-21) | 2026-09-21 | **10GB 总存储配额安全熔断（$0 永不扣费）**、工业级报错专业脱敏、前台页脚实时配额指示看板 |
| [**v1.3.0**](CHANGELOG.md#v130---2026-09-20) | 2026-09-20 | **中文命名视频全格式流式播放**（HTTP 206 Range 分段探测支持）、RFC 6266 双模式回落（解决下载文件名丢失后缀）、专属在线视频播放器 |
| [**v1.2.0**](CHANGELOG.md#v120---2026-09-20) | 2026-09-20 | **移动端极致沉浸与 PWA 独立桌面应用**（支持添加到主屏幕）、底部毛玻璃悬浮 Dock 栏、iOS 16px 防跳屏、全分级部署指南发布 |
| [**v1.1.0**](CHANGELOG.md#v110---2026-09-19) | 2026-09-19 | **OpenList / AList 多网盘挂载与 WebDAV 自动归档**、在线可视化账密配置、云端容灾同步 |
| [**v1.0.0**](CHANGELOG.md#v100---2026-09-19) | 2026-09-19 | **基础版本初生**：FastAPI 本地/VPS 与 Cloudflare Workers Serverless 双引擎架构、6位取件码、动态二维码、TTL 自动物理清理 |

👉 **[点击查阅完整详细的《QR-Relay 版本更新日志与架构演进 (CHANGELOG.md)》](CHANGELOG.md)**

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
├── frontend/                           # 现代化响应式前端 (双模自适应 + PWA)
│   ├── index.html                      # 主页面 (移动端底部毛玻璃 Dock + 桌面顶部药丸 + PWA)
│   ├── share.html                      # 极速取件页面 (触控大按钮 + 自动解析)
│   ├── manifest.json                   # PWA Web App 桌面图标与全屏启动配置
│   ├── sw.js                           # PWA Service Worker
│   ├── icon-192.png                    # 192x192 Web App 高清图标
│   ├── icon-512.png                    # 512x512 Web App 高清图标
│   └── apple-touch-icon.png            # iOS Safari 桌面高清图标
├── docker-compose.yml                  # 独立 Docker 编排模版
├── docker-compose.with-openlist.yml    # 与 OpenList 联合编排模版
├── Dockerfile                          # 极轻量容器构建文件
├── wrangler.toml                       # Cloudflare Workers / D1 / R2 绑定配置
├── requirements.txt                    # Python 依赖包清单
└── README.md                           # 项目总览入口与免责条款
```

---

## 📝 版本更新与迭代日志 (Changelog)

### 📌 v1.3.0（最新版本）
- 🔑 **R2 直传凭据 D1 数据库持久化**：
  - 支持直接在网页管理面板（系统设置）中一键保存 R2 Account ID、Access Key ID 与 Secret Access Key，数据加密写入 Cloudflare D1 数据库。
  - 彻底终结了“每次向 GitHub 仓库 push 代码，Cloudflare 自动化构建覆盖 Dashboard 环境变量导致 R2 直传凭据丢失”的痛点问题。
- 🧪 **直传状态一键校验接口 (`/api/r2/test`)**：
  - 在网页后台提供「校验直传」按钮，实时模拟 AWS S3 v4 签名签发流程，即时反馈凭据有效性。
- 🧭 **智能直达与防呆指引**：
  - 上传大于 100MB 文件若检测到未配置 R2 凭据，管理员将自动平滑切换至设置面板，普通访客弹窗引导登录管理员。

### 📌 v1.2.0
- ⏱️ **销毁时点精确可视化**：
  - 中转箱抛弃模糊的“定时销毁”描述，改为精确展示到期时间与倒计时（如 `将于 今日 16:30 销毁 (45分钟后)`），并根据剩余时间紧迫度进行动态染色提示。
- 🛡️ **10GB 总存储物理熔断安全防线**：
  - 双端（Python / Cloudflare Worker）在接收上传前动态核算全站非文本物理用量，达到 10GB 立即熔断拒绝写入，杜绝任何产生费用的风险。
  - 报错信息彻底脱敏，以标准的企业中转站配额提示向用户呈现。
- 📊 **页脚动态配额仪表盘**：
  - 网站底部状态栏实时显示 `存储配额: 已用 X MB / 10 GB`，上传与删除即时联动刷新。

### 📌 v1.1.0
- 🚀 **突破 100MB 限制的超大文件直传 (最高 5GB)**：
  - 原生 Web Crypto 算法实现 AWS S3 v4 预签名机制，浏览器直通 Cloudflare R2，全程附带平滑进度条。
- 🎬 **中文视频流式播放与 RFC 6266 文件名规范**：
  - 支持 HTTP 206 Range 分段加载，移动端拖拽即开。
  - 严格规范双模式 Content-Disposition 头，彻底修复中文文件名下载变纯数字无后缀的问题。

### 📌 v1.0.0
- 📱 **原生 App 质感移动端体验与 PWA 支持**：
  - 支持一键安装至桌面 Web App，适配 iPhone 灵动岛安全区与底部毛玻璃悬浮 Dock 栏。
- ☁️ **OpenList / AList 多网盘备份**：
  - 引入 WebDAV 自动归档，支持探测已挂载的多网盘目录。
- ⚡ **三大部署生态支持**：
  - 本地 Python、Linux VPS Docker 编排以及 Cloudflare Serverless（Workers + D1 + R2）。

---

## 📜 详细免责条款与使用风险告诫

在使用或部署本项目前，请务必仔细阅读以下全部法律与风险条款：

### 1. 仅限个人使用与非商业目的 (Strictly Personal & Non-Commercial Use)
- 本项目系开源软件，作者开发并维护该项目的唯一目的是进行网络通信、前后端架构及分布式边缘计算等技术层面的学习、研究与交流。
- 本项目**严禁用于任何商业营利、向公众收费提供存储服务、广告变现、商业二次包装转售或任何非个人自用性质的商业运营**。

### 2. 数据安全与隐私泄露风险 (Security & Data Risk Warning)
- 本系统设计为轻量级临时中转工具，未开启访问口令的部署属于公网开放状态，提取码存在被暴力扫描或网络嗅探的风险。
- **使用者切勿将本软件用于传输、备份或存储任何高敏感信息**，包括但不限于：个人身份证件、银行账户卡号、支付密码、各类服务凭据、商业秘密、国家涉密文档及任何泄露后可能造成人身财产损害的数据。
- 因使用者自行部署配置不当、弱密码、服务器漏洞遭受侵入或网络劫持等原因造成的数据泄露、篡改、丢失或毁损，本项目原作者**不承担任何明示或暗示的法律责任**。

### 3. 网络信息安全与法律合规零容忍 (Legal Compliance & Zero-Tolerance)
- 使用者及服务器部署者必须严格遵守所在国家或地区的宪法、网络安全法、数据安全法及互联网信息服务管理规定。
- **严禁利用本项目传输、散布、储存任何违反国家法律法规、危害国家安全、侵犯他人合法权益的内容**，包括但不限于：
  - 侵犯他人著作权、商标权、商业秘密等知识产权的内容；
  - 传播淫秽色情、赌博洗钱、电信诈骗、传销等有害信息；
  - 煽动暴力恐怖、分裂国家、破坏民族团结的言论或资料；
  - 计算机木马病毒、勒索软件、黑客攻击工具等恶意代码。
- **任何使用者或部署者因违反上述规定而引发的任何纠纷、行政拘留、罚款处罚或刑事指控，均由该使用者或部署者完全独立承担全部责任，原作者不承担任何连带责任**。

### 4. 软件按现状提供 (AS IS - No Warranty)
- 本项目按“现状 (AS IS)”提供，原作者不对软件的功能完整性、运行连续性、无错误性及特定用途适用性提供任何明示或暗示的保证。
- 原作者不对因使用或无法使用本软件所引发的任何直接、间接、特殊、偶然或附带的损失承担赔偿责任。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源发布，欢迎提交 Issue 与 Pull Request！
