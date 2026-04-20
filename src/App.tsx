/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  RefreshCw,
  Database,
  Factory,
  MessageSquare,
  Send,
  User,
  Bot,
  ShieldCheck,
  History,
  Settings2,
  ChevronDown,
  ChevronUp,
  Package,
  TrendingUp
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, subDays } from "date-fns";
import { GoogleGenAI } from "@google/genai";

interface ProductAnalysis {
  productName: string;
  forecastExplanation: string;
  strategicRecommendation: string;
  projectedValues: string;
}

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  productAnalyses?: ProductAnalysis[];
}

export default function App() {
  const [productName, setProductName] = useState("Internal Operations");
  
  // Persist API settings in localStorage
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('og_bridge_url') || "https://ogrady-core.vercel.app");
  const [externalApiKey, setExternalApiKey] = useState(() => localStorage.getItem('og_bridge_key') || "");
  const [showSettings, setShowSettings] = useState(false);
  
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

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: userInput };
    setChatMessages(prev => [...prev, userMsg]);
    setUserInput("");
    setIsChatLoading(true);

    try {
      let extractionLog = "";
      let backendForecasts: any = null;

      // 1. SMART ROUTING: Send raw prompt to Old API -> main.py
      if (liveSync && apiUrl) {
        try {
          const proxyResponse = await fetch("/api/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: apiUrl,
              apiKey: externalApiKey,
              prompt: `[API_2_FORECAST_REQUEST] ${userInput}`,
              // MARKER FOR MAIN.PY: Tells the python backend this requires forecasting
              source: "API_2",
              needs_forecasting: true
            })
          });

          if (proxyResponse.ok) {
            const bridgeData = await proxyResponse.json();
            // main.py already cooked the data with Prophet/ARIMA/Holt-Winters
            const rawData = bridgeData.data || bridgeData; 
            
            if (!rawData || (Array.isArray(rawData) && rawData.length === 0) || Object.keys(rawData).length === 0) {
              extractionLog = "Extraction returned no records from the database.";
            } else {
              backendForecasts = rawData;
              extractionLog = `Successfully retrieved computed forecast data directly from the Python backend (main.py).`;
            }
          } else {
            const errorData = await proxyResponse.json();
            extractionLog = `External Extraction failed: ${errorData.error || proxyResponse.statusText}`;
          }
        } catch (syncError) {
          console.error("Extraction Sync failed:", syncError);
          extractionLog = "Connection to Core API failed via proxy.";
        }
      }

      // 2. EXPLANATORY AI LAYER: Analyzing the Backend's Math
      const analysisPrompt = `
        You are the O'Grady CORE Chief Analyst (South African division).

        The stakeholder asked: "${userInput}"
        System Log: ${extractionLog}

        CRITICAL ARCHITECTURAL NOTE:
        The Python backend (main.py) has already executed the rigorous mathematical models (ARIMA, Facebook Prophet, Holt-Winters) and returned the fully computed forecast payload below.
        YOU MUST NOT HALLUCINATE OR GUESS THE NUMBERS. You must ONLY interpret and format the exact mathematical projections provided by the backend.

        Python Backend Computed Forecast Payload:
        ${JSON.stringify(backendForecasts).substring(0, 10000)}

        Tasks:
        1. Read the provided forecast payload from the backend. 
        2. Format the backend's numbers into a clear, product-by-product breakdown. Quote the exact forecasted numbers provided in the payload.
        3. Explain to the user what the backend models detected based on the numbers (e.g., seasonality, trends, expected growth/drop).
        4. Give a highly specific strategic recommendation per product based on the backend's projections.
        5. ALL CURRENCY REFERENCES MUST BE IN ZAR (R).

        Return in STRICT JSON:
        {
          "executiveSummary": "Overall robust answer to the stakeholder based on the backend data.",
          "productAnalyses": [
            {
              "productName": "...",
              "forecastExplanation": "Specifically what the Prophet/ARIMA models indicate based on the payload...",
              "strategicRecommendation": "Specific transactional/pricing move",
              "projectedValues": "Quote the explicit arrays/numbers from the backend forecast payload."
            }
          ]
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
        content: result.executiveSummary || "Here is the comprehensive product-level forecast breakdown:",
        productAnalyses: result.productAnalyses || []
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
      alert("Please provide the Old API Endpoint in the Source settings first.");
      setShowSettings(true);
      return;
    }
    setIsSyncing(true);
    try {
      const proxyResponse = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: apiUrl,
          apiKey: externalApiKey,
          prompt: "Select the last 100 records from v_AI_Forecasting_Feed with TimeKey, ProductName, MonthlyNetQty as Qty, and MonthlyNetRevenue as Revenue",
          source: "API_2",
          needs_forecasting: true
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
        setChatMessages(prev => [...prev, { 
          role: 'bot', 
          content: `Data synchronization complete. I've analyzed ${mappedData.length} records. How can I assist you with the CORE Intelligence analysis?` 
        }]);
      }
    } catch (error) {
      console.error("Sync failed:", error);
      alert(`Sync failed: ${error instanceof Error ? error.message : "An unexpected error occurred during synchronization."}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F0] text-[#1A2F1A] font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-emerald-900">
              <Factory className="w-8 h-8 text-emerald-600" />
              O'Grady CORE Forecaster
            </h1>
            <p className="text-emerald-700/70">Enterprise Manufacturing Intelligence • ARIMA • Prophet • Octonus</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline"
              onClick={() => setShowSettings(!showSettings)}
              className="bg-white border-emerald-100 text-emerald-700 hover:bg-emerald-50"
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Source Settings
              {showSettings ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </Button>
            <Button 
              onClick={syncFromOldApi} 
              disabled={isSyncing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md border-none"
            >
              {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sync Data
            </Button>
          </div>
        </header>

        {/* Settings Panel */}
        {showSettings && (
          <Card className="shadow-sm border-none bg-white ring-1 ring-emerald-100 p-6 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-900 font-medium">
                  <Database className="w-4 h-4 text-emerald-600" />
                  CORE Data Connector
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-emerald-700 uppercase">Old API Endpoint</label>
                  <Input 
                    value={apiUrl} 
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="font-mono text-xs border-emerald-100"
                    placeholder="https://ogrady-core.vercel.app"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-emerald-700 uppercase">Old API Key</label>
                  <Input 
                    type="password"
                    value={externalApiKey} 
                    onChange={(e) => setExternalApiKey(e.target.value)}
                    className="font-mono text-xs border-emerald-100"
                    placeholder="Bearer token..."
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-900 font-medium">
                  <Package className="w-4 h-4 text-emerald-600" />
                  Product Context
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-emerald-700 uppercase">Active Unit/Product</label>
                  <Input 
                    value={productName} 
                    onChange={(e) => setProductName(e.target.value)}
                    className="border-emerald-100 text-emerald-900 font-medium"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <div className="flex items-center gap-2 bg-emerald-50 px-3 py-2 rounded-md border border-emerald-100 w-full justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Live Sync Mode</span>
                    <input 
                      type="checkbox" 
                      checked={liveSync} 
                      onChange={(e) => setLiveSync(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Chat Interface */}
        <Card className="flex flex-col h-[700px] shadow-sm border-none bg-white ring-1 ring-emerald-100 overflow-hidden">
          <CardHeader className="bg-emerald-900 text-white py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-md flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Stakeholder Intelligence Interface
              </CardTitle>
              <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-700/50">
                ZAR (R) Mode Active
              </Badge>
            </div>
            <CardDescription className="text-emerald-100/60 text-xs">
              Ask about pricing, stock, or trends. All analysis is in South African Rand.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
            <ScrollArea className="flex-1 p-4 md:p-6">
              <div className="space-y-6">
                {chatMessages.length === 0 && (
                  <div className="text-center py-12 space-y-4">
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
                      <Bot className="w-8 h-8 text-emerald-600" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-semibold text-emerald-900">Welcome to CORE Intelligence</p>
                      <p className="text-sm text-emerald-700/60 max-w-sm mx-auto">
                        I'm your manufacturing forecasting assistant. Sync your data to begin deep-trend analysis in Rands.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 pt-4">
                      <Button variant="outline" size="sm" onClick={() => { setUserInput("What are the sales trends for FY2025?"); }} className="text-xs border-emerald-100">"Sales trends for FY2025?"</Button>
                      <Button variant="outline" size="sm" onClick={() => { setUserInput("Suggest a stock level for next month."); }} className="text-xs border-emerald-100">"Stock level for next month?"</Button>
                    </div>
                  </div>
                )}
                
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] md:max-w-[80%] space-y-3 ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-none p-4 shadow-sm' : 'bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none p-5 shadow-sm'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-emerald-600" />}
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                          {msg.role === 'user' ? 'Stakeholder' : 'CORE Forecaster'}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      
                      {msg.productAnalyses && msg.productAnalyses.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-slate-200 space-y-5">
                          {msg.productAnalyses.map((prod, j) => (
                            <div key={j} className="bg-white p-5 rounded-xl border border-emerald-100 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <span className="text-sm font-bold text-emerald-900 uppercase tracking-wide">{prod.productName}</span>
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none px-2 rounded-md font-mono text-[9px] shadow-sm">
                                  Backend Compiled
                                </Badge>
                              </div>
                              
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Math Projection</span>
                                <p className="text-xs font-mono text-emerald-800 bg-emerald-50 rounded-md p-2.5 border border-emerald-100">
                                  {prod.projectedValues}
                                </p>
                              </div>

                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Model Reasoning</span>
                                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-md">
                                  {prod.forecastExplanation}
                                </p>
                              </div>

                              <div className="space-y-1.5 pt-2">
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest shrink-0">Strategic Move</span>
                                <p className="text-sm font-semibold text-emerald-950 flex items-start gap-2">
                                  <TrendingUp className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                  {prod.strategicRecommendation}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none p-5 flex items-center gap-3 shadow-sm">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-700 block">Octonus Engine Analyzing...</span>
                        <span className="text-[10px] text-slate-500 block">Processing multi-model ensemble in ZAR</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-100">
              <div className="flex gap-3">
                <Input 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask about price, stock, or trends (e.g., 'What are the sales for FY2025?')..."
                  className="bg-white border-slate-200 h-12 px-4 focus-visible:ring-emerald-500 shadow-sm"
                />
                <Button 
                  onClick={handleSendMessage} 
                  disabled={isChatLoading}
                  className="bg-emerald-900 hover:bg-emerald-800 text-white h-12 px-6 shadow-md shrink-0"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
              <p className="text-[9px] text-slate-400 mt-3 text-center uppercase tracking-widest font-medium">
                O'Grady CORE Intelligence • South African Rand (ZAR)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


