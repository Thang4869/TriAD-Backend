# ========== Stage 1: Development ==========
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=development

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 5000

CMD ["npm", "run", "dev"]

# ========== Stage 2: Build ==========
FROM development AS builder

RUN npm run build

# ========== Stage 3: Production ==========
FROM node:20-alpine AS production

WORKDIR /app

# Copy production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built dist and Prisma schema
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Generate Prisma client in production
RUN npx prisma generate

EXPOSE 5000

CMD ["node", "dist/server.js"]