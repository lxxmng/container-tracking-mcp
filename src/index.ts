/**
 * Container Tracking MCP Server
 * Connects Claude, ChatGPT, Cursor, and any MCP-compatible AI to live ocean freight data.
 *
 * Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "container-tracking": {
 *       "type": "streamable-http",
 *       "url": "https://mcp.trackingmcp.com/mcp",
 *       "headers": { "Authorization": "Bearer YOUR_API_KEY" }
 *     }
 *   }
 * }
 *
 * Get a free API key → https://trackingmcp.com/mcp
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { z } from 'zod'

const API_BASE = process.env.API_BASE_URL ?? 'https://api.trackingmcp.com/v1'
const PORT = Number.parseInt(process.env.MCP_PORT ?? '3002')

function extractApiKey(req: IncomingMessage): string {
  const auth = req.headers['authorization'] ?? ''
  return (auth as string).match(/^Bearer\s+(.+)$/i)?.[1] ?? ''
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString()
        resolve(text ? JSON.parse(text) : undefined)
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', reject)
  })
}

async function callApi<T>(
  apiKey: string,
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TrackingMCP-Server/1.0',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      return { ok: false, error: `API ${res.status}: ${text}` }
    }
    const json = await res.json()
    return { ok: true, data: json.data ?? json }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

const NO_KEY_ERROR = {
  content: [{ type: 'text' as const, text: 'Error: Missing API key. Set Authorization: Bearer YOUR_API_KEY — get one free at trackingmcp.com/mcp' }],
  isError: true,
}

function buildServer(apiKey: string): McpServer {
  const server = new McpServer({ name: 'container-tracking', version: '1.0.0' })

  // 15 tokens — portfolio overview
  server.tool(
    'get_shipment_summary',
    'Overview of your entire container portfolio: total active, exceptions, arriving soon, demurrage risk.',
    {
      filter: z
        .enum(['all', 'exceptions', 'arriving_soon', 'demurrage_risk'])
        .optional()
        .default('all')
        .describe('Focus on a subset: all (default), exceptions, arriving_soon, demurrage_risk'),
    },
    async ({ filter }) => {
      if (!apiKey) return NO_KEY_ERROR
      const params = filter && filter !== 'all' ? `?filter=${filter}` : ''
      const result = await callApi(apiKey, `/containers/summary${params}`)
      if (!result.ok) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 50 tokens — full container status
  server.tool(
    'get_container_detail',
    'Full status for one container: route, ETA with confidence %, carrier, vessel, event history, AI narrative.',
    {
      container_id: z
        .string()
        .describe('Container number (e.g. MSCU7349821) or B/L number (e.g. MAEU123456789)'),
    },
    async ({ container_id }) => {
      if (!apiKey) return NO_KEY_ERROR
      const encoded = encodeURIComponent(container_id.toUpperCase().trim())
      const result = await callApi(apiKey, `/containers/lookup/${encoded}`)
      if (!result.ok) return { content: [{ type: 'text', text: `Not found: ${result.error}` }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 25 tokens — live AIS vessel position
  server.tool(
    'get_vessel_position',
    'Live AIS position for a vessel: lat/lng, speed, heading, nav status. Use the IMO from get_container_detail.',
    {
      imo: z.string().describe('IMO number (e.g. 9463297) — found in get_container_detail response'),
    },
    async ({ imo }) => {
      if (!apiKey) return NO_KEY_ERROR
      const result = await callApi(apiKey, `/vessels/${imo}/position`)
      if (!result.ok) return { content: [{ type: 'text', text: `Position unavailable: ${result.error}` }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 20 tokens — demurrage risk report
  server.tool(
    'get_demurrage_report',
    'Demurrage and detention risk: which containers are near or past free days, daily rates, projected costs.',
    {
      container_id: z
        .string()
        .optional()
        .describe('Optional: scope to one container ID. Omit for full portfolio report.'),
    },
    async ({ container_id }) => {
      if (!apiKey) return NO_KEY_ERROR
      const path = container_id
        ? `/containers/${encodeURIComponent(container_id)}/demurrage`
        : '/containers/demurrage'
      const result = await callApi(apiKey, path)
      if (!result.ok) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 15 tokens — port congestion
  server.tool(
    'get_port_congestion',
    'Congestion at any port: avg wait hours, vessels at anchor, level (low/moderate/high/severe). Use UN/LOCODE.',
    {
      port_codes: z
        .array(z.string().toUpperCase())
        .min(1)
        .describe('UN/LOCODE codes e.g. ["NLRTM", "GBFXT", "DEHAM", "CNSHA"]'),
    },
    async ({ port_codes }) => {
      if (!apiKey) return NO_KEY_ERROR
      const query = port_codes.map((p) => `codes=${p}`).join('&')
      const result = await callApi(apiKey, `/ports/congestion?${query}`)
      if (!result.ok) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 10 tokens — add container
  server.tool(
    'add_container',
    'Start tracking a new container or B/L number. First status update within 15 minutes.',
    {
      identifier: z.string().describe('Container number or B/L number to start tracking'),
      identifier_type: z
        .enum(['container_id', 'bill_of_lading'])
        .describe('Type of the identifier'),
      tags: z.array(z.string()).optional().describe('Optional labels e.g. ["client-acme", "urgent"]'),
    },
    async ({ identifier, identifier_type, tags }) => {
      if (!apiKey) return NO_KEY_ERROR
      const result = await callApi(apiKey, '/containers', {
        method: 'POST',
        body: { identifier: identifier.toUpperCase().trim(), identifier_type, tags: tags ?? [] },
      })
      if (!result.ok) return { content: [{ type: 'text', text: `Could not add: ${result.error}` }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  return server
}

// SSE session store
const sseSessions = new Map<string, SSEServerTransport>()

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const { pathname } = url

  // Health check — no auth required
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'container-tracking-mcp', version: '1.0.0' }))
    return
  }

  const apiKey = extractApiKey(req)

  // Streamable HTTP (MCP 2024-11-05+)
  if (pathname === '/mcp') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    })
    const body = await readBody(req)
    await buildServer(apiKey).connect(transport)
    await transport.handleRequest(req, res, body)
    return
  }

  // SSE transport (legacy clients)
  if (pathname === '/sse' && req.method === 'GET') {
    const transport = new SSEServerTransport('/messages', res)
    const id = crypto.randomUUID()
    sseSessions.set(id, transport)
    await buildServer(apiKey).connect(transport)
    await transport.start()
    return
  }

  if (pathname === '/messages' && req.method === 'POST') {
    const sessionId = url.searchParams.get('sessionId')
    const transport = sessionId ? sseSessions.get(sessionId) : null
    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Session not found' }))
      return
    }
    const body = await readBody(req)
    await transport.handlePostMessage(req, res, body)
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    service: 'Container Tracking MCP',
    docs: 'https://trackingmcp.com/mcp',
    endpoints: { mcp: '/mcp', sse: '/sse', health: '/health' },
  }))
})

httpServer.listen(PORT, () => {
  console.log(`Container Tracking MCP server on :${PORT}`)
})
