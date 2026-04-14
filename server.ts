import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to fetch JSON safely and handle HTML error pages
  const fetchJson = async (url: string, options: any) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "ngrok-skip-browser-warning": "true", // Skip ngrok warning pages
        "Accept": "application/json"
      }
    });

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error(`Expected JSON from ${url} but got ${contentType}. Response start: ${text.substring(0, 200)}`);
      throw new Error(`The external API at ${url} returned an HTML page instead of data. This usually means the URL is incorrect (404) or the server is down.`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.error || `External API error: ${response.status}`);
    }

    return response.json();
  };

  // API Route for Syncing with the Old Extraction API
  app.post("/api/sync", async (req, res) => {
    try {
      const { endpoint, apiKey, mappingInstructions } = req.body;

      if (!endpoint) {
        return res.status(400).json({ error: "External API endpoint is required." });
      }

      // 1. Fetch data from the old API
      // If the endpoint is just a base URL, we append /api/execute
      const targetUrl = endpoint.includes("/api/") ? endpoint : `${endpoint.replace(/\/$/, "")}/api/execute`;
      
      // Default SQL for a basic sync if no specific query is provided
      const defaultSql = "SELECT TOP 100 TimeKey, ProductName, MonthlyNetQty as Qty, MonthlyNetRevenue as Revenue FROM v_AI_Forecasting_Feed ORDER BY TimeKey DESC";

      const bridgeData = await fetchJson(targetUrl, {
        method: "POST",
        headers: {
          "Authorization": apiKey ? `Bearer ${apiKey}` : "",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sql: defaultSql })
      });

      const rawData = bridgeData.data || bridgeData;

      // 2. Use Gemini to map the raw data to O'Grady CORE format if it's not already compatible
      // This ensures that even if the old API changes, the forecaster can adapt.
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return res.json({ data: rawData, note: "Gemini not configured for auto-mapping. Returning raw data." });
      }

      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const prompt = `
        I have raw data from an external MSQL extraction API:
        ${JSON.stringify(rawData).substring(0, 4000)} // Truncate if too large

        Mapping Instructions: ${mappingInstructions || "Extract date and value fields for time-series forecasting."}

        Convert this data into a STRICT JSON array of objects with "date" (YYYY-MM-DD) and "value" (number) fields.
        Example: [{"date": "2024-01-01", "value": 100}, ...]
        
        Return ONLY the JSON array.
      `;

      const mappingResponse = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const mappedData = JSON.parse(mappingResponse.text || "[]");
      res.json({ data: mappedData, originalCount: Array.isArray(rawData) ? rawData.length : 1 });

    } catch (error) {
      console.error("Sync error:", error);
      res.status(500).json({ error: "Failed to sync with the external API. Check the endpoint and CORS settings." });
    }
  });

  // --- SEMANTIC ROUTING LOGIC (From Old API) ---
  const getSemanticInstruction = () => {
    return `
# O'GRADY PAINTS SEMANTIC ROUTING (VERSION 6.0)
Use this to convert natural language into SQL for the MSQL Extraction API.

## 1. TRANSACTIONAL ANALYSIS: [v_AI_Omnibus_Master_Truth]
- PURPOSE: Use for Revenue, Profit, Sales Rep Performance, and Qty SOLD.
- RULE: If the user asks "How much did we SELL," use this view.

## 2. INVENTORY VALUATION: [v_AI_Inventory_History_Truth]
- CORE METRICS: CurrentWarehouseSOH (Stock on Hand), Inventory_Worth_ExclVAT (Financial Value).
- RULE: Use MAX(CurrentWarehouseSOH) when grouping by product to avoid double-counting.

## 3. FORECASTING FEED: [v_AI_Forecasting_Feed]
- Use for historical trends required for statistical analysis.
- Columns: TimeKey, ProductName, MonthlyNetQty, MonthlyNetRevenue.

## 4. RULES:
- NO JOINS: Everything is pre-calculated.
- SYNONYMS: Use LIKE '%...%' for ProductName.
- FISCAL YEAR: March 1st - February 28th.

OUTPUT FORMAT:
>>>SQL
SELECT ...
>>>EXP
Explanation...
`;
  };

  // API Route for Chat-based Forecasting with Smart Routing to Old API
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, data, context, syncWithOldApi, externalEndpoint, externalApiKey } = req.body;

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
      }

      const ai = new GoogleGenAI({ apiKey });
      let activeData = data;
      let extractionLog = "";

      // 1. SMART ROUTING: Convert prompt to SQL and fetch from Old API
      if (syncWithOldApi && externalEndpoint) {
        try {
          // Phase A: Generate SQL using the Old API's Semantic Logic
          const sqlGenPrompt = `
            ${getSemanticInstruction()}
            User Prompt: "${message}"
            Generate the SQL query to extract the necessary data from the MSQL database.
          `;
          
          const sqlResponse = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: sqlGenPrompt
          });

          const sqlMatch = sqlResponse.text?.match(/>>>SQL\s*([\s\S]*?)(?=(?:>>>)|$)/);
          const generatedSql = sqlMatch ? sqlMatch[1].trim() : null;

          if (generatedSql) {
            console.log("Smart Routing: Executing SQL on Old API Bridge...");
            // Phase B: Call the Old API's /api/execute endpoint using fetchJson
            const bridgeData = await fetchJson(`${externalEndpoint.replace(/\/$/, "")}/api/execute`, {
              method: "POST",
              headers: {
                "Authorization": externalApiKey ? `Bearer ${externalApiKey}` : "",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ sql: generatedSql })
            });

            const rawData = bridgeData.data || [];
            
            // Phase C: Map to O'Grady CORE format
              const mappingPrompt = `
                I have raw data from an external MSQL extraction API:
                ${JSON.stringify(rawData).substring(0, 3000)}

                Convert this into a STRICT JSON array of objects with "date" (YYYY-MM-DD) and "value" (number).
                Return ONLY the JSON array.
              `;
              const mappingResult = await ai.models.generateContent({
                model: "gemini-3.1-pro-preview",
                contents: mappingPrompt,
                config: { responseMimeType: "application/json" }
              });
              activeData = JSON.parse(mappingResult.text || "[]");
              extractionLog = `Successfully extracted ${activeData.length} records using generated SQL: ${generatedSql}`;
            }
          } catch (syncError) {
            console.error("Smart Routing Sync failed:", syncError);
            extractionLog = "Failed to extract fresh data. Using dashboard fallback.";
          }
        }

      // 2. DEEP ANALYSIS: Use the ensemble models on the data
      const analysisPrompt = `
        You are the O'Grady CORE Forecaster. 
        Models: ARIMA, Facebook Prophet, Octonus Deep-Trend.

        Data Context: ${context || "Manufacturing data"}
        Current Data: ${JSON.stringify(activeData).substring(0, 3000)}
        Extraction Log: ${extractionLog}
        
        Stakeholder Question: "${message}"

        Tasks:
        1. Analyze the data using the ensemble models.
        2. Provide specific suggestions on Price, Stock, or Trends.
        3. Reference the "Extraction Log" if data was freshly pulled.

        Return in STRICT JSON:
        {
          "answer": "...",
          "suggestedMove": "...",
          "confidence": number,
          "evidence": ["...", "..."],
          "futureOutlook": "...",
          "technicalNote": "Ensemble analysis summary",
          "newDataUsed": ${activeData !== data}
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: analysisPrompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || "{}");
      res.json({ ...result, mappedData: activeData !== data ? activeData : null });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process chat request." });
    }
  });

  // API Route for Forecasting
  app.post("/api/forecast", async (req, res) => {
    try {
      const { data, horizon, context } = req.body;

      if (!data || !Array.isArray(data)) {
        return res.status(400).json({ error: "Invalid data format. Expected an array of time-series data." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // We use Gemini to perform the "Prophet" and "Holt-Winters" analysis.
      // We'll provide it with the data and ask for specific mathematical outputs.
      const prompt = `
        You are an expert Data Scientist and Actuarial Scientist specializing in large-scale manufacturing.
        Perform a high-scale time-series forecast on the following manufacturing data:
        ${JSON.stringify(data)}

        Context: ${context || "Manufacturing production and sales data"}
        Forecast Horizon: ${horizon || 7} periods.

        Tasks:
        1. Apply Holt-Winters (Triple Exponential Smoothing) for immediate seasonal patterns.
        2. Apply Facebook Prophet logic for holiday effects and multi-period seasonality.
        3. Apply ARIMA (AutoRegressive Integrated Moving Average) logic to handle non-stationary data and autocorrelation in large-scale sales.
        4. Apply LSTM (Long Short-Term Memory) and Octonus reasoning to capture long-term dependencies and complex non-linear patterns typical in high-volume manufacturing.
        5. Provide a forecast for the next ${horizon || 7} periods.
        6. Provide manufacturing-specific insights:
           - Suggested production/stock levels (CORE optimization).
           - Pricing strategy for high-volume clients.
           - Promotion suggestions for specific product lines.
           - Impact of global supply chain trends or upcoming holidays.

        Return the response in STRICT JSON format with the following structure:
        {
          "forecast": [
            { "period": "...", "value": number, "lower": number, "upper": number }
          ],
          "decomposition": {
            "trend": "...",
            "seasonality": "...",
            "holidays": "...",
            "arima_lstm_insights": "..."
          },
          "insights": {
            "stockLevel": "...",
            "pricing": "...",
            "promotions": "...",
            "reasoning": "..."
          },
          "metrics": {
            "mae": number,
            "rmse": number
          }
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || "{}");
      res.json(result);
    } catch (error) {
      console.error("Forecasting error:", error);
      res.status(500).json({ error: "Failed to generate forecast." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
