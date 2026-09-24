# CLAUDE.md — Online Saler

本文件是 Claude 在本仓库工作的规则。

## 一、这是什么

肯尼亚 Kikuyu 的二手服装线上交易平台（MVP）。第一阶段目标：把 1000 件实物二手衣服变成可在线购买、单件唯一追踪的商品。

一件衣服 = 一个库存记录 = 一个库位，卖掉即下架，不存在同款多件。

**这是公开仓库（PUBLIC）**，且包含 M-Pesa 支付集成。提交任何内容前都要意识到它对外可见。

MVP 范围内：商品数字化（条码 / 拍照 / AI 提取 / 人工校准 / 上架）、唯一库存、顾客商城、M-Pesa 支付与对账、仓库作业（入库 / 拣货 / 打包 / 自提 / 配送）、分销归因与周结佣金、管理后台。

MVP 范围外：多商家市场、多级分销、原生 App、全国配送自动化、AI 推荐。

## 二、架构

npm workspaces 单体仓库，Node >= 20。

| 目录 | 是什么 | 技术 |
| --- | --- | --- |
| `apps/storefront` | 顾客端商城 | Next.js + Remotion + Konva |
| `apps/operations` | 员工作业台 | Next.js + TanStack Table + jsbarcode |
| `apps/admin` | 管理后台 | Next.js |
| `apps/api` | 统一后端 API | NestJS + satori |
| `apps/worker` | 异步任务（图片处理、预留过期、佣金确认、通知） | Node |
| `apps/image-processor-lightweight` · `apps/image-processor-rembg` | 图片抠图处理 | Python |
| `packages/database` | Prisma schema 与迁移（45 个模型，1371 行） | Prisma 6 |
| `packages/shared-types` · `business-rules` · `ui` · `config` | 共享包 | TypeScript |

后端按中台模块组织：Foundation / Product / Inventory / Transaction / Payment / Fulfillment and Returns / Affiliate and Commission / Data Operations。

## 三、分支策略（注意与文档不一致）

README 和 `docs/development/branch-strategy.md` 写的是：所有工作先进 `develop`，集成测试通过后再从 `develop` 提升到 `main`。

**但实际情况是：`main` 停在 2026-08-13，而生产环境是从 `develop` 手动部署的（2026-09-15 仍在部署）。** 也就是说 `main` 已经脱离实际使用。

因此：

- 新分支从 `develop` 切出，PR 目标分支为 `develop`
- 不要假设 `main` 代表线上状态
- 若用户希望恢复 `develop → main` 的提升流程，这是一次单独的讨论，不要顺手做

分支命名：`feature/*`、`fix/*`、`docs/*`。

## 四、常用命令

```bash
npm install

# 仓库骨架检查 + 生成 Prisma client + 全量构建 + 测试
npm run ci

# 单项
npm run check:repo          # 校验必需文件是否齐全（缺一即失败）
npm run typecheck
npm run test
npm run build

# 各应用本地开发
npm run dev:storefront
npm run dev:operations
npm run dev:admin
npm run dev:api
npm run dev:worker

# 数据库
npm run db:generate
npm run db:migrate
```

`npm run check:repo` 会校验一份必需文件清单（各 app 的 README、docs 下的架构 / 业务规则 / 分支策略 / 部署文档、`project/` 下四份登记表、tests 与 infrastructure 的 README）。**新增目录时如果漏了 README，CI 会失败。**

## 五、部署

部署在 Google Cloud Run（项目 `online-saler-staging`，区域 `africa-south1`）。

- `deploy-api-staging.yml` / `deploy-operations-staging.yml` / `deploy-storefront-staging.yml` — staging
- `deploy-storefront-production.yml` — **生产，仅手动触发**，需输入 `deploy-production` 确认字符串。始终按订单全额真实收款。
  - `one_ksh`（1 先令 + 白名单）测试模式已于 2026-09-19 按用户指示删除：它一旦被选中，所有非白名单顾客都无法付款。**不要再把收款模式选项加回部署表单。**
- `deploy-storefront-staging.yml` 名字叫 staging，但用的是**生产 M-Pesa 密钥、真实全额收款**、和线上共用数据库。平时 `ingress=internal`，测试时临时改 `all`，测完改回。

**不要触发生产部署。** 需要上生产时，把情况说明给用户，由用户自己执行。

M-Pesa 生产密钥存放在 Google Secret Manager，**不得写入 GitHub repository secrets、源码、PR 评论或 Issue 评论**。清单见 `project/PRODUCTION_LAUNCH_CHECKLIST.md`。

## 六、提交方式：直接推主分支，不走 PR

用户于 2026-09-17 明确指示：**直接提交，不走 PR 流程。**

本仓库的主分支是 **`develop`**（线上实际运行的分支，见第三节；`main` 已停在 2026-08-13 脱离使用），因此直接提交到 `develop`。

**2026-09-24 起，只有「总控」会话能提交到 `develop`，其他会话不能。** 规则见第九节。

**代价：CI 只在 push 到 `main`/`develop` 和 PR 上触发。** push 到 `develop` 时 `ci.yml` 仍会跑，但 PR 模板里的 Risk Check 不再有人把关。提交前必须手动自查：

- [ ] `npm run ci` 通过（含 `check:repo`、Prisma 生成、构建、测试）
- [ ] 新增目录都补了 README（否则 `check:repo` 失败）
- [ ] 未引入密钥、凭证、生产数据（**这是公开仓库**）
- [ ] 未在无确认的情况下改动订单 / 支付 / 库存 / 退货 / 佣金状态机

若改动涉及上述五个状态机或支付流程，主动建议用户改走 PR，由用户决定。

### 如果确实要开 PR

PR 模板（`.github/pull_request_template.md`）要求勾选：

- **Scope** — 影响哪一块（商品数字化 / 商城 / 作业台 / 后台 / 后端中台 / 基础设施 / 仅文档）
- **Validation** — `npm run ci`、单元测试、集成测试、手工冒烟测试
- **Risk Check** — 三条必须确认：
  - 未在无书面决策的情况下改动业务规则
  - 未在无评审的情况下改动订单 / 支付 / 库存 / 退货 / 佣金状态机
  - 未引入密钥、凭证或生产数据

**订单、支付、库存、退货、佣金这五个状态机是高危区域**，改动前先跟用户确认。

## 七、项目登记表实际没在用

`project/BUGS.md` 至今写着"还没有记录任何 bug"，但仓库已合并 200 多个 PR。`TASKS.md`、`CHANGE_REQUESTS.md` 情况类似。

引用这些文件判断项目状态会得出错误结论。**真实状态以 git log、PR 记录和 Cloud Run 上的实际部署为准。** 若用户希望重新启用这套登记流程，属于单独任务。

## 八、我的工作规则

用户已授权全面接管：整理需求、写代码、直接提交到 `develop`、部署 staging、维护项目文档。

必须遵守：

- 提交前完成第六节的手动自检清单
- 不触发生产部署，不接触生产密钥
- 改动业务规则或上述五个状态机前先确认
- 保持 PR 小而可审查
- 这是公开仓库，任何提交都不得包含密钥、商户号、真实客户数据

用户是非开发者。每个 PR 要说明**页面上的变化是什么，如何点击验证**。

## 九、并行会话：只有「总控」能上线（2026-09-24 起）

用户会同时开好几个会话。以前这些会话都在同一个工作目录里直接往 `develop` 提交，结果互相把没做完的代码带进了别人的提交，staging 部署也坏过一次。**注意：push 到 `develop` 会自动部署 api 和 operations，这两个服务和线上共用同一个数据库，所以 push 到 `develop` 就等于上线。**

**「总控」会话**（侧边栏标题叫「总控」，工作目录是仓库主目录，停在 `develop` 上）：

- 只有它能提交或合并到 `develop`、push `develop`、手动触发 staging 部署
- 一次只合并一个分支：先把分支 rebase 到最新的 `develop` 上，跑 `npm run ci`，完成第六节的自查，然后 push，再确认 Cloud Run 上的新修订版本起来了
- 数据库迁移由总控统一编号、统一生成
- 生产环境的 storefront 仍然由用户自己手动触发（第五节）。总控只负责把要上线什么、怎么点讲清楚
- 合并完成后，通知其他会话把最新的 `develop` 同步到自己的分支

**其他会话（业务会话）：**

1. 开工第一步：从最新的 `develop` 切一个 git worktree 和分支（命名 `feature/*`、`fix/*`、`docs/*`）。**不要在仓库主目录里改代码**，主目录归总控
2. 不提交到 `develop`，不 push `develop`，不部署，不改 GitHub Actions 的变量和部署开关
3. 可以改 `packages/database/prisma/schema.prisma`，但**不要写迁移文件**，在交付时写清楚改了哪些字段
4. 做完后提交到自己的分支，push 这个分支，然后给总控发会话消息，写明：分支名、页面上有什么变化、怎么点击验证、自己跑过哪些测试、是否动了第六节列出的五个状态机或业务规则
5. 如果要改公共代码（`packages/*`、`apps/api` 里的 Foundation 模块、各应用共用的布局和鉴权），先发消息告诉总控，改动要小，单独提交

找不到总控会话时，先停下来问用户，不要自己上线。
