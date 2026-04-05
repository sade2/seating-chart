# Infrastructure — Seating Chart on AWS

This document covers every component created for the AWS backend, how the pieces fit together, and the exact steps needed to bring the system live.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [What Was Created](#what-was-created)
   - [Terraform Bootstrap](#terraform-bootstrap)
   - [Terraform Modules](#terraform-modules)
   - [Environment](#environment)
   - [Lambda (Backend API)](#lambda-backend-api)
   - [GitHub Actions Workflows](#github-actions-workflows)
   - [Frontend Code Changes](#frontend-code-changes)
3. [DynamoDB Data Model](#dynamodb-data-model)
4. [API Reference](#api-reference)
5. [Auth Flow (PKCE)](#auth-flow-pkce)
6. [Cost Estimate](#cost-estimate)
7. [Next Steps — Phase by Phase](#next-steps--phase-by-phase)
8. [GitHub Actions Variables Reference](#github-actions-variables-reference)
9. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
User Browser
  │
  ├─► CloudFront → S3 (React SPA)          seating-chart.myurl.com
  │     - /assets/*  immutable (1yr cache)
  │     - index.html no-cache
  │     - 403/404 → index.html (SPA routing)
  │
  └─► API Gateway HTTP API                  api.seating-chart.myurl.com/v1
        JWT Authorizer (validates Cognito access tokens)
        └─► Lambda (Node.js 20, arm64, 256MB)
              └─► DynamoDB single-table (seating-chart-dev)

Auth:  Cognito Hosted UI (PKCE, no Amplify)
       auth-seating-chart-dev.auth.us-east-1.amazoncognito.com
```

**Key properties:**
- Fully serverless — no EC2, no containers, no always-on cost
- Multi-tenant via DynamoDB key isolation: every operation is scoped to `USER#{cognitoSub}`, never just `projectId`
- Zero secrets in GitHub — OIDC-based credential exchange for all CI/CD
- Single environment (`dev`) that auto-deploys on push to `main`

---

## What Was Created

### Terraform Bootstrap

**Location:** `infrastructure/bootstrap/`

Run once manually before anything else. Creates the global shared resources that all environments depend on. Uses **local state** (no remote backend needed for bootstrapping).

| Resource | Name | Purpose |
|---|---|---|
| S3 bucket | `seating-chart-tfstate-{account_id}` | Remote Terraform state (versioned + encrypted) |
| DynamoDB table | `seating-chart-tflock` | Terraform state locking (prevents concurrent applies) |
| IAM OIDC provider | GitHub Actions | Federated trust for GitHub → AWS, no static keys |
| IAM role | `github-actions-infra` | `AdministratorAccess` for Terraform apply |
| IAM role | `github-actions-deploy` | Narrow: S3 sync, CloudFront invalidate, Lambda update |

The `github-actions-deploy` role is intentionally narrow — it cannot modify infrastructure, only deploy artifacts that Terraform already created.

---

### Terraform Modules

All modules live in `infrastructure/modules/`. Each is self-contained with its own `variable` blocks and `output` blocks.

#### `modules/cognito/`

Creates the Cognito User Pool and app client.

**Key settings:**
- Sign-in by email (not username)
- Email verification required before first sign-in
- No client secret on the app client — required for PKCE from a SPA
- Auth flows: `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`
- OAuth: authorization code + PKCE, scopes `email openid profile`
- Callback URLs: app URL + `http://localhost:5173/auth/callback` (for local dev)
- Token validity: access token 1 hour, refresh token 30 days
- Hosted UI domain: `auth-seating-chart-dev.auth.us-east-1.amazoncognito.com`

**Outputs used by other modules:** `user_pool_id`, `client_id`, `hosted_ui_domain`

#### `modules/dynamodb/`

Creates the DynamoDB table with the single-table design.

**Key settings:**
- `PAY_PER_REQUEST` billing (no capacity planning needed at small scale)
- Hash key: `PK` (String), Range key: `SK` (String)
- GSI1: `userId` (hash) + `updatedAt` (range) — costs nothing now, enables future admin queries and "recently modified" sorting
- PITR: disabled

**Outputs:** `table_name`, `table_arn`

#### `modules/lambda/`

Creates the Lambda function and its IAM execution role.

**Key settings:**
- Runtime: Node.js 20.x, `arm64` architecture (Graviton2 — ~20% cheaper, faster cold starts than x86)
- Memory: 256 MB, Timeout: 10 seconds
- DynamoDB permissions: `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query` on the table and GSI1
- CloudWatch log group: 7-day retention
- Provisioned concurrency: 0 (cold starts ~500ms — acceptable for this scale)
- The `lifecycle { ignore_changes = [filename, source_code_hash] }` block means Terraform creates the function but GitHub Actions owns subsequent code deployments

**Outputs:** `function_name`, `function_arn`, `invoke_arn`

#### `modules/api/`

Creates the API Gateway HTTP API with a JWT authorizer.

**Key settings:**
- HTTP API (v2) — cheaper and lower latency than REST API (v1)
- CORS: allows all origins
- JWT authorizer: validates Cognito access tokens before Lambda runs — Lambda never receives unauthenticated requests on protected routes
- All 6 project routes (`GET/POST /v1/projects`, `GET/PUT/PATCH/DELETE /v1/projects/{id}`) require authorization
- `GET /v1/health` has no authorizer — useful for uptime monitoring
- Auto-deploy stage: every Terraform apply takes effect immediately
- Access logs to CloudWatch in JSON format (requestId, IP, method, status, error)

**Outputs:** `api_id`, `api_endpoint` (the `$default` invoke URL, before custom domain)

#### `modules/frontend/`

Creates the S3 bucket + CloudFront distribution for the React SPA.

**Key settings:**
- S3: private, no public access, versioning enabled. CloudFront accesses via OAC (Origin Access Control — the modern replacement for the legacy OAI)
- `/assets/*` cache behavior: `max-age=31536000,immutable` — Vite content-hashes all JS/CSS filenames, so these are safe to cache forever
- Default cache behavior (index.html + everything else): `no-cache` — ensures users always get the latest app shell
- Custom error responses: both 403 and 404 from S3 serve `/index.html` with HTTP 200. This is required for React Router — deep links like `/project/some-uuid` must return the SPA, not a 404
- Security headers policy: HSTS (2yr, include subdomains, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`
- TLS: ACM cert, minimum TLSv1.2_2021 (drops legacy clients), SNI-only
- Price class: `PriceClass_100` (US + Europe edge locations — cheapest tier)
- Access logging: disabled

**Outputs:** `bucket_name`, `distribution_id`, `distribution_domain_name`, `distribution_hosted_zone_id`

#### `modules/dns/`

Creates the ACM certificate and its Route 53 DNS validation records only.

**Key settings:**
- ACM cert is created in `us-east-1` regardless of where the rest of the infra lives — CloudFront requires this
- Uses a second provider alias (`provider "aws" { alias = "us_east_1" }`) to create the cert in the right region
- DNS validation: Terraform creates the validation CNAME records in Route 53 and waits for ACM to confirm them
- Cert covers `seating-chart.myurl.com` (primary) + `*.seating-chart.myurl.com` (SAN) — the wildcard covers the `api.` subdomain

**Why the Route 53 alias records are NOT in this module:** There is an inherent circular dependency — CloudFront needs the cert ARN to be created, and the Route 53 alias records need CloudFront's domain name. Putting both in one module creates a cycle Terraform cannot resolve. The alias records (`A` + `AAAA` for both the app domain and api subdomain) are defined inline in `environments/dev/main.tf` where Terraform can determine the correct creation order.

**Outputs:** `certificate_arn` (the validated cert, passed to the frontend module and API GW custom domain)

---

### Environment

**Location:** `infrastructure/environments/dev/`

Single environment. Contains:
- `backend.tf` — S3 remote state configuration (key: `dev/terraform.tfstate`)
- `main.tf` — calls all modules; also defines the API Gateway custom domain and Route 53 alias records inline (not in modules) to avoid the circular dependency between the ACM cert, CloudFront, and DNS alias records
- `variables.tf` — declares `domain_name` and `hosted_zone_id`
- `terraform.tfvars` — values to fill in before first apply

The Cognito app client includes `http://localhost:5173/auth/callback` as a callback URL so local development works against real AWS Cognito without a separate local auth setup.

---

### Lambda (Backend API)

**Location:** `infrastructure/lambda/`

**Build system:** esbuild bundles everything into a single `dist/handler.js`, then zips it. No `node_modules/` directory in the zip — the `@aws-sdk/*` packages are excluded (they're available in the Lambda runtime). Result is ~300–400 KB.

```
lambda/
├── src/
│   ├── handler.ts   Entry point — HTTP method + path routing, error handling
│   ├── projects.ts  All DynamoDB operations for the 6 CRUD endpoints
│   ├── auth.ts      getUserId() from JWT claims, pk()/sk() key builders
│   └── db.ts        DynamoDB DocumentClient singleton
├── build.sh         esbuild → dist/handler.zip
├── package.json
└── tsconfig.json
```

**`handler.ts`** — routes incoming requests by `method + path`, extracts the userId, dispatches to the correct function in `projects.ts`, and converts DynamoDB `ConditionalCheckFailedException` to the appropriate HTTP error (404 for missing items, 409 for duplicate creates).

**`projects.ts`** — all DynamoDB calls. Notable details:
- `listProjects`: uses `ProjectionExpression` — returns only metadata columns, never the `projectData` blob. This keeps the list response small even for large projects
- `createProject`: uses `attribute_not_exists(PK)` condition to prevent overwriting an existing item
- `saveProject`: uses `attribute_exists(PK)` condition to prevent creating orphan records (PUT only updates, never creates)
- Both `saveProject` and `createProject` include a `// TODO v2: if payload > 300KB, store in S3` comment at the right place — the DynamoDB item limit is 400 KB

**`auth.ts`** — trivial but important: every handler starts by calling `getUserId()`. The `pk()` helper forces all queries to include the user prefix, making cross-user data access structurally impossible.

**`db.ts`** — the DynamoDB client is initialized at module load time, outside the handler. This means it's reused across warm Lambda invocations (the TCP connection to DynamoDB stays open), which reduces per-request latency.

---

### GitHub Actions Workflows

**Location:** `.github/workflows/`

#### `infra.yml` — Infrastructure workflow

**Triggers:** push/PR to `main` with changes in `infrastructure/**`

**Jobs:**
1. `build-lambda` — runs `npm ci && npm run build` in `infrastructure/lambda/`, uploads `dist/handler.zip` as an artifact (retained 1 day)
2. `terraform` — downloads artifact, configures OIDC credentials, `terraform init` → `terraform validate` → `terraform plan` on every run; `terraform apply` only on push to main

**Why build Lambda here?** Terraform references `lambda/dist/handler.zip` via `filename`. The file must exist when `terraform plan` runs (even though Terraform ignores code changes after initial creation via `lifecycle.ignore_changes`).

#### `deploy.yml` — Deployment workflow

**Triggers:** push to `main` with changes in `src/**`, `public/**`, `index.html`, `vite.config.ts`, or `package*.json`

**Jobs:**
1. `deploy-frontend` — builds with `VITE_*` vars injected from GitHub Variables, syncs to S3 (assets with immutable headers, root files with no-cache), invalidates CloudFront
2. `deploy-lambda` — builds Lambda, updates function code via `aws lambda update-function-code`

**S3 sync strategy:** Two separate `aws s3 sync` calls per deploy:
1. `dist/assets/` with `--cache-control "public,max-age=31536000,immutable"` — Vite hashes these filenames, so old cached versions and new versions coexist safely
2. `dist/` (excluding assets) with `--cache-control "no-cache,no-store,must-revalidate"` — `index.html` must never be cached, otherwise users get stale app shells

The `--delete` flag removes old hashed asset files. Without it, the bucket fills up with every deploy's worth of JS chunks.

---

### Frontend Code Changes

#### New files

**`src/lib/auth.ts`**

Implements the full PKCE OAuth flow using only `fetch` and the Web Crypto API — no Amplify, no third-party auth library.

Key functions:
- `initiateLogin()` — generates a PKCE verifier + challenge, stores verifier in localStorage, redirects to Cognito Hosted UI
- `handleCallback(code, state)` — validates state (CSRF protection), exchanges code for tokens via `POST /oauth2/token`, stores tokens in localStorage
- `getAccessToken()` — returns the current access token; auto-refreshes via the refresh token if the access token is within 5 minutes of expiry
- `logout()` — clears localStorage, redirects to Cognito's logout endpoint
- `isAuthenticated()` — synchronous check used by `ProtectedRoute`

Tokens are stored in `localStorage` under the key `seating_chart_auth` as JSON: `{ accessToken, refreshToken, idToken, expiresAt }`.

**`src/lib/api.ts`**

Typed fetch wrapper. All methods call `getAccessToken()` (which auto-refreshes) and attach `Authorization: Bearer {token}`. Network errors and non-2xx responses throw `ApiError` with `status` and `code` fields.

Methods: `listProjects()`, `getProject(id)`, `createProject(project)`, `saveProject(id, project)`, `patchProject(id, name)`, `deleteProject(id)`

**`src/components/ProtectedRoute.tsx`**

Wraps any route. Calls `isAuthenticated()` on mount — if false, calls `initiateLogin()` (which redirects to Cognito) and renders a "Redirecting to login…" placeholder.

**`src/pages/AuthCallbackPage.tsx`**

Mounted at `/auth/callback`. Reads `?code=` and `?state=` from the URL, calls `handleCallback()`, then `navigate('/', { replace: true })`. Handles error params from Cognito (e.g. user cancels login) with a friendly error message.

#### Modified files

**`src/App.tsx`**
- Added `/auth/callback` route (unprotected — must be accessible before auth completes)
- Wrapped `HomePage` and `ProjectPage` routes in `<ProtectedRoute>`

**`src/pages/HomePage.tsx`**
- All Dexie calls replaced with `api.*`
- `NewProjectModal` now calls `api.createProject()` and shows a spinner + error state
- `RenameModal` now calls `api.patchProject()` (PATCH, not full PUT — only sends the name)
- `handleDelete` calls `api.deleteProject()`
- Projects are loaded from `api.listProjects()` with error state handling
- Sign out button added to the header (calls `logout()`)
- Card props changed from `Project` to `ProjectMeta` — uses `projectId` instead of `id`, and `tableCount`/`guestCount`/`roomWidthFt`/`roomHeightFt` from the metadata instead of counting arrays

**`src/pages/ProjectPage.tsx`**
- Replaced `db.projects.get(id)` with `api.getProject(id)`
- Added `visibilitychange` listener: when the browser tab is hidden (user closes tab or switches app), calls `flushPersist()` to immediately fire any pending debounced save
- Cleanup effect also calls `flushPersist()` when the component unmounts (user navigates back to home)

**`src/store/projectStore.ts`**
- Replaced `db.projects.put(updated)` in `persist()` with a debounced `api.saveProject()` call
- Debounce window: **1500ms** — the store is updated synchronously on every mutation (every drag pixel, every keypress), but the API is only called once per burst after the user pauses
- `pendingProject` holds the latest project state; if the debounce fires, it sends the most current version
- Exports `flushPersist()` so `ProjectPage` can trigger an immediate save

**`src/db/index.ts`** — **deleted**

---

## DynamoDB Data Model

**Table name:** `seating-chart-dev`

### Key structure

```
PK:  USER#{cognitoSub}      e.g.  USER#a1b2c3d4-1234-...
SK:  PROJECT#{projectId}    e.g.  PROJECT#e5f6a7b8-5678-...
```

### Item attributes

| Attribute | Type | Notes |
|---|---|---|
| `PK` | String | Partition key |
| `SK` | String | Sort key |
| `userId` | String | Denormalized Cognito sub (used by GSI1) |
| `projectId` | String | Denormalized project UUID |
| `name` | String | Project name |
| `createdAt` | Number | Epoch ms |
| `updatedAt` | Number | Epoch ms (used by GSI1) |
| `roomWidthFt` | Number | For list endpoint metadata |
| `roomHeightFt` | Number | For list endpoint metadata |
| `tableCount` | Number | Denormalized count |
| `guestCount` | Number | Denormalized count |
| `projectData` | String | `JSON.stringify(fullProjectObject)` |

### Why `projectData` is a JSON string (not a DynamoDB Map)

The `Project` type contains deeply nested arrays, optional fields that change as the app evolves, and SVG path data. Storing it as a DynamoDB Map would require exact schema alignment with the TypeScript types. Storing it as a serialized string means: write it as-is, read it back and parse — no mapping layer, no schema drift. The trade-off is that DynamoDB can't query inside `projectData`, but there's no use case for that.

### DynamoDB item size limit: 400 KB

For most projects this is not a concern. A project with 50 tables, 500 guests, and no floor plan is roughly 50–80 KB. However, if a user imports a complex floor plan SVG (the `room.floorPlan.paths` array), the JSON can exceed 300 KB. The Lambda code has a `// TODO v2` comment at the right place to handle this: detect oversized payloads and store `projectData` in S3 instead, writing only the S3 key to DynamoDB.

### GSI1

```
GSI1-PK: userId
GSI1-SK: updatedAt
```

Not used in v1. Defined now because adding a GSI to an existing table with data requires a table rebuild (hours of downtime) in DynamoDB. Enabling it now costs nothing. Useful future queries:
- Admin: "show me all projects across all users"
- User-facing: "sort projects by last modified"

---

## API Reference

**Base URL:** `https://api.seating-chart.myurl.com/v1`

All endpoints except `/v1/health` require `Authorization: Bearer {cognito-access-token}`.

### Endpoints

| Method | Path | Request Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/v1/health` | — | `{ status: "ok" }` | Unauthenticated |
| `GET` | `/v1/projects` | — | `{ projects: ProjectMeta[] }` | No blob, metadata only |
| `POST` | `/v1/projects` | `Project` object | `{ projectId: string }` | 409 if ID already exists |
| `GET` | `/v1/projects/{id}` | — | Full `Project` object | 404 if not found or not owned |
| `PUT` | `/v1/projects/{id}` | Full `Project` object | `{ updatedAt: number }` | Full replace; 404 if not exists |
| `PATCH` | `/v1/projects/{id}` | `{ name: string }` | `{ updatedAt: number }` | Name-only update |
| `DELETE` | `/v1/projects/{id}` | — | 204 No Content | 404 if not found or not owned |

### Error response shape

```json
{
  "error": "VALIDATION_ERROR | FORBIDDEN | NOT_FOUND | CONFLICT | INTERNAL_ERROR",
  "message": "Human-readable description"
}
```

### Security model

The JWT authorizer in API Gateway validates the Cognito access token signature before Lambda runs. Inside Lambda, every DynamoDB operation includes `PK = USER#{userId}` in the key. A user cannot access another user's projects even if they know the `projectId` — the composite key `USER#{sub}#PROJECT#{id}` simply won't exist for the wrong user.

---

## Auth Flow (PKCE)

PKCE (Proof Key for Code Exchange) is the correct OAuth flow for SPAs. Unlike the implicit flow (which has been deprecated), the authorization code is useless to an attacker who intercepts it because the code can only be exchanged using the secret `verifier` that only the legitimate client holds.

```
1. User clicks "Sign In" (or hits a protected route)
   │
   ▼
2. initiateLogin() in auth.ts:
   - generates random verifier (32 bytes, base64url)
   - SHA-256 hashes verifier → challenge
   - stores verifier in localStorage
   - redirects to Cognito Hosted UI:
     ?response_type=code
     &code_challenge={challenge}
     &code_challenge_method=S256
     &state={random nonce}
     ...
   │
   ▼
3. User signs in / signs up on Cognito Hosted UI
   │
   ▼
4. Cognito redirects to /auth/callback?code={code}&state={nonce}
   │
   ▼
5. AuthCallbackPage.tsx calls handleCallback(code, state):
   - validates state matches stored nonce (CSRF protection)
   - POST /oauth2/token with code + verifier
   - stores { accessToken, refreshToken, idToken, expiresAt } in localStorage
   - navigate('/', { replace: true })
   │
   ▼
6. Every api.* call:
   - calls getAccessToken()
   - if accessToken expires within 5 minutes: POST /oauth2/token with refresh_token
   - attaches Authorization: Bearer {accessToken}
```

---

## Cost Estimate

At ~50 active users, ~500 API requests/day:

| Service | Monthly |
|---|---|
| CloudFront | $0.00 (free tier: 1TB transfer, 10M requests) |
| S3 | $0.00 (<1 GB storage, minimal requests) |
| Lambda | $0.00 (free tier: 1M requests, 400K GB-seconds) |
| API Gateway HTTP API | ~$0.05 (1$/million requests after 300M free) |
| DynamoDB on-demand | ~$0.50 |
| Route 53 hosted zone | $0.50/zone/month |
| Cognito (<50K MAU) | $0.00 |
| ACM certificate | $0.00 |
| **Total** | **~$1.05/month** |

If cold starts become a concern, adding 1× provisioned concurrency (~$3/mo) eliminates them entirely.

---

## Next Steps — Phase by Phase

### Phase 0: Prerequisites

These are one-time manual steps before any Terraform runs.

1. **Set up DNS for your domain**
   - Create a Route 53 Hosted Zone for `myurl.com`
   - If your domain is registered elsewhere (Vercel, Namecheap, etc.), update your registrar's nameservers to the four Route 53 nameservers shown in the hosted zone
   - Copy the hosted zone ID from the Route 53 console (format: `Z1D633PJRANDOM`)

2. **Create/prepare your AWS account**
   - Ensure you have credentials with AdministratorAccess for the initial bootstrap
   - Run `aws configure` or set `AWS_PROFILE` to point to these credentials

3. **Install tooling**
   ```bash
   brew install terraform awscli
   terraform -version   # should be >= 1.7
   aws --version
   ```

4. **Fork/clone the repo** and ensure GitHub Actions is enabled for the repository

---

### Phase 1: Bootstrap (15 minutes)

```bash
cd infrastructure/bootstrap

terraform init

# Get your account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

terraform apply \
  -var="github_org=YOUR_GITHUB_ORG" \
  -var="github_repo=seating-chart" \
  -var="aws_account_id=$ACCOUNT_ID"
```

After `apply` completes, note the outputs:
```
tfstate_bucket          = "seating-chart-tfstate-123456789012"
tflock_table            = "seating-chart-tflock"
github_infra_role_arn   = "arn:aws:iam::123456789012:role/github-actions-infra"
github_deploy_role_arn  = "arn:aws:iam::123456789012:role/github-actions-deploy"
```

**Update `environments/dev/backend.tf`** — replace the bucket name's account ID placeholder with the actual account ID from the output.

**Set GitHub Actions Variables** (Settings → Secrets and variables → Actions → Variables tab):

| Variable | Value |
|---|---|
| `INFRA_ROLE_ARN` | ARN from `github_infra_role_arn` output |
| `DEPLOY_ROLE_ARN` | ARN from `github_deploy_role_arn` output |

---

### Phase 2: Core Infrastructure — Cognito + DynamoDB + Lambda + API (1–2 hours)

```bash
cd infrastructure/environments/dev

# Update terraform.tfvars:
# domain_name    = "seating-chart.myurl.com"
# hosted_zone_id = "Z1D633PJRANDOM"

terraform init
terraform apply
```

This will create everything in one apply:
- Cognito user pool + app client + hosted UI domain
- DynamoDB table `seating-chart-dev`
- Lambda function `seating-chart-projects-dev` (using the placeholder zip)
- API Gateway HTTP API with JWT authorizer
- ACM certificate for `seating-chart.myurl.com` + `*.seating-chart.myurl.com` (validation takes 5–10 minutes — Terraform waits automatically)
- CloudFront distribution + S3 bucket
- Route 53 A + AAAA records for `seating-chart.myurl.com` and `api.seating-chart.myurl.com`

Note the outputs:
```
cognito_user_pool_id       = "us-east-1_XXXXXXXXX"
cognito_client_id          = "xxxxxxxxxxxxxxxxxxxxxxxxxxx"
cognito_hosted_ui_domain   = "https://auth-seating-chart-dev.auth.us-east-1.amazoncognito.com"
api_endpoint               = "https://api.seating-chart.myurl.com"
frontend_bucket            = "seating-chart-frontend-dev-123456789012"
cloudfront_distribution_id = "EDFDVBD6EXAMPLE"
```

**Build and deploy the real Lambda code:**
```bash
cd infrastructure/lambda
npm ci
npm run build

aws lambda update-function-code \
  --function-name seating-chart-projects-dev \
  --zip-file fileb://dist/handler.zip
```

**Test Lambda directly** (before testing through the API):
- Open the Lambda console → `seating-chart-projects-dev` → Test tab
- Create a test event for the health check:
  ```json
  {
    "version": "2.0",
    "requestContext": {
      "http": { "method": "GET", "path": "/v1/health" }
    }
  }
  ```
- Expected response: `{ "statusCode": 200, "body": "{\"status\":\"ok\"}" }`

**Test API Gateway with curl:**
```bash
# Health (no auth)
curl https://api.seating-chart.myurl.com/v1/health

# Verify unauthenticated request returns 401
curl https://api.seating-chart.myurl.com/v1/projects
# Should return: {"message":"Unauthorized"}
```

**Update `.env.development`** with the Terraform outputs:
```env
VITE_API_URL=https://api.seating-chart.myurl.com/v1
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_DOMAIN=https://auth-seating-chart-dev.auth.us-east-1.amazoncognito.com
VITE_REDIRECT_URI=http://localhost:5173/auth/callback
```

**Test the full auth flow locally:**
```bash
npm run dev
# Open http://localhost:5173
# Should redirect to Cognito Hosted UI
# Sign up with a test email
# Confirm email (check inbox)
# Should redirect back to http://localhost:5173/auth/callback then to /
```

**Deploy the frontend:**
```bash
npm run build

# Sync assets (immutable cache)
aws s3 sync dist/assets/ s3://seating-chart-frontend-dev-123456789012/assets/ \
  --cache-control "public,max-age=31536000,immutable" --delete

# Sync root (no-cache)
aws s3 sync dist/ s3://seating-chart-frontend-dev-123456789012/ \
  --cache-control "no-cache,no-store,must-revalidate" \
  --exclude "assets/*" --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id EDFDVBD6EXAMPLE \
  --paths "/*"
```

**Verify:**
- Open `https://seating-chart.myurl.com` — should load the app
- Open `https://seating-chart.myurl.com/project/fake-id` — should still load the SPA (not a 404)
- Hard refresh on that URL — same result

---

### Phase 3: GitHub Actions CI/CD (1 hour)

1. **Add GitHub Actions Variables** (Settings → Secrets and variables → Actions → Variables tab):

   | Variable | Value |
   |---|---|
   | `API_URL` | `https://api.seating-chart.myurl.com/v1` |
   | `COGNITO_USER_POOL_ID` | From Terraform output |
   | `COGNITO_CLIENT_ID` | From Terraform output |
   | `COGNITO_DOMAIN` | `https://auth-seating-chart-dev.auth.us-east-1.amazoncognito.com` |
   | `REDIRECT_URI` | `https://seating-chart.myurl.com/auth/callback` |
   | `FRONTEND_BUCKET` | From Terraform output |
   | `CF_DISTRIBUTION_ID` | From Terraform output |
   | `LAMBDA_FUNCTION_NAME` | `seating-chart-projects-dev` |

2. **Configure GitHub Environment** (Settings → Environments):
   - Create a `dev` environment (no protection rules — auto-deploys on every push to main)

3. **Push a small change** (e.g. update a comment in `src/App.tsx`) and watch both workflows run end-to-end in the Actions tab

4. **Verify the Lambda update:** check the Lambda console after the workflow completes — the "Last modified" timestamp should update

---

### Phase 4: Data Migration (for existing users)

The plan for migrating data from IndexedDB (old app) to the new backend:

1. **Before decommissioning the old app**, add an "Export all data" button that calls the old `db.projects.toArray()` and downloads a JSON file
2. **In the new app**, add an "Import backup" option in the dashboard that reads the JSON file and calls `api.createProject()` for each project
3. Project IDs are preserved (they're already UUIDs generated client-side), so bookmarks to `/project/some-uuid` continue to work

This is a manual process per user. At small scale (<100 users), that's the right trade-off over building automated migration with all its edge cases.

---

## GitHub Actions Variables Reference

Full list of all variables needed across both workflows. All are GitHub Actions **Variables** (not Secrets) — they are not sensitive.

| Variable | Where used | Description |
|---|---|---|
| `INFRA_ROLE_ARN` | `infra.yml` | IAM role for Terraform (from bootstrap output) |
| `DEPLOY_ROLE_ARN` | `deploy.yml` | IAM role for S3/CF/Lambda deploys (from bootstrap output) |
| `API_URL` | `deploy.yml` | `https://api.seating-chart.myurl.com/v1` |
| `COGNITO_USER_POOL_ID` | `deploy.yml` | e.g. `us-east-1_XXXXXXXXX` |
| `COGNITO_CLIENT_ID` | `deploy.yml` | App client ID |
| `COGNITO_DOMAIN` | `deploy.yml` | `https://auth-seating-chart-dev.auth.us-east-1.amazoncognito.com` |
| `REDIRECT_URI` | `deploy.yml` | `https://seating-chart.myurl.com/auth/callback` |
| `FRONTEND_BUCKET` | `deploy.yml` | S3 bucket name from Terraform output |
| `CF_DISTRIBUTION_ID` | `deploy.yml` | CloudFront distribution ID from Terraform output |
| `LAMBDA_FUNCTION_NAME` | `deploy.yml` | `seating-chart-projects-dev` |

---

## Troubleshooting

### Getting a Cognito access token for curl testing

The easiest way to get a token for manual API testing:

1. Open the app in a browser and sign in
2. Open DevTools → Application → Local Storage → `seating_chart_auth`
3. Copy the `accessToken` value
4. Use it: `curl -H "Authorization: Bearer {token}" ...`

Tokens expire after 1 hour. The app auto-refreshes but you'll need a fresh one for curl.

### "OIDC provider already exists" error in bootstrap

If your AWS account already has a GitHub OIDC provider (e.g. from another project):

```bash
# Get the existing ARN
aws iam list-open-id-connect-providers

# In bootstrap/main.tf, replace the aws_iam_openid_connect_provider resource
# with a data source:
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}
# Then set: oidc_provider_arn = data.aws_iam_openid_connect_provider.github.arn
```

### Terraform apply fails: "error creating Lambda Function: operation error Lambda: CreateFunction, no such file"

The Lambda zip doesn't exist. Build it first:
```bash
cd infrastructure/lambda && npm ci && npm run build
```
A placeholder `dist/handler.zip` is committed for the initial Terraform run, but it may have been gitignored. Check `.gitignore`.

### CloudFront returns 403 on deep links (e.g. `/project/some-uuid`)

The SPA routing custom error responses should handle this. If you see 403s, verify:
1. The `custom_error_response` blocks in `modules/frontend/main.tf` are applied (run `terraform apply`)
2. The response code is `200` (not 404) — some CloudFront configs accidentally return 404

### Cognito: "redirect_uri mismatch" error

The redirect URI in the auth request must exactly match one of the configured callback URLs. Check:
1. `VITE_REDIRECT_URI` in `.env.development` matches what's in `modules/cognito/main.tf` `callback_urls`
2. No trailing slashes
3. `http` vs `https` must match exactly

---

## Future Work (not yet implemented)

- **Observability:** CloudWatch alarms for Lambda error rate > 1%, P99 latency > 3s; X-Ray tracing; CloudWatch Dashboard
- **S3 overflow for large projects:** When `projectData` exceeds ~300 KB, store in `s3://seating-chart-data-dev/projects/{userId}/{projectId}.json` and write the key to DynamoDB. Lambda code already has a `TODO v2` comment at the right location
- **Provisioned concurrency:** Add `provisioned_concurrency = 1` to the lambda module in `environments/dev/main.tf` (~$3/mo) to eliminate cold starts if they become noticeable
- **MFA:** Add TOTP as an optional second factor in Cognito (`mfa_configuration = "OPTIONAL"`)
- **Admin queries:** GSI1 (`userId` + `updatedAt`) is defined but not used. Add an admin Lambda or use the AWS console/CLI for now
- **Offline support:** The app currently requires network connectivity (online-only by design for v1). IndexedDB could be reintroduced as a write-through cache with a sync queue
- **Project sharing/collaboration:** Would require a different data model (project-level access control, not user-level key isolation)
