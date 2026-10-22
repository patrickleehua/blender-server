import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Bridge, tools } from './core.js';
import { VERSION } from './config.js';

export async function serveMcp(bridge: Bridge): Promise<void> {
  const server = new Server({ name: 'blender-agent', version: VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    return await bridge.call(request.params.name, request.params.arguments || {}, extra.signal);
  });
  server.onerror = e => console.error('[blender-agent MCP]', e.message);
  server.onclose = () => { void bridge.dispose().catch(e => console.error('[blender-agent cleanup]', e.message)); };
  // The SDK transport does not interpret stdin EOF as close by itself.
  process.stdin.once('end', () => { void server.close(); });
  await server.connect(new StdioServerTransport());
}
