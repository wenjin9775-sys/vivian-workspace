# 部署指南：把 Vivian 工作台变成「任何网络都能登录同步」

后端是一个**零依赖 Node 服务**（`server.js`），同时也托管前端静态文件。
部署后，网页端、手机 PWA、微信小程序都连同一个地址，数据互通。

---

## 零、绑定域名 vivian.works（强烈建议先做）

网页端、PWA、微信小程序都建议统一走 `https://vivian.works`，这样三端同源、数据互通，小程序也满足"必须 https 域名"的硬性要求。

1. **注册域名**：到任意服务商（阿里云 / 腾讯云 / Cloudflare / Namecheap 等）搜索并购买 `vivian.works`。
   - `.works` 是常规 gTLD，一般无需特殊资质即可注册。
   - 先确认未被注册；若已被占用，备选：`vivianwork.com` / `vivian-desk.com` / `vivianstudio.cn`。
2. **解析到服务器**：在你买域名的控制台添加记录，把 `vivian.works` 指向部署后端所在服务器/服务的公网地址：
   - 自有服务器/VPS：添加 **A 记录** → 你的服务器公网 IP（或 AAAA 记录指向 IPv6）。
   - Render / Railway 等：添加 **CNAME 记录** → 服务商给你的 `xxxx.onrender.com` / `xxxx.up.railway.app`。
   - 用 Cloudflare 托管解析还能一键开启 HTTPS（推荐）。
3. **开启 HTTPS（小程序强制要求）**：
   - 自有服务器：用 nginx 反代 + Let's Encrypt 免费证书（Certbot）。
   - Cloudflare：开启「始终使用 HTTPS」即可。
   - Render/Railway：默认自带 https。
4. **（仅国内服务器需要）ICP 备案**：若服务器/节点在中国大陆，域名必须完成 ICP 备案，微信小程序服务器域名才能通过审核。境外/香港节点可跳过。
5. **微信小程序加白**：登录微信公众平台 → 小程序 → 开发管理 → 开发设置 → 服务器域名 →
   `request 合法域名` 添加 `https://vivian.works`。本项目 `miniprogram/app.js` 的 `BASE_URL` 已设为该地址。

> 完成后，所有客户端都通过 `https://vivian.works` 访问，无需再改其它代码。

---

## 一、部署后端（选一种）

### 方案 A：Render（免费、最简单，推荐）
1. 注册 https://render.com （用 GitHub 登录）。
2. 新建 **Web Service**，连接你存放本目录的 Git 仓库（或手动上传）。
3. 设置：
   - Build Command：留空（无需安装依赖）
   - Start Command：`node server.js`
   - 环境变量：`PORT` = `10000`（Render 用这个；代码已读环境变量）
4. 部署完成后会得到一个 `https://xxxx.onrender.com` 的公网地址。
5. ⚠️ 免费版空闲会休眠，第一次访问可能慢几秒，属正常。

### 方案 B：Railway
1. 注册 https://railway.app ，新建 Project → Deploy from GitHub/Docker。
2. Start 命令 `node server.js`，端口用环境变量 `PORT`（Railway 自动注入）。
3. 得到公网 `https://xxxx.up.railway.app`。

### 方案 C：自己的云服务器 / VPS（Ubuntu 示例）
```bash
# 把本目录传上去后
cd vivian-workspace
node server.js   # 或 nohup node server.js & 后台运行
# 建议用 nginx 反代 + 申请 HTTPS（小程序强制要求 https）
```
或用 Docker：
```bash
docker build -t vivian-workspace .
docker run -d -p 8770:8770 -v $(pwd)/server-data:/app/server-data vivian-workspace
```

### 关键环境变量
| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 监听端口 | `8770` |
| `ALLOW_ORIGIN` | CORS 允许的源，`*` 为任意（生产可改成你的前端域名） | `*` |

---

## 二、让网页/PWA 指向新地址
打开 `app.js`，把顶部 `API` 常量从 `""` 改成你的公网地址，例如：
```js
const API = "https://vivian.works";
```
（留空 `""` 表示同源，即前端和后端在同一域名 `vivian.works` 下时自动用当前域名，部署到该域名可保持留空。）
（留空 `""` 表示同源，即前端和后端在同一域名下时自动用当前域名。）

改完重新部署前端即可。手机 Safari 打开网页 → 「添加到主屏幕」就是 App。

---

## 三、微信小程序接入（见 `miniprogram/` 目录）
1. 用微信开发者工具导入 `miniprogram/` 目录。
2. 在 `miniprogram/app.js` 里把 `BASE_URL` 改成你的公网 https 地址。
3. 在 **微信公众平台 → 小程序 → 开发管理 → 开发设置 → 服务器域名** 中，
   把 `request 合法域名` 加上 `https://vivian.works`（本项目 `miniprogram/app.js` 的 `BASE_URL` 已设为该地址）。
4. 用你自己的 **AppID**（测试可用「测试号」，但正式发布必须实名小程序）。
5. 编译预览 → 手机微信扫码即可在 iPhone 上登录使用，数据和网页端互通。

> 苹果手机（iPhone 16）完全支持微信小程序，无需额外处理。

---

## 四、数据说明
- 用户数据存于运行目录下的 `server-data/<用户名>/`，含 `state.json` 与 `images/`。
- 用 Docker / 云服务时务必把 `server-data` 挂为**持久卷**，否则重启丢数据。
- 密码用 scrypt 加盐哈希，token 存于 `users.json`，传输走 HTTPS 才安全。

---

## 五、个人自用最简方案（免域名 / 免备案 / 不发布审核）

如果小程序只你自己用、不对外，可以完全跳过上面的域名注册、ICP 备案和微信审核流程：

1. **后端随便部署到一个带 https 的公网地址即可**：推荐 Render（`https://xxxx.onrender.com`，自带 https、免费）或 Railway，无需自定义域名。
   - 把 `miniprogram/app.js` 的 `BASE_URL` 改成该 https 地址（如 `https://xxxx.onrender.com`）。
2. **微信开发者工具里关闭域名校验**：导入项目 → 右上角「详情」→「本地设置」→ 勾选
   **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**。
3. **直接「预览」或「真机调试」**：点开发者工具的「预览」，用 iPhone 微信扫二维码即可打开使用。
   - 此模式下不受「request 合法域名必须备案」限制，未备案域名也能正常调用。
   - 缺点：每次用需要开发者工具开着并重新扫预览码，适合个人偶尔使用。
4. **想要常驻手机（免每次扫码）**：把项目「上传」为**体验版**，在微信公众平台把你自己的微信设为「体验者」，
   即可从微信「小程序 → 体验版」常驻打开。但体验版通常仍需服务器域名已备案；若不想备案，就继续用第 3 步的预览方式，或改用下面的 PWA 方案。

> 更省事的一条路：iPhone 上直接用 Safari 打开网页端 →「添加到主屏幕」，就是一个独立 App 图标，
> 完全不需要微信、不需要审核、不需要域名白名单，只要后端是个公网 https 地址即可。个人自用最推荐这个。
