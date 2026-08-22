# Switched from a plain Node image to Playwright's official one — the
# proxy-comparison probe (Test C) launches a real Chromium through the
# Bright Data proxy, same as gdms-service does for the real login flow.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/server.js"]
