FROM node:24-alpine AS base

WORKDIR /app

# Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Build
FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

# Production
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3010

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3010

CMD ["npm", "start"]
