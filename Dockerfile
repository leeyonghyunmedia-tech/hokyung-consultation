FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node web ./web
COPY --chown=node:node scripts ./scripts
USER node
ENV HOST=0.0.0.0 PORT=5173
EXPOSE 5173
CMD ["node","scripts/serve.mjs"]
