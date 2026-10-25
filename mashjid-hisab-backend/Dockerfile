FROM node:24-alpine

WORKDIR /app

# Install dependencies needed for native modules
RUN apk add --no-cache libc6-compat

# Install node dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy schema and generate Prisma client
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npx prisma generate

# Copy application source code
COPY . .

# Ensure upload directory exists
RUN mkdir -p uploads

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
