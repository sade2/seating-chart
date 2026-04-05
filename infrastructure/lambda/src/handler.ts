import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda'
import { getUserId } from './auth'
import {
  listProjects,
  getProject,
  createProject,
  saveProject,
  renameProject,
  deleteProject,
} from './projects'
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
  try {
    userId = getUserId(event)
  } catch {
    return err(401, 'UNAUTHORIZED', 'Missing or invalid authorization')
  }

  try {
    // GET /v1/projects
    if (method === 'GET' && path === '/v1/projects') {
      const projects = await listProjects(userId)
      return json(200, { projects })
    }

    // POST /v1/projects
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

    // Routes with /{id}
    const idMatch = path.match(/^\/v1\/projects\/([^/]+)$/)
    if (!idMatch) {
      return err(404, 'NOT_FOUND', 'Route not found')
    }
    const projectId = idMatch[1]

    // GET /v1/projects/{id}
    if (method === 'GET') {
      const project = await getProject(userId, projectId)
      if (!project) return err(404, 'NOT_FOUND', 'Project not found')
      return json(200, project)
    }

    // PUT /v1/projects/{id}  — full replace
    if (method === 'PUT') {
      const body = parseBody(event.body)
      if (!body) return err(400, 'VALIDATION_ERROR', 'Request body is required')

      let updatedAt: number
      try {
        updatedAt = await saveProject(userId, projectId, body as Parameters<typeof saveProject>[2])
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
          return err(404, 'NOT_FOUND', 'Project not found')
        }
        throw e
      }

      return json(200, { updatedAt })
    }

    // PATCH /v1/projects/{id}  — rename only
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

    // DELETE /v1/projects/{id}
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
