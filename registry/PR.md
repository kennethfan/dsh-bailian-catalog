# 收录 PR 物料：把 dsh-bailian-catalog 提交到 awesome-dsh-plugin

本文档是提交收录 PR 的**物料与步骤清单**，不是脚本。**本仓库不代提 PR**：第 3、4 步的 `git push` 与 PR 创建由仓库维护者本人执行。

## 0. 前置条件

- 本插件已推到 GitHub，仓库名 `dsh-bailian-catalog`，默认分支 `main`。
- 仓库已添加 `dsh-plugin` topic。
- 仓库创建满 **24 小时**（目录 CI 自动检查 `created_at`，`MIN_AGE_DAYS = 1`；未满时 CI 会提示几小时后自动通过，无需重复提交）。
- 若你的 GitHub 账号不是 `kennethfan`，请把本文件与 `registry/dsh-bailian-catalog.yml` 里的 `kennethfan` 全部替换成你的账号。

## 1. Fork 并克隆目录仓库

```bash
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin
git switch -c add-dsh-bailian-catalog
```

## 2. 新增一个目录数据文件

- 路径：`data/plugins/kennethfan__dsh-bailian-catalog.yml`
- 命名规则：`<owner>__<repo>.yml`（owner 与 repo 之间是**两个下划线**）
- 内容：把本仓库 `registry/dsh-bailian-catalog.yml` 的原文复制过去，其余字段一字不改。

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `url` | `https://github.com/kennethfan/dsh-bailian-catalog` | 不带 `.git`、不带分支 |
| `name` | `kennethfan/dsh-bailian-catalog` | 与文件名一致 |
| `category` | `model` | 目录已有的分类键（现有 126 条 `model` 类条目） |
| `description.en` | 见 yml | 单引号包裹的单段文本 |
| `description.zh` | 见 yml | 中英内容对等 |

> 描述中含 `: `（冒号加空格）必须加引号，否则 YAML 会当作嵌套键解析。

## 3. 提交 PR

```bash
git add data/plugins/kennethfan__dsh-bailian-catalog.yml
git commit -m "Add dsh-bailian-catalog"
git push -u origin add-dsh-bailian-catalog
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin --title "Add dsh-bailian-catalog" --body "..."
```

PR 只应改动这一个文件；**不要手工编辑两个 README**（由 `scripts/generate-readme.mjs` 生成）。

## 4. 收录门槛自查

| 要求 | 本仓库状态 |
| --- | --- |
| `package.json` 声明 `dsh.bundle` | ✅ |
| 仓库根有 `cordis.patch.yml` | ✅ |
| 真实可用代码（非占位） | ✅ |
| 仓库创建满 1 天 | ⏳ 建仓后计时 |
| 已加 `dsh-plugin` topic | ⏳ 建仓后设置 |
| 描述属实、无营销词 | ✅ |
| 分类贴合实际功能 | ✅ `model` |

## 5. 已知重叠条目（评审可能提问）

- `zhangyqjiaoshou-oss/dsh-model-sync` —— 「一键/自动同步供应商模型列表」。同为模型列表获取，差异在于本插件是**按需挑选单个模型**加入路由（不是整表同步），并额外提供当前会话上下文额度。
- `CroissanTTs/dsh-bailian-models`（npm 上存在，**尚未被目录收录**）—— 百炼 provider 预设 + 手工维护的 36 模型目录 + 自动适配器。差异在于本插件**实时枚举**端点返回的全部可用模型（作者端点 178 个），不做预设快照。