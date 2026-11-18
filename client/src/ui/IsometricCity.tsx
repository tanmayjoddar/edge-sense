import React from "react";

export const IsometricCity: React.FC = () => {
  return (
    <div className="isometric-container">
      <svg
        viewBox="0 0 500 360"
        className="isometric-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Gradients */}
          <radialGradient id="islandShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.18" />
            <stop offset="70%" stopColor="#000" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="grassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9ec07c" />
            <stop offset="60%" stopColor="#8db36a" />
            <stop offset="100%" stopColor="#759952" />
          </linearGradient>

          <linearGradient id="grassSideGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#70914c" />
            <stop offset="100%" stopColor="#557038" />
          </linearGradient>

          <linearGradient id="roadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4f5950" />
            <stop offset="100%" stopColor="#444d45" />
          </linearGradient>

          <linearGradient id="churchWallLight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e5735c" />
            <stop offset="100%" stopColor="#d3563e" />
          </linearGradient>

          <linearGradient id="churchWallDark" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#be452f" />
            <stop offset="100%" stopColor="#a63622" />
          </linearGradient>

          <linearGradient id="roofGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e2886a" />
            <stop offset="100%" stopColor="#c35c3e" />
          </linearGradient>

          <linearGradient id="yellowTrim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f7d070" />
            <stop offset="100%" stopColor="#e0b244" />
          </linearGradient>

          <linearGradient id="spireGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e6f1f4" />
            <stop offset="100%" stopColor="#b8cfd6" />
          </linearGradient>

          <linearGradient id="treeGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#58a05c" />
            <stop offset="100%" stopColor="#3d7a40" />
          </linearGradient>
          
          <linearGradient id="treeGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#68b46c" />
            <stop offset="100%" stopColor="#488c4b" />
          </linearGradient>
        </defs>

        {/* 1. Ambient Drop Shadow under the island */}
        <ellipse cx="250" cy="275" rx="195" ry="60" fill="url(#islandShadow)" />

        {/* 2. Base Podium / Island Cylinder */}
        {/* Island Side / Thickness */}
        <path
          d="M 55 240
             C 55 285, 445 285, 445 240
             L 445 252
             C 445 297, 55 297, 55 252
             Z"
          fill="url(#grassSideGrad)"
        />

        {/* Island Top Ellipse (Grass Surface) */}
        <ellipse cx="250" cy="240" rx="195" ry="58" fill="url(#grassGrad)" />

        {/* Circular Roadway around the center */}
        <ellipse
          cx="250"
          cy="240"
          rx="175"
          ry="50"
          fill="none"
          stroke="url(#roadGrad)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        {/* Road Dash lines */}
        <ellipse
          cx="250"
          cy="240"
          rx="175"
          ry="50"
          fill="none"
          stroke="#e8ede4"
          strokeWidth="1.5"
          strokeDasharray="8 12"
          opacity="0.75"
        />

        {/* Inner plaza pavement / roundabout */}
        <ellipse cx="250" cy="238" rx="138" ry="38" fill="#a4c784" />
        <ellipse cx="250" cy="238" rx="118" ry="32" fill="#e8eee0" opacity="0.4" />

        {/* 3. Tiny Miniature Cars on the Roadway */}
        {/* Car 1 (Left - White Sedan) */}
        <g transform="translate(110, 230)">
          <path d="M 0 5 L 14 0 L 22 4 L 8 9 Z" fill="#ffffff" />
          <path d="M 5 2 L 13 -1 L 18 2 L 10 5 Z" fill="#d0d7de" />
          <ellipse cx="6" cy="8" rx="2" ry="1.2" fill="#222" />
          <ellipse cx="17" cy="4" rx="2" ry="1.2" fill="#222" />
        </g>

        {/* Car 2 (Right - Blue Mini) */}
        <g transform="translate(370, 246)">
          <path d="M 0 3 L 15 7 L 11 11 L -4 7 Z" fill="#388bfd" />
          <path d="M 3 4 L 11 7 L 8 10 L 0 7 Z" fill="#a5d8ff" />
          <ellipse cx="2" cy="9" rx="2" ry="1.2" fill="#222" />
          <ellipse cx="12" cy="10" rx="2" ry="1.2" fill="#222" />
        </g>

        {/* 4. Peripheral Isometric Trees */}
        {/* Back Trees */}
        <g transform="translate(100, 195)">
          <rect x="7" y="18" width="4" height="12" fill="#58402c" rx="1" />
          <path d="M 9 0 C 1 10, 1 20, 9 20 C 17 20, 17 10, 9 0 Z" fill="url(#treeGrad1)" />
        </g>
        <g transform="translate(130, 185)">
          <rect x="7" y="20" width="4" height="12" fill="#58402c" rx="1" />
          <path d="M 9 0 C 0 12, 0 24, 9 24 C 18 24, 18 12, 9 0 Z" fill="url(#treeGrad2)" />
        </g>
        <g transform="translate(355, 185)">
          <rect x="7" y="20" width="4" height="12" fill="#58402c" rx="1" />
          <path d="M 9 0 C 0 12, 0 24, 9 24 C 18 24, 18 12, 9 0 Z" fill="url(#treeGrad2)" />
        </g>
        <g transform="translate(385, 195)">
          <rect x="7" y="18" width="4" height="12" fill="#58402c" rx="1" />
          <path d="M 9 0 C 1 10, 1 20, 9 20 C 17 20, 17 10, 9 0 Z" fill="url(#treeGrad1)" />
        </g>

        {/* 5. Centerpiece: Red-Roofed Cathedral & IoT Sensor Hub (like reference) */}
        <g id="central-cathedral" transform="translate(250, 205)">
          {/* Cathedral Ground Shadow */}
          <polygon
            points="-80,30 80,30 100,45 -100,45"
            fill="#000000"
            opacity="0.12"
          />

          {/* Main Nave (Left side dark wall, Right side light wall) */}
          {/* Right Wall (Light) */}
          <polygon
            points="0,-20 65,15 65,45 0,10"
            fill="url(#churchWallLight)"
          />
          {/* Windows on Right Wall */}
          <polygon points="12,1 22,6 22,22 12,17" fill="#ffffff" />
          <polygon points="14,3 20,6 20,20 14,17" fill="#59748b" />
          <polygon points="30,10 40,15 40,31 30,26" fill="#ffffff" />
          <polygon points="32,12 38,15 38,29 32,26" fill="#59748b" />
          <polygon points="48,19 58,24 58,40 48,35" fill="#ffffff" />
          <polygon points="50,21 56,24 56,38 50,35" fill="#59748b" />

          {/* Left Wall (Darker shade) */}
          <polygon
            points="0,-20 -50,5 -50,35 0,10"
            fill="url(#churchWallDark)"
          />
          {/* Decorative arches on left wall */}
          <polygon points="-12,4 -22,9 -22,25 -12,20" fill="#e5735c" opacity="0.6" />
          <polygon points="-28,12 -38,17 -38,33 -28,28" fill="#e5735c" opacity="0.6" />

          {/* Main Roof */}
          <polygon
            points="0,-48 65,-12 65,-10 0,-20"
            fill="url(#roofGrad)"
          />
          <polygon
            points="0,-48 -50,-22 -50,-20 0,-20"
            fill="#ba4630"
          />

          {/* Front Entrance Facade (Left facing tower) */}
          <polygon
            points="-50,5 -30,15 -30,45 -50,35"
            fill="url(#churchWallDark)"
          />
          {/* Rose Window & Entrance Portal */}
          <circle cx="-40" cy="18" r="4.5" fill="url(#yellowTrim)" />
          <path d="M -43 35 L -43 27 C -43 25 -37 25 -37 27 L -37 35 Z" fill="#2d1c16" />

          {/* Left Front Spire / Tower (Twin Towers) */}
          <polygon points="-52,-45 -40,-39 -40,30 -52,24" fill="url(#churchWallDark)" />
          <polygon points="-40,-39 -30,-44 -30,25 -40,30" fill="url(#churchWallLight)" />
          {/* Yellow Decorative Trim Bands */}
          <polygon points="-52,-15 -40,-9 -30,-14 -30,-10 -40,-5 -52,-11" fill="url(#yellowTrim)" />
          <polygon points="-52,-35 -40,-29 -30,-34 -30,-30 -40,-25 -52,-31" fill="url(#yellowTrim)" />
          {/* Pyramid Spire Peak */}
          <polygon points="-41,-85 -54,-45 -40,-39" fill="url(#spireGrad)" />
          <polygon points="-41,-85 -40,-39 -28,-44" fill="#9dbdc9" />
          {/* Tiny Cross on Peak */}
          <line x1="-41" y1="-85" x2="-41" y2="-92" stroke="#f1c40f" strokeWidth="1.5" />
          <line x1="-43" y1="-89" x2="-39" y2="-89" stroke="#f1c40f" strokeWidth="1.5" />

          {/* Right Front Spire / Tower */}
          <polygon points="-30,-44 -18,-38 -18,31 -30,25" fill="url(#churchWallDark)" />
          <polygon points="-18,-38 -8,-43 -8,26 -18,31" fill="url(#churchWallLight)" />
          {/* Yellow Bands */}
          <polygon points="-30,-14 -18,-8 -8,-13 -8,-9 -18,-4 -30,-10" fill="url(#yellowTrim)" />
          <polygon points="-30,-34 -18,-28 -8,-33 -8,-29 -18,-24 -30,-30" fill="url(#yellowTrim)" />
          {/* Pyramid Spire Peak */}
          <polygon points="-19,-85 -32,-44 -18,-38" fill="url(#spireGrad)" />
          <polygon points="-19,-85 -18,-38 -6,-43" fill="#9dbdc9" />
          {/* Tiny Cross on Peak */}
          <line x1="-19" y1="-85" x2="-19" y2="-92" stroke="#f1c40f" strokeWidth="1.5" />
          <line x1="-21" y1="-89" x2="-17" y2="-89" stroke="#f1c40f" strokeWidth="1.5" />

          {/* Central Crossing Dome / High Spire */}
          <polygon points="12,-40 28,-32 28,-10 12,-18" fill="url(#churchWallLight)" />
          <polygon points="20,-88 10,-41 28,-32" fill="url(#spireGrad)" />
          <polygon points="20,-88 28,-32 36,-36" fill="#9dbdc9" />
          {/* Pulse Signal Dot on High Spire (EdgeSense IoT Node indicator) */}
          <circle cx="20" cy="-88" r="3.5" fill="#10b981" className="iot-beacon" />
        </g>

        {/* 6. Foreground Mini Trees around the plaza */}
        <g transform="translate(145, 235)">
          <rect x="7" y="16" width="3.5" height="10" fill="#58402c" rx="1" />
          <path d="M 9 0 C 2 9, 2 18, 9 18 C 16 18, 16 9, 9 0 Z" fill="url(#treeGrad2)" />
        </g>
        <g transform="translate(330, 240)">
          <rect x="7" y="16" width="3.5" height="10" fill="#58402c" rx="1" />
          <path d="M 9 0 C 2 9, 2 18, 9 18 C 16 18, 16 9, 9 0 Z" fill="url(#treeGrad1)" />
        </g>
        <g transform="translate(295, 260)">
          <rect x="7" y="14" width="3.5" height="8" fill="#58402c" rx="1" />
          <path d="M 9 0 C 3 8, 3 16, 9 16 C 15 16, 15 8, 9 0 Z" fill="url(#treeGrad2)" />
        </g>
      </svg>
    </div>
  );
};
