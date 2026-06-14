import React, { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, ScanLine, Repeat } from "lucide-react";
import { toast } from "sonner";

/**
 * Barcode scanner using the native BarcodeDetector API where supported.
 * - Two modes: "Scan Now" (single-shot) and "Continuous" (auto-detect).
 * - Prefers the main 1x rear camera (not ultra-wide) when multiple exist.
 * - Falls back to a manual barcode input field.
 */
export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const continuousRef = useRef(false);
  const [supported, setSupported] = useState(true);
  const [manual, setManual] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [scanning, setScanning] = useState(false); // single-shot in progress
  const [status, setStatus] = useState("Tap “Scan now” or enable Continuous.");

  const stopStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const pickMainRearCamera = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      // Heuristic: prefer rear cams not labelled ultra-wide / telephoto / front
      const ranked = cams
        .map((c) => {
          const l = (c.label || "").toLowerCase();
          let score = 0;
          if (l.includes("back") || l.includes("rear") || l.includes("environment")) score += 50;
          if (l.includes("front") || l.includes("user") || l.includes("face")) score -= 100;
          if (l.includes("ultra") || l.includes("0.5") || l.includes("wide angle") || l.includes("wide-angle")) score -= 30;
          if (l.includes("telephoto") || l.includes("tele") || l.includes("zoom")) score -= 10;
          if (l.includes("main") || l.includes("1x") || (l.includes("camera 0") && (l.includes("back") || l.includes("rear")))) score += 20;
          return { c, score, label: l };
        })
        .sort((a, b) => b.score - a.score);
      return ranked[0]?.c?.deviceId || null;
    } catch {
      return null;
    }
  };

  const applyMainLensZoom = (track) => {
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps && typeof caps.zoom === "object" && caps.zoom !== null) {
        // 1x corresponds to the smallest zoom value that gives the main lens FOV.
        // On most phones zoom=1 is the main lens; ultra-wide is exposed as a separate device.
        const target = Math.max(1, caps.zoom.min || 1);
        track.applyConstraints({ advanced: [{ zoom: target }] }).catch(() => {});
      }
    } catch {}
  };

  useEffect(() => {
    if (!("BarcodeDetector" in window)) {
      setSupported(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Need a stream first so device labels are populated on some browsers.
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
        tempStream.getTracks().forEach((t) => t.stop());
        const deviceId = await pickMainRearCamera();
        const constraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const [track] = stream.getVideoTracks();
        if (track) applyMainLensZoom(track);
        // eslint-disable-next-line no-undef
        detectorRef.current = new BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
        setCameraReady(true);
        setStatus("Ready. Tap “Scan now” or enable Continuous.");
      } catch (e) {
        toast.error("Camera unavailable. Enter the barcode manually.");
        setSupported(false);
      }
    })();
    return () => { cancelled = true; stopStream(); };
  }, [stopStream]);

  const detectOnce = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current) return null;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      return codes && codes.length > 0 ? codes[0].rawValue : null;
    } catch { return null; }
  }, []);

  const handleScanNow = async () => {
    if (!cameraReady || scanning) return;
    setScanning(true);
    setStatus("Scanning…");
    // Give it ~3 seconds to find a code on a single tap
    const deadline = Date.now() + 3000;
    let found = null;
    while (Date.now() < deadline && !found) {
      // eslint-disable-next-line no-await-in-loop
      found = await detectOnce();
      if (!found) await new Promise((r) => setTimeout(r, 120));
    }
    setScanning(false);
    if (found) {
      stopStream();
      onDetected(found);
    } else {
      setStatus("No barcode detected. Try again or hold steadier.");
    }
  };

  const loopContinuous = useCallback(async () => {
    if (!continuousRef.current) return;
    const v = await detectOnce();
    if (v) {
      stopStream();
      onDetected(v);
      return;
    }
    rafRef.current = requestAnimationFrame(loopContinuous);
  }, [detectOnce, onDetected, stopStream]);

  const toggleContinuous = () => {
    const next = !continuous;
    continuousRef.current = next;
    setContinuous(next);
    if (next) {
      setStatus("Continuous scanning ON — align the barcode in the frame.");
      rafRef.current = requestAnimationFrame(loopContinuous);
    } else {
      setStatus("Continuous scanning paused.");
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const close = () => { stopStream(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="barcode-scanner-modal">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2 text-white"><Camera size={18} /><span className="font-heading font-bold">Scan barcode</span></div>
        <button onClick={close} data-testid="barcode-scanner-close" className="gv-btn-ghost"><X size={18} /></button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {supported ? (
          <>
            <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-3/4 max-w-md aspect-[3/2] border-2 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] transition-colors ${continuous || scanning ? "border-[#007AFF]" : "border-white/40"}`} />
            </div>
            <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
              {continuous && <span className="gv-badge gv-status-Playing flex items-center gap-1" data-testid="continuous-indicator"><span className="inline-block w-2 h-2 rounded-full bg-[#007AFF] animate-pulse" /> Continuous</span>}
            </div>
            <div className="absolute bottom-28 inset-x-0 text-center text-white/80 text-sm px-4" data-testid="scanner-status">{status}</div>
            <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-3 px-4">
              <button
                data-testid="scan-now-button"
                onClick={handleScanNow}
                disabled={!cameraReady || scanning}
                className="gv-btn-primary min-w-[140px]"
              >
                <ScanLine size={16} /> {scanning ? "Scanning…" : "Scan now"}
              </button>
              <button
                data-testid="toggle-continuous-button"
                onClick={toggleContinuous}
                disabled={!cameraReady}
                className={`gv-btn-secondary min-w-[140px] ${continuous ? "border-[#007AFF] text-[#3395FF]" : ""}`}
                aria-pressed={continuous}
              >
                <Repeat size={16} /> {continuous ? "Stop continuous" : "Continuous"}
              </button>
            </div>
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
