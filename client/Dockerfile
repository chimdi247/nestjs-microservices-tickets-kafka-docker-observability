# Next.js client for EventFlow (dev default port 4000, calls the API gateway from the browser)
#
# NEXT_PUBLIC_* variables are inlined at BUILD time, so the API URL has to be the address
# the *browser* uses to reach the gateway (e.g. http://<vm-ip>:3000), not a Docker hostname.

# ---------- dependencies ----------
FROM node:20-alpine AS deps
# pnpm 10 on purpose: newer majors fail the install when dependency build scripts are skipped
RUN npm install -g pnpm@10
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

# ---------- build ----------
FROM node:20-alpine AS builder
RUN npm install -g pnpm@10
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL=http://136.71.169.139:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- run ----------
FROM node:20-alpine AS runner
RUN npm install -g pnpm@10
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4000
COPY --from=builder /app ./
EXPOSE 4000
CMD ["pnpm", "exec", "next", "start", "-p", "4000"]
