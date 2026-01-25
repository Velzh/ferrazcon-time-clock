FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

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

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

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
