# FinInsight 上线前代码审查与改进建议

本文基于当前前后端代码结构整理，目标是为购买域名和云服务器后的正式上线做准备。当前建议以“不改变现有后端数据结构与核心业务逻辑”为前提，优先指出上线风险、稳定性问题、性能瓶颈和后续增强方向。

## 当前项目概览

项目由两个主要部分组成：

- `FinInsight-Backend`：FastAPI + MongoDB/Beanie + OpenAI 兼容接口，负责新闻爬取、政策文章存储、AI 解析和当前文章问答。
- `FinInsight-Frontend`：Taro React H5 页面，负责首页仪表盘、政策列表、详情页、AI 解析展示和 AI 助手交互。

当前项目已经具备可演示的完整闭环：同步政策、展示新闻、查看详情、AI 解析、针对当前文章对话。但如果要公开上线，还需要重点补齐生产环境配置、安全边界、爬虫稳定性、部署结构和可观测性。

## 已完成的上线前准备

更新时间：2026-06-09

已购买域名：

- `52zzx.top`
- `www.52zzx.top`

本轮已完成以下上线准备：

- 后端 CORS 已改成环境变量配置，默认包含本地开发地址和 `https://52zzx.top`、`https://www.52zzx.top`。
- 后端新增生产环境变量示例：`FinInsight-Backend/.env.production.example`。
- 前端新增生产构建脚本：`npm run build:h5:prod`。默认使用同域 `/api`，部署到 `https://52zzx.top` 后由 Nginx 反向代理到后端；如未来使用独立 API 域名，可通过 `window.__FININSIGHT_API_BASE_URL__` 运行时变量覆盖。
- H5 HTML 生成脚本已去掉固定 `js/467.js` 的硬编码，改为自动读取 `dist/js` 目录里的 JS 文件。
- 新增部署说明：`deploy/README.md`。
- 新增 Nginx 模板：`deploy/nginx/52zzx.top.conf`。
- 新增 systemd 后端服务模板：`deploy/systemd/fininsight-backend.service`。
- 前端生产环境已改为同域 `/api`，生产 JS 与运行配置均不包含 localhost；本地开发地址只由 `dev:h5` 单独生成。
- 新增单篇文章接口和详情页按 ID 加载，详情页支持刷新、收藏和直接打开。
- 健康检查已增加 MongoDB 连通性检查，数据库不可用时返回 `503`。
- 后端已增加数据库连接关闭、请求 ID、请求耗时日志和基础安全响应头。
- 同步接口已增加进程内互斥锁，避免同一后端进程重复同步。
- Nginx 已增加普通 API、AI 接口和同步接口的单 IP 限流。
- Nginx 同步接口已增加 Basic Auth 管理员认证。
- AI 调用已增加输入长度限制、一次重试、结果范围校验和客户端连接关闭。
- 新闻日期识别不到时不再默认当作当天，避免旧新闻绕过两天限制。
- 列表接口不再向浏览器返回完整 `raw_content`。
- 新增后端 Dockerfile、生产 Docker Compose、MongoDB 私有网络和持久化 volume。
- 新增 MongoDB 手动备份、恢复和每日自动备份 timer 模板。
- 新增服务器准备与生产部署脚本。

因为还没有购买云服务器，以下事情暂时只能准备模板，不能真正执行：

- DNS A 记录指向服务器公网 IP。
- 服务器安装 Nginx、MongoDB、Python、Node.js。
- HTTPS 证书签发。
- systemd 服务启用。
- 真实 MongoDB 账号密码和 OpenAI API Key 写入服务器 `.env`。

## 2026-06-09 验证结果

本轮已经实际验证：

- 后端 Python 编译通过。
- 前端生产构建 `npm run build:h5:prod` 通过。
- 生产 `dist` 中不包含 `127.0.0.1:8000`、`localhost:8000` 或旧的 `TARO_APP_API_BASE_URL`。
- `dist/runtime-config.js` 默认 API 地址为空，线上使用 `52zzx.top` 同域 `/api`。
- Docker Compose 生产配置解析通过。
- 本地运行时健康检查返回 `{"status":"ok","database":"ok"}`。
- 健康检查响应包含请求 ID 和基础安全响应头。
- 文章列表接口不再返回 `raw_content`。
- 单篇详情接口按文章 ID 返回完整详情，详情页刷新链路可用。
- 前端生产静态页面可正常访问。
- 严格日期过滤后爬虫实测仍获得 28 条近期候选；已移除固定返回 404 的新浪证券 RSS 源。

购买云服务器后仍必须执行：

1. 选择云服务器地区和配置，拿到公网 IP。
2. 把 `52zzx.top` 与 `www.52zzx.top` 的 DNS A 记录指向公网 IP。
3. 如使用中国大陆服务器，先确认云服务商的域名备案和公网访问要求。
4. 上传项目到 `/opt/fininsight`。
5. 创建 `deploy/.env.production`，替换数据库密码与 OpenAI API Key。
6. 创建 `/etc/nginx/fininsight.htpasswd` 管理员账号。
7. 执行 `deploy/scripts/prepare-server.sh` 与 `deploy/scripts/deploy-production.sh`。
8. 使用 Certbot 签发 `52zzx.top` 和 `www.52zzx.top` HTTPS 证书。
9. 验证公网健康检查、同步认证、AI 限流和每日自动备份。

## 上线前必须处理

### 1. 生产域名与接口地址不能继续依赖 localhost

当前状态：已部分完成。

前端业务代码不再包含 localhost API fallback。本地开发地址由 `dev:h5` 生成到 `dist/runtime-config.js`，生产构建生成空运行配置并使用同域 `/api`。生产构建命令：

```bash
npm run build:h5:prod
```

该脚本默认采用同域接口：

```text
/api/...
```

相关文件：

- `FinInsight-Frontend/config/index.ts`
- `FinInsight-Frontend/src/api/index.ts`
- `FinInsight-Frontend/package.json`

当前推荐同域反向代理：

- 用户访问 `https://52zzx.top`
- 静态前端由 Nginx 提供
- `/api/` 反向代理到本机 FastAPI 服务

这样可以减少 CORS 问题，也方便统一 HTTPS、日志和缓存策略。

### 2. 后端 CORS 不能硬编码本地地址

当前状态：已完成生产配置准备。

后端 CORS 已从硬编码列表改成读取配置项：

- `FinInsight-Backend/app/core/config.py`
- `FinInsight-Backend/app/main.py`

生产环境建议使用：

```text
CORS_ORIGINS=https://52zzx.top,https://www.52zzx.top
```

不要在生产环境直接使用 `*`，因为后端包含 AI 问答、重新解析、同步爬取等高成本接口。

### 3. 同步、AI 解析、AI 对话接口需要权限保护

当前状态：已完成首版公网保护。

已实施：

- `/api/v1/sync` 由 Nginx Basic Auth 保护，仅管理员可触发。
- `/api/v1/sync` 增加低频限流和后端进程内互斥锁。
- AI 解析和 AI 对话接口增加单 IP 限流。

后续有正式用户体系时，可用登录权限替换 Basic Auth。

受保护的高成本接口：

- `POST /api/v1/sync`
- `POST /api/v1/articles/{id}/analyze`
- `POST /api/v1/articles/{id}/chat`

风险包括：

- 恶意频繁同步，导致服务器长时间爬取。
- 恶意调用 AI 接口，造成 API 费用上涨。
- 高频请求拖垮后端和数据库。

### 4. 同步接口不适合继续做成长阻塞请求

当前状态：已增加互斥锁、超时控制和 Nginx 长请求配置；后台任务化暂缓。

当前 `POST /sync` 会在一次 HTTP 请求里完成候选源抓取、正文提取、去重入库。这个流程在网络差、新闻源慢、源站拒绝访问时容易耗时很久。

生产环境建议改成任务模式：

- `POST /sync/jobs`：创建同步任务，立即返回任务 ID。
- `GET /sync/jobs/{id}`：查询任务进度、状态、新增条数、失败源。
- 后端后台 worker 执行真正爬取。
- 同一时间只允许一个同步任务运行，避免重复点击造成并发爬虫。

后台任务化会改变前后端同步接口交互方式，建议在首版上线运行数据稳定后实施。当前同步已具备互斥锁、单篇超时、源站 fallback 和 Nginx 180 秒超时配置。

### 5. 详情页需要支持直接打开和刷新

当前状态：已完成。

后端已新增 `GET /api/v1/articles/{id}`。详情页优先读取内存数据，没有数据时会根据 URL 中的 ID 请求后端。

### 6. MongoDB 生产环境需要持久化、备份和索引检查

当前状态：已完成配置与脚本准备，真实启动待服务器购买后执行。

已准备：

- `deploy/docker-compose.production.yml`
- MongoDB 私有 Docker 网络，不暴露端口
- MongoDB 持久化 volume
- 手动备份与恢复脚本
- 每日自动备份 systemd timer

如果使用 Docker 部署 MongoDB，需要确认：

- MongoDB 数据目录挂载到宿主机 volume。
- 设置数据库账号和密码。
- 不把 MongoDB 端口直接暴露到公网。
- 定期备份，例如每天导出一次。
- 保留 `url` 唯一索引，避免重复新闻。

当前模型中已有 `url` 唯一索引、`publish_date` 和 `session_id` 索引，这对现有列表与同步逻辑是有帮助的。上线前建议额外检查 MongoDB Compass 中索引是否真实创建成功。

## 高优先级稳定性提升

### 1. 爬虫需要源站质量统计

现在同步成功率容易受新闻源影响。建议为每个新闻源记录运行结果：

- 本次候选数量
- 正文抓取成功数量
- 被日期过滤数量
- 被关键词过滤数量
- 失败原因
- 平均响应耗时

这样后台或日志里可以直观看到哪个源最稳定，哪个源经常失败。后续可以自动降低低质量源权重。

### 2. 日期识别需要更严格

当前状态：已完成首版收紧。

项目目前已经限制最多抓取当前日期前 2 天内的新闻，但不同网站日期格式不统一，HTML 中也可能没有明确日期。上线前建议加强：

- 优先使用 RSS 或网页 meta 中的发布时间。
- 其次解析正文附近日期。
- 最后才从 URL 或标题推断日期。
- 无法确认日期的文章现在会直接跳过，不再默认当作今天。

否则容易再次出现抓到很早新闻的问题。

### 3. 正文编码与乱码问题需要统一处理

当前状态：已完成首版处理。

部分中文财经网站可能返回 GBK、GB2312 或错误 charset。建议在爬虫正文提取时做统一编码处理：

- 优先读取 HTTP header charset。
- 使用 `charset-normalizer` 或类似工具识别编码。
- 入库前统一转成 UTF-8。
- 对标题、摘要、正文做不可见字符清洗。

这能减少中文乱码、标题异常、AI 解析输入质量不稳定的问题。

### 4. AI 解析需要超时、重试和错误分类

当前状态：已完成输入长度控制、一次重试、连接关闭和结果范围校验；更细错误分类仍可继续增强。

`FinInsight-Backend/app/services/llm_parser.py` 当前在失败时会返回“解析失败”类占位内容。上线后建议把失败分成更明确的类型：

- API key 错误
- 余额或额度不足
- 网络超时
- 模型响应不是 JSON
- 输入文本过长
- 上游限流

同时建议增加：

- 最多 1-2 次重试。
- 输入文本长度截断或分块摘要。
- 结构化日志记录请求耗时与失败原因。
- 后台保存最近一次解析错误，方便排查。

### 5. 列表接口不要返回完整 raw_content

当前状态：已完成。

当前文章列表响应里包含 `raw_content`，这会让首页加载很多不必要文本。正式上线建议拆分接口：

- 列表接口只返回卡片需要的数据。
- 详情接口再返回正文或详情字段。

这样可以降低首屏网络体积，也减少原始政策文本在前端暴露的范围。用户之前已经要求详情页不展示原始政策文本，接口层后续也可以同步收敛。

### 6. 文章列表存在 N+1 查询风险

当前列表序列化时，每篇文章都会再查一次 AIInterpretation。文章数量增加后，列表请求会变慢。

建议后续优化为：

- 批量查询当前页所有文章 ID 对应的 AIInterpretation。
- 在内存中按 article_id 组装。
- 或者把列表卡片需要的少量解析字段冗余到文章集合中。

在新闻量从几十条增长到几千条后，这个优化会明显影响首页速度。

## 前端体验与信息密度建议

### 1. 首页仪表盘已经适合继续增强

当前首页已经向 Bloomberg/Vercel 仪表盘风格靠近，可以继续加强：

- 增加“本次同步新增 / 总库文章 / 今日新增 / 解析成功率”四个核心指标。
- 来源权重展示真实同步成功率，而不是纯视觉展示。
- 风险分层展示每层文章数量、占比和趋势。
- 关键词热区支持点击筛选。
- 数据质量卡片展示“正文完整率、日期可信度、AI 解析成功率”。

这些增强主要是前端组合已有数据，短期不需要大改业务逻辑。

### 2. 同步结果应该清晰区分“新抓取”和“数据库已有”

用户期望点击同步后页面只展示新抓取文章。当前逻辑已经朝这个方向调整，但正式产品里建议页面明确显示：

- 本次新增多少条。
- 跳过重复多少条。
- 日期过旧跳过多少条。
- 正文抓取失败多少条。
- 每个来源贡献多少条。

这样能直接解释“为什么这次只有 8 条”或“为什么某个源没有新闻”。

### 3. 详情页 AI 助手建议加入上下文提示

当前 AI 助手已经能围绕当前文章回答问题。后续可以增强：

- 提供 3-5 个快捷问题，例如“对银行有什么影响”“有哪些风险点”“普通投资者该怎么理解”。
- 显示回答依据来自当前文章和 AI 解读。
- 对回答失败展示更具体错误，而不是泛化成网络或 API 问题。
- 对发送按钮、输入框、滚动条继续保持暗色主题一致性。

### 4. 页面动画需要控制性能预算

详情页和首页目前有较多 blur、shadow、transition、fixed 背景和卡片动效。视觉上更精致，但上线后建议用 Lighthouse 检查：

- 首屏加载时间
- JS 体积
- CSS 体积
- 动画是否造成卡顿
- 移动端滚动性能

金融仪表盘应该优先保证稳定、清晰、快速，动画作为增强即可。

### 5. 详情页返回按钮固定方案仍可做

`prompt.md` 里已经记录了“详情页返回按钮固定左上角并保持动画”的待办。技术上可以做到，关键是把固定按钮移出带 `transform` 动画的容器，因为 CSS 中 transformed ancestor 会影响 fixed 定位。

建议后续做法：

- 外层页面保留固定返回按钮。
- 内层内容容器负责入场动画。
- 不让 `position: fixed` 元素处在带 transform 的祖先内部。

## 部署结构建议

### 推荐最小生产架构

一台云服务器即可承载当前版本：

- Nginx：HTTPS、静态前端、反向代理 `/api`。
- FastAPI：运行在 `127.0.0.1:8000`，不直接暴露公网。
- MongoDB：本机 Docker 容器或云数据库。
- 后台任务：后续可用 FastAPI BackgroundTasks、APScheduler、Celery/RQ 逐步升级。

建议目录结构：

- `/opt/fininsight/frontend/dist`
- `/opt/fininsight/backend`
- `/opt/fininsight/logs`
- `/opt/fininsight/mongodb-data`
- `/opt/fininsight/backups`

### Nginx 需要负责的事情

- 强制 HTTPS。
- 开启 gzip 或 brotli。
- 当前构建产物文件名未带内容 hash，因此 Nginx 模板先对前端资源使用 `no-cache`，避免发布后用户加载旧 JS/CSS。
- `index.html` 不长缓存，避免前端版本更新后用户一直加载旧入口。
- `/api/` 反向代理到 FastAPI。
- 限制单 IP 请求频率，尤其是同步和 AI 接口。

当前已准备模板：

- `deploy/nginx/52zzx.top.conf`

### 后端进程管理

开发环境使用 `uvicorn --reload`，生产环境不要使用 reload。建议：

- Linux systemd 管理 FastAPI 进程。
- 或 Docker Compose 管理 backend、mongodb、nginx。
- 日志输出到文件或 journald。
- 进程异常自动重启。

生产启动示例方向：

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

如果后续并发增加，可以再评估 Gunicorn + UvicornWorker 或容器横向扩展。

当前已准备模板：

- `deploy/systemd/fininsight-backend.service`

## 安全建议

### 1. 密钥不能进入 Git

需要确认以下内容只存在服务器环境变量或 `.env`，不要提交：

- MongoDB 用户名和密码
- OpenAI API Key
- 管理接口 token
- 云服务访问密钥

当前 `.env.example` 可以保留，但真实 `.env` 必须加入 `.gitignore`。

### 2. AI 成本需要设置上限

建议增加：

- 每日 AI 请求次数限制。
- 单篇文章重复解析冷却时间。
- 单 IP 对话频率限制。
- 输入长度限制。
- 模型调用失败后的短时间熔断。

否则公网用户或爬虫可能造成不可控费用。

### 3. 管理功能和公开浏览功能要分开

正式网站可以允许所有人看新闻和 AI 解析，但不应允许所有人触发：

- 同步最新政策
- 重新解析
- 批量 AI 处理

这些应属于管理功能。

## 监控与日志建议

上线后至少需要记录：

- 每次同步开始和结束时间
- 每个新闻源成功/失败数量
- 每篇文章正文抓取失败原因
- AI 解析耗时和失败原因
- API 请求状态码和耗时
- MongoDB 连接错误
- 前端关键接口失败率

可以先用普通日志文件，后续再接入：

- Sentry：前后端异常监控
- Grafana/Prometheus：服务指标
- 云服务器自带监控：CPU、内存、磁盘、带宽

## 测试与质量建议

当前项目缺少自动化测试。上线前建议至少补充几类低成本测试：

- 爬虫日期过滤测试：确保不会抓取超过当前日期前 2 天的新闻。
- URL 去重测试：确保重复新闻不会再次入库。
- AI 解析失败测试：确保失败状态能正确回写。
- 文章详情接口测试：确保刷新详情页能加载文章。
- 前端构建测试：确保生产环境 API 地址被正确注入。

不一定要一次性做完整测试体系，但这些测试能覆盖当前最容易反复出问题的地方。

## 分阶段落地路线

### 第一阶段：能安全上线

- 配置生产 API 地址和 CORS。已完成基础准备。
- 增加同步、解析、对话接口的基础鉴权。同步已启用 Basic Auth，AI 接口已限流。
- Nginx HTTPS + 反向代理。已准备 Nginx 模板，待服务器执行。
- MongoDB 持久化和备份。已准备 Compose、备份和自动 timer，待服务器执行。
- 详情页支持直接通过文章 ID 加载。已完成。
- 生产环境不使用 `--reload`。已准备 systemd 模板。

### 第二阶段：提升稳定性

- 同步改成后台任务。
- 加同步任务状态接口。
- 增加新闻源成功率统计。
- 强化日期识别和编码处理。
- AI 解析增加错误分类、重试、长度控制。
- 列表接口减少 raw_content 返回。

### 第三阶段：产品化增强

- 管理后台或管理模式。
- 关键词筛选、来源筛选、风险筛选。
- AI 助手快捷问题。
- 数据质量看板。
- 访问统计和异常监控。
- SEO 或服务端渲染方案评估。

## 代码热点清单

后续优先关注这些文件：

- `FinInsight-Backend/app/main.py`：CORS、生命周期、全局中间件、错误处理。
- `FinInsight-Backend/app/core/config.py`：生产环境配置项。
- `FinInsight-Backend/app/core/database.py`：MongoDB 连接、关闭、健康检查。
- `FinInsight-Backend/app/api/v1/sync.py`：同步任务、去重、并发控制、状态返回。
- `FinInsight-Backend/app/api/v1/articles.py`：详情接口、列表性能、AI 接口保护。
- `FinInsight-Backend/app/services/crawler.py`：新闻源质量、日期识别、编码处理、正文抓取。
- `FinInsight-Backend/app/services/llm_parser.py`：AI 超时、重试、错误分类、成本控制。
- `FinInsight-Frontend/config/index.ts`：生产 API 地址注入。
- `FinInsight-Frontend/src/api/index.ts`：错误处理、超时、鉴权 header。
- `FinInsight-Frontend/src/store/article.ts`：详情页刷新问题。
- `FinInsight-Frontend/src/pages/index/index.tsx`：同步状态、数据看板、筛选交互。
- `FinInsight-Frontend/src/pages/detail/index.tsx`：详情兜底加载、AI 助手、返回按钮结构。
- `FinInsight-Frontend/generate-h5-html.mjs`：生产 HTML 生成方式和静态资源引用稳定性。

## 总结

当前项目已完成购买云服务器前能够落地的主要生产准备：域名同源 API、生产 CORS、详情页直达、公网接口限流、同步管理员认证、健康检查、请求日志、安全响应头、Docker Compose、MongoDB 私有网络与备份、Nginx 和自动部署脚本。

当前剩余事项主要依赖真实服务器和公网 IP：DNS 解析、服务器安装、生成生产密码、启动容器、创建 Nginx 管理密码、签发 HTTPS 证书、验证自动备份和实际公网压力。同步后台任务化、完整用户系统、监控平台和自动化测试可作为上线后的第二阶段增强。
