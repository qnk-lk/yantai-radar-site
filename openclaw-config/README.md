# OpenClaw Radar Config

以后如果你要调整 OpenClaw 的抓取策略，优先直接改这个目录里的文件，然后推送到 GitHub。

最常改的文件：

- `openclaw-config/daily-sales-prompt-auto.txt`
  - 改日报任务提示词
  - 改地区优先级、抓取重点、输出要求

- `openclaw-config/source-whitelist.md`
  - 改自动化白名单
  - 改优先来源、降级来源、禁用来源

生效方式：

1. 在 GitHub 网页直接编辑这两个文件
2. 提交到 `master` 或 `main`
3. GitHub Actions 自动同步到服务器的 `~/.openclaw/workspace/knowledge/shandong-mes-wms-qms-radar/`

如果只是改抓取规则，不需要登录服务器，不需要手动替换文件。
