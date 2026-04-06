import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import { getUserId, getUserEmail } from './auth'
import {
  listProjects,
  getProject,
  getProjectMeta,
  createProject,
  saveProject,
  renameProject,
  deleteProject,
  VersionConflictError,
} from './projects'
import {
  activatePendingShares,
  listSharedProjects,
  getShareRef,
  shareProject,
  revokeShare,
  listShares,
} from './shares'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'

// ── Response helpers ───────────────────────────────────────────────────────────

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function err(statusCode: number, code: string, message: string): APIGatewayProxyResultV2 {
  return json(statusCode, { error: code, message })
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method
  const path = event.requestContext.http.path

  // Health check — unauthenticated
  if (method === 'GET' && path === '/v1/health') {
    return json(200, { status: 'ok' })
  }

  let userId: string
  let userEmail: string
  try {
    userId = getUserId(event)
    userEmail = getUserEmail(event)
  } catch {
    return err(401, 'UNAUTHORIZED', 'Missing or invalid authorization')
  }

  try {
    // ── GET /v1/projects ───────────────────────────────────────────────────────
    if (method === 'GET' && path === '/v1/projects') {
      // Activate any pending shares for this user (idempotent, runs on every list)
      await activatePendingShares(userId, userEmail)

      // Fetch owned projects and shared project refs in parallel
      const [ownedProjects, shareRefs] = await Promise.all([
        listProjects(userId),
        listSharedProjects(userId),
      ])

      // Fetch metadata for each shared project from the owner's partition
      const sharedProjects = await Promise.all(
        shareRefs.map(async ref => {
          const meta = await getProjectMeta(ref.ownerUserId, ref.projectId)
          if (!meta) return null
          return {
            ...meta,
            isShared: true,
            sharedByEmail: ref.sharedByEmail,
            ownerUserId: ref.ownerUserId,
          }
        })
      )

      const projects = [
        ...ownedProjects,
        ...sharedProjects.filter(Boolean),
      ]

      return json(200, { projects })
    }

    // ── POST /v1/projects ──────────────────────────────────────────────────────
    if (method === 'POST' && path === '/v1/projects') {
      const body = parseBody(event.body)
      if (!body) return err(400, 'VALIDATION_ERROR', 'Request body is required')

      const project = body as { id?: string; name?: string; createdAt?: number; [key: string]: unknown }
      if (!project.id || !project.name) {
        return err(400, 'VALIDATION_ERROR', 'Project must have id and name')
      }

      try {
        await createProject(userId, project as Parameters<typeof createProject>[1])
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
          return err(409, 'CONFLICT', 'A project with this ID already exists')
        }
        throw e
      }

      return json(201, { projectId: project.id })
    }

    // ── Routes with /{id}/shares/{email} ──────────────────────────────────────
    const sharesEmailMatch = path.match(/^\/v1\/projects\/([^/]+)\/shares\/(.+)$/)
    if (sharesEmailMatch) {
      const projectId = sharesEmailMatch[1]
      const recipientEmail = decodeURIComponent(sharesEmailMatch[2])

      // DELETE /v1/projects/{id}/shares/{email}
      if (method === 'DELETE') {
        // Owner check first; fall back to collaborator
        const shareRef = await getShareRef(userId, projectId)
        const ownerUserId = shareRef ? shareRef.ownerUserId : userId

        const ok = await revokeShare(ownerUserId, projectId, recipientEmail, userId, userEmail)
        if (!ok) return err(403, 'FORBIDDEN', 'You do not have permission to revoke this share')
        return { statusCode: 204, body: '' }
      }

      return err(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
    }

    // ── Routes with /{id}/shares ───────────────────────────────────────────────
    const sharesMatch = path.match(/^\/v1\/projects\/([^/]+)\/shares$/)
    if (sharesMatch) {
      const projectId = sharesMatch[1]

      // Resolve owner — collaborators get ownerUserId from their SHARE_REF
      const shareRef = await getShareRef(userId, projectId)
      const ownerUserId = shareRef ? shareRef.ownerUserId : userId

      // Verify the user has access to this project at all
      const meta = await getProjectMeta(ownerUserId, projectId)
      if (!meta) return err(404, 'NOT_FOUND', 'Project not found')

      // GET /v1/projects/{id}/shares
      if (method === 'GET') {
        const shares = await listShares(ownerUserId, projectId)
        return json(200, { shares })
      }

      // POST /v1/projects/{id}/shares
      if (method === 'POST') {
        const body = parseBody(event.body)
        if (!body) return err(400, 'VALIDATION_ERROR', 'Request body is required')

        const { email, role } = body as { email?: string; role?: string }
        if (!email || typeof email !== 'string') {
          return err(400, 'VALIDATION_ERROR', 'email is required')
        }
        if (email.toLowerCase() === userEmail.toLowerCase()) {
          return err(400, 'VALIDATION_ERROR', 'You cannot share a project with yourself')
        }

        const shareRole = role === 'view' ? 'view' : 'edit'
        const status = await shareProject(ownerUserId, userEmail, projectId, email.toLowerCase(), shareRole)
        return json(201, { status })
      }

      return err(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
    }

    // ── Routes with /{id} ──────────────────────────────────────────────────────
    const idMatch = path.match(/^\/v1\/projects\/([^/]+)$/)
    if (!idMatch) {
      return err(404, 'NOT_FOUND', 'Route not found')
    }
    const projectId = idMatch[1]

    // GET /v1/projects/{id}
    if (method === 'GET') {
      // Check ownership first, then fall back to collaborator access
      let project = await getProject(userId, projectId)

      if (!project) {
        const shareRef = await getShareRef(userId, projectId)
        if (!shareRef) return err(404, 'NOT_FOUND', 'Project not found')
        project = await getProject(shareRef.ownerUserId, projectId)
        if (!project) return err(404, 'NOT_FOUND', 'Project not found')
      }

      return json(200, project)
    }

    // PUT /v1/projects/{id}  — full replace (owner or collaborator)
    if (method === 'PUT') {
      const body = parseBody(event.body)
      if (!body) return err(400, 'VALIDATION_ERROR', 'Request body is required')

      const expectedVersion = typeof body['expectedVersion'] === 'number'
        ? (body['expectedVersion'] as number)
        : undefined

      // Determine which partition to write to
      let ownerUserId = userId
      const ownedCheck = await getProjectMeta(userId, projectId)
      if (!ownedCheck) {
        const shareRef = await getShareRef(userId, projectId)
        if (!shareRef) return err(404, 'NOT_FOUND', 'Project not found')
        ownerUserId = shareRef.ownerUserId
      }

      try {
        const result = await saveProject(
          ownerUserId,
          projectId,
          body as Parameters<typeof saveProject>[2],
          expectedVersion
        )
        return json(200, result)
      } catch (e) {
        if (e instanceof VersionConflictError) {
          return err(409, 'VERSION_CONFLICT', 'Project was modified by another client — reload to get the latest version')
        }
        if (e instanceof ConditionalCheckFailedException) {
          return err(404, 'NOT_FOUND', 'Project not found')
        }
        throw e
      }
    }

    // PATCH /v1/projects/{id}  — rename only (owner only)
    if (method === 'PATCH') {
      const body = parseBody(event.body)
      if (!body) return err(400, 'VALIDATION_ERROR', 'Request body is required')

      const { name } = body as { name?: string }
      if (!name || typeof name !== 'string' || !name.trim()) {
        return err(400, 'VALIDATION_ERROR', 'name is required')
      }

      let updatedAt: number
      try {
        updatedAt = await renameProject(userId, projectId, name.trim())
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
          return err(404, 'NOT_FOUND', 'Project not found')
        }
        throw e
      }

      return json(200, { updatedAt })
    }

    // DELETE /v1/projects/{id}  — owner only
    if (method === 'DELETE') {
      try {
        await deleteProject(userId, projectId)
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
          return err(404, 'NOT_FOUND', 'Project not found')
        }
        throw e
      }

      return { statusCode: 204, body: '' }
    }

    return err(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
  } catch (e) {
    console.error('Unhandled error:', e)
    return err(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}

function parseBody(body: string | null | undefined): Record<string, unknown> | null {
  if (!body) return null
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    return null
  }
}
