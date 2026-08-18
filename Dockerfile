# syntax=docker/dockerfile:1

FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS base

WORKDIR /app
RUN npm install --global pnpm@11.22.0
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS source

COPY --from=deps /app/node_modules ./node_modules
COPY . .

FROM source AS builder

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM source AS migrate

ENV NODE_ENV=production
USER nextjs
CMD ["pnpm", "db:migrate:deploy"]

FROM postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2 AS backup

COPY scripts/backup-production-db.sh /usr/local/bin/backup-production-db
RUN chmod 0555 /usr/local/bin/backup-production-db
USER postgres
ENTRYPOINT ["backup-production-db"]

FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ARG RELEASE_VERSION
ARG RELEASE_COMMIT_SHA
ARG RELEASE_BRANCH
RUN test -n "$RELEASE_VERSION" \
  && test -n "$RELEASE_COMMIT_SHA" \
  && test -n "$RELEASE_BRANCH"
ENV RELEASE_VERSION=$RELEASE_VERSION
ENV RELEASE_COMMIT_SHA=$RELEASE_COMMIT_SHA
ENV RELEASE_BRANCH=$RELEASE_BRANCH

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Next standalone tracing with pnpm does not include this exported helper directory.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/esm ./node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/esm

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
