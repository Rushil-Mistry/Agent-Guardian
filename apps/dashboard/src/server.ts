import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { WorkflowEngine } from "./workflow-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static frontend
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

const engine = new WorkflowEngine();
const PORT = 4000;

// ─── REST API ───────────────────────────────────────────────────────────────

app.get("/api/status", (_req, res) => {
  res.json(engine.getState());
});

app.get("/api/initial", (_req, res) => {
  res.json(engine.getInitialStatus());
});

app.post("/api/incident/start", (_req, res) => {
  engine.runIncident();
  res.json({ ok: true, message: "Incident simulation started" });
});

app.post("/api/incident/approve", (_req, res) => {
  engine.resolveApproval(true);
  res.json({ ok: true, message: "Deployment approved" });
});

app.post("/api/incident/reject", (_req, res) => {
  engine.resolveApproval(false);
  res.json({ ok: true, message: "Deployment rejected" });
});

app.post("/api/killswitch/stop", (_req, res) => {
  engine.activateKillSwitch();
  res.json({ ok: true, message: "Kill switch activated" });
});

app.post("/api/killswitch/resume", (_req, res) => {
  engine.resetOrResumeKillSwitch();
  res.json({ ok: true, message: "Kill switch reset and re-armed" });
});

app.get("/api/audit", (_req, res) => {
  res.json(engine.state.auditEvents);
});

// ─── WebSocket ──────────────────────────────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "init", data: engine.getState() }));
  ws.on("close", () => clients.delete(ws));
});

function broadcast(data: unknown) {
  const msg = JSON.stringify({ type: "update", data });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

engine.on("update", (state) => broadcast(state));

// ─── Start ──────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n\x1b[36m╔══════════════════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  \x1b[1m\x1b[35mAgent Guardian\x1b[0m \x1b[2m— Incident Command Center\x1b[0m              \x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m╠══════════════════════════════════════════════════════════╣\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  Dashboard:  \x1b[4m\x1b[33mhttp://localhost:${PORT}\x1b[0m                      \x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  WebSocket:  \x1b[4m\x1b[33mws://localhost:${PORT}/ws\x1b[0m                      \x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  API Base:   \x1b[4m\x1b[33mhttp://localhost:${PORT}/api\x1b[0m                   \x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m╚══════════════════════════════════════════════════════════╝\x1b[0m\n`);
});