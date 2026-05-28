// "Auri" — the guided-demo assistant (Sprint 5.0E → presence polish 5.0F.4). A
// friendly receptionist-bot drawn inline as SVG (no external asset). `mood` nudges
// the expression; a subtle headset sells the "recepcionista digital" persona.
// `animated` gates the SMIL blink/glow so prefers-reduced-motion stays still.
// Pass `className` to control the rendered size responsively from CSS.
interface Props {
  size?: number;
  mood?: 'happy' | 'wave' | 'cheer' | 'neutral';
  animated?: boolean;
  title?: string;
  className?: string;
}

export function DemoMascot({
  size = 56,
  mood = 'happy',
  animated = true,
  title = 'Auri',
  className,
}: Props): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="auri-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
        <radialGradient id="auri-antenna-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* antenna + soft always-on glow */}
      <circle cx="32" cy="3" r="6" fill="url(#auri-antenna-glow)">
        {animated && (
          <animate attributeName="r" values="5;7;5" dur="2.4s" repeatCount="indefinite" />
        )}
      </circle>
      <line x1="32" y1="10" x2="32" y2="3" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="3" r="3" fill="#67e8f9">
        {animated && mood === 'cheer' && (
          <animate attributeName="r" values="3;4;3" dur="1.2s" repeatCount="indefinite" />
        )}
      </circle>

      {/* head */}
      <rect x="12" y="10" width="40" height="34" rx="12" fill="url(#auri-body)" />
      <rect x="12" y="10" width="40" height="34" rx="12" fill="#05070d" fillOpacity="0.12" />

      {/* face screen */}
      <rect x="18" y="17" width="28" height="20" rx="8" fill="#05121a" />

      {/* eyes (blink gated by `animated`) */}
      <circle cx="26" cy="27" r="3.4" fill="#67e8f9">
        {animated && (
          <animate
            attributeName="r"
            values="3.4;3.4;0.5;3.4;3.4"
            keyTimes="0;0.86;0.92;0.98;1"
            dur="4.2s"
            repeatCount="indefinite"
          />
        )}
      </circle>
      <circle cx="38" cy="27" r="3.4" fill="#67e8f9">
        {animated && (
          <animate
            attributeName="r"
            values="3.4;3.4;0.5;3.4;3.4"
            keyTimes="0;0.86;0.92;0.98;1"
            dur="4.2s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* mouth — one short expression per mood */}
      {mood === 'happy' && (
        <path d="M27 33 Q32 36 37 33" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" />
      )}
      {mood === 'wave' && (
        <path d="M27 33.5 Q32 35 37 33.5" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" />
      )}
      {mood === 'neutral' && (
        <path d="M28 33.4 Q32 34.4 36 33.4" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" />
      )}
      {mood === 'cheer' && (
        <path
          d="M27 32 Q32 37.5 37 32"
          stroke="#67e8f9"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* headset — earcups + mic boom (receptionist cue) */}
      <rect x="7" y="22" width="5" height="11" rx="2.5" fill="#0e9aae" />
      <rect x="52" y="22" width="5" height="11" rx="2.5" fill="#0e9aae" />
      <circle cx="9.5" cy="27.5" r="2" fill="#67e8f9" fillOpacity="0.8" />
      <circle cx="54.5" cy="27.5" r="2" fill="#67e8f9" fillOpacity="0.8" />
      <path
        d="M10 32 Q11 41 21 41"
        stroke="#67e8f9"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      <circle cx="21" cy="41" r="1.7" fill="#bff5ff" />

      {/* body */}
      <rect x="20" y="45" width="24" height="14" rx="6" fill="url(#auri-body)" />
      <rect x="20" y="45" width="24" height="14" rx="6" fill="#05070d" fillOpacity="0.12" />
      <circle cx="32" cy="52" r="2.4" fill="#bff5ff" />
    </svg>
  );
}
