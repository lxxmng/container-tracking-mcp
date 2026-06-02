# Container Tracking MCP

[![smithery badge](https://smithery.ai/badge/lxxmng/container-tracking)](https://smithery.ai/servers/lxxmng/container-tracking)

Track ocean freight containers directly from Claude, ChatGPT, Cursor, or any MCP-compatible AI assistant.

Ask your AI: *"Where is container MSCU7349821?"* or *"Which shipments have demurrage risk this week?"*

## Quick setup

### Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "container-tracking": {
      "type": "streamable-http",
      "url": "https://mcp.trackingmcp.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Cursor / VS Code
```json
{
  "mcp": {
    "servers": {
      "container-tracking": {
        "type": "http",
        "url": "https://mcp.trackingmcp.com/mcp",
        "headers": { "Authorization": "Bearer YOUR_API_KEY" }
      }
    }
  }
}
```

→ **[Get your free API key](https://trackingmcp.com/mcp)**

## Tools

| Tool | Tokens | What it does |
|------|--------|-------------|
| `getShipmentSummary` | 15 | Portfolio overview: exceptions, arriving soon, demurrage risk |
| `getContainerDetail` | 50 | Full status: route, ETA, vessel, events, AI narrative |
| `getVesselPosition` | 25 | Live AIS: lat/lng, speed, heading |
| `getDemurrageReport` | 20 | Risk report: free days left, daily rates, projected cost |
| `getPortCongestion` | 15 | Wait times at any port by UN/LOCODE |
| `addContainer` | 10 | Start tracking a container ID or B/L |

## Token pricing

| Pack | Tokens | Price | Per container check |
|------|--------|-------|---------------------|
| Starter | 3,000 | €49 | €1.47 |
| Growth | 15,000 | €199 | €1.19 |
| Pro | 50,000 | €549 | €0.99 |
| Enterprise | 100,000 | €849 | €0.76 |

*One "container check" = get_container_detail + get_vessel_position + get_shipment_summary = 90 tokens*

Tokens never expire. [Buy at trackingmcp.com/pricing](https://trackingmcp.com/pricing)

## Example questions

- *"Give me a summary of all active shipments"*
- *"What's the status of HLCU2840012?"*
- *"Which containers arrive at Rotterdam this week?"*
- *"Am I at risk of demurrage on any containers?"*
- *"How congested is Felixstowe port right now?"*
- *"Start tracking BL MAEU123456789"*

## Links

[Dashboard](https://trackingmcp.com) · [Docs](https://trackingmcp.com/docs) · [Pricing](https://trackingmcp.com/pricing) · [Status](https://status.trackingmcp.com)
