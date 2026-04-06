import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb'
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { ddb, TABLE_NAME } from './db'
import { pk, pendingPk, shareSk, collabSk } from './auth'

// ── Cognito client ─────────────────────────────────────────────────────────────

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!

// ── Types ──────────────────────────────────────────────────────────────────────

export type ShareRole = 'edit' | 'view'
export type ShareStatus = 'active' | 'pending'

export interface ShareInfo {
  email: string
  role: ShareRole
  status: ShareStatus
  sharedAt: number
}

interface CollabItem {
  PK: string
  SK: string
  type: 'COLLAB'
  projectId: string
  recipientEmail: string
  recipientUserId: string | null
  role: ShareRole
  status: ShareStatus
  sharedAt: number
  sharedByEmail: string
}

interface ShareRefItem {
  PK: string
  SK: string
  type: 'SHARE_REF'
  ownerUserId: string
  projectId: string
  role: ShareRole
  sharedAt: number
  sharedByEmail: string
}

interface PendingItem {
  PK: string
  SK: string
  type: 'PENDING_SHARE'
  ownerUserId: string
  projectId: string
  role: ShareRole
  sharedAt: number
  sharedByEmail: string
  sharedByUserId: string
}

// ── Cognito user lookup ────────────────────────────────────────────────────────

/**
 * Looks up a Cognito user by email. Returns their userId (sub) and email,
 * or null if no account exists with that email.
 */
export async function lookupUserByEmail(email: string): Promise<{ userId: string; email: string } | null> {
  const res = await cognito.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`,
      Limit: 1,
    })
  )

  const user = res.Users?.[0]
  if (!user || user.UserStatus === 'UNCONFIRMED') return null

  const sub = user.Attributes?.find(a => a.Name === 'sub')?.Value
  if (!sub) return null

  return { userId: sub, email }
}

// ── Share a project ────────────────────────────────────────────────────────────

/**
 * Shares a project with a recipient email. If the recipient has a Cognito account,
 * writes an active SHARE_REF under their partition. Otherwise writes a PENDING item
 * keyed by email that activates when they sign up.
 *
 * Always writes a COLLAB item under the owner's partition to track collaborators.
 */
export async function shareProject(
  ownerUserId: string,
  ownerEmail: string,
  projectId: string,
  recipientEmail: string,
  role: ShareRole
): Promise<ShareStatus> {
  const now = Date.now()
  const recipient = await lookupUserByEmail(recipientEmail)

  // Write COLLAB item under owner's partition (tracks all collaborators)
  const collabItem: CollabItem = {
    PK: pk(ownerUserId),
    SK: collabSk(projectId, recipientEmail),
    type: 'COLLAB',
    projectId,
    recipientEmail,
    recipientUserId: recipient?.userId ?? null,
    role,
    status: recipient ? 'active' : 'pending',
    sharedAt: now,
    sharedByEmail: ownerEmail,
  }

  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: collabItem }))

  if (recipient) {
    // Recipient exists — write SHARE_REF under their partition
    const shareRefItem: ShareRefItem = {
      PK: pk(recipient.userId),
      SK: shareSk(projectId),
      type: 'SHARE_REF',
      ownerUserId,
      projectId,
      role,
      sharedAt: now,
      sharedByEmail: ownerEmail,
    }
    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: shareRefItem }))
    return 'active'
  } else {
    // Recipient not registered — write PENDING item keyed by email
    const pendingItem: PendingItem = {
      PK: pendingPk(recipientEmail),
      SK: shareSk(projectId),
      type: 'PENDING_SHARE',
      ownerUserId,
      projectId,
      role,
      sharedAt: now,
      sharedByEmail: ownerEmail,
      sharedByUserId: ownerUserId,
    }
    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: pendingItem }))
    return 'pending'
  }
}

// ── Revoke a share ─────────────────────────────────────────────────────────────

/**
 * Revokes access for recipientEmail on a project.
 * - Owner (ownerUserId) can revoke any collaborator.
 * - Collaborators can only revoke themselves (requestingEmail === recipientEmail).
 * Returns false if the requesting user lacks permission.
 */
export async function revokeShare(
  ownerUserId: string,
  projectId: string,
  recipientEmail: string,
  requestingUserId: string,
  requestingEmail: string
): Promise<boolean> {
  const isOwner = requestingUserId === ownerUserId
  const isSelf = requestingEmail === recipientEmail

  if (!isOwner && !isSelf) return false

  // Fetch COLLAB item to get recipientUserId (needed to delete SHARE_REF)
  const collabRes = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(ownerUserId), SK: collabSk(projectId, recipientEmail) },
    })
  )

  const collab = collabRes.Item as CollabItem | undefined
  if (!collab) return false

  const deletes: Promise<unknown>[] = [
    // Always delete the COLLAB item
    ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(ownerUserId), SK: collabSk(projectId, recipientEmail) },
    })),
  ]

  if (collab.status === 'active' && collab.recipientUserId) {
    // Delete SHARE_REF from recipient's partition
    deletes.push(
      ddb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk(collab.recipientUserId), SK: shareSk(projectId) },
      }))
    )
  } else if (collab.status === 'pending') {
    // Delete PENDING item keyed by email
    deletes.push(
      ddb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: pendingPk(recipientEmail), SK: shareSk(projectId) },
      }))
    )
  }

  await Promise.all(deletes)
  return true
}

// ── List shares for a project ──────────────────────────────────────────────────

/**
 * Returns all collaborators (active and pending) for a project.
 * Queries COLLAB items under the owner's partition.
 */
export async function listShares(ownerUserId: string, projectId: string): Promise<ShareInfo[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk(ownerUserId),
        ':prefix': `COLLAB#${projectId}#`,
      },
    })
  )

  return (res.Items ?? []).map(item => ({
    email: (item as CollabItem).recipientEmail,
    role: (item as CollabItem).role,
    status: (item as CollabItem).status,
    sharedAt: (item as CollabItem).sharedAt,
  }))
}

// ── Get a single SHARE_REF ─────────────────────────────────────────────────────

/**
 * Returns the SHARE_REF item for a user+project, or null if none exists.
 * Used by the handler to check if a user is a collaborator on a project.
 */
export async function getShareRef(
  userId: string,
  projectId: string
): Promise<ShareRefItem | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk(userId), SK: shareSk(projectId) },
    })
  )

  return (res.Item as ShareRefItem) ?? null
}

// ── List shared projects for a user ───────────────────────────────────────────

/**
 * Returns all SHARE_REF items for a user (projects shared with them).
 */
export async function listSharedProjects(userId: string): Promise<ShareRefItem[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk(userId),
        ':prefix': 'SHARE#',
      },
    })
  )

  return (res.Items ?? []) as ShareRefItem[]
}

// ── Activate pending shares ────────────────────────────────────────────────────

/**
 * Called on GET /v1/projects for the authenticated user.
 * Checks for any PENDING shares keyed to their email, converts them to active
 * SHARE_REF items, updates the owner's COLLAB items, and deletes the PENDING items.
 * Idempotent — safe to call on every request.
 */
export async function activatePendingShares(userId: string, userEmail: string): Promise<void> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': pendingPk(userEmail),
      },
    })
  )

  const pendingItems = (res.Items ?? []) as PendingItem[]
  if (pendingItems.length === 0) return

  await Promise.all(
    pendingItems.map(async pending => {
      const now = Date.now()

      await Promise.all([
        // Write active SHARE_REF under recipient's partition
        ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: pk(userId),
            SK: shareSk(pending.projectId),
            type: 'SHARE_REF',
            ownerUserId: pending.ownerUserId,
            projectId: pending.projectId,
            role: pending.role,
            sharedAt: pending.sharedAt,
            sharedByEmail: pending.sharedByEmail,
          } satisfies ShareRefItem,
        })),

        // Update COLLAB item under owner's partition: mark active + set recipientUserId
        ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: pk(pending.ownerUserId),
            SK: collabSk(pending.projectId, userEmail),
          },
          UpdateExpression: 'SET recipientUserId = :uid, #status = :status, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':uid': userId,
            ':status': 'active',
            ':now': now,
          },
          ConditionExpression: 'attribute_exists(PK)',
        })).catch(() => {
          // COLLAB item may have been revoked between query and update — safe to ignore
        }),

        // Delete PENDING item
        ddb.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: pendingPk(userEmail), SK: shareSk(pending.projectId) },
        })),
      ])
    })
  )
}
