# Domain docs

这个 repo 是 single-context（单领域）架构。

## Layout

- `CONTEXT.md` — repo root 下的领域上下文文件。描述项目的业务领域、核心术语和约束。
- `docs/adr/` — 架构决策记录（Architecture Decision Records）。每个 ADR 是一个 markdown 文件，记录一次重要架构决策及其理由。

## Consumer rules

- `improve-codebase-architecture`、`diagnosing-bugs`、`tdd` 等 skills 会读取 `CONTEXT.md` 来理解项目的 domain language，并读取 `docs/adr/` 来了解过往架构决策。
- 如果需要多 context 支持（如 monorepo 场景），应在 root 下创建 `CONTEXT-MAP.md`，指向每个 context 的 `CONTEXT.md` 文件。