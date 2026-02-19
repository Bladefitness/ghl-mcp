# GHL MCP Server

A remote MCP (Model Context Protocol) server running on Cloudflare Workers that gives AI agents full programmatic access to GoHighLevel.

## What This Does

Your AI agents connect to this server as a tool. They can then create, read, update, and delete custom fields, custom values, and custom field folders in your GHL account — no manual work required.

**Current capabilities (Phase 1):**
- Contact-level custom fields (full CRUD + bulk create)
- Custom object fields (Custom Objects + Company)
- Custom field folders
- Custom values (location-wide variables)

**Planned (Phase 2+):**
- Contacts management
- Opportunities & Pipelines
- Calendars & Appointments
- Conversations & Messaging
- Workflows
- And every other GHL API endpoint

## Architecture

```
Your AI Agent (Claude, GPT, etc.)
        │
        │  MCP Protocol (Streamable HTTP)
        ▼
┌─────────────────────────┐
│  Cloudflare Worker       │
│  (GHL MCP Server)        │
│                          │
│  ┌────────────────────┐  │
│  │  McpAgent          │  │  ← Durable Object (stateful sessions)
│  │  (tools defined)   │  │
│  └────────┬───────────┘  │
│           │              │
│  ┌────────▼───────────┐  │
│  │  GHL API Client    │  │  ← Typed HTTP client
│  └────────┬───────────┘  │
└───────────┼──────────────┘
            │
            │  REST API (Bearer token)
            ▼
┌─────────────────────────┐
│  GoHighLevel API         │
│  services.leadconnector  │
│  hq.com                  │
└─────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- A Cloudflare account
- A GoHighLevel Private Integration Token
- Your GHL Location ID (Sub-Account ID)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/ghl-mcp-server.git
cd ghl-mcp-server
npm install
```

### 2. Configure Secrets

For local development, copy the example env file:
```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual GHL credentials
```

For production deployment, set secrets via Wrangler:
```bash
npx wrangler secret put GHL_API_KEY
npx wrangler secret put GHL_LOCATION_ID
```

### 3. Deploy

```bash
npm run deploy
```

Your MCP server will be live at: `https://ghl-mcp-server.YOUR_SUBDOMAIN.workers.dev/sse`

### 4. Connect Your AI Agent

Use the deployed URL as an MCP server endpoint in your AI agent's configuration.

For Claude Desktop (via mcp-remote proxy):
```json
{
  "mcpServers": {
    "ghl": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://ghl-mcp-server.YOUR_SUBDOMAIN.workers.dev/sse"
      ]
    }
  }
}
```

## Available Tools

### Contact-Level Custom Fields
| Tool | Description |
|------|-------------|
| `ghl_list_contact_custom_fields` | List all contact custom fields |
| `ghl_get_contact_custom_field` | Get a specific field by ID |
| `ghl_create_contact_custom_field` | Create a single field |
| `ghl_update_contact_custom_field` | Update a field |
| `ghl_delete_contact_custom_field` | Delete a field |
| `ghl_bulk_create_contact_custom_fields` | Create multiple fields at once |

### Custom Object Fields
| Tool | Description |
|------|-------------|
| `ghl_list_object_custom_fields` | List fields for a custom object |
| `ghl_create_object_custom_field` | Create a field on a custom object |
| `ghl_create_custom_field_folder` | Create a folder for organizing fields |

### Custom Values
| Tool | Description |
|------|-------------|
| `ghl_list_custom_values` | List all custom values |
| `ghl_create_custom_value` | Create a custom value |
| `ghl_update_custom_value` | Update a custom value |
| `ghl_delete_custom_value` | Delete a custom value |

## Supported Field Types

| Type | Description |
|------|-------------|
| `TEXT` | Single-line text |
| `LARGE_TEXT` | Multi-line text |
| `NUMERICAL` | Number |
| `PHONE` | Phone number |
| `MONETORY` | Currency/money |
| `EMAIL` | Email address |
| `DATE` | Date picker |
| `CHECKBOX` | Checkbox |
| `SINGLE_OPTIONS` | Dropdown (single select) |
| `MULTIPLE_OPTIONS` | Multi-select |
| `RADIO` | Radio buttons |
| `FILE_UPLOAD` | File attachment |
| `TEXTBOX_LIST` | List of text inputs |

## Roadmap

### Phase 2: Contacts
- Create, update, delete, search contacts
- Bulk contact operations
- Tag management
- Notes and tasks

### Phase 3: Opportunities & Pipelines
- Pipeline management
- Opportunity CRUD
- Stage updates

### Phase 4: Calendars & Conversations
- Calendar management
- Appointment scheduling
- Send messages (SMS, email)

### Phase 5: Workflows & Automation
- Trigger workflows
- Manage workflow configurations

### Phase 6: Everything Else
- Forms, Surveys, Funnels
- Payments, Invoices, Products
- Media library
- Social media posting

## Development

```bash
# Local development
npm run dev

# Deploy to production
npm run deploy
```

## GHL API Reference

This server is built against the [GoHighLevel API V2](https://marketplace.gohighlevel.com/docs/). The OpenAPI specs from the [official docs repo](https://github.com/GoHighLevel/highlevel-api-docs) are included in `/api-specs` for reference.

## License

MIT
