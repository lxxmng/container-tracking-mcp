FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source
COPY src ./src

EXPOSE 3002

ENV NODE_ENV=production
ENV MCP_PORT=3002

CMD ["bun", "run", "src/index.ts"]
