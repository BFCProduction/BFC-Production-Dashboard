import { useEffect, useRef, useState } from 'react'
import { Copy, Link as LinkIcon, FileText, Paperclip, Plus, Check, Upload, Download } from 'lucide-react'
import { useAuth } from '../context/authState'
import { loadClipboard, postClipboardText, postClipboardFile } from '../lib/dashboardData'
import type { ClipboardItem } from '../types'

function relativeExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600_000)
  return h >= 1 ? `${h}h left` : `${Math.floor(ms / 60_000)}m left`
}

export function Clipboard() {
  const { user } = useAuth()
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function refresh() {
    loadClipboard().then(setItems).catch(e => setError(e.message))
  }
  useEffect(refresh, [])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (file.size > 26214400) { setError('File is over the 25MB limit.'); return }
    setUploading(true); setError(null)
    try {
      await postClipboardFile(file, user.name, user.avatar_url)
      refresh()
    } catch (err) { setError((err as Error).message) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function post() {
    const value = draft.trim()
    if (!value || !user) return
    const isLink = /^https?:\/\//i.test(value)
    await postClipboardText(
      isLink ? value.replace(/^https?:\/\//, '').slice(0, 40) : value.slice(0, 40),
      value, isLink ? 'link' : 'text', user.name, user.avatar_url,
    )
    setDraft(''); setAdding(false); refresh()
  }

  async function copy(item: ClipboardItem) {
    await navigator.clipboard.writeText(item.body ?? item.fileUrl ?? '')
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 1200)
  }

  return (
    <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 fade-in">
      <header className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-gray-900">Community Clipboard</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 disabled:opacity-50">
            <Upload size={13} /> {uploading ? 'Uploading…' : 'File'}
          </button>
          <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1">
            <Plus size={13} /> Text
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
        </div>
      </header>
      <p className="text-[11px] text-gray-400 mb-3">Up to 5 items · auto-clears after 48h</p>

      {adding && (
        <div className="mb-3 flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void post() }}
            placeholder="Paste a link or text…"
            className="flex-1 rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={() => void post()} className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 text-sm font-medium">Post</button>
        </div>
      )}

      {error && <p className="text-sm text-gray-400">Clipboard isn't connected yet ({error}).</p>}

      <div className="flex flex-col gap-2">
        {items.length === 0 && !error && <p className="text-[11px] text-gray-400">Empty — drop the first thing.</p>}
        {items.map(item => {
          const Icon = item.kind === 'link' ? LinkIcon : item.kind === 'file' ? Paperclip : FileText
          return (
            <div key={item.id} className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 p-2.5">
              <Icon size={15} className="text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                {item.kind === 'link'
                  ? <a href={item.body ?? '#'} target="_blank" rel="noreferrer" className="block truncate text-sm text-blue-600 hover:underline">{item.label}</a>
                  : item.kind === 'file'
                    ? <a href={item.fileUrl ?? '#'} target="_blank" rel="noreferrer" download={item.fileName ?? undefined} className="block truncate text-sm text-blue-600 hover:underline">{item.label}</a>
                    : <div className="truncate text-sm text-gray-800">{item.label}</div>}
                <div className="text-[10px] text-gray-400">{item.postedByName} · {relativeExpiry(item.expiresAt)}</div>
              </div>
              {item.kind === 'file' && (
                <a href={item.fileUrl ?? '#'} target="_blank" rel="noreferrer" download={item.fileName ?? undefined} className="p-1.5 rounded-lg hover:bg-gray-200 shrink-0"><Download size={14} className="text-gray-400" /></a>
              )}
              <button onClick={() => void copy(item)} className="p-1.5 rounded-lg hover:bg-gray-200 shrink-0">
                {copiedId === item.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-gray-400" />}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
