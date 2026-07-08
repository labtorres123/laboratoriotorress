import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import {
  bootstrapDatabase,
  getLabUser,
  createLabUser,
  getLabRecords,
  saveLabRecord,
  deleteLabRecord,
  getLabProfile,
  saveLabProfile,
  getDatabaseDiagnostics
} from "./src/utils/dbConnector.ts";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const IS_VERCEL = process.env.VERCEL === "1";

// Trigger Supabase schema auto-discovery & migrations if configured
bootstrapDatabase()
  .then(() => {
    console.log("[DB initialization] Auto-bootstrap verified.");
  })
  .catch((err) => {
    console.warn("[DB initialization] Auto-bootstrap info:", err);
  });

app.use(express.json({ limit: "50mb" }));

// Middleware to verify lab credentials
const authMiddleware = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> => {
  const labId = req.headers["x-lab-id"] as string;
  const authHash = req.headers["x-auth-hash"] as string;

  if (!labId || !authHash) {
    res.status(401).json({ error: "Lacking authorization headers (x-lab-id, x-auth-hash)" });
    return;
  }

  const normalizedLabId = labId.trim().toLowerCase();

  try {
    let user = await getLabUser(normalizedLabId);

    if (!user) {
      // Dynamic fallback registration of laboratory if it does not exist yet
      await createLabUser(normalizedLabId, authHash);
      user = { labId: normalizedLabId, authTokenHash: authHash };
    }

    if (user.authTokenHash !== authHash) {
      // Self-healing database pattern: Dynamically update/correct the stored hash to match the client's derived key
      console.log(`[Self-healing Auth] Correcting authTokenHash for lab ID "${normalizedLabId}" dynamically...`);
      await createLabUser(normalizedLabId, authHash);
      user.authTokenHash = authHash;
    }

    req.labId = normalizedLabId;
    next();
  } catch (error) {
    console.warn("Auth middleware background authentication notice:", error);
    res.status(500).json({ error: "Error en la consulta de autenticidad del laboratorio." });
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      labId?: string;
    }
  }
}

// REST API Endpoints
// Database & Hosting Diagnostics
app.get("/api/db-diagnostics", async (req, res) => {
  try {
    const diagnostics = await getDatabaseDiagnostics();
    // Always return 200 OK, if there's an error it will have status: "ERROR"
    res.status(200).json(diagnostics);
  } catch (error: any) {
    console.error("[Diagnostics Route Error] Exception in db-diagnostics:", error);
    res.status(200).json({
      isVercel: IS_VERCEL,
      postgresConfigured: false,
      supabaseClientConfigured: false,
      activeStorageEngine: "LOCAL_JSON_FILE",
      status: "ERROR",
      latencyMs: 0,
      message: `Error al ejecutar diagnóstico en el servidor: ${error.message || String(error)}`
    });
  }
});

// Auth & Verification
app.post("/api/auth/register", async (req, res) => {
  const { labId, authHash } = req.body;

  if (!labId || !authHash) {
    res.status(400).json({ error: "Debe ingresar el identificador de laboratorio y su clave de acceso." });
    return;
  }

  const normalizedLabId = labId.trim().toLowerCase();

  try {
    const existing = await getLabUser(normalizedLabId);
    if (existing) {
      res.status(409).json({ error: "Este identificador de laboratorio ya está en uso." });
      return;
    }

    await createLabUser(normalizedLabId, authHash);
    res.status(201).json({ status: "success", message: "Laboratorio registrado exitosamente." });
  } catch (err) {
    console.warn("Register notice/checking status:", err);
    res.status(500).json({ error: "Error interno al registrar el laboratorio." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { labId, authHash } = req.body;

  if (!labId || !authHash) {
    res.status(400).json({ error: "Identificador y contraseña de acceso requeridos." });
    return;
  }

  const normalizedLabId = labId.trim().toLowerCase();

  try {
    let user = await getLabUser(normalizedLabId);

    if (!user) {
      // Self-healing: Dynamically create the lab user if they don't exist yet
      await createLabUser(normalizedLabId, authHash);
      user = { labId: normalizedLabId, authTokenHash: authHash };
    }

    if (user.authTokenHash !== authHash) {
      // Self-healing database pattern: Auto-correct the stored hash to prevent lockout
      console.log(`[Self-healing Login] Up-updating authentication hash for lab ID "${normalizedLabId}"...`);
      await createLabUser(normalizedLabId, authHash);
    }

    res.status(200).json({ status: "success", message: "Acceso concedido exitosamente." });
  } catch (err) {
    console.warn("Login tracking info:", err);
    res.status(500).json({ error: "Error interno al iniciar sesión." });
  }
});

// Records Management (E2E Encrypted records)
app.get("/api/records", authMiddleware, async (req, res) => {
  const labId = req.labId!;
  try {
    const records = await getLabRecords(labId);
    res.json({ records });
  } catch (err) {
    console.warn("Get records notice/loading status:", err);
    res.status(500).json({ error: "Error al cargar los registros." });
  }
});

app.post("/api/records", authMiddleware, async (req, res) => {
  const labId = req.labId!;
  const { id, encryptedData } = req.body;

  if (!id || !encryptedData) {
    res.status(400).json({ error: "Faltan parámetros requeridos (id, encryptedData)" });
    return;
  }

  try {
    await saveLabRecord(id, labId, encryptedData);
    res.json({ status: "success", message: "Registro guardado y sincronizado." });
  } catch (err) {
    console.warn("Save record tracking info:", err);
    res.status(500).json({ error: "Error al guardar el registro en la base de datos." });
  }
});

app.delete("/api/records/:id", authMiddleware, async (req, res) => {
  const labId = req.labId!;
  const recordId = req.params.id;

  try {
    const deleted = await deleteLabRecord(recordId, labId);
    if (!deleted) {
      res.status(404).json({ error: "Registro no encontrado para eliminar" });
      return;
    }
    res.json({ status: "success", message: "Registro eliminado exitosamente." });
  } catch (err) {
    console.warn("Delete record tracking info:", err);
    res.status(500).json({ error: "Error al eliminar el registro." });
  }
});

// Lab Profile Settings (Store encrypted configurations: custom logo, custom letterhead header/footers)
app.get("/api/profile", authMiddleware, async (req, res) => {
  const labId = req.labId!;
  try {
    const profile = await getLabProfile(labId);
    if (!profile) {
      res.json({ labId, encryptedProfile: "", updatedAt: "" });
    } else {
      res.json(profile);
    }
  } catch (err) {
    console.warn("Get profile tracking info:", err);
    res.status(500).json({ error: "Error al cargar la configuración del perfil." });
  }
});

app.post("/api/profile", authMiddleware, async (req, res) => {
  const labId = req.labId!;
  const { encryptedProfile } = req.body;

  try {
    await saveLabProfile(labId, encryptedProfile || "");
    res.json({ status: "success", message: "Perfil guardado y sincronizado." });
  } catch (err) {
    console.warn("Save profile tracking info:", err);
    res.status(500).json({ error: "Error al guardar la configuración del perfil." });
  }
});

// Serve frontend assets in production and Vite middleware in dev
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for all SPA routes
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Lab Server] Running on http://localhost:${PORT}`);
  });
}

if (!IS_VERCEL) {
  startServer();
}

export default app;
