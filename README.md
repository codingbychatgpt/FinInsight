# FinInsight 金融政策洞察平台

FinInsight 是一个前后端分离的金融政策资讯与 AI 解读项目。后端使用 FastAPI + MongoDB，前端使用 Taro + React 构建 H5 页面。

## 项目结构

```text
Finance_platform/
├── FinInsight-Backend/      # FastAPI 后端服务
│   ├── app/
│   │   ├── api/v1/          # API 路由
│   │   ├── core/            # 配置和数据库初始化
│   │   ├── models/          # MongoDB 文档模型
│   │   └── services/        # 爬虫和 AI 解析服务
│   ├── .env.example         # 后端环境变量示例
│   └── requirements.txt     # Python 依赖
├── FinInsight-Frontend/     # Taro React 前端
│   ├── src/
│   ├── config/
│   └── package.json
└── README.md
```

## 环境要求

- Python 3.10+
- Node.js 18+ 和 npm
- MongoDB 6.0+，本地或远程实例均可
- 可选：OpenAI 兼容接口 Key，用于文章 AI 解析

## 数据库启动

后端依赖 MongoDB。默认连接地址是：

```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=fininsight
```

### 方式一：本地 MongoDB

安装 MongoDB 后启动服务。Windows 常见方式：

```powershell
mongod --dbpath C:\data\db
```

如果 MongoDB 已安装为系统服务，也可以在服务管理器中启动，或使用：

```powershell
net start MongoDB
```

### 方式二：Docker 启动 MongoDB

```powershell
docker run --name fininsight-mongo -p 27017:27017 -d mongo:6
```

数据库集合和索引会在后端启动时由 Beanie 自动初始化。当前主要集合包括：

- `policy_articles`
- `ai_interpretations`

## 后端启动

进入后端目录：

```powershell
cd FinInsight-Backend
```

创建并激活虚拟环境：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

安装依赖：

```powershell
pip install -r requirements.txt
```

创建环境变量文件：

```powershell
Copy-Item .env.example .env
```

编辑 `FinInsight-Backend/.env`：

```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=fininsight
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

说明：

- `MONGO_URI` 是 MongoDB 连接地址。
- `MONGO_DB_NAME` 是数据库名称，默认 `fininsight`。
- `OPENAI_API_KEY` 仅在调用 AI 解析接口时必需。
- `OPENAI_BASE_URL` 可配置为 OpenAI 兼容服务地址。
- `OPENAI_MODEL` 是 AI 解析使用的模型名称。

启动后端服务：

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

启动成功后访问：

- 健康检查：http://127.0.0.1:8000/api/v1/health
- API 文档：http://127.0.0.1:8000/docs

## 前端启动

进入前端目录：

```powershell
cd FinInsight-Frontend
```

安装依赖：

```powershell
npm install
```

启动 H5 页面：

```powershell
npm run dev:h5
```

默认访问地址：

```text
http://127.0.0.1:10086
```

前端默认请求后端地址为 `http://127.0.0.1:8000`。如果后端地址不同，可以在启动前设置：

```powershell
$env:TARO_APP_API_BASE_URL="http://127.0.0.1:8000"
npm run dev:h5
```

## 推荐启动顺序

1. 启动 MongoDB。
2. 启动后端 FastAPI 服务。
3. 启动前端 H5 服务。
4. 打开 `http://127.0.0.1:10086` 使用页面。

## 常用接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/articles` | 获取文章列表 |
| POST | `/api/v1/sync` | 同步最新资讯 |
| POST | `/api/v1/articles/{article_id}/analyze` | 对指定文章执行 AI 解析 |

## 构建与检查

前端类型检查：

```powershell
cd FinInsight-Frontend
npm run typecheck
```

前端 H5 构建：

```powershell
cd FinInsight-Frontend
npm run build:h5
```

后端当前没有单独的测试脚本。可以通过健康检查和 API 文档确认服务状态。

## 常见问题

### 后端启动时报 `mongo_uri` 缺失

确认 `FinInsight-Backend/.env` 存在，并且包含：

```env
MONGO_URI=mongodb://localhost:27017
```

### 前端页面请求失败

确认后端已启动在 `http://127.0.0.1:8000`，并检查前端启动时的 `TARO_APP_API_BASE_URL` 是否正确。

### AI 解析失败

确认 `.env` 中的 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL` 可用。同步资讯接口可以先不依赖 AI Key，进入详情页执行 AI 解析时才会调用模型服务。

### 端口被占用

后端默认使用 `8000`，前端默认使用 `10086`。如果端口被占用，可以修改启动命令中的端口，同时保持前端 API 地址和后端 CORS 配置一致。
