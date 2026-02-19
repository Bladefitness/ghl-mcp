/**
 * GHL MCP Server - Cloudflare Worker
 *
 * A remote MCP server that gives AI agents full control over
 * GoHighLevel custom fields, custom values, and folders.
 *
 * Phase 1: Custom Fields CRUD (Location-level + Custom Objects)
 * Future: Contacts, Opportunities, Calendars, Workflows, etc.
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
}

// Helper to create GHL client from env
function createClient(env: Env): GHLClient {
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
    version: "1.0.0",
  });

  async init() {
    const env = this.env;

    // ----------------------------------------------------------
    // TOOL: List Custom Fields (Location-level / Contacts)
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_list_contact_custom_fields",
      "List all contact-level custom fields for your GHL location. Returns field names, types, IDs, and options.",
      {
        locationId: z
          .string()
          .optional()
          .describe(
            "Override location ID (uses default from config if omitted)"
          ),
      },
      async ({ locationId }) => {
        const client = createClient(env);
        try {
          const result = await client.getLocationCustomFields(locationId);
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
        const client = createClient(env);
        try {
          const result = await client.getLocationCustomField(
            fieldId,
            locationId
          );
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
For option-based fields (SINGLE_OPTIONS, MULTIPLE_OPTIONS, RADIO, CHECKBOX), provide the options array.`,
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
        placeholder: z
          .string()
          .optional()
          .describe("Placeholder text shown in the field"),
        position: z
          .number()
          .optional()
          .describe("Position/order of the field"),
        options: z
          .array(z.string())
          .optional()
          .describe(
            "Options for selection-type fields (SINGLE_OPTIONS, MULTIPLE_OPTIONS, RADIO, CHECKBOX)"
          ),
        acceptedFormat: z
          .array(z.string())
          .optional()
          .describe("Accepted file formats for FILE_UPLOAD fields"),
        isMultipleFile: z
          .boolean()
          .optional()
          .describe("Allow multiple files for FILE_UPLOAD"),
        maxNumberOfFiles: z
          .number()
          .optional()
          .describe("Max files for FILE_UPLOAD"),
        isRequired: z.boolean().optional().describe("Whether field is required"),
        model: z
          .string()
          .optional()
          .describe(
            "Model to attach field to (e.g., 'contact', 'opportunity')"
          ),
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
        const client = createClient(env);
        try {
          const result = await client.createLocationCustomField(
            {
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
            },
            locationId
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Custom field "${name}" created successfully!\n\n${JSON.stringify(result, null, 2)}`,
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
      "Update an existing contact-level custom field. You can change name, placeholder, options, etc.",
      {
        fieldId: z.string().describe("The custom field ID to update"),
        name: z.string().optional().describe("New display name"),
        placeholder: z.string().optional().describe("New placeholder text"),
        position: z.number().optional().describe("New position/order"),
        options: z
          .array(z.string())
          .optional()
          .describe("Updated options (replaces existing options entirely)"),
        isRequired: z.boolean().optional(),
        locationId: z.string().optional(),
      },
      async ({
        fieldId,
        name,
        placeholder,
        position,
        options,
        isRequired,
        locationId,
      }) => {
        const client = createClient(env);
        try {
          const result = await client.updateLocationCustomField(
            fieldId,
            { name, placeholder, position, options, isRequired },
            locationId
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Custom field updated successfully!\n\n${JSON.stringify(result, null, 2)}`,
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
      "Delete a contact-level custom field by ID. WARNING: This is permanent and removes all data stored in this field across all contacts.",
      {
        fieldId: z.string().describe("The custom field ID to delete"),
        locationId: z.string().optional(),
      },
      async ({ fieldId, locationId }) => {
        const client = createClient(env);
        try {
          const result = await client.deleteLocationCustomField(
            fieldId,
            locationId
          );
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
Provide an array of field definitions. Each field needs at minimum: name and dataType.
This is useful when you need to set up many fields from a spreadsheet or document.`,
      {
        fields: z
          .array(
            z.object({
              name: z.string().describe("Display name"),
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
                .describe("Field type"),
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
        const client = createClient(env);
        const results: { name: string; success: boolean; error?: string; data?: any }[] = [];

        for (const field of fields) {
          try {
            const result = await client.createLocationCustomField(
              {
                name: field.name,
                dataType: field.dataType,
                placeholder: field.placeholder,
                options: field.options,
                isRequired: field.isRequired,
                model: field.model,
              },
              locationId
            );
            results.push({ name: field.name, success: true, data: result });
          } catch (e: any) {
            results.push({
              name: field.name,
              success: false,
              error: e.message,
            });
          }
        }

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        return {
          content: [
            {
              type: "text" as const,
              text: `Bulk create complete: ${successCount} succeeded, ${failCount} failed.\n\n${JSON.stringify(results, null, 2)}`,
            },
          ],
        };
      }
    );

    // ----------------------------------------------------------
    // TOOL: List Custom Fields V2 (Custom Objects / Company)
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_list_object_custom_fields",
      `List custom fields for a custom object or company.
Use objectKey like "custom_objects.pet" for custom objects, or "company" for business fields.`,
      {
        objectKey: z
          .string()
          .describe(
            'The object key, e.g. "custom_objects.pet" or "company"'
          ),
        locationId: z.string().optional(),
      },
      async ({ objectKey, locationId }) => {
        const client = createClient(env);
        try {
          const result = await client.getCustomFieldsByObjectKey(
            objectKey,
            locationId
          );
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
    // TOOL: Create Custom Object Field
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_create_object_custom_field",
      `Create a custom field on a custom object or company.
Requires objectKey (e.g. "custom_objects.pet"), fieldKey (e.g. "custom_objects.pet.name"), and parentId (folder ID).`,
      {
        objectKey: z.string().describe('e.g. "custom_objects.pet"'),
        fieldKey: z.string().describe('e.g. "custom_objects.pet.name"'),
        parentId: z.string().describe("ID of the parent folder"),
        name: z.string().optional().describe("Display name"),
        description: z.string().optional(),
        placeholder: z.string().optional(),
        showInForms: z.boolean().default(false),
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
            "TEXTBOX_LIST",
            "FILE_UPLOAD",
            "RADIO",
            "EMAIL",
          ])
          .describe("Field type"),
        options: z
          .array(z.object({ key: z.string(), label: z.string() }))
          .optional(),
        locationId: z.string().optional(),
      },
      async (params) => {
        const client = createClient(env);
        try {
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
            locationId: params.locationId,
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

    // ----------------------------------------------------------
    // TOOL: Create Custom Field Folder
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_create_custom_field_folder",
      "Create a folder to organize custom fields within a custom object or company.",
      {
        objectKey: z.string().describe('e.g. "custom_objects.pet" or "company"'),
        name: z.string().describe("Folder name"),
        locationId: z.string().optional(),
      },
      async ({ objectKey, name, locationId }) => {
        const client = createClient(env);
        try {
          const result = await client.createCustomFieldFolder({
            objectKey,
            name,
            locationId,
          });
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

    // ----------------------------------------------------------
    // TOOL: List Custom Values
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_list_custom_values",
      "List all reusable custom values for your GHL location. These are location-wide variables like company name, address, etc.",
      {
        locationId: z.string().optional(),
      },
      async ({ locationId }) => {
        const client = createClient(env);
        try {
          const result = await client.getCustomValues(locationId);
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
    // TOOL: Create Custom Value
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_create_custom_value",
      "Create a new reusable custom value (location-wide variable).",
      {
        name: z.string().describe("Variable name"),
        value: z.string().describe("Variable value"),
        locationId: z.string().optional(),
      },
      async ({ name, value, locationId }) => {
        const client = createClient(env);
        try {
          const result = await client.createCustomValue({ name, value }, locationId);
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

    // ----------------------------------------------------------
    // TOOL: Update Custom Value
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_update_custom_value",
      "Update an existing custom value.",
      {
        valueId: z.string().describe("The custom value ID"),
        name: z.string().optional(),
        value: z.string().optional(),
        locationId: z.string().optional(),
      },
      async ({ valueId, name, value, locationId }) => {
        const client = createClient(env);
        try {
          const result = await client.updateCustomValue(
            valueId,
            { name, value },
            locationId
          );
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

    // ----------------------------------------------------------
    // TOOL: Delete Custom Value
    // ----------------------------------------------------------
    this.server.tool(
      "ghl_delete_custom_value",
      "Delete a custom value by ID.",
      {
        valueId: z.string().describe("The custom value ID to delete"),
        locationId: z.string().optional(),
      },
      async ({ valueId, locationId }) => {
        const client = createClient(env);
        try {
          const result = await client.deleteCustomValue(valueId, locationId);
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
