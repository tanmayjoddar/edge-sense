// ============================================================
// EdgeSense Client — WebRTC P2P Mesh Manager
// Manages peer-to-peer data channels between nearby sensor
// nodes using WebRTC. Decentralized, no master node.
// ============================================================

import { v4 as uuidv4 } from "uuid";

export interface P2PReading {
  sensor_id: string;
  timestamp: string;
  pm25: number | null;
  pm10: number | null;
  co2: number | null;
  temperature: number | null;
  humidity: number | null;
  quality_score: number;
}

interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  state: "connecting" | "connected" | "disconnected";
  lastActivity: Date;
}

type MessageHandler = (peerId: string, data: P2PReading) => void;
type PeerChangeHandler = (peers: string[]) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let ws: WebSocket | null = null;
let myPeerId: string = "";
let mySensorId: string = "";
const connections: Map<string, PeerConnection> = new Map();
let onReadingReceived: MessageHandler | null = null;
let onPeersChanged: PeerChangeHandler | null = null;

export function initP2P(config: {
  signalingUrl: string;
  sensorId: string;
  onReading: MessageHandler;
  onPeersChange: PeerChangeHandler;
}): void {
  mySensorId = config.sensorId;
  onReadingReceived = config.onReading;
  onPeersChanged = config.onPeersChange;

  connectToSignaling(config.signalingUrl);
}

function connectToSignaling(url: string): void {
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("[P2P] Connected to signaling server");
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleSignalingMessage(message);
    } catch (err) {
      console.error("[P2P] Invalid signaling message:", err);
    }
  };

  ws.onclose = () => {
    console.log("[P2P] Signaling connection closed, reconnecting in 5s...");
    setTimeout(() => connectToSignaling(url), 5000);
  };

  ws.onerror = (err) => {
    console.error("[P2P] Signaling error:", err);
  };
}

function handleSignalingMessage(message: any): void {
  switch (message.type) {
    case "discovery": {
      if (message.payload.peer_id && !myPeerId) {
        // Server assigned us a peer ID
        myPeerId = message.payload.peer_id;
        console.log(`[P2P] My peer ID: ${myPeerId}`);
        // Register with sensor info
        sendSignal({
          type: "discovery",
          from: myPeerId,
          to: "server",
          payload: {
            sensor_id: mySensorId,
            capabilities: ["pm25", "pm10", "co2", "temperature", "humidity"],
          },
          timestamp: Date.now(),
        });
      }

      if (message.payload.peers) {
        // Updated peer list — connect to new peers
        const peerList: any[] = message.payload.peers;
        const otherPeers = peerList.filter((p) => p.peer_id !== myPeerId);

        for (const peer of otherPeers) {
          if (!connections.has(peer.peer_id)) {
            initiateConnection(peer.peer_id);
          }
        }

        // Cleanup disconnected peers
        const activePeerIds = new Set(otherPeers.map((p) => p.peer_id));
        connections.forEach((_, peerId) => {
          if (!activePeerIds.has(peerId)) {
            closeConnection(peerId);
          }
        });

        onPeersChanged?.(Array.from(connections.keys()));
      }
      break;
    }

    case "offer": {
      handleOffer(message.from, message.payload);
      break;
    }

    case "answer": {
      handleAnswer(message.from, message.payload);
      break;
    }

    case "ice-candidate": {
      handleIceCandidate(message.from, message.payload);
      break;
    }
  }
}

async function initiateConnection(peerId: string): Promise<void> {
  console.log(`[P2P] Initiating connection to ${peerId}`);

  const pc = createPeerConnection(peerId);
  const dc = pc.createDataChannel("edgesense-data", { ordered: false });

  setupDataChannel(peerId, dc);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  sendSignal({
    type: "offer",
    from: myPeerId,
    to: peerId,
    payload: { sdp: offer.sdp, type: offer.type },
    timestamp: Date.now(),
  });
}

async function handleOffer(fromPeerId: string, payload: any): Promise<void> {
  console.log(`[P2P] Received offer from ${fromPeerId}`);

  const pc = createPeerConnection(fromPeerId);

  pc.ondatachannel = (event) => {
    setupDataChannel(fromPeerId, event.channel);
  };

  await pc.setRemoteDescription(new RTCSessionDescription(payload));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  sendSignal({
    type: "answer",
    from: myPeerId,
    to: fromPeerId,
    payload: { sdp: answer.sdp, type: answer.type },
    timestamp: Date.now(),
  });
}

async function handleAnswer(fromPeerId: string, payload: any): Promise<void> {
  const conn = connections.get(fromPeerId);
  if (conn) {
    await conn.connection.setRemoteDescription(
      new RTCSessionDescription(payload),
    );
    console.log(`[P2P] Connection established with ${fromPeerId}`);
  }
}

async function handleIceCandidate(
  fromPeerId: string,
  payload: any,
): Promise<void> {
  const conn = connections.get(fromPeerId);
  if (conn && payload.candidate) {
    await conn.connection.addIceCandidate(new RTCIceCandidate(payload));
  }
}

function createPeerConnection(peerId: string): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  const peerConn: PeerConnection = {
    peerId,
    connection: pc,
    dataChannel: null,
    state: "connecting",
    lastActivity: new Date(),
  };

  connections.set(peerId, peerConn);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({
        type: "ice-candidate",
        from: myPeerId,
        to: peerId,
        payload: event.candidate.toJSON(),
        timestamp: Date.now(),
      });
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    console.log(`[P2P] Connection state with ${peerId}: ${state}`);
    if (state === "disconnected" || state === "failed" || state === "closed") {
      closeConnection(peerId);
    }
  };

  return pc;
}

function setupDataChannel(peerId: string, channel: RTCDataChannel): void {
  const conn = connections.get(peerId);
  if (!conn) return;

  conn.dataChannel = channel;

  channel.onopen = () => {
    console.log(`[P2P] Data channel open with ${peerId}`);
    conn.state = "connected";
    conn.lastActivity = new Date();
    onPeersChanged?.(getConnectedPeerIds());
  };

  channel.onmessage = (event) => {
    try {
      const data: P2PReading = JSON.parse(event.data);
      conn.lastActivity = new Date();
      onReadingReceived?.(peerId, data);
    } catch (err) {
      console.error("[P2P] Failed to parse P2P message:", err);
    }
  };

  channel.onclose = () => {
    console.log(`[P2P] Data channel closed with ${peerId}`);
    conn.state = "disconnected";
    onPeersChanged?.(getConnectedPeerIds());
  };

  channel.onerror = (err) => {
    console.error(`[P2P] Data channel error with ${peerId}:`, err);
  };
}

function closeConnection(peerId: string): void {
  const conn = connections.get(peerId);
  if (conn) {
    conn.dataChannel?.close();
    conn.connection.close();
    connections.delete(peerId);
    onPeersChanged?.(getConnectedPeerIds());
  }
}

function sendSignal(message: any): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Broadcast a reading to all connected peers */
export function broadcastReading(reading: P2PReading): void {
  const data = JSON.stringify(reading);
  connections.forEach((conn) => {
    if (conn.dataChannel && conn.dataChannel.readyState === "open") {
      conn.dataChannel.send(data);
    }
  });
}

export function getConnectedPeerIds(): string[] {
  const ids: string[] = [];
  connections.forEach((conn, peerId) => {
    if (conn.state === "connected") {
      ids.push(peerId);
    }
  });
  return ids;
}

export function getPeerCount(): number {
  return getConnectedPeerIds().length;
}

export function getMyPeerId(): string {
  return myPeerId;
}

export function destroyP2P(): void {
  connections.forEach((_, peerId) => closeConnection(peerId));
  if (ws) {
    sendSignal({
      type: "leave",
      from: myPeerId,
      to: "server",
      payload: {},
      timestamp: Date.now(),
    });
    ws.close();
    ws = null;
  }
  myPeerId = "";
  console.log("[P2P] P2P mesh destroyed");
}
