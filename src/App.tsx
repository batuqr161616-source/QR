import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Shield,
  Bell,
  Lock,
  Radio,
  Car,
  Smartphone,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { QrGenerator } from './components/QrGenerator.tsx';
import { ScannerPanel } from './components/ScannerPanel.tsx';
import { OwnerInbox } from './components/OwnerInbox.tsx';
import { FounderAdmin } from './components/FounderAdmin.tsx';
import { Vehicle } from './types.ts';

type ActiveView = 'qr_create' | 'scanner' | 'inbox' | 'founder';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('qr_create');
  const [scannedVehicleCode, setScannedVehicleCode] = useState<string>('TR-34ABC78');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(1);

  // Check URL query parameters for direct QR scan (e.g. ?scan=TR-34ABC78)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scanParam = params.get('scan') || params.get('car') || params.get('v');
    if (scanParam) {
      setScannedVehicleCode(scanParam);
      setActiveView('scanner');
    }
  }, []);

  // Fetch registered vehicles for switcher and inbox
  const fetchVehicles = async () => {
    try {
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      if (data.vehicles) {
        setVehicles(data.vehicles);
      }
    } catch (e) {
      console.debug('Failed to fetch initial vehicles', e);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const handleOpenScanner = (code: string) => {
    setScannedVehicleCode(code);
    setActiveView('scanner');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <div
            onClick={() => setActiveView('qr_create')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition shadow-lg shadow-emerald-950/40">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">
                  Oto<span className="text-emerald-400">QR</span>
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest bg-emerald-950/80 text-emerald-300 border border-emerald-800/40 px-1.5 py-0.2 rounded">
                  Güvenli
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-none">
                Gizlilik & Doğrudan Bildirim Sistemi
              </p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveView('qr_create')}
              className={`py-1.5 sm:py-2 px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'qr_create'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Car className="w-4 h-4" />
              <span className="hidden sm:inline">QR Oluştur</span>
              <span className="sm:hidden">QR</span>
            </button>

            <button
              onClick={() => setActiveView('scanner')}
              className={`py-1.5 sm:py-2 px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'scanner'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span className="hidden sm:inline">Tarama Paneli</span>
              <span className="sm:hidden">Tara</span>
            </button>

            <button
              onClick={() => setActiveView('inbox')}
              className={`py-1.5 sm:py-2 px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition relative cursor-pointer ${
                activeView === 'inbox'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Bildirimler</span>
              <span className="sm:hidden">Gelen</span>
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute top-1.5 right-1.5" />
              )}
            </button>

            <button
              onClick={() => setActiveView('founder')}
              className={`py-1.5 sm:py-2 px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition border cursor-pointer ${
                activeView === 'founder'
                  ? 'bg-slate-100 text-slate-950 border-white shadow-md'
                  : 'border-slate-800 text-slate-300 hover:border-slate-700 bg-slate-900/60'
              }`}
            >
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline">Kurucu (2FA + AI)</span>
              <span className="md:hidden">Kurucu</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content View Switcher */}
      <main className="flex-1">
        {activeView === 'qr_create' && (
          <QrGenerator
            onVehicleCreated={(veh) => {
              fetchVehicles();
              setScannedVehicleCode(veh.code);
            }}
            onOpenScanner={handleOpenScanner}
          />
        )}

        {activeView === 'scanner' && (
          <ScannerPanel
            vehicleCode={scannedVehicleCode}
            onBackToHome={() => setActiveView('qr_create')}
          />
        )}

        {activeView === 'inbox' && (
          <OwnerInbox vehicles={vehicles} />
        )}

        {activeView === 'founder' && (
          <FounderAdmin onVehicleListChange={fetchVehicles} />
        )}
      </main>

      {/* Bottom Footer */}
      <footer className="border-t border-slate-900 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>OtoQR Güvenli İletişim, Kayıt Güvenlik Duvarı ve 2FA Yönetim Platformu</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>Çift Aşamalı 2FA Aktif</span>
            <span>•</span>
            <span>Gemini AI Yönetici</span>
            <span>•</span>
            <span>KVKK Gizlilik Koruması</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
