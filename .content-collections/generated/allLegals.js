
export default [
  {
    "title": "Privacy Policy",
    "locale": "en",
    "content": "We respect your privacy. This policy describes what information this template touches, what it is used for, and what choices you have.\n\n> **Note**: This document is **template placeholder content** and is not legal advice. Every item marked \"fill in before deploying\" must be replaced with the facts of your actual deployment before you publish it — a privacy policy that does not match reality is worse than none.\n\n## What we collect\n\nAccount-related information is collected only to identify you and keep you signed in: your email address, the credentials used to sign in, and the display name you choose. Passwords are not stored in readable form.\n\nWhen you use features that require payment, the charge is handled by Stripe. We never see or store your full card number.\n\n> **Note**: Fill in before deploying — if your deployment actually enables analytics, the newsletter, or file uploads, add the fields each of them collects here and remove the \"not enabled\" wording above. These switches live in `src/config/website.ts`.\n\n## How we use it\n\nThe information is used only to: verify sign-in, maintain your session, reset your password when you ask, and grant the entitlements you purchased.\n\nWe do not sell your information, and we do not use it for profiling unrelated to the purposes above.\n\n## Sharing and third parties\n\nInformation is passed to third parties only when needed to keep the service running. The categories this template can integrate with are listed below; which ones are active depends on your configuration.\n\n| Category | Purpose | Config key |\n|---|---|---|\n| Mail | Send verification codes, password resets, notifications | `mail` |\n| Payments | Process subscriptions and refunds | `payment` |\n| Newsletter | Manage the subscriber list | `newsletter` |\n| Notifications | Deliver operational alerts | `notification` |\n\n> **Note**: Fill in before deploying — remove the rows you have not enabled, and for each service you do use, add the provider name, its region, and a link to its data processing agreement (DPA). Users need to know when their data leaves this site.\n\n## Cookies and local storage\n\nThis site sets only what is required to function: a session cookie that keeps you signed in, a cookie that remembers your language choice, and local storage that remembers your light/dark preference. None of these are used for cross-site tracking.\n\n> **Note**: Fill in before deploying — if you add third-party analytics or marketing scripts, their cookies must be listed here one by one (name, purpose, lifetime). A policy that omits cookies you actually set directly affects compliance.\n\n## Your choices and rights\n\nYou can change your display name and email in your profile, change your password or delete your account from the Security page, and revoke sessions on other devices from the Login Devices page.\n\nYou can also request an export of your data, or ask us to delete it.\n\n> **Note**: Fill in before deploying — if you are located in, or target users in, jurisdictions with specific data-protection regimes such as the EU or California, state the corresponding rights here (access, rectification, erasure, portability, objection), along with the channel for making a request and the response deadline.\n\n## Contact us\n\nFor any question about privacy, contact: `<fill in contact email before deploying>`\n\n> **Note**: Fill in the contact email and make sure someone monitors it. The value already configured at `websiteConfig.mail.supportEmail` is a reasonable choice.",
    "_meta": {
      "filePath": "privacy.md",
      "fileName": "privacy.md",
      "directory": ".",
      "extension": "md",
      "path": "privacy"
    }
  },
  {
    "title": "隐私政策",
    "locale": "zh",
    "content": "我们尊重你的隐私。本政策说明本模板会接触哪些信息、用来做什么、以及你有哪些选择。\n\n> **注意事项**：本文档是**模板占位内容**，不构成法律意见。凡标注「部署前填写」的条目都必须按你的实际部署替换成真实情况后才能对外发布——用一份与事实不符的隐私政策，比没有更糟。\n\n## 我们收集哪些信息\n\n账号相关的信息仅用于识别你的身份与维持登录状态：邮箱地址、用于登录的凭据，以及你主动填写的昵称。密码不以可读形式存储。\n\n当你使用需要付费的功能时，支付由 Stripe 处理，我们不接触也不存储你的完整卡号。\n\n> **注意事项**：部署前填写——如果你的部署实际开启了分析（`analytics`）、邮件营销（`newsletter`）或文件上传，请在此补上它们各自收集的字段，并删掉上面关于「未开启」的表述。开启状态见 `src/config/website.ts`。\n\n## 我们如何使用信息\n\n收集到的信息只用于以下几件事：验证登录、维持会话、在你主动请求时重置密码、以及在你购买后开通对应权益。\n\n我们不出售你的信息，也不用它来做与上述目的无关的画像。\n\n## 共享与第三方\n\n信息只在必要时交给支撑服务运行的第三方。本模板可能接入的类别如下，是否启用取决于你的配置：\n\n| 类别 | 用途 | 配置位置 |\n|---|---|---|\n| 邮件 | 发送验证码、密码重置、通知 | `mail` |\n| 支付 | 处理订阅与退款 | `payment` |\n| 邮件订阅 | 管理订阅者列表 | `newsletter` |\n| 消息通知 | 推送运营告警 | `notification` |\n\n> **注意事项**：部署前填写——删去你未启用的行，并为实际使用的每个服务补上服务商名称、所在地区与数据处理协议（DPA）链接。用户需要知道数据离开了本站。\n\n## Cookie 与本地存储\n\n本站只使用维持功能所必需的信物：用于保持登录状态的会话 Cookie、记住语言选择的 Cookie，以及在深浅色主题之间记住你的偏好的本地存储。它们不用于跨站追踪。\n\n> **注意事项**：部署前填写——若接入了第三方分析或营销脚本，其设置的 Cookie 必须在此逐一列出（名称、用途、有效期）。一份漏列 Cookie 的政策会直接影响合规性。\n\n## 你的选择与权利\n\n你可以随时在「个人中心」修改昵称与邮箱、在「安全」页修改密码或删除账号，在「登录设备」页撤销其他设备的会话。\n\n你也可以要求导出或删除你的数据。\n\n> **注意事项**：部署前填写——如果你位于或面向欧盟 / 加州等有特定数据保护法规的地区，请在此按适用法规写明对应的访问权、更正权、删除权、可携带权与反对权，并留下受理渠道与响应时限。\n\n## 联系我们\n\n关于隐私的任何问题，请联系：`<部署前填写联系邮箱>`\n\n> **注意事项**：部署前填写联系邮箱，并确认它有人在维护。可复用 `websiteConfig.mail.supportEmail` 中已配置的值。",
    "_meta": {
      "filePath": "privacy.zh.md",
      "fileName": "privacy.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "privacy.zh"
    }
  },
  {
    "title": "Terms of Service",
    "locale": "en",
    "content": "By using this service you confirm that you have read and agree to the terms below.\n\n> **Note**: This document is **template placeholder content** and is not legal advice. Every item marked \"fill in before deploying\" must be replaced with the facts of your actual business before you publish it — especially the dispute-resolution and limitation-of-liability sections, which determine who bears what when something goes wrong.\n\n## Acceptance\n\nYou accept these terms when you complete registration or sign in. We keep improving the product, so features may be added, changed, or retired; for changes that affect entitlements you have already paid for, we will give you advance notice.\n\n## Your account\n\nYou are responsible for what happens under your account and must keep your credentials safe. If you notice anything unusual, change your password and contact us immediately.\n\nAccounts may be suspended for impersonating someone else, abusing the API, circumventing payment, or any unlawful activity.\n\n> **Note**: Fill in before deploying — if your business has rules about minimum age, number of accounts, or transfer of ownership, state them here.\n\n## Acceptable use\n\nYou may not use this service to:\n\n- Disrupt or attempt to break the availability or integrity of the service\n- Access another person's data without authorization, or probe and scan for vulnerabilities\n- Upload or distribute content that is malicious or infringing\n- Request the API at rates beyond normal use through automated means\n\n## Payment and subscriptions\n\nSubscriptions renew automatically for the period you selected on the pricing page until you cancel. After cancelling, your entitlements remain for the rest of the current period and do not renew afterwards.\n\n> **Note**: Fill in before deploying — this is the most important section. State whether refunds are offered, how long the refund window is, how proration works, how trials are billed, and how price differences are handled when you upgrade or downgrade. These are business decisions the template cannot make for you.\n\nAny service level or support response commitment you make should also be stated here.\n\n## Limitation of liability\n\nThe service is provided \"as is\". To the maximum extent permitted by law we are not liable for indirect damages, loss of data, or loss of profit arising from use of the service.\n\n> **Note**: Fill in before deploying — if your jurisdiction allows a cap on liability, state the amount or how it is calculated here. Left blank, this section does very little.\n\n## Termination and disputes\n\nYou may stop using the service at any time and delete your account from the Security page. We will terminate service for serious violations of these terms, with advance notice where possible.\n\n> **Note**: Fill in before deploying — state the governing law and venue, and whether you accept arbitration. This section determines where a dispute is heard and under whose law, so it must be confirmed by you or your counsel.\n\nContact us: `<fill in contact email before deploying>`",
    "_meta": {
      "filePath": "terms.md",
      "fileName": "terms.md",
      "directory": ".",
      "extension": "md",
      "path": "terms"
    }
  },
  {
    "title": "服务条款",
    "locale": "zh",
    "content": "使用本服务即表示你已阅读并同意以下条款。\n\n> **注意事项**：本文档是**模板占位内容**，不构成法律意见。凡标注「部署前填写」的条目都必须按你的实际业务替换后才能对外发布。尤其是争议解决与责任限制两节，它们决定了发生纠纷时谁承担什么后果。\n\n## 服务的接受\n\n你在完成注册或登录时即接受本条款。我们会持续改进产品，因此可能新增、调整或下线部分功能；对影响你已购买权益的变更，我们会提前告知。\n\n## 账号\n\n你需要对账号下发生的行为负责，并妥善保管登录凭据。发现账号异常时请立即修改密码并联系我们。\n\n以下行为会导致账号被停用：冒充他人、滥用接口、规避付费、或实施任何违法行为。\n\n> **注意事项**：部署前填写——如果你的业务对注册年龄、账号数量或转让有限制，在此补上具体规则。\n\n## 可接受使用\n\n你不得利用本服务实施以下行为：\n\n- 干扰或试图破坏服务的可用性与完整性\n- 未经授权访问他人数据，或探查、扫描系统漏洞\n- 上传、传播含有恶意代码或侵权的内容\n- 以自动化手段超出正常频率地请求接口\n\n## 付费与订阅\n\n订阅按你在定价页选择的周期自动续费，直到你主动取消。取消后当前周期内权益仍然有效，到期后不再续费。\n\n> **注意事项**：部署前填写——本节最关键。写明是否提供退款、退款窗口多长、按比例折算规则、试用期如何计费，以及升级 / 降级时差价如何处理。这些是业务决策，模板无法替你决定。\n\n权益随附的服务水平、支持响应时效如有承诺，也应在此说明。\n\n## 责任限制\n\n本服务按「现状」提供。在法律允许的最大范围内，对于因使用本服务导致的间接损失、数据丢失或利润损失，我们不承担责任。\n\n> **注意事项**：部署前填写——如果你所在的司法辖区允许约定赔偿上限，在此写明上限金额或计算方式。留空会让这一节几乎没有实际作用。\n\n## 终止与争议\n\n你可以随时停止使用并在「安全」页删除账号。我们会在你严重违反本条款时终止服务，并在可能的情况下提前通知。\n\n> **注意事项**：部署前填写——写明管辖法律、争议解决地，以及是否接受仲裁。这一节直接决定纠纷在哪里、按谁的法律审理，必须由你或你的法务确认后填写。\n\n联系我们：`<部署前填写联系邮箱>`",
    "_meta": {
      "filePath": "terms.zh.md",
      "fileName": "terms.zh.md",
      "directory": ".",
      "extension": "md",
      "path": "terms.zh"
    }
  }
]