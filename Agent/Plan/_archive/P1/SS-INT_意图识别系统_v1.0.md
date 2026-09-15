# 阿罗德斯 · 子系统文档 SS-INT
# 意图识别系统（Intent Recognition System）

> 版本：v1.0  
> 代号：INT  
> 优先级：P1  
> 负责人：Crow5（后端/全栈方向）
> 依赖：SS-SRV（后端服务）

---

## 一、模块定位

意图识别系统让阿罗德斯**听懂命令**。当用户说"新建一个工作会话"时，系统不是把这句话当作普通聊天发给 LLM，而是识别出"新建会话"的意图，提取"工作"这个主题参数，然后执行相应动作。

**不负责**：LLM 对话生成、语音转文字  
**负责**：解析用户输入、识别系统指令、提取参数、触发动作

---

## 二、核心概念

```
用户输入："帮我新建一个关于项目A的工作会话"

意图识别：
├─ 意图类型：new_session（新建会话）
├─ 置信度：0.95
├─ 参数：
│   ├─ topic: "work"（工作）
│   └─ title: "项目A"
└─ 动作：
    1. 调用 API 创建会话
    2. 通知宇宙系统生长新星球
    3. AI 回复确认
```

---

## 三、功能需求

### 3.1 意图类型

| 意图 | 触发关键词示例 | 参数 | 动作 |
|------|--------------|------|------|
| **new_session** | "新建""创建一个""开一个新" | topic, title, parentId | 创建会话+生长星球 |
| **switch_session** | "切换到""打开""去" | sessionId / title | 切换会话 |
| **delete_session** | "删除""删掉""移除" | sessionId / title | 删除会话（需确认）|
| **rename_session** | "重命名""改名""叫" | sessionId, newTitle | 修改标题 |
| **search_memory** | "搜索""找一下""我记得" | query | 打开搜索 |
| **summarize** | "总结一下""概括" | sessionId? | 生成摘要 |
| **clear_context** | "清除上下文""忘掉""重新开始" | — | 清空当前会话历史 |
| **mute** | "静音""关闭语音""不要说话" | — | 关闭 TTS |
| **unmute** | "打开语音""说话" | — | 开启 TTS |
| **help** | "帮助""怎么用""你能做什么" | — | 显示帮助 |
| **none** | （未命中任何意图）| — | 作为普通对话 |

### 3.2 识别引擎

| 编号 | 需求 | 方案 | 优先级 |
|------|------|------|--------|
| INT-001 | 关键词匹配（最快） | 本地规则 | P0 |
| INT-002 | 正则表达式匹配 | 本地规则 | P0 |
| INT-003 | 同义词扩展 | 词库 | P0 |
| INT-004 | 上下文意图（省略主语） | 当前会话上下文 | P1 |
| INT-005 | LLM 辅助识别（复杂场景） | 后端调用 | P1 |
| INT-006 | 置信度评分 | 0~1 | P0 |

### 3.3 关键词规则库

```typescript
const intentPatterns = {
  new_session: {
    keywords: ['新建', '创建', '开一个', '新', '会话', '话题', '讨论'],
    regexes: [
      /新建(一个)?(.+?)(会话|话题|讨论)/,
      /创建(一个)?(.+?)(的)?(会话|空间)/,
      /开(一个)?新(的)?(.+?)(会话|话题)/,
    ],
    paramExtractors: {
      topic: (text) => {
        if (text.includes('工作') || text.includes('项目')) return 'work';
        if (text.includes('生活') || text.includes('日常')) return 'life';
        if (text.includes('创意') || text.includes('想法')) return 'creative';
        if (text.includes('情感') || text.includes('心情')) return 'emotion';
        if (text.includes('学习') || text.includes('读书')) return 'study';
        return 'other';
      },
      title: (text, match) => match?.[2] || '新会话',
    }
  },

  switch_session: {
    keywords: ['切换到', '打开', '去', '进入'],
    regexes: [
      /切换到(.+)/,
      /打开(.+?)(会话|话题)/,
      /去(.+?)(那里|的?会话)/,
    ],
  },

  // ... 其他意图
};
```

### 3.4 参数提取

| 编号 | 需求 | 示例 |
|------|------|------|
| INT-101 | 提取主题 | "工作会话"→topic="work" |
| INT-102 | 提取标题 | "关于项目A"→title="项目A" |
| INT-103 | 提取会话名 | "切换到项目A"→target="项目A" |
| INT-104 | 提取搜索词 | "搜索会议记录"→query="会议记录" |
| INT-105 | 上下文补全 | 在"项目A"会话中说"重命名"→重命名当前会话 |

### 3.5 确认机制

| 编号 | 需求 | 场景 |
|------|------|------|
| INT-201 | 高影响操作需确认 | 删除会话："确认删除'项目A'吗？" |
| INT-202 | 参数缺失时追问 | "请问新会话的主题是什么？" |
| INT-203 | 置信度 < 0.6 时作为普通对话 | 不触发动作 |
| INT-204 | 用户说"取消"时中止 | 任何阶段可取消 |

---

## 四、接口

```typescript
// 后端意图识别 API
POST /api/v1/intent/recognize
Body: { text: string; sessionId: string; context?: string[] }
Response: {
  intent: {
    type: string;
    params: Record<string, any>;
    confidence: number;
    requiresConfirmation: boolean;
  } | null;
  reply?: string;  // 如需追问，返回追问文本
}

// 或通过 WebSocket 在聊天流中返回
{
  type: "intent";
  data: {
    type: "new_session";
    params: { topic: "work", title: "项目A" };
    confidence: 0.95;
  }
}
```

---

## 五、事件

```typescript
// INT 发出
"intent:detected" → 语音系统：显示确认/执行
"intent:confirmed" → 后端：执行动作
"intent:cancelled" → 语音系统：恢复对话

// INT 监听
"voice:message:send" → 检查是否含意图
```

---

## 六、验收清单

- [ ] "新建一个工作会话"→识别 new_session，topic=work
- [ ] "切换到项目A"→识别 switch_session
- [ ] "删除这个会话"→识别 delete_session，需确认
- [ ] "重命名"（在当前会话中）→识别 rename_session
- [ ] "搜索会议"→识别 search_memory
- [ ] 置信度 < 0.6 时作为普通对话
- [ ] "取消"时中止当前意图

---

## 七、开发顺序（3 天）

1. **Day 1**：关键词匹配引擎 + 规则库
2. **Day 2**：参数提取 + 上下文意图 + 确认机制
3. **Day 3**：LLM 辅助识别 + 联调测试
