import { IconCheck, IconPlayerPause, IconPlayerPlay, IconRefresh } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { m } from '@/locale/paraglide/messages.js'

const STAGES = [0, 850, 1800, 3000] as const
const CYCLE_MS = 6000

export function SourceProductDemo({
  replayKey,
  onMotionChange,
}: {
  replayKey: number
  onMotionChange: (running: boolean) => void
}) {
  const [stage, setStage] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [visible, setVisible] = useState(true)
  const [replay, setReplay] = useState(0)
  const elapsed = useRef(0)
  const previousReplay = useRef({ external: replayKey, local: replay })

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const preferenceChanged = () => setReduced(media.matches)
    const visibilityChanged = () => setVisible(!document.hidden)
    preferenceChanged()
    visibilityChanged()
    media.addEventListener('change', preferenceChanged)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      media.removeEventListener('change', preferenceChanged)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [])

  useEffect(() => {
    // 清理旧时间线之后再重置，避免旧进度覆盖重播起点。
    if (previousReplay.current.external !== replayKey || previousReplay.current.local !== replay) {
      previousReplay.current = { external: replayKey, local: replay }
      elapsed.current = 0
      setPaused(false)
      setStage(0)
    }
    if (reduced) {
      elapsed.current = 0
      setStage(3)
      return
    }
    if (paused || !visible) return
    const started = Date.now()
    const initial = elapsed.current
    let timer: ReturnType<typeof setTimeout>
    function update() {
      const position = (initial + Date.now() - started) % CYCLE_MS
      const current = STAGES.filter((time) => position >= time).length - 1
      setStage(current)
      const next = STAGES[current + 1] ?? CYCLE_MS
      timer = setTimeout(update, next - position)
    }
    update()
    return () => {
      clearTimeout(timer)
      elapsed.current = (initial + Date.now() - started) % CYCLE_MS
    }
  }, [paused, reduced, visible, replayKey, replay])

  useEffect(() => {
    onMotionChange(!paused && !reduced && visible)
  }, [paused, reduced, visible, onMotionChange])

  const customized = stage >= 1
  return (
    <figure aria-label={m.home_demo_figure()} className="min-w-0" data-stage={stage}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{m.home_demo_heading()}</span>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={reduced}
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <IconPlayerPlay aria-hidden /> : <IconPlayerPause aria-hidden />}
            {paused ? m.home_motion_resume() : m.home_motion_pause()}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setReplay((value) => value + 1)}>
            <IconRefresh aria-hidden />
            {m.home_demo_replay()}
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="flex h-10 items-center gap-1.5 border-b border-border px-4 text-[10px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-foreground/20" />
          <span className="size-1.5 rounded-full bg-foreground/20" />
          <span className="size-1.5 rounded-full bg-foreground/20" />
          <span className="ml-3">{m.home_demo_label()}</span>
        </div>
        <div className="grid min-h-80 grid-cols-[0.95fr_1.05fr] sm:min-h-88">
          <div className="min-w-0 border-r border-border bg-muted/50 px-3 py-6 sm:px-5">
            <p className="break-all font-mono text-[9px] text-muted-foreground sm:text-[11px]">
              src/config/website.ts
            </p>
            <pre className="mt-6 whitespace-pre-wrap break-words font-mono text-[9px] leading-loose sm:text-xs">
              <code>
                {'metadata: {\n  name:\n'}
                <span
                  className={`block rounded px-1 text-primary transition-colors duration-500 motion-reduce:transition-none ${customized ? 'bg-primary/10' : ''}`}
                >{`    '${customized ? m.home_demo_brand() : 'Jerbix'}',`}</span>
                {'},\ndocs: { enabled: true },\npayment: { enabled: true }'}
              </code>
            </pre>
            <p className="mt-6 border-t border-border pt-4 text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
              {m.home_demo_source_note()}
            </p>
          </div>
          <div className="flex min-w-0 flex-col px-3 py-6 sm:px-4">
            <div
              className={`min-h-60 overflow-hidden rounded-lg border border-border transition-transform duration-700 motion-reduce:transform-none motion-reduce:transition-none ${stage >= 2 ? '-translate-y-1' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 text-[9px]">
                <b>{customized ? m.home_demo_brand() : 'Jerbix'}</b>
                <span className="text-muted-foreground">{m.home_demo_docs()}　EN</span>
              </div>
              <div className="px-3 py-6 sm:px-4">
                <p className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
                  {stage >= 2 ? m.home_demo_custom_title() : m.home_demo_initial_title()}
                </p>
                <p className="mt-3 min-h-8 text-[10px] text-muted-foreground">
                  {stage >= 2
                    ? m.home_demo_custom_description()
                    : m.home_demo_initial_description()}
                </p>
                <span className="mt-4 inline-block rounded bg-primary px-3 py-1.5 text-[10px] text-primary-foreground">
                  {m.home_demo_cta()}
                </span>
                <div className="mt-5 flex flex-wrap gap-2 text-[9px] text-muted-foreground">
                  <span>{m.home_demo_auth()}</span>
                  <span>{m.home_demo_payment()}</span>
                  <span>{m.home_demo_languages()}</span>
                </div>
              </div>
            </div>
            <p className="mt-auto flex items-start gap-1.5 pt-5 text-[10px] text-muted-foreground">
              {stage >= 3 && <IconCheck className="shrink-0 text-success" size={14} aria-hidden />}
              {stage >= 3 ? m.home_demo_deploy_ready() : m.home_demo_deploy_pending()}
            </p>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-xs text-muted-foreground">
        {m.home_demo_caption()}
      </figcaption>
    </figure>
  )
}
