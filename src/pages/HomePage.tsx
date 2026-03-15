import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { Project } from '../types'
import Modal from '../components/ui/Modal'

// ── New Project Modal ──────────────────────────────────────────────────────────

interface NewProjectModalProps {
  onClose: () => void
  onCreate: (project: Project) => void
}

function NewProjectModal({ onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [widthFt, setWidthFt] = useState(40)
  const [heightFt, setHeightFt] = useState(60)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const now = Date.now()
    const project: Project = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      room: { widthFt, heightFt, pixelsPerFoot: 20 },
      tables: [],
      guests: [],
      shapes: [],
      texts: [],
    }
    await db.projects.add(project)
    onCreate(project)
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
            disabled={!name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Rename Modal ───────────────────────────────────────────────────────────────

interface RenameModalProps {
  project: Project
  onClose: () => void
  onRename: (id: string, name: string) => void
}

function RenameModal({ project, onClose, onRename }: RenameModalProps) {
  const [name, setName] = useState(project.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || name.trim() === project.name) { onClose(); return }
    await db.projects.update(project.id, { name: name.trim(), updatedAt: Date.now() })
    onRename(project.id, name.trim())
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
            disabled={!name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Project Card ───────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}

function ProjectCard({ project, onOpen, onRename, onDelete }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
      {/* Menu button */}
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

      {/* Card content */}
      <div>
        <h3 className="pr-6 text-base font-semibold text-slate-800">{project.name}</h3>
        <p className="mt-0.5 text-xs text-slate-400">Created {formatted}</p>
      </div>
      <div className="flex gap-4 text-sm text-slate-500">
        <span>
          <span className="font-medium text-slate-700">{project.tables.length}</span> table{project.tables.length !== 1 ? 's' : ''}
        </span>
        <span>
          <span className="font-medium text-slate-700">{project.guests.length}</span> guest{project.guests.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="text-xs text-slate-400">
        {project.room.widthFt} × {project.room.heightFt} ft room
      </div>
    </div>
  )
}

// ── Delete Confirmation ────────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  project: Project
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

// ── Home Page ──────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'new' }
  | { type: 'rename'; project: Project }
  | { type: 'delete'; project: Project }

export default function HomePage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  useEffect(() => {
    db.projects.orderBy('createdAt').reverse().toArray().then((p) => {
      setProjects(p)
      setLoading(false)
    })
  }, [])

  const handleCreate = (project: Project) => {
    navigate(`/project/${project.id}`)
  }

  const handleRename = (id: string, name: string) => {
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name } : p))
    setModal({ type: 'none' })
  }

  const handleDelete = async (project: Project) => {
    await db.projects.delete(project.id)
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    setModal({ type: 'none' })
  }

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-8 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Seating Chart</h1>
            <p className="text-sm text-slate-400">Manage your events</p>
          </div>
          <button
            onClick={() => setModal({ type: 'new' })}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 2v12M2 8h12" strokeLinecap="round" />
            </svg>
            New Project
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-8 py-8">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : projects.length === 0 ? (
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => navigate(`/project/${project.id}`)}
                onRename={() => setModal({ type: 'rename', project })}
                onDelete={() => setModal({ type: 'delete', project })}
              />
            ))}
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
