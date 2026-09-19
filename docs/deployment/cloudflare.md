# QR-Relay · Cloudflare Serverless 全托管部署指南

本文档面向希望实现 **$0 零成本、无需自购 VPS 服务器、全球 CDN 边缘极速响应** 的用户。QR-Relay 原生深度适配了 Cloudflare 全家桶（Workers 边缘计算 + Static Assets 静态托管 + D1 分布式数据库 + R2 免出站流量费对象存储），让你轻松拥有高可用、免运维的私有云快传系统。

---

## 🌟 为什么选择 Cloudflare 部署？

| 维度 | 自建云服务器 (VPS) | Cloudflare Serverless 全托管 |
| :--- | :--- | :--- |
| **服务器成本** | 每年约 ¥200 ~ ¥1000+ | **$0 / 完全免费** (永久免费额度) |
| **全球访问速度** | 取决于服务器单点物理机房 | **全球 300+ 边缘节点 Anycast CDN 秒级响应** |
| **流量费用** | 按照峰值带宽或出站流量计费 | **R2 对象存储完全免出站流量费** |
| **运维成本** | 需安装 Linux、Docker、打补丁、续签 SSL | **0 运维**，无服务器崩溃风险，免维护系统内核 |
| **冷启动延迟** | 常驻进程 | **0ms 边缘冷启动** (V8 隔离技术) |

---

## 🎁 Cloudflare 永久免费额度概览

QR-Relay 的日常轻量快传完全落在 Cloudflare 的个人免费额度之内：
- **Cloudflare Workers**：每日 **100,000 次** 免费请求调用
- **Cloudflare D1 数据库**：**5 GB** 免费存储空间，每日 500 万行读取、10 万行写入
- **Cloudflare R2 对象存储**：**10 GB** 免费文件存储容量，**A/B类操作每月数百万次，无出站流量费用**
- **SSL 证书**：自动免费生成，永久全自动续期

---

## 🚀 方式一：Wrangler CLI 命令行极速部署（推荐）

如果你的电脑有终端环境（支持 macOS、Windows、Linux），通过 Wrangler CLI 可以在 3 分钟内一键完成所有资源的创建与代码发布。

### 1. 登录 Cloudflare 账号
进入项目根目录：
```bash
npx wrangler login
```
终端会弹出浏览器窗口，点击「Allow」完成授权绑定。

---

### 2. 创建 D1 数据库并初始化表结构
```bash
# 创建名为 qr-relay-db 的 D1 数据库
npx wrangler d1 create qr-relay-db
```
执行成功后，终端会打印出类似如下的配置片段：
```toml
[[d1_databases]]
binding = "DB"
database_name = "qr-relay-db"
database_id = "0b63031a-3432-4d0b-83e5-ac9a1168e876" # 你的真实数据库 ID
```
👉 **打开项目根目录下的 `wrangler.toml`，将 `database_id` 替换为你实际生成的 ID。**

接着执行 SQL 初始化数据库表结构：
```bash
npx wrangler d1 execute qr-relay-db --file=./cloudflare/schema.sql --remote
```

---

### 3. 创建 R2 文件存储桶
```bash
npx wrangler r2 bucket create qr-relay-files
```
*(提示：`wrangler.toml` 中默认已将 R2 存储桶绑定变量设为 `BUCKET` 与 `qr-relay-files`)*

---

### 4. 一键部署上线！
```bash
npx wrangler deploy
```
命令执行完毕后，控制台会直接输出分配的专属域名，例如：
```text
Uploaded self-hosted-cloud-drive (1.20 sec)
Deployment complete!
https://self-hosted-cloud-drive.yourusername.workers.dev
```
在浏览器中打开该链接，即可开始体验！

---

## 🌐 方式二：Cloudflare 控制台 Web UI 零代码部署

如果你不想在本地安装任何命令行工具，可完全通过 Cloudflare 网页后台与 GitHub 仓库一键托管：

### 1. Fork 或推送代码至你的 GitHub
将本项目代码推送至你自己的 GitHub 仓库（无论是公开还是私有）。

### 2. 在 Cloudflare 控制台创建 D1 数据库
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 左侧导航栏进入 **「存储和数据库 (Storage & Databases)」** -> **「D1 SQL 数据库」**。
3. 点击 **「创建数据库」**，名称输入 `qr-relay-db`。
4. 创建完成后，点击进入该数据库的 **「控制台 (Console)」** 标签页。
5. 将仓库中 [`cloudflare/schema.sql`](file:///Users/plusc/.gemini/antigravity/scratch/qr-relay/cloudflare/schema.sql) 的全部内容粘贴到输入框中，点击 **「执行 (Execute)」**。

### 3. 在 Cloudflare 控制台创建 R2 存储桶
1. 左侧导航栏进入 **「存储和数据库」** -> **「R2 对象存储」**。
2. 点击 **「创建存储桶 (Create Bucket)」**，名称输入 `qr-relay-files`，其余保持默认，点击创建。

### 4. 创建 Worker 并关联 GitHub 仓库
1. 左侧导航栏进入 **「计算 (Workers 和 Pages)」** -> 点击 **「创建 (Create)」**。
2. 选择 **「连接到 Git 存储库 (Connect Git)」**，授权并选择你的 `Self-Hosted-Cloud-Drive` 仓库。
3. 构建配置中：
   - 项目名称：`self-hosted-cloud-drive`（或任意你喜欢的名称）
   - 生产分支：`main`
   - 根目录：留空或根据项目结构保持根目录
4. 点击保存并部署。

### 5. 绑定 D1 与 R2（最核心步骤）
部署成功后，进入该 Worker 的 **「设置 (Settings)」** -> **「变量与绑定 (Variables and Bindings)」**：
1. **添加 D1 数据库绑定**：
   - 变量名称：`DB`
   - 数据库：选择第 2 步创建的 `qr-relay-db`
2. **添加 R2 存储桶绑定**：
   - 变量名称：`BUCKET`
   - 存储桶：选择第 3 步创建的 `qr-relay-files`
3. 点击 **「部署 (Deploy)」** 重新生效。

---

## 🔗 自定义域名与 HTTPS 绑定

Cloudflare 默认提供的 `workers.dev` 域名在国内部分网络环境下可能访问不畅。绑定你自己的个性域名可以获得极速直连体验：

1. 进入 Worker 项目页面 -> **「设置 (Settings)」** -> **「域和路由 (Domains & Routes)」**。
2. 点击 **「添加自定义域 (Add Custom Domain)」**。
3. 输入你的二级域名，例如：`yun.yourdomain.com`。
4. 点击添加，Cloudflare 会全自动配置 DNS 解析与全球边缘 SSL 证书，1 分钟内全球生效！

---

## 🗂️ 对接 OpenList / AList 多网盘备份

Cloudflare 边缘架构同样完整支持 OpenList 多网盘备份：

- **网页端配置（推荐）**：  
  在部署好的网站右上角切换到「🗂️ OpenList 挂载」页面，输入你的 WebDAV 服务器地址、用户名、密码与路径前缀，点击保存即可，配置将加密持久化存入 Cloudflare D1 数据库。
- **控制台环境变量配置**：  
  在 Worker 的「设置」->「变量与机密」中，可添加以下可选环境变量：
  - `OPENLIST_WEBDAV_URL`：例如 `https://your-openlist.com/dav`
  - `OPENLIST_USERNAME`：WebDAV 用户名
  - `OPENLIST_PASSWORD`：WebDAV 密码
  - `OPENLIST_BACKUP_PATH`：网盘存储路径（如 `/aliyun/QR-Relay-Backup`）

---

## ❓ 常见问题与避坑指南

### 1. 为什么访问 `/s/123456` 会提示找不到提取码？
- **原理解析**：Cloudflare Static Assets 内置 Clean URLs（去除扩展名）规则。如果 Worker 内部向 Assets 请求 `/share.html`，Assets 服务端会发出 `HTTP 307` 重定向至 `/share`，从而把 URL 后缀中的 6 位取件码丢弃。
- **官方解法**：本项目 `worker.js` 已内置阻断重定向并在服务端以 HTTP 200 直接透传 HTML，前端 `share.html` 同时内置了路径容错解析，确保永远能精准解析 6 位口令。

### 2. 数据库报错 `D1_ERROR: no such table: items`？
说明未执行 SQL 表结构初始化。请在终端执行：
```bash
npx wrangler d1 execute qr-relay-db --file=./cloudflare/schema.sql --remote
```
或在控制台 D1 的 Console 界面粘贴执行 `schema.sql` 中的建表语句。

### 3. 上传文件大小限制
Cloudflare Workers 免费计划的标准 HTTP 请求体上限为 **100MB**，本项目默认配置的 `MAX_FILE_SIZE_MB = 100` 已完全拉满此额度。对于大文件快传已绰绰有余。
