import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Helper to fetch JSON safely and handle HTML error pages
const fetchJson = async (url: string, options: any) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "ngrok-skip-browser-warning": "true",
      "Accept": "application/json"
    }
  });

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`External API at ${url} returned non-JSON response. Status: ${response.status}`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.error || `External API error: ${response.status}`);
  }

  return response.json();
};

// Simple Proxy for the Old Extraction API
app.post("/api/proxy", async (req, res) => {
  try {
    const { endpoint, apiKey, sql } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: "External API endpoint is required." });
    }

    const targetUrl = endpoint.includes("/api/") ? endpoint : `${endpoint.replace(/\/$/, "")}/api/execute`;
    
    const bridgeData = await fetchJson(targetUrl, {
      method: "POST",
      headers: {
        "Authorization": apiKey ? `Bearer ${apiKey}` : "",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sql })
    });

    res.json(bridgeData);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to connect to the external API." });
  }
});

// Static serving for production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Only start the server if we're not in a serverless environment
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
