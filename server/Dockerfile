FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npm run build
RUN npx prisma generate
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "mkdir -p data && npx prisma migrate deploy && node dist/main.js"]
