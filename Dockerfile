FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
COPY --chown=app:app package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=app:app hq ./hq
COPY --chown=app:app evaluation ./evaluation
COPY --chown=app:app server ./server
USER app
EXPOSE 8080
CMD ["node", "server/index.mjs"]
