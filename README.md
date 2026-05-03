# GT Orders & Stocks

Monorepo scaffold for the `GT Orders & Stocks` MVP.

## Structure

- `frontend/` React + TypeScript + Vite
- `backend/` Express + TypeScript
- `prisma/schema.prisma` shared database schema
- `docker-compose.yml` local PostgreSQL

## Next Steps

1. Install frontend dependencies in `frontend/`
2. Install backend dependencies in `backend/`
3. Start PostgreSQL with Docker Compose
4. Run Prisma migration using `prisma/schema.prisma`
5. Implement auth, inventory, and sales order flows

## Local Ports

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4010`
- PostgreSQL: `localhost:55432`

## Current Status

- Frontend scaffold is in place
- Backend scaffold is in place
- Auth register/login is working
- SKU create/list is working
- Database schema exists in `prisma/schema.prisma`
- SQL bootstrap exists in `prisma/init.sql`

## Prisma Note

Prisma client generation works in this environment.

During this setup session, Prisma schema engine commands such as `db push` and `migrate dev`
were unstable in the current runtime, so the database was initialized using:

- `prisma/schema.prisma` as the source schema
- `prisma/init.sql` as the executed bootstrap SQL

This keeps the project moving while preserving the Prisma data model for later recovery.
