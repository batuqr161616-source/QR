import React, { useState, useEffect } from 'react';
import {
  Car,
  ShieldCheck,
  ShieldAlert,
  Phone,
  MessageSquare,
  AlertTriangle,
  Lightbulb,
  Bell,
  Truck,
  EyeOff,
  Eye,
  Send,
  Camera,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Sparkles,
  Info,
  Radio
} from 'lucide-react';
import { PublicVehicleView, NotificationCategory, UrgencyLevel, IncidentNotification } from '../types.ts';
import { playAlertSound } from '../lib/qrHelper.ts';

interface ScannerPanelProps {
  vehicleCode: string;
  onBackToHome?: () => void;
}

const QUICK_CATEGORIES: {
  id: NotificationCategory;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultUrgency: UrgencyLevel;
  presetText: string;
  color: string;
}[] = [
  {
    id: 'park_block',
    label: 'Hatalı Park / Yol Kapalı',
    sub: 'Aracınız çıkışımı veya yolu kapatıyor',
    icon: Car,
    defaultUrgency: 'high',
    presetText: 'Merhaba, aracınız çıkışımı/yolu kapatmış durumda. Lütfen aracı çekebilir misiniz?',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:border-amber-500/60'
  },
  {
    id: 'window_open',
    label: 'Cam Açık / Kırık',
    sub: 'Aracınızın camı açık unutulmuş',
    icon: AlertTriangle,
    defaultUrgency: 'medium',
    presetText: 'Aracınızın camı açık kalmış, yağmur veya hırsızlık riski nedeniyle bilgi vermek istedim.',
    color: 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:border-sky-500/60'
  },
  {
    id: 'lights_on',
    label: 'Farlar Açık Unutulmuş',
    sub: 'Farlarınız yanıyor, akü bitebilir',
    icon: Lightbulb,
    defaultUrgency: 'medium',
    presetText: 'Aracınızın farları/park lambaları açık kalmış, akünüz bitebilir.',
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:border-yellow-500/60'
  },
  {
    id: 'tow_truck',
    label: 'Çekici / Ceza Uyarısı',
    sub: 'Trafik polisi veya çekici geldi',
    icon: Truck,
    defaultUrgency: 'critical',
    presetText: 'Acil: Bulunduğunuz yere çekici/trafik polisi geldi, aracınız çekilmek üzere veya ceza yazılıyor!',
    color: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:border-rose-500/60'
  },
  {
    id: 'alarm',
    label: 'Alarm Çalıyor',
    sub: 'Aracınızın alarmı susmuyor',
    icon: Bell,
    defaultUrgency: 'medium',
    presetText: 'Aracınızın alarmı çalıyor, etrafta rahatsızlık yaratıyor veya darbe almış olabilir.',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:border-purple-500/60'
  },
  {
    id: 'scratch_impact',
    label: 'Temas / Hasar Meydana Geldi',
    sub: 'Araca temas veya sürtme oldu',
    icon: ShieldAlert,
    defaultUrgency: 'high',
    presetText: 'Aracınıza başka bir araç temas etti veya sürtme oluştu. Durumu bildirmek için ulaşıyorum.',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:border-orange-500/60'
  },
  {
    id: 'emergency',
    label: 'Hayati / Acil Durum',
    sub: 'Önemli ve acil müdahale gerekiyor',
    icon: AlertTriangle,
    defaultUrgency: 'critical',
    presetText: 'Acil durum: Aracınızla ilgili hayati/güvenlik gerektiren bir durum var, lütfen ivedilikle gelin.',
    color: 'bg-red-500/20 text-red-300 border-red-500/50 hover:border-red-500/80'
  }
];

export const ScannerPanel: React.FC<ScannerPanelProps> = ({ vehicleCode, onBackToHome }) => {
  const [vehicle, setVehicle] = useState<PublicVehicleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>('park_block');
  const [customMessage, setCustomMessage] = useState(QUICK_CATEGORIES[0].presetText);
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [urgency, setUrgency] = useState<UrgencyLevel>('high');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Send feedback
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [createdNotificationId, setCreatedNotificationId] = useState<string | null>(null);
  const [ownerReply, setOwnerReply] = useState<{ text: string; repliedAt: string } | null>(null);

  // Fetch vehicle by code
  useEffect(() => {
    let isMounted = true;
    async function loadVehicle() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/vehicles/scan/${encodeURIComponent(vehicleCode)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Araç bilgisi yüklenemedi.');
        }
        if (isMounted) {
          setVehicle(data.vehicle);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Araç bulunamadı.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadVehicle();
    return () => {
      isMounted = false;
    };
  }, [vehicleCode]);

  // Poll for owner reply if notification was sent
  useEffect(() => {
    if (!createdNotificationId || !vehicle) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/notifications?vehicleId=${vehicle.id}`);
        const data = await res.json();
        if (data.notifications) {
          const matched = data.notifications.find((n: IncidentNotification) => n.id === createdNotificationId);
          if (matched && matched.ownerReply) {
            setOwnerReply(matched.ownerReply);
            playAlertSound('success');
            clearInterval(interval);
          }
        }
      } catch (e) {
        console.debug('Polling reply failed', e);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [createdNotificationId, vehicle]);

  const handleCategorySelect = (cat: typeof QUICK_CATEGORIES[0]) => {
    setSelectedCategory(cat.id);
    setCustomMessage(cat.presetText);
    setUrgency(cat.defaultUrgency);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Fotoğraf boyutu 5 MB altında olmalıdır.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicle || !customMessage.trim()) return;

    setSending(true);
    setError(null);

    const activeCat = QUICK_CATEGORIES.find((c) => c.id === selectedCategory);
    const title = activeCat ? activeCat.label : 'Araç Bildirimi';

    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: vehicle.id,
          category: selectedCategory,
          title,
          urgency,
          message: customMessage,
          senderName: senderName.trim() || undefined,
          senderPhone: senderPhone.trim() || undefined,
          photoUrl: photoPreview || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Bildirim gönderilemedi.');
      }

      playAlertSound('urgent');
      setSentSuccess(true);
      setCreatedNotificationId(data.notificationId);
    } catch (err: any) {
      setError(err.message || 'Gönderim başarısız.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-200">Araç Bilgileri Doğrulanıyor...</h2>
        <p className="text-sm text-slate-400 mt-1">Güvenli iletişim kanalı oluşturuluyor</p>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 bg-slate-900 border border-red-500/30 rounded-2xl text-center">
        <div className="w-14 h-14 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Araç Bulunamadı</h2>
        <p className="text-sm text-slate-400 mt-2 mb-6">
          {error || 'Bu QR koda veya koda ait kayıt sistemde bulunamadı ya da silinmiş.'}
        </p>
        {onBackToHome && (
          <button
            onClick={onBackToHome}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition"
          >
            Ana Sayfaya Dön
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-16 px-4">
      {/* Top Bar / Navigation */}
      <div className="flex items-center justify-between py-4 border-b border-slate-800 mb-6">
        <div className="flex items-center gap-2">
          {onBackToHome && (
            <button
              onClick={onBackToHome}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition border border-slate-800"
              title="Geri Dön"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded-full">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Doğrudan İletişim Portalı
          </div>
        </div>
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Güvenli & Uçtan Uca
        </span>
      </div>

      {/* Vehicle Info Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 mb-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            {/* Plate or Masked Badge */}
            {vehicle.showPlate && vehicle.plate ? (
              <div className="inline-flex items-center bg-slate-950 border-2 border-slate-700 rounded-lg overflow-hidden shadow-inner mb-2">
                <span className="bg-blue-700 text-white font-black text-xs px-2 py-1 flex flex-col items-center justify-center">
                  <span>TR</span>
                </span>
                <span className="font-mono font-extrabold text-2xl tracking-wider text-slate-100 px-3.5 py-0.5">
                  {vehicle.plate}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 bg-slate-800/80 text-amber-300 border border-amber-500/30 rounded-lg px-3 py-1.5 mb-2 text-sm font-semibold">
                <EyeOff className="w-4 h-4" />
                Gizli Plaka (Sahiplik Korumalı)
              </div>
            )}

            <div className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Car className="w-5 h-5 text-emerald-400" />
              <span>{vehicle.brandModel}</span>
              {vehicle.color && <span className="text-sm font-normal text-slate-400">({vehicle.color})</span>}
            </div>
          </div>

          {/* Privacy Status Indicators */}
          <div className="flex flex-col items-end gap-1.5 text-xs">
            {vehicle.showPhone && vehicle.phone ? (
              <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2.5 py-1 rounded-md font-medium">
                <Eye className="w-3.5 h-3.5" />
                Numara Görünür: {vehicle.phone}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400 bg-slate-800/60 border border-slate-700/60 px-2.5 py-1 rounded-md">
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                Gizlilik Modu Aktif (Numara Maskeli)
              </span>
            )}
            <span className="text-slate-500 font-mono text-[11px]">QR ID: {vehicle.code}</span>
          </div>
        </div>

        {/* Owner Note */}
        {vehicle.note && (
          <div className="mt-4 p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start gap-3">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-300">
              <span className="font-semibold text-slate-200">Araç Sahibinin Notu: </span>
              "{vehicle.note}"
            </div>
          </div>
        )}

        {/* Direct Call & WhatsApp Buttons if owner explicitly allowed */}
        {(vehicle.allowDirectCall || vehicle.allowWhatsApp) && vehicle.phone && (
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap gap-3">
            {vehicle.allowDirectCall && (
              <a
                href={`tel:${vehicle.phone.replace(/\s+/g, '')}`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-950/50 transition text-sm"
              >
                <Phone className="w-4 h-4" />
                Doğrudan Ara ({vehicle.phone})
              </a>
            )}
            {vehicle.allowWhatsApp && (
              <a
                href={`https://wa.me/9${vehicle.phone.replace(/[^0-9]/g, '')}?text=Merhaba,%20aracınız%20hakkında%20ulaşıyorum:`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 rounded-xl font-semibold transition text-sm"
              >
                <MessageSquare className="w-4 h-4" />
                WhatsApp Mesajı
              </a>
            )}
          </div>
        )}
      </div>

      {/* Success State Screen */}
      {sentSuccess ? (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 text-center shadow-2xl animate-fade-in">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-100 mb-2">Bildiriminiz Başarıyla İletildi!</h2>
          <p className="text-slate-300 text-sm max-w-md mx-auto mb-6">
            Mesajınız şifreli ve güvenli olarak araç sahibinin ekranına anlık sesli uyarı ile düşürüldü.
          </p>

          {/* Real-time Owner Reply Area */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl text-left mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                Araç Sahibi Yanıtı (Canlı Takip)
              </span>
              <span className="text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                Canlı Dinleniyor
              </span>
            </div>

            {ownerReply ? (
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl mt-2 animate-bounce-short">
                <p className="text-xs text-emerald-300 font-semibold mb-1">
                  Araç Sahibi ({new Date(ownerReply.repliedAt).toLocaleTimeString('tr-TR')}):
                </p>
                <p className="text-base text-slate-100 font-medium font-sans">
                  "{ownerReply.text}"
                </p>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 text-sm">
                <p>Araç sahibi yanıt verdiğinde bu alanda anında görünecektir.</p>
                <span className="text-xs text-slate-500">Lütfen sayfayı kapatmadan bekleyiniz...</span>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setSentSuccess(false);
              setCreatedNotificationId(null);
              setOwnerReply(null);
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline transition"
          >
            Farklı bir bildirim daha gönder
          </button>
        </div>
      ) : (
        /* Notification Dispatch Form */
        <form onSubmit={handleSendNotification} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              1. Durumu Seçin (Hızlı Bildirimler)
            </h3>
            <span className="text-xs text-slate-400">Tek dokunuşla hazır mesaj</span>
          </div>

          {/* Quick Categories Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6">
            {QUICK_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className={`text-left p-3.5 rounded-2xl border transition relative flex items-start gap-3 ${
                    isSelected
                      ? 'bg-slate-800 border-emerald-500/80 shadow-md shadow-emerald-950/30 ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl border shrink-0 ${cat.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-200 leading-snug">{cat.label}</div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{cat.sub}</div>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Message Editor */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="custom-msg" className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                2. Mesajınız & Ayrıntı
              </label>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Öncelik:</span>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 text-xs"
                >
                  <option value="low">Normal</option>
                  <option value="medium">Orta Öncelik</option>
                  <option value="high">Yüksek Aciliyet</option>
                  <option value="critical">Kritik / Çok Acil</option>
                </select>
              </div>
            </div>
            <textarea
              id="custom-msg"
              rows={3}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Araç sahibine iletmek istediğiniz mesajı yazın..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition resize-none"
              required
            />
          </div>

          {/* Optional: Sender Information (Can remain anonymous) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <div>
              <label htmlFor="sender-name" className="block text-xs font-medium text-slate-400 mb-1">
                Adınız veya Konumunuz (İsteğe Bağlı)
              </label>
              <input
                type="text"
                id="sender-name"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Örn: 2 No'lu Daire Sakini"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="sender-phone" className="block text-xs font-medium text-slate-400 mb-1">
                İletişim Numaranız (İsteğe Bağlı)
              </label>
              <input
                type="tel"
                id="sender-phone"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                placeholder="Örn: 0532 000 00 00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Photo Attachment (Parking scratch, blocking situation) */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-emerald-400" />
                Durum Fotoğrafı Ekle (İsteğe Bağlı)
              </span>
              {photoPreview && (
                <button
                  type="button"
                  onClick={() => setPhotoPreview(null)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Fotoğrafı Kaldır
                </button>
              )}
            </div>

            {photoPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-slate-700 max-h-48">
                <img src={photoPreview} alt="Durum fotoğrafı" className="w-full h-48 object-cover" />
              </div>
            ) : (
              <label
                htmlFor="photo-upload"
                className="flex items-center justify-center gap-2 border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 rounded-2xl p-4 cursor-pointer text-xs text-slate-400 hover:text-slate-300 transition"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Fotoğraf çek veya galeriden seç (Park engeli veya sürtme)</span>
                <input
                  type="file"
                  id="photo-upload"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={sending || !customMessage.trim()}
            className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Bildirim İletiliyor...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Araç Sahibine Güvenli Bildirim Gönder</span>
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-slate-500 mt-3 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Bildiriminiz sistem güvenlik duvarından geçirilerek araç sahibine derhal ulaştırılır.
          </p>
        </form>
      )}
    </div>
  );
};
