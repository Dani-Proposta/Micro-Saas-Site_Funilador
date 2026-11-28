# Compilação do frontend: dependências de desenvolvimento ficam neste estágio.
FROM node:24-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --include=dev
COPY web/ ./
RUN npm run build

# Dependências de execução da API, sem compiladores ou dependências de dev.
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node api/src/ ./src/
COPY --from=web-build --chown=node:node /app/web/dist/ /app/web/dist/
COPY --chown=node:node LICENSE.md THIRD_PARTY_NOTICES.md /app/
COPY --chown=node:node licenses/ /app/licenses/
USER node
EXPOSE 3000
CMD ["node", "src/server.ts"]
