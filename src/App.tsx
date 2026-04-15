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
  Package
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, subDays } from "date-fns";
import { GoogleGenAI } from "@google/genai";

// Mock data generator for initial state
const generateMockData = (days: number) => {
  const data = [];
  const baseValue = 5000; 
  for (let i = days; i >= 0; i--) {
    const date = subDays(new Date(), i);
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
  const [historicalData, setHistoricalData] = useState(generateMockData(60));
  const [productName, setProductName] = useState("Industrial Grade Steel Coil");
  
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
      let activeData = historicalData;
      let extractionLog = "";

      // 1. SMART ROUTING: Send raw prompt to Old API
      if (liveSync && apiUrl) {
        try {
          const proxyResponse = await fetch("/api/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: apiUrl,
              apiKey: externalApiKey,
              prompt: userInput 
            })
          });

          if (proxyResponse.ok) {
            const bridgeData = await proxyResponse.json();
            const rawData = bridgeData.data || [];
            
            if (rawData.length === 0) {
              extractionLog = "Extraction returned no records. Using dashboard fallback.";
            } else {
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
              extractionLog = `Successfully extracted ${activeData.length} records using prompt-based generation.`;
            }
          } else {
            const errorData = await proxyResponse.json();
            extractionLog = `Extraction failed: ${errorData.error || proxyResponse.statusText}`;
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
        4. ALL CURRENCY REFERENCES MUST BE IN SOUTH AFRICAN RAND (R).

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
          prompt: "Select the last 100 records from v_AI_Forecasting_Feed with TimeKey, ProductName, MonthlyNetQty as Qty, and MonthlyNetRevenue as Revenue"
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
        setHistoricalData(mappedData);
        setChatMessages(prev => [...prev, { 
          role: 'bot', 
          content: `Data synchronization complete. I've loaded ${mappedData.length} historical records for ${productName}. How can I help you analyze this scale today?` 
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
                      
                      {msg.analysis && (
                        <div className="mt-6 pt-6 border-t border-slate-200 space-y-5">
                          <div className="bg-white p-4 rounded-xl border border-emerald-100 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Suggested Move</span>
                              <Badge className="bg-emerald-600 text-[10px] h-5">{msg.analysis.confidence}% Confidence</Badge>
                            </div>
                            <p className="text-sm font-bold text-emerald-900">{msg.analysis.suggestedMove}</p>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Evidence & Trends</span>
                              <ul className="space-y-2">
                                {msg.analysis.evidence.map((ev, j) => (
                                  <li key={j} className="text-[11px] text-slate-600 flex items-start gap-2">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                    {ev}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Future Outlook (90d)</span>
                              <p className="text-[11px] text-slate-600 italic leading-relaxed">{msg.analysis.futureOutlook}</p>
                            </div>
                          </div>

                          <div className="pt-2 flex items-center gap-2 text-[10px] text-slate-400 font-mono border-t border-slate-100">
                            <History className="w-3 h-3" />
                            {msg.analysis.technicalNote}
                          </div>
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


