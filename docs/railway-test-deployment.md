# Railway Test Deployment

This deployment is for early cloud testing by Sales Manager and Warehouse Person roles. It is not the final production release.

## Services

Create one Railway project with these services:

- `Postgres`: Railway PostgreSQL database
- `backend`: this repository, root directory left blank
- `frontend`: this repository, root directory left blank

The project is a shared monorepo. Keep both app services pointed at the repository root, then use the commands below.

## Backend Service

The backend service uses `backend/Dockerfile`. Set `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile`.

Variables:

```env
NODE_ENV=production
RAILWAY_DOCKERFILE_PATH=backend/Dockerfile
DATABASE_URL=${{ Postgres.DATABASE_URL }}
JWT_SECRET=<generate-a-long-random-secret>
ALLOWED_ORIGINS=https://${{ frontend.RAILWAY_PUBLIC_DOMAIN }}
SEED_DEFAULT_USERS=true
DEFAULT_USER_PASSWORD=<temporary-test-password>
```

After tester accounts are created, switch `SEED_DEFAULT_USERS` to `false` before any wider testing.

## Frontend Service

The frontend service uses `frontend/Dockerfile`. Set `RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile`.

Variables:

```env
RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile
VITE_API_BASE_URL=https://${{ backend.RAILWAY_PUBLIC_DOMAIN }}/api
```

Changing `VITE_API_BASE_URL` requires a frontend redeploy because Vite bakes `VITE_` variables into the browser bundle at build time.

## Test Accounts

When `SEED_DEFAULT_USERS=true`, the backend creates or refreshes these accounts:

- `admin@gt.local`
- `manager@gt.local`
- `warehouse@gt.local`

All three use `DEFAULT_USER_PASSWORD`.

## Smoke Test

1. Open the backend public URL plus `/api/health`; it should return `{ "ok": true }`.
2. Open the frontend URL and log in as `manager@gt.local`.
3. Confirm Sales Manager can create/view sales orders.
4. Log in as `warehouse@gt.local`.
5. Confirm Warehouse Person can access inventory/warehouse workflows and cannot access admin-only user management.

## Known Test-Stage Risks

- This uses `prisma db push` instead of migration files because this project does not have Prisma migrations yet.
- For this early test deployment, the backend Dockerfile runs `prisma db push` before starting the API.
- Default test users are convenient but should not remain enabled beyond early controlled testing.
- The frontend API URL is build-time configuration; redeploy frontend after changing it.
