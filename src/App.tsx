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
  TrendingUp,
  Activity,
  ShieldAlert,
  BarChart as BarChartIcon
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format, subDays } from "date-fns";
import { GoogleGenAI } from "@google/genai";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

interface ChartDataPoint {
  period: string;
  prophet: number;
  holtWinters: number;
}

interface ProductAnalysis {
  productName: string;
  confidenceLevel: string;
  forecastExplanation: string;
  strategicRecommendation: string;
  riskStrategy: string;
  chartType: "line" | "bar" | "area";
  chartData: ChartDataPoint[];
}

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  marketTrends?: string;
  productAnalyses?: ProductAnalysis[];
}

export default function App() {
  const [productName, setProductName] = useState("Internal Operations");
  
  // Persist API settings in localStorage
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('og_bridge_url') || "http://localhost:8000");
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('og_gemini_key') || "");
  const [showSettings, setShowSettings] = useState(false);
  
  useEffect(() => {
    localStorage.setItem('og_bridge_url', apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    localStorage.setItem('og_gemini_key', geminiApiKey);
  }, [geminiApiKey]);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;
    if (!geminiApiKey) {
      alert("Please provide a Gemini API Key in Source Settings first.");
      setShowSettings(true);
      return;
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const userMsg: ChatMessage = { role: 'user', content: userInput };
    setChatMessages(prev => [...prev, userMsg]);
    setUserInput("");
    setIsChatLoading(true);

    try {
      let extractionLog = "";
      let backendForecasts: any = null;

      // 1. SMART ROUTING: Send raw prompt to Node Proxy -> main.py
      try {
        const proxyResponse = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
           endpoint: apiUrl,
           geminiApiKey: geminiApiKey,
           prompt: userInput
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

      // 2. EXPLANATORY AI LAYER: Analyzing the Backend's Math
      const analysisPrompt = `
        You are a Tier-1 Executive Data Scientist & Supply Chain Strategist for O'Grady CORE (South African division).
        You will utilize your deep understanding of Market Dynamics and Statistical Modeling.

        The stakeholder asked: "${userInput}"
        System Log: ${extractionLog}

        CRITICAL ARCHITECTURE:
        The Python backend has executed Facebook Prophet and Holt-Winters statistical arrays.
        Here is the JSON payload carrying those exact projected numerical arrays:
        ${JSON.stringify(backendForecasts).substring(0, 10000)}

        YOUR MANDATE:
        You must parse the raw numbers and output a strict, highly professional executive JSON response. 
        DO NOT GUESS NUMBERS. Extract the Prophet and Holt-Winters forecasts directly from the arrays and map them into the "chartData" chronological sequence.

        RULES FOR YOUR ANALYSIS:
        1. "marketTrends": Provide a high-level view of what macro or industry trends could be driving these numbers.
        2. "confidenceLevel": Calculate theoretical confidence. If Prophet and HoltWinters trends are similar, assign "High Confidence (85%+)". If they diverge, assign "Medium" or "Low".
        3. "forecastExplanation": Summarize the trajectory simply. (e.g., "Expected 12% growth over 3 periods due to seasonality.")
        4. "riskStrategy": Outline the distinct supply-chain/inventory risk. (e.g., "If Prophet overestimates, we risk holding dead stock.")
        5. "chartData": You must map the arrays from the backend into a clean array of points. Usually period 1, period 2, etc. Give them the value. Do this dynamically based on the numbers presented.

        Output STRICT JSON formatted EXACTLY to this schema. Do not include markdown codeblocks, JUST THE RAW PARSABLE JSON STRING:
        {
          "executiveSummary": "Overarching 2-sentence executive summary.",
          "marketTrends": "Broad insight on market dynamics...",
          "productAnalyses": [
            {
              "productName": "Product Name Here",
              "confidenceLevel": "High (89%) - Models Converge",
              "forecastExplanation": "...",
              "strategicRecommendation": "Specific transactional/pricing move",
              "riskStrategy": "Supply chain/Inventory risk mitigation...",
              "chartType": "line", 
              "chartData": [
                {"period": "Period 1", "prophet": 125, "holtWinters": 123},
                {"period": "Period 2", "prophet": 130, "holtWinters": 125}
              ]
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
                    placeholder="http://localhost:8000"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-emerald-700 uppercase">Gemini API Key</label>
                  <Input 
                    type="password"
                    value={geminiApiKey} 
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="font-mono text-xs border-emerald-100"
                    placeholder="AIzaSy..."
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
              </div>
            </div>
          </Card>
        )}

        {/* Chat Interface */}
        <Card className="flex flex-col min-h-[700px] shadow-sm border-none bg-white ring-1 ring-emerald-100 mb-20 overflow-hidden">
          <CardHeader className="bg-emerald-900 text-white py-4 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-md flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Stakeholder Intelligence Interface
              </CardTitle>
              <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-700/50">
                PROPHET ARCHITECTURE
              </Badge>
            </div>
            <CardDescription className="text-emerald-100/60 text-xs">
              Ask about pricing, stock, or trends. All analysis is in South African Rand.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="flex-1 p-0 flex flex-col">
            <div className="flex-1 p-4 md:p-8">
              <div className="space-y-8">
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
                      
                      {msg.marketTrends && (
                        <div className="mt-4 bg-emerald-50 text-emerald-900 border border-emerald-100 rounded-lg p-3 text-xs leading-relaxed">
                          <strong className="block uppercase tracking-widest text-[9px] text-emerald-600 mb-1">Macro Market Trends</strong>
                          {msg.marketTrends}
                        </div>
                      )}

                      {msg.productAnalyses && msg.productAnalyses.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-slate-200 space-y-8">
                          {msg.productAnalyses.map((prod, j) => (
                            <div key={j} className="bg-white p-5 rounded-xl border border-emerald-100 shadow-[0_4px_15px_-3px_rgba(16,185,129,0.1)] space-y-5">
                              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
                                <span className="text-sm font-bold text-emerald-900 uppercase tracking-wide">{prod.productName}</span>
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-none px-2 rounded-md font-mono text-[10px] shadow-sm flex items-center gap-1">
                                    <Activity className="w-3 h-3" />
                                    {prod.confidenceLevel}
                                  </Badge>
                                </div>
                              </div>
                              
                              {/* DYNAMIC CHART RENDERER */}
                              {prod.chartData && prod.chartData.length > 0 && (
                                <div className="h-[200px] w-full pt-4">
                                  <ResponsiveContainer width="100%" height="100%">
                                    {prod.chartType === 'line' ? (
                                      <LineChart data={prod.chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="period" tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} />
                                        <YAxis tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px'}} />
                                        <Legend wrapperStyle={{fontSize: '10px'}} />
                                        <Line type="monotone" dataKey="prophet" name="FB Prophet" stroke="#10b981" strokeWidth={2} dot={{r: 3}} activeDot={{r: 5}} />
                                        <Line type="monotone" dataKey="holtWinters" name="Holt-Winters" stroke="#3b82f6" strokeWidth={2} dot={{r: 3}} />
                                      </LineChart>
                                    ) : (
                                      <BarChart data={prod.chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="period" tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} />
                                        <YAxis tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px'}} />
                                        <Legend wrapperStyle={{fontSize: '10px'}} />
                                        <Bar dataKey="prophet" name="FB Prophet" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="holtWinters" name="Holt-Winters" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                      </BarChart>
                                    )}
                                  </ResponsiveContainer>
                                </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                    <BarChartIcon className="w-3 h-3" /> Model Consensus
                                  </span>
                                  <p className="text-xs text-slate-700 leading-relaxed">
                                    {prod.forecastExplanation}
                                  </p>
                                </div>

                                <div className="space-y-1.5 bg-amber-50/50 p-3 rounded-lg border border-amber-100/50">
                                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1">
                                    <ShieldAlert className="w-3 h-3" /> Risk Strategy
                                  </span>
                                  <p className="text-xs text-amber-900 leading-relaxed">
                                    {prod.riskStrategy}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-50">
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest shrink-0 block mb-1">Strategic Move</span>
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
                        <span className="text-xs font-semibold text-slate-700 block">Waiting for data to be retrieved & processed by Backend Forecaster...</span>
                        <span className="text-[10px] text-slate-500 block">Running ARIMA, Facebook Prophet & Holt-Winters (Objective Truth)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-100 mt-auto">
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


