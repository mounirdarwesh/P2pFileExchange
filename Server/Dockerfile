FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --legacy-peer-deps --omit=dev

COPY . .

EXPOSE 3000

# The server speaks HTTPS with mutual TLS and exposes no plain HTTP route,
# so liveness is a TCP connect rather than a request.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('net').connect(Number(process.env.PORT) || 3000, '127.0.0.1').on('connect', function () { process.exit(0) }).on('error', function () { process.exit(1) })"

USER node

CMD ["node", "server.js"]
