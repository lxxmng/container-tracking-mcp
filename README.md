# Container Tracking MCP Server

[![npm](https://img.shields.io/npm/v/container-tracking-mcp)](https://www.npmjs.com/package/container-tracking-mcp)
[![smithery badge](https://smithery.ai/badge/lxxmng/container-tracking)](https://smithery.ai/servers/lxxmng/container-tracking)

**Track ocean containers across 200+ shipping lines from Claude, ChatGPT, Cursor, or any MCP client.**

Container Tracking MCP is an ocean-freight MCP server that lets an AI assistant track a container via MCP across **225 carriers** — including Maersk, MSC, CMA CGM, COSCO, and Hapag-Lloyd. Track by container number, bill of lading, or booking number to get live milestones, vessel position, ETA, and demurrage & detention free time as DCSA-normalised events. It runs as a hosted remote server, so there is nothing to self-host.

Ask your AI: *"Where is container MSCU7349821?"* or *"Which shipments have demurrage risk this week?"*

## Supported carriers & coverage

Container Tracking MCP covers **200+ ocean shipping lines (225 carriers)**. Top lines include:

Maersk · MSC · CMA CGM · COSCO · Hapag-Lloyd · ONE (Ocean Network Express) · Evergreen · HMM · Yang Ming · ZIM · OOCL · Wan Hai · PIL · Hyundai · SITC · KMTC · Matson · Sinokor · Heung-A · Namsung — **and 200+ more.**

Every carrier is normalised to the **DCSA** ocean-tracking event standard, so a milestone from any line looks the same to your AI client. Track by:

- **Container number** (e.g. `MSCU7349821`)
- **Bill of lading number**
- **Booking number**

You get: live milestone events, current vessel name + IMO, live AIS vessel position, ETA with a confidence percentage, demurrage & detention free-time countdown, and port congestion signals.

## Tools

| Tool | What it does |
|------|-------------|
| `getShipmentSummary` | Portfolio overview: total active containers, exceptions, arriving soon, and demurrage risk. Use first to see what needs attention. |
| `getContainerDetail` | Full status for one container: current location, route, ETA with confidence %, carrier, vessel name + IMO, complete event history, and an AI-generated narrative. |
| `getVesselPosition` | Live AIS position for a vessel: latitude, longitude, speed over ground, heading, and navigational status (by IMO). |
| `getDemurrageReport` | Demurrage & detention risk: which containers are near or past free days, daily rates, and projected cost if not moved. |
| `getPortCongestion` | Congestion at one or more ports by UN/LOCODE: average vessel wait time, vessels at anchor, and level (low/moderate/high/severe). |
| `addContainer` | Start tracking a new container ID or bill of lading. First status update arrives within ~15 minutes; optional tags organise by client, project, or urgency. |

## Quick connect

The server is hosted at `https://mcp.trackingmcp.com/mcp`. Try it with **zero signup** using the public demo key `tmcp_demo_public`, or [get a free API key](https://trackingmcp.com/mcp).

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "container-tracking": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.trackingmcp.com/mcp",
               "--header", "Authorization: Bearer tmcp_demo_public"]
    }
  }
}
```

### Cursor / Windsurf / VS Code (native HTTP MCP)

```json
{
  "mcpServers": {
    "container-tracking": {
      "url": "https://mcp.trackingmcp.com/mcp",
      "headers": { "Authorization": "Bearer tmcp_demo_public" }
    }
  }
}
```

Replace `tmcp_demo_public` with your own key from [trackingmcp.com/mcp](https://trackingmcp.com/mcp) for live production tracking. Registry ID: `io.github.lxxmng/container-tracking`.

## Example prompts

- *"Where is container MSCU7349821?"*
- *"What's the status of bill of lading HLCU2840012?"*
- *"Give me a summary of all active shipments."*
- *"Which containers arrive at Rotterdam this week?"*
- *"Am I at risk of demurrage on any containers?"*
- *"How congested is Felixstowe port right now?"*
- *"Start tracking BL MAEU123456789."*

## Pricing

Token-metered, no subscription. Starter 3,000 tokens €49 · Growth 15,000 €199 · Pro 50,000 €549 · Enterprise 100,000 €849. Tokens never expire. One full container check (`getContainerDetail` + `getVesselPosition` + `getShipmentSummary`) ≈ 90 tokens. See [trackingmcp.com/pricing](https://trackingmcp.com/pricing).

## Links

- Product: [trackingmcp.com](https://trackingmcp.com)
- Get an API key: [trackingmcp.com/mcp](https://trackingmcp.com/mcp)
- Docs: [trackingmcp.com/docs](https://trackingmcp.com/docs)
- Pricing: [trackingmcp.com/pricing](https://trackingmcp.com/pricing)
- Status: [status.trackingmcp.com](https://status.trackingmcp.com)

## License

MIT
