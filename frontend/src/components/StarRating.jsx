import React from "react";
import { Star } from "lucide-react";

export default function StarRating({ value = 0, onChange, size = 20, readOnly = false }) {
  return (
    <div className="flex items-center gap-1" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          data-testid={`star-${n}`}
          disabled={readOnly}
          onClick={() => !readOnly && onChange?.(n === value ? 0 : n)}
          className={`transition-transform ${readOnly ? "cursor-default" : "hover:scale-125"}`}
        >
          <Star
            size={size}
            className={n <= value ? "fill-yellow-400 text-yellow-400" : "text-white/20"}
            strokeWidth={2}
          />
        </button>
      ))}
    </div>
  );
}
