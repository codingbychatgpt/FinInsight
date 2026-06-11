# FinInsight 部署准备说明

当前域名：`52zzx.top`

本文档用于购买云服务器后快速部署。当前准备采用单机部署：

- Nginx 托管前端静态文件并反向代理 `/api/`
- FastAPI 与 MongoDB 通过 Docker Compose 运行
- FastAPI 只映射到服务器本机 `127.0.0.1:8000`
- MongoDB 不映射任何公网或宿主机端口
- HTTPS 证书建议使用 Certbot 签发

## 服务器建议

最低建议：

- 2 核 CPU
- 4 GB 内存
- 40 GB SSD
- Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS

如果 MongoDB、后端、Nginx 都放一台机器，内存不建议低于 4 GB。

## DNS 准备

购买服务器并拿到公网 IP 后，在域名服务商处添加：

- `A` 记录：`52zzx.top` 指向服务器公网 IP
- `A` 记录：`www.52zzx.top` 指向服务器公网 IP

DNS 生效后再申请 HTTPS 证书。

如果购买中国大陆云服务器，请先向云服务商确认域名备案和公网访问要求；未完成服务商要求前，域名可能无法正常对外提供网站。

## 一次性服务器准备

把仓库上传到 `/opt/fininsight` 后执行：

```bash
cd /opt/fininsight
sudo bash deploy/scripts/prepare-server.sh
```

创建生产环境配置：

```bash
cd /opt/fininsight/deploy
cp .env.production.example .env.production
nano .env.production
```

所有 `replace_with...` 占位内容必须替换为真实随机密码或密钥。

MongoDB 密码会用于连接 URI，建议使用 URL 安全字符：英文字母、数字、下划线和连字符。

## 前端构建

生产构建默认使用同域 API。部署到 `https://52zzx.top` 后，前端会直接请求 `/api/...`，由 Nginx 反向代理到 FastAPI：

```bash
cd FinInsight-Frontend
npm run build:h5:prod
```

如果未来后端使用独立 API 域名，可以修改部署后的 `runtime-config.js`：

```javascript
window.__FININSIGHT_API_BASE_URL__ = 'https://api.52zzx.top';
```

构建产物在：

```text
FinInsight-Frontend/dist
```

建议部署到服务器：

```text
/opt/fininsight/frontend/dist
```

## 生产部署

首次部署前创建同步接口的管理员账号密码：

```bash
sudo htpasswd -c /etc/nginx/fininsight.htpasswd fininsight-admin
```

之后执行：

```bash
cd /opt/fininsight
sudo bash deploy/scripts/deploy-production.sh
```

同步接口 `/api/v1/sync` 已通过 Nginx Basic Auth 保护。浏览器首次触发同步时需要输入上述管理员账号密码。

## Docker Compose

生产 Compose 文件：

```text
deploy/docker-compose.production.yml
```

它会：

- 创建 MongoDB 持久化 volume。
- 不暴露 MongoDB 端口。
- 把后端限制映射到 `127.0.0.1:8000`。
- 为 MongoDB 和后端配置健康检查。
- 后端生产模式关闭 `/docs` 和 `/redoc`。

查看状态：

```bash
cd /opt/fininsight/deploy
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

## MongoDB 备份

手动备份：

```bash
cd /opt/fininsight/deploy
sudo bash scripts/backup-mongodb.sh
```

启用每天 03:30 自动备份：

```bash
sudo cp systemd/fininsight-backup.service /etc/systemd/system/
sudo cp systemd/fininsight-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fininsight-backup.timer
```

备份默认保存在 `/opt/fininsight/backups`，保留 14 天。

## HTTPS

建议使用 Certbot：

```bash
sudo certbot --nginx -d 52zzx.top -d www.52zzx.top
```

证书签发成功后，确认自动续期：

```bash
sudo certbot renew --dry-run
```

## 上线前检查

- `https://52zzx.top` 能打开前端。
- `https://52zzx.top/api/v1/health` 返回 `{"status":"ok"}`。
- MongoDB 端口没有暴露公网。
- `deploy/.env.production` 中不存在任何占位密码。
- `OPENAI_API_KEY` 是真实可用值。
- Nginx 已开启 gzip。
- Docker Compose 中 backend 与 mongo 均为 healthy。
- `/api/v1/sync` 会要求管理员账号密码。
- AI 解析与对话接口已启用 Nginx 单 IP 限流。
- 自动备份 timer 已启用并手动测试成功。
