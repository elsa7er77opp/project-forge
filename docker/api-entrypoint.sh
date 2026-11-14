#!/bin/sh
# Runtime entrypoint for the FORGE API.
#
# Railway mounts the persistent volume over /data as root, which hides the
# directory created during the image build along with its ownership. The
# unprivileged runtime user therefore cannot write uploaded evidence unless
# ownership is corrected after the mount exists — that is, here rather than in
# the Dockerfile.
#
# The container starts as root only long enough to do that, then drops to the
# forge user with su-exec. `exec` replaces this shell so the Node process keeps
# PID 1 and still receives SIGTERM from Railway for a graceful shutdown.

set -e

STORAGE_DIR="${STORAGE_DIR:-/data/uploads}"

mkdir -p "$STORAGE_DIR"
chown -R forge:forge "$STORAGE_DIR"

exec su-exec forge sh -c './node_modules/.bin/prisma migrate deploy && node dist/server.js'
