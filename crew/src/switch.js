// Minimal Switch agent-protocol client: registration, the WebSocket event
// connection (ping/pong, resume, eviction), operations and approval cards.
// Wire contract: https://docs.switchagents.ai/switch-rooms/internals/agent-protocol
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import WebSocket from "ws";

export class HttpError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

async function http(base, method, path, { token, cookie, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(method, path, res.status, text);
  return { data: text ? JSON.parse(text) : null, res };
}

/** Gateway session for the seeded admin; used only to mint a registration key. */
export async function gatewayLogin(base, email, password) {
  const { res } = await http(base, "POST", "/gateway/auth/login", { body: { email, password } });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return {
    cookie,
    get: (path) => http(base, "GET", path, { cookie }).then((r) => r.data),
    post: (path, body) => http(base, "POST", path, { cookie, body }).then((r) => r.data),
    put: (path, body) => http(base, "PUT", path, { cookie, body }).then((r) => r.data),
  };
}

export async function createRegistrationKey(gateway, label) {
  const key = await gateway.post("/gateway/api-keys", { label });
  return key.key;
}

/** POST /agents. Returns {id, api_key}; the key is shown once. */
export async function registerAgent(base, registrationKey, spec, { overwrite = false } = {}) {
  const { data } = await http(base, "POST", "/agents", {
    token: registrationKey,
    body: {
      name: spec.name,
      display_name: spec.displayName,
      description: spec.description,
      connector_type: spec.connectorType ?? "fixline",
      integration_profile: {
        connection_model: "always_on",
        message_exchange: true,
        pre_invocation_mediation: [],
        post_invocation_mediation: [],
        event_reporting: [],
      },
      icon_url: spec.iconUrl,
      overwrite,
    },
  });
  return data;
}

export class SwitchAgent extends EventEmitter {
  constructor({ base, id, apiKey, name, log = console.log }) {
    super();
    this.base = base;
    this.id = id;
    this.apiKey = apiKey;
    this.name = name;
    this.log = log;
    this.connectionId = randomUUID();
    this.sessionId = randomUUID();
    this.cursor = null;
    this.generation = null;
    this.rooms = [];
    this.stopped = false;
  }

  request(method, path, body, headers) {
    return http(this.base, method, path, { token: this.apiKey, body, headers }).then((r) => r.data);
  }

  /** Call an operation. Arguments go unwrapped in the body. The connection id
   * header binds the call to the claimed room, so it is sent only once open. */
  async op(name, args = {}) {
    const headers = this.connected ? { "x-switch-connection-id": this.connectionId } : {};
    const out = await this.request("POST", `/agents/${this.id}/ops/${name}`, args, headers);
    return out?.result;
  }

  /** Open the socket, claiming `rooms`. Resolves on the first connection_state. */
  connect(rooms = []) {
    this.wantedRooms = rooms;
    return new Promise((resolve, reject) => {
      const q = new URLSearchParams({
        connection_id: this.connectionId,
        scope: "single",
        filter: "all",
        client: "fixline-crew",
        client_version: "1.0.0",
      });
      if (rooms.length) q.set("rooms", rooms.join(","));
      if (this.cursor != null) q.set("start_from", String(this.cursor));
      if (this.generation != null) q.set("expected_generation", String(this.generation));
      const url = `${this.base.replace(/^http/, "ws")}/agents/${this.id}/connection/ws?${q}`;
      const ws = new WebSocket(url, { headers: { authorization: `Bearer ${this.apiKey}` } });
      this.ws = ws;
      let settled = false;
      ws.on("message", (raw) => {
        let frame;
        try {
          frame = JSON.parse(raw.toString());
        } catch {
          return;
        }
        // Liveness first: the server evicts after 6s without a pong.
        if (frame.type === "ping" || frame.event === "ping") {
          ws.send(JSON.stringify({ type: "pong", cursor: this.cursor ?? 0 }));
          return;
        }
        const kind = frame.event ?? frame.type;
        const data = frame.data ?? frame;
        if (kind === "connection_state") {
          this.connected = true;
          this.generation = data.generation;
          this.rooms = data.rooms ?? [];
          if (this.cursor == null && typeof data.cursor === "number") this.cursor = data.cursor;
          this.emit("connected", data);
          if (!settled) {
            settled = true;
            resolve(data);
          }
          return;
        }
        if (kind === "refused") {
          this.log(`[${this.name}] refused: ${data.status} ${data.detail}`);
          return;
        }
        if (kind === "evicted") {
          this.log(`[${this.name}] evicted: ${data.code}`);
          if (data.code === "taken_over" || data.code === "closed") this.stopped = true;
          return;
        }
        if (kind === "subscription_changed") {
          this.rooms = data.rooms ?? this.rooms;
          return;
        }
        if (kind === "approval_outcome") {
          this.emit("approval_outcome", data);
          return;
        }
        if (kind === "gap") {
          if (typeof data.resumed_at === "number") this.cursor = data.resumed_at;
          return;
        }
        if (typeof frame.id === "number") this.cursor = Math.max(this.cursor ?? 0, frame.id);
        if (kind === "message") this.emit("message", data);
        else if (kind === "command") this.emit("command", data);
        else if (kind === "room_join") this.emit("room_join", data);
      });
      ws.on("close", (code) => {
        this.connected = false;
        if (!settled) {
          settled = true;
          reject(new Error(`[${this.name}] socket closed before connection_state: ${code}`));
        }
        if (this.stopped || code === 4409 || code === 4401) return;
        // Resume with the same connection id and cursor, backing off while
        // the server is down; each failed attempt schedules the next.
        this.retryMs = Math.min((this.retryMs ?? 500) * 2, 15_000);
        if (this.retryMs === 1000) this.log(`[${this.name}] connection lost (${code}); reconnecting`);
        setTimeout(() => this.connect(this.wantedRooms).then(() => (this.retryMs = null), () => {}), this.retryMs);
      });
      ws.on("error", () => {});
    });
  }

  close() {
    this.stopped = true;
    this.ws?.close(1000);
  }

  // ── Approval cards ─────────────────────────────────────────────────────
  // The same request a Console session raises for a risky tool call: Switch
  // renders it as buttons in the chat, records who answered, and delivers the
  // outcome back as an `approval_outcome` frame.

  async openApproval({ roomId, threadId, title, detail, turnId = randomUUID() }) {
    const requestId = randomUUID();
    const view = await this.request("POST", `/agent-sessions/${this.sessionId}/approvals`, {
      request_id: requestId,
      turn_id: turnId,
      kind: "approval",
      title,
      detail,
      options: [
        { id: "allow", label: "Approve", decision: "accept" },
        { id: "deny", label: "Decline", decision: "decline" },
      ],
      questions: [],
      room_id: roomId,
      thread_id: threadId ?? null,
      expires_at: null,
    });
    return { requestId, view };
  }

  /** Resolves with the answered ApprovalView for `requestId`. */
  waitForApproval(requestId, { pollMs = 2000 } = {}) {
    return new Promise((resolve) => {
      const done = (view) => {
        clearInterval(timer);
        this.off("approval_outcome", onFrame);
        this.request("POST", `/agent-sessions/${this.sessionId}/approvals/${requestId}/delivered`).catch(() => {});
        resolve(view);
      };
      const onFrame = (o) => {
        const view = o.outcome ?? o;
        if ((view.requestId ?? view.request_id) === requestId) done(view);
      };
      this.on("approval_outcome", onFrame);
      // The frame is the fast path; the outcomes list is the durable one.
      const timer = setInterval(async () => {
        try {
          const owed = await this.request("GET", "/agent-sessions/approvals/outcomes");
          const hit = owed.find((v) => v.requestId === requestId);
          if (hit) done(hit);
        } catch {}
      }, pollMs);
    });
  }

  /** Shows "Working…"-style status in the chat thread via session activity. */
  async reportActivity({ turnId, itemId = randomUUID(), status, title, text = "", roomId, threadId, kind = "turn", revision = 0 }) {
    try {
      await this.request("POST", `/agent-sessions/${this.sessionId}/activity`, {
        turn_id: turnId,
        item_id: itemId,
        kind,
        revision,
        status,
        title,
        text,
        command_id: null,
        room_id: roomId ?? null,
        thread_id: threadId ?? null,
        message_id: null,
        occurred_at: new Date().toISOString(),
        usage: [],
      });
    } catch (e) {
      this.log(`[${this.name}] activity report failed: ${e.message}`);
    }
  }
}
