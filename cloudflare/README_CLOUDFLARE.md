# QR-Relay · Cloudflare Workers & Pages 极速部署指南

本项目已为你完整实现了原生适配 **Cloudflare 全家桶（Workers + Pages/Assets + D1 + R2）** 的全栈 Serverless 版本。

- **运行成本**：**$0 / 完全免费**（利用 Cloudflare 永久免费额度：Workers 10万次/天、D1 数据库 5GB、R2 对象存储 10GB且免流量费）。
- **架构特点**：纯边缘计算、0ms 冷启动、全球 CDN 加速、不需要任何自建 VPS 服务器。

---

## 🛠️ 部署准备（需开通的 Cloudflare 免费资源）

登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，确认开通以下两项（首次进入点击“立即开通/启用”即可，均为免费）：
1. **Cloudflare D1**（Serverless SQLite 数据库）
2. **Cloudflare R2**（S3 兼容对象存储，存用户上传的文件与图片）

---

## 🚀 部署方式一：通过命令行 Wrangler 极速部署（推荐）

如果你的电脑或服务器上有 Node.js 环境（Mac 可通过 `brew install node` 一键安装）：

### 1. 安装依赖并登录 Cloudflare
```bash
cd cloudflare
npm install
npx wrangler login
```
*（会自动唤起浏览器完成 Cloudflare 账号授权）*

### 2. 创建 D1 数据库并初始化表结构
```bash
# 创建 D1 数据库
npx wrangler d1 create qr-relay-db
```
命令执行完毕后，控制台会输出一段类似如下的代码：
```toml
[[d1_databases]]
binding = "DB"
database_name = "qr-relay-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
👉 **复制其中的 `database_id`，粘贴替换 `wrangler.toml` 中的 `database_id`。**

接着执行 SQL 初始化数据库表：
```bash
npx wrangler d1 execute qr-relay-db --file=./schema.sql --remote
```

### 3. 创建 R2 文件存储桶
```bash
npx wrangler r2 bucket create qr-relay-files
```

### 4. 一键发布上线！
```bash
npx wrangler deploy
```
部署成功后，终端会直接输出你的专属公网网址，例如：
`https://qr-relay.yourname.workers.dev`

---

## 🌐 部署方式二：通过 GitHub 仓库自动集成（无需本地安装 Node）

如果你不想在本地安装 Node.js，可以直接把代码推送到 GitHub，通过 Cloudflare 网页后台全流程托管：

1. **推送代码至你的 GitHub 私有或公开仓库**。
2. **在 Cloudflare 控制台创建资源**：
   - 数据库：进入「存储和数据库 (Storage & Databases)」->「D1」-> 点击「创建数据库」，名称填 `qr-relay-db`。进入控制台的「控制台 (Console)」标签页，将 `schema.sql` 中的内容粘贴并点击执行。
   - 存储桶：进入「存储和数据库」->「R2」-> 点击「创建存储桶」，名称填 `qr-relay-files`。
3. **创建 Worker 应用**：
   - 进入「计算 (Workers 和 Pages)」-> 点击「创建」-> 选择「连接 Git 仓库」；
   - 授权并选中你的 `qr-relay` 仓库；
   - 根目录选择 `/cloudflare`，构建命令留空或 `npm run deploy`；
4. **绑定 D1 和 R2**：
   - 在已创建的 Worker 设置 ->「Variables and Bindings (变量与绑定)」中：
     - 添加 **D1 数据库绑定**：变量名设为 `DB`，选择 `qr-relay-db`；
     - 添加 **R2 存储桶绑定**：变量名设为 `BUCKET`，选择 `qr-relay-files`；
5. 保存并重新部署，即可全球上线！

---

## ⚙️ 环境变量与自定义配置说明

在 `wrangler.toml` 的 `[vars]` 中可按需微调：

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `APP_NAME` | `QR-Relay` | 网站顶部展示的标题 |
| `MAX_FILE_SIZE_MB` | `100` | 限制最大上传大小（MB） |
| `ADMIN_PASSWORD` | `admin123` | **初始管理员密码**（登录后可在 OpenList 页面在线修改） |
| `OPENLIST_WEBDAV_URL` | *(空)* | 可选：你的公网 OpenList WebDAV 接口地址 |
| `OPENLIST_USERNAME` | *(空)* | 可选：OpenList 用户名 |
| `OPENLIST_PASSWORD` | *(空)* | 可选：OpenList 密码 |
| `OPENLIST_BACKUP_PATH` | `/QR-Relay-Backup` | 备份归档的目标路径 |

---

## 💡 特性与机制

1. **访客隔离与全站透视**：访客仅能在中转箱看到自己当前设备上传的文件；管理员登录后可透视全站所有分享的文件并分类筛选（全部/文件/文本）。
2. **自动定时清理**：`wrangler.toml` 开启了 Cron Trigger（每 10 分钟自动执行一次），到期的文本和文件会被 Worker 自动从 D1 和 R2 物理销毁。
3. **阅后即焚**：勾选阅后即焚的内容，首次被提取下载后立即异步从数据库和 R2 删除。
4. **两套版本共存**：本目录下的 Cloudflare 代码与上级目录的原版 Python 代码完全独立，你可以根据喜好自由选择部署在云端 Cloudflare 或自己的本地/VPS 服务器！
