# 极简 Docker 镜像（零依赖 Node 后端 + 静态前端）
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
# MERGE: 补上原 Dockerfile 漏掉的 life.js / korean.js，并加入合并版新文件与数据
COPY index.html styles.css app.js life.js korean.js merge.js merge.css sw.js manifest.webmanifest icon.svg seed-vivian2.json ./
COPY data ./data
# 持久化数据卷：server-data 会在运行时写入用户数据
VOLUME ["/app/server-data"]
ENV PORT=8770
EXPOSE 8770
CMD ["node", "server.js"]
