import { Injectable, inject, signal } from '@angular/core';
import { McpServer } from './models';
import { OllamaTool } from './ollama.service';
import { StoreService } from './store.service';

interface McpToolDef { name: string; description?: string; inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] } }
interface McpConn { server: McpServer; sessionId?: string; protocol: string; tools: McpToolDef[]; status: 'connected' | 'error' | 'connecting'; error?: string; }

const PROTOCOL = '2025-06-18';

/** Minimal MCP client over Streamable HTTP (JSON-RPC 2.0, JSON or SSE responses). */
@Injectable({ providedIn: 'root' })
export class McpService {
  private store = inject(StoreService);
  readonly connections = signal<Record<string, McpConn>>({});
  private nextId = 1;

  /** Tool name exposed to the model: mcp_<server>_<tool>, sanitised. */
  static exposedName(server: McpServer, tool: string) {
    const s = server.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'srv';
    return `mcp_${s}_${tool.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 64);
  }

  async connectAll(): Promise<void> {
    await Promise.all(this.store.settings().mcpServers.filter(s => s.enabled).map(s => this.connect(s).catch(() => undefined)));
  }

  async connect(server: McpServer): Promise<McpConn> {
    this.set(server.id, { server, protocol: PROTOCOL, tools: [], status: 'connecting' });
    try {
      const init = await this.rpc(server, undefined, 'initialize', {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'jarvis-android', version: '1.0.0' },
      });
      const conn: McpConn = { server, sessionId: init.sessionId, protocol: init.result?.protocolVersion ?? PROTOCOL, tools: [], status: 'connected' };
      await this.notify(server, conn.sessionId, 'notifications/initialized');
      let cursor: string | undefined;
      do {
        const r = await this.rpc(server, conn.sessionId, 'tools/list', cursor ? { cursor } : {});
        conn.tools.push(...(r.result?.tools ?? []));
        cursor = r.result?.nextCursor;
      } while (cursor);
      this.set(server.id, conn);
      return conn;
    } catch (e: any) {
      const conn: McpConn = { server, protocol: PROTOCOL, tools: [], status: 'error', error: e?.message ?? String(e) };
      this.set(server.id, conn);
      throw e;
    }
  }

  disconnect(id: string) {
    const c = { ...this.connections() };
    delete c[id];
    this.connections.set(c);
  }

  /** All MCP tools in Ollama tool format. */
  toolDefs(): OllamaTool[] {
    const out: OllamaTool[] = [];
    for (const c of Object.values(this.connections())) {
      if (c.status !== 'connected') continue;
      for (const t of c.tools) {
        out.push({
          type: 'function',
          function: {
            name: McpService.exposedName(c.server, t.name),
            description: `[${c.server.name}] ${(t.description ?? t.name).slice(0, 300)}`,
            parameters: { type: 'object', properties: t.inputSchema?.properties ?? {}, required: t.inputSchema?.required ?? [] },
          },
        });
      }
    }
    return out;
  }

  owns(exposed: string): boolean { return !!this.resolve(exposed); }

  async call(exposed: string, args: Record<string, unknown>): Promise<string> {
    const hit = this.resolve(exposed);
    if (!hit) throw new Error(`Unknown MCP tool ${exposed}`);
    const r = await this.rpc(hit.conn.server, hit.conn.sessionId, 'tools/call', { name: hit.tool.name, arguments: args });
    if (r.error) throw new Error(r.error.message ?? 'MCP error');
    const res = r.result ?? {};
    const text = (res.content ?? [])
      .map((c: any) => c.type === 'text' ? c.text : c.type === 'resource' ? (c.resource?.text ?? `[resource ${c.resource?.uri}]`) : `[${c.type}]`)
      .join('\n');
    const structured = res.structuredContent ? `\n${JSON.stringify(res.structuredContent).slice(0, 4000)}` : '';
    if (res.isError) throw new Error(text || 'Tool reported an error');
    return (text + structured).slice(0, 8000) || 'OK';
  }

  private resolve(exposed: string): { conn: McpConn; tool: McpToolDef } | undefined {
    for (const c of Object.values(this.connections())) {
      const tool = c.tools.find(t => McpService.exposedName(c.server, t.name) === exposed);
      if (tool) return { conn: c, tool };
    }
    return undefined;
  }

  private set(id: string, conn: McpConn) { this.connections.update(c => ({ ...c, [id]: conn })); }

  private headers(server: McpServer, sessionId?: string): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL,
    };
    if (sessionId) h['Mcp-Session-Id'] = sessionId;
    if (server.token) h['Authorization'] = `Bearer ${server.token}`;
    return h;
  }

  private async notify(server: McpServer, sessionId: string | undefined, method: string) {
    await fetch(server.url, { method: 'POST', headers: this.headers(server, sessionId), body: JSON.stringify({ jsonrpc: '2.0', method }) }).catch(() => undefined);
  }

  private async rpc(server: McpServer, sessionId: string | undefined, method: string, params: unknown): Promise<{ result?: any; error?: any; sessionId?: string }> {
    const id = this.nextId++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(server.url, {
        method: 'POST', headers: this.headers(server, sessionId), signal: ctrl.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
      if (!res.ok) throw new Error(`MCP ${method} failed: HTTP ${res.status}`);
      const sid = res.headers.get('Mcp-Session-Id') ?? sessionId;
      const type = res.headers.get('Content-Type') ?? '';
      if (type.includes('text/event-stream')) {
        const msg = await this.readSse(res, id);
        return { ...msg, sessionId: sid };
      }
      const body = await res.json();
      const msg = Array.isArray(body) ? body.find((m: any) => m.id === id) : body;
      return { result: msg?.result, error: msg?.error, sessionId: sid };
    } finally { clearTimeout(timer); }
  }

  private async readSse(res: Response, id: number): Promise<{ result?: any; error?: any }> {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const evt = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const data = evt.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
        if (!data) continue;
        try {
          const msg = JSON.parse(data);
          if (msg.id === id) { reader.cancel().catch(() => undefined); return { result: msg.result, error: msg.error }; }
        } catch { /* ignore partial */ }
      }
    }
    throw new Error('MCP stream ended without a response');
  }
}
