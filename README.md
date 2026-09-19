# QR-Relay 临时云盘与二维码中转站

> 一个专为个人服务器打造的极简、现代、高性能的**文字与小文件临时中转站**。支持快速生成内容二维码与取件码、浏览器直接粘贴图片与拖拽上传，并无缝对接 **OpenList** 实现多网盘自动容灾归档。

---

## ✨ 核心特性

- 📝 **文字与二维码中转**：
  - **直接内容码 (离线扫码)**：短文本直接编码至二维码，手机自带相机扫码即可离线读取，无需经过网络或打开网页。
  - **取件码模式**：长文本或格式内容自动生成取件码（如 `6821`）与提取链接，支持一键复制。
- 📁 **小文件与图片临时云盘**：
  - **截图即贴**：页面任意位置直接按 `Ctrl + V` 即可自动抓取剪贴板图片并上传。
  - **拖拽上传**：支持小文件与图片拖拽，实时显示上传进度与缩略图预览。
- ⏱️ **自动生命周期管理 (TTL)**：
  - 支持设置 10分钟、1小时、24小时、7天、阅后即焚、或永久。
  - 本地守护线程定时物理清理过期文件，杜绝占满服务器 SSD 空间。
- ☁️ **OpenList 云盘自动备份**：
  - 深度集成 **OpenList** 原生 WebDAV 协议。
  - 文件或文本在中转站落盘的同时，后台异步自动推送至 OpenList 指定挂载目录（如阿里云盘、夸克、OneDrive、115 或本地 NAS）。
  - **即使中转站本地文件因到期被销毁，OpenList 里的云盘归档备份依然完好**！
- 📱 **移动端高度自适应**：
  - 扫码直达专属轻量取件页面，适配微信内置浏览器、iOS Safari 与 Android Chrome。
- 🛡️ **可选访问防护**：
  - 可配置 `UPLOAD_PASSWORD`，实现“访客扫码查看免密，仅本人拥有上传权限”。

---

## 🚀 快速开始与部署

### 方案一：独立部署（对接已有 OpenList）

如果你服务器上已经运行了 OpenList，只需运行 QR-Relay 容器：

1. 克隆代码或下载项目文件夹：
   ```bash
   cd qr-relay
   ```

2. 准备配置文件（或直接修改 `docker-compose.yml`）：
   ```bash
   cp .env.example .env
   # 编辑 .env 填入你的域名与已有的 OpenList WebDAV 信息
   ```

3. 启动容器：
   ```bash
   docker compose up -d
   ```
   访问 `http://你的服务器IP:8080` 即可开始使用！

---

### 方案二：全合一编排（QR-Relay + OpenList 同时拉起）

如果你尚未安装 OpenList，希望一套配置直接拉起全部服务：

1. 启动全合一 Compose：
   ```bash
   docker compose -f docker-compose.with-openlist.yml up -d
   ```

2. 查看 OpenList 的初始管理员密码：
   ```bash
   docker exec -it openlist ./openlist admin
   ```
   *(或者访问 `http://你的服务器IP:5244` 登录 OpenList 后台并设置你的常用密码)*

3. 将密码更新到 `docker-compose.with-openlist.yml` 中的 `OPENLIST_PASSWORD`，并重新启动：
   ```bash
   docker compose -f docker-compose.with-openlist.yml up -d
   ```

---

## ⚙️ 环境变量说明

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `BASE_URL` | `http://localhost:8080` | **非常重要**：用于生成分享链接与二维码中的域名地址 |
| `PORT` | `8080` | 服务运行端口 |
| `MAX_FILE_SIZE_MB` | `100` | 单个文件最大大小限制（单位 MB） |
| `UPLOAD_PASSWORD` | *(空)* | 上传密码（留空则公开上传，填写则上传需验证） |
| `AUTO_CLEANUP_INTERVAL_SECONDS` | `60` | 本地过期文件检查与物理清理周期（秒） |
| `OPENLIST_WEBDAV_URL` | *(空)* | OpenList 的 WebDAV 接口地址（如 `http://openlist:5244/dav`） |
| `OPENLIST_USERNAME` | `admin` | OpenList WebDAV 登录账号 |
| `OPENLIST_PASSWORD` | *(空)* | OpenList WebDAV 登录密码 |
| `OPENLIST_BACKUP_PATH` | `/QR-Relay-Backup` | 存储在 OpenList 里的归档根目录 |
| `OPENLIST_AUTO_SYNC` | `True` | 上传后是否默认自动触发异步备份 |

---

## 🌐 Nginx 反向代理配置样例

推荐使用 Nginx 反代并配置 HTTPS，以获得最佳剪贴板粘贴与安全体验：

```nginx
server {
    listen 80;
    server_name relay.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name relay.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/relay.crt;
    ssl_certificate_key /etc/nginx/ssl/relay.key;

    # 允许上传较大文件
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📂 项目工程结构

```
qr-relay/
├── backend/
│   ├── config.py                 # Pydantic Settings 与环境变量解析
│   ├── database.py               # SQLite 数据库模型与取件码生成
│   ├── main.py                   # FastAPI 主路由与接口
│   └── services/
│       ├── cleanup_worker.py     # 本地磁盘 TTL 过期自动清理
│       ├── openlist_sync.py      # OpenList 异步 WebDAV 客户端
│       └── qrcode_service.py     # 二维码矢量图与 Base64 生成
├── frontend/
│   ├── index.html                # 桌面/移动端交互主界面 (TailwindCSS)
│   └── share.html                # 手机扫码直达的轻量取件页
├── Dockerfile                    # 极小体积镜像构建文件
├── docker-compose.yml            # 独立部署编排模版
├── docker-compose.with-openlist.yml # 与 OpenList 联合启动模版
├── requirements.txt              # Python 依赖清单
└── README.md                     # 详细使用指南
```
