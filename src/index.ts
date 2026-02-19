/**
 * GHL MCP Server - Cloudflare Worker
 *
 * A remote MCP server that gives AI agents full control over
 * GoHighLevel across multiple sub-accounts.
 *
 * Features:
 * - Multi-account registry with D1 database
 * - Per-request account override or stored defaults
 * - Custom Fields CRUD (Location-level + Custom Objects)
 * - Custom Values CRUD
 * - Expandable to all GHL API endpoints
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GHLClient } from "./ghl-client";

// ============================================================
// Type definitions
// ============================================================

interface Env {
  GHL_API_KEY: string;
  GHL_LOCATION_ID: string;
  GHL_MCP_AGENT: DurableObjectNamespace;
  GHL_DB: D1Database;
}

interface SubAccount {
  id: string;
  name: string;
  api_key: string;
  account_type: string;
  is_default: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Database helpers
// ============================================================

async function initDb(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sub_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    account_type TEXT DEFAULT 'sub_account',
    is_default INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`
    )
    .run();
}

async function getDefaultAccount(db: D1Database): Promise<SubAccount | null> {
  const result = await db
    .prepare("SELECT * FROM sub_accounts WHERE is_default = 1 LIMIT 1")
    .first<SubAccount>();
  return result;
}

async function getAccountById(
  db: D1Database,
  locationId: string
): Promise<SubAccount | null> {
  const result = await db
    .prepare("SELECT * FROM sub_accounts WHERE id = ?")
    .bind(locationId)
    .first<SubAccount>();
  return result;
}

async function getAccountByName(
  db: D1Database,
  name: string
): Promise<SubAccount | null> {
  const result = await db
    .prepare("SELECT * FROM sub_accounts WHERE LOWER(name) LIKE LOWER(?)")
    .bind(`%${name}%`)
    .first<SubAccount>();
  return result;
}

/**
 * Resolve which GHL client to use.
 * Priority: explicit locationId param > default account in DB > env vars
 */
async function resolveClient(
  env: Env,
  locationId?: string
): Promise<GHLClient> {
  await initDb(env.GHL_DB);

  // If a specific locationId was provided, look it up
  if (locationId) {
    const account = await getAccountById(env.GHL_DB, locationId);
    if (account) {
      return new GHLClient({
        apiKey: account.api_key,
        locationId: account.id,
      });
    }
    // If not found in DB, use it with default API key (backward compat)
    return new GHLClient({
      apiKey: env.GHL_API_KEY,
      locationId: locationId,
    });
  }

  // Try the default account in DB
  const defaultAccount = await getDefaultAccount(env.GHL_DB);
  if (defaultAccount) {
    return new GHLClient({
      apiKey: defaultAccount.api_key,
      locationId: defaultAccount.id,
    });
  }

  // Fall back to env vars
  return new GHLClient({
    apiKey: env.GHL_API_KEY,
    locationId: env.GHL_LOCATION_ID,
  });
}

// ============================================================
// MCP Agent (Durable Object)
// ============================================================

export class GHLMcpAgent extends McpAgent<Env> {
  server = new McpServer({
    name: "GoHighLevel MCP Server",
    version: "2.0.0",
  });

  async init() {
    const env = this.env;

    // ==========================================================
    // ACCOUNT MANAGEMENT TOOLS
    // ==========================================================

    // ----------------------------------------------------------
    // TOOL: Add Sub-Account
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_add_sub_account",
      `Register a GHL sub-account so your agents can access it.
Stores the location ID, name, and API token securely in the database.
Set isDefault=true to make this the default account for all operations.`,
      {
        locationId: z
          .string()
          .describe("The GHL Location ID (sub-account ID)"),
        name: z
          .string()
          .describe(
            'Friendly name for this account (e.g. "Dr. Smith Dental")'
          ),
        apiKey: z
          .string()
          .describe("Private Integration Token for this sub-account"),
        accountType: z
          .enum(["agency", "sub_account"])
          .default("sub_account")
          .describe("Account type"),
        isDefault: z
          .boolean()
          .default(false)
          .describe("Set as the default account for operations"),
        notes: z
          .string()
          .optional()
          .describe("Optional notes about this account"),
      },
      async ({ locationId, name, apiKey, accountType, isDefault, notes }) => {
        try {
          await initDb(env.GHL_DB);

          // If setting as default, clear other defaults first
          if (isDefault) {
            await env.GHL_DB.prepare(
              "UPDATE sub_accounts SET is_default = 0"
            ).run();
          }

          await env.GHL_DB.prepare(
            `INSERT OR REPLACE INTO sub_accounts (id, name, api_key, account_type, is_default, notes, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
          )
            .bind(
              locationId,
              name,
              apiKey,
              accountType,
              isDefault ? 1 : 0,
              notes || null
            )
            .run();

          return {
            content: [
              {
                type: "text" as const,
                text: `Sub-account "${name}" (${locationId}) registered successfully!${isDefault ? " Set as default." : ""}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: List Sub-Accounts
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_list_sub_accounts",
      "List all registered GHL sub-accounts. Shows name, location ID, account type, and which is the default. API keys are masked for security.",
      {},
      async () => {
        try {
          await initDb(env.GHL_DB);
          const results = await env.GHL_DB.prepare(
            "SELECT id, name, account_type, is_default, notes, created_at, updated_at FROM sub_accounts ORDER BY name"
          ).all<Omit<SubAccount, "api_key">>();

          if (!results.results || results.results.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No sub-accounts registered yet. Use ghl_add_sub_account to add one.",
                },
              ],
            };
          }

          const accounts = results.results.map((a) => ({
            ...a,
            is_default: a.is_default === 1 ? "YES" : "no",
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: `${accounts.length} sub-account(s) registered:\n\n${JSON.stringify(accounts, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: Set Default Sub-Account
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_set_default_account",
      "Set which sub-account is used by default when no locationId is specified. You can pass the location ID or search by name.",
      {
        locationId: z
          .string()
          .optional()
          .describe("Location ID to set as default"),
        name: z
          .string()
          .optional()
          .describe(
            "Search by name instead (partial match, e.g. 'Smith' matches 'Dr. Smith Dental')"
          ),
      },
      async ({ locationId, name }) => {
        try {
          await initDb(env.GHL_DB);

          let account: SubAccount | null = null;
          if (locationId) {
            account = await getAccountById(env.GHL_DB, locationId);
          } else if (name) {
            account = await getAccountByName(env.GHL_DB, name);
          }

          if (!account) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Account not found. Use ghl_list_sub_accounts to see available accounts.",
                },
              ],
              isError: true,
            };
          }

          await env.GHL_DB.prepare(
            "UPDATE sub_accounts SET is_default = 0"
          ).run();
          await env.GHL_DB.prepare(
            "UPDATE sub_accounts SET is_default = 1, updated_at = datetime('now') WHERE id = ?"
          )
            .bind(account.id)
            .run();

          return {
            content: [
              {
                type: "text" as const,
                text: `Default account set to "${account.name}" (${account.id})`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: Remove Sub-Account
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_remove_sub_account",
      "Remove a sub-account from the registry. This only removes it from the MCP server — it does NOT delete anything in GHL.",
      {
        locationId: z.string().describe("The location ID to remove"),
      },
      async ({ locationId }) => {
        try {
          await initDb(env.GHL_DB);
          const account = await getAccountById(env.GHL_DB, locationId);
          if (!account) {
            return {
              content: [
                { type: "text" as const, text: "Account not found." },
              ],
              isError: true,
            };
          }

          await env.GHL_DB.prepare(
            "DELETE FROM sub_accounts WHERE id = ?"
          )
            .bind(locationId)
            .run();

          return {
            content: [
              {
                type: "text" as const,
                text: `Sub-account "${account.name}" (${locationId}) removed from registry.`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: Update Sub-Account Token
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_update_sub_account_token",
      "Update the API token for an existing sub-account. Use this when you rotate tokens.",
      {
        locationId: z.string().describe("The location ID to update"),
        apiKey: z.string().describe("The new Private Integration Token"),
      },
      async ({ locationId, apiKey }) => {
        try {
          await initDb(env.GHL_DB);
          const account = await getAccountById(env.GHL_DB, locationId);
          if (!account) {
            return {
              content: [
                { type: "text" as const, text: "Account not found." },
              ],
              isError: true,
            };
          }

          await env.GHL_DB.prepare(
            "UPDATE sub_accounts SET api_key = ?, updated_at = datetime('now') WHERE id = ?"
          )
            .bind(apiKey, locationId)
            .run();

          return {
            content: [
              {
                type: "text" as const,
                text: `API token updated for "${account.name}" (${locationId})`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ==========================================================
    // CUSTOM FIELDS TOOLS (Multi-account aware)
    // ==========================================================

    // ----------------------------------------------------------
    // TOOL: List Custom Fields (Location-level / Contacts)
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_list_contact_custom_fields",
      "List all contact-level custom fields. Uses the default sub-account unless a locationId is specified.",
      {
        locationId: z
          .string()
          .optional()
          .describe(
            "Target a specific sub-account (uses default if omitted)"
          ),
      },
      async ({ locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.getLocationCustomFields();
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: Get Single Contact Custom Field
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_get_contact_custom_field",
      "Get details for a specific contact-level custom field by its ID.",
      {
        fieldId: z.string().describe("The custom field ID"),
        locationId: z.string().optional(),
      },
      async ({ fieldId, locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.getLocationCustomField(fieldId);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: Create Contact Custom Field
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_create_contact_custom_field",
      `Create a new contact-level custom field in GHL.
Supported dataTypes: TEXT, LARGE_TEXT, NUMERICAL, PHONE, MONETORY, CHECKBOX, SINGLE_OPTIONS, MULTIPLE_OPTIONS, DATE, FILE_UPLOAD, RADIO, EMAIL, TEXTBOX_LIST.
For option-based fields, provide the options array.`,
      {
        name: z.string().describe("Display name for the field"),
        dataType: z
          .enum([
            "TEXT",
            "LARGE_TEXT",
            "NUMERICAL",
            "PHONE",
            "MONETORY",
            "CHECKBOX",
            "SINGLE_OPTIONS",
            "MULTIPLE_OPTIONS",
            "DATE",
            "FILE_UPLOAD",
            "RADIO",
            "EMAIL",
            "TEXTBOX_LIST",
          ])
          .describe("The field data type"),
        placeholder: z.string().optional(),
        position: z.number().optional(),
        options: z
          .array(z.string())
          .optional()
          .describe("Options for selection-type fields"),
        acceptedFormat: z.array(z.string()).optional(),
        isMultipleFile: z.boolean().optional(),
        maxNumberOfFiles: z.number().optional(),
        isRequired: z.boolean().optional(),
        model: z.string().optional(),
        locationId: z.string().optional(),
      },
      async ({
        name,
        dataType,
        placeholder,
        position,
        options,
        acceptedFormat,
        isMultipleFile,
        maxNumberOfFiles,
        isRequired,
        model,
        locationId,
      }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.createLocationCustomField({
            name,
            dataType,
            placeholder,
            position,
            options,
            acceptedFormat,
            isMultipleFile,
            maxNumberOfFiles,
            isRequired,
            model,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Custom field "${name}" created!\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: Update Contact Custom Field
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_update_contact_custom_field",
      "Update an existing contact-level custom field.",
      {
        fieldId: z.string().describe("The custom field ID to update"),
        name: z.string().optional(),
        placeholder: z.string().optional(),
        position: z.number().optional(),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().optional(),
        locationId: z.string().optional(),
      },
      async ({ fieldId, name, placeholder, position, options, isRequired, locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.updateLocationCustomField(fieldId, {
            name,
            placeholder,
            position,
            options,
            isRequired,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Custom field updated!\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: Delete Contact Custom Field
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_delete_contact_custom_field",
      "Delete a contact-level custom field by ID. WARNING: Permanent — removes all data in this field across all contacts.",
      {
        fieldId: z.string().describe("The custom field ID to delete"),
        locationId: z.string().optional(),
      },
      async ({ fieldId, locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.deleteLocationCustomField(fieldId);
          return {
            content: [
              {
                type: "text" as const,
                text: `Custom field deleted.\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ----------------------------------------------------------
    // TOOL: Bulk Create Custom Fields
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_bulk_create_contact_custom_fields",
      `Create multiple contact-level custom fields at once.
Provide an array of field definitions. Great for setting up fields from a spreadsheet or document.`,
      {
        fields: z
          .array(
            z.object({
              name: z.string(),
              dataType: z.enum([
                "TEXT",
                "LARGE_TEXT",
                "NUMERICAL",
                "PHONE",
                "MONETORY",
                "CHECKBOX",
                "SINGLE_OPTIONS",
                "MULTIPLE_OPTIONS",
                "DATE",
                "FILE_UPLOAD",
                "RADIO",
                "EMAIL",
                "TEXTBOX_LIST",
              ]),
              placeholder: z.string().optional(),
              options: z.array(z.string()).optional(),
              isRequired: z.boolean().optional(),
              model: z.string().optional(),
            })
          )
          .describe("Array of field definitions to create"),
        locationId: z.string().optional(),
      },
      async ({ fields, locationId }) => {
        const client = await resolveClient(env, locationId);
        const results: {
          name: string;
          success: boolean;
          error?: string;
          data?: any;
        }[] = [];

        for (const field of fields) {
          try {
            const result = await client.createLocationCustomField({
              name: field.name,
              dataType: field.dataType,
              placeholder: field.placeholder,
              options: field.options,
              isRequired: field.isRequired,
              model: field.model,
            });
            results.push({ name: field.name, success: true, data: result });
          } catch (e: any) {
            results.push({ name: field.name, success: false, error: e.message });
          }
        }

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        return {
          content: [
            {
              type: "text" as const,
              text: `Bulk create: ${successCount} succeeded, ${failCount} failed.\n\n${JSON.stringify(results, null, 2)}`,
            },
          ],
        };
      }
    );

    // ==========================================================
    // CUSTOM OBJECT FIELDS TOOLS
    // ==========================================================

    this.server.tool(
      "ghl_list_object_custom_fields",
      `List custom fields for a custom object or company.
Use objectKey like "custom_objects.pet" or "company".`,
      {
        objectKey: z.string().describe('e.g. "custom_objects.pet" or "company"'),
        locationId: z.string().optional(),
      },
      async ({ objectKey, locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.getCustomFieldsByObjectKey(objectKey);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "ghl_create_object_custom_field",
      `Create a custom field on a custom object or company.`,
      {
        objectKey: z.string(),
        fieldKey: z.string(),
        parentId: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        placeholder: z.string().optional(),
        showInForms: z.boolean().default(false),
        dataType: z.enum([
          "TEXT", "LARGE_TEXT", "NUMERICAL", "PHONE", "MONETORY",
          "CHECKBOX", "SINGLE_OPTIONS", "MULTIPLE_OPTIONS", "DATE",
          "TEXTBOX_LIST", "FILE_UPLOAD", "RADIO", "EMAIL",
        ]),
        options: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
        locationId: z.string().optional(),
      },
      async (params) => {
        try {
          const client = await resolveClient(env, params.locationId);
          const result = await client.createCustomField({
            objectKey: params.objectKey,
            fieldKey: params.fieldKey,
            parentId: params.parentId,
            name: params.name,
            description: params.description,
            placeholder: params.placeholder,
            showInForms: params.showInForms,
            dataType: params.dataType,
            options: params.options,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Object custom field created!\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "ghl_create_custom_field_folder",
      "Create a folder to organize custom fields.",
      {
        objectKey: z.string(),
        name: z.string(),
        locationId: z.string().optional(),
      },
      async ({ objectKey, name, locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.createCustomFieldFolder({ objectKey, name });
          return {
            content: [
              {
                type: "text" as const,
                text: `Folder "${name}" created!\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    // ==========================================================
    // CUSTOM VALUES TOOLS
    // ==========================================================

    this.server.tool(
      "ghl_list_custom_values",
      "List all reusable custom values for a GHL location.",
      { locationId: z.string().optional() },
      async ({ locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.getCustomValues();
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(result, null, 2) },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "ghl_create_custom_value",
      "Create a new reusable custom value.",
      {
        name: z.string(),
        value: z.string(),
        locationId: z.string().optional(),
      },
      async ({ name, value, locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.createCustomValue({ name, value });
          return {
            content: [
              {
                type: "text" as const,
                text: `Custom value "${name}" created!\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "ghl_update_custom_value",
      "Update an existing custom value.",
      {
        valueId: z.string(),
        name: z.string().optional(),
        value: z.string().optional(),
        locationId: z.string().optional(),
      },
      async ({ valueId, name, value, locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.updateCustomValue(valueId, { name, value });
          return {
            content: [
              {
                type: "text" as const,
                text: `Custom value updated!\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "ghl_delete_custom_value",
      "Delete a custom value by ID.",
      {
        valueId: z.string(),
        locationId: z.string().optional(),
      },
      async ({ valueId, locationId }) => {
        try {
          const client = await resolveClient(env, locationId);
          const result = await client.deleteCustomValue(valueId);
          return {
            content: [
              {
                type: "text" as const,
                text: `Custom value deleted.\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );
  }
}

// ============================================================
// Worker entry point
// ============================================================

export default GHLMcpAgent.mount("/sse");
