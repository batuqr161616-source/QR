import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Download,
  Printer,
  Shield,
  Eye,
  EyeOff,
  Phone,
  MessageSquare,
  Lock,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Copy,
  Car
} from 'lucide-react';
import { Vehicle } from '../types.ts';
import { generateQrDataUrl } from '../lib/qrHelper.ts';

interface QrGeneratorProps {
  onVehicleCreated?: (vehicle: Vehicle) => void;
  onOpenScanner?: (vehicleCode: string) => void;
}

type DecalTheme = 'turkish_plate' | 'dark_carbon' | 'warning_yellow' | 'classic_white';

export const QrGenerator: React.FC<QrGeneratorProps> = ({ onVehicleCreated, onOpenScanner }) => {
  // Form values
  const [plate, setPlate] = useState('34 ABC 789');
  const [brandModel, setBrandModel] = useState('Renault Megane');
  const [color, setColor] = useState('Beyaz');
  const [ownerName, setOwnerName] = useState('Batuhan Demir');
  const [phone, setPhone] = useState('0555 123 45 67');
  const [note, setNote] = useState('Acil durumda lütfen QR kodu okutun, 5 dakikada gelirim.');

  // User requested privacy toggles: "araç plakası numara falan istersem görünsün"
  const [showPlate, setShowPlate] = useState(true);
  const [showPhone, setShowPhone] = useState(false); // Default protected privacy!
  const [allowDirectCall, setAllowDirectCall] = useState(false);
  const [allowWhatsApp, setAllowWhatsApp] = useState(false);

  // User requested: "başkalarının kaydı için şifre koy"
  const [registrationPasscode, setRegistrationPasscode] = useState('');

  // Selected visual decal theme
  const [theme, setTheme] = useState<DecalTheme>('turkish_plate');

  // Generated QR output state
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [registeredVehicle, setRegisteredVehicle] = useState<Vehicle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Derive slug code
  const currentCode = registeredVehicle?.code || 'TR-' + plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const scanUrl = `${window.location.origin}/?scan=${encodeURIComponent(currentCode)}`;

  // Re-generate QR preview when plate or scanUrl changes
  useEffect(() => {
    let isCurrent = true;
    async function updateQr() {
      const qrColor = theme === 'warning_yellow' ? '#000000' : '#0f172a';
      const bg = '#ffffff';
      const url = await generateQrDataUrl(scanUrl, qrColor, bg);
      if (isCurrent) setQrDataUrl(url);
    }
    updateQr();
    return () => {
      isCurrent = false;
    };
  }, [scanUrl, theme]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/vehicles/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: plate.trim(),
          brandModel: brandModel.trim(),
          color: color.trim(),
          ownerName: ownerName.trim(),
          phone: phone.trim(),
          note: note.trim(),
          showPlate,
          showPhone,
          allowDirectCall,
          allowWhatsApp,
          registrationPasscode: registrationPasscode.trim() // Firewall registration gatekeeper
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Araç kaydedilemedi.');
      }

      setRegisteredVehicle(data.vehicle);
      setStatusMessage({
        type: 'success',
        text: 'Araç kaydı ve QR kodu başarıyla oluşturuldu! Kartınızı yazdırabilir veya indirebilirsiniz.'
      });
      if (onVehicleCreated) onVehicleCreated(data.vehicle);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Kayıt sırasında bir hata oluştu.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadDecal = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `OtoQR_${plate.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(scanUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-100 flex items-center gap-3">
          <QrCode className="w-8 h-8 text-emerald-400" />
          Araç QR Kod & Ön Cam Kartı Oluşturucu
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Aracınız için özel QR kod üretin. Tarandığında gizlilik tercihleriniz geçerli olur; plaka veya telefonunuzu
          dilediğiniz gibi gizleyebilir, doğrudan güvenli bildirim paneli sunabilirsiniz.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* FORM COLUMN (7 cols) */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-4 rounded-2xl flex items-start gap-3 text-sm ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : 'bg-red-950/60 border border-red-500/40 text-red-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{statusMessage.text}</p>
                {statusMessage.type === 'error' && statusMessage.text.includes('Kayıt') && (
                  <p className="text-xs text-red-400/80 mt-1">
                    İpucu: Varsayılan yetkili kayıt kodu <span className="font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded text-slate-100">OTO-GUVENLIK-2026</span>'dır.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Section: Vehicle Info */}
          <div>
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Car className="w-4 h-4 text-emerald-400" />
              1. Araç Bilgileri
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-plate" className="block text-xs font-semibold text-slate-300 mb-1">
                  Araç Plakası <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  id="reg-plate"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder="34 ABC 789"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 font-mono font-bold text-slate-100 focus:outline-none focus:border-emerald-500 tracking-wider uppercase"
                  required
                />
              </div>
              <div>
                <label htmlFor="reg-brand" className="block text-xs font-semibold text-slate-300 mb-1">
                  Marka & Model
                </label>
                <input
                  type="text"
                  id="reg-brand"
                  value={brandModel}
                  onChange={(e) => setBrandModel(e.target.value)}
                  placeholder="Örn: Renault Megane"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>
              <div>
                <label htmlFor="reg-color" className="block text-xs font-semibold text-slate-300 mb-1">
                  Araç Rengi
                </label>
                <input
                  type="text"
                  id="reg-color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Örn: Beyaz, Füme"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>
              <div>
                <label htmlFor="reg-owner" className="block text-xs font-semibold text-slate-300 mb-1">
                  Araç Sahibi Adı <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  id="reg-owner"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Ad Soyad"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500 text-sm"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-300 mb-1">
                  Telefon Numaranız <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="tel"
                  id="reg-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500 text-sm font-mono"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="reg-note" className="block text-xs font-semibold text-slate-300 mb-1">
                  Ön Cam / Tarama Notunuz
                </label>
                <textarea
                  id="reg-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Örn: Acil durumda mesaj atınız, 5 dakika içinde gelirim."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Section: Privacy Settings ("istersem plaka / numara görünsün") */}
          <div className="pt-3 border-t border-slate-800">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              2. Gizlilik & Görünürlük Kontrolleri
            </h2>
            <div className="space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
              {/* Show Plate Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    {showPlate ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-amber-400" />}
                    Plaka QR tarama ekranında görünsün mü?
                  </div>
                  <div className="text-xs text-slate-400">
                    {showPlate ? 'Plaka açıkça yazılır' : 'Plaka maskelenir (Sadece güvenli kod görünür)'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlate(!showPlate)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition ${
                    showPlate ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                </button>
              </div>

              {/* Show Phone Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <div>
                  <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    {showPhone ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-amber-400" />}
                    Telefon numaram doğrudan görünsün mü?
                  </div>
                  <div className="text-xs text-slate-400">
                    {showPhone
                      ? 'Telefon numaranız tarayan kişiye doğrudan gösterilir'
                      : 'Gizli Kalır: Tarayan sadece sistem üzerinden doğrudan mesaj atabilir'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !showPhone;
                    setShowPhone(nextVal);
                    if (!nextVal) {
                      setAllowDirectCall(false);
                      setAllowWhatsApp(false);
                    }
                  }}
                  className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition ${
                    showPhone ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                </button>
              </div>

              {/* Direct call / WhatsApp options if phone is visible */}
              {showPhone && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 p-2.5 rounded-xl border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowDirectCall}
                      onChange={(e) => setAllowDirectCall(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Doğrudan Arama Butonu Ekle</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 p-2.5 rounded-xl border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowWhatsApp}
                      onChange={(e) => setAllowWhatsApp(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>WhatsApp Mesaj Butonu Ekle</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Section: Registration Security Passcode ("başkalarının kaydı için şifre koy") */}
          <div className="pt-3 border-t border-slate-800">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              3. Kayıt Güvenlik Duvarı Şifresi
            </h2>
            <p className="text-xs text-slate-400 mb-2">
              Sistem yöneticisinin başkalarının yetkisiz kayıt oluşturmasını engellemek için belirlediği güvenlik şifresini girin.
            </p>
            <div className="relative">
              <input
                type="text"
                value={registrationPasscode}
                onChange={(e) => setRegistrationPasscode(e.target.value)}
                placeholder="Örn: OTO-GUVENLIK-2026"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 font-mono text-sm text-slate-100 focus:outline-none focus:border-emerald-500 tracking-wider"
                required
              />
              <span className="absolute right-3 top-2.5 text-[11px] text-slate-500 font-mono">
                Yetkili Şifre Gerekli
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Güvenlik Duvarı Doğrulanıyor...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Aracı Kaydet & QR Kodu Aktifleştir</span>
              </>
            )}
          </button>
        </form>

        {/* PREVIEW & PRINT COLUMN (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Theme Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
              Kart Tasarım Şablonu
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTheme('turkish_plate')}
                className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition ${
                  theme === 'turkish_plate'
                    ? 'bg-slate-800 border-blue-500 text-blue-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                🇹🇷 TR Plaka Teması
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark_carbon')}
                className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition ${
                  theme === 'dark_carbon'
                    ? 'bg-slate-800 border-emerald-500 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                ⬛ Karanlık Carbon
              </button>
              <button
                type="button"
                onClick={() => setTheme('warning_yellow')}
                className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition ${
                  theme === 'warning_yellow'
                    ? 'bg-slate-800 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                ⚠️ Dikkat / Reflektör
              </button>
              <button
                type="button"
                onClick={() => setTheme('classic_white')}
                className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition ${
                  theme === 'classic_white'
                    ? 'bg-slate-800 border-slate-400 text-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                📄 Klasik Beyaz
              </button>
            </div>
          </div>

          {/* WINDSHIELD CARD DECAL PREVIEW (Printable Element) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Ön Cam Kartı Önizlemesi
              </span>
              <span className="text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                1:1 Oranlı Hazır
              </span>
            </div>

            {/* The actual Decal / Card Container */}
            <div
              ref={printAreaRef}
              className={`rounded-2xl p-5 border-2 shadow-2xl transition overflow-hidden text-center ${
                theme === 'turkish_plate'
                  ? 'bg-gradient-to-b from-slate-950 to-slate-900 border-blue-600 text-white'
                  : theme === 'dark_carbon'
                  ? 'bg-slate-950 border-emerald-600/80 text-white'
                  : theme === 'warning_yellow'
                  ? 'bg-amber-400 border-amber-600 text-black'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              {/* Header Badge */}
              <div
                className={`py-1 px-3 rounded-lg text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 mb-3 ${
                  theme === 'warning_yellow'
                    ? 'bg-black text-amber-300'
                    : 'bg-blue-700 text-white'
                }`}
              >
                <span>PARK ENGELİ & ACİL DURUM</span>
              </div>

              <h4 className="text-sm font-bold leading-tight mb-1">
                LÜTFEN QR KODU OKUTUN
              </h4>
              <p
                className={`text-[11px] mb-4 ${
                  theme === 'warning_yellow'
                    ? 'text-slate-900 font-medium'
                    : theme === 'classic_white'
                    ? 'text-slate-600'
                    : 'text-slate-400'
                }`}
              >
                Aracımı çekmem veya acil bildirim için kameranızla tarayın
              </p>

              {/* QR Code Container */}
              <div className="bg-white p-3 rounded-2xl inline-block shadow-lg mx-auto border border-slate-200">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Araç QR Kodu" className="w-48 h-48 sm:w-52 sm:h-52 object-contain" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-slate-400">
                    <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Plate bar in decal */}
              <div className="mt-4 inline-flex items-center border-2 border-slate-800 rounded-lg overflow-hidden bg-black text-white shadow">
                <span className="bg-blue-700 text-white font-black text-xs px-2 py-1">TR</span>
                <span className="font-mono font-black text-lg tracking-widest px-3 py-0.5">
                  {plate.toUpperCase()}
                </span>
              </div>

              {/* Footer Privacy Note in Card */}
              <div
                className={`mt-3 text-[10px] ${
                  theme === 'warning_yellow' ? 'text-black/80' : 'text-slate-400'
                }`}
              >
                🔒 Güvenli & KVKK Uyumlu İletişim Sistemi
              </div>
            </div>

            {/* Action Buttons: Download, Print, Test Scanner */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadDecal}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                QR PNG İndir
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Kartı Yazdır
              </button>
            </div>

            {/* Direct Quick Scan Simulator Link */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>QR Tarama Bağlantısı:</span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="text-emerald-400 hover:underline flex items-center gap-1 text-[11px]"
                >
                  <Copy className="w-3 h-3" />
                  {copiedLink ? 'Kopyalandı!' : 'Linki Kopyala'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={scanUrl}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 truncate"
                />
                <button
                  type="button"
                  onClick={() => onOpenScanner && onOpenScanner(currentCode)}
                  className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1 transition shadow cursor-pointer"
                  title="Tarama Panelini Aç"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Test Et
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
