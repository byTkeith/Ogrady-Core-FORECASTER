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
  console.log("Health check requested");
  res.json({ status: "ok", timestamp: new Date().toISOString(), environment: process.env.NODE_ENV });
});

// Helper to wake up a sleeping serverless function
const warmUp = async (url: string) => {
  try {
    const origin = new URL(url).origin;
    console.log(`[Warm-up] Sending pulse to wake up: ${origin}`);
    
    const start = Date.now();
    // We hit the root or a health endpoint with a short timeout
    await fetch(origin, { 
      method: "GET", 
      timeout: 3000, // Reduced from 5s
      headers: { "User-Agent": "OGrady-Forecaster-Warmer" }
    }).catch(() => {});
    
    const elapsed = Date.now() - start;
    // If the pulse was fast (< 500ms), the server is already awake.
    // If it was slow, it was likely waking up, so we give it a tiny bit more time.
    const waitTime = elapsed < 500 ? 0 : Math.max(0, 1500 - elapsed);
    
    if (waitTime > 0) {
      console.log(`[Warm-up] Waiting ${waitTime}ms for initialization...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
      console.log(`[Warm-up] Server already awake, proceeding immediately.`);
    }
  } catch (e) {
    console.warn("[Warm-up] Pulse failed, proceeding to main request:", e);
  }
};

// Helper to fetch JSON safely and handle HTML error pages
const fetchJson = async (url: string, options: any) => {
  console.log('Fetching URL:', url);
  // Avoid logging the full options if it contains sensitive API keys, but log the structure
  console.log('Fetch method:', options.method);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "ngrok-skip-browser-warning": "true",
        "Accept": "application/json"
      },
      timeout: 120000 // Increased to 120s for intensive AI & mathematical model computation
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`External API at ${url} returned non-JSON response (${contentType}). Status: ${response.status}. Body: ${text.substring(0, 100)}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Extract a string message from potentially complex error objects
      let errorMessage = "Unknown Error";
      if (typeof errorData.detail === 'string') {
        errorMessage = errorData.detail;
      } else if (typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      } else if (errorData.error && typeof errorData.error === 'object') {
        errorMessage = errorData.error.message || JSON.stringify(errorData.error);
      } else if (errorData.detail && typeof errorData.detail === 'object') {
        errorMessage = errorData.detail.message || JSON.stringify(errorData.detail);
      } else {
        errorMessage = JSON.stringify(errorData) || `External API error: ${response.status}`;
      }

      throw new Error(errorMessage);
    }

    return response.json();
  } catch (err: any) {
    console.error('Raw fetch error:', err);
    console.error('Error name:', err?.name);
    console.error('Error message:', err?.message);
    console.error('Error cause:', err?.cause);

    if (err.name === 'FetchError') {
      throw new Error(`Network error connecting to ${url}: ${err.message}`);
    }
    throw err;
  }
};

// Simple Proxy for the Old Extraction API
app.post("/api/proxy", async (req, res) => {
  const { endpoint, apiKey, ...payload } = req.body;

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
    
    // Step 1: Wake up the external API
    await warmUp(targetUrl);

    console.log(`Proxying request to: ${targetUrl}`);

    const fetchStart = Date.now();
    const bridgeData = await fetchJson(targetUrl, {
      method: "POST",
      headers: {
        "Authorization": apiKey ? `Bearer ${apiKey}` : "",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload) // Forward everything (prompt, sql, etc.)
    });
    console.log(`[Proxy] Request completed in ${Date.now() - fetchStart}ms`);

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
