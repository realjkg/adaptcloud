# Testing Guide — WC Claims Agent Portal

Work through these phases in order. Each phase has a precondition, the steps, what passing looks like, and what a failure indicates.

---

## Phase 1 — Local Setup Verification

**Precondition**: Node 20 installed, `.env.local` populated from `.env.example`.

```bash
cd wc-claims-portal
npm install
npm run type-check   # must exit 0 — no TypeScript errors
npm run lint         # must exit 0 — no lint errors
npm run dev          # starts on http://localhost:3000
```

| Check | Pass | Fail |
|---|---|---|
| `type-check` exits 0 | No TypeScript errors | Fix the reported type errors before continuing |
| `lint` exits 0 | No ESLint violations | Fix reported violations |
| Dev server starts | Terminal shows `Ready on http://localhost:3000` | Check for missing env vars in the startup error message |
| Browser opens root `/` | Redirects to `/auth/signin` | Middleware is not running — check `src/middleware.ts` |

---

## Phase 2 — Authentication Flow

**Precondition**: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` are set in `.env.local`. The local redirect URI `http://localhost:3000/api/auth/callback/azure-ad` is registered in the App Registration.

### 2a — Sign-in redirects to Microsoft

1. Navigate to `http://localhost:3000`
2. You are redirected to `/auth/signin`
3. Click **Sign in with Microsoft**

**Pass**: Browser redirects to `login.microsoftonline.com` with your tenant in the URL.  
**Fail — wrong tenant**: `AZURE_AD_TENANT_ID` is incorrect.  
**Fail — redirect_uri_mismatch**: The redirect URI is not registered in the App Registration.

### 2b — Successful sign-in lands on dashboard

1. Complete the Microsoft sign-in flow
2. If your tenant has MFA enabled: complete the MFA challenge

**Pass**: You land on `/dashboard` and see your name in the welcome heading.  
**Fail — blank page or error**: Open browser DevTools → Console. A `NEXTAUTH_SECRET` error means the secret is missing or wrong.  
**Fail — loops back to sign-in**: The `amr` claim check in `src/middleware.ts` is rejecting the session. This means MFA was not completed. If your tenant does not enforce MFA yet, temporarily set `acr_values: "mfa"` to off in `src/lib/auth.ts` for local testing only, then restore before deploying.

### 2c — Session expires correctly

1. In browser DevTools → Application → Cookies
2. Find the `next-auth.session-token` cookie
3. Verify the `Expires` value is ~8 hours from now

**Pass**: Cookie expires in approximately 8 hours.  
**Fail**: `session.maxAge` in `src/lib/auth.ts` is misconfigured.

### 2d — Sign-out clears session

1. Click **Sign out** in the sidebar
2. You are redirected to `/auth/signin`
3. Navigate directly to `http://localhost:3000/dashboard`

**Pass**: Redirected back to `/auth/signin` — session is gone.  
**Fail**: Dashboard loads without a valid session — middleware is not running.

---

## Phase 3 — Demo Data Verification

**Precondition**: `CLAIMS_DATA_MODE=demo` in `.env.local`. Signed in.

### 3a — Dashboard metrics are non-zero

Navigate to `/dashboard`.

| Metric | Expected value (demo seed) |
|---|---|
| Open Claims | 9 |
| Pending Review | 4 |
| Closed This Month | Depends on current month vs. July 2024 — may be 0 or 1 |
| High Risk / Escalated | 2 |

**Fail**: All zeros or "undefined" — the adapter is not initialising. Check the terminal for a startup error from `src/lib/claims/index.ts`.

### 3b — Claims table shows 10 rows with jurisdiction column

Navigate to `/claims`.

**Pass**: 10 rows, each with a state badge (CA, TX, FL, NY, IL, GA, WA, PA, OH, CO — one per row, no duplicates within the list).  
**Fail — fewer rows**: The seed data in `src/lib/claims/adapters/demo.ts` is truncated.  
**Fail — no State column**: `ClaimsTable.tsx` is rendering an old cached version — hard refresh.

### 3c — Individual claim loads with correct data

Click **Open** on claim `WC-2024-0891` (Maria Garcia, CA).

**Pass**:
- Left panel shows claimant name **Maria Garcia**, jurisdiction badge **CA**, status **active**
- Diagnosis shows `L4-L5 disc herniation`, ICD-10 `M51.16`
- Reserves total: **$76,500**
- Right panel shows AI chat with opening message referencing **WC-2024-0891 (CA jurisdiction)**

**Fail — 404**: The dynamic route `src/app/claims/[id]/page.tsx` is not resolving the `id` param correctly.  
**Fail — blank claim panel**: `ClaimDetail.tsx` received null props — check the `/api/claims/WC-2024-0891` API route directly.

### 3d — Verify the API routes directly

```bash
# While the dev server is running, in a second terminal:

# Must return 401 (no session cookie)
curl -s http://localhost:3000/api/claims | jq .

# To test with a session, copy the session cookie from browser DevTools
# Application → Cookies → next-auth.session-token
curl -s http://localhost:3000/api/claims \
  -H "Cookie: next-auth.session-token=<your-token>" | jq '.[0]'

curl -s http://localhost:3000/api/claims/WC-2024-0891 \
  -H "Cookie: next-auth.session-token=<your-token>" | jq '.jurisdiction'
# Expected: "CA"
```

---

## Phase 4 — AI Chat & Jurisdiction Context

**Precondition**: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT_NAME` set. Signed in with `Claims.Adjuster` or `Claims.Supervisor` role (or no roles assigned yet — see Phase 5 for role testing).

### 4a — Basic response streams correctly

On the `/claims/WC-2024-0891` page:

1. Type: `What is the TTD rate for this claim?`
2. Click Send

**Pass**: Response appears token by token (streaming). The answer references $742/week.  
**Fail — spinner never resolves**: Open DevTools → Network → find the `/api/chat` request. Check the response status:
- `401` — session expired, sign in again
- `403` — RBAC role missing (see Phase 5)
- `500` — Azure OpenAI credentials are wrong or the deployment name doesn't match
- `429` — rate limit hit (see Phase 6)

### 4b — Jurisdiction is injected into the system prompt

On claim `WC-2024-0902` (Sandra Lee, NY):

1. Ask: `What are the filing deadlines I need to be aware of for this claim?`

**Pass**: Response references **New York** WC statutes, NY WCB, or NY-specific deadlines (e.g., 30-day notice of controversy).  
**Fail**: Response gives generic WC information with no state reference — `jurisdiction` is not being passed from `ChatPanel` to the API. Check `src/components/chat/ChatPanel.tsx` line where `jurisdiction` is included in the fetch body.

### 4c — Multi-turn conversation maintains context

In the same chat session on any claim:

1. Send: `Summarise the claimant's injury`
2. After response: Send: `What type of IME specialist would be appropriate?`

**Pass**: Second response is contextually connected to the first (references the injury type from the summary).  
**Fail**: Second response ignores the first — message history is not being sent. Check the `history` array construction in `ChatPanel.tsx`.

### 4d — Error message surfaces correctly

Temporarily set `AZURE_OPENAI_API_KEY=invalid` in `.env.local`, restart, sign in, send a message.

**Pass**: Chat shows an italicised error message like `_Error: ... Please try again._` — the error propagates from the SSE stream to the UI.  
**Fail — spinner freezes silently**: The inner catch in `ChatPanel.tsx` is swallowing the error. This was fixed in the hygiene pass — verify you are on the latest commit.

Restore the correct key before continuing.

---

## Phase 5 — RBAC Enforcement

This phase requires you to test with users in different roles. The easiest approach in dev is to simulate role presence/absence by temporarily modifying the JWT callback in `src/lib/auth.ts` for local testing (do not commit these changes).

### 5a — User with no roles cannot access AI chat

Simulate no roles by temporarily setting `token.roles = []` in the `jwt` callback after the profile block.

```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"messages":[{"role":"user","content":"test"}]}' | jq .
```

**Pass**: `{"error":"Forbidden","detail":"Requires one of: Claims.Adjuster, Claims.Supervisor"}`  
**Fail**: Request succeeds with `200` — `forbiddenIfMissingRole` is not being called. Check the import in `src/app/api/chat/route.ts`.

### 5b — User with Claims.ReadOnly role is blocked from AI, not from claims

Simulate by setting `token.roles = ["Claims.ReadOnly"]` in the jwt callback.

- `GET /api/claims` — **Pass**: `200` with claims list (no role check on list)
- `POST /api/chat` — **Pass**: `403 Forbidden`

### 5c — User with Claims.Adjuster role can use AI

Simulate by setting `token.roles = ["Claims.Adjuster"]`.

- `POST /api/chat` — **Pass**: `200` with streaming response

Restore the real role resolution before continuing.

---

## Phase 6 — Rate Limiting

**Precondition**: Signed in. The rate limit is 20 requests per 60 seconds per user.

```bash
# Send 21 requests in quick succession
for i in $(seq 1 21); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    http://localhost:3000/api/chat \
    -H "Content-Type: application/json" \
    -H "Cookie: next-auth.session-token=<token>" \
    -d '{"messages":[{"role":"user","content":"ping"}]}')
  echo "Request $i: $STATUS"
done
```

**Pass**: Requests 1–20 return `200`, request 21 returns `429`.  
**Fail — all 200**: Rate limiter is not keying on the correct user ID. Check `userId` derivation in the route.  
**Fail — 429 before 20**: The sliding window is not filtering expired timestamps correctly.

Wait 60 seconds and verify the next request returns `200` again.

---

## Phase 7 — Audit Logging

**Precondition**: Signed in. Watch the terminal running `npm run dev`.

### 7a — Claim view is logged

Navigate to `/claims/WC-2024-0855`.

**Pass**: Terminal outputs a JSON line containing:
```json
{"audit":true,"type":"claim.view","claimId":"WC-2024-0855",...}
```

### 7b — Chat request is logged

Send any message in the AI chat panel.

**Pass**: Terminal outputs a line with `"type":"chat.request"` including `claimId` and `jurisdiction`.

### 7c — Rate limit event is logged

Trigger the rate limiter (Phase 6).

**Pass**: Terminal shows `"type":"chat.rate_limited"` on request 21.

### 7d — Log fields are complete

For any audit log line, verify all required fields are present:

```bash
# Pipe dev server output through jq to validate structure
npm run dev 2>&1 | grep '"audit":true' | head -5 | jq '{type,userId,userEmail,timestamp}'
```

**Pass**: All four fields are non-null/non-empty strings.

---

## Phase 8 — Security Headers

```bash
# Run against the dev server (or deployed SWA URL)
curl -s -I http://localhost:3000 | grep -i -E "x-frame|x-content|referrer|content-security"
```

**Pass** (SWA deployment only — dev server does not apply `staticwebapp.config.json`):
```
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
content-security-policy: default-src 'self'; ...
```

**Note**: Security headers from `staticwebapp.config.json` are only applied by Azure Static Web Apps, not by the Next.js dev server. Test this against the deployed URL, not localhost.

---

## Phase 9 — Pre-Deployment Checklist

Run through this before pushing to the dev landing zone.

```bash
cd wc-claims-portal

# 1. No TypeScript errors
npm run type-check

# 2. No lint errors  
npm run lint

# 3. Production build succeeds locally
# (requires all env vars to be set in .env.local)
npm run build
```

| Item | Command / Check | Must pass |
|---|---|---|
| TypeScript clean | `npm run type-check` | Exit 0 |
| Lint clean | `npm run lint` | Exit 0 |
| Build succeeds | `npm run build` | No errors, `.next/` created |
| `.env.local` not committed | `git status` | `.env.local` not listed |
| No hardcoded secrets | `git diff HEAD src/` | No API keys or secrets in diff |
| `CLAIMS_DATA_MODE` set in SWA | Azure portal → SWA → Configuration | Value is `demo` or `production` |
| Redirect URI registered | Entra ID → App registration → Authentication | SWA hostname listed |
| CA policy in Report-only | Entra ID → Conditional Access | Verified in Sign-in logs before enabling |

---

## Phase 10 — Production Mode Smoke Test

Only after `ProductionClaimsAdapter` has been implemented and `CLAIMS_DATA_MODE=production` is set.

### 10a — Claims load from CMS

Navigate to `/claims`. Verify real claim records appear (not the 10 seed records from demo mode).

### 10b — Claim detail renders from CMS

Open any real claim. Verify the `jurisdiction` field is populated (critical — it drives VCK form selection and AI system prompt context).

### 10c — AI references correct jurisdiction

On a real claim with `jurisdiction: "TX"`, ask:

> What DWC forms are required given the current status of this claim?

**Pass**: Response references Texas DWC forms and Texas-specific WC statutes.  
**Fail — generic response**: `jurisdiction` is not being returned by the Production adapter or is not mapped to the `Claim` type correctly.

---

## Quick Reference — Test Coverage Summary

| Area | Phase | Automated? |
|---|---|---|
| TypeScript compilation | 1 | Yes — `npm run type-check` |
| Lint | 1 | Yes — `npm run lint` |
| Auth redirect | 2a | Manual |
| MFA enforcement | 2b | Manual |
| Session lifetime | 2c | Manual |
| Sign-out | 2d | Manual |
| Dashboard metrics | 3a | Manual |
| Claims list (10 rows, jurisdiction) | 3b | Manual |
| Claim detail accuracy | 3c | Manual |
| API routes (401 without session) | 3d | `curl` |
| AI streaming | 4a | Manual |
| Jurisdiction in prompt | 4b | Manual |
| Multi-turn context | 4c | Manual |
| Error surfacing | 4d | Manual |
| RBAC — no role blocked | 5a | `curl` |
| RBAC — ReadOnly blocked from AI | 5b | `curl` |
| RBAC — Adjuster allowed | 5c | `curl` |
| Rate limiting (20 req/min) | 6 | `curl` loop |
| Audit log — claim view | 7a | Manual (terminal) |
| Audit log — chat request | 7b | Manual (terminal) |
| Audit log — rate limited | 7c | Manual (terminal) |
| Audit log — fields complete | 7d | `jq` |
| Security headers | 8 | `curl -I` (SWA only) |
| Pre-deployment build | 9 | `npm run build` |
| Production CMS data | 10 | Manual |
