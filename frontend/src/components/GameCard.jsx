import React from "react";
import { Link } from "react-router-dom";
import { Gamepad2, Star } from "lucide-react";

const PLACEHOLDER = "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80";

export default function GameCard({ game, to }) {
  const status = game.status || "Backlog";
  return (
    <Link to={to || `/games/${game.game_id}`} data-testid={`game-card-${game.game_id}`} className="group block">
      <div className="gv-card h-full hover:-translate-y-1 hover:border-white/20">
        <div className="aspect-[3/4] bg-[#1A1A1A] relative overflow-hidden">
          <img
            src={game.cover_url || PLACEHOLDER}
            alt={game.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => (e.currentTarget.src = PLACEHOLDER)}
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 to-transparent" />
          <span className={`absolute top-2 left-2 gv-badge gv-status-${status.replace(/\s|%/g, '-')}`}>{status}</span>
          {game.rating ? (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md">
              <Star size={12} className="fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-bold">{game.rating}</span>
            </div>
          ) : null}
        </div>
        <div className="p-4">
          <h3 className="font-heading font-bold text-base text-white line-clamp-1">{game.title}</h3>
          <div className="text-xs text-[#8B9BB4] mt-1 flex items-center gap-2">
            <Gamepad2 size={12} />
            <span className="truncate">{game.platform || "Unknown"}</span>
            {game.release_year ? <span className="text-white/30">·</span> : null}
            {game.release_year ? <span>{game.release_year}</span> : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
