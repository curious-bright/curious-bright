import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Edit3, MessageCircle, FileText } from 'lucide-react';
import { colors } from '@curious-bright/ui-kit';

interface CursorState {
  x: number;
  y: number;
  name: string;
  colorClass: string;
  bgColor: string;
  action: string;
}

export const Hero: React.FC = () => {
  const [cursorPos, setCursorPos] = useState<CursorState[]>([
    { x: 26, y: 24, name: 'Okikiolamilekan', colorClass: 'cursor-coral', bgColor: colors.coral, action: 'editing paragraph 2' },
    { x: 68, y: 54, name: 'Dr. Tomiwa', colorClass: 'cursor-teal', bgColor: colors.teal, action: 'adding solar formula' },
    { x: 40, y: 80, name: 'Prof. Chen', colorClass: 'cursor-mustard', bgColor: colors.mustard, action: 'commenting on citations' },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCursorPos((prev) =>
        prev.map((c) => ({
          ...c,
          x: Math.max(12, Math.min(82, c.x + (Math.random() * 8 - 4))),
          y: Math.max(18, Math.min(78, c.y + (Math.random() * 8 - 4))),
        }))
      );
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Oversized Clash Display Headline */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Live Cursor Badge Tag (Plain Words, Zero Dots!) */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-[var(--color-line)] bg-white text-xs font-mono font-semibold text-[var(--color-ink)] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[var(--color-coral)]" />
              <span>STUDENTS ARE TEACHING STUDENTS // LIVE</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight text-[var(--color-ink)] leading-[1.12]">
              Learning is a{' '}
              <span className="highlight-stroke highlight-stroke-coral">
                group project
              </span>
              .
            </h1>

            <p className="text-lg text-[var(--color-faded-ink)] leading-relaxed max-w-xl">
              A free community where students teach each other, share knowledge and equations, earn badges for
              helping others — and collaborate on research together, live, in one place.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a href="https://app.curiousbright.com.ng/register" className="btn-primary text-sm px-6 py-3.5">
                <span>Start Co-Authoring</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <a href="#sandbox" className="btn-secondary text-sm px-6 py-3.5">
                <Play className="w-4 h-4 text-[var(--color-coral)]" />
                <span>Try Live Canvas Below ↓</span>
              </a>
            </div>

            {/* Micro proof bar */}
            <div className="pt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--color-line)] text-xs text-[var(--color-faded-ink)] font-mono">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[var(--color-teal)]" />
                Community Knowledge Feed
              </span>
              <span className="flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-[var(--color-mustard)]" />
                Teacher &amp; Solver Badges
              </span>
              <span className="flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-[var(--color-coral)]" />
                Live Research Docs
              </span>
            </div>
          </div>

          {/* Right Column: Live Collaboration Interactive Document Preview */}
          <div className="lg:col-span-6">
            <div className="comment-corner-card bg-white p-6 sm:p-8 relative min-h-[420px] flex flex-col justify-between shadow-xl">
              <div className="comment-corner-ear" title="Peel margin note" />
              
              {/* Animated Floating Live Cursor Tags */}
              {cursorPos.map((c, idx) => (
                <motion.div
                  key={idx}
                  className={`live-cursor-tag ${c.colorClass}`}
                  animate={{ left: `${c.x}%`, top: `${c.y}%` }}
                  transition={{ duration: 1.8, ease: [0.25, 1, 0.5, 1] }}
                >
                  <svg className="live-cursor-pointer" viewBox="0 0 24 24">
                    <polygon points="0,0 12,24 16,14 24,12" />
                  </svg>
                  <span>{c.name}: {c.action}</span>
                </motion.div>
              ))}

              {/* Document Header Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-[var(--color-line)] mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[var(--color-coral)]" />
                  <span className="font-mono text-xs font-bold text-[var(--color-ink)] tracking-wider">
                    GROUP_STUDY_ESSAY.DOC
                  </span>
                </div>
                <div className="flex items-center -space-x-2">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-coral)] text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow-xs" title="Okikiolamilekan">O</div>
                  <div className="w-7 h-7 rounded-full bg-[var(--color-teal)] text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow-xs" title="Dr. Tomiwa">T</div>
                  <div className="w-7 h-7 rounded-full bg-[var(--color-mustard)] text-[var(--color-ink)] text-xs font-bold flex items-center justify-center border-2 border-white shadow-xs" title="Prof. Chen">C</div>
                </div>
              </div>

              {/* Document Content */}
              <div className="space-y-4 text-sm text-[var(--color-ink)] flex-1">
                <h3 className="font-display font-bold text-xl text-[var(--color-ink)]">
                  Group Project: Renewable Energy for Local Cities
                </h3>

                <p className="text-[var(--color-faded-ink)] leading-relaxed">
                  Our study team analyzed energy usage in high school campuses. By installing solar rooftops and LED lighting,{' '}
                  <span className="highlight-stroke highlight-stroke-teal text-[var(--color-ink)] font-medium">
                    schools reduce carbon emissions by 42% annually
                  </span>
                  . Efficiency target equation: <code className="font-mono bg-[#F7F6F2] px-1.5 py-0.5 rounded text-xs">E = P × t</code>.
                </p>

                {/* Inline Live Comment Bubble */}
                <div className="p-3 bg-[#F7F6F2] border-l-4 border-[var(--color-coral)] rounded-r-md text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono text-[10px] text-[var(--color-coral)] font-bold">
                    <span>OKIKIOLAMILEKAN (CORAL) — MARGIN NOTE</span>
                    <span>3m ago</span>
                  </div>
                  <p className="text-[var(--color-ink)] italic">
                    "Dr. Tomiwa, I added the survey results from our 5 partner schools. Can you check paragraph 2 formula?"
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--color-line)] flex items-center justify-between text-[11px] font-mono text-[var(--color-faded-ink)]">
                <span>REAL-TIME MULTIPLAYER CANVAS</span>
                <span className="flex items-center gap-1 text-[var(--color-teal)] font-semibold">
                  <Edit3 className="w-3 h-3" />
                  SYNCED INSTANTLY
                </span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
