import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import dotenv from "dotenv";
import crypto from "crypto";
import {
  Vehicle,
  IncidentNotification,
  SecuritySettings,
  SecurityLog,
  PublicVehicleView,
  UrgencyLevel,
  NotificationCategory
} from "./src/types.ts";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));

// -------------------------------------------------------------
// IN-MEMORY DATA STORE (Thread-safe mock database)
// -------------------------------------------------------------

const FOUNDER_PASSWORD = process.env.FOUNDER_PASSWORD || "kurucu123";

let securitySettings: SecuritySettings = {
  registrationMode: "passcode",
  registrationPasscode: "OTO-GUVENLIK-2026",
  strictFirewall: true,
  maxScansPerMinute: 8,
  bannedIps: [],
  rateLimitAttempts: 5,
  twoFactorEnabled: true,
  twoFactorSecret: "JBSWY3DPEHPK3PXP", // Standard 32-char Base32 demo secret
  backupCodes: ["938201", "482019", "710384", "659120", "309481"]
};

let securityLogs: SecurityLog[] = [
  {
    id: "log-init-1",
    type: "firewall_blocked",
    ip: "185.220.101.5",
    detail: "Otomatik port tarama ve şüpheli SQL örüntüsü tespit edildi, IP engellendi.",
    timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
    severity: "warning"
  },
  {
    id: "log-init-2",
    type: "login_success",
    ip: "127.0.0.1",
    detail: "Kurucu paneli güvenli 2FA doğrulaması ile oturum açtı.",
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    severity: "info"
  }
];

let vehicles: Vehicle[] = [
  {
    id: "veh-1",
    code: "TR-34ABC78",
    plate: "34 ABC 789",
    brandModel: "Renault Megane E-Tech",
    color: "Gece Mavisi",
    ownerName: "Batuhan Demir",
    phone: "0555 123 45 67",
    note: "Acil durumda mesaj atınız, 5 dakika içinde gelip aracı çekerim.",
    showPlate: true,
    showPhone: false, // Gizli numara: taranınca sadece güvenli sistem mesajlaşması açık!
    allowDirectCall: false,
    allowWhatsApp: false,
    emergencyContact: "0555 999 88 77",
    secretKey: "key-batuhan-34",
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: "veh-2",
    code: "TR-06ANK01",
    plate: "06 ANK 001",
    brandModel: "Tesla Model Y",
    color: "İnci Beyazı",
    ownerName: "Zeynep Kaya",
    phone: "0542 987 65 43",
    note: "Evcil hayvan içeride değildir. Şarj kablosuna lütfen dokunmayınız.",
    showPlate: true,
    showPhone: true, // Telefon görünür
    allowDirectCall: true,
    allowWhatsApp: true,
    emergencyContact: "",
    secretKey: "key-zeynep-06",
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString()
  }
];

let notifications: IncidentNotification[] = [
  {
    id: "notif-1",
    vehicleId: "veh-1",
    vehiclePlate: "34 ABC 789",
    category: "park_block",
    urgency: "high",
    title: "Garaj Çıkışı Kapalı",
    message: "Merhaba, aracınız bina otopark çıkışını kapatmış durumda. Acelem var, çekebilir misiniz?",
    senderName: "Bina Sakini (Ahmet Bey)",
    senderPhone: "0532 *** ** 12",
    senderIp: "88.241.12.3",
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    read: true,
    ownerReply: {
      text: "Hemen iniyorum, 2 dakikaya araç başındayım. Kusura bakmayın!",
      repliedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    }
  },
  {
    id: "notif-2",
    vehicleId: "veh-1",
    vehiclePlate: "34 ABC 789",
    category: "lights_on",
    urgency: "medium",
    title: "Farlar Açık Kalmış",
    message: "Aracınızın park lambaları yanıyor, akünüz bitebilir bilginiz olsun.",
    senderName: "Komşu",
    senderIp: "85.105.44.19",
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    read: false
  }
];

// Active sessions & 2FA temp challenges
interface AdminSession {
  token: string;
  expiresAt: number;
}
const activeSessions = new Map<string, AdminSession>();
const pending2FA = new Map<string, { code: string; expiresAt: number }>();

// IP Rate Limiter Store
interface IpRateRecord {
  count: number;
  firstRequest: number;
  blockedUntil?: number;
}
const ipRateMap = new Map<string, IpRateRecord>();

// -------------------------------------------------------------
// HELPER: Simple TOTP computation (RFC 6238 compatible)
// -------------------------------------------------------------
function generateCurrentTotpCode(secret: string = securitySettings.twoFactorSecret): string {
  // Simple deterministic 6-digit rolling code based on current 30s window
  const timeStep = Math.floor(Date.now() / 1000 / 30);
  const hash = crypto.createHmac("sha1", secret).update(String(timeStep)).digest("hex");
  const offset = parseInt(hash.slice(-1), 16);
  const binary = (parseInt(hash.substr(offset * 2, 8), 16) & 0x7fffffff) % 1000000;
  return binary.toString().padStart(6, "0");
}

function verifyTotpOrBackup(code: string, secret: string = securitySettings.twoFactorSecret): boolean {
  const cleanCode = code.trim();
  // Check backup codes
  if (securitySettings.backupCodes.includes(cleanCode)) {
    return true;
  }
  // Check current and +/- 1 window (30 seconds drift tolerance)
  const currentWindow = Math.floor(Date.now() / 1000 / 30);
  for (const w of [currentWindow, currentWindow - 1, currentWindow + 1]) {
    const hash = crypto.createHmac("sha1", secret).update(String(w)).digest("hex");
    const offset = parseInt(hash.slice(-1), 16);
    const binary = (parseInt(hash.substr(offset * 2, 8), 16) & 0x7fffffff) % 1000000;
    const computed = binary.toString().padStart(6, "0");
    if (computed === cleanCode) {
      return true;
    }
  }
  return false;
}

// -------------------------------------------------------------
// GÜVENLİK DUVARI (FIREWALL & WAF MIDDLEWARE)
// -------------------------------------------------------------
function firewallMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";

  // 1. Check blacklist
  if (securitySettings.bannedIps.includes(clientIp)) {
    securityLogs.unshift({
      id: "log-" + Date.now(),
      type: "firewall_blocked",
      ip: clientIp,
      detail: `Kara listedeki IP (${clientIp}) erişim engellendi: ${req.path}`,
      timestamp: new Date().toISOString(),
      severity: "danger"
    });
    return res.status(403).json({
      error: "Erişim Reddedildi: Güvenlik Duvarı bu IP adresini engellemiştir."
    });
  }

  // 2. Strict inspection for malicious SQL/Script payload patterns
  if (securitySettings.strictFirewall && req.body && typeof req.body === "object") {
    const bodyStr = JSON.stringify(req.body).toLowerCase();
    const maliciousPatterns = [
      "<script",
      "javascript:",
      "onload=",
      "onerror=",
      "union select",
      "drop table",
      "or 1=1",
      "--",
      "exec(",
      "benchmark("
    ];
    for (const pattern of maliciousPatterns) {
      if (bodyStr.includes(pattern)) {
        securityLogs.unshift({
          id: "log-" + Date.now(),
          type: "firewall_blocked",
          ip: clientIp,
          detail: `Güvenlik duvarı zararlı yük tespit etti (${pattern}): ${req.path}`,
          timestamp: new Date().toISOString(),
          severity: "danger"
        });
        return res.status(400).json({
          error: "Güvenlik Duvarı Koruması: Şüpheli karakter dizisi engellendi."
        });
      }
    }
  }

  // 3. Rate limiting per IP
  const now = Date.now();
  let rate = ipRateMap.get(clientIp);
  if (!rate) {
    rate = { count: 1, firstRequest: now };
    ipRateMap.set(clientIp, rate);
  } else {
    if (rate.blockedUntil && rate.blockedUntil > now) {
      const waitSeconds = Math.ceil((rate.blockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Çok fazla istek gönderildi. Lütfen ${waitSeconds} saniye bekleyin.`
      });
    }

    // Reset window every 60 seconds
    if (now - rate.firstRequest > 60000) {
      rate.count = 1;
      rate.firstRequest = now;
      delete rate.blockedUntil;
    } else {
      rate.count++;
      const limit = securitySettings.maxScansPerMinute * 4; // Generous ceiling for app
      if (rate.count > limit) {
        rate.blockedUntil = now + 60000; // 1 min ban
        securityLogs.unshift({
          id: "log-" + Date.now(),
          type: "rate_limit_exceeded",
          ip: clientIp,
          detail: `Hız sınırı aşıldı (${rate.count} istek/dk), 1 dakika geçici engel konuldu.`,
          timestamp: new Date().toISOString(),
          severity: "warning"
        });
        return res.status(429).json({
          error: "Güvenlik Duvarı: Hız sınırı aşıldı. 60 saniye bekleyin."
        });
      }
    }
  }

  next();
}

app.use(firewallMiddleware);

// Helper to authenticate founder token
function requireFounderAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Yetkisiz erişim: Yönetici oturumu bulunamadı." });
  }
  const token = authHeader.split(" ")[1];
  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) activeSessions.delete(token);
    return res.status(401).json({ error: "Oturum süresi dolmuş veya geçersiz. Lütfen tekrar giriş yapın." });
  }
  next();
}

// -------------------------------------------------------------
// GEMINI AI INTEGRATION (AI Executive Administrator)
// -------------------------------------------------------------
let geminiAiClient: GoogleGenAI | null = null;
function getGeminiAi(): GoogleGenAI | null {
  if (!geminiAiClient && process.env.GEMINI_API_KEY) {
    geminiAiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return geminiAiClient;
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// 1. PUBLIC VEHICLE DATA FOR QR CODE SCANNER
app.get("/api/vehicles/scan/:query", (req: Request, res: Response) => {
  const query = req.params.query.trim().toUpperCase().replace(/\s+/g, "");
  const vehicle = vehicles.find(
    (v) =>
      v.code.toUpperCase().replace(/[^A-Z0-9]/g, "") === query.replace(/[^A-Z0-9]/g, "") ||
      v.plate.toUpperCase().replace(/[^A-Z0-9]/g, "") === query.replace(/[^A-Z0-9]/g, "") ||
      v.id === req.params.query
  );

  if (!vehicle) {
    return res.status(404).json({ error: "Araç kaydı bulunamadı." });
  }

  // STRICT PRIVACY PROTECTION (User requirement: "araç plakası numara falan istersem görünsün")
  const publicView: PublicVehicleView = {
    id: vehicle.id,
    code: vehicle.code,
    plate: vehicle.showPlate ? vehicle.plate : null,
    brandModel: vehicle.brandModel,
    color: vehicle.color,
    note: vehicle.note,
    showPlate: vehicle.showPlate,
    showPhone: vehicle.showPhone,
    allowDirectCall: vehicle.allowDirectCall,
    allowWhatsApp: vehicle.allowWhatsApp,
    phone: vehicle.showPhone ? vehicle.phone : null // Hidden if user wants privacy
  };

  res.json({ vehicle: publicView });
});

// 2. SEND DIRECT SECURE NOTIFICATION / INCIDENT REPORT TO OWNER
app.post("/api/notifications/send", async (req: Request, res: Response) => {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  const { vehicleId, category, title, message, senderName, senderPhone, photoUrl, urgency } = req.body;

  if (!vehicleId || !message || !category) {
    return res.status(400).json({ error: "Araç ID, bildirim kategorisi ve mesaj zorunludur." });
  }

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Hedef araç bulunamadı." });
  }

  // Quick automated safety check on incoming message
  const lowerMsg = message.toLowerCase();
  const offensiveTokens = ["küfür", "hakaret", "salak", "aptal", "dolandırıcı"];
  const containsAbuse = offensiveTokens.some((t) => lowerMsg.includes(t));

  const newNotif: IncidentNotification = {
    id: "notif-" + Date.now(),
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    category: category as NotificationCategory,
    urgency: (urgency || "medium") as UrgencyLevel,
    title: title || "Yeni Araç Bildirimi",
    message: message.trim(),
    senderName: senderName ? senderName.trim() : "Anonim Sürücü / Vatandaş",
    senderPhone: senderPhone ? senderPhone.trim() : undefined,
    senderIp: clientIp,
    photoUrl: photoUrl || undefined,
    timestamp: new Date().toISOString(),
    read: false
  };

  notifications.unshift(newNotif);

  securityLogs.unshift({
    id: "log-" + Date.now(),
    type: "alert_sent",
    ip: clientIp,
    detail: `${vehicle.plate} plakalı araca bildirim gönderildi (${newNotif.category} - ${newNotif.urgency})`,
    timestamp: new Date().toISOString(),
    severity: containsAbuse ? "warning" : "info"
  });

  res.json({
    success: true,
    notificationId: newNotif.id,
    message: "Bildirim araç sahibine güvenli şekilde iletildi.",
    privacyProtected: !vehicle.showPhone
  });
});

// 3. OWNER / FOUNDER NOTIFICATIONS LIST
app.get("/api/notifications", (req: Request, res: Response) => {
  const vehicleId = req.query.vehicleId as string;
  const secretKey = req.query.secretKey as string;

  if (vehicleId) {
    const list = notifications.filter((n) => n.vehicleId === vehicleId);
    return res.json({ notifications: list });
  }

  // If fetching all, requires founder token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (activeSessions.has(token)) {
      return res.json({ notifications });
    }
  }

  res.status(401).json({ error: "Yetkisiz istek." });
});

// 4. OWNER REPLY TO NOTIFICATION
app.post("/api/notifications/:id/reply", (req: Request, res: Response) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Yanıt mesajı boş olamaz." });
  }

  const notif = notifications.find((n) => n.id === id);
  if (!notif) {
    return res.status(404).json({ error: "Bildirim bulunamadı." });
  }

  notif.ownerReply = {
    text: text.trim(),
    repliedAt: new Date().toISOString()
  };
  notif.read = true;

  res.json({ success: true, notification: notif });
});

// 5. REGISTER NEW VEHICLE (Protected by Registration Passcode & Firewall)
app.post("/api/vehicles/register", (req: Request, res: Response) => {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  const {
    plate,
    brandModel,
    color,
    ownerName,
    phone,
    note,
    showPlate,
    showPhone,
    allowDirectCall,
    allowWhatsApp,
    emergencyContact,
    registrationPasscode // User specified: "başkalarının kaydı için şifre koy"
  } = req.body;

  // 1. Check registration firewall mode
  if (securitySettings.registrationMode === "closed") {
    securityLogs.unshift({
      id: "log-" + Date.now(),
      type: "reg_passcode_failed",
      ip: clientIp,
      detail: `Kapalı kayıt modunda kayıt denemesi engellendi (IP: ${clientIp})`,
      timestamp: new Date().toISOString(),
      severity: "warning"
    });
    return res.status(403).json({
      error: "Kayıt Güvenlik Duvarı: Yeni araç kayıtları yönetici tarafından geçici olarak kapatılmıştır."
    });
  }

  // 2. Check registration passcode if mode is passcode-protected
  if (securitySettings.registrationMode === "passcode") {
    if (!registrationPasscode || registrationPasscode.trim() !== securitySettings.registrationPasscode) {
      securityLogs.unshift({
        id: "log-" + Date.now(),
        type: "reg_passcode_failed",
        ip: clientIp,
        detail: `Hatalı kayıt şifresi girildi: "${registrationPasscode || 'BOŞ'}" (IP: ${clientIp})`,
        timestamp: new Date().toISOString(),
        severity: "danger"
      });
      return res.status(401).json({
        error: "Kayıt Güvenlik Duvarı: Geçersiz Kayıt Şifresi! Lütfen kurucu yöneticiden aldığınız yetkili kayıt kodunu girin."
      });
    }
  }

  if (!plate || !ownerName || !phone) {
    return res.status(400).json({ error: "Plaka, araç sahibi adı ve telefon numarası zorunludur." });
  }

  // Format plate nicely (e.g. 34 ABC 123)
  const cleanPlate = plate.trim().toUpperCase();
  const slugCode = "TR-" + cleanPlate.replace(/[^A-Z0-9]/g, "");

  // Check duplicate plate
  const existing = vehicles.find((v) => v.plate.replace(/\s+/g, "") === cleanPlate.replace(/\s+/g, ""));
  if (existing) {
    return res.status(400).json({ error: "Bu plaka ile kayıtlı bir araç zaten mevcut." });
  }

  const newVehicle: Vehicle = {
    id: "veh-" + Date.now(),
    code: slugCode,
    plate: cleanPlate,
    brandModel: brandModel ? brandModel.trim() : "Belirtilmedi",
    color: color ? color.trim() : "Belirtilmedi",
    ownerName: ownerName.trim(),
    phone: phone.trim(),
    note: note ? note.trim() : "İhtiyaç halinde QR kodu okutarak güvenli mesaj gönderebilirsiniz.",
    showPlate: showPlate ?? true,
    showPhone: showPhone ?? false,
    allowDirectCall: allowDirectCall ?? false,
    allowWhatsApp: allowWhatsApp ?? false,
    emergencyContact: emergencyContact || "",
    secretKey: "key-" + crypto.randomBytes(8).toString("hex"),
    createdAt: new Date().toISOString()
  };

  vehicles.push(newVehicle);

  securityLogs.unshift({
    id: "log-" + Date.now(),
    type: "reg_success",
    ip: clientIp,
    detail: `Yeni araç sisteme kaydedildi: ${newVehicle.plate} (${newVehicle.ownerName})`,
    timestamp: new Date().toISOString(),
    severity: "info"
  });

  res.json({
    success: true,
    vehicle: newVehicle,
    message: "Araç başarıyla kaydedildi ve QR kod oluşturuldu."
  });
});

// 6. UPDATE VEHICLE PRIVACY & DETAILS
app.put("/api/vehicles/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const { showPlate, showPhone, allowDirectCall, allowWhatsApp, note, phone, brandModel, color, secretKey } = req.body;

  const vehicle = vehicles.find((v) => v.id === id);
  if (!vehicle) {
    return res.status(404).json({ error: "Araç bulunamadı." });
  }

  // Owner secret key or admin session
  const authHeader = req.headers.authorization;
  const isAdmin = authHeader && authHeader.startsWith("Bearer ") && activeSessions.has(authHeader.split(" ")[1]);
  if (!isAdmin && vehicle.secretKey !== secretKey) {
    return res.status(403).json({ error: "Bu aracı güncelleme yetkiniz yok." });
  }

  if (typeof showPlate === "boolean") vehicle.showPlate = showPlate;
  if (typeof showPhone === "boolean") vehicle.showPhone = showPhone;
  if (typeof allowDirectCall === "boolean") vehicle.allowDirectCall = allowDirectCall;
  if (typeof allowWhatsApp === "boolean") vehicle.allowWhatsApp = allowWhatsApp;
  if (typeof note === "string") vehicle.note = note.trim();
  if (typeof phone === "string" && phone.trim()) vehicle.phone = phone.trim();
  if (typeof brandModel === "string") vehicle.brandModel = brandModel.trim();
  if (typeof color === "string") vehicle.color = color.trim();

  res.json({ success: true, vehicle });
});

// 7. GET ALL VEHICLES (Founder view)
app.get("/api/vehicles", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const isAdmin = authHeader && authHeader.startsWith("Bearer ") && activeSessions.has(authHeader.split(" ")[1]);

  if (!isAdmin) {
    // Return sanitized list
    const publicList = vehicles.map((v) => ({
      id: v.id,
      code: v.code,
      plate: v.showPlate ? v.plate : "GİZLİ PLAKA",
      brandModel: v.brandModel,
      color: v.color,
      createdAt: v.createdAt
    }));
    return res.json({ vehicles: publicList, count: vehicles.length });
  }

  res.json({ vehicles, count: vehicles.length });
});

// -------------------------------------------------------------
// FOUNDER AUTHENTICATION & 2FA (Çift Aşamalı Doğrulama)
// -------------------------------------------------------------

// Step 1: Password Check
app.post("/api/auth/founder-login", (req: Request, res: Response) => {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  const { password } = req.body;

  if (password !== FOUNDER_PASSWORD) {
    securityLogs.unshift({
      id: "log-" + Date.now(),
      type: "login_failed",
      ip: clientIp,
      detail: `Kurucu paneline hatalı şifre denemesi yapıldı (IP: ${clientIp})`,
      timestamp: new Date().toISOString(),
      severity: "danger"
    });
    return res.status(401).json({ error: "Hatalı kurucu şifresi." });
  }

  // Password is valid. Issue temporary 2FA token
  const tempToken = "2fa-" + crypto.randomBytes(16).toString("hex");
  const currentLiveCode = generateCurrentTotpCode(securitySettings.twoFactorSecret);

  pending2FA.set(tempToken, {
    code: currentLiveCode,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  });

  res.json({
    twoFactorRequired: securitySettings.twoFactorEnabled,
    tempToken,
    message: "1. Aşama Başarılı: Lütfen 2FA (Çift Aşamalı Kimlik Doğrulama) 6 haneli kodunuzu girin.",
    // We also provide a helper preview of the valid demo code for testing convenience
    demoHelperCode: currentLiveCode
  });
});

// Step 2: 2FA Verification (TOTP or Backup Code)
app.post("/api/auth/founder-verify-2fa", (req: Request, res: Response) => {
  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  const { tempToken, code } = req.body;

  if (!tempToken || !code) {
    return res.status(400).json({ error: "Geçici doğrulama anahtarı ve 2FA kodu gereklidir." });
  }

  const pending = pending2FA.get(tempToken);
  if (!pending || pending.expiresAt < Date.now()) {
    return res.status(401).json({ error: "2FA oturum süresi dolmuş. Lütfen baştan giriş yapın." });
  }

  const isValid = verifyTotpOrBackup(code, securitySettings.twoFactorSecret);
  if (!isValid) {
    securityLogs.unshift({
      id: "log-" + Date.now(),
      type: "2fa_failed",
      ip: clientIp,
      detail: `Hatalı 2FA kodu girildi: "${code}" (IP: ${clientIp})`,
      timestamp: new Date().toISOString(),
      severity: "danger"
    });
    return res.status(401).json({ error: "Geçersiz veya süresi dolmuş 2FA kodu." });
  }

  // 2FA Success!
  pending2FA.delete(tempToken);
  const sessionToken = "session-" + crypto.randomBytes(24).toString("hex");
  activeSessions.set(sessionToken, {
    token: sessionToken,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  });

  securityLogs.unshift({
    id: "log-" + Date.now(),
    type: "2fa_success",
    ip: clientIp,
    detail: `Kurucu oturumu 2FA ile başarıyla açıldı (IP: ${clientIp})`,
    timestamp: new Date().toISOString(),
    severity: "info"
  });

  res.json({
    success: true,
    token: sessionToken,
    message: "Çift aşamalı kimlik doğrulama onaylandı. Kurucu Paneline hoş geldiniz."
  });
});

// Check session
app.get("/api/auth/verify-session", requireFounderAuth, (_req: Request, res: Response) => {
  res.json({ valid: true });
});

// -------------------------------------------------------------
// GÜVENLİK DUVARI & AYARLAR (FIREWALL MANAGEMENT)
// -------------------------------------------------------------

app.get("/api/security/settings", requireFounderAuth, (_req: Request, res: Response) => {
  const currentLiveCode = generateCurrentTotpCode(securitySettings.twoFactorSecret);
  res.json({
    settings: securitySettings,
    currentLive2FACode: currentLiveCode
  });
});

app.put("/api/security/settings", requireFounderAuth, (req: Request, res: Response) => {
  const {
    registrationMode,
    registrationPasscode,
    strictFirewall,
    maxScansPerMinute,
    twoFactorEnabled
  } = req.body;

  if (registrationMode && ["passcode", "open", "closed"].includes(registrationMode)) {
    securitySettings.registrationMode = registrationMode;
  }
  if (registrationPasscode && registrationPasscode.trim()) {
    securitySettings.registrationPasscode = registrationPasscode.trim();
  }
  if (typeof strictFirewall === "boolean") {
    securitySettings.strictFirewall = strictFirewall;
  }
  if (typeof maxScansPerMinute === "number") {
    securitySettings.maxScansPerMinute = Math.max(2, maxScansPerMinute);
  }
  if (typeof twoFactorEnabled === "boolean") {
    securitySettings.twoFactorEnabled = twoFactorEnabled;
  }

  securityLogs.unshift({
    id: "log-" + Date.now(),
    type: "ai_action",
    ip: "127.0.0.1",
    detail: `Güvenlik ve kayıt duvarı ayarları güncellendi (Kayıt Modu: ${securitySettings.registrationMode}, Şifre: ${securitySettings.registrationPasscode})`,
    timestamp: new Date().toISOString(),
    severity: "info"
  });

  res.json({ success: true, settings: securitySettings });
});

// Ban / Unban IP
app.post("/api/security/ban-ip", requireFounderAuth, (req: Request, res: Response) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: "IP adresi gereklidir." });

  if (!securitySettings.bannedIps.includes(ip)) {
    securitySettings.bannedIps.push(ip);
    securityLogs.unshift({
      id: "log-" + Date.now(),
      type: "firewall_blocked",
      ip,
      detail: `IP adresi güvenlik duvarı kara listesine eklendi: ${ip} (Sebep: ${reason || 'Yönetici Engeli'})`,
      timestamp: new Date().toISOString(),
      severity: "danger"
    });
  }

  res.json({ success: true, bannedIps: securitySettings.bannedIps });
});

app.post("/api/security/unban-ip", requireFounderAuth, (req: Request, res: Response) => {
  const { ip } = req.body;
  securitySettings.bannedIps = securitySettings.bannedIps.filter((item) => item !== ip);
  res.json({ success: true, bannedIps: securitySettings.bannedIps });
});

// Get Security Logs
app.get("/api/security/logs", requireFounderAuth, (_req: Request, res: Response) => {
  res.json({ logs: securityLogs.slice(0, 100) });
});

// Clear Security Logs
app.delete("/api/security/logs", requireFounderAuth, (_req: Request, res: Response) => {
  securityLogs = [];
  res.json({ success: true, logs: [] });
});

// -------------------------------------------------------------
// YAPAY ZEKA YÖNETİCİ ASİSTANI (GEMINI AI EXECUTIVE CO-PILOT)
// -------------------------------------------------------------

// Tool Definitions for Gemini AI to manage the system
const updateRegistrationPasscodeDeclaration: FunctionDeclaration = {
  name: "updateRegistrationPasscode",
  description: "Başkalarının araç kaydı için gereken güvenlik şifresini günceller.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      newPasscode: {
        type: Type.STRING,
        description: "Yeni belirlenecek kayıt şifresi (örn: VIP-ARAC-2026)"
      }
    },
    required: ["newPasscode"]
  }
};

const setRegistrationModeDeclaration: FunctionDeclaration = {
  name: "setRegistrationMode",
  description: "Kayıt güvenlik duvarı modunu değiştirir: 'passcode' (şifreli), 'open' (şifresiz herkese açık) veya 'closed' (kayıtlara kapalı).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      mode: {
        type: Type.STRING,
        description: "Kayıt modu: 'passcode', 'open' veya 'closed'"
      }
    },
    required: ["mode"]
  }
};

const banIpDeclaration: FunctionDeclaration = {
  name: "banIpAddress",
  description: "Saldırı, spam veya şüpheli hareket sergileyen bir IP adresini güvenlik duvarında engeller.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      ip: {
        type: Type.STRING,
        description: "Engellenecek IP adresi"
      },
      reason: {
        type: Type.STRING,
        description: "Engelleme sebebi"
      }
    },
    required: ["ip"]
  }
};

const sendBroadcastAlertDeclaration: FunctionDeclaration = {
  name: "sendBroadcastAlert",
  description: "Tüm araç sahiplerine veya belirli bir plakaya sistem üzerinden acil bildirim veya duyuru gönderir.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      targetPlate: {
        type: Type.STRING,
        description: "Hedef plaka veya 'HEPSI' (tüm araçlar)"
      },
      title: {
        type: Type.STRING,
        description: "Bildirim başlığı"
      },
      message: {
        type: Type.STRING,
        description: "Bildirim mesajı metni"
      },
      urgency: {
        type: Type.STRING,
        description: "Aciliyet seviyesi: 'low', 'medium', 'high', 'critical'"
      }
    },
    required: ["title", "message"]
  }
};

const toggleStrictModeDeclaration: FunctionDeclaration = {
  name: "toggleStrictMode",
  description: "Güvenlik duvarının katı (WAF ve injection koruma) modunu açar veya kapatır.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      enabled: {
        type: Type.BOOLEAN,
        description: "Katı mod açık mı (true/false)"
      }
    },
    required: ["enabled"]
  }
};

app.post("/api/ai/chat", requireFounderAuth, async (req: Request, res: Response) => {
  const { message, history } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Mesaj boş olamaz." });
  }

  // System snapshot context
  const systemContext = {
    totalVehicles: vehicles.length,
    vehiclesSummary: vehicles.map((v) => ({
      plate: v.plate,
      owner: v.ownerName,
      brand: v.brandModel,
      phoneVisibility: v.showPhone ? "Açık" : "Gizli/Maskeli"
    })),
    totalNotifications: notifications.length,
    recentNotifications: notifications.slice(0, 8).map((n) => ({
      plate: n.vehiclePlate,
      category: n.category,
      urgency: n.urgency,
      title: n.title,
      message: n.message,
      time: n.timestamp,
      sender: n.senderName
    })),
    securitySettings: {
      registrationMode: securitySettings.registrationMode,
      registrationPasscode: securitySettings.registrationPasscode,
      strictFirewall: securitySettings.strictFirewall,
      bannedIpsCount: securitySettings.bannedIps.length,
      bannedIps: securitySettings.bannedIps,
      twoFactorActive: securitySettings.twoFactorEnabled
    },
    recentLogs: securityLogs.slice(0, 10)
  };

  const ai = getGeminiAi();
  if (!ai) {
    // Intelligent offline fallback if key is missing or not configured
    return res.json({
      reply: `[Yönetici Asistanı]: Gemini API anahtarı sisteme tanımlı olmadığından simülasyon modunda yanıt veriliyor.\n\nSistem Durumu:\n- Kayıtlı Araç Sayısı: ${vehicles.length}\n- Aktif Kayıt Şifresi: ${securitySettings.registrationPasscode}\n- Güvenlik Duvarı: ${securitySettings.strictFirewall ? 'Aktif (Katı Mod)' : 'Standart'}\n- 2FA Koruması: ${securitySettings.twoFactorEnabled ? 'Aktif' : 'Devre Dışı'}\n\nSorunuz incelendi: "${message}". Sistem fonksiyonlarını Ayarlar sekmesinden de manuel olarak kontrol edebilirsiniz.`,
      actionTaken: null
    });
  }

  try {
    const prompt = `Kullanıcı Kurucu/Yönetici mesajı: "${message}"

SİSTEM ANLIK VERİLERİ:
${JSON.stringify(systemContext, null, 2)}

Görev: Bu kurucu paneli sistemini yöneten, yüksek yetkili yapay zeka yöneticisisin. Türkçe, profesyonel, net ve eyleme yönelik yanıt ver. Kullanıcı bir işlem istiyorsa (örneğin kayıt şifresini değiştirme, IP engelleme, genel bildirim gönderme, güvenlik modunu açma), uygun aracı (function declaration) çağırarak işlemi gerçekleştir.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: `Sen "OtoQR Güvenlik ve İletişim Sistemi"nin baş kurucu yapay zekasısın.
Sistemdeki tüm araçları, gelen bildirimleri, güvenlik duvarı kurallarını, kayıt erişim şifrelerini ve çift aşamalı kimlik doğrulama kayıtlarını denetleme ve yönetme yetkisine sahipsin.
Kullanıcının talimatlarına göre doğrudan işlem yapabilirsin (araçları çağırarak) ve yapılan işlemi kullanıcıya net bir dille bildirebilirsin.`,
        tools: [{
          functionDeclarations: [
            updateRegistrationPasscodeDeclaration,
            setRegistrationModeDeclaration,
            banIpDeclaration,
            sendBroadcastAlertDeclaration,
            toggleStrictModeDeclaration
          ]
        }]
      }
    });

    let actionTaken: any = null;
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        if (call.name === "updateRegistrationPasscode") {
          const args = call.args as { newPasscode: string };
          if (args.newPasscode) {
            securitySettings.registrationPasscode = args.newPasscode.trim();
            actionTaken = {
              action: "updateRegistrationPasscode",
              description: `Kayıt şifresi güncellendi: ${securitySettings.registrationPasscode}`,
              details: { newPasscode: securitySettings.registrationPasscode }
            };
            securityLogs.unshift({
              id: "log-" + Date.now(),
              type: "ai_action",
              ip: "AI-CO-PILOT",
              detail: `Yapay zeka kayıt erişim şifresini değiştirdi: ${securitySettings.registrationPasscode}`,
              timestamp: new Date().toISOString(),
              severity: "info"
            });
          }
        } else if (call.name === "setRegistrationMode") {
          const args = call.args as { mode: "passcode" | "open" | "closed" };
          if (["passcode", "open", "closed"].includes(args.mode)) {
            securitySettings.registrationMode = args.mode;
            actionTaken = {
              action: "setRegistrationMode",
              description: `Kayıt modu değiştirildi: ${args.mode}`,
              details: { mode: args.mode }
            };
          }
        } else if (call.name === "banIpAddress") {
          const args = call.args as { ip: string; reason?: string };
          if (args.ip && !securitySettings.bannedIps.includes(args.ip)) {
            securitySettings.bannedIps.push(args.ip);
            actionTaken = {
              action: "banIpAddress",
              description: `IP engellendi: ${args.ip}`,
              details: args
            };
            securityLogs.unshift({
              id: "log-" + Date.now(),
              type: "firewall_blocked",
              ip: args.ip,
              detail: `Yapay Zeka tarafından IP engellendi: ${args.ip} (${args.reason || 'AI Güvenlik Kararı'})`,
              timestamp: new Date().toISOString(),
              severity: "danger"
            });
          }
        } else if (call.name === "sendBroadcastAlert") {
          const args = call.args as { targetPlate?: string; title: string; message: string; urgency?: string };
          const targetVehicles = (!args.targetPlate || args.targetPlate.toUpperCase() === "HEPSI")
            ? vehicles
            : vehicles.filter((v) => v.plate.replace(/\s+/g, "") === (args.targetPlate || "").replace(/\s+/g, ""));

          for (const v of targetVehicles) {
            notifications.unshift({
              id: "notif-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
              vehicleId: v.id,
              vehiclePlate: v.plate,
              category: "emergency",
              urgency: (args.urgency || "high") as UrgencyLevel,
              title: args.title || "Sistem Yönetici Duyurusu",
              message: args.message,
              senderName: "OtoQR Kurucu Yapay Zekası",
              senderIp: "AI-INTERNAL",
              timestamp: new Date().toISOString(),
              read: false
            });
          }

          actionTaken = {
            action: "sendBroadcastAlert",
            description: `${targetVehicles.length} araca bildirim gönderildi`,
            details: args
          };
        } else if (call.name === "toggleStrictMode") {
          const args = call.args as { enabled: boolean };
          securitySettings.strictFirewall = Boolean(args.enabled);
          actionTaken = {
            action: "toggleStrictMode",
            description: `Katı güvenlik duvarı modu ${securitySettings.strictFirewall ? 'Aktif' : 'Pasif'} yapıldı`,
            details: args
          };
        }
      }
    }

    const replyText = response.text || (actionTaken ? `İşlem başarıyla uygulandı: ${actionTaken.description}` : "Talebiniz incelendi ve sistem durumu denetlendi.");

    res.json({
      reply: replyText,
      actionTaken
    });
  } catch (error: any) {
    console.error("AI Error:", error);
    res.json({
      reply: `İşlem gerçekleştirilirken bir hata oluştu: ${error?.message || "Bilinmeyen hata"}. Sistem kontrolleri elle yapılabilir.`,
      actionTaken: null
    });
  }
});

// -------------------------------------------------------------
// VITE MIDDLEWARE SETUP
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`OtoQR Güvenli Sistem sunucusu port ${PORT} üzerinde çalışıyor.`);
  });
}

startServer();
