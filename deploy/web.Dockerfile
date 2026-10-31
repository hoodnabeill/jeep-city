# Web app (built React client) behind nginx, with /api proxied to the API container.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
RUN npm ci --workspace @jc/client --include-workspace-root --no-audit --no-fund
COPY packages packages
COPY apps/client apps/client
RUN npm run build -w @jc/client

FROM nginx:1.29-alpine
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
