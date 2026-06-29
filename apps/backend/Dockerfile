FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
RUN npm install

FROM deps AS build
COPY apps/backend apps/backend
# prisma.config.ts requires DATABASE_URL; generate only reads schema — no DB connection.
# Use a throwaway URL at build time. Runtime gets the real URL from docker-compose env_file.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
WORKDIR /app/apps/backend
RUN npx prisma generate
WORKDIR /app
RUN test -f node_modules/.prisma/client/default.js
ENV NODE_OPTIONS=--max-old-space-size=768
RUN npm run build:docker -w apps/backend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend ./apps/backend
COPY package.json ./
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "apps/backend"]
