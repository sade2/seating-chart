import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

// Initialized outside the handler so the connection is reused across warm invocations
const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

export const TABLE_NAME = process.env.TABLE_NAME!
