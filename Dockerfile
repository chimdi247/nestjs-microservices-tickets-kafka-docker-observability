
# Dependency stage
FROM node:20-alpine AS deps

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# NOTE: --no-frozen-lockfile because OpenTelemetry deps were added to package.json.
# Run `pnpm install` once locally to refresh pnpm-lock.yaml, then you can switch back to --frozen-lockfile.
RUN pnpm install --no-frozen-lockfile

# Build stage
FROM node:20-alpine AS builder

ARG SERVICE
ENV SERVICE=${SERVICE}

RUN npm install -g pnpm

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm run build ${SERVICE}

# Production stage
FROM node:20-alpine AS runner

ARG SERVICE
ENV SERVICE=${SERVICE}
ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD [ "sh", "-c", "node dist/apps/${SERVICE}/main.js" ]