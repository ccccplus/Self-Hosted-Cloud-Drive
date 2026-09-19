# QR-Relay · 云服务器 (VPS) 生产环境部署指南

本文档面向拥有公网 Linux 服务器（如阿里云、腾讯云、华为云、AWS、甲骨文等 VPS）的用户。通过本指南，你可以在公网部署一套 7×24 小时稳定运行、具备 HTTPS 证书加密、支持反向代理与多网盘自动备份的私有云快传中转站。

---

## 🌟 方案特点

- 🌐 **全网全终端秒开**：通过你自己的独立域名或服务器公网 IP，在任何地方随时随地存取内容。
- 📦 **免运维全自动化**：容器化一键拉起，内置后台守护线程定时物理清理过期文件，杜绝占满磁盘。
- 🗂️ **对接 OpenList / AList 多网盘**：文件在中转站落盘的同时，后台异步备份归档至百度网盘、阿里云盘、夸克网盘、OneDrive 等。
- 🛡️ **生产级安全**：支持访客免密取件、站长专享上传密码（`UPLOAD_PASSWORD`）以及全站 HTTPS 加密。

---

## 📋 准备工作

1. **一台公网 Linux 服务器**：系统推荐 Ubuntu 20.04/22.04/24.04 或 Debian 11/12。
2. **已解析至服务器的域名**（如 `relay.yourdomain.com`，可选，若仅用 IP 亦可）。
3. **防火墙/安全组已放行端口**：
   - `80` (HTTP) 和 `443` (HTTPS)
   - 若直接访问容器，需放行 `8080`

---

## 🚀 方式一：Docker Compose 独立容器部署（最推荐）

如果你服务器上已经安装了 Docker，或者已独立运行了 OpenList / AList，推荐使用标准独立部署。

### 1. 安装 Docker 与 Docker Compose（若未安装）
```bash
# Ubuntu / Debian 一键安装
curl -fsSL https://get.docker.com | bash -s docker
systemctl enable --now docker
```

### 2. 克隆仓库并配置环境
```bash
git clone https://github.com/ccccplus/Self-Hosted-Cloud-Drive.git qr-relay
cd qr-relay

# 复制环境变量模版
cp .env.example .env
```

### 3. 编辑 `.env` 文件
```bash
nano .env
```
根据实际情况修改关键项：
```env
# 核心设置：你的外网访问域名（非常关键，用于生成二维码和提取链接）
BASE_URL=https://relay.yourdomain.com

# 端口配置
PORT=8080

# 单文件最大限制 (MB)
MAX_FILE_SIZE_MB=100

# 可选：上传防刷密码（若填写，前台上传时需输入此密码，访客取件则无需密码；留空则公开随意上传）
UPLOAD_PASSWORD=

# 可选：已有 OpenList WebDAV 对接配置（亦可在部署后通过网页端设置）
OPENLIST_WEBDAV_URL=
OPENLIST_USERNAME=admin
OPENLIST_PASSWORD=
OPENLIST_BACKUP_PATH=/QR-Relay-Backup
```

### 4. 一键启动容器
```bash
docker compose up -d
```

### 5. 检查运行状态
```bash
docker compose ps
docker compose logs -f
```
终端显示服务就绪后，访问 `http://服务器IP:8080` 即可开始使用！

---

## 📦 方式二：全合一联合编排（QR-Relay + OpenList 同时拉起）

如果你还没有安装过任何网盘挂载工具，希望一条命令同时运行 **QR-Relay 中转站** 和 **OpenList 多网盘挂载器**：

### 1. 启动联合编排
```bash
docker compose -f docker-compose.with-openlist.yml up -d
```

### 2. 获取 OpenList 初始密码
```bash
docker exec -it openlist ./openlist admin
```
控制台会输出 OpenList 的初始管理员账密。

### 3. 登录 OpenList 并挂载网盘
1. 浏览器打开 `http://服务器IP:5244`，使用上一步的账密登录 OpenList 后台。
2. 在 OpenList 后台「存储」中添加你的网盘（如阿里云盘、夸克网盘、百度网盘、OneDrive 等），例如挂载路径设为 `/aliyun`。
3. 进入 QR-Relay 网页端的「🗂️ OpenList 挂载」页面，点击「探测已挂载网盘」，点击选定该网盘，即可实现上传后自动容灾归档！

---

## 🐧 方式三：裸机 Linux Systemd 守护进程部署（免 Docker）

如果你偏好直接在服务器原生 Python 环境下运行：

### 1. 安装基础依赖与拉取代码
```bash
sudo apt update && sudo apt install -y python3 python3-pip python3-venv git
git clone https://github.com/ccccplus/Self-Hosted-Cloud-Drive.git /opt/qr-relay
cd /opt/qr-relay

# 创建虚拟环境与安装依赖
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# 配置环境
cp .env.example .env
nano .env
```

### 2. 创建 Systemd 服务配置文件
创建 `/etc/systemd/system/qr-relay.service`：
```ini
[Unit]
Description=QR-Relay Cloud Storage Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/qr-relay
ExecStart=/opt/qr-relay/.venv/bin/python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8080
Restart=always
RestartSec=5
EnvironmentFile=/opt/qr-relay/.env

[Install]
WantedBy=multi-user.target
```

### 3. 启用并启动服务
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now qr-relay
sudo systemctl status qr-relay
```

---

## 🌐 Nginx 反向代理与 HTTPS 证书配置

为了保障手机端能正常调用剪贴板复制功能、摄像头扫码以及防中间人窃听，**强烈建议为网站配置 HTTPS 加密**。

### 1. 安装 Nginx 和 Certbot
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. 创建 Nginx 站点配置
创建 `/etc/nginx/sites-available/qr-relay.conf`：
```nginx
server {
    listen 80;
    server_name relay.yourdomain.com; # 替换为你的真实域名

    # 允许上传大文件（与 MAX_FILE_SIZE_MB 保持一致）
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        
        # 传递真实客户端 IP 和协议头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 与连接支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用站点并重载 Nginx：
```bash
sudo ln -sf /etc/nginx/sites-available/qr-relay.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. 申请免费 Let's Encrypt SSL 证书
```bash
sudo certbot --nginx -d relay.yourdomain.com
```
跟随终端提示输入邮箱并同意条款，Certbot 会自动配置 HTTPS 证书并在到期前自动续签。

完成后，直接使用浏览器访问 `https://relay.yourdomain.com`，享受极速流畅体验！

---

## 💾 数据备份与灾备

- **数据库路径**：`./data/relay.db`（SQLite 单文件存储所有提取码和配置）
- **文件存储路径**：`./data/uploads/`（用户上传的文件与图片）
- **数据备份命令**：
  ```bash
  # 快速创建数据快照备份
  tar -czvf qr-relay-backup-$(date +%F).tar.gz ./data
  ```
- **生命周期机制**：
  服务内置守护线程每 60 秒（可配置）检查一次到期数据，当条目达到有效期时，会自动清理数据库记录并物理删除磁盘上的文件，无需担心 VPS 磁盘被大文件撑爆。
