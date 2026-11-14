# ---------- Build ----------
FROM node:20-alpine AS build
WORKDIR /app

# Prisma links against OpenSSL to choose its engine. Without the package present
# the detection silently falls back to 1.1.x and resolves an engine filename
# that was never downloaded, so it must be installed in this stage too.
RUN apk add --no-cache openssl

COPY backend/package*.json ./
RUN npm ci
COPY backend .
RUN npx prisma generate && npm run build

# ---------- Runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# su-exec drops privileges in the entrypoint after the volume has been mounted.
RUN apk add --no-cache openssl su-exec
RUN addgroup -S forge && adduser -S forge -G forge

# Ownership is set during the copy. The server runs unprivileged, and Prisma
# writes into node_modules if it ever has to resolve an engine at boot.
COPY --from=build --chown=forge:forge /app/node_modules ./node_modules
COPY --from=build --chown=forge:forge /app/dist ./dist
COPY --from=build --chown=forge:forge /app/prisma ./prisma
COPY --from=build --chown=forge:forge /app/package.json ./package.json

# Created here so the image is usable without a volume, but this directory is
# hidden the moment Railway mounts one over /data. The entrypoint re-creates it
# and fixes ownership at runtime; that is the copy that actually gets used.
RUN mkdir -p /data/uploads && chown -R forge:forge /data
ENV STORAGE_DIR=/data/uploads

# No `USER forge` here. The container must start as root so the entrypoint can
# chown the mounted volume; it drops to forge before exec-ing the server, so
# the Node process itself is still unprivileged.
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/api-entrypoint.sh \
    && chmod +x /usr/local/bin/api-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
