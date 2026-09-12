export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Vehicle {
  id: string;
  code: string; // Unique QR slug / short-code e.g. "TR-34ABC78"
  plate: string;
  brandModel: string;
  color: string;
  ownerName: string;
  phone: string;
  note: string;
  // Privacy Controls requested by user ("araç plakası numara falan istersem görünsün")
  showPlate: boolean;
  showPhone: boolean;
  allowDirectCall: boolean;
  allowWhatsApp: boolean;
  emergencyContact?: string;
  secretKey: string; // Key for owner to manage this car
  createdAt: string;
}

export type NotificationCategory =
  | 'park_block'     // Çıkış kapalı / hatalı park
  | 'window_open'    // Cam açık
  | 'lights_on'      // Far açık / akü
  | 'alarm'          // Alarm çalıyor
  | 'tow_truck'      // Çekici / Ceza
  | 'scratch_impact' // Temas / hasar
  | 'emergency'      // Acil durum
  | 'custom';        // Diğer

export interface IncidentNotification {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  category: NotificationCategory;
  urgency: UrgencyLevel;
  title: string;
  message: string;
  senderName?: string;
  senderPhone?: string;
  senderIp: string;
  photoUrl?: string;
  timestamp: string;
  read: boolean;
  ownerReply?: {
    text: string;
    repliedAt: string;
  };
}

export type RegistrationMode = 'passcode' | 'open' | 'closed';

export interface SecuritySettings {
  registrationMode: RegistrationMode;
  registrationPasscode: string; // "başkalarının kaydı için şifre koy"
  strictFirewall: boolean;      // "güvenlik duvarı koy"
  maxScansPerMinute: number;
  bannedIps: string[];
  rateLimitAttempts: number;
  twoFactorEnabled: boolean;    // "çift aşamalı kimlik doğrulama özelliği"
  twoFactorSecret: string;
  backupCodes: string[];
}

export interface SecurityLog {
  id: string;
  type:
    | 'login_success'
    | 'login_failed'
    | '2fa_success'
    | '2fa_failed'
    | 'firewall_blocked'
    | 'rate_limit_exceeded'
    | 'reg_passcode_failed'
    | 'reg_success'
    | 'alert_sent'
    | 'ai_action';
  ip: string;
  detail: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'danger';
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actionTaken?: {
    action: string;
    description: string;
    details?: any;
  };
}

export interface PublicVehicleView {
  id: string;
  code: string;
  plate: string | null;
  brandModel: string;
  color: string;
  note: string;
  showPlate: boolean;
  showPhone: boolean;
  allowDirectCall: boolean;
  allowWhatsApp: boolean;
  phone: string | null; // Only populated if showPhone === true
}
