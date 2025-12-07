FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

# IMPORTANTE: Gerar Prisma Client ANTES de compilar TypeScript
ENV DATABASE_URL="file:./temp.db"
RUN npx prisma generate

COPY src ./src

# Agora compila TypeScript (já tem os tipos do Prisma)
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

# Gerar Prisma Client também no runner (para migrations)
ENV DATABASE_URL="file:./temp.db"
RUN npx prisma generate

EXPOSE 4000

CMD ["sh", "-c", "mkdir -p data && npx prisma migrate deploy && node dist/main.js"]
