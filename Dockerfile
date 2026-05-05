FROM node:24.12.0-bookworm-slim@sha256:7326fb2dbdce998edd72140946851be64ef4a643e8715e138ca467e8e9d92c99 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY src ./src

RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM base AS prod-deps

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

FROM base AS runtime

ENV NODE_ENV=production

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

CMD ["node", "dist/app/server.js"]
