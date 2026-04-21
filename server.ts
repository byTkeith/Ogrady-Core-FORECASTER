import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// --- EXACT SYSTEM INSTRUCTIONS PROVIDED BY YOU ---
const getSystemInstruction = (): string => {
  return `
# ROLE: SENIOR STATISTICAL DATA ARCHITECT

## 1. THE PROPHET PROTOCOL
You are harvesting data for a Facebook Prophet / ARIMA model.
- **MANDATORY VIEW**: [v_AI_Forecasting_Engine_Granular]
- **COLUMN CONVENTION**: You MUST use [ds] for the date and [y] for the quantity. This is the required format for the statistical engine.
- **SORTING RULE**: You MUST [ORDER BY ProductName, ds ASC]. This ensures the time-series is segmented product-by-product.

## 2. AGGREGATION RULES
- **WEEKLY FORECAST**: 
  SELECT DATEADD(WEEK, DATEDIFF(WEEK, 0, ds), 0) AS ds, ProductName, SUM(y) AS y, MAX(CurrentStockOnHand) AS Stock
  FROM v_AI_Forecasting_Engine_Granular
  WHERE ds >= DATEADD(YEAR, -3, GETDATE())
  GROUP BY DATEADD(WEEK, DATEDIFF(WEEK, 0, ds), 0), ProductName
  ORDER BY ProductName, ds ASC;

## 3. SEMANTIC STANDARDS
- All Revenue and Quantity is pre-calculated for Five-Nines accuracy.
- Branch filtering uses [BranchName] with LIKE '%...%'.
- Do NOT perform any math (AVG/MIN/MAX) on the 'y' value. Just return the series.

## 4. OUTPUT FORMAT
>>>SQL
{Your SQL}
>>>EXP
{Identify the series frequency: Weekly/Daily}
>>>STRAT
{High-level context for the CEO}
>>>VIZ
line
>>>X
ds
>>>Y
y
`;
};

// --- API PROXY & LOCAL SQL GENERATOR ---
app.post("/api/proxy", async (req, res) => {
  const { endpoint, geminiApiKey, prompt } = req.body;

  try {
    if (!endpoint) return res.status(400).json({ error: "External API endpoint is required." });
    if (!geminiApiKey) return res.status(400).json({ error: "Gemini API key is required." });
    
    // Ensure properly formatted target URL
    let targetUrl = endpoint;
    if (!targetUrl.includes("/api/")) targetUrl = `${targetUrl.replace(/\/$/, "")}/api/execute`;

    // 1. GENERATE SQL LOCALLY USING GEMINI
    console.log(`[Local API 2 Server] Translating User Prompt into SQL...`);
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: getSystemInstruction()
      }
    });

    const aiRaw = response.text || "";
    const sqlMatch = aiRaw.match(/>>>SQL\s*([\s\S]*?)(?=\s*>>>|$)/);
    const sqlToExecute = sqlMatch ? sqlMatch[1].trim() : "";

    if (!sqlToExecute) {
      throw new Error("Gemini failed to format output with >>>SQL tags.");
    }

    console.log(`[Local API 2 Server] SQL Generated successfully: \n${sqlToExecute}`);
    console.log(`[Local API 2 Server] Sending directly to main.py at: ${targetUrl}`);

    // 2. SEND RAW SQL TO MAIN.PY WITH INFINITE TIMEOUT
    const fetchStart = Date.now();
    const bridgeRes = await fetch(targetUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      // Timeout is effectively 10 minutes, allowing Prophet to calculate safely
      timeout: 600000, 
      body: JSON.stringify({
         sql: sqlToExecute,               
         source: "API_2_FORECASTER", 
         needs_forecasting: true
      }) 
    });

    if (!bridgeRes.ok) {
        throw new Error(`main.py threw an error: ${bridgeRes.status} ${bridgeRes.statusText}`);
    }

    const bridgeData = await bridgeRes.json();
    console.log(`[Local API 2 Server] Request completed successfully in ${Date.now() - fetchStart}ms`);

    res.json(bridgeData);
  } catch (error) {
    console.error("Local Proxy Error:", error);
    res.status(500).json({ 
        error: "Failed the backend pipeline", 
        details: error instanceof Error ? error.message : "Unexpected backend error" 
    });
  }
});

// --- SERVER INSTANTIATION ---
async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Local API 2 Server] Running successfully on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;