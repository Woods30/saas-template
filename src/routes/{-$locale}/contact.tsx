import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/{-$locale}/contact')({
  component: ContactPage,
})

function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">联系我们</h1>
      <ContactForm />
    </main>
  )
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error'

function ContactForm() {
  const [status, setStatus] = useState<FormStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          fromEmail: String(form.get('email') ?? ''),
          subject: String(form.get('subject') ?? ''),
          message: String(form.get('message') ?? ''),
        }),
      })
      if (res.ok) {
        setStatus('success')
        e.currentTarget.reset()
      } else if (res.status === 429) {
        setStatus('error')
        setErrorMsg('请求过于频繁，请稍后再试。')
      } else {
        setStatus('error')
        setErrorMsg('提交失败')
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? (err.message.split('\n')[0] ?? '提交失败') : '提交失败')
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        name="name"
        placeholder="姓名"
        required
        maxLength={100}
        className="rounded border px-3 py-2"
      />
      <input
        name="email"
        type="email"
        placeholder="邮箱"
        required
        maxLength={200}
        className="rounded border px-3 py-2"
      />
      <input
        name="subject"
        placeholder="主题"
        required
        maxLength={200}
        className="rounded border px-3 py-2"
      />
      <textarea
        name="message"
        placeholder="消息（10-5000 字）"
        rows={6}
        required
        minLength={10}
        maxLength={5000}
        className="rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded bg-blue-500 px-4 py-2 text-white disabled:opacity-50"
      >
        {status === 'submitting' ? '发送中…' : '发送'}
      </button>
      {status === 'success' && <p className="text-green-600">已发送，我们会尽快回复您。</p>}
      {status === 'error' && <p className="text-red-600">发送失败：{errorMsg}</p>}
    </form>
  )
}
