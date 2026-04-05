import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'

/**
 * Extracts the Cognito sub (userId) from the JWT authorizer claims.
 * API Gateway validates the token before Lambda runs, so this is always present
 * on protected routes.
 */
export function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const sub = event.requestContext.authorizer.jwt.claims['sub']
  if (!sub || typeof sub !== 'string') {
    throw new Error('Missing sub claim in JWT — this should never happen on authorized routes')
  }
  return sub
}

/**
 * Extracts the email from the JWT authorizer claims.
 * Always present in Cognito tokens since email is the sign-in identifier.
 */
export function getUserEmail(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const email = event.requestContext.authorizer.jwt.claims['email']
  if (!email || typeof email !== 'string') {
    throw new Error('Missing email claim in JWT — this should never happen on authorized routes')
  }
  return email
}

// ── DynamoDB key helpers ───────────────────────────────────────────────────────

export function pk(userId: string): string {
  return `USER#${userId}`
}

export function sk(projectId: string): string {
  return `PROJECT#${projectId}`
}

/** PK for pending shares keyed by recipient email (pre-registration) */
export function pendingPk(email: string): string {
  return `PENDING#${email}`
}

/** SK for SHARE_REF items (under recipient's partition) and PENDING items */
export function shareSk(projectId: string): string {
  return `SHARE#${projectId}`
}

/** SK for COLLAB items (under owner's partition) */
export function collabSk(projectId: string, recipientEmail: string): string {
  return `COLLAB#${projectId}#${recipientEmail}`
}
