FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node web ./web
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node drizzle ./drizzle
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=5173 SQLITE_PATH=/app/data/consultations.sqlite
EXPOSE 5173
VOLUME ["/app/data"]
CMD ["node","scripts/serve.mjs"]
