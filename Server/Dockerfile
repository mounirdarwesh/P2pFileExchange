FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --legacy-peer-deps --omit=dev

COPY . .

EXPOSE 3000

USER node

CMD ["node", "server.js"]
