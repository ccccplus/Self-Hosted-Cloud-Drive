# QR-Relay · 本地部署与局域网极速快传指南

本文档面向希望在 **个人电脑（macOS / Windows / Linux）** 或 **家庭/办公室局域网 (LAN)** 中运行 QR-Relay 的用户。通过本指南，你可以在 3 分钟内搭建起私密、无外部依赖且支持跨设备（手机与电脑同 WiFi 极速互传）的临时中转站。

---

## 🌟 适用场景与优势

- 💻 **跨设备随手传**：手机与电脑处于同一 WiFi，手机拍照/相册或电脑剪贴板文字直接互通，无需登录微信文件传输助手。
- 🔒 **数据绝对私密**：数据与文件仅存放在本机磁盘，不经由任何第三方公网服务器。
- ⚡ **内网千兆极速**：大文件传输跑满局域网 WiFi 速率，不受外网带宽或云存储限速制约。
- 🛠️ **开发者调试**：便于针对前端页面和 FastAPI 后端进行二次开发与测试。

---

## 📋 环境要求

| 软件/组件 | 最低版本要求 | 检查命令 |
| :--- | :--- | :--- |
| **Python** | 3.10 及以上 | `python3 --version` |
| **Git** | 任意版本 | `git --version` |
| **网络** | 本机运行或同一局域网 WiFi | - |

---

## 🚀 步骤详解

### 步骤一：克隆代码仓库

打开终端（Terminal 或 PowerShell），进入你常用的代码工作区：

```bash
git clone https://github.com/ccccplus/Self-Hosted-Cloud-Drive.git qr-relay
cd qr-relay
```

---

### 步骤二：创建 Python 虚拟环境并安装依赖

强烈推荐使用独立的 Python 虚拟环境，保持全局环境整洁：

#### macOS / Linux
```bash
# 1. 创建虚拟环境 (.venv)
python3 -m venv .venv

# 2. 激活虚拟环境
source .venv/bin/activate

# 3. 安装依赖包
pip install -r requirements.txt
```

#### Windows (PowerShell)
```powershell
# 1. 创建虚拟环境
python -m venv .venv

# 2. 激活虚拟环境
.\.venv\Scripts\Activate.ps1

# 3. 安装依赖包
pip install -r requirements.txt
```

> 💡 **国内网络加速**：若下载较慢，可使用清华镜像源：  
> `pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple`

---

### 步骤三：配置环境变量 (.env)

复制项目根目录下的配置模版：

```bash
cp .env.example .env
```

使用编辑器打开 `.env` 文件。如果仅在**本机自己访问**，保持默认即可：
```env
# 服务运行端口
PORT=8080

# 外部访问域名或IP（生成二维码和分享链接的核心依据）
BASE_URL=http://localhost:8080

# 单文件最大容量限制 (MB)
MAX_FILE_SIZE_MB=100

# 文件过期物理清理检查周期 (秒)
AUTO_CLEANUP_INTERVAL_SECONDS=60
```

---

### 步骤四：🔥 关键秘籍：配置局域网 WiFi 跨设备快传（手机扫电脑）

如果你希望**用手机扫描电脑屏幕上的二维码**，或在手机浏览器输入 6 位口令直接提取内容，需要将 `BASE_URL` 改为电脑的**局域网 IP 地址**：

#### 1. 查询电脑在局域网中的 IP 地址：
* **macOS**：终端运行 `ipconfig getifaddr en0`（若使用 WiFi）或在「系统设置」->「Wi-Fi」中查看「IP 地址」（如 `192.168.1.100`）。
* **Windows**：PowerShell 运行 `ipconfig`，查看 `IPv4 地址`（如 `192.168.1.100`）。
* **Linux**：终端运行 `hostname -I | awk '{print $1}'`。

#### 2. 修改 `.env` 文件：
```env
BASE_URL=http://192.168.1.100:8080
```
*(将 `192.168.1.100` 替换为你电脑实际查到的局域网 IP)*

---

### 步骤五：启动服务

在项目根目录下执行启动命令（必须绑定 `--host 0.0.0.0` 以允许局域网设备接入）：

```bash
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload
```

终端输出如下即代表启动成功：
```text
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080 (Press CTRL+C to quit)
```

现在：
1. **电脑端访问**：在浏览器打开 [http://localhost:8080](http://localhost:8080)。
2. **手机端访问**：确保手机连在同一个 WiFi 下，在手机浏览器打开 `http://192.168.1.100:8080`，或直接用手机自带相机扫描电脑生成的取件二维码！

---

## 🛠️ 后台运行与开机自启（可选）

如果你希望电脑开机后在后台静默运行 QR-Relay，无需一直挂着终端窗口：

### macOS / Linux (nohup 后台守护)
```bash
# 后台启动并输出日志到 run.log
nohup ./.venv/bin/python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8080 > run.log 2>&1 &

# 查看后台运行状态
ps aux | grep uvicorn

# 停止后台服务
pkill -f "uvicorn backend.main:app"
```

### Windows (简易批处理脚本 `start.bat`)
在项目根目录新建 `start.bat`：
```bat
@echo off
cd /d %~dp0
call .\.venv\Scripts\activate.bat
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
pause
```
双击 `start.bat` 即可一键启动。

---

## ❓ 常见问题与排错

### 1. 手机连了同一 WiFi 却打不开网页？
- **排查系统防火墙**：
  - **macOS**：「系统设置」->「网络」->「防火墙」，确保允许 Python 传入连接。
  - **Windows**：进入「Windows Defender 防火墙」，允许专用网络放行端口 `8080`，或临时允许 Python 专用网络通信。
- **确认路由器未开启 AP 隔离**：某些公司或公共商用 WiFi 启用了「AP 隔离 (Client Isolation)」，会阻止局域网设备互相通信。切换到普通家庭 WiFi 或手机热点即可。

### 2. 提示端口被占用 (`Address already in use`)？
```bash
# 查询占用 8080 端口的进程 PID
lsof -i :8080

# 终止该进程 (替换 <PID>)
kill -9 <PID>
```
或者修改 `.env` 中的 `PORT=8081` 和 `BASE_URL=http://...:8081`。

### 3. 上传的文件保存在哪里？
- 数据库保存在本地的 `data/relay.db`（SQLite 单文件）。
- 上传的文件与图片保存在 `data/uploads/` 目录下。
- 过期文件会由后台线程依据你设置的有效期（10分钟/1小时/1天/7天）自动物理删除，无需手动打理。
