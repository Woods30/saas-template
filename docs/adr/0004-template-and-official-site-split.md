# ADR-0004: 模板工程与官网分仓

- **状态**：Accepted（2026-11-02）；其中「init 脚本住在模板仓内」一条已由 ADR-0009 取代
- **日期**：2026-11-02

## 背景

`Woods30/saas-template` 里挤着两样生命周期已经分叉的东西：

1. 一个可复用的 SaaS 模板（TanStack Start + Cloudflare Workers）；
2. 一个用这个模板做出来的商业站点 —— **Jerbix**：模板的品牌、官网，以及把模板源码以
   一次性付费（USD 99）卖出去的支付链路。

模板该被无数人复用、该有独立的版本与发版节奏；官网该自己迭代、该有独立的商业条款与
交付流程。继续挤在一起时，每一次改「模板怎么用」都要先确认「会不会影响官网在卖的东西」。

拆分方向上有三个真实选项：官网仓保留完整代码副本、官网仓退化成「品牌 + overlay」仓
（不含通用代码）、以及合并成一个仓。

## 决策

1. **模板工程是独立仓** `Woods30/saas-template`；现仓改名为 `Woods30/jerbix`，作为
   **官网工程**。GitHub 改仓名会自动重定向旧链接。
2. **官网仓保留完整代码副本**，不采用 overlay 仓、不合并成一仓。模板仓是唯一源码源，
   官网仓通过 `git merge template/main` 跟进。
3. **模板仓从现仓用 `git filter-repo` 派生，保留共同祖先**，使合并可用；同时剔除
   `docs/superpowers/`、`.superpowers/`、blog / changelog 示例内容。
4. **模板仓默认品牌就是 Jerbix**：`metadata.name` 与全部品牌资产保持 Jerbix 现值。
   init 脚本负责把它们改成实例项目的品牌。
5. **「卖模板」的能力不进模板仓**：`template` 一次性商品由 init 按参数生成；
   `isTemplatePriceValid()` 泛化为「一次性商品校验」，不以官网业务命名。
6. **文档分两层**：技术文档（22 个 slug）跟模板走并由模板仓部署；商业条款文档跟官网走。
   官网的 `/docs` 改为外链到模板仓的文档站。
7. **模板仓部署完整应用**到独立文档域，靠模块开关关掉不需要的部分，不裁剪出
   docs-only 构建变体。
8. **init 脚本住在模板仓内**，形态为 `pnpm run init`（交互为默认、全参数可覆盖、
   `--non-interactive` 供脚本化），另配一个 `create.sh` 薄壳。不发布 npm 包。
9. **发布方式**：模板仓公开 GitHub Release；买家拿购买时冻结的 tag；交付仍是人工。

## 后果

- 两仓的代码会重复，改动需要一次合并；冲突面天然分层（模板的通用代码 vs 官网的定制）。
- 模板仓的默认品牌是 Jerbix，买家不提供素材时站上会保留 Jerbix 的吉祥物与配色；
  逃生舱是 init 的 `--logo` / `--mascot` 参数与 `metadata.images.*` 配置。
- 官网改一处模板通用代码，要先在模板仓改、发版、再合并回来 —— 官网的迭代被模板的
  发版节奏部分绑架。
- 模板仓需要自己的一套 Cloudflare 资源与部署流程（文档站），成本是额外的账号级配置。
- 保留共同祖先意味着模板仓的历史里仍可见 Jerbix 的过去；换取的是一次 merge 即可同步。
- 官网仓的生产部署链（自定义域名、真实 D1 / KV ID、`deploy.yml` 的 secret 白名单、
  GitHub `production` Environment）**完全不动**。

## 相关

- `docs/superpowers/specs/2026-11-02-template-extraction-and-init-design.md`
- `docs/adr/0005-init-replacement-table.md`
