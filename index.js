import express from "express";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.BRIDGE_SECRET || "default-secret";

// 中间件
app.use(express.json());

// 指令队列（AI → bridge.py）
let queue = [];
const HELLO_MESSAGE = { type: "hello", msg: "svakom server v1.0" };

// ============ 认证中间件 ============
function auth(req, res, next) {
  const secret = req.headers["x-bridge-secret"];
  if (!secret || secret !== SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

// ============ 定时广播心跳 ============
setInterval(() => {
  queue.push(HELLO_MESSAGE);
}, 1000);

// ============ API 路由 ============

// AI 发送指令
app.post("/toy", auth, (req, res) => {
  const cmd = req.body;
  
  if (!cmd || typeof cmd !== "object") {
    return res.status(400).json({ error: "bad request" });
  }
  
  queue.push(cmd);
  res.json({ ok: true, queued: cmd });
});

// bridge.py 轮询获取指令
app.get("/toy-next", auth, (req, res) => {
  if (queue.length === 0) {
    return res.status(204).end(); // No Content
  }
  
  const cmd = queue.shift();
  res.json(cmd);
});

// 健康检查
app.get("/", (req, res) => {
  res.json(HELLO_MESSAGE);
});

// ============ 启动服务器 ============
app.listen(PORT, () => {
  console.log(`✅ SVAKOM server running on http://localhost:${PORT}`);
  console.log(`🔐 Secret: ${SECRET === "default-secret" ? "⚠️  USING DEFAULT (change it!)" : "✅ configured"}`);
});
