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
  Code2,
  History,
  Calendar,
  MessageSquare,
  Send,
  Signal,
  Camera,
  Upload
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
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  limit, 
  Timestamp,
  where,
  getDocs
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from './firebase';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { Toaster, toast } from 'sonner';

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

interface SMSMessage {
  id: string;
  recipient: string;
  content: string;
  status: 'sent' | 'failed' | 'pending';
  timestamp: Date;
  type: 'alert' | 'status' | 'command';
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis' | 'history' | 'sms' | 'biosync' | 'assistant' | 'leak-detect'>('dashboard');
  const [analysisType, setAnalysisType] = useState<'general' | 'water-level' | 'dry-run' | 'ph-safety' | 'profile'>('general');
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [historyStartDate, setHistoryStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [historyEndDate, setHistoryEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [historyReadings, setHistoryReadings] = useState<Reading[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [isRestartingSMS, setIsRestartingSMS] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([
    { id: '1', name: 'Municipal Corporation', role: 'Water Supply Dept', phone: '+1-800-WATER-HELP', email: 'support@municipal.gov' },
    { id: '2', name: 'Emergency Services', role: '24/7 Support', phone: '911', email: 'emergency@city.gov' },
    { id: '3', name: 'Maintenance Team', role: 'Technical Support', phone: '+1-555-0199', email: 'tech@aqua-pulse.com' }
  ]);

  const [messages, setMessages] = useState<SMSMessage[]>([
    { id: '1', recipient: '+1-800-WATER-HELP', content: 'ALERT: Water level critical (15%). Motor starting.', status: 'sent', timestamp: subDays(new Date(), 1), type: 'alert' },
    { id: '2', recipient: '+1-555-0199', content: 'STATUS: System healthy. pH: 7.2, Level: 85%.', status: 'sent', timestamp: subDays(new Date(), 2), type: 'status' },
    { id: '3', recipient: '911', content: 'EMERGENCY: Potential leak detected at main valve.', status: 'failed', timestamp: subDays(new Date(), 3), type: 'alert' },
    { id: '4', recipient: '+1-555-0199', content: 'COMMAND: Motor override requested.', status: 'sent', timestamp: subDays(new Date(), 4), type: 'command' },
    { id: '5', recipient: '+1-800-WATER-HELP', content: 'STATUS: Daily report generated.', status: 'sent', timestamp: new Date(), type: 'status' },
  ]);

  // Bio-Sync State
  const [bioSyncData, setBioSyncData] = useState({
    weight: '80',
    temp: '32',
    humidity: '70',
    activity: 'Normal',
    currentIntake: '500'
  });
  const [bioSyncResult, setBioSyncResult] = useState<any>(null);
  const [isBioSyncLoading, setIsBioSyncLoading] = useState(false);

  // Assistant State
  const [assistantMessages, setAssistantMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);

  // Leak Detection State
  const [leakImage, setLeakImage] = useState<string | null>(null);
  const [leakAnalysis, setLeakAnalysis] = useState<any>(null);
  const [isLeakAnalyzing, setIsLeakAnalyzing] = useState(false);

  const handleBioSync = async () => {
    setIsBioSyncLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Context:
Weight: ${bioSyncData.weight}kg
Local Weather: ${bioSyncData.temp}°C, ${bioSyncData.humidity}% humidity
Activity: ${bioSyncData.activity}
Current Intake: ${bioSyncData.currentIntake}ml

Task: Calculate the remaining water intake needed for today. Adjust the baseline for sweat loss due to the high humidity and exercise intensity.`,
        config: {
          systemInstruction: "You are the AquaPulse Bio-Sync Engine. Your goal is to calculate a precise daily hydration target and provide a personalized strategy. Analyze the user's local weather (temperature/humidity), their physical metrics (weight/age), and their activity intensity to provide a dynamic goal.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              remaining_intake_ml: {
                type: Type.NUMBER,
                description: "The remaining water intake needed for today in milliliters."
              },
              hydration_tip: {
                type: Type.STRING,
                description: "A brief, encouraging hydration tip."
              }
            },
            required: ["remaining_intake_ml", "hydration_tip"]
          }
        }
      });
      setBioSyncResult(JSON.parse(response.text));
    } catch (error) {
      console.error("Bio-Sync Error:", error);
      toast.error("Failed to calculate hydration target.");
    } finally {
      setIsBioSyncLoading(false);
    }
  };

  const handleAssistantChat = async () => {
    if (!assistantInput.trim()) return;
    const userMsg = { role: 'user' as const, content: assistantInput };
    setAssistantMessages(prev => [...prev, userMsg]);
    setAssistantInput('');
    setIsAssistantLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: assistantInput,
        config: {
          systemInstruction: "You are the AquaPulse Intelligence Assistant. You are an expert in water conservation, human hydration science, and basic plumbing troubleshooting. Your tone is professional, empathetic, and witty. Keep responses under 100 words unless technical steps are required. Always prioritize safety (e.g., advising to call a professional for major leaks).",
        }
      });
      setAssistantMessages(prev => [...prev, { role: 'assistant', content: response.text }]);
    } catch (error) {
      console.error("Assistant Error:", error);
      toast.error("Failed to get response from assistant.");
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const handleLeakDetection = async (imageFile: File) => {
    setIsLeakAnalyzing(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          setLeakImage(reader.result as string);
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Task: Look for signs of 'pitting' corrosion, mineral buildup (calcification), or dampness on the surrounding surface. Based on the image, provide: Status: (Leak detected / No leak detected), Confidence Score: (0-100%), Recommended Action: (e.g., 'Tighten the packing nut' or 'Replace seal immediately')" },
            { inlineData: { data: base64Data, mimeType: imageFile.type } }
          ]
        },
        config: {
          systemInstruction: "You are a specialized Infrastructure Maintenance AI. Analyze images of water pipes, meters, or faucets to detect signs of degradation, moisture, or active leaks. Categorize the risk level as Low, Medium, or High.",
        }
      });
      setLeakAnalysis(response.text);
    } catch (error) {
      console.error("Leak Detection Error:", error);
      toast.error("Failed to analyze image.");
    } finally {
      setIsLeakAnalyzing(false);
    }
  };

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

  const fetchHistory = async () => {
    if (isDemoMode) {
      const start = startOfDay(new Date(historyStartDate));
      const end = endOfDay(new Date(historyEndDate));
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      
      const mockHistory: Reading[] = Array.from({ length: Math.min(100, days * 5) }, (_, i) => {
        const timestamp = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
        return {
          id: `history-mock-${i}`,
          ph: Number((6.5 + Math.random() * 1.5).toFixed(2)),
          waterLevel: Math.floor(Math.random() * 100),
          motorOn: Math.random() > 0.5,
          timestamp: Timestamp.fromDate(timestamp)
        };
      }).sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
      
      setHistoryReadings(mockHistory);
      return;
    }

    if (!user) return;

    setIsFetchingHistory(true);
    try {
      const start = startOfDay(new Date(historyStartDate));
      const end = endOfDay(new Date(historyEndDate));
      
      const q = query(
        collection(db, 'readings'),
        where('timestamp', '>=', Timestamp.fromDate(start)),
        where('timestamp', '<=', Timestamp.fromDate(end)),
        orderBy('timestamp', 'desc')
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reading[];
      setHistoryReadings(data);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyStartDate, historyEndDate, isDemoMode, user]);

  const handleRestartSMS = () => {
    setIsRestartingSMS(true);
    toast.promise(new Promise((resolve) => setTimeout(resolve, 2000)), {
      loading: 'Restarting SMS Module...',
      success: 'SMS Module restarted successfully',
      error: 'Failed to restart SMS Module',
    });
    setTimeout(() => {
      setIsRestartingSMS(false);
    }, 2000);
  };

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

  const phDistribution = [
    { name: 'Acidic', value: readings.filter(r => r.ph < 6.5).length, color: '#f87171' },
    { name: 'Neutral', value: readings.filter(r => r.ph >= 6.5 && r.ph <= 8.5).length, color: '#10b981' },
    { name: 'Alkaline', value: readings.filter(r => r.ph > 8.5).length, color: '#3b82f6' },
  ].filter(item => item.value > 0);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analysis', label: 'Analysis', icon: BrainCircuit },
    { id: 'history', label: 'History', icon: History },
    { id: 'biosync', label: 'Bio-Sync', icon: Droplets },
    { id: 'assistant', label: 'Assistant', icon: MessageSquare },
    { id: 'leak-detect', label: 'Leak Detect', icon: AlertCircle },
    { id: 'sms', label: 'SMS Center', icon: Signal },
    { id: 'contacts', label: 'Contacts', icon: PhoneCall },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex">
      <Toaster position="top-right" richColors />
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
                    {/* Water Profile Pie Chart */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h2 className="text-xl font-bold mb-2">Water Quality Profile</h2>
                      <p className="text-sm text-slate-400 mb-6">Distribution of pH readings</p>
                      
                      <div className="h-[240px] w-full flex items-center justify-center">
                        {phDistribution.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={phDistribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {phDistribution.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="text-slate-300 text-sm italic">No data to display profile</div>
                        )}
                      </div>
                      
                      <div className="mt-6 space-y-3">
                        {phDistribution.map((item, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                              <span className="text-sm font-medium text-slate-600">{item.name}</span>
                            </div>
                            <span className="text-sm font-bold">{item.value} readings</span>
                          </div>
                        ))}
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

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
                        <History className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">Historical Data</h2>
                        <p className="text-slate-400">Review past performance and trends</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <input 
                          type="date" 
                          value={historyStartDate}
                          onChange={(e) => setHistoryStartDate(e.target.value)}
                          className="bg-transparent border-none text-sm font-semibold focus:ring-0"
                        />
                      </div>
                      <span className="text-slate-300">to</span>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <input 
                          type="date" 
                          value={historyEndDate}
                          onChange={(e) => setHistoryEndDate(e.target.value)}
                          className="bg-transparent border-none text-sm font-semibold focus:ring-0"
                        />
                      </div>
                      <button 
                        onClick={fetchHistory}
                        disabled={isFetchingHistory}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isFetchingHistory ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Update
                      </button>
                    </div>
                  </div>

                  {historyReadings.length > 0 ? (
                    <div className="space-y-8">
                      <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={[...historyReadings].reverse().map(r => ({
                            time: format(r.timestamp.toDate(), 'MMM dd, HH:mm'),
                            ph: r.ph,
                            level: r.waterLevel
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="time" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 10 }}
                              dy={10}
                            />
                            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} domain={[0, 14]} />
                            <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} domain={[0, 100]} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                            />
                            <Legend verticalAlign="top" height={36}/>
                            <Area yAxisId="left" type="monotone" dataKey="ph" name="pH Level" stroke="#10b981" fill="#10b981" fillOpacity={0.05} />
                            <Area yAxisId="right" type="monotone" dataKey="level" name="Water Level" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.05} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold">
                            <tr>
                              <th className="px-6 py-4">Timestamp</th>
                              <th className="px-6 py-4">pH Level</th>
                              <th className="px-6 py-4">Water Level</th>
                              <th className="px-6 py-4">Motor Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {historyReadings.map((reading) => (
                              <tr key={reading.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium">{format(reading.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss')}</td>
                                <td className="px-6 py-4">
                                  <span className={cn(
                                    "px-2 py-1 rounded-lg font-bold",
                                    reading.ph >= 6.5 && reading.ph <= 8.5 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                                  )}>
                                    {reading.ph.toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-500" style={{ width: `${reading.waterLevel}%` }} />
                                    </div>
                                    <span className="font-bold">{reading.waterLevel}%</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={cn(
                                    "px-2 py-1 rounded-lg font-bold text-xs uppercase",
                                    reading.motorOn ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"
                                  )}>
                                    {reading.motorOn ? 'Running' : 'Idle'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                      <Calendar className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-400">No data for this period</h3>
                      <p className="text-slate-400 text-sm">Try selecting a different date range or check your connection.</p>
                    </div>
                  )}
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

            {activeTab === 'sms' && (
              <motion.div 
                key="sms"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* SMS Status Card */}
                  <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <h2 className="text-xl font-bold mb-6">ESP32 Sender Status</h2>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <div className="flex items-center gap-3">
                            <Signal className="w-5 h-5 text-emerald-600" />
                            <span className="font-bold text-emerald-900">Network</span>
                          </div>
                          <span className="text-xs font-black text-emerald-600 uppercase">Connected</span>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400 font-medium">Signal Strength</span>
                            <span className="font-bold text-slate-900">-65 dBm (Good)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 w-[75%]" />
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-50 space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400 font-medium">Messages Sent (Today)</span>
                            <span className="font-bold text-slate-900">12</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400 font-medium">Failed Attempts</span>
                            <span className="font-bold text-red-500">1</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400 font-medium">Last Sync</span>
                            <span className="font-bold text-slate-900">2 mins ago</span>
                          </div>
                        </div>

                        <button 
                          onClick={handleRestartSMS}
                          disabled={isRestartingSMS}
                          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                          <RefreshCw className={cn("w-4 h-4", isRestartingSMS && "animate-spin")} />
                          {isRestartingSMS ? 'Restarting...' : 'Restart SMS Module'}
                        </button>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                      <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                        <Cpu className="w-5 h-5" />
                        Hardware Info
                      </h3>
                      <p className="text-blue-800 text-xs leading-relaxed">
                        ESP32-WROOM-32 with SIM800L module. Firmware v2.4.1. Operating at 3.3V.
                      </p>
                    </div>
                  </div>

                  {/* SMS History List */}
                  <div className="lg:col-span-2">
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center mb-8">
                        <div>
                          <h2 className="text-2xl font-bold">Message History</h2>
                          <p className="text-slate-400">Log of all outgoing system notifications</p>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl">
                          <History className="w-5 h-5 text-slate-400" />
                        </div>
                      </div>

                      <div className="space-y-4">
                        {messages.map((msg) => (
                          <div key={msg.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-100 transition-all group">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "p-2 rounded-xl",
                                  msg.type === 'alert' ? "bg-red-100 text-red-600" : 
                                  msg.type === 'command' ? "bg-indigo-100 text-indigo-600" : 
                                  "bg-blue-100 text-blue-600"
                                )}>
                                  {msg.type === 'alert' ? <AlertCircle className="w-4 h-4" /> : 
                                   msg.type === 'command' ? <Code2 className="w-4 h-4" /> : 
                                   <Send className="w-4 h-4" />}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">{msg.recipient}</p>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {format(msg.timestamp, 'MMM dd, HH:mm')}
                                  </p>
                                </div>
                              </div>
                              <span className={cn(
                                "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                                msg.status === 'sent' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                                msg.status === 'failed' ? "bg-red-50 text-red-600 border-red-100" : 
                                "bg-amber-50 text-amber-600 border-amber-100"
                              )}>
                                {msg.status}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed bg-white p-3 rounded-xl border border-slate-50">
                              {msg.content}
                            </p>
                          </div>
                        ))}
                      </div>

                      <button className="w-full mt-6 py-3 text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors">
                        Load More Messages
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'biosync' && (
              <motion.div 
                key="biosync"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-blue-50 rounded-2xl">
                      <Droplets className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800">Bio-Sync Hydration Engine</h2>
                      <p className="text-slate-500">Calculate your personalized hydration target based on environmental factors.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Weight (kg)</label>
                        <input 
                          type="number" 
                          value={bioSyncData.weight}
                          onChange={(e) => setBioSyncData({...bioSyncData, weight: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Temperature (°C)</label>
                        <input 
                          type="number" 
                          value={bioSyncData.temp}
                          onChange={(e) => setBioSyncData({...bioSyncData, temp: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Humidity (%)</label>
                        <input 
                          type="number" 
                          value={bioSyncData.humidity}
                          onChange={(e) => setBioSyncData({...bioSyncData, humidity: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Activity Intensity</label>
                        <select 
                          value={bioSyncData.activity}
                          onChange={(e) => setBioSyncData({...bioSyncData, activity: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium outline-none appearance-none cursor-pointer"
                        >
                          <option value="Normal">Normal</option>
                          <option value="Medium">Medium</option>
                          <option value="Heavy">Heavy</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Current Intake (ml)</label>
                        <input 
                          type="number" 
                          value={bioSyncData.currentIntake}
                          onChange={(e) => setBioSyncData({...bioSyncData, currentIntake: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>
                      <button 
                        onClick={handleBioSync}
                        disabled={isBioSyncLoading}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                      >
                        {isBioSyncLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        Calculate Target
                      </button>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4">
                        <div className="w-20 h-20 bg-blue-100/50 rounded-full -mr-10 -mt-10 blur-2xl" />
                      </div>
                      {bioSyncResult ? (
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                          <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6 mx-auto shadow-inner">
                            <Droplets className="w-12 h-12 text-blue-600" />
                          </div>
                          <h3 className="text-4xl font-black text-blue-600 mb-2 tracking-tighter">{bioSyncResult.remaining_intake_ml}ml</h3>
                          <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] mb-6">Remaining Today</p>
                          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full">
                              AI Advice
                            </div>
                            <p className="text-slate-700 italic font-medium leading-relaxed">"{bioSyncResult.hydration_tip}"</p>
                          </div>
                        </motion.div>
                      ) : (
                        <>
                          <BrainCircuit className="w-16 h-16 text-slate-200 mb-4" />
                          <p className="text-slate-400 font-bold max-w-[200px]">Enter your details to generate a personalized hydration plan.</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'assistant' && (
              <motion.div 
                key="assistant"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto h-[calc(100vh-16rem)] flex flex-col"
              >
                <div className="bg-white flex-1 rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                  <div className="p-6 border-b border-slate-50 flex items-center gap-4 bg-slate-50/30">
                    <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900">AquaPulse Intelligence Assistant</h2>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Expert in water conservation & hydration</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
                    {assistantMessages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                        <Sparkles className="w-12 h-12 text-blue-600 mb-4" />
                        <p className="max-w-xs font-bold text-slate-400">Ask me anything about water conservation, hydration, or plumbing!</p>
                      </div>
                    )}
                    {assistantMessages.map((msg, i) => (
                      <div key={i} className={cn(
                        "flex",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}>
                        <div className={cn(
                          "max-w-[80%] p-4 rounded-2xl font-medium text-sm leading-relaxed",
                          msg.role === 'user' 
                            ? "bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-100" 
                            : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200"
                        )}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isAssistantLoading && (
                      <div className="flex justify-start">
                        <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none flex gap-1 border border-slate-200">
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-slate-50 border-t border-slate-100">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={assistantInput}
                        onChange={(e) => setAssistantInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAssistantChat()}
                        placeholder="Type your question..."
                        className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium text-sm outline-none transition-all"
                      />
                      <button 
                        onClick={handleAssistantChat}
                        disabled={isAssistantLoading || !assistantInput.trim()}
                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all disabled:opacity-50 shadow-lg shadow-blue-200"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'leak-detect' && (
              <motion.div 
                key="leak-detect"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-6xl mx-auto space-y-6"
              >
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-red-50 rounded-2xl">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800">AI Leak Detection</h2>
                      <p className="text-slate-500">Upload a photo of your pipes or meter for instant leak analysis.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div 
                        className="aspect-video bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer hover:bg-slate-100/50 transition-all"
                        onClick={() => document.getElementById('leak-upload')?.click()}
                      >
                        {leakImage ? (
                          <>
                            <img src={leakImage} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Upload className="w-8 h-8 text-white" />
                            </div>
                          </>
                        ) : (
                          <>
                            <Camera className="w-12 h-12 text-slate-200 mb-4 group-hover:scale-110 transition-transform" />
                            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Click to upload photo</p>
                            <p className="text-slate-300 text-[8px] font-black uppercase tracking-widest mt-1">Supports JPG, PNG</p>
                          </>
                        )}
                        <input 
                          id="leak-upload"
                          type="file" 
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleLeakDetection(file);
                          }}
                        />
                      </div>
                      
                      <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 flex gap-4">
                        <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-800 font-bold leading-relaxed">
                          Always prioritize safety. If you detect a major leak or gas smell, call emergency services or a professional plumber immediately.
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
                      {isLeakAnalyzing ? (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                          <h3 className="text-lg font-bold text-slate-800">Analyzing Infrastructure...</h3>
                          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Scanning for corrosion, moisture, and leaks.</p>
                        </div>
                      ) : leakAnalysis ? (
                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">Analysis Report</h3>
                            <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-[8px] font-black uppercase tracking-widest">AI Generated</span>
                          </div>
                          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="whitespace-pre-wrap text-sm font-medium text-slate-700 leading-relaxed">
                              {leakAnalysis}
                            </div>
                          </div>
                          <button 
                            onClick={() => { setLeakImage(null); setLeakAnalysis(null); }}
                            className="w-full py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-100 transition-all text-sm"
                          >
                            New Analysis
                          </button>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                          <BrainCircuit className="w-16 h-16 text-slate-300 mb-4" />
                          <p className="font-bold text-slate-400 text-sm">Upload an image to start the AI analysis.</p>
                        </div>
                      )}
                    </div>
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
