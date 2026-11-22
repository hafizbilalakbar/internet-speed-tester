FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src
COPY public ./public
RUN npm run build
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --include=dev && npm --prefix server run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev
COPY --from=build /app/dist/netvelox/browser ./dist/netvelox/browser
COPY --from=build /app/server/dist ./server/dist
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
