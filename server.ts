import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp, 
  Timestamp,
  doc,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase client for the server
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const app = express();

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

// Seed mock data if collection is empty
const seedMockData = async () => {
  const readingsRef = collection(db, "readings");
  const q = query(readingsRef, limit(1));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log("Seeding mock data...");
    const now = Date.now();
    const batch = writeBatch(db);
    
    for (let i = 0; i < 20; i++) {
      const docRef = doc(readingsRef);
      batch.set(docRef, {
        ph: Number((6.5 + Math.random() * 1.5).toFixed(2)),
        waterLevel: Math.floor(Math.random() * 100),
        motorOn: Math.random() > 0.5,
        timestamp: Timestamp.fromMillis(now - (i * 3600000)) // Hourly data
      });
    }
    
    await batch.commit();
    console.log("Mock data seeded successfully.");
  }
};

seedMockData().catch(err => console.error("Error seeding mock data:", err));

// API Route for ESP32/Arduino to POST data
app.post("/api/sensor-data", async (req, res) => {
  const { ph, waterLevel, motorOn, apiKey } = req.body;

  // Simple API Key check
  const expectedKey = process.env.ESP32_API_KEY;
  if (expectedKey && apiKey !== expectedKey && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const docRef = await addDoc(collection(db, "readings"), {
      ph: Number(ph),
      waterLevel: Number(waterLevel),
      motorOn: Boolean(motorOn),
      timestamp: serverTimestamp()
    });
    console.log("Reading added with ID: ", docRef.id);
    res.status(201).json({ success: true, id: docRef.id });
  } catch (error) {
    console.error("Error adding reading: ", error);
    res.status(500).json({ error: "Failed to store reading" });
  }
});

// API Route for Frontend to GET the latest data
app.get("/api/sensor-data", async (req, res) => {
  try {
    const q = query(
      collection(db, "readings"),
      orderBy("timestamp", "desc"),
      limit(1)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return res.status(404).json({ error: "No data found" });
    }

    const data = snapshot.docs[0].data();
    res.json({
      ph: data.ph,
      waterLevel: data.waterLevel,
      motorOn: data.motorOn,
      timestamp: data.timestamp?.toDate?.() || data.timestamp
    });
  } catch (error) {
    console.error("Error fetching latest reading: ", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "production" || !process.env.NETLIFY) {
  startServer();
}

export { app };
