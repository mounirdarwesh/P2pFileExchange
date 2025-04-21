FROM node:alpine

ENV NODE_ENV=production

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# If you are building your code for production
RUN npm ci --legacy-peer-deps --omit=dev

# Bundle app source
COPY . .

EXPOSE 3000
USER node
CMD ["node", "server.js" ]