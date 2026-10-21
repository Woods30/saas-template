import { IconBrandGoogle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { m } from '@/locale/paraglide/messages.js'

interface SocialAuthButtonsProps {
  /** 服务端是否配置了 Google OAuth；客户端读不到服务端 env，由路由 `beforeLoad` 传入。 */
  googleEnabled: boolean
  onGoogleClick: () => void
  /** 提交中一并禁用，避免并发发起两种登录。 */
  disabled?: boolean
}

/** 社交登录按钮组；未配置时整体不渲染，不占位也不显示禁用按钮。 */
export function SocialAuthButtons({
  googleEnabled,
  onGoogleClick,
  disabled = false,
}: SocialAuthButtonsProps) {
  if (!googleEnabled) return null

  return (
    <div className="space-y-4">
      <div className="relative text-center">
        <span className="relative z-10 bg-card px-2 text-xs text-muted-foreground">
          {m.auth_social_or()}
        </span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled}
        onClick={onGoogleClick}
      >
        <IconBrandGoogle size={16} aria-hidden />
        {m.auth_social_google()}
      </Button>
    </div>
  )
}
