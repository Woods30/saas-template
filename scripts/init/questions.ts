/**
 * init 的交互提问。
 *
 * 每个问题都带默认值 —— 一路回车也能得到一个能跑的项目。这是刻意的：
 * 初始化脚本的第一原则是「别把人卡在这里」。
 */

import { confirm, input } from '@inquirer/prompts'
import { deriveSlug, type InitConfig, MODULE_NAMES, type ModuleName, resolveConfig } from './plan'

/** 逐个确认模块是否开启，默认全关。 */
async function askModules(): Promise<ModuleName[]> {
  const enabled: ModuleName[] = []
  for (const module of MODULE_NAMES) {
    if (await confirm({ message: `启用 ${module} 模块？`, default: false })) enabled.push(module)
  }
  return enabled
}

/** 在默认值基础上逐个提问；用户直接回车即接受默认值。 */
export async function askConfig(defaults: InitConfig): Promise<InitConfig> {
  const name = await input({ message: '站点名', default: defaults.name })

  const slug = await input({
    message: '短名（Cloudflare 资源前缀、包名）',
    default: safeSlug(name, defaults.slug),
    validate: (value) =>
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value) || '仅允许小写字母、数字、连字符',
  })

  const domain = await input({ message: '生产域名', default: `${slug}.example.com` })

  const email = await input({ message: '支持邮箱', default: `support@${domain}` })

  const modules = await askModules()

  // 收款码链路要的是使用者自己的支付宝收款码与人民币标价，脚本无从代填，
  // 也不该编造金额。只提示去哪里改，不生成占位收款码或假金额。
  if (modules.includes('collection')) {
    console.log(
      [
        '',
        '已启用收款码（collection）模块，请手工补齐两处配置：',
        '  1. src/config/products.ts —— 给要收款的付费方式加 collectionPrices（金额单位：分）',
        '  2. src/config/website.ts —— 在 collection.accounts 里填你的收款码地址与显示名',
        '未配置时服务状态会显示 incomplete，页面与接口不会放行。',
        '',
      ].join('\n'),
    )
  }

  return resolveConfig({ name, slug, domain, email, modules }, process.cwd())
}

/** 站名推不出合法短名时退回原默认值，避免提问阶段直接抛错。 */
function safeSlug(name: string, fallback: string): string {
  try {
    return deriveSlug(name)
  } catch {
    return fallback
  }
}
