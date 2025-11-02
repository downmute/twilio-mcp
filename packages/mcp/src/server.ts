// import { join } from 'path.ts';

// import {
//   ReadResourceRequest,
//   ReadResourceResult,
//   Tool,
// } from '@modelcontextprotocol/sdk/types.js';
// import {
//   API,
//   OpenAPIMCPServer,
//   ToolFilters,
// } from '@twilio-alpha/openapi-mcp-server.ts';

// import { Credentials } from '@app/types.ts';
// import { toolRequiresAccountSid } from '@app/utils.ts';
// import { loadAdditionalTools, uploadFunction, uploadAsset } from '@app/tools.ts';

// type Configuration = {
//   server: {
//     name: string;
//     version: string;
//   };
//   filters?: ToolFilters;
//   accountSid: string;
//   credentials: Credentials;
// };

// const ROOT_DIR = join(__dirname, '..');

// export default class TwilioOpenAPIMCPServer extends OpenAPIMCPServer {
//   private readonly config: Configuration;

//   constructor(config: Configuration) {
//     super({
//       server: {
//         name: config.server.name,
//         version: config.server.version,
//         capabilities: {
//           resources: {},
//           tools: {},
//           prompts: {},
//         },
//         instructions: TwilioOpenAPIMCPServer.systemPrompt(config.accountSid),
//       },
//       openAPIDir: join(ROOT_DIR, 'twilio-oai', 'spec', 'yaml'),
//       filters: config.filters,
//       authorization: {
//         type: 'Basic',
//         username: config.credentials.apiKey,
//         password: config.credentials.apiSecret,
//       },
//     });
//     this.config = config;
//   }

//   /**
//    * Sets the system prompt for the server
//    * @param accountSid
//    * @returns
//    */
//   private static systemPrompt(accountSid: string): string {
//     return `You are an agent to call Twilio APIs. If no accountSid is provided, you MUST use ${accountSid}`;
//   }

//   /**
//    * Call a tool with a body
//    * @override
//    */
//   protected callToolBody(tool: Tool, api: API, body: Record<string, unknown>) {
//     const { requiresAccountSid, accountSidKey } = toolRequiresAccountSid(tool);
//     const providedSid = (body?.[accountSidKey] ?? '') as unknown;
//     const hasAccountSid =
//       typeof providedSid === 'string' &&
//       /^AC[a-fA-F0-9]{32}$/.test(providedSid);
//     if (requiresAccountSid && !hasAccountSid) {
//       // eslint-disable-next-line no-param-reassign
//       body[accountSidKey] = this.config.accountSid;
//     }

//     return body;
//   }

//   /**
//    * Handles read resource requests
//    * @param request
//    * @returns
//    */
//   protected async handleReadResource(
//     request: ReadResourceRequest,
//   ): Promise<ReadResourceResult> {
//     const { uri, name } = request.params;
//     if (uri === 'text://accountSid') {
//       return {
//         contents: [
//           {
//             uri,
//             name,
//             mimeType: 'text/plain',
//             text: `The Twilio accountSid is ${this.config.accountSid}`,
//           },
//         ],
//       };
//     }

//     throw new Error(`Resource ${name} not found`);
//   }

//   protected async makeRequest(
//     id: string,
//     api: API,
//     body?: Record<string, unknown>,
//   ) {
//     if (id === uploadFunction.name && body) {
//       return uploadFunction.uploadFunctionExecution(body, this.http);
//     }
//     if (id === uploadAsset.name && body) {
//       return uploadAsset.uploadAssetExecution(body, this.http);
//     }

//     return super.makeRequest(id, api, body);
//   }

//   /**
//    * Loads resources for the server
//    * @returns
//    */
//   protected async loadCapabilities(): Promise<void> {
//     this.resources.push({
//       uri: 'text://accountSid',
//       name: 'Twilio AccountSid',
//       description: 'The account SID for the Twilio account',
//       mimeType: 'text/plain',
//     });

//     for (const [id, tool] of this.tools) {
//       if (tool.inputSchema?.properties?.AccountSid) {
//         const originalDescription = tool.description;
//         const enhancedDescription = `${originalDescription} (Uses default AccountSid: ${this.config.accountSid} if not provided)`;
//         const updatedTool = {
//           ...tool,
//           description: enhancedDescription,
//         };

//         this.tools.set(id, updatedTool);
//       }
//     }

//     const additionalTools = loadAdditionalTools(this.configuration?.filters);
//     for (const [id, { tool, api }] of additionalTools) {
//       this.tools.set(id, tool);
//       this.apis.set(id, api);
//     }
//   }
// }

import { metorial, z } from '@metorial/mcp-server-sdk';
import { URLSearchParams } from 'url'; // Node.js built-in
import { Buffer } from 'buffer'; // Node.js built-in

/**
 * Twilio MCP Server
 * Provides capabilities to send messages via the Twilio API
 */

// 1. Define the configuration the server needs
// This matches the 'credentials' and 'accountSid' from your original file
type TwilioConfig = {
  accountSid: string;
  apiKey: string;
  apiSecret: string;
};

metorial.createServer<TwilioConfig>(
  {
    name: 'twilio-message-server',
    version: '1.0.0',
    // Instructions are now part of the server config
    instructions: `You are an agent to call Twilio APIs. If no accountSid is provided, you MUST use ${process.env.TWILIO_ACCOUNT_SID || 'your default AccountSid'}.`,
  },
  async (server, config) => {
    // 2. Define Constants and API Base URL
    const API_BASE_URL = 'https://api.twilio.com/2010-04-01';

    // ============================================================================
    // Type Definitions
    // ============================================================================

    // Simplified interface for a successful Twilio Message resource
    interface TwilioMessageResponse {
      sid: string;
      status: string;
      to: string;
      from: string;
      body: string | null;
      num_media: string;
      error_code: number | null;
      error_message: string | null;
      direction: string;
      price: string | null;
      uri: string;
      [key: string]: any;
    }

    // Interface for a Twilio API Error
    interface TwilioError {
      code: number;
      message: string;
      more_info: string;
      status: number;
    }

    // ============================================================================
    // Schema Definitions (for the 'send_message' tool)
    // ============================================================================

    const sendMessageSchema = {
      // --- Required Parameters ---
      To: z
        .string()
        .describe(
          "Required. The recipient's phone number in E.164 format (e.g., +15552229999).",
        ),

      // --- Sender Parameters (One is required) ---
      From: z
        .string()
        .optional()
        .describe(
          "Required if 'MessagingServiceSid' is not passed. The sender's Twilio phone number (in E.164 format).",
        ),
      MessagingServiceSid: z
        .string()
        .regex(/^MG[0-9a-fA-F]{32}$/)
        .optional()
        .describe(
          "Required if 'From' is not passed. The SID of the Messaging Service.",
        ),

      // --- Content Parameters (One is required) ---
      Body: z
        .string()
        .max(1600)
        .optional()
        .describe(
          "Required if 'MediaUrl' or 'ContentSid' is not passed. The text content of the message.",
        ),
      MediaUrl: z
        .array(z.string().url())
        .max(10)
        .optional()
        .describe(
          "Required if 'Body' or 'ContentSid' is not passed. An array of URLs for media (up to 10).",
        ),
      ContentSid: z
        .string()
        .regex(/^HX[0-9a-fA-F]{32}$/)
        .optional()
        .describe(
          "Required if 'Body' or 'MediaUrl' is not passed. The SID of a Content Template.",
        ),

      // --- Common Optional Parameters ---
      StatusCallback: z
        .string()
        .url()
        .optional()
        .describe(
          'The URL to which Twilio will send Message status callback requests.',
        ),
      ValidityPeriod: z
        .number()
        .min(1)
        .max(36000)
        .optional()
        .describe(
          'The maximum time in seconds (1-36000) the Message can remain in the queue. Default is 36000.',
        ),
    };

    // ============================================================================
    // Helper Function (Replaces 'firecrawlRequest')
    // ============================================================================

    /**
     * Makes an authenticated request to the Twilio API.
     * Handles Basic Auth and form-urlencoded bodies.
     */
    async function twilioRequest<T>(
      endpoint: string, // e.g., /Accounts/{AccountSid}/Messages.json
      method: 'POST' | 'GET',
      body: Record<string, any> = {},
    ): Promise<T> {
      const url = `${API_BASE_URL}${endpoint}`;

      // 1. Create Basic Auth token
      const authToken = Buffer.from(
        `${config.apiKey}:${config.apiSecret}`,
      ).toString('base64');

      // 2. Serialize body as application/x-www-form-urlencoded
      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value === undefined || value === null) {
          continue; // Skip undefined/null values
        }
        if (Array.isArray(value)) {
          // Twilio expects multiple values for the same key, e.g., MediaUrl=url1&MediaUrl=url2
          value.forEach((v) => formData.append(key, String(v)));
        } else {
          formData.append(key, String(value));
        }
      }

      // 3. Make the fetch request
      const response = await fetch(url, {
        method: method,
        headers: {
          Authorization: `Basic ${authToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: method === 'POST' ? formData.toString() : undefined,
      });

      // 4. Handle errors
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as TwilioError;
        throw new Error(
          errorData.message ||
            `Twilio API error: ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    }

    // ============================================================================
    // Tool: send_message
    // ============================================================================

    server.registerTool(
      'send_message',
      {
        title: 'Send Message',
        description:
          "Sends a new outgoing SMS or MMS message using the Twilio API. You must provide 'To' and one of ('From', 'MessagingServiceSid') and one of ('Body', 'MediaUrl', 'ContentSid').",
        inputSchema: sendMessageSchema,
      },
      async (params) => {
        try {
          // The AccountSid comes from the server config
          const endpoint = `/Accounts/${config.accountSid}/Messages.json`;

          // 'params' is the Zod-validated input, which matches the
          // form-urlencoded body structure Twilio expects.
          const response = await twilioRequest<TwilioMessageResponse>(
            endpoint,
            'POST',
            params,
          );

          // Format the response for the AI
          const responseText = [
            `Message sent successfully!`,
            `SID: ${response.sid}`,
            `Status: ${response.status}`,
            `To: ${response.to}`,
            `From: ${response.from}`,
          ];
          if (response.error_message) {
            responseText.push(`Error: ${response.error_message}`);
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: responseText.join('\n'),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error sending message: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // You could register more tools or resources here, e.g.
    // server.registerTool('get_message_status', ...)
  },
);
