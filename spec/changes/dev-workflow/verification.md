# 验证记录：dev-workflow

## TDD 证据

- RED：新增 repo 测试 5 例（创建/推进/步骤登记/隔离/研讨会来源），首跑因模块不存在失败
- GREEN：实现 schema 两张表 + `dev-workflow-repo.ts` + 路由；用例全部通过
- 重构后验证：全量测试 79 文件 405 用例通过

## 自动验证

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm --prefix Arrodes/server test` | 0 | 79 文件 405 用例通过 |
| `npm --prefix Arrodes/server run typecheck` | 0 | tsc --noEmit 零错误 |
| `npm --prefix Arrodes/client run build` | 0 | tsc -b + vite build 通过 |

## 端到端冒烟

1. `POST /workflows`（title+projectDir+sourceSeminarId）→ 201，stage=idea，steps=[idea:pending]
2. `POST /workflows/:id/advance`（artifactPath=Plan/business-spec.md）→ stage=spec，
   idea 步骤 done 并登记产出物
3. `POST /workflows/:id/steps`（spec→done）→ 步骤更新成功
4. `GET /workflows/:id` → 两步均 done，产出物正确

## 审查

- [x] 规格符合性审查：REQ-001~005 全部实现（实体/推进/登记/隔离/研讨会转入）
- [x] 代码质量审查：仓库/路由分层一致；阶段常量命名（DEV_WORKFLOW_STAGES）；事务保证推进原子性
- [x] 未引入不当 hardcode（阶段列表为命名常量）
- [x] 独立复审：不适用（单代理环境，由规格符合性+代码质量两轮自审替代，验证证据可审计）

## 偏差、风险与遗留债务

- 无偏差
- 遗留：devworkflow 技能协议仍为静态文本，未动态注入 projectDir；后续可将技能执行与工作流阶段联动
- 遗留：阶段推进不校验产出物真实性（人工门禁，符合设计）
