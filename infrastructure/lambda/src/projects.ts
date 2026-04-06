import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { ddb, TABLE_NAME } from './db'
import { pk, sk } from './auth'

// ── Types ──────────────────────────────────────────────────────────────────────

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

export class VersionConflictError extends Error {
  constructor() {
    super('Version conflict — project was modified by another client')
    this.name = 'VersionConflictError'
  }
}

// ── List Projects ──────────────────────────────────────────────────────────────

export async function listProjects(userId: string): Promise<ProjectMeta[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeNames: {
        '#name': 'name',
      },
      ExpressionAttributeValues: {
        ':pk': pk(userId),
        ':skPrefix': 'PROJECT#',
      },
      ProjectionExpression: 'projectId, #name, createdAt, updatedAt, roomWidthFt, roomHeightFt, tableCount, guestCount',
    })
  )

  return (res.Items ?? []) as ProjectMeta[]
}

// ── Get Project Metadata (list view, no projectData) ──────────────────────────

/**
 * Fetches only the metadata fields for a project — used when building the
 * shared-projects list without loading the full projectData blob.
 */
export async function getProjectMeta(
  ownerUserId: string,
  projectId: string
): Promise<ProjectMeta | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(ownerUserId), SK: sk(projectId) },
      ExpressionAttributeNames: { '#name': 'name' },
      ProjectionExpression: 'projectId, #name, createdAt, updatedAt, roomWidthFt, roomHeightFt, tableCount, guestCount',
    })
  )

  return (res.Item as ProjectMeta) ?? null
}

// ── Get Project ────────────────────────────────────────────────────────────────

/**
 * Fetches a project by owner userId and projectId.
 * Pass the authenticated user's own userId for owned projects,
 * or the ownerUserId from a SHARE_REF for collaborator access.
 */
export async function getProject(userId: string, projectId: string): Promise<object | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(userId), SK: sk(projectId) },
    })
  )

  if (!res.Item) return null

  // TODO v2: if projectData is an S3 key (starts with 's3://'), fetch from S3 instead
  const projectData = res.Item.projectData
  if (typeof projectData === 'string') {
    try {
      return JSON.parse(projectData)
    } catch {
      return null
    }
  }

  return null
}

// ── Create Project ─────────────────────────────────────────────────────────────

export async function createProject(
  userId: string,
  project: { id: string; name: string; createdAt: number; updatedAt: number; [key: string]: unknown }
): Promise<void> {
  const room = project.room as { widthFt?: number; heightFt?: number } | undefined
  const tables = (project.tables as unknown[]) ?? []
  const guests = (project.guests as unknown[]) ?? []

  // TODO v2: if JSON.stringify(project).length > 300_000, store in S3 and set projectData to key
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk(userId),
        SK: sk(project.id),
        userId,
        projectId: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        roomWidthFt: room?.widthFt ?? 0,
        roomHeightFt: room?.heightFt ?? 0,
        tableCount: tables.length,
        guestCount: guests.length,
        projectData: JSON.stringify(project),
        version: 1,
      },
      // Prevent overwriting an existing project
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  )
}

// ── Save Project (full replace) ────────────────────────────────────────────────

/**
 * Saves a full project update. Atomically increments the version counter.
 *
 * Pass ownerUserId (from a SHARE_REF) as `userId` for collaborator saves —
 * the item lives in the owner's partition regardless of who is editing.
 *
 * If `expectedVersion` is provided, the write is conditional on the current
 * version matching. Throws VersionConflictError on mismatch, or
 * ConditionalCheckFailedException (re-thrown) if the item doesn't exist.
 */
export async function saveProject(
  userId: string,
  projectId: string,
  project: { name: string; updatedAt: number; [key: string]: unknown },
  expectedVersion?: number
): Promise<{ updatedAt: number; version: number }> {
  const room = project.room as { widthFt?: number; heightFt?: number } | undefined
  const tables = (project.tables as unknown[]) ?? []
  const guests = (project.guests as unknown[]) ?? []
  const now = Date.now()

  const conditionExpression = expectedVersion !== undefined
    ? 'attribute_exists(PK) AND version = :expectedVersion'
    : 'attribute_exists(PK)'

  const expressionAttributeValues: Record<string, unknown> = {
    ':name': project.name,
    ':now': now,
    ':roomWidthFt': room?.widthFt ?? 0,
    ':roomHeightFt': room?.heightFt ?? 0,
    ':tableCount': tables.length,
    ':guestCount': guests.length,
    // TODO v2: if payload > 300KB, store in S3
    ':projectData': JSON.stringify({ ...project, updatedAt: now }),
    ':one': 1,
  }

  if (expectedVersion !== undefined) {
    expressionAttributeValues[':expectedVersion'] = expectedVersion
  }

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk(userId), SK: sk(projectId) },
        UpdateExpression: [
          'SET #name = :name',
          'updatedAt = :now',
          'roomWidthFt = :roomWidthFt',
          'roomHeightFt = :roomHeightFt',
          'tableCount = :tableCount',
          'guestCount = :guestCount',
          'projectData = :projectData',
          'version = version + :one',
        ].join(', '),
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: conditionExpression,
        ReturnValues: 'UPDATED_NEW',
      })
    )

    const newVersion = res.Attributes?.['version'] as number
    return { updatedAt: now, version: newVersion }
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException && expectedVersion !== undefined) {
      // Distinguish "not found" (404) from "version mismatch" (409).
      // Re-check whether the item exists at all.
      const check = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk(userId), SK: sk(projectId) },
          ProjectionExpression: 'projectId',
        })
      )
      if (check.Item) throw new VersionConflictError()
      // Item doesn't exist — re-throw the original so handler maps it to 404
    }
    throw e
  }
}

// ── Rename Project ─────────────────────────────────────────────────────────────

export async function renameProject(
  userId: string,
  projectId: string,
  name: string
): Promise<number> {
  const now = Date.now()

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(userId), SK: sk(projectId) },
      UpdateExpression: 'SET #name = :name, updatedAt = :now',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: { ':name': name, ':now': now },
      ConditionExpression: 'attribute_exists(PK)',
    })
  )

  return now
}

// ── Delete Project ─────────────────────────────────────────────────────────────

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(userId), SK: sk(projectId) },
      ConditionExpression: 'attribute_exists(PK)',
    })
  )
}
