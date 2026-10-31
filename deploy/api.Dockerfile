# API server image. Runs the TypeScript server with tsx (same as development), migrations run at start.
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --workspace @jc/server --include-workspace-root --no-audit --no-fund
COPY packages/core packages/core
COPY apps/server apps/server
WORKDIR /app/apps/server
RUN rm -rf .data .env.byte && mkdir -p /data/files && chown node:node /data/files
USER node
EXPOSE 8787
CMD ["npx", "tsx", "src/main.ts"]
