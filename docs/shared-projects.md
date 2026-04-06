# Shared Projects — Technical Reference

Architecture decisions, implementation details, known quirks, and bugs found during development. Read this before touching the sharing feature.

---

## Overview

Projects can be shared with other users by email address. Shared projects appear on the dashboard under "Shared With Me" and open with full edit access. Sharing is **async** (not real-time) — last write wins, with version-based conflict detection to alert users when a collaborator's save overwrites their pending changes.

---

## Data Model

Single DynamoDB table. Four item types coexist, distinguished by their SK prefix.

### PROJECT (existing, modified)

```
PK  = USER#{ownerUserId}
SK  = PROJECT#{projectId}
version = Number   ← added; starts at 1, incremented atomically on every PUT
... all other existing fields
```

`version` is a **top-level DynamoDB attribute**, not stored inside `projectData`. This is intentional — `projectData` is the stringified project JSON blob and updating `version` inside it would require parsing and re-serialising on every read. Instead, `getProject` in the Lambda merges the two at read time:

```typescript
return { ...JSON.parse(projectData), version: res.Item['version'] ?? 1 }
```

Old projects that pre-date the feature will have no `version` attribute in DynamoDB. The `?? 1` fallback means they start at version 1 and gain conflict detection from the first save onward.

### COLLAB

```
PK  = USER#{ownerUserId}
SK  = COLLAB#{projectId}#{recipientEmail}
type           = "COLLAB"
projectId      = String
recipientEmail = String
recipientUserId = String | null    ← null until the recipient registers
role           = "edit" | "view"
status         = "active" | "pending"
sharedAt       = Number (epoch ms)
sharedByEmail  = String
```

Lives under the **owner's** partition. This is what the owner queries to list and manage collaborators. One item per (project, recipient email) pair.

### SHARE_REF

```
PK  = USER#{recipientUserId}
SK  = SHARE#{projectId}
type         = "SHARE_REF"
ownerUserId  = String    ← used to access the owner's partition for reads/writes
projectId    = String
role         = "edit" | "view"
sharedAt     = Number
sharedByEmail = String
```

Lives under the **recipient's** partition. Lets the recipient list shared projects without scanning the owner's partition. `ownerUserId` is the critical field — the Lambda uses it to route reads and writes to the correct partition.

### PENDING

```
PK  = PENDING#{recipientEmail}
SK  = SHARE#{projectId}
type           = "PENDING_SHARE"
ownerUserId    = String
projectId      = String
role           = "edit" | "view"
sharedAt       = Number
sharedByEmail  = String
sharedByUserId = String
```

Created when sharing with an email that has no Cognito account yet. Keyed by email (not userId) so it can be found at registration time. Activated lazily — see Pending Share Activation below.

---

## Authorization Flow

Every `GET /v1/projects/{id}` and `PUT /v1/projects/{id}` request runs this check (at most 2 DynamoDB `GetItem` calls):

```
1. GetItem(PK=USER#{userId}, SK=PROJECT#{projectId})
   → found: user is owner, proceed with their partition

2. Not found → GetItem(PK=USER#{userId}, SK=SHARE#{projectId})
   → found: user is collaborator, use ownerUserId from SHARE_REF to access owner's partition
   → not found: 404
```

`PATCH` (rename) and `DELETE` skip step 2 — owner-only operations return 404 for collaborators rather than 403, to avoid leaking project existence.

---

## Pending Share Activation

When `GET /v1/projects` is called, the Lambda runs `activatePendingShares(userId, userEmail)` **before** returning the project list. It queries `PK=PENDING#{userEmail}` and for each hit:

1. Writes a `SHARE_REF` under `USER#{userId}`
2. Updates the owner's `COLLAB` item: sets `recipientUserId`, `status = "active"`
3. Deletes the `PENDING` item

This runs on every list request but is a no-op for users with no pending shares (the Query returns zero items). It's idempotent — if it runs twice (e.g., due to a Lambda retry), the `PutItem` and `UpdateItem` are safe to re-run.

**Why not a Cognito Post-Confirmation trigger?** That would require an additional Lambda and Cognito trigger configuration in Terraform. Lazy activation on `GET /v1/projects` keeps the infrastructure surface small and works reliably.

---

## Cognito / JWT Quirks

### `email` claim is not in the access token

API Gateway's JWT authorizer validates the **access token**, not the `id_token`. Cognito's access token does not include the `email` claim by default — that lives only in the `id_token`.

The Lambda needs the user's email to key `PENDING#` items and to write `sharedByEmail`. The fix: use `cognito:username` as fallback, which equals the email address since the user pool uses `username_attributes = ["email"]`.

**Additional quirk:** API Gateway strips the `cognito:` prefix from claims before passing them to Lambda. So the claim is available as `username`, not `cognito:username`.

```typescript
// auth.ts — correct fallback order
const email = claims['email'] ?? claims['username']
```

This was found during debugging via a `claimsPresent` log added to the 401 handler. If this breaks again, check that log first — it prints the keys (not values) of all JWT claims available in the Lambda event.

### Cognito `ListUsers` for email lookup

When sharing with an email, the Lambda calls Cognito `ListUsers` with `Filter: email = "${email}"` to resolve the email to a Cognito `sub` (userId). This requires:

- `cognito-idp:ListUsers` IAM permission on the Lambda role (added in Terraform)
- `COGNITO_USER_POOL_ID` environment variable on the Lambda function

Users with `UserStatus = UNCONFIRMED` are treated as non-existent (a `PENDING` share is created instead). This prevents sharing with accounts that haven't verified their email.

---

## Version Conflict Detection

### How it works

Every `PUT /v1/projects/{id}` request includes `expectedVersion` in the body. The Lambda runs a conditional DynamoDB `UpdateCommand`:

```
ConditionExpression: "attribute_exists(PK) AND version = :expectedVersion"
UpdateExpression: "SET ... version = version + :one"
```

If the condition fails, DynamoDB throws `ConditionalCheckFailedException`. The Lambda then does a secondary `GetItem` to distinguish:
- Item missing → `404 NOT_FOUND`
- Item exists but version differs → `409 VERSION_CONFLICT`

The frontend catches `VERSION_CONFLICT` and sets `conflictDetected = true` in the Zustand store, which renders a non-dismissible amber banner with a Reload button.

### Race condition bug (fixed)

**Symptom:** Users saw the conflict banner on projects they were editing alone.

**Root cause:** The `persist` function in the Zustand store captures a snapshot of the project (including its `version`) at mutation time and holds it in `pendingProject`. If a save completes and updates the store's `version` while the debounce timer is still running, the next save fires with the stale version from the snapshot rather than the updated version from the store.

**Timeline:**
```
t=0ms    Edit → persist(project{version:1}). pendingProject = {version:1}
t=100ms  Debounce fires → executeSave({version:1}). Save in-flight.
t=200ms  Edit while save in-flight → persist(project{version:1}). pendingProject = {version:1}
t=300ms  Save returns. Store version → 2.
t=1700ms Debounce fires → executeSave({version:1}) ← stale! → 409
```

**Fix:** Read `expectedVersion` from the store at execution time, not from the captured snapshot:

```typescript
async function executeSave(project: Project) {
  // Read from store at execution time — not from the snapshot captured at persist() call time
  const expectedVersion = useProjectStore.getState().project?.version
  ...
}
```

The 1500ms debounce makes this safe: any in-flight save will have completed its network round-trip long before the next debounce fires, so the store version is always current by execution time.

---

## Permissions Matrix

| Action | Owner | Collaborator |
|--------|-------|-------------|
| Read project | ✅ | ✅ |
| Save project (PUT) | ✅ | ✅ |
| Rename project (PATCH) | ✅ | ❌ (404) |
| Delete project (DELETE) | ✅ | ❌ (404) |
| Share with others (POST /shares) | ✅ | ✅ |
| List collaborators (GET /shares) | ✅ | ✅ |
| Revoke any collaborator | ✅ | ❌ |
| Revoke self | ✅ | ✅ |
| Revoke owner | ❌ | ❌ |

Collaborator restrictions are enforced on the backend only — the frontend hides Rename/Delete from shared project cards as a UX convenience, not a security boundary.

---

## API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/v1/projects/{id}/shares` | JWT | Invite by email. Returns `{ status: "active" \| "pending" }` |
| `GET` | `/v1/projects/{id}/shares` | JWT | List collaborators |
| `DELETE` | `/v1/projects/{id}/shares/{email}` | JWT | Revoke access. Email is URL-encoded in the path |

The `role` field on `POST` defaults to `"edit"` and accepts `"view"` for future use. The backend stores it but the UI only surfaces `"edit"` for now.

---

## Frontend Architecture

### `isOwner` determination

`ProjectPage` reads `location.state.isShared` (set by React Router `navigate` from the dashboard) to determine if the current user is a collaborator. Defaults to `true` (owner) when navigating directly by URL.

This is a client-side hint only. All permission enforcement is on the backend. The consequence of a wrong `isOwner` value is cosmetic (the Share modal shows incorrect Remove buttons), but revoke API calls will be rejected by the server if the user lacks permission.

### Store version tracking

`version` is stored as an optional field on the `Project` type (`version?: number`). It is:
- Set to `1` when a new project is created (`NewProjectModal`)
- Populated from the backend on `getProject` (merged from the DynamoDB `version` attribute)
- Updated in the store after each successful save (from the `{ updatedAt, version }` response)
- Reset to `undefined` when `setProject` is called (page load), then immediately repopulated from the API response

### `getCurrentUserEmail()`

`src/lib/auth.ts` exports `getCurrentUserEmail()` which decodes the stored `id_token` payload (base64url → JSON) to read the `email` claim. This is used by `ShareModal` to determine which Remove buttons to show. No network call needed — the `id_token` is stored in `localStorage` alongside the access token.

---

## Known Limitations (v1)

- **No real-time sync.** Two collaborators editing simultaneously will have their changes merged on a last-write-wins basis. The version conflict banner only appears after a save attempt fails — there is no live awareness of another editor.
- **No view-only mode.** The `role` field is stored and returned by the API but the UI always grants edit access. A future release can gate mutations on `role === "edit"` checks in the handler.
- **No email notifications.** Sharing sends no email to the recipient. They only discover the share when they log in and their project list refreshes.
- **Pending shares have no expiry.** A `PENDING` item lives indefinitely until the recipient registers. There is no cleanup mechanism.
- **Deleting a project does not cascade.** If an owner deletes a project, the associated `COLLAB`, `SHARE_REF`, and `PENDING` items are not cleaned up. They become orphans. The `getProjectMeta` call in the dashboard list silently drops them (`if (!meta) return null`), so they don't appear in the UI, but they remain in DynamoDB.
