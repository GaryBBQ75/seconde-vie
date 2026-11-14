FROM node:24-bookworm-slim AS build
WORKDIR /build/demo
COPY demo/package.json demo/package-lock.json ./
RUN npm ci --no-audit
COPY demo/ ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
RUN install -d -m 700 -o node -g node /data && touch /data/.volume
COPY demo/package.json ./demo/
COPY --from=build /build/demo/dist/client ./demo/dist/client
COPY demo/drizzle ./demo/drizzle
COPY demo/worker ./demo/worker
COPY demo/public/*.js ./demo/public/
COPY demo/scripts/local-bindings.mjs ./demo/scripts/
COPY demo/self-host ./demo/self-host
COPY catalogue/worker ./catalogue/worker
COPY catalogue/public ./catalogue/public
COPY package.json ./
COPY src/domain.js ./src/
USER node
EXPOSE 3000
CMD ["node", "demo/self-host/server.mjs"]
