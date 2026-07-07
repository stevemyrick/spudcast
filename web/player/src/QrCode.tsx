import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Render `value` as a QR code image. Retro-friendly: dark modules on light. */
export function QrCode({ value, size = 128 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [value, size]);
  if (!src) return null;
  return <img className="qr" src={src} width={size} height={size} alt="Scan to open the remote" />;
}
