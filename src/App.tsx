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
  
  // Hard defaults for local configuration
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
      alert("Please provide your Gemini API Key in the Source Settings first.");
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

      // 1. Send purely to our local server.ts which handles generating the SQL and fetching localhost:8000
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
        // Extract array out of {"status": "success", "data": [...]} if it exists
        const rawData = bridgeData.data || bridgeData; 
        
        if (!rawData || (Array.isArray(rawData) && rawData.length === 0) || Object.keys(rawData).length === 0) {
          extractionLog = "Extraction returned no records from the database.";
        } else {
          backendForecasts = rawData;
          extractionLog = `Successfully retrieved explicitly computed forecast data directly from the Statistical Engine.`;
        }
      } else {
        const errorData = await proxyResponse.json();
        throw new Error(`Data Extraction failed: ${errorData.error} | ${errorData.details}`);
      }

      // 2. EXPLANATORY AI LAYER: Format the Arrays onto the screen
      const analysisPrompt = `
        You are the O'Grady CORE Chief Analyst.

        The stakeholder asked: "${userMsg.content}"
        System Log: ${extractionLog}

        CRITICAL ARCHITECTURAL NOTE:
        The Python backend (main.py -> forecasting_engine.py) has already executed the rigorous mathematical models (ARIMA, Facebook Prophet, Holt-Winters) and returned the fully computed forecast payload below.
        YOU MUST NOT HALLUCINATE OR GUESS THE NUMBERS. You must ONLY interpret and format the exact mathematical projections provided by the backend.

        Python Backend Computed Forecast Payload:
        ${JSON.stringify(backendForecasts).substring(0, 10000)}

        Tasks:
        1. Read the provided forecast payload from the backend. 
        2. Format the backend's numbers into a clear, product-by-product breakdown. Quote the exact forecasted numbers provided in the payload for Prophet and HW formats.
        3. Explain to the user what the backend models detected.
        4. Give a highly specific strategic recommendation per product based on the projections.
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
        content: result.executiveSummary || "Here is the comprehensive product-level forecast breakdown (Models Applied):",
        productAnalyses: result.productAnalyses || []
      };
      setChatMessages(prev => [...prev, botMsg]);

    } catch (error) {
      console.error("Forecaster App Error:", error);
      setChatMessages(prev => [...prev, { role: 'bot', content: `Architecture failure: ${error instanceof Error ? error.message : "System Exception"}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F0] text-[#1A2F1A] font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-emerald-900">
              <Factory className="w-8 h-8 text-emerald-600" />
              O'Grady CORE Forecaster
            </h1>
            <p className="text-emerald-700/70">Enterprise Manufacturing Intelligence • ARIMA • Prophet</p>
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

        {showSettings && (
          <Card className="shadow-sm border-none bg-white ring-1 ring-emerald-100 p-6 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-900 font-medium">
                  <Database className="w-4 h-4 text-emerald-600" />
                  CORE Data Connector
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-emerald-700 uppercase">Old API Endpoint (main.py Location)</label>
                  <Input 
                    value={apiUrl} 
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="font-mono text-xs border-emerald-100 bg-slate-50"
                    placeholder="http://localhost:8000"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-emerald-700 uppercase">Gemini API Key</label>
                  <Input 
                    type="password"
                    value={geminiApiKey} 
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="font-mono text-xs border-emerald-100 bg-slate-50"
                    placeholder="AIzaSy..."
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-900 font-medium">
                  <Package className="w-4 h-4 text-emerald-600" />
                  System Details
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    Routing prompts locally utilizing <strong>gemini-3.1-pro-preview</strong>. 
                    Raw SQL injection directly over <strong>HTTP Loopback</strong> for infinite timeout tolerance.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="flex flex-col h-[700px] shadow-sm border-none bg-white ring-1 ring-emerald-100 overflow-hidden">
          <CardHeader className="bg-emerald-900 text-white py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-md flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Localhost Analytics Engine
              </CardTitle>
              <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-700/50">
                PROPHET ARCHITECTURE
              </Badge>
            </div>
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
                      <p className="text-lg font-semibold text-emerald-900">Welcome to Local Forecasting</p>
                      <p className="text-sm text-emerald-700/60 max-w-sm mx-auto">
                        Your serverless limits are eliminated. Input a query to compile math safely in the local stats instance.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 pt-4">
                      <Button variant="outline" size="sm" onClick={() => { setUserInput("Forecast the Top 10 products for the next 3 weeks."); }} className="text-xs border-emerald-100">"Forecast Top 10 products..."</Button>
                    </div>
                  </div>
                )}
                
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] md:max-w-[80%] space-y-3 ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-none p-4 shadow-sm' : 'bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none p-5 shadow-sm'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-emerald-600" />}
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                          {msg.role === 'user' ? 'Stakeholder' : 'Statistical Model'}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      
                      {msg.productAnalyses && msg.productAnalyses.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-slate-200 space-y-5">
                          {msg.productAnalyses.map((prod, j) => (
                            <div key={j} className="bg-white p-5 rounded-xl border border-emerald-100 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <span className="text-sm font-bold text-emerald-900 uppercase tracking-wide">{prod.productName}</span>
                                <Badge className="bg-emerald-100 text-emerald-700 border-none px-2 rounded-md font-mono text-[9px]">
                                  Math Computed
                                </Badge>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Model Projections</span>
                                <p className="text-xs font-mono text-emerald-800 bg-emerald-50 rounded-md p-2.5 border border-emerald-100">
                                  {prod.projectedValues}
                                </p>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Reasoning</span>
                                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-md">
                                  {prod.forecastExplanation}
                                </p>
                              </div>
                              <div className="space-y-1.5 pt-2">
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest shrink-0">Strategic Action</span>
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
                        <span className="text-xs font-semibold text-slate-700 block">System Orchestrating Pipeline...</span>
                        <span className="text-[10px] text-slate-500 block">1. Generating SQL Locally via Gemini.<br/>2. Feeding into 'main.py' via HTTP Loopback.<br/>3. Processing models across unlimited CPU threads.</span>
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
                  placeholder="Forecast Value Coat and Ultra Gloss..."
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}