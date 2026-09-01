# Alpine keeps the image small. The major version is pinned so rebuilds stay
# reproducible and a new Node release cannot silently change runtime behaviour.
FROM node:22-alpine

# Set before the install so npm and any dependency that branches on it see
# production mode at build time as well as at run time.
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Layer-cache boundary: the manifests are copied alone, ahead of the source, so
# the install below is reused from cache on every build where dependencies did
# not change. Moving this after `COPY . .` would re-install on every code edit.
COPY package*.json ./

# `npm ci` installs strictly from package-lock.json, so builds are reproducible
# rather than resolving fresh versions. --omit=dev leaves the ESLint toolchain
# out of the image; only the runtime dependencies are needed here.
RUN npm ci --legacy-peer-deps --omit=dev

# Application source last: routine code changes invalidate only this layer and
# the cheap metadata below, never the dependency install above.
COPY . .

EXPOSE 3000

# The server speaks HTTPS with mutual TLS and exposes no plain HTTP route, so
# liveness is a TCP connect rather than a request. An HTTP GET would fail on the
# TLS handshake, and socket.io answers 404 outside its own path in any case.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('net').connect(Number(process.env.PORT) || 3000, '127.0.0.1').on('connect', function () { process.exit(0) }).on('error', function () { process.exit(1) })"

# Drop root for the runtime; the node user ships with the base image.
USER node

CMD ["node", "server.js"]
