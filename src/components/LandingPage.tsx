// ---------------------------------------------------------------------------
// LandingPage.tsx — Full-screen intro with Beams background
// ---------------------------------------------------------------------------

import { memo, useState, type FC } from 'react';
import Beams from './Beams';

interface LandingPageProps {
  onEnter: () => void;
}

const LandingPage: FC<LandingPageProps> = ({ onEnter }) => {
  const [exiting, setExiting] = useState(false);

  const handleStart = () => {
    setExiting(true);
    // Wait for fade-out to finish before notifying parent
    setTimeout(onEnter, 600);
  };

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center ${
        exiting ? 'animate-landingFadeOut' : 'animate-landingFadeIn'
      }`}
    >
      {/* Beams background */}
      <div className="pointer-events-none absolute inset-0">
        <Beams
          beamWidth={3}
          beamHeight={30}
          beamNumber={20}
          speed={2}
          noiseIntensity={1.75}
          scale={0.2}
          rotation={30}
        />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        {/* Logo + name row */}
        <div className="flex items-center gap-4">
          <img
            src="/vyuha-logo.png"
            alt="Codrix.ai"
            className="h-20 w-20 rounded-2xl object-cover"
          />
          <h1 className="text-7xl font-extrabold tracking-tight text-white" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            Codrix.ai
          </h1>
        </div>

        {/* Description */}
        <p className="max-w-3xl text-xl leading-relaxed text-gray-300">
          Your intelligent code analysis companion. Scan any repository, generate
          architectural diagrams, explore call chains, and chat with your codebase
          — all powered by AI. Understand complex projects in seconds, not hours.
          Dive in and let Codrix map the blueprint of your code for you.
        </p>

        {/* Start button */}
        <button
          onClick={handleStart}
          className="mt-4 flex items-center gap-3 rounded-full bg-white px-10 py-4 text-lg font-bold text-black shadow-lg shadow-white/10 transition-transform hover:scale-105 active:scale-95"
        >
          Start Now
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default memo(LandingPage);
