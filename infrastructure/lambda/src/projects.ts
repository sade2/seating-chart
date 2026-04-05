import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'
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

// ── List Projects ──────────────────────────────────────────────────────────────

export async function listProjects(userId: string): Promise<ProjectMeta[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeNames: {
        '#name': 'name',
      },
      ExpressionAttributeValues: {
        ':pk': pk(userId),
      },
      ProjectionExpression: 'projectId, #name, createdAt, updatedAt, roomWidthFt, roomHeightFt, tableCount, guestCount',
    })
  )

  return (res.Items ?? []) as ProjectMeta[]
}

// ── Get Project ────────────────────────────────────────────────────────────────

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
      },
      // Prevent overwriting an existing project
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  )
}

// ── Save Project (full replace) ────────────────────────────────────────────────

export async function saveProject(
  userId: string,
  projectId: string,
  project: { name: string; updatedAt: number; [key: string]: unknown }
): Promise<number> {
  const room = project.room as { widthFt?: number; heightFt?: number } | undefined
  const tables = (project.tables as unknown[]) ?? []
  const guests = (project.guests as unknown[]) ?? []
  const now = Date.now()

  // TODO v2: if payload > 300KB, store in S3
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk(userId),
        SK: sk(projectId),
        userId,
        projectId,
        name: project.name,
        createdAt: project.createdAt ?? now,
        updatedAt: now,
        roomWidthFt: room?.widthFt ?? 0,
        roomHeightFt: room?.heightFt ?? 0,
        tableCount: tables.length,
        guestCount: guests.length,
        projectData: JSON.stringify({ ...project, updatedAt: now }),
      },
      // Only save if the item exists (prevents creating orphan records)
      ConditionExpression: 'attribute_exists(PK)',
    })
  )

  return now
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
