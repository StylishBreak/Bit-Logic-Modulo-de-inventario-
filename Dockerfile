FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY dist/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY dist/src ./src
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
