# Playwright's own image bundles Chromium plus every system library it needs
# to run — this is what Vercel's serverless functions can't provide, and is
# the entire reason this service exists as a separate always-on deployment.
# Must match the playwright npm version in package-lock.json — a mismatch
# makes chromium.launch() fail because the bundled browser build won't match.
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
