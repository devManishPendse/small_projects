// Bubbles the robot. `mood` drives the CSS animation: idle | thinking | talking
export default function Mascot({ mood = 'idle', size = 64 }) {
  return (
    <svg className={`mascot mascot-${mood}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <line x1="50" y1="14" x2="50" y2="24" stroke="#1b1b2f" strokeWidth="4" strokeLinecap="round" />
      <circle className="mascot-antenna" cx="50" cy="11" r="6" fill="#ff5c8a" stroke="#1b1b2f" strokeWidth="4" />
      <rect x="14" y="24" width="72" height="62" rx="26" fill="#6fe3ff" stroke="#1b1b2f" strokeWidth="4" />
      <circle cx="12" cy="56" r="6" fill="#ffd93d" stroke="#1b1b2f" strokeWidth="4" />
      <circle cx="88" cy="56" r="6" fill="#ffd93d" stroke="#1b1b2f" strokeWidth="4" />
      <g className="mascot-eyes">
        <ellipse cx="36" cy="50" rx="9" ry="11" fill="#fff" stroke="#1b1b2f" strokeWidth="3" />
        <ellipse cx="64" cy="50" rx="9" ry="11" fill="#fff" stroke="#1b1b2f" strokeWidth="3" />
        <circle className="mascot-pupil" cx="38" cy="52" r="4.5" fill="#1b1b2f" />
        <circle className="mascot-pupil" cx="66" cy="52" r="4.5" fill="#1b1b2f" />
      </g>
      <ellipse cx="25" cy="68" rx="6" ry="4" fill="#ff9ebb" opacity=".8" />
      <ellipse cx="75" cy="68" rx="6" ry="4" fill="#ff9ebb" opacity=".8" />
      <path
        className="mascot-mouth"
        d={mood === 'thinking' ? 'M42 72 Q50 70 58 72' : 'M38 68 Q50 82 62 68'}
        fill={mood === 'talking' ? '#ff5c8a' : 'none'}
        stroke="#1b1b2f"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
