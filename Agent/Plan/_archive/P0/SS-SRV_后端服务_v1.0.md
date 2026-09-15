# 阿罗德斯 · 子系统文档 SS-SRV
# 后端服务（Backend Service）

> 版本：v1.0  
> 代号：SRV  
> 优先级：P0  
> 负责人：Crow5（全栈/后端方向）

---

## 一、模块定位

后端服务是阿罗德斯的**大脑与神经系统**。它不直接面对用户，但所有数据流都经过这里：接收前端消息、调用 LLM 生成回复、与 Hermes 交互存取记忆、管理会话生命周期。

**不负责**：3D 渲染、语音采集、界面交互  
**负责**：API 网关、会话管理、LLM 代理、Hermes 客户端、WebSocket 服务

---

## 二、核心概念

### 2.1 数据流

```
前端语音系统 ──► 后端 API ──► LLM API
                      │
                      ▼
                   Hermes API
                      │
                      ▼
                   数据库
```

### 2.2 会话生命周期

```
创建：前端请求 → 后端生成 ID → 存入 DB → 调 Hermes 创建记忆空间 → 返回前端
对话：前端发送消息 → 后端调 Hermes 检索相关记忆 → 拼接上下文 → 调 LLM → 流式返回
记忆：LLM 回复 → 后端解析记忆节点 → 调 Hermes 存储 → 实时推送给前端
删除：前端请求 → 后端删除 DB → 调 Hermes 清理 → 返回成功
```

---

## 三、功能需求

### 3.1 API 网关

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| SRV-001 | REST API，JSON 格式 | 所有接口统一格式 |
| SRV-002 | WebSocket 服务，支持流式回复 | 长连接，心跳检测 |
| SRV-003 | CORS 配置，允许前端域名 | 跨域正常 |
| SRV-004 | 请求日志记录 | 可追踪 |
| SRV-005 | 统一错误格式 | { error: string, code: string } |
| SRV-006 | 速率限制（100 请求/分钟/IP） | 防滥用 |

### 3.2 会话管理

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| SRV-101 | 创建会话：POST /api/v1/sessions | 返回完整会话对象 |
| SRV-102 | 获取会话树：GET /api/v1/sessions/tree | 返回树形结构 |
| SRV-103 | 获取单个会话：GET /api/v1/sessions/:id | 含消息和记忆 |
| SRV-104 | 更新会话：PATCH /api/v1/sessions/:id | 可改标题/主题 |
| SRV-105 | 删除会话：DELETE /api/v1/sessions/:id | 级联删除消息 |
| SRV-106 | 会话 embedding 生成 | 创建时调用 embedding API |
| SRV-107 | 会话语义搜索 | 支持向量相似度查询 |

### 3.3 消息管理

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| SRV-201 | 发送消息：WS 或 POST | 支持流式和非流式 |
| SRV-202 | 消息持久化 | 存入数据库 |
| SRV-203 | 消息历史查询 | 分页，默认 20 条 |
| SRV-204 | 消息搜索 | 关键词匹配 |

### 3.4 LLM 代理

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| SRV-301 | 支持 OpenAI API | GPT-4o / GPT-4o-mini |
| SRV-302 | 支持 Claude API | Claude 3.5 Sonnet |
| SRV-303 | 可切换模型（配置化） | 改配置即可切换 |
| SRV-304 | 流式回复（SSE / WS） | 首字延迟 < 2s |
| SRV-305 | 系统提示词（System Prompt） | 包含阿罗德斯角色设定 |
| SRV-306 | 上下文管理（最近 10 轮） | 自动携带历史 |
| SRV-307 | 超时处理（30s） | 超时报错 |

**系统提示词模板**：
```
你是阿罗德斯（Arodes），愚者的忠实仆人。

性格：忠诚、谦逊、略带神秘、知识渊博。
语气：正式但温和，偶尔引用古典文学。
自称："您的仆人""在下"
对用户的称呼："愚者大人""主人"
边界：绝不僭越，绝不欺骗，绝对忠诚。

当前时间：{current_time}
当前会话：{session_title}
相关记忆：
{retrieved_memories}

请根据以上记忆，以阿罗德斯的身份回复主人。
如果用户要求"新建会话"，请回复确认，但不要真的创建（前端会处理）。
```

### 3.5 Hermes 客户端

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| SRV-401 | 封装 Hermes API 调用 | 统一接口 |
| SRV-402 | 对话前检索相关记忆 | 发送 embedding 查询 |
| SRV-403 | 对话后提取记忆节点 | 解析 LLM 回复中的事实 |
| SRV-404 | 记忆节点存储 | 调 Hermes retain API |
| SRV-405 | 记忆实时推送 | 通过 WS 推给前端 |
| SRV-406 | 记忆冲突检测 | 新记忆与旧记忆矛盾时标记 |

### 3.6 意图识别（后端辅助）

| 编号 | 需求 | 验收标准 |
|------|------|---------|
| SRV-501 | 本地规则引擎（关键词+正则） | 零延迟 |
| SRV-502 | LLM 意图识别（复杂场景） | 置信度评分 |
| SRV-503 | 意图类型：new_session / switch_session / delete_session / rename_session / search_memory / summarize / clear_context / mute / help | 全覆盖 |
| SRV-504 | 参数提取 | 主题、会话名等 |
| SRV-505 | 意图结果随回复一起返回 | 前端可执行动作 |

---

## 四、数据库设计

### 4.1 表结构

```sql
-- 会话表
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  topic VARCHAR(50) NOT NULL CHECK (topic IN ('work', 'life', 'creative', 'emotion', 'study', 'other')),
  parent_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  embedding VECTOR(1536),  -- pgvector
  summary TEXT,
  message_count INTEGER DEFAULT 0,
  last_active_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 消息表
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  is_voice BOOLEAN DEFAULT FALSE,
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 记忆节点表（本地缓存，Hermes 为主存储）
CREATE TABLE memory_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  hermes_id VARCHAR(255),  -- Hermes 中的记忆 ID
  content TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('fact', 'preference', 'event', 'task')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户设置表
CREATE TABLE user_settings (
  user_id VARCHAR(255) PRIMARY KEY,
  voice_type VARCHAR(50) DEFAULT 'female',
  speech_rate FLOAT DEFAULT 1.0,
  auto_play_tts BOOLEAN DEFAULT TRUE,
  theme VARCHAR(50) DEFAULT 'default',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 五、接口详细定义

### 5.1 REST API

```typescript
// 健康检查
GET /api/v1/health
→ { status: "ok", version: "1.0.0" }

// 创建会话
POST /api/v1/sessions
Body: {
  title: string;
  topic: "work" | "life" | "creative" | "emotion" | "study" | "other";
  parentId?: string;
}
→ {
  id: string;
  title: string;
  topic: string;
  parentId: string | null;
  embedding: number[];
  createdAt: string;
}

// 获取会话树
GET /api/v1/sessions/tree
→ {
  sessions: [{
    id: string;
    title: string;
    topic: string;
    parentId: string | null;
    messageCount: number;
    lastActiveAt: string;
    createdAt: string;
    children?: SessionNode[];
  }]
}

// 获取单个会话
GET /api/v1/sessions/:id
→ {
  id: string;
  title: string;
  topic: string;
  parentId: string | null;
  summary: string;
  messageCount: number;
  lastActiveAt: string;
  createdAt: string;
  keyMemories: MemoryNode[];
  messages: Message[];
}

// 更新会话
PATCH /api/v1/sessions/:id
Body: { title?: string; topic?: string; }
→ { ...updatedSession }

// 删除会话
DELETE /api/v1/sessions/:id
→ { success: true }

// 获取消息历史
GET /api/v1/sessions/:id/messages?limit=20&offset=0
→ {
  messages: Message[];
  total: number;
}

// 语音转文字（云端 fallback）
POST /api/v1/voice/transcribe
Content-Type: multipart/form-data
Body: { audio: File }
→ { text: string; confidence: number; language: string }

// TTS
POST /api/v1/voice/synthesize
Body: { text: string; voice?: string; speed?: number }
→ { audioUrl: string; duration: number }
```

### 5.2 WebSocket 协议

```typescript
// 连接
WS /v1/chat?sessionId=xxx

// 客户端发送
{
  type: "message";
  content: string;
  isVoice: boolean;
}

// 服务端推送 - 流式片段
{
  type: "chunk";
  data: { content: string };  // 一个字或一个词
}

// 服务端推送 - 完成
{
  type: "complete";
  data: {
    content: string;           // 完整回复
    memories: MemoryNode[];    // 提取的记忆节点
    intent?: {
      type: string;
      params: object;
      confidence: number;
    }
  }
}

// 服务端推送 - 记忆反馈（实时）
{
  type: "memory";
  data: {
    memories: [{
      id: string;
      content: string;
      type: "fact" | "preference" | "event" | "task";
    }]
  }
}

// 服务端推送 - 错误
{
  type: "error";
  data: { message: string; code: string }
}
```

---

## 六、与 Hermes 的集成

### 6.1 Hermes API 封装

```typescript
class HermesClient {
  // 创建记忆空间（对应新会话）
  async createMemorySpace(sessionId: string): Promise<void>;

  // 检索相关记忆（对话前调用）
  async retrieveMemories(
    query: string, 
    embedding: number[], 
    limit: number = 5
  ): Promise<MemoryNode[]>;

  // 存储记忆节点（对话后调用）
  async retainMemory(
    sessionId: string,
    content: string,
    type: MemoryType
  ): Promise<MemoryNode>;

  // 删除记忆空间（会话删除时）
  async deleteMemorySpace(sessionId: string): Promise<void>;
}
```

### 6.2 记忆提取策略

```
LLM 回复完成后，后端解析回复内容：

1. 让 LLM 在回复末尾输出 JSON（隐藏给用户）：
   <memories>
   [
     { "content": "用户明天下午3点开会", "type": "event" },
     { "content": "用户喜欢简短回答", "type": "preference" }
   ]
   </memories>

2. 后端提取 JSON，调 Hermes retain API 存储

3. 同时通过 WS 推送给前端显示 "💾 已记住"
```

---

## 七、技术实现

### 7.1 项目结构

```
arodes-server/
├── src/
│   ├── index.ts              # 入口
│   ├── app.ts                # Express 应用
│   ├── config/
│   │   ├── database.ts       # 数据库连接
│   │   ├── redis.ts          # Redis 连接
│   │   └── llm.ts            # LLM 配置
│   ├── routes/
│   │   ├── sessions.ts       # 会话路由
│   │   ├── messages.ts       # 消息路由
│   │   └── voice.ts          # 语音路由
│   ├── services/
│   │   ├── sessionService.ts # 会话业务逻辑
│   │   ├── messageService.ts # 消息业务逻辑
│   │   ├── llmService.ts     # LLM 代理
│   │   ├── hermesService.ts  # Hermes 客户端
│   │   └── intentService.ts  # 意图识别
│   ├── websocket/
│   │   └── chatHandler.ts    # WebSocket 处理
│   ├── models/
│   │   ├── Session.ts        # 会话模型
│   │   ├── Message.ts        # 消息模型
│   │   └── MemoryNode.ts     # 记忆模型
│   ├── middleware/
│   │   ├── errorHandler.ts   # 错误处理
│   │   ├── rateLimiter.ts    # 速率限制
│   │   └── logger.ts         # 日志
│   └── utils/
│       ├── embedding.ts      # 向量生成
│       └── validators.ts     # 参数校验
├── docker-compose.yml
├── Dockerfile
└── package.json
```

### 7.2 依赖

```json
{
  "express": "^4.18.0",
  "ws": "^8.0.0",
  "pg": "^8.0.0",
  "pgvector": "^0.1.0",
  "redis": "^4.0.0",
  "openai": "^4.0.0",
  "cors": "^2.8.0",
  "helmet": "^7.0.0",
  "express-rate-limit": "^7.0.0",
  "winston": "^3.0.0",
  "zod": "^3.0.0",
  "dotenv": "^16.0.0"
}
```

---

## 八、验收清单

- [ ] API 文档可用（Swagger / Postman）
- [ ] 创建会话 → 存入 DB → 返回完整数据
- [ ] 发送消息 → 检索记忆 → 调 LLM → 流式返回
- [ ] LLM 回复中提取记忆 → 调 Hermes 存储 → WS 推送
- [ ] 获取会话树 → 返回正确树形结构
- [ ] 删除会话 → 级联删除消息 → 调 Hermes 清理
- [ ] WebSocket 连接稳定，支持 100 并发
- [ ] 错误处理完善，所有异常有友好返回

---

## 九、给 Crow5 的开发顺序

1. **Day 1-2**：项目脚手架（Express + TypeScript + Docker）
2. **Day 3-4**：数据库设计 + 连接 + 迁移
3. **Day 5-6**：会话 CRUD API
4. **Day 7-8**：LLM 代理（OpenAI 流式回复）
5. **Day 9-10**：WebSocket 服务（聊天）
6. **Day 11-12**：Hermes 客户端集成
7. **Day 13-14**：意图识别 + 记忆提取 + 联调
