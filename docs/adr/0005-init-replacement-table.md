# ADR-0005: init 用声明式替换表，而不是占位符 token

- **状态**：Superseded（2026-11-18，由 ADR-0009 取代）——init 脚本已废弃，替换表随之不再需要
- **日期**：2026-11-02

## 背景

模板工程要把 Jerbix 的品牌换成实例项目的品牌。品牌字面量分布在 68 个受版本控制的文件
里（`src/` 7 个、`messages/` 2 个、`content/` 14 个、`public/` 6 个、`tests/` 22 个、
`docs/` 9 个）。有三条可选路径：占位符 token（模板里写成 `{{BRAND_NAME}}`）、
全仓正则替换、以及把品牌收进单一配置文件。

同时有两处事实让「无脑替换」不成立：

- **存在两个独立的品牌源**：`src/config/website.ts` 的 `metadata.name`（footer / OG /
  JSON-LD 使用）与 `messages/*.json` 的 `site_name`（`src/routes/__root.tsx` 使用）。
  只改一处，`<title>` 与 OG 站点名会不一致。
- **并非每处品牌字面量都该换成新品牌**。`SourceProductDemo.tsx` 的 `'Jerbix'` 是演示里
  「改之前」的状态 —— init 之后它应当保持原模板品牌，而「改之后」那一侧
  （`home_demo_brand`，当前值 `你的品牌`）才该填入新名字。`home_mascot_alt` 在默认沿用
  Jerbix 吉祥物时也应当排除。

## 决策

1. **用声明式替换表**：一张「文件 → 改什么」的清单，是 init 唯一需要随模板演进而维护的
   地方。表放在 `scripts/init/replacements.ts`。
2. **表支持三类条目**：品牌字面量替换、占位符填充、显式排除。
3. **结构化文件按结构改**：`package.json`、`public/manifest.json`、`messages/*.json` 走
   JSON 解析后改再写回；`wrangler.jsonc` 走**保留注释**的正则改写；`src/config/` 下两个
   文件按**配置项**改而不是按字符串改。
4. **不用占位符 token**：模板要长期被人二次开发，token 纪律难以维持，且模板自身的开发
   态就是一堆占位符，调试体验变差。后补 token 的代价远高于现在维护一张表。
5. **不用全仓正则替换**：会误伤内容站的散文、历史文档与生成物，且无法表达「这一处不该
   替换」。
6. **不把品牌收进单一配置文件**：那需要重写现有代码，与「不改运行时行为」冲突；且
   散文内容里的品牌仍是字面量，收不干净。
7. **用反向清单单测兜底**：一张「品牌出现的位置 → 期望的替换类别」的清单，任何新增的
   品牌引用若未登记，测试即红。这是替换表唯一的维护成本，用测试把它变成可发现的。
8. **图形资产不改**：wordmark 是转曲后的 path，无法字符串替换。改为把 mascot 图形与
   wordmark 拆开，`BrandLogo` 用 `metadata.name` 渲染文字。

## 后果

- 模板每新增一处品牌引用，必须在替换表登记一次；登记漏了会被单测抓住。
- 替换表是 init 脚本里唯一与模板内容耦合的部分，其余逻辑（`.env` 合并、幂等、
  计划 / 执行分离）与品牌无关。
- 模板自身仍以 Jerbix 品牌呈现，实例项目通过 init 得到自己的品牌；两者在同一条替换链
  上，不存在「模板是中性占位符」这种中间态。
- 品牌图片的更换依赖用户自己提供素材（`--logo` / `--mascot`），脚本不生成图形。

## 相关

- `docs/superpowers/specs/2026-11-02-template-extraction-and-init-design.md`
- `docs/adr/0004-template-and-official-site-split.md`
