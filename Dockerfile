FROM node:20-alpine

WORKDIR /app

# Install deps first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app
COPY *.js ./
COPY public/ ./public/

# Non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "webhook.js"]
