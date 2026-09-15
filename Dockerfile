FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p data && chown -R node:node /app
USER node
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["npm", "run", "server"]
