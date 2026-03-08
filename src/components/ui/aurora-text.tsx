import type { FC, ReactNode } from 'react';

interface AuroraTextProps {
  children: ReactNode;
  className?: string;
}

const AuroraText: FC<AuroraTextProps> = ({ children, className = '' }) => (
  <span className={`relative inline-block ${className}`}>
    {/* Aurora gradient animated behind text */}
    <span
      className="aurora-text-bg pointer-events-none absolute inset-0 blur-lg opacity-60"
      aria-hidden="true"
      style={{
        background:
          'linear-gradient(90deg, #a855f7, #6366f1, #06b6d4, #a855f7)',
        backgroundSize: '300% 100%',
        animation: 'aurora-shift 4s ease-in-out infinite',
        WebkitBackgroundClip: 'text',
      }}
    />
    {/* Foreground text with animated gradient fill */}
    <span
      className="relative"
      style={{
        background:
          'linear-gradient(90deg, #c084fc, #818cf8, #22d3ee, #c084fc)',
        backgroundSize: '300% 100%',
        animation: 'aurora-shift 4s ease-in-out infinite',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      {children}
    </span>
  </span>
);

export default AuroraText;
