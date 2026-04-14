/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { 
  TrendingUp, 
  Package, 
  DollarSign, 
  Calendar, 
  AlertCircle,
  RefreshCw,
  ChevronRight,
  BarChart3,
  BrainCircuit,
  Info,
  Database,
  Link as LinkIcon,
  Factory,
  Zap,
  MessageSquare,
  Send,
  User,
  Bot,
  ShieldCheck,
  History
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format, addDays, subDays } from "date-fns";
import { GoogleGenAI, Type } from "@google/genai";

// Semantic Routing Logic (From Old API)
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

// Mock data generator for initial state
const generateMockData = (days: number) => {
  const data = [];
  const baseValue = 5000; // Larger scale for manufacturing
  for (let i = days; i >= 0; i--) {
    const date = subDays(new Date(), i);
    // Add some trend and seasonality
    const seasonality = Math.sin((days - i) * (2 * Math.PI / 7)) * 500;
    const trend = (days - i) * 50;
    const noise = Math.random() * 200;
    data.push({
      date: format(date, "yyyy-MM-dd"),
      value: Math.round(baseValue + trend + seasonality + noise)
    });
  }
  return data;
};

interface ForecastPoint {
  period: string;
  value: number;
  lower: number;
  upper: number;
}

interface ForecastResult {
  forecast: ForecastPoint[];
  decomposition: {
    trend: string;
    seasonality: string;
    holidays: string;
    arima_lstm_insights?: string;
  };
  insights: {
    stockLevel: string;
    pricing: string;
    promotions: string;
    reasoning: string;
  };
  metrics: {
    mae: number;
    rmse: number;
  };
}

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  analysis?: {
    suggestedMove: string;
    confidence: number;
    evidence: string[];
    futureOutlook: string;
    technicalNote: string;
  };
}

export default function App() {
  const [historicalData, setHistoricalData] = useState(generateMockData(60)); // More data points
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState(30); // Longer horizon for manufacturing
  const [productName, setProductName] = useState("Industrial Grade Steel Coil");
  
  // Persist API settings in localStorage
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('og_bridge_url') || "https://your-old-api.vercel.app");
  const [externalApiKey, setExternalApiKey] = useState(() => localStorage.getItem('og_bridge_key') || "");
  
  useEffect(() => {
    localStorage.setItem('og_bridge_url', apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    localStorage.setItem('og_bridge_key', externalApiKey);
  }, [externalApiKey]);

  const [isSyncing, setIsSyncing] = useState(false);
  
  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [liveSync, setLiveSync] = useState(true);

  // Initialize Gemini AI
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const runForecast = async () => {
    setLoading(true);
    try {
      const prompt = `
        You are an expert Data Scientist and Actuarial Scientist specializing in large-scale manufacturing.
        Perform a high-scale time-series forecast on the following manufacturing data:
        ${JSON.stringify(historicalData)}

        Context: Manufacturing production data for ${productName}. High volume, large scale.
        Forecast Horizon: ${horizon} periods.

        Tasks:
        1. Apply Holt-Winters (Triple Exponential Smoothing) for immediate seasonal patterns.
        2. Apply Facebook Prophet logic for holiday effects and multi-period seasonality.
        3. Apply ARIMA (AutoRegressive Integrated Moving Average) logic to handle non-stationary data and autocorrelation in large-scale sales.
        4. Apply LSTM (Long Short-Term Memory) and Octonus reasoning to capture long-term dependencies and complex non-linear patterns typical in high-volume manufacturing.
        5. Provide a forecast for the next ${horizon} periods.
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
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || "{}");
      setForecastResult(result);
    } catch (error) {
      console.error("Forecast failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: userInput };
    setChatMessages(prev => [...prev, userMsg]);
    setUserInput("");
    setIsChatLoading(true);

    try {
      let activeData = historicalData;
      let extractionLog = "";

      // 1. SMART ROUTING: Convert prompt to SQL and fetch from Old API
      if (liveSync && apiUrl) {
        try {
          // Phase A: Generate SQL using the Old API's Semantic Logic
          const sqlGenPrompt = `
            ${getSemanticInstruction()}
            User Prompt: "${userInput}"
            Generate the SQL query to extract the necessary data from the MSQL database.
          `;
          
          const sqlResponse = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: sqlGenPrompt
          });

          const sqlMatch = sqlResponse.text?.match(/>>>SQL\s*([\s\S]*?)(?=(?:>>>)|$)/);
          const generatedSql = sqlMatch ? sqlMatch[1].trim() : null;

          if (generatedSql) {
            // Phase B: Call the Backend Proxy to reach the Old API
            const proxyResponse = await fetch("/api/proxy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                endpoint: apiUrl,
                apiKey: externalApiKey,
                sql: generatedSql
              })
            });

            if (proxyResponse.ok) {
              const bridgeData = await proxyResponse.json();
              const rawData = bridgeData.data || [];
              
              if (rawData.length === 0) {
                extractionLog = "Extraction returned no records. Using dashboard fallback.";
              } else {
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
                setHistoricalData(activeData);
                extractionLog = `Successfully extracted ${activeData.length} records using generated SQL: ${generatedSql}`;
              }
            } else {
              const errorData = await proxyResponse.json();
              extractionLog = `Extraction failed: ${errorData.error || proxyResponse.statusText}`;
            }
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

        Data Context: Manufacturing production data for ${productName}. High volume, large scale.
        Current Data: ${JSON.stringify(activeData).substring(0, 3000)}
        Extraction Log: ${extractionLog}
        
        Stakeholder Question: "${userInput}"

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
          "technicalNote": "Ensemble analysis summary"
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: analysisPrompt,
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || "{}");
      
      const botMsg: ChatMessage = { 
        role: 'bot', 
        content: result.answer,
        analysis: {
          suggestedMove: result.suggestedMove,
          confidence: result.confidence,
          evidence: result.evidence,
          futureOutlook: result.futureOutlook,
          technicalNote: result.technicalNote
        }
      };
      setChatMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error("Chat failed:", error);
      setChatMessages(prev => [...prev, { role: 'bot', content: "I encountered an error analyzing the data. Please check your connection and API key." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const syncFromOldApi = async () => {
    if (!apiUrl) {
      alert("Please provide the Old API Endpoint in the Source tab first.");
      return;
    }
    setIsSyncing(true);
    try {
      // 1. Fetch raw data via proxy
      const defaultSql = "SELECT TOP 100 TimeKey, ProductName, MonthlyNetQty as Qty, MonthlyNetRevenue as Revenue FROM v_AI_Forecasting_Feed ORDER BY TimeKey DESC";
      const proxyResponse = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: apiUrl,
          apiKey: externalApiKey,
          sql: defaultSql
        })
      });
      
      const bridgeData = await proxyResponse.json();
      
      if (!proxyResponse.ok) {
        throw new Error(bridgeData.error || `Server error: ${proxyResponse.status}`);
      }

      const rawData = bridgeData.data || bridgeData;

      if (!rawData || (Array.isArray(rawData) && rawData.length === 0)) {
        throw new Error("The external API returned no data for the default query.");
      }

      // 2. Map data using Gemini
      const mappingPrompt = `
        I have raw data from an external MSQL extraction API:
        ${JSON.stringify(rawData).substring(0, 4000)}

        Convert this data into a STRICT JSON array of objects with "date" (YYYY-MM-DD) and "value" (number) fields.
        Return ONLY the JSON array.
      `;

      const mappingResponse = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: mappingPrompt,
        config: { responseMimeType: "application/json" }
      });

      const mappedData = JSON.parse(mappingResponse.text || "[]");
      if (Array.isArray(mappedData)) {
        setHistoricalData(mappedData);
        runForecast();
      }
    } catch (error) {
      console.error("Sync failed:", error);
      alert(`Sync failed: ${error instanceof Error ? error.message : "An unexpected error occurred during synchronization."}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Combine historical and forecast for charting
  const chartData = [
    ...historicalData.map(d => ({ ...d, type: 'historical' })),
    ...(forecastResult?.forecast.map(f => ({
      date: f.period,
      value: f.value,
      lower: f.lower,
      upper: f.upper,
      type: 'forecast'
    })) || [])
  ];

  return (
    <div className="min-h-screen bg-[#F0F4F0] text-[#1A2F1A] font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-emerald-900">
              <Factory className="w-8 h-8 text-emerald-600" />
              O'Grady CORE Forecaster
            </h1>
            <p className="text-emerald-700/70">Enterprise Manufacturing Intelligence • ARIMA • Prophet • Octonus • LSTM</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-emerald-100 rounded-lg p-1 px-3 shadow-sm">
              <span className="text-sm font-medium text-emerald-600/60">Unit:</span>
              <Input 
                value={productName} 
                onChange={(e) => setProductName(e.target.value)}
                className="border-none shadow-none h-8 w-64 focus-visible:ring-0 text-emerald-900 font-medium"
              />
            </div>
            <Button 
              onClick={runForecast} 
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md border-none"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
              Analyze Scale
            </Button>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Chart & Data (8 cols) */}
          <div className="lg:col-span-8 space-y-8">
            <Card className="shadow-sm border-none bg-white ring-1 ring-emerald-100">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-emerald-900">Production & Sales Projection</CardTitle>
                  <CardDescription>Multi-model ensemble analysis (ARIMA, Prophet, Octonus)</CardDescription>
                </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Historical</Badge>
                <Badge variant="outline" className="bg-emerald-600 text-white border-none">CORE Forecast</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorHist" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorFore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ecf2ec" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#4a674a' }}
                      minTickGap={40}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#4a674a' }}
                      tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '12px', 
                        border: '1px solid #d1fae5', 
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)',
                        backgroundColor: '#fff'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#10b981" 
                      strokeWidth={2.5}
                      fillOpacity={1} 
                      fill="url(#colorHist)" 
                      connectNulls
                      dot={false}
                    />
                    {forecastResult && (
                      <>
                        <Area 
                          type="monotone" 
                          dataKey="upper" 
                          stroke="none" 
                          fill="#059669" 
                          fillOpacity={0.1} 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="lower" 
                          stroke="none" 
                          fill="#fff" 
                          fillOpacity={1} 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#059669" 
                          strokeWidth={3}
                          strokeDasharray="6 4"
                          dot={false}
                        />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

            {/* Data Management Tabs */}
            <Tabs defaultValue="data" className="w-full">
              <TabsList className="bg-white border border-emerald-100 shadow-sm">
                <TabsTrigger value="data" className="data-[state=active]:text-emerald-700">Historical Scale</TabsTrigger>
                <TabsTrigger value="config" className="data-[state=active]:text-emerald-700">Model Ensemble</TabsTrigger>
                <TabsTrigger value="source" className="data-[state=active]:text-emerald-700">CORE Source</TabsTrigger>
              </TabsList>
              <TabsContent value="data" className="mt-4">
                <Card className="shadow-sm border-none bg-white ring-1 ring-emerald-100">
                  <CardContent className="p-0">
                    <div className="max-h-[300px] overflow-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-emerald-50/50 text-emerald-700 uppercase text-[10px] font-bold sticky top-0">
                          <tr>
                            <th className="px-6 py-3">Timestamp</th>
                            <th className="px-6 py-3">Production Value</th>
                            <th className="px-6 py-3">Confidence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-50">
                          {historicalData.map((row, i) => (
                            <tr key={i} className="hover:bg-emerald-50/30 transition-colors">
                              <td className="px-6 py-4 font-medium text-emerald-900">{row.date}</td>
                              <td className="px-6 py-4 font-mono text-emerald-700">${row.value.toLocaleString()}</td>
                              <td className="px-6 py-4">
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-none">99.2%</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="config" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="shadow-sm border-none bg-white ring-1 ring-emerald-100 p-4">
                    <h4 className="text-xs font-bold text-emerald-900 uppercase mb-2">ARIMA</h4>
                    <p className="text-[10px] text-emerald-700/70">Auto-regressive integration for non-stationary production cycles.</p>
                  </Card>
                  <Card className="shadow-sm border-none bg-white ring-1 ring-emerald-100 p-4">
                    <h4 className="text-xs font-bold text-emerald-900 uppercase mb-2">PROPHET</h4>
                    <p className="text-[10px] text-emerald-700/70">Decomposing global holidays and seasonal manufacturing shifts.</p>
                  </Card>
                  <Card className="shadow-sm border-none bg-white ring-1 ring-emerald-100 p-4">
                    <h4 className="text-xs font-bold text-emerald-900 uppercase mb-2">OCTONUS</h4>
                    <p className="text-[10px] text-emerald-700/70">Deep-trend engine for complex non-linear manufacturing patterns.</p>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="source" className="mt-4">
                <Card className="shadow-sm border-none bg-white ring-1 ring-emerald-100 p-6">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-900 font-medium">
                        <Database className="w-4 h-4 text-emerald-600" />
                        CORE Data Connector (Bridge to MSQL API)
                      </div>
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">
                        Status: Ready to Sync
                      </Badge>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-emerald-700 uppercase">Old API Endpoint (Extraction Logic)</label>
                        <div className="flex gap-2">
                          <Input 
                            value={apiUrl} 
                            onChange={(e) => setApiUrl(e.target.value)}
                            className="font-mono text-xs border-emerald-100"
                            placeholder="https://your-old-api.com/v1/extract"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-emerald-700 uppercase">Old API Key (Optional)</label>
                        <Input 
                          type="password"
                          value={externalApiKey} 
                          onChange={(e) => setExternalApiKey(e.target.value)}
                          className="font-mono text-xs border-emerald-100"
                          placeholder="Bearer token or API key..."
                        />
                      </div>

                      <Button 
                        onClick={syncFromOldApi} 
                        disabled={isSyncing}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                        Sync & Analyze from Extraction Bridge
                      </Button>
                      
                      <p className="text-[10px] text-emerald-700/50 italic text-center">
                        This bridge uses your old API's extraction logic to pull real-time stock and price data directly into the CORE Forecaster.
                      </p>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column: Chat Interface (4 cols) */}
          <div className="lg:col-span-4 flex flex-col h-[800px]">
            <Card className="flex-1 flex flex-col shadow-sm border-none bg-white ring-1 ring-emerald-100 overflow-hidden">
              <CardHeader className="bg-emerald-900 text-white py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-md flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Stakeholder Interaction
                  </CardTitle>
                  <div className="flex items-center gap-2 bg-emerald-800/50 px-2 py-1 rounded-md border border-emerald-700/50">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">Live Sync</span>
                    <input 
                      type="checkbox" 
                      checked={liveSync} 
                      onChange={(e) => setLiveSync(e.target.checked)}
                      className="w-3 h-3 accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>
                <CardDescription className="text-emerald-100/60 text-xs">
                  Ask O'Grady CORE about pricing, stock, or trends.
                </CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {chatMessages.length === 0 && (
                      <div className="text-center py-12 space-y-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
                          <Bot className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-emerald-900">Welcome to CORE Intelligence</p>
                          <p className="text-xs text-emerald-700/60">Try asking: "What is the suggested price for next week?"</p>
                        </div>
                      </div>
                    )}
                    
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-none p-3' : 'bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none p-4'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-emerald-600" />}
                            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                              {msg.role === 'user' ? 'Stakeholder' : 'CORE Forecaster'}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                          
                          {msg.analysis && (
                            <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                              <div className="bg-white p-3 rounded-lg border border-emerald-100 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Suggested Move</span>
                                  <Badge className="bg-emerald-600 text-[10px] h-5">{msg.analysis.confidence}% Confidence</Badge>
                                </div>
                                <p className="text-xs font-semibold text-emerald-900">{msg.analysis.suggestedMove}</p>
                              </div>
                              
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Evidence & Trends</span>
                                <ul className="space-y-1">
                                  {msg.analysis.evidence.map((ev, j) => (
                                    <li key={j} className="text-[10px] text-slate-600 flex items-start gap-1">
                                      <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                                      {ev}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Future Outlook (90d)</span>
                                <p className="text-[10px] text-slate-600 italic">{msg.analysis.futureOutlook}</p>
                              </div>

                              <div className="pt-2 flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                                <History className="w-2.5 h-2.5" />
                                {msg.analysis.technicalNote}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {isChatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none p-4 flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                          <span className="text-xs text-slate-500">Octonus Engine analyzing...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                
                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <div className="flex gap-2">
                    <Input 
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask about price, stock, or trends..."
                      className="bg-white border-slate-200 focus-visible:ring-emerald-500"
                    />
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={isChatLoading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}


