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

export function pk(userId: string): string {
  return `USER#${userId}`
}

export function sk(projectId: string): string {
  return `PROJECT#${projectId}`
}
