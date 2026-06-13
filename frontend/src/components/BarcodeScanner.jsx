import React, { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Barcode scanner using the native BarcodeDetector API where supported.
 * Falls back to manual input.
 */
export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [supported, setSupported] = useState(true);
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!("BarcodeDetector" in window)) {
      setSupported(false);
      return;
    }
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);
        // eslint-disable-next-line no-undef
        const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              const val = codes[0].rawValue;
              cleanup();
              onDetected(val);
              return;
            }
          } catch {}
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        toast.error("Camera access denied. Enter the barcode manually.");
        setSupported(false);
      }
    };
    start();
    const cleanup = () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="barcode-scanner-modal">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2 text-white"><Camera size={18} /><span className="font-heading font-bold">Scan barcode</span></div>
        <button onClick={onClose} data-testid="barcode-scanner-close" className="gv-btn-ghost"><X size={18} /></button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {supported ? (
          <>
            <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/4 max-w-md aspect-[3/2] border-2 border-[#007AFF] rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
            </div>
            <div className="absolute bottom-6 inset-x-0 text-center text-white/70 text-sm">{scanning ? "Align barcode within the frame..." : "Initializing camera..."}</div>
          </>
        ) : (
          <div className="p-6 flex flex-col gap-4 max-w-md mx-auto text-white">
            <p className="text-sm text-[#8B9BB4]">Camera scanning not available on this device. Type the barcode below:</p>
            <input
              data-testid="barcode-manual-input"
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 0711719541110"
              className="gv-input"
            />
            <button
              data-testid="barcode-manual-submit"
              disabled={!manual}
              onClick={() => onDetected(manual)}
              className="gv-btn-primary"
            >Look up</button>
          </div>
        )}
      </div>
    </div>
  );
}
