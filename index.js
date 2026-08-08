import express from "express";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.BRIDGE_SECRET || "default-secret";

app.use(express.json());

// 指令队列
let queue = [];
let lastHello = { type: "hello", msg: "svakom server v1.0" };

// 广播 hello
setInterval(() => {
  try {
    queue.push(lastHello);
  } catch (e) {}
}, 1000);

// 认证中间件
function auth(req, res, next) {
  const s = req.headers["x-bridge-secret"];
  if (!s || s !== SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

// ============= MCP 协议支持 =============
// MCP 协议入口 - 支持 GET 请求（用于 Chatbox 测试连接）
app.get("/mcp", (req, res) => {
  res.json({
    jsonrpc: "2.0",
    result: {
      protocolVersion: "0.1.0",
      capabilities: { tools: {} },
      serverInfo: { name: "svakom-mcp-server", version: "1.0.0" }
    }
  });
});
// MCP 协议入口 (Chatbox 连接用)
app.post("/mcp", async (req, res) => {
  try {
    const { method, params, jsonrpc, id } = req.body;

    // 处理 MCP 初始化请求
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id: id,
        result: {
          protocolVersion: "0.1.0",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "svakom-mcp-server",
            version: "1.0.0"
          }
        }
      });
    }

    // 处理工具列表请求
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id: id,
        result: {
          tools: [
            {
              name: "toy_set_speed",
              description: "设置玩具震动强度",
              inputSchema: {
                type: "object",
                properties: {
                  speed: {
                    type: "number",
                    description: "强度值 0.0 ~ 1.0",
                    minimum: 0,
                    maximum: 1
                  },
                  sec: {
                    type: "number",
                    description: "持续秒数（可选）"
                  }
                },
                required: ["speed"]
              }
            },
            {
              name: "toy_stop",
              description: "立即停止玩具震动",
              inputSchema: {
                type: "object",
                properties: {}
              }
            },
            {
              name: "toy_set_pattern",
              description: "设置振动花样",
              inputSchema: {
                type: "object",
                properties: {
                  pattern: {
                    type: "number",
                    description: "花样编号 1-8",
                    minimum: 1,
                    maximum: 8
                  },
                  level: {
                    type: "number",
                    description: "强度 0.0 ~ 1.0",
                    minimum: 0,
                    maximum: 1
                  }
                },
                required: ["pattern"]
              }
            }
          ]
        }
      });
    }

    // 处理工具调用请求
    if (method === "tools/call") {
      const toolName = params.name;
      const args = params.arguments || {};

      let cmd = {};
      if (toolName === "toy_set_speed") {
        cmd = { speed: args.speed };
        if (args.sec) cmd.sec = args.sec;
      } else if (toolName === "toy_stop") {
        cmd = { stop: true };
      } else if (toolName === "toy_set_pattern") {
        cmd = { pattern: args.pattern, level: args.level || 0.6 };
      } else {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: id,
          error: { code: -32601, message: "Tool not found" }
        });
      }

      // 把指令放入队列
      queue.push(cmd);

      return res.json({
        jsonrpc: "2.0",
        id: id,
        result: {
          content: [
            {
              type: "text",
              text: `✅ 指令已发送: ${JSON.stringify(cmd)}`
            }
          ]
        }
      });
    }

    // 其他方法
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id,
      error: { code: -32601, message: "Method not found" }
    });

  } catch (error) {
    console.error("MCP Error:", error);
    return res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: { code: -32000, message: error.message }
    });
  }
});

// ============= 原有 API =============

// AI 发指令
app.post("/toy", auth, (req, res) => {
  const cmd = req.body;
  if (!cmd || typeof cmd !== "object") {
    return res.status(400).json({ error: "bad request" });
  }
  queue.push(cmd);
  res.json({ ok: true, queued: cmd });
});

// bridge.py 轮询取指令
app.get("/toy-next", auth, (req, res) => {
  if (queue.length > 0) {
    const cmd = queue.shift();
    return res.json(cmd);
  }
  res.status(204).end();
});

// 健康检查
app.get("/", (req, res) => {
  res.json(lastHello);
});

app.listen(PORT, () => {
  console.log(`SVAKOM server listening on :${PORT}`);
});
