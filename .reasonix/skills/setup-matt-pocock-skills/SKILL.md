---
name: setup-matt-pocock-skills
description: 配置此仓库供工程技能使用：设置 issue tracker、分诊标签词汇和领域文档布局。首次使用其他工程技能前运行一次。
disable-model-invocation: true
---

# Setup Matt Pocock's Skills

搭建 engineering skills 所假定的每仓库配置：

- **Issue tracker** - issues 存放在哪里（默认 GitHub；也原生支持 local markdown）
- **Triage labels** - 五个 canonical triage roles 使用的字符串
- **Domain docs** - `CONTEXT.md` 与 ADRs 的位置，以及读取它们的 consumer rules

这是 prompt-driven skill，不是确定性脚本。先探索，展示发现，与用户确认，然后写入。

## Process

### 1. Explore

查看当前 repo，理解起始状态。读取已有内容，不要假设：

- `git remote -v` 和 `.git/config` - 这是 GitHub repo 吗？是哪一个？
- repo root 的 `AGENTS.md` 和 `CLAUDE.md` - 是否存在？其中是否已有 `## Agent skills` section？
- repo root 的 `CONTEXT.md` 和 `CONTEXT-MAP.md`
- `docs/adr/` 以及任何 `src/*/docs/adr/` directories
- `docs/agents/` - 这个 skill 之前是否已经输出过内容？
- `.scratch/` - 表明已经在使用 local-markdown issue tracker 约定

### 2. Present findings and ask

总结已有内容和缺失内容。然后带用户逐一完成三个决策：每次只展示一个 section，拿到用户答案后再进入下一个。不要一次倒出三个问题。

假设用户不知道这些术语是什么意思。每个 section 先用简短 explainer 开头（它是什么、为什么这些 skills 需要它、选择不同选项会改变什么），然后展示选项和默认值。

**Section A - Issue tracker.**

> Explainer: "issue tracker" 是这个 repo 存放 issues 的地方。`to-issues`、`triage`、`to-prd` 和 `qa` 等 skills 会从中读取并写入；它们需要知道是调用 `gh issue create`、在 `.scratch/` 下写 markdown 文件，还是遵循你描述的其他工作流。请选择你实际用于跟踪这个 repo 工作的位置。

默认姿态：这些 skills 是为 GitHub 设计的。如果 `git remote` 指向 GitHub，推荐 GitHub。如果 `git remote` 指向 GitLab（`gitlab.com` 或 self-hosted host），推荐 GitLab。否则（或用户偏好），提供：

- **GitHub** - issues 位于 repo 的 GitHub Issues（使用 `gh` CLI）
- **GitLab** - issues 位于 repo 的 GitLab Issues（使用 [`glab`](https://gitlab.com/gitlab-org/cli) CLI）
- **Local markdown** - issues 作为文件位于本 repo 的 `.scratch/<feature>/` 下（适合个人项目或没有 remote 的 repos）
- **Other**（Jira、Linear 等）- 让用户用一段话描述工作流；skill 会把它记录为 freeform prose

当且仅当用户选择 **GitHub** 或 **GitLab** 时，追加一个 follow-up：

> Explainer: Open-source repos 常常通过 pull requests 接收 feature requests，而不只是 issues；PR 是带代码的 issue。如果开启，`/triage` 会把 *external* PRs 放进同一队列，并用同样的 labels 和 states 处理它们（collaborators 正在进行的 PRs 不动）。如果 PRs 不是你的 request surface，就关掉。

- **PRs as a request surface** - yes / no（默认 no）。把答案记录到 `docs/agents/issue-tracker.md`。Local-markdown 和 other trackers 没有 PRs，跳过这个问题。

**Section B - Triage label vocabulary.**

> Explainer: `triage` skill 处理 incoming issue 时，会把它移过一个 state machine：needs evaluation、waiting on reporter、ready for an AFK agent、ready for a human，或 won't fix。为此，它需要应用与你实际配置匹配的 labels（或 issue tracker 中的等价物）。如果你的 repo 已经使用不同 label 名称（例如 `bug:triage` 而不是 `needs-triage`），在这里映射它们，避免 skill 创建重复 labels。

五个 canonical roles：

- `needs-triage` - maintainer needs to evaluate
- `needs-info` - waiting on reporter
- `ready-for-agent` - fully specified, AFK-ready（agent 可在没有 human context 的情况下接手）
- `ready-for-human` - needs human implementation
- `wontfix` - will not be actioned

默认：每个 role 的字符串等于其名称。询问用户是否要覆盖任何项。如果他们的 issue tracker 还没有现有 labels，默认值即可。

**Section C - Domain docs.**

> Explainer: 一些 skills（`improve-codebase-architecture`、`diagnosing-bugs`、`tdd`）会读取 `CONTEXT.md` 来学习项目的 domain language，并读取 `docs/adr/` 来了解过往架构决策。它们需要知道 repo 是一个 global context，还是多个 contexts（例如 frontend/backend 分离的 monorepo），这样才能看对位置。

确认布局：

- **Single-context** - repo root 下一个 `CONTEXT.md` + `docs/adr/`。多数 repos 是这样。
- **Multi-context** - root 下 `CONTEXT-MAP.md` 指向每个 context 的 `CONTEXT.md` 文件（通常是 monorepo）。

### 3. Confirm and edit

向用户展示草稿：

- 要添加到 `CLAUDE.md` / `AGENTS.md` 的 `## Agent skills` block（选择规则见 step 4）
- `docs/agents/issue-tracker.md`、`docs/agents/triage-labels.md`、`docs/agents/domain.md` 的内容

写入前允许用户修改。

### 4. Write

**选择要编辑的文件：**

- 如果 `CLAUDE.md` 存在，编辑它。
- 否则如果 `AGENTS.md` 存在，编辑它。
- 如果两者都不存在，询问用户要创建哪一个；不要替用户选择。

当 `CLAUDE.md` 已存在时，绝不创建 `AGENTS.md`（反之亦然）；始终编辑已经存在的那个。

如果所选文件已有 `## Agent skills` block，就原地更新其内容，而不是追加重复 block。不要覆盖周围 sections 的用户编辑。

Block：

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked, plus whether external PRs are a triage surface]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout - "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

然后使用本 skill folder 中的 seed templates 作为起点，写入三个 docs files：

- [issue-tracker-github.md](./issue-tracker-github.md) - GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md) - GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md) - local-markdown issue tracker
- [triage-labels.md](./triage-labels.md) - label mapping
- [domain.md](./domain.md) - domain doc consumer rules + layout

对于 "other" issue trackers，根据用户描述从头写 `docs/agents/issue-tracker.md`。

### 5. Done

告诉用户 setup 已完成，以及哪些 engineering skills 现在会读取这些文件。说明他们之后可以直接编辑 `docs/agents/*.md`；只有当他们想切换 issue trackers 或从头开始时，才需要重新运行此 skill。
