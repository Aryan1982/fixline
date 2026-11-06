// Just enough of the Mattermost REST API to seed the demo's people and to let
// the simulator speak for them.
export class Mattermost {
  constructor(base) {
    this.base = base;
  }

  async login(loginId, password) {
    const res = await fetch(`${this.base}/api/v4/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login_id: loginId, password }),
    });
    if (!res.ok) throw new Error(`mattermost login ${loginId}: ${res.status} ${await res.text()}`);
    this.token = res.headers.get("token");
    this.me = await res.json();
    return this;
  }

  async call(method, path, body) {
    const res = await fetch(`${this.base}/api/v4${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`mattermost ${method} ${path}: ${res.status} ${text}`);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  }

  userByName(username) {
    return this.call("GET", `/users/username/${username}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  }

  async channel(displayName) {
    const chans = await this.call("GET", "/users/me/channels");
    return chans.find((c) => c.display_name === displayName || c.name === displayName) ?? null;
  }

  post(channelId, message, rootId = "") {
    return this.call("POST", "/posts", { channel_id: channelId, message, root_id: rootId });
  }

  async posts(channelId, { perPage = 100 } = {}) {
    const r = await this.call("GET", `/channels/${channelId}/posts?per_page=${perPage}`);
    return r.order.map((id) => r.posts[id]).reverse();
  }

  thread(postId) {
    return this.call("GET", `/posts/${postId}/thread`).then((r) => r.order.map((id) => r.posts[id]).sort((a, b) => a.create_at - b.create_at));
  }
}
