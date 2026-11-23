import React, { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { validateStationInput, classifyStationId, STATION_KIND_LABELS } from '../stationValidation';
import { mapApiIssuesToErrors } from '../utils/apiErrors';
import { RegisterStationInput } from '../hooks/useStations';

export interface StationRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: RegisterStationInput) => Promise<void>;
  /** Prefill device_id — dipakai CTA "Daftarkan" dari panel diagnostik T3. */
  initialDeviceId?: string;
}

export const StationRegisterModal: React.FC<StationRegisterModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialDeviceId = '',
}) => {
  const [deviceId, setDeviceId] = useState(initialDeviceId);
  const [mac, setMac] = useState('');
  const [ip, setIp] = useState('');
  const [firmware, setFirmware] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** E30 (FAT-255, P30.2): stasiun yang baru dibuat — tampilkan ringkasan commissioning. */
  const [created, setCreated] = useState<{ deviceId: string } | null>(null);

  // Prefill saat dibuka (mis. dari CTA diagnostik); membuka modal membersihkan error.
  useEffect(() => {
    if (isOpen) {
      setDeviceId(initialDeviceId);
      setMac('');
      setIp('');
      setFirmware('');
      setErrors({});
      setSubmitError(null);
      setCreated(null);
    }
  }, [isOpen, initialDeviceId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs = validateStationInput({
      deviceId,
      macAddress: mac,
      ipAddress: ip || undefined,
      firmwareVersion: firmware || undefined,
      isCreate: true,
    });
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({ deviceId, mac, ip, firmware });
      // P30.2: jangan langsung tutup — tampilkan ringkasan commissioning
      // (kredensial perangkat masih menunggu backend B30.1).
      setCreated({ deviceId: deviceId.trim() });
      setErrors({});
    } catch (err: any) {
      const fieldErrs = mapApiIssuesToErrors(err);
      if (Object.keys(fieldErrs).length > 0) {
        setErrors(fieldErrs);
      }
      setSubmitError(err?.message || 'Gagal mendaftarkan stasiun.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Daftarkan Stasiun / Terminal HMI Baru"
      subtitle="Registrasi ke tabel devices. Stasiun adalah identitas terminal HMI yang terikat ke satu mesin — bukan lokasi login operator (E30). HMI tidak memakai login operator; terminal mengautentikasi dengan kredensial perangkatnya sendiri. Login admin panel tidak memakai station_id (Spec 044)."
      footer={
        created ? (
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Selesai</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button onClick={() => void handleSubmit()} isLoading={isSubmitting}>
              Daftarkan Stasiun
            </Button>
          </div>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <div className="p-3 rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 space-y-2">
            <div className="font-semibold">Stasiun berhasil didaftarkan.</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold font-tabular">{created.deviceId}</span>
              <Badge variant={classifyStationId(created.deviceId) === 'terminal' ? 'info' : 'neutral'}>
                {STATION_KIND_LABELS[classifyStationId(created.deviceId)]}
              </Badge>
            </div>
            <p>
              Langkah berikutnya (commissioning): kredensial perangkat diterbitkan
              sekali saat provisioning — masih menunggu backend (B30.1). Sampai
              saat itu terminal ini belum bisa mengirim data. Akses terminal
              bisa dicabut kapan saja lewat tombol Nonaktifkan di tabel stasiun.
            </p>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-2.5 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
          Dua kelas ID: perangkat edge berpola STM32- (contoh: STM32-OEE-01) dan
          terminal HMI berpola STATION-/KIOSK-/ADMIN- (contoh: STATION-LINI-01).
          Server kini menerima ID terminal juga (terbukti live 2026-11-23:
          ADMIN-CONSOLE-01 terdaftar, FAT-236); bila server menolak, pesan
          penolakan ditampilkan apa adanya. API tidak menyediakan field
          hostname — identitas stasiun adalah Station ID-nya.
        </div>
        {submitError && (
          <div role="alert" className="p-2.5 rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
            {submitError}
          </div>
        )}
        <Input
          label="Station / Device ID"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          placeholder="STATION-LINI-01"
          error={errors.deviceId}
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="MAC Address (EUI-48, Opsional)"
            value={mac}
            onChange={(e) => setMac(e.target.value.toUpperCase())}
            placeholder="00:08:DC:55:01:0A"
            error={errors.macAddress}
          />
          <Input
            label="IP Address (Opsional)"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="192.168.10.26"
            error={errors.ipAddress}
          />
        </div>
        <Input
          label="Firmware Version (Opsional)"
          value={firmware}
          onChange={(e) => setFirmware(e.target.value)}
          placeholder="v2.4.1-rtos"
          error={errors.firmwareVersion}
        />
      </form>
      )}
    </Modal>
  );
};
