import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Health check for Vercel deployment verification
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), environment: process.env.NODE_ENV });
});

// Helper to fetch JSON safely and handle HTML error pages
const fetchJson = async (url: string, options: any) => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "ngrok-skip-browser-warning": "true",
        "Accept": "application/json"
      },
      timeout: 15000 // 15s timeout to stay within Vercel limits
    });

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`External API at ${url} returned non-JSON response (${contentType}). Status: ${response.status}. Body: ${text.substring(0, 100)}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.error || `External API error: ${response.status}`);
    }

    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'FetchError') {
      throw new Error(`Network error connecting to ${url}: ${err.message}`);
    }
    throw err;
  }
};

// Simple Proxy for the Old Extraction API
app.post("/api/proxy", async (req, res) => {
  const { endpoint, apiKey, sql } = req.body;

  try {
    if (!endpoint) {
      return res.status(400).json({ error: "External API endpoint is required." });
    }

    // Ensure we have a valid URL
    let targetUrl = endpoint;
    try {
      new URL(endpoint);
    } catch (e) {
      return res.status(400).json({ error: `Invalid endpoint URL: ${endpoint}` });
    }

    if (!targetUrl.includes("/api/")) {
      targetUrl = `${targetUrl.replace(/\/$/, "")}/api/execute`;
    }
    
    console.log(`Proxying request to: ${targetUrl}`);

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
    const message = error instanceof Error ? error.message : "Failed to connect to the external API.";
    
    // Return a more descriptive error to the frontend
    res.status(500).json({ 
      error: message,
      details: "This error usually occurs when the external API is unreachable, returns an invalid response, or times out.",
      endpoint: endpoint
    });
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
