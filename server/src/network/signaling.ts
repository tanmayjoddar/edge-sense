// ============================================================
// EdgeSense — WebSocket Signaling Server
// Handles WebRTC peer discovery, offer/answer relay,
// ICE candidate exchange, and real-time sensor updates.
// ============================================================

import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { IncomingMessage, Server as HttpServer } from "http";
import type { SignalMessage, PeerInfo } from "../types";

interface ConnectedPeer {
  ws: WebSocket;
  info: PeerInfo;
  alive: boolean;
}

const peers: Map<string, ConnectedPeer> = new Map();
let wss: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

export function createSignalingServer(target: number | HttpServer): WebSocketServer {
  if (typeof target === "number") {
    wss = new WebSocketServer({ port: target });
    console.log(`[Signal] WebSocket signaling server running on port ${target}`);
  } else {
    wss = new WebSocketServer({ server: target });
    console.log(`[Signal] WebSocket signaling server attached to HTTP server`);
  }

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const peerId = uuidv4();
    const ip = req.socket.remoteAddress || "unknown";

    console.log(`[Signal] Peer connected: ${peerId} from ${ip}`);

    const peer: ConnectedPeer = {
      ws,
      info: {
        peer_id: peerId,
        sensor_id: "",
        ip_hint: ip,
        capabilities: [],
        cluster_id: null,
        connected_at: new Date(),
        last_heartbeat: new Date(),
      },
      alive: true,
    };

    peers.set(peerId, peer);

    // Send the peer its ID
    sendTo(ws, {
      type: "discovery",
      from: "server",
      to: peerId,
      payload: {
        peer_id: peerId,
        message: "Connected to EdgeSense signaling server",
      },
      timestamp: Date.now(),
    });

    ws.on("message", (data: Buffer) => {
      try {
        const message: SignalMessage = JSON.parse(data.toString());
        handleMessage(peerId, message);
      } catch (err: any) {
        console.error(`[Signal] Invalid message from ${peerId}:`, err.message);
      }
    });

    ws.on("close", () => {
      console.log(`[Signal] Peer disconnected: ${peerId}`);
      peers.delete(peerId);
      // Notify all remaining peers
      broadcastPeerList();
    });

    ws.on("pong", () => {
      const p = peers.get(peerId);
      if (p) {
        p.alive = true;
        p.info.last_heartbeat = new Date();
      }
    });

    ws.on("error", (err) => {
      console.error(`[Signal] WebSocket error for ${peerId}:`, err.message);
    });

    // Broadcast updated peer list to all connected peers
    broadcastPeerList();
  });

  // Heartbeat — check for dead connections every 30s
  heartbeatInterval = setInterval(() => {
    peers.forEach((peer, id) => {
      if (!peer.alive) {
        console.log(`[Signal] Terminating dead peer: ${id}`);
        peer.ws.terminate();
        peers.delete(id);
        return;
      }
      peer.alive = false;
      peer.ws.ping();
    });
  }, 30000);

  return wss;
}

function handleMessage(fromPeerId: string, message: SignalMessage): void {
  const peer = peers.get(fromPeerId);
  if (!peer) return;

  switch (message.type) {
    case "discovery": {
      // Peer is registering itself with sensor info
      peer.info.sensor_id = (message.payload.sensor_id as string) || "";
      peer.info.capabilities = (message.payload.capabilities as any[]) || [];
      peer.info.cluster_id = (message.payload.cluster_id as string) || null;
      console.log(
        `[Signal] Peer ${fromPeerId} registered as sensor ${peer.info.sensor_id}`,
      );
      broadcastPeerList();
      break;
    }

    case "offer":
    case "answer":
    case "ice-candidate": {
      // Relay WebRTC signaling messages to the target peer
      const targetPeer = peers.get(message.to);
      if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
        sendTo(targetPeer.ws, {
          ...message,
          from: fromPeerId,
        });
      } else {
        console.warn(
          `[Signal] Target peer ${message.to} not found or not ready`,
        );
        sendTo(peer.ws, {
          type: "discovery",
          from: "server",
          to: fromPeerId,
          payload: { error: "Target peer not available", target: message.to },
          timestamp: Date.now(),
        });
      }
      break;
    }

    case "heartbeat": {
      peer.alive = true;
      peer.info.last_heartbeat = new Date();
      break;
    }

    case "leave": {
      console.log(`[Signal] Peer ${fromPeerId} leaving gracefully`);
      peer.ws.close();
      peers.delete(fromPeerId);
      broadcastPeerList();
      break;
    }

    default:
      console.warn(`[Signal] Unknown message type: ${message.type}`);
  }
}

function sendTo(ws: WebSocket, message: SignalMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastPeerList(): void {
  const peerList = Array.from(peers.values()).map((p) => ({
    peer_id: p.info.peer_id,
    sensor_id: p.info.sensor_id,
    capabilities: p.info.capabilities,
    cluster_id: p.info.cluster_id,
    connected_at: p.info.connected_at,
  }));

  const message: SignalMessage = {
    type: "discovery",
    from: "server",
    to: "broadcast",
    payload: { peers: peerList, count: peerList.length },
    timestamp: Date.now(),
  };

  peers.forEach((peer) => {
    sendTo(peer.ws, message);
  });
}

/** Broadcast real-time data to all peers (for dashboard updates) */
export function broadcastData(data: Record<string, unknown>): void {
  const message: SignalMessage = {
    type: "discovery",
    from: "server",
    to: "broadcast",
    payload: { type: "data_update", ...data },
    timestamp: Date.now(),
  };

  peers.forEach((peer) => {
    sendTo(peer.ws, message);
  });
}

export function getConnectedPeers(): PeerInfo[] {
  return Array.from(peers.values()).map((p) => p.info);
}

export function stopSignalingServer(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (wss) {
    wss.close();
    wss = null;
    console.log("[Signal] Signaling server stopped.");
  }
}
