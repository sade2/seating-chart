import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { getCurrentUserEmail } from '../lib/auth'
import type { ProjectShare } from '../types'
import Modal from './ui/Modal'

interface ShareModalProps {
  projectId: string
  /** True when the current user owns this project (not a collaborator) */
  isOwner: boolean
  onClose: () => void
}

export default function ShareModal({ projectId, isOwner, onClose }: ShareModalProps) {
  const [shares, setShares] = useState<ProjectShare[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareSuccess, setShareSuccess] = useState<'active' | 'pending' | null>(null)

  const [revokingEmail, setRevokingEmail] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const currentUserEmail = getCurrentUserEmail()

  useEffect(() => {
    loadShares()
  }, [projectId])

  async function loadShares() {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await api.listShares(projectId)
      setShares(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load collaborators')
    } finally {
      setLoading(false)
    }
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    setSharing(true)
    setShareError(null)
    setShareSuccess(null)

    try {
      const { status } = await api.shareProject(projectId, trimmed)
      setShareSuccess(status)
      setEmail('')
      await loadShares()
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to share project')
    } finally {
      setSharing(false)
      inputRef.current?.focus()
    }
  }

  async function handleRevoke(recipientEmail: string) {
    setRevokingEmail(recipientEmail)
    try {
      await api.revokeShare(projectId, recipientEmail)
      setShares((prev) => prev.filter((s) => s.email !== recipientEmail))
    } catch (err) {
      console.error('Revoke failed', err)
    } finally {
      setRevokingEmail(null)
    }
  }

  function canRevoke(share: ProjectShare): boolean {
    if (isOwner) return true
    return share.email.toLowerCase() === currentUserEmail?.toLowerCase()
  }

  return (
    <Modal title="Share Project" onClose={onClose} wide>
      <div className="space-y-6">
        {/* Add collaborator form */}
        <form onSubmit={handleShare} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Invite by email
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setShareError(null); setShareSuccess(null) }}
              placeholder="collaborator@example.com"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              disabled={sharing}
            />
            <button
              type="submit"
              disabled={!email.trim() || sharing}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {sharing ? 'Sharing…' : 'Share'}
            </button>
          </div>

          {shareError && (
            <p className="text-sm text-red-600">{shareError}</p>
          )}
          {shareSuccess === 'active' && (
            <p className="text-sm text-green-600">Collaborator added successfully.</p>
          )}
          {shareSuccess === 'pending' && (
            <p className="text-sm text-amber-600">
              Invitation sent. It will activate when they create an account.
            </p>
          )}
        </form>

        {/* Collaborator list */}
        <div>
          <p className="mb-3 text-sm font-medium text-slate-700">
            {loading ? 'Loading collaborators…' : shares.length === 0 ? 'No collaborators yet.' : 'Collaborators'}
          </p>

          {loadError && (
            <p className="text-sm text-red-600">{loadError}</p>
          )}

          {!loading && shares.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {shares.map((share) => (
                <li key={share.email} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{share.email}</p>
                    {share.status === 'pending' && (
                      <p className="mt-0.5 text-xs text-amber-600">Pending — invite activates on sign-up</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* Status badge */}
                    {share.status === 'pending' ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                        Pending
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                        Active
                      </span>
                    )}

                    {/* Role badge */}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 capitalize">
                      {share.role}
                    </span>

                    {/* Revoke button */}
                    {canRevoke(share) && (
                      <button
                        onClick={() => handleRevoke(share.email)}
                        disabled={revokingEmail === share.email}
                        className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                      >
                        {revokingEmail === share.email ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
