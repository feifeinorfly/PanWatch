# Triage labels

这个 repo 使用五个标准 triage roles。每个 role 映射到一个 GitHub label。

| Role | Label | 含义 |
|------|-------|------|
| Needs triage | `needs-triage` | Maintainer 需要评估 |
| Needs info | `needs-info` | 等待 reporter 补充信息 |
| Ready for agent | `ready-for-agent` | 规格完整，AFK-ready（AI 可独立处理） |
| Ready for human | `ready-for-human` | 需要人工实现 |
| Won't fix | `wontfix` | 不会处理 |

## 使用方式

- `triage` skill 会按需添加/移除这些 labels。
- 不创建重复 labels；如果 repo 已有不同名称的等价 labels，应先更新此映射。