import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  Car,
  AlertTriangle,
  Lightbulb,
  Truck,
  MessageSquare,
  Send,
  Camera,
  ShieldCheck,
  RefreshCw,
  Eye
} from 'lucide-react';
import { IncidentNotification, Vehicle } from '../types.ts';
import { playAlertSound } from '../lib/qrHelper.ts';

interface OwnerInboxProps {
  vehicles: Vehicle[];
}

export const OwnerInbox: React.FC<OwnerInboxProps> = ({ vehicles }) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || 'veh-1');
  const [notifications, setNotifications] = useState<IncidentNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];

  const fetchNotifications = async (quiet = false) => {
    if (!selectedVehicle) return;
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/notifications?vehicleId=${selectedVehicle.id}`);
      const data = await res.json();
      if (data.notifications) {
        setNotifications((prev) => {
          // If a new unread notification arrived, play sound
          if (prev.length > 0 && data.notifications.length > prev.length) {
            playAlertSound('urgent');
          }
          return data.notifications;
        });
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(() => {
      fetchNotifications(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [selectedVehicleId]);

  const handleSendReply = async (notifId: string) => {
    const text = replyTextMap[notifId];
    if (!text || !text.trim()) return;

    setReplyingId(notifId);
    try {
      const res = await fetch(`/api/notifications/${notifId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() })
      });
      const data = await res.json();
      if (res.ok && data.notification) {
        playAlertSound('success');
        setNotifications((prev) =>
          prev.map((n) => (n.id === notifId ? data.notification : n))
        );
        setReplyTextMap((prev) => ({ ...prev, [notifId]: '' }));
      }
    } catch (err) {
      alert('Yanıt gönderilemedi.');
    } finally {
      setReplyingId(null);
    }
  };

  const setQuickReply = (notifId: string, quickStr: string) => {
    setReplyTextMap((prev) => ({ ...prev, [notifId]: quickStr }));
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'park_block':
        return <span className="text-amber-400 bg-amber-950/60 border border-amber-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"><Car className="w-3 h-3" /> Hatalı Park</span>;
      case 'window_open':
        return <span className="text-sky-400 bg-sky-950/60 border border-sky-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cam Açık</span>;
      case 'lights_on':
        return <span className="text-yellow-400 bg-yellow-950/60 border border-yellow-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"><Lightbulb className="w-3 h-3" /> Farlar Açık</span>;
      case 'tow_truck':
        return <span className="text-rose-400 bg-rose-950/60 border border-rose-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"><Truck className="w-3 h-3" /> Çekici / Ceza</span>;
      default:
        return <span className="text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"><Bell className="w-3 h-3" /> Bildirim</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Photo modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="max-w-xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
            <img src={previewPhoto} alt="Olay fotoğrafı" className="w-full h-auto object-contain" />
            <div className="p-3 text-center text-xs text-slate-400">Kapatmak için tıklayın</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-100 flex items-center gap-3">
            <Bell className="w-7 h-7 text-emerald-400" />
            Gelen Bildirimler & Olay Kutusu
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            QR kodunuzu okutan vatandaşların ve komşuların gönderdiği canlı uyarılar
          </p>
        </div>

        {/* Vehicle Selector */}
        <div className="flex items-center gap-3">
          <select
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-100 text-sm font-semibold rounded-xl px-3.5 py-2 focus:outline-none focus:border-emerald-500"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                🚗 {v.plate} ({v.brandModel})
              </option>
            ))}
          </select>
          <button
            onClick={() => fetchNotifications()}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
            <div className="w-16 h-16 bg-slate-800/80 text-slate-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-emerald-400/60" />
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-1">Şu Anda Aktif Bildirim Yok</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">
              Aracınız için herhangi bir park engeli veya acil durum uyarısı gelmedi. Sistem 5 saniyede bir otomatik güncellenir.
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`bg-slate-900 border rounded-3xl p-5 sm:p-6 transition shadow-xl ${
                notif.read ? 'border-slate-800' : 'border-emerald-500/50 ring-1 ring-emerald-500/30'
              }`}
            >
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  {getCategoryBadge(notif.category)}
                  <span className="font-mono text-xs font-bold text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {notif.vehiclePlate}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(notif.timestamp).toLocaleString('tr-TR')}</span>
                </div>
              </div>

              {/* Title & Message */}
              <h4 className="text-base font-bold text-slate-100 mb-1">{notif.title}</h4>
              <p className="text-sm text-slate-300 leading-relaxed mb-4 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80">
                "{notif.message}"
              </p>

              {/* Sender & Photo metadata */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pb-3 border-b border-slate-800">
                <div>
                  <span className="text-slate-500">Gönderen: </span>
                  <span className="text-slate-200 font-medium">{notif.senderName || 'Anonim'}</span>
                  {notif.senderPhone && (
                    <span className="ml-2 font-mono text-emerald-400">({notif.senderPhone})</span>
                  )}
                </div>

                {notif.photoUrl && (
                  <button
                    onClick={() => setPreviewPhoto(notif.photoUrl!)}
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 px-2.5 py-1 rounded-lg transition"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Eklenen Fotoğrafı Gör</span>
                  </button>
                )}
              </div>

              {/* Owner Reply status / Reply action */}
              <div className="mt-4">
                {notif.ownerReply ? (
                  <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/20 rounded-2xl">
                    <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold mb-1">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Gönderilen Yanıtınız:
                      </span>
                      <span className="text-emerald-400/80 text-[11px]">
                        {new Date(notif.ownerReply.repliedAt).toLocaleTimeString('tr-TR')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-200">"{notif.ownerReply.text}"</p>
                  </div>
                ) : (
                  <div>
                    {/* Quick response chips */}
                    <div className="flex flex-wrap gap-2 mb-2.5">
                      <button
                        type="button"
                        onClick={() => setQuickReply(notif.id, 'Hemen iniyorum, 2-3 dakikaya araç başındayım.')}
                        className="text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        ⚡ 2 dakikaya geliyorum
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickReply(notif.id, '5 dakikaya gelip aracı çekiyorum, kusura bakmayın.')}
                        className="text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        🚗 5 dk içinde çekiyorum
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickReply(notif.id, 'Teşekkürler, camı/farları kontrol ettim.')}
                        className="text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        👍 Teşekkürler, kontrol ettim
                      </button>
                    </div>

                    {/* Reply Input Bar */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={replyTextMap[notif.id] || ''}
                        onChange={(e) =>
                          setReplyTextMap({ ...replyTextMap, [notif.id]: e.target.value })
                        }
                        placeholder="Tarayan kişiye anlık yanıt yazın..."
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={replyingId === notif.id || !replyTextMap[notif.id]?.trim()}
                        onClick={() => handleSendReply(notif.id)}
                        className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow"
                      >
                        {replyingId === notif.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Yanıtla</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
