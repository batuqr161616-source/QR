import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  KeyRound,
  Bot,
  Terminal,
  Send,
  Sparkles,
  Users,
  Car,
  AlertTriangle,
  Radio,
  FileText,
  Ban,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Sliders,
  Copy,
  Info,
  Flame,
  Volume2
} from 'lucide-react';
import { SecuritySettings, SecurityLog, Vehicle, AIChatMessage } from '../types.ts';
import { playAlertSound } from '../lib/qrHelper.ts';

interface FounderAdminProps {
  onVehicleListChange?: () => void;
}

export const FounderAdmin: React.FC<FounderAdminProps> = ({ onVehicleListChange }) => {
  // Auth state
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return sessionStorage.getItem('otoqr_founder_token');
  });

  // Login steps (Step 1: Password, Step 2: 2FA)
  const [step, setStep] = useState<'password' | '2fa'>('password');
  const [password, setPassword] = useState('');
  const [temp2FAToken, setTemp2FAToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [demo2FAHelper, setDemo2FAHelper] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  // Active sub-tab inside Founder Hub
  const [activeTab, setActiveTab] = useState<'ai_copilot' | 'firewall' | 'logs' | 'broadcast' | 'vehicles'>('ai_copilot');

  // Security data
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([
    {
      id: 'ai-init',
      role: 'assistant',
      content: 'Merhaba Kurucu Yönetici! Ben OtoQR sistemini tam yetkiyle yönetebilen yapay zeka yöneticisiyim. Güvenlik duvarı kurallarını güncelleyebilir, kayıt şifresini değiştirebilir, araç bildirimlerini analiz edebilir veya şüpheli IP adreslerini engelleyebilirim. Ne yapmak istersiniz?',
      timestamp: new Date().toISOString()
    }
  ]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiProcessing, setAiProcessing] = useState(false);

  // Broadcast state
  const [broadcastTarget, setBroadcastTarget] = useState('HEPSI');
  const [broadcastTitle, setBroadcastTitle] = useState('Sistem Yönetici Bildirimi');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastUrgency, setBroadcastUrgency] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  // Firewall edit form state
  const [newRegPasscode, setNewRegPasscode] = useState('');
  const [regMode, setRegMode] = useState<'passcode' | 'open' | 'closed'>('passcode');
  const [strictFirewall, setStrictFirewall] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [newBanIp, setNewBanIp] = useState('');
  const [banReason, setBanReason] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Check existing session
  useEffect(() => {
    if (sessionToken) {
      fetchFounderData(sessionToken);
    }
  }, [sessionToken]);

  const fetchFounderData = async (token = sessionToken) => {
    if (!token) return;
    setLoadingData(true);
    try {
      // 1. Settings
      const setRes = await fetch('/api/security/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (setRes.status === 401) {
        handleLogout();
        return;
      }
      const setData = await setRes.json();
      if (setData.settings) {
        setSettings(setData.settings);
        setNewRegPasscode(setData.settings.registrationPasscode);
        setRegMode(setData.settings.registrationMode);
        setStrictFirewall(setData.settings.strictFirewall);
        setTwoFactorEnabled(setData.settings.twoFactorEnabled);
      }

      // 2. Logs
      const logsRes = await fetch('/api/security/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const logsData = await logsRes.json();
      if (logsData.logs) setLogs(logsData.logs);

      // 3. Vehicles
      const vehRes = await fetch('/api/vehicles', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const vehData = await vehRes.json();
      if (vehData.vehicles) setVehicles(vehData.vehicles);
    } catch (err) {
      console.error('Error loading founder data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  // STEP 1: PASSWORD LOGIN
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthenticating(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/founder-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Giriş başarısız.');
      }

      if (data.twoFactorRequired) {
        setTemp2FAToken(data.tempToken);
        setDemo2FAHelper(data.demoHelperCode || '');
        setStep('2fa');
      } else {
        // 2FA disabled by settings, logged in directly
        setSessionToken(data.token);
        sessionStorage.setItem('otoqr_founder_token', data.token);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Giriş başarısız.');
    } finally {
      setAuthenticating(false);
    }
  };

  // STEP 2: 2FA TOTP VERIFICATION
  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthenticating(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/founder-verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken: temp2FAToken,
          code: twoFactorCode.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '2FA doğrulaması başarısız.');
      }

      playAlertSound('success');
      setSessionToken(data.token);
      sessionStorage.setItem('otoqr_founder_token', data.token);
      fetchFounderData(data.token);
    } catch (err: any) {
      setAuthError(err.message || '2FA doğrulama kodu geçersiz.');
    } finally {
      setAuthenticating(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('otoqr_founder_token');
    setSessionToken(null);
    setStep('password');
    setPassword('');
    setTwoFactorCode('');
    setAuthError(null);
  };

  // SEND AI PROMPT TO GEMINI
  const handleSendAiPrompt = async (e?: React.FormEvent, preset?: string) => {
    if (e) e.preventDefault();
    const messageToSend = preset || aiPrompt;
    if (!messageToSend.trim() || aiProcessing) return;

    const userMsg: AIChatMessage = {
      id: 'usr-' + Date.now(),
      role: 'user',
      content: messageToSend.trim(),
      timestamp: new Date().toISOString()
    };

    setAiMessages((prev) => [...prev, userMsg]);
    setAiPrompt('');
    setAiProcessing(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ message: messageToSend })
      });

      const data = await res.json();
      const aiMsg: AIChatMessage = {
        id: 'ai-' + Date.now(),
        role: 'assistant',
        content: data.reply || 'İşlem tamamlandı.',
        timestamp: new Date().toISOString(),
        actionTaken: data.actionTaken
      };

      setAiMessages((prev) => [...prev, aiMsg]);
      playAlertSound('beep');

      // Refresh system data if AI took administrative action
      if (data.actionTaken) {
        fetchFounderData();
        if (onVehicleListChange) onVehicleListChange();
      }
    } catch (err) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: 'Yapay zeka ile iletişim kurulurken bir ağ hatası oluştu.',
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setAiProcessing(false);
    }
  };

  // SAVE FIREWALL SETTINGS
  const handleSaveFirewall = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/security/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          registrationPasscode: newRegPasscode.trim(),
          registrationMode: regMode,
          strictFirewall,
          twoFactorEnabled
        })
      });
      const data = await res.json();
      if (res.ok) {
        playAlertSound('success');
        setSettings(data.settings);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        fetchFounderData();
      }
    } catch (err) {
      alert('Ayarlar kaydedilemedi.');
    }
  };

  // BAN IP
  const handleBanIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBanIp.trim()) return;
    try {
      const res = await fetch('/api/security/ban-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ ip: newBanIp.trim(), reason: banReason.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setNewBanIp('');
        setBanReason('');
        fetchFounderData();
      }
    } catch (err) {
      alert('IP engellenemedi.');
    }
  };

  // UNBAN IP
  const handleUnbanIp = async (ip: string) => {
    try {
      await fetch('/api/security/unban-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ ip })
      });
      fetchFounderData();
    } catch (err) {
      alert('Engel kaldırılamadı.');
    }
  };

  // SEND BROADCAST NOTIFICATION
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    setBroadcasting(true);
    setBroadcastSuccess(false);

    try {
      // Use AI executive endpoint or direct loop
      await handleSendAiPrompt(
        undefined,
        `Tüm araçlara şu duyuruyu gönder: Başlık: "${broadcastTitle}", Mesaj: "${broadcastMessage}", Aciliyet: "${broadcastUrgency}", Hedef: "${broadcastTarget}"`
      );
      setBroadcastSuccess(true);
      setBroadcastMessage('');
      playAlertSound('success');
      setTimeout(() => setBroadcastSuccess(false), 4000);
    } catch (err) {
      alert('Bildirim gönderilemedi.');
    } finally {
      setBroadcasting(false);
    }
  };

  // -------------------------------------------------------------
  // RENDER LOGIN SCREEN (PASSWORD + 2FA)
  // -------------------------------------------------------------
  if (!sessionToken) {
    return (
      <div className="max-w-md mx-auto my-8 px-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7" />
          </div>

          <h2 className="text-2xl font-black text-center text-slate-100 mb-1">
            Kurucu Yönetim Paneli
          </h2>
          <p className="text-xs text-center text-slate-400 mb-6">
            Yapay Zeka, Güvenlik Duvarı ve 2FA Yetkili Girişi
          </p>

          {authError && (
            <div className="mb-5 p-3.5 bg-red-950/60 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {step === 'password' ? (
            /* STEP 1: PASSWORD FORM */
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="admin-pwd" className="block text-xs font-semibold text-slate-300 mb-1">
                  Kurucu Şifresi
                </label>
                <input
                  type="password"
                  id="admin-pwd"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Yönetici şifrenizi girin..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Varsayılan kurucu şifresi: <code className="text-slate-300 font-mono">kurucu123</code>
                </p>
              </div>

              <button
                type="submit"
                disabled={authenticating || !password}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {authenticating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>1. Aşamayı Doğrula</span>
                    <KeyRound className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* STEP 2: 2FA TOTP AUTHENTICATION FORM */
            <form onSubmit={handle2FASubmit} className="space-y-5">
              <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Çift Aşamalı Kimlik Doğrulama (2FA)</span>
                </div>
                <p className="text-slate-300">
                  Authenticator uygulamanızdaki veya acil durum yedek listenizdeki 6 haneli kodu giriniz.
                </p>
              </div>

              {/* Demo Helper box for testing convenience */}
              {demo2FAHelper && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center">
                  <span className="text-[11px] text-slate-400 block mb-1">
                    Canlı Üretilen 2FA Test Kodu:
                  </span>
                  <div className="font-mono font-black text-2xl tracking-widest text-emerald-400">
                    {demo2FAHelper}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTwoFactorCode(demo2FAHelper)}
                    className="text-[11px] text-emerald-400 hover:underline mt-1 cursor-pointer"
                  >
                    Kodu Otomatik Yapıştır
                  </button>
                </div>
              )}

              <div>
                <label htmlFor="2fa-code" className="block text-xs font-semibold text-slate-300 mb-1">
                  6 Haneli Güvenlik Kodu
                </label>
                <input
                  type="text"
                  id="2fa-code"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest text-slate-100 focus:outline-none focus:border-emerald-500"
                  autoFocus
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('password');
                    setTwoFactorCode('');
                  }}
                  className="w-1/3 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  disabled={authenticating || twoFactorCode.length < 6}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {authenticating ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Paneli Aç</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER AUTHENTICATED FOUNDER HUB
  // -------------------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2.5">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
              Kurucu Yönetim Merkezi
            </h1>
            <span className="text-xs bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 px-2.5 py-0.5 rounded-full font-bold">
              2FA Doğrulandı
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Yapay zeka otonom yönetim, kayıt güvenlik duvarı ve acil durum kontrol merkezi
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchFounderData()}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition text-xs flex items-center gap-1.5"
            title="Verileri Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
          <button
            onClick={handleLogout}
            className="py-2 px-3 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/40 transition text-xs font-semibold flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('ai_copilot')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'ai_copilot'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>🤖 Her Şeyi Yönetebilen Yapay Zeka</span>
        </button>

        <button
          onClick={() => setActiveTab('firewall')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'firewall'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>🛡️ Güvenlik Duvarı & Kayıt Şifresi</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>📜 Güvenlik Günlüğü ({logs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('broadcast')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'broadcast'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>📢 Sistemden Güvenli Bildirim Gönderme</span>
        </button>

        <button
          onClick={() => setActiveTab('vehicles')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'vehicles'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
        >
          <Car className="w-4 h-4" />
          <span>🚗 Araçlar ({vehicles.length})</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: AI CO-PILOT (HER ŞEYİ YÖNETEBİLEN YAPAY ZEKA)           */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'ai_copilot' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Chat Stream (8 cols) */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col h-[600px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-200">Gemini 3.8 Flash Yönetici Co-Pilot</span>
              </div>
              <span className="text-[11px] text-slate-400">Otonom Sistem Yetkilisi</span>
            </div>

            {/* Message History */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
              {aiMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 text-sm ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-tr-none'
                        : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-xs sm:text-sm">{msg.content}</p>

                    {/* Show structured action taken badge */}
                    {msg.actionTaken && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Gerçekleştirilen Eylem: {msg.actionTaken.description}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {aiProcessing && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 p-2">
                  <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                  <span>Yapay Zeka sistemi analiz ediyor ve işlem yürütüyor...</span>
                </div>
              )}
            </div>

            {/* Prompt Input Form */}
            <form onSubmit={(e) => handleSendAiPrompt(e)} className="mt-3 pt-3 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Yapay zekaya talimat verin (örn: 'Kayıt şifresini OTO-2026 yap', 'IP 185.220.101.5 engelle')..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={aiProcessing || !aiPrompt.trim()}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Çalıştır</span>
              </button>
            </form>
          </div>

          {/* Quick Action Commands & System Status (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Hızlı Yapay Zeka Komutları
              </h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleSendAiPrompt(undefined, 'Sistem güvenlik kayıtlarını ve şüpheli hareketleri denetle, güvenlik raporu hazırla.')}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition"
                >
                  🔍 Güvenlik kayıtlarını tara & raporla
                </button>
                <button
                  type="button"
                  onClick={() => handleSendAiPrompt(undefined, 'Kayıt şifresini "VIP-GUVENLIK-2026" olarak güncelle ve katı güvenlik duvarını aç.')}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition"
                >
                  🛡️ Kayıt şifresini ve katı modu yenile
                </button>
                <button
                  type="button"
                  onClick={() => handleSendAiPrompt(undefined, 'Gelen tüm park ve acil durum bildirimlerini özetle, kritik durum var mı analiz et.')}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition"
                >
                  📊 Bildirimleri ve park şikayetlerini özetle
                </button>
                <button
                  type="button"
                  onClick={() => handleSendAiPrompt(undefined, 'Tüm araç sahiplerine "Bina otoparkında periyodik temizlik yapılacaktır, lütfen dikkat ediniz" başlıklı duyuru gönder.')}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition"
                >
                  📢 Otopark temizlik duyurusu gönder
                </button>
              </div>
            </div>

            {/* Quick Live Stats Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl text-xs space-y-2.5">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider mb-2">
                Anlık Sistem Durumu
              </h3>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Aktif Kayıt Şifresi:</span>
                <span className="font-mono font-bold text-emerald-400">{settings?.registrationPasscode}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Kayıt Modu:</span>
                <span className="font-semibold text-slate-200">
                  {settings?.registrationMode === 'passcode' ? '🔒 Şifreli Giriş' : settings?.registrationMode === 'open' ? 'Açık' : 'Kapalı'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Güvenlik Duvarı:</span>
                <span className="text-emerald-400 font-semibold">{settings?.strictFirewall ? 'Aktif (Katı)' : 'Standart'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">2FA Doğrulama:</span>
                <span className="text-emerald-400 font-semibold">{settings?.twoFactorEnabled ? 'Zorunlu' : 'Kapalı'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Engellenen IP'ler:</span>
                <span className="text-red-400 font-bold">{settings?.bannedIps?.length || 0} adet</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: FIREWALL & REGISTRATION PASSCODE (GÜVENLİK DUVARI)     */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'firewall' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleSaveFirewall} className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                Güvenlik Duvarı ve Kayıt Yetkilendirme
              </h2>
              {saveSuccess && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ayarlar Kaydedildi!
                </span>
              )}
            </div>

            {/* Requirement: "başkalarının kaydı için şifre koy" */}
            <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
              <label htmlFor="gatekeeper-code" className="block text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Başkalarının Kaydı İçin Güvenlik Şifresi
              </label>
              <p className="text-xs text-slate-400">
                Yeni bir aracın sisteme kaydedilebilmesi için kullanıcının bu şifreyi girmesi zorunludur.
              </p>
              <input
                type="text"
                id="gatekeeper-code"
                value={newRegPasscode}
                onChange={(e) => setNewRegPasscode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 font-mono text-base font-bold text-slate-100 focus:outline-none focus:border-emerald-500 tracking-wider"
                required
              />
            </div>

            {/* Registration Mode Radio */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Kayıt Kabul Güvenlik Modu
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRegMode('passcode')}
                  className={`p-3 rounded-xl border text-xs font-bold transition text-center ${
                    regMode === 'passcode'
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  🔒 Şifre Korumalı
                </button>
                <button
                  type="button"
                  onClick={() => setRegMode('open')}
                  className={`p-3 rounded-xl border text-xs font-bold transition text-center ${
                    regMode === 'open'
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  🌐 Herkese Açık
                </button>
                <button
                  type="button"
                  onClick={() => setRegMode('closed')}
                  className={`p-3 rounded-xl border text-xs font-bold transition text-center ${
                    regMode === 'closed'
                      ? 'bg-red-600 text-white border-red-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  ⛔ Kayıtlara Kapalı
                </button>
              </div>
            </div>

            {/* Strict Firewall Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-950/80 rounded-2xl border border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Katı Güvenlik Duvarı & Zararlı Kod Filtresi (WAF)
                </div>
                <div className="text-xs text-slate-400">
                  SQL injection, XSS ve şüpheli istekleri otomatik engeller
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStrictFirewall(!strictFirewall)}
                className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition ${
                  strictFirewall ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md" />
              </button>
            </div>

            {/* 2FA Toggle for Admin Panel */}
            <div className="flex items-center justify-between p-4 bg-slate-950/80 rounded-2xl border border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Yönetici Paneline Çift Aşamalı Doğrulama (2FA)
                </div>
                <div className="text-xs text-slate-400">
                  Girişlerde 6 haneli TOTP kodunu zorunlu kılar
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
                className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition ${
                  twoFactorEnabled ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md" />
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition shadow cursor-pointer text-sm"
            >
              Güvenlik Duvarı Ayarlarını Kaydet
            </button>
          </form>

          {/* Blacklist IP Management Column (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-400" />
                IP Adresi Engelleme (Kara Liste)
              </h3>
              <form onSubmit={handleBanIp} className="space-y-3 mb-4">
                <input
                  type="text"
                  value={newBanIp}
                  onChange={(e) => setNewBanIp(e.target.value)}
                  placeholder="Engellenecek IP (örn: 195.175.20.10)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-red-500"
                />
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Engelleme nedeni (isteğe bağlı)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-red-500"
                />
                <button
                  type="submit"
                  disabled={!newBanIp.trim()}
                  className="w-full py-2 px-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition"
                >
                  IP'yi Güvenlik Duvarında Engelle
                </button>
              </form>

              {/* Banned IPs list */}
              <div className="space-y-2">
                <div className="text-xs text-slate-400 font-semibold mb-1">
                  Engellenen IP Listesi ({settings?.bannedIps?.length || 0}):
                </div>
                {settings?.bannedIps?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Şu anda engellenmiş IP bulunmuyor.</p>
                ) : (
                  settings?.bannedIps?.map((ip) => (
                    <div
                      key={ip}
                      className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-red-950 text-xs"
                    >
                      <span className="font-mono text-red-300 font-semibold">{ip}</span>
                      <button
                        onClick={() => handleUnbanIp(ip)}
                        className="text-[11px] text-slate-400 hover:text-slate-100 hover:underline"
                      >
                        Engeli Kaldır
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: AUDIT LOGS (GÜVENLİK GÜNLÜĞÜ)                          */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'logs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-emerald-400" />
                Güvenlik Duvarı ve Erişim Olay Günlüğü
              </h2>
              <p className="text-xs text-slate-400">
                Başarılı/başarısız 2FA girişleri, WAF engelleri ve bildirim gönderimleri
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">{logs.length} Olay Kaydı</span>
          </div>

          <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">Kayıtlı olay yok.</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    log.severity === 'danger'
                      ? 'bg-red-950/40 border-red-500/30 text-red-200'
                      : log.severity === 'warning'
                      ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                      : 'bg-slate-950/70 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-2.5">
                    {log.severity === 'danger' ? (
                      <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5 sm:mt-0" />
                    ) : log.severity === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                    )}
                    <div>
                      <span className="font-semibold text-slate-100 block sm:inline mr-2">
                        [{log.type.toUpperCase()}]:
                      </span>
                      <span>{log.detail}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[11px] text-slate-400 font-mono">
                    <span>IP: {log.ip}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString('tr-TR')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: BROADCAST (SİSTEMDEN GÜVENLİ BİLDİRİM GÖNDERME)         */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'broadcast' && (
        <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Sistemden Güvenli Bildirim Gönderme
              </h2>
              <p className="text-xs text-slate-400">
                Kurucu olarak tüm araçlara veya belirli bir araca anında şifreli duyuru/uyarı iletin
              </p>
            </div>
          </div>

          {broadcastSuccess && (
            <div className="my-4 p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl flex items-center gap-2 text-xs text-emerald-300 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Duyuru / bildirim araç sahiplerinin ekranlarına anında ulaştırıldı!</span>
            </div>
          )}

          <form onSubmit={handleSendBroadcast} className="space-y-4 mt-5">
            <div>
              <label htmlFor="broadcast-target" className="block text-xs font-semibold text-slate-300 mb-1">
                Hedef Araç / Kitle
              </label>
              <select
                id="broadcast-target"
                value={broadcastTarget}
                onChange={(e) => setBroadcastTarget(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="HEPSI">📢 TÜM ARAÇ SAHİPLERİ ({vehicles.length} Araç)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.plate}>
                    🚗 {v.plate} ({v.ownerName} - {v.brandModel})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="broadcast-title" className="block text-xs font-semibold text-slate-300 mb-1">
                Bildirim Başlığı
              </label>
              <input
                type="text"
                id="broadcast-title"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="Örn: Otopark Bakım & Güvenlik Uyarısı"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label htmlFor="broadcast-urgency" className="block text-xs font-semibold text-slate-300 mb-1">
                Öncelik / Aciliyet Seviyesi
              </label>
              <select
                id="broadcast-urgency"
                value={broadcastUrgency}
                onChange={(e) => setBroadcastUrgency(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="low">Normal Bilgilendirme</option>
                <option value="medium">Önemli</option>
                <option value="high">Yüksek Öncelikli Acil Bildirim</option>
                <option value="critical">🚨 Hayati / Kritik Alarm</option>
              </select>
            </div>

            <div>
              <label htmlFor="broadcast-msg" className="block text-xs font-semibold text-slate-300 mb-1">
                Mesaj Metni
              </label>
              <textarea
                id="broadcast-msg"
                rows={4}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Araç sahiplerine iletilecek resmi duyuruyu yazınız..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={broadcasting || !broadcastMessage.trim()}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition shadow cursor-pointer text-sm"
            >
              {broadcasting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Güvenli Sistem Bildirimini Yayınla</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 5: REGISTERED VEHICLES LIST                                */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'vehicles' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Car className="w-5 h-5 text-emerald-400" />
              Sistemdeki Kayıtlı Araçlar ({vehicles.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-sm bg-blue-900/60 text-blue-200 border border-blue-700/50 px-2.5 py-0.5 rounded">
                    {v.plate}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">Kod: {v.code}</span>
                </div>

                <div className="text-slate-300">
                  <span className="text-slate-500">Araç: </span>
                  <span className="font-semibold text-slate-200">{v.brandModel}</span> ({v.color})
                </div>

                <div className="text-slate-300">
                  <span className="text-slate-500">Sahibi: </span>
                  <span className="font-semibold text-slate-200">{v.ownerName}</span> ({v.phone})
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className={`px-2 py-0.5 rounded ${v.showPhone ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    {v.showPhone ? 'Telefon Açık' : 'Telefon Maskeli/Gizli'}
                  </span>
                  <span className={`px-2 py-0.5 rounded ${v.showPlate ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    {v.showPlate ? 'Plaka Görünür' : 'Plaka Gizli'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
