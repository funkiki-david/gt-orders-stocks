FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci

COPY . .
RUN npm run build:backend

ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma db push --schema prisma/schema.prisma && npm run start:backend"]
