# OpenClaw Radar Config

以后如果你要调整 OpenClaw 的抓取策略，直接改这个目录里的文件，然后推送到 GitHub。

现在这个目录已经包含服务器上这套雷达任务使用的主要知识文件。
GitHub Actions 会把这里的内容同步到：

`~/.openclaw/workspace/knowledge/shandong-mes-wms-qms-radar/`

当前 cron 的真正入口是：

`openclaw-config/daily-sales-prompt-auto.txt`

也就是 OpenClaw 先读这一个文件，再由这个文件去引用其他规则文件。

最常改的文件：

- `openclaw-config/daily-sales-prompt-auto.txt`
  - 改日报任务提示词
  - 改地区优先级、抓取重点、输出要求
- `openclaw-config/source-whitelist.md`
  - 改自动化白名单
  - 改优先来源、降级来源、禁用来源
- `openclaw-config/yantai-keywords.md`
  - 改烟台优先关键词
  - 增加行业词、园区词、岗位词、系统词
- `openclaw-config/lead-scoring-rules.md`
  - 改线索 A/B/C/D 评分规则
- `openclaw-config/target-account-rules.md`
  - 改哪些对象值得进入潜在客户名单

也会偶尔改的文件：

- `openclaw-config/source-list.md`
  - 改关注来源池
- `openclaw-config/fetch-strategy.md`
  - 改抓取顺序、回退策略
- `openclaw-config/evidence-rules.md`
  - 改证据准入标准
- `openclaw-config/output-template.md`
  - 改日报输出格式
- `openclaw-config/account-list-template.md`
  - 改潜在客户沉淀格式
- `openclaw-config/region.md`
  - 改地区优先级和覆盖范围
- `openclaw-config/competitor-list.md`
  - 改竞对清单
- `openclaw-config/verification-checklist.md`
  - 改通用核验要求
- `openclaw-config/verification-checklist-sales.md`
  - 改销售视角核验要求

一般不需要频繁改的文件：

- `openclaw-config/daily-sales-prompt.txt`
- `openclaw-config/report-scoring-rules.md`
- `openclaw-config/sales-focus.md`

生效方式：

1. 在 GitHub 网页直接编辑 `openclaw-config/` 里的文件
2. 提交到 `master` 或 `main`
3. GitHub Actions 自动同步到服务器
4. 下一次 OpenClaw 定时抓取按新规则执行

如果只是改抓取规则，不需要登录服务器，不需要手动替换文件，不需要再让我帮你改命令。
