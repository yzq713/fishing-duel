import { routePartykitRequest, Server } from "partyserver";
import type { Connection } from "partyserver";

type Env = { Main: DurableObjectNamespace };

// 一个 GameRoom 实例 = 一个房间（按房间名路由到对应 Durable Object）。
// 休闲玩法采用「中继 + 客户端权威」：服务器只负责进出房通知和消息转发，
// 不做严格校验，逻辑简单、免费额度内可承载较多房间。
export class GameRoom extends Server<Env> {
  static options = { hibernate: true };

  onConnect(conn: Connection) {
    // 收集当前房间里已有的连接 id，连同该玩家自己的 id 一起下发
    const peers: string[] = [];
    for (const c of this.getConnections()) {
      if (c.id !== conn.id) peers.push(c.id);
    }
    conn.send(JSON.stringify({ t: "welcome", id: conn.id, peers }));
    // 通知其他玩家：有人进房
    this.broadcast(JSON.stringify({ t: "join", id: conn.id }), [conn.id]);
  }

  onMessage(conn: Connection, message: unknown) {
    // 客户端消息原样转发给房间内其他玩家（消息内部已带发送者 id）
    if (typeof message !== "string") return;
    this.broadcast(message, [conn.id]);
  }

  onClose(conn: Connection) {
    this.broadcast(JSON.stringify({ t: "leave", id: conn.id }));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
