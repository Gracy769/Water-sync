import React, { useState, useEffect } from 'react';
import { 
  Droplets, 
  Thermometer, 
  Activity, 
  Phone, 
  Mail, 
  User, 
  LogOut, 
  LogIn,
  AlertCircle,
  CheckCircle2,
  Clock,
  Menu,
  LayoutDashboard,
  BrainCircuit,
  PhoneCall,
  ChevronRight,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Cpu,
  Copy,
  Check,
  Code2
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Legend
} from 'recharts';
import { 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  limit, 
  Timestamp 
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from './firebase';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Reading {
  id: string;
  ph: number;
  waterLevel: number;
  motorOn: boolean;
  timestamp: Timestamp;
}

interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email?: string;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis' | 'contacts'>('dashboard');
  const [analysisType, setAnalysisType] = useState<'general' | 'water-level' | 'dry-run' | 'ph-safety' | 'profile'>('general');
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([
    { id: '1', name: 'Municipal Corporation', role: 'Water Supply Dept', phone: '+1-800-WATER-HELP', email: 'support@municipal.gov' },
    { id: '2', name: 'Emergency Services', role: '24/7 Support', phone: '911', email: 'emergency@city.gov' },
    { id: '3', name: 'Maintenance Team', role: 'Technical Support', phone: '+1-555-0199', email: 'tech@aqua-pulse.com' }
  ]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isDemoMode) {
      // Generate initial mock data for demo mode
      const now = Date.now();
      const mockReadings: Reading[] = Array.from({ length: 20 }, (_, i) => ({
        id: `mock-${i}`,
        ph: Number((6.5 + Math.random() * 1.5).toFixed(2)),
        waterLevel: Math.floor(Math.random() * 100),
        motorOn: Math.random() > 0.5,
        timestamp: Timestamp.fromMillis(now - (i * 3600000))
      }));
      setReadings(mockReadings);
      return;
    }

    if (!user) return;

    const q = query(
      collection(db, 'readings'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reading[];
      setReadings(data);
    }, (error) => {
      console.error("Firestore error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setIsDemoMode(false);
  };

  const simulateData = async () => {
    setIsSimulating(true);
    const newData = {
      ph: Number((6.5 + Math.random() * 1.5).toFixed(2)),
      waterLevel: Math.floor(Math.random() * 100),
      motorOn: Math.random() > 0.5,
      apiKey: "demo-key" // This will be ignored by the server if not configured
    };

    if (isDemoMode) {
      // Update local state for demo mode
      const newReading: Reading = {
        id: `mock-${Date.now()}`,
        ...newData,
        timestamp: Timestamp.now()
      };
      setReadings(prev => [newReading, ...prev.slice(0, 49)]);
      setTimeout(() => setIsSimulating(false), 500);
      return;
    }

    try {
      const response = await fetch('/api/sensor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData)
      });
      if (!response.ok) throw new Error("Failed to simulate data");
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setTimeout(() => setIsSimulating(false), 500);
    }
  };

  const getAIAdvice = async (type: typeof analysisType = analysisType) => {
    if (!readings.length) {
      setAiAdvice("No sensor data available to analyze yet. Please ensure your hardware is connected and sending data.");
      return;
    }

    setIsAnalyzing(true);
    setAiAdvice(null); // Clear previous advice to show loading state
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'undefined' || apiKey.includes('TODO')) {
        throw new Error("Gemini API Key is not correctly configured in the environment. Please ensure the platform has provided the key.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const current = readings[0];
      const recentReadings = readings.slice(0, 10);
      
      let prompt = "";
      
      switch(type) {
        case 'water-level':
          prompt = `Analyze the water level data for this AquaPulse system. 
          Current Level: ${current.waterLevel}%
          Recent trend: ${recentReadings.map(r => r.waterLevel).join(', ')}
          Provide insights on consumption patterns, potential leaks, and refill recommendations.`;
          break;
        case 'dry-run':
          prompt = `Analyze the motor operation data for potential dry run risks.
          Current Motor Status: ${current.motorOn ? 'Running' : 'Idle'}
          Current Water Level: ${current.waterLevel}%
          Recent motor states: ${recentReadings.map(r => r.motorOn ? 'ON' : 'OFF').join(', ')}
          Identify if the motor has been running with low water levels (below 10%) and provide safety advice.`;
          break;
        case 'ph-safety':
          prompt = `Analyze the pH level safety.
          Current pH: ${current.ph}
          Recent pH readings: ${recentReadings.map(r => r.ph).join(', ')}
          Identify how long or how often the pH has been in unsafe ranges (below 6.5 or above 8.5). Provide health and maintenance advice.`;
          break;
        case 'profile':
          prompt = `Create a comprehensive Water Profile for this system based on all available data:
          Current pH: ${current.ph}
          Current Level: ${current.waterLevel}%
          Motor Status: ${current.motorOn ? 'Running' : 'Idle'}
          Recent History: ${JSON.stringify(recentReadings)}
          Summarize the overall health of the water system, classify the water quality, and provide a long-term maintenance roadmap.`;
          break;
        default:
          prompt = `As a water management expert, analyze these real-time readings from an AquaPulse monitoring system:
          - Current pH Level: ${current.ph}
          - Current Water Level: ${current.waterLevel}%
          - Motor Status: ${current.motorOn ? 'Running' : 'Idle'}
          
          Provide a concise, professional analysis and specific actionable advice for the user. 
          Focus on water quality safety, system efficiency, and potential maintenance needs. 
          Format the response with clear sections and bullet points.`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      const text = response.text;
      if (text) {
        setAiAdvice(text);
      } else {
        setAiAdvice("The AI was unable to generate a response. Please try again in a moment.");
      }
    } catch (error: any) {
      console.error("AI Analysis failed:", error);
      setAiAdvice(`Analysis failed: ${error.message || "An unexpected error occurred"}. Please try again later.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'analysis' && !aiAdvice && readings.length > 0) {
      getAIAdvice();
    }
  }, [activeTab, analysisType, readings.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Droplets className="w-12 h-12 text-blue-500" />
        </motion.div>
      </div>
    );
  }

  if (!user && !isDemoMode) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-blue-100/50 p-8 text-center border border-blue-50"
        >
          <div className="w-20 h-20 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <Droplets className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">AquaPulse</h1>
          <p className="text-slate-500 mb-8">Intelligent Water Monitoring System</p>
          
          <div className="space-y-4">
            <button
              onClick={handleLogin}
              className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              <LogIn className="w-5 h-5" />
              Sign in with Google
            </button>

            <button
              onClick={() => setIsDemoMode(true)}
              className="w-full py-4 px-6 bg-white border-2 border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 text-slate-600 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              <Activity className="w-5 h-5 text-blue-500" />
              Try Demo Mode
            </button>
          </div>
          
          <p className="mt-8 text-xs text-slate-400 uppercase tracking-widest font-medium">
            Secure Hardware Integration
          </p>
        </motion.div>
      </div>
    );
  }

  const apiUrl = `${window.location.origin}/api/sensor-data`;
  const currentReading = readings[0] || { ph: 7.0, waterLevel: 0, motorOn: false, timestamp: Timestamp.now() };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const graphData = [...readings].reverse().map(r => ({
    time: format(r.timestamp.toDate(), 'HH:mm'),
    ph: r.ph,
    level: r.waterLevel
  }));

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analysis', label: 'Analysis', icon: BrainCircuit },
    { id: 'contacts', label: 'Contacts', icon: PhoneCall },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="fixed left-0 top-0 bottom-0 bg-white border-r border-slate-100 z-50 flex flex-col transition-all duration-300 ease-in-out"
      >
        <div className="p-6 flex items-center gap-3 overflow-hidden whitespace-nowrap border-b border-slate-50">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex-shrink-0 flex items-center justify-center shadow-lg shadow-blue-100">
            <Droplets className="w-6 h-6 text-white" />
          </div>
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xl font-bold tracking-tight"
              >
                AquaPulse
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all group relative overflow-hidden",
                activeTab === item.id 
                  ? "bg-blue-50 text-blue-600" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon className={cn("w-5 h-5 flex-shrink-0", activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.span 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="font-semibold whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {activeTab === item.id && (
                <motion.div 
                  layoutId="active-nav"
                  className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full"
                />
              )}
            </button>
          ))}

          <div className="pt-4 mt-4 border-t border-slate-50">
            <button
              onClick={simulateData}
              disabled={isSimulating}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all group",
                "text-slate-500 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
              )}
            >
              <RefreshCw className={cn("w-5 h-5 flex-shrink-0", isSimulating && "animate-spin text-blue-600")} />
              {isSidebarOpen && <span className="font-semibold whitespace-nowrap">Simulate Data</span>}
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-50">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center justify-center p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className={cn(
        "flex-1 transition-all duration-300 min-h-screen flex flex-col",
        isSidebarOpen ? "ml-[280px]" : "ml-[80px]"
      )}>
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold capitalize">{activeTab}</h2>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold">{user.displayName}</span>
              <span className="text-xs text-slate-400">{user.email}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="p-8 max-w-7xl mx-auto w-full flex-1">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Header Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard 
                    title="Current pH" 
                    value={currentReading.ph.toFixed(1)} 
                    unit="pH"
                    icon={<Activity className="w-6 h-6 text-emerald-500" />}
                    status={currentReading.ph >= 6.5 && currentReading.ph <= 8.5 ? 'Good' : 'Alert'}
                    color="emerald"
                  />
                  <StatCard 
                    title="Water Level" 
                    value={currentReading.waterLevel} 
                    unit="%"
                    icon={<Droplets className="w-6 h-6 text-blue-500" />}
                    status={currentReading.waterLevel > 20 ? 'Normal' : 'Low'}
                    color="blue"
                  />
                  <StatCard 
                    title="Motor Status" 
                    value={currentReading.motorOn ? 'Running' : 'Idle'} 
                    unit=""
                    icon={<Clock className="w-6 h-6 text-amber-500" />}
                    status={currentReading.motorOn ? 'Active' : 'Standby'}
                    color="amber"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    {/* pH Trend Graph */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center mb-8">
                        <div>
                          <h2 className="text-xl font-bold">pH Level Trend</h2>
                          <p className="text-sm text-slate-400">Consolidated historical data</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <div className="w-3 h-3 rounded-full bg-emerald-500" />
                          Live Feed
                        </div>
                      </div>
                      
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={graphData}>
                            <defs>
                              <linearGradient id="colorPh" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="time" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 12 }}
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 12 }}
                              domain={[0, 14]}
                            />
                            <Tooltip 
                              content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-50">
                                      <p className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">{label}</p>
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <p className="text-sm font-black text-slate-900">
                                          {payload[0].value} <span className="text-slate-400 font-bold">pH</span>
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="ph" 
                              stroke="#10b981" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorPh)" 
                              activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Tank Visualization */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h2 className="text-xl font-bold mb-6">Tank Visualization</h2>
                      <div className="flex flex-col md:flex-row items-center gap-12">
                        <div className="relative w-48 h-64 bg-slate-100 rounded-3xl overflow-hidden border-4 border-slate-200">
                          <motion.div 
                            className="absolute bottom-0 left-0 right-0 bg-blue-500/80 backdrop-blur-sm"
                            initial={{ height: 0 }}
                            animate={{ height: `${currentReading.waterLevel}%` }}
                            transition={{ type: "spring", stiffness: 50 }}
                          >
                            <div className="absolute top-0 left-0 right-0 h-4 bg-blue-400/50 animate-pulse" />
                          </motion.div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-4xl font-black text-slate-900 mix-blend-overlay">
                              {currentReading.waterLevel}%
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex-1 space-y-6">
                          <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                            <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                              <AlertCircle className="w-5 h-5" />
                              System Status
                            </h3>
                            <p className="text-blue-800 text-sm leading-relaxed">
                              {currentReading.waterLevel < 20 
                                ? "Critical low level detected. Automated motor start sequence initiated." 
                                : "Water levels are within optimal operating range. System monitoring active."}
                            </p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl">
                              <span className="text-xs text-slate-400 uppercase font-bold">Last Update</span>
                              <p className="font-semibold">{format(currentReading.timestamp.toDate(), 'HH:mm:ss')}</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl">
                              <span className="text-xs text-slate-400 uppercase font-bold">Sensor Health</span>
                              <p className="font-semibold text-emerald-500">Excellent</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {/* Hardware Link Info */}
                    <div className="bg-slate-900 p-8 rounded-3xl text-white">
                      <h2 className="text-xl font-bold mb-4">Hardware Link</h2>
                      <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                        Connect your ESP32/Arduino to our secure endpoint.
                      </p>
                      <div className="space-y-4">
                        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block mb-1">Endpoint</span>
                          <code className="text-xs break-all text-blue-400">/api/sensor-data</code>
                        </div>
                        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block mb-1">Payload Format</span>
                          <pre className="text-[10px] text-emerald-400">
{`{
  "ph": 7.2,
  "waterLevel": 85,
  "motorOn": true,
  "apiKey": "Shoura_Water_Secure_2026"
}`}
                          </pre>
                        </div>
                        <a 
                          href="/dashboard.html" 
                          target="_blank"
                          className="flex items-center justify-center gap-2 w-full p-4 bg-white/10 hover:bg-white/20 rounded-xl border border-white/10 transition-all text-xs font-bold uppercase tracking-widest"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open Static Dashboard
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'analysis' && (
              <motion.div 
                key="analysis"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                        <Activity className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">System Analysis Graph</h2>
                        <p className="text-slate-400">Real-time performance metrics and trends</p>
                      </div>
                    </div>
                  </div>

                  <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={graphData}>
                        <defs>
                          <linearGradient id="colorPh" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="time" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                          dy={10}
                        />
                        <YAxis 
                          yAxisId="left"
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                          domain={[0, 14]}
                          label={{ value: 'pH Level', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                        />
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                          domain={[0, 100]}
                          label={{ value: 'Water Level (%)', angle: 90, position: 'insideRight', fill: '#94a3b8', fontSize: 12 }}
                        />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-50">
                                  <p className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">{label}</p>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                      <p className="text-sm font-black text-slate-900">
                                        {payload[0].value} <span className="text-slate-400 font-bold">pH</span>
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                                      <p className="text-sm font-black text-slate-900">
                                        {payload[1].value}% <span className="text-slate-400 font-bold">Level</span>
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend verticalAlign="top" height={36}/>
                        <Area 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="ph" 
                          name="pH Level"
                          stroke="#10b981" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorPh)" 
                        />
                        <Area 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="level" 
                          name="Water Level"
                          stroke="#3b82f6" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorLevel)" 
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Legend/Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                    <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      pH Monitoring
                    </h3>
                    <p className="text-emerald-800 text-sm">
                      Tracking acidity and alkalinity levels. Ideal range is between 6.5 and 8.5 for safe water consumption.
                    </p>
                  </div>
                  <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                    <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                      <Droplets className="w-5 h-5" />
                      Level Tracking
                    </h3>
                    <p className="text-blue-800 text-sm">
                      Monitoring storage tank capacity. Automated alerts trigger when levels fall below 20% to prevent dry runs.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'contacts' && (
              <motion.div 
                key="contacts"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
                      <PhoneCall className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Important Contacts</h2>
                      <p className="text-slate-400">Quick access to essential services</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="p-6 rounded-3xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition-all group">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">{contact.name}</h3>
                            <p className="text-sm text-slate-400 font-medium">{contact.role}</p>
                          </div>
                          <div className="p-2 bg-white rounded-xl shadow-sm">
                            <Phone className="w-5 h-5 text-blue-500" />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <a href={`tel:${contact.phone}`} className="flex items-center gap-3 p-3 bg-white rounded-xl text-slate-600 hover:text-blue-600 hover:shadow-md transition-all">
                            <Phone className="w-4 h-4" />
                            <span className="font-semibold">{contact.phone}</span>
                          </a>
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="flex items-center gap-3 p-3 bg-white rounded-xl text-slate-600 hover:text-blue-600 hover:shadow-md transition-all">
                              <Mail className="w-4 h-4" />
                              <span className="font-medium truncate">{contact.email}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 p-8 rounded-3xl border border-amber-100 flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-amber-900 mb-1">Emergency Protocol</h3>
                    <p className="text-amber-800 text-sm leading-relaxed">
                      In case of a major leak or electrical failure at the pump station, immediately cut the main power supply and contact the Maintenance Team.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        <footer className="p-8 text-center text-slate-400 text-sm border-t border-slate-50">
          &copy; 2026 AquaPulse Monitoring Systems. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

function StatCard({ title, value, unit, icon, status, color }: { 
  title: string, 
  value: string | number, 
  unit: string, 
  icon: React.ReactNode, 
  status: string,
  color: 'emerald' | 'blue' | 'amber'
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100'
  };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-50 rounded-2xl">
          {icon}
        </div>
        <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border", colors[color])}>
          {status}
        </span>
      </div>
      <div>
        <h3 className="text-slate-400 text-sm font-medium mb-1">{title}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black text-slate-900">{value}</span>
          <span className="text-slate-400 font-bold text-sm">{unit}</span>
        </div>
      </div>
    </motion.div>
  );
}
