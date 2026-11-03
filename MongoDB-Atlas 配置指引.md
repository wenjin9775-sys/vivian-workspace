# MongoDB Atlas + Render 持久化（配置备查）

> ✅ **当前状态：已于 2026-07-26 配置完成，无需重复操作。**
> 当时已建好 MongoDB Atlas 免费 M0 集群、在 Render 后台填好 `MONGODB_URI`，
> 并验证「register / login / PUT state / GET state 全部正常，MongoDB 持久化生效」。
> 本文档**仅供**日后更换数据库、重建服务或排查连接问题时参考。
>
> 如果只是想确认现在有没有连上：Render 控制台 → 服务 `vivian-workspace` →
> **Environment** 里看 `MONGODB_URI` 这个 Key 是否还在；或到 Atlas →
> 数据库 `vivian` → `states` 集合，看有没有文档。

## 背景：当初为什么要做

Render 免费档不配数据库时，数据写在**临时磁盘**上。服务一重启、一重新部署，数据就没了——
手机 / 电脑 / iPad 三端同步也就无从谈起。

接上 MongoDB Atlas（免费 M0，512MB，个人用完全够）之后：

- 数据真正落库，**重启、重新部署都不丢**
- 手机、电脑、iPad 登录同一账号，看到的是**同一份数据**
- 服务端代码已支持，你只需要配一个环境变量

> `server.js` 里数据库名已固定为 `vivian`，连接串**不需要**写库名。
> 首次连接且库为空时，会自动把本机已有的数据迁进去。

---

## 第一步：备份现有数据（先做，别跳过）

切换会触发重新部署，临时磁盘上的数据会被清空。先把当前数据导出来存好：

浏览器打开这个地址，会自动下载一个 JSON：

```
https://vivian-workspace.onrender.com/api/local/export
```

（这是你的全部记录，存到电脑里。）

---

## 第二步：创建免费的 MongoDB Atlas 集群

1. 打开 <https://www.mongodb.com/atlas/database> ，注册 / 登录（可用 Google 账号）
2. **Create a cluster**（建集群）→ 选 **M0 Sandbox / Free**（免费档，写着 Free forever）
3. **Region（地区）** 建议选：
   - `ap-southeast-1`（新加坡）或 `ap-northeast-1`（东京）——离我们近一点
   - 实际上 Render 服务器连 Atlas，你在哪影响不大，随便选也行
4. 集群名字保持默认，点 **Create** → 等 1~3 分钟创建完成

---

## 第三步：建数据库用户（重要）

1. 左侧菜单 **Database Access** → **Add New Database User**
2. Authentication Method 选 **Password**
3. 填用户名、密码：
   - ⚠️ **密码只用字母和数字**（例如 `Vivian2026`），**不要**用 `@ : / ? # %` 这类符号
     —— 这些符号放进连接串会出错，要额外转码，很麻烦
4. 角色选 **Atlas admin**（或 `readWriteAnyDatabase`）
5. 点 **Add User**

> 注意：这是**数据库**的用户，和你工作台 App 里的登录账号是两回事，互不相关。

---

## 第四步：允许 Render 访问（最容易漏的一步）

1. 左侧菜单 **Network Access** → **Add IP Address**
2. 选 **Allow Access from Anywhere**（IP 填 `0.0.0.0/0`）
3. 点 **Confirm**

> 必须放行，因为 Render 免费档的外网 IP 是动态变的，没法写固定 IP。
> 数据库本身仍靠账号密码保护。

---

## 第五步：拿到连接串

1. 回到 **Database** → 你的集群 → 点 **Connect**
2. 选 **Drivers**（驱动）
3. Driver 选 **Node.js**，版本随便
4. 复制那串连接串，长这样：

```
mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
```

5. **把 `<username>` 和 `<password>` 替换成第三步你设的真实值**（连尖括号一起换掉），例如：

```
mongodb+srv://vivian:Vivian2026@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
```

⚠️ 检查一下：替换后**不能**还剩 `<` 或 `>`。

---

## 第六步：填到 Render

1. 打开 <https://dashboard.render.com> → 进入 **vivian-workspace** 这个服务
2. 左侧 **Environment**（环境变量）
3. 点 **Add Environment Variable**：
   - Key：`MONGODB_URI`
   - Value：第五步那串连接串
4. 点 **Save Changes** → Render 会自动重新部署（等 1~2 分钟）

> 仓库里的 `render.yaml` 虽然写了 `MONGODB_URI`，但标了 `sync: false`（不自动填），
> 所以**必须**在控制台手动填一次。

---

## 第七步：确认成功

在 Render 服务页 → **Logs**（日志），看启动信息：

- ✅ 看到 `✅ 已连接 MongoDB` 和 `存储：MongoDB` → **成功**
- ❌ 还是 `ℹ️ 未设置 MONGODB_URI，使用本地文件存储` → 环境变量没生效，回到第六步检查 Key 拼对没、保存后是否重新部署了

---

## 出问题怎么办

| 现象 | 原因 & 解决 |
|---|---|
| `MongoServerSelectionError` / 连不上超时 | 第四步没放行 `0.0.0.0/0`，或刚建好集群还没就绪，等几分钟再试 |
| `Authentication failed` / `bad auth` | 用户名或密码填错；或密码里有特殊符号（改成纯字母数字） |
| 连接串里还有 `<` `>` | 没替换干净，回到第五步 |
| 连上了但数据是空的 | 正常——旧的临时数据已随部署清空。用第一步导出的 JSON 对照补回，或重新记录 |
| 日志显示 `存储：本地文件` | `MONGODB_URI` 没设上，重做第六步 |

---

## 配好之后

- 手机 / iPad Safari 打开 <https://vivian-workspace.onrender.com> → 分享 → 「添加到主屏幕」
- 电脑浏览器 → 地址栏「安装」
- **三端登录同一个工作台账号**，数据实时同步，重启、重新部署都不丢
