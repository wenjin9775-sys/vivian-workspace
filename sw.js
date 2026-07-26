/* Vivian 工作台 Service Worker —— 联网优先，保证每次部署都拉最新文件（离线时回退缓存） */
const CACHE = "vivian-v5";
const CORE = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // 登录/同步等写操作走网络
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return; // 接口不缓存，保证数据实时
  // 联网优先：先请求网络，成功后写入缓存；网络失败（离线）再回退缓存
  e.respondWith(
    fetch(req).then((r) => {
      if (r && r.ok && url.origin === location.origin) {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(req))
  );
});
