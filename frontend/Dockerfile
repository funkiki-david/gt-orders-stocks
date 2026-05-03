FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci

COPY . .
RUN npm run build:frontend

ENV NODE_ENV=production
CMD ["sh", "-c", "npm run start:frontend"]
