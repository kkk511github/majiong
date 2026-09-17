FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/report-xlsx/package.json server/report-xlsx/package-lock.json ./server/report-xlsx/
RUN npm ci && npm ci --prefix server/report-xlsx --ignore-scripts
COPY . .
RUN npm run build && mkdir -p data && chown -R node:node /app
USER node
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["npm", "run", "server"]
