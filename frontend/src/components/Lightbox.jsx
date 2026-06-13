import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export default function Lightbox({ images = [], startIndex = 0, open, onOpenChange }) {
  const [idx, setIdx] = useState(startIndex);
  useEffect(() => { if (open) setIdx(startIndex); }, [startIndex, open]);
  useEffect(() => {
    const onKey = (e) => {
      if (!open) return;
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);
  if (!images.length) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-black/95 border-white/10 max-w-5xl w-[95vw] p-0 overflow-hidden"
        data-testid="lightbox-modal"
      >
        <VisuallyHidden><DialogTitle>Photo viewer</DialogTitle><DialogDescription>Browse gallery images</DialogDescription></VisuallyHidden>
        <div className="relative w-full h-[80vh] flex items-center justify-center">
          <img src={images[idx]} alt="" className="max-h-full max-w-full object-contain" data-testid={`lightbox-image-${idx}`} />
          {images.length > 1 && (
            <>
              <button
                data-testid="lightbox-prev"
                onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-black/80"
              ><ChevronLeft size={20} /></button>
              <button
                data-testid="lightbox-next"
                onClick={() => setIdx((i) => (i + 1) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-black/80"
              ><ChevronRight size={20} /></button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/60 px-3 py-1 rounded-full" data-testid="lightbox-counter">{idx + 1} / {images.length}</div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
