import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type ProjectMeta } from '../lib/api'
import type { Project } from '../types'
import Modal from '../components/ui/Modal'
import { logout } from '../lib/auth'

// ── New Project Modal ──────────────────────────────────────────────────────────

interface NewProjectModalProps {
  onClose: () => void
  onCreate: (project: Project) => void
}

function NewProjectModal({ onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [widthFt, setWidthFt] = useState(40)
  const [heightFt, setHeightFt] = useState(60)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    const now = Date.now()
    const project: Project = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      version: 1,
      room: { widthFt, heightFt, pixelsPerFoot: 20 },
      tables: [],
      guests: [],
      shapes: [],
      texts: [],
    }

    try {
      await api.createProject(project)
      onCreate(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setSaving(false)
    }
  }

  return (
    <Modal title="New Project" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Project name</label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Smith Wedding"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">Room width (ft)</label>
            <input
              type="number"
              min={10}
              max={500}
              value={widthFt}
              onChange={(e) => setWidthFt(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">Room height (ft)</label>
            <input
              type="number"
              min={10}
              max={500}
              value={heightFt}
              onChange={(e) => setHeightFt(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Rename Modal ───────────────────────────────────────────────────────────────

interface RenameModalProps {
  project: ProjectMeta
  onClose: () => void
  onRename: (id: string, name: string) => void
}

function RenameModal({ project, onClose, onRename }: RenameModalProps) {
  const [name, setName] = useState(project.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || name.trim() === project.name) { onClose(); return }
    setSaving(true)
    setError(null)

    try {
      await api.patchProject(project.projectId, name.trim())
      onRename(project.projectId, name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename project')
      setSaving(false)
    }
  }

  return (
    <Modal title="Rename Project" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Project name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Project Card ───────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: ProjectMeta
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}

function ProjectCard({ project, onOpen, onRename, onDelete }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isShared = project.isShared === true

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const formatted = new Date(project.createdAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
    >
      {/* Menu button — only for owned projects */}
      {!isShared && (
        <div
          ref={menuRef}
          className="absolute right-3 top-3"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Options"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-10 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button
                onClick={() => { setMenuOpen(false); onRename() }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Rename
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete() }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Shared badge */}
      {isShared && (
        <div className="absolute right-3 top-3">
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
            Shared
          </span>
        </div>
      )}

      {/* Card content */}
      <div>
        <h3 className="pr-16 text-base font-semibold text-slate-800">{project.name}</h3>
        {isShared ? (
          <p className="mt-0.5 text-xs text-slate-400">Shared by {project.sharedByEmail}</p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-400">Created {formatted}</p>
        )}
      </div>
      <div className="flex gap-4 text-sm text-slate-500">
        <span>
          <span className="font-medium text-slate-700">{project.tableCount}</span> table{project.tableCount !== 1 ? 's' : ''}
        </span>
        <span>
          <span className="font-medium text-slate-700">{project.guestCount}</span> guest{project.guestCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="text-xs text-slate-400">
        {project.roomWidthFt} × {project.roomHeightFt} ft room
      </div>
    </div>
  )
}

// ── Delete Confirmation ────────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  project: ProjectMeta
  onClose: () => void
  onConfirm: () => void
}

function DeleteConfirmModal({ project, onClose, onConfirm }: DeleteConfirmModalProps) {
  return (
    <Modal title="Delete Project" onClose={onClose}>
      <p className="text-sm text-slate-600">
        Are you sure you want to delete <span className="font-semibold text-slate-800">"{project.name}"</span>?
        This cannot be undone.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Delete
        </button>
      </div>
    </Modal>
  )
}

// ── Section heading ────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </h2>
  )
}

// ── Home Page ──────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'new' }
  | { type: 'rename'; project: ProjectMeta }
  | { type: 'delete'; project: ProjectMeta }

export default function HomePage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  useEffect(() => {
    api.listProjects()
      .then((p) => {
        setProjects(p.sort((a, b) => b.createdAt - a.createdAt))
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load projects')
        setLoading(false)
      })
  }, [])

  const handleCreate = (project: Project) => {
    navigate(`/project/${project.id}`)
  }

  const handleRename = (id: string, name: string) => {
    setProjects((prev) => prev.map((p) => p.projectId === id ? { ...p, name } : p))
    setModal({ type: 'none' })
  }

  const handleDelete = async (project: ProjectMeta) => {
    try {
      await api.deleteProject(project.projectId)
      setProjects((prev) => prev.filter((p) => p.projectId !== project.projectId))
    } catch (err) {
      console.error('Delete failed', err)
    }
    setModal({ type: 'none' })
  }

  const ownedProjects = projects.filter((p) => !p.isShared)
  const sharedProjects = projects.filter((p) => p.isShared)
  const isEmpty = ownedProjects.length === 0 && sharedProjects.length === 0

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-8 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Seating Chart</h1>
            <p className="text-sm text-slate-400">Manage your events</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setModal({ type: 'new' })}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 2v12M2 8h12" strokeLinecap="round" />
              </svg>
              New Project
            </button>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-8 py-8">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-7 w-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M12 8v8M8 12h8" strokeLinecap="round" />
              </svg>
            </div>
            <p className="font-medium text-slate-700">No projects yet</p>
            <p className="mt-1 text-sm text-slate-400">Create your first seating chart to get started.</p>
            <button
              onClick={() => setModal({ type: 'new' })}
              className="mt-5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              New Project
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {/* My Projects */}
            {ownedProjects.length > 0 && (
              <section>
                {sharedProjects.length > 0 && <SectionHeading>My Projects</SectionHeading>}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ownedProjects.map((project) => (
                    <ProjectCard
                      key={project.projectId}
                      project={project}
                      onOpen={() => navigate(`/project/${project.projectId}`)}
                      onRename={() => setModal({ type: 'rename', project })}
                      onDelete={() => setModal({ type: 'delete', project })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Shared With Me */}
            {sharedProjects.length > 0 && (
              <section>
                <SectionHeading>Shared With Me</SectionHeading>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sharedProjects.map((project) => (
                    <ProjectCard
                      key={project.projectId}
                      project={project}
                      onOpen={() => navigate(`/project/${project.projectId}`, { state: { isShared: true } })}
                      onRename={() => {}}
                      onDelete={() => {}}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {modal.type === 'new' && (
        <NewProjectModal
          onClose={() => setModal({ type: 'none' })}
          onCreate={handleCreate}
        />
      )}
      {modal.type === 'rename' && (
        <RenameModal
          project={modal.project}
          onClose={() => setModal({ type: 'none' })}
          onRename={handleRename}
        />
      )}
      {modal.type === 'delete' && (
        <DeleteConfirmModal
          project={modal.project}
          onClose={() => setModal({ type: 'none' })}
          onConfirm={() => handleDelete(modal.project)}
        />
      )}
    </div>
  )
}
