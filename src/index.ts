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
  const server = new McpServer({ name: 'container-tracking', version: '1.1.0' })

  // 15 tokens — portfolio overview
  server.registerTool(
    'getShipmentSummary',
    {
      title: 'Get Shipment Summary',
      description: 'Overview of your entire container portfolio: total active, exceptions, arriving soon, demurrage risk. Use this first to identify which shipments need attention.',
      inputSchema: {
        filter: z
          .enum(['all', 'exceptions', 'arriving_soon', 'demurrage_risk'])
          .optional()
          .default('all')
          .describe('Focus on a subset: all (default), exceptions, arriving_soon, demurrage_risk'),
      },
      outputSchema: {
        total: z.number().describe('Total number of active containers'),
        exceptions: z.number().describe('Containers with issues requiring attention'),
        arriving_soon: z.number().describe('Containers arriving within 48 hours'),
        demurrage_risk: z.number().describe('Containers at risk of demurrage charges'),
        containers: z.array(z.object({
          id: z.string(),
          status: z.string(),
          eta: z.string().optional(),
          origin: z.string().optional(),
          destination: z.string().optional(),
        })).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ filter }) => {
      if (!apiKey) return { content: [{ type: 'text', text: NO_KEY_ERROR.content[0].text }], isError: true }
      const params = filter && filter !== 'all' ? `?filter=${filter}` : ''
      const result = await callApi<Record<string, unknown>>(apiKey, `/containers/summary${params}`)
      if (!result.ok) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      return { structuredContent: result.data as never, content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 50 tokens — full container status
  server.registerTool(
    'getContainerDetail',
    {
      title: 'Get Container Detail',
      description: 'Full status for one container: current location, route, ETA with confidence percentage, carrier, vessel name and IMO, complete event history, and AI-generated narrative summary.',
      inputSchema: {
        container_id: z
          .string()
          .describe('Container number (e.g. MSCU7349821) or B/L number (e.g. MAEU123456789)'),
      },
      outputSchema: {
        container_number: z.string().describe('Standardised container number'),
        status: z.string().describe('Current status: in_transit, at_origin_port, discharged, delivered, etc.'),
        eta: z.string().optional().describe('Estimated arrival at destination (ISO 8601)'),
        eta_confidence: z.number().optional().describe('ETA confidence score 0-100'),
        vessel: z.object({ name: z.string(), imo: z.string().optional() }).optional(),
        origin: z.object({ name: z.string(), unlocode: z.string().optional() }).optional(),
        destination: z.object({ name: z.string(), unlocode: z.string().optional() }).optional(),
        events: z.array(z.object({ type: z.string(), date: z.string(), description: z.string() })).optional(),
        narrative: z.string().optional().describe('AI-generated plain-English shipment narrative'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ container_id }) => {
      if (!apiKey) return { content: [{ type: 'text', text: NO_KEY_ERROR.content[0].text }], isError: true }
      const encoded = encodeURIComponent(container_id.toUpperCase().trim())
      const result = await callApi<Record<string, unknown>>(apiKey, `/containers/lookup/${encoded}`)
      if (!result.ok) return { content: [{ type: 'text', text: `Not found: ${result.error}` }], isError: true }
      return { structuredContent: result.data as never, content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 25 tokens — live AIS vessel position
  server.registerTool(
    'getVesselPosition',
    {
      title: 'Get Vessel Position',
      description: 'Live AIS position for a vessel: latitude, longitude, speed over ground, heading, and navigational status. Use the IMO number from get_container_detail.',
      inputSchema: {
        imo: z.string().describe('IMO number (e.g. 9463297) — found in get_container_detail response'),
      },
      outputSchema: {
        imo: z.string(),
        vessel_name: z.string().optional(),
        lat: z.number().describe('Latitude in decimal degrees'),
        lng: z.number().describe('Longitude in decimal degrees'),
        speed_knots: z.number().optional().describe('Speed over ground in knots'),
        heading_deg: z.number().optional().describe('True heading in degrees'),
        nav_status: z.string().optional().describe('AIS navigational status'),
        updated_at: z.string().optional().describe('Timestamp of last AIS position fix'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ imo }) => {
      if (!apiKey) return { content: [{ type: 'text', text: NO_KEY_ERROR.content[0].text }], isError: true }
      const result = await callApi<Record<string, unknown>>(apiKey, `/vessels/${imo}/position`)
      if (!result.ok) return { content: [{ type: 'text', text: `Position unavailable: ${result.error}` }], isError: true }
      return { structuredContent: result.data as never, content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 20 tokens — demurrage risk report
  server.registerTool(
    'getDemurrageReport',
    {
      title: 'Get Demurrage Report',
      description: 'Demurrage and detention risk report: which containers are near or past their free days, applicable daily rates, and projected cost if not moved.',
      inputSchema: {
        container_id: z
          .string()
          .optional()
          .describe('Optional: scope report to one container ID. Omit for full portfolio report.'),
      },
      outputSchema: {
        total_at_risk: z.number().optional().describe('Number of containers at demurrage risk'),
        total_projected_cost: z.number().optional().describe('Total projected demurrage cost in USD'),
        containers: z.array(z.object({
          container_id: z.string(),
          free_days_remaining: z.number(),
          daily_rate_usd: z.number(),
          projected_cost_usd: z.number(),
          port: z.string().optional(),
        })).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ container_id }) => {
      if (!apiKey) return { content: [{ type: 'text', text: NO_KEY_ERROR.content[0].text }], isError: true }
      const path = container_id
        ? `/containers/${encodeURIComponent(container_id)}/demurrage`
        : '/containers/demurrage'
      const result = await callApi<Record<string, unknown>>(apiKey, path)
      if (!result.ok) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      return { structuredContent: result.data as never, content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 15 tokens — port congestion
  server.registerTool(
    'getPortCongestion',
    {
      title: 'Get Port Congestion',
      description: 'Current congestion level at one or more ports: average vessel wait time in hours, number of vessels at anchor, and congestion level (low/moderate/high/severe). Use UN/LOCODE identifiers.',
      inputSchema: {
        port_codes: z
          .array(z.string().toUpperCase())
          .min(1)
          .describe('UN/LOCODE codes e.g. ["NLRTM", "GBFXT", "DEHAM", "CNSHA"]'),
      },
      outputSchema: {
        ports: z.array(z.object({
          unlocode: z.string(),
          name: z.string().optional(),
          congestion_level: z.enum(['low', 'moderate', 'high', 'severe']),
          avg_wait_hours: z.number().optional(),
          vessels_at_anchor: z.number().optional(),
          updated_at: z.string().optional(),
        })),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ port_codes }) => {
      if (!apiKey) return { content: [{ type: 'text', text: NO_KEY_ERROR.content[0].text }], isError: true }
      const query = port_codes.map((p) => `codes=${p}`).join('&')
      const result = await callApi<Record<string, unknown>>(apiKey, `/ports/congestion?${query}`)
      if (!result.ok) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      return { structuredContent: result.data as never, content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  // 10 tokens — add container
  server.registerTool(
    'addContainer',
    {
      title: 'Add Container',
      description: 'Start tracking a new container or bill of lading number. The first status update appears within 15 minutes. Optional tags help organise containers by client, project, or urgency.',
      inputSchema: {
        identifier: z.string().describe('Container number (e.g. MSCU7349821) or B/L number (e.g. MAEU123456789)'),
        identifier_type: z
          .enum(['container_id', 'bill_of_lading'])
          .describe('Type of identifier: container_id or bill_of_lading'),
        tags: z.array(z.string()).optional().describe('Optional labels e.g. ["client-acme", "urgent", "Q1-shipment"]'),
      },
      outputSchema: {
        id: z.string().describe('Internal container UUID'),
        container_number: z.string().optional(),
        status: z.string().describe('Initial tracking status'),
        created_at: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ identifier, identifier_type, tags }) => {
      if (!apiKey) return { content: [{ type: 'text', text: NO_KEY_ERROR.content[0].text }], isError: true }
      const result = await callApi<Record<string, unknown>>(apiKey, '/containers', {
        method: 'POST',
        body: { identifier: identifier.toUpperCase().trim(), identifier_type, tags: tags ?? [] },
      })
      if (!result.ok) return { content: [{ type: 'text', text: `Could not add: ${result.error}` }], isError: true }
      return { structuredContent: result.data as never, content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  return server
}

// Session stores — keyed by Mcp-Session-Id
const mcpSessions = new Map<string, StreamableHTTPServerTransport>()
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

  // Streamable HTTP (MCP 2024-11-05+) — session-aware
  if (pathname === '/mcp') {
    const body = await readBody(req)
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    // Reuse existing session if present
    if (sessionId && mcpSessions.has(sessionId)) {
      const transport = mcpSessions.get(sessionId)!
      await transport.handleRequest(req, res, body)
      return
    }

    // New session — create transport + server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        mcpSessions.set(id, transport)
        // Clean up session after 30 minutes of inactivity
        setTimeout(() => mcpSessions.delete(id), 30 * 60 * 1000)
      },
    })
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
