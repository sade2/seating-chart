// ── API client — typed fetch wrapper with auto Bearer token ────────────────────

import { getAccessToken } from './auth'
import type { Project } from '../types'

export interface ProjectMeta {
  projectId: string
  name: string
  createdAt: number
  updatedAt: number
  roomWidthFt: number
  roomHeightFt: number
  tableCount: number
  guestCount: number
}

// ── Base fetch ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = (import.meta.env.VITE_API_URL as string).replace(/\/$/, '')
  const token = await getAccessToken()

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (res.status === 204) return undefined as T

  const body = await res.json() as unknown

  if (!res.ok) {
    const errBody = body as { error?: string; message?: string }
    throw new ApiError(res.status, errBody.error ?? 'UNKNOWN', errBody.message ?? res.statusText)
  }

  return body as T
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// ── API methods ────────────────────────────────────────────────────────────────

export const api = {
  async listProjects(): Promise<ProjectMeta[]> {
    const res = await apiFetch<{ projects: ProjectMeta[] }>('/projects')
    return res.projects
  },

  async getProject(projectId: string): Promise<Project> {
    return apiFetch<Project>(`/projects/${projectId}`)
  },

  async createProject(project: Project): Promise<{ projectId: string }> {
    return apiFetch<{ projectId: string }>('/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    })
  },

  async saveProject(projectId: string, project: Project): Promise<{ updatedAt: number }> {
    return apiFetch<{ updatedAt: number }>(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    })
  },

  async patchProject(projectId: string, name: string): Promise<{ updatedAt: number }> {
    return apiFetch<{ updatedAt: number }>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  },

  async deleteProject(projectId: string): Promise<void> {
    return apiFetch<void>(`/projects/${projectId}`, { method: 'DELETE' })
  },
}
