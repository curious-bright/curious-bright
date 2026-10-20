import React, { useState } from 'react';
import { Users, ArrowRight, Sparkles, Menu, X, BookOpen, Award } from 'lucide-react';
import websiteLogo from '../assets/website-logo.svg';

export const Navbar: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { href: '#features', icon: Users, label: 'Work Together' },
    { href: '#sandbox', icon: null, label: 'Live Playground' },
    { href: '#institutions', icon: BookOpen, label: 'For Schools & Labs' },
    { href: 'https://app.curiousbright.com.ng/register', icon: Award, label: 'Earn Badges' },
    { href: '#sponsor', icon: null, label: '♥ Sponsor' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#F7F6F2]/90 backdrop-blur-md border-b border-[var(--color-line)] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">

          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3 min-w-0">
            <a href="/" className="flex items-center gap-2.5 group hover:opacity-90 transition-opacity">
              <img src={websiteLogo} alt="Curious Bright" style={{ height: 32, width: 'auto' }} className="sm:h-9" />
            </a>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm text-xs font-mono font-medium border border-[var(--color-line)] bg-white text-[var(--color-faded-ink)]">
              <Sparkles className="w-3 h-3 text-[var(--color-coral)]" />
              LEARNING COMMUNITY + RESEARCH
            </span>
          </div>

          {/* Nav Links (desktop) */}
          <nav className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={`text-sm font-medium text-[var(--color-faded-ink)] hover:text-[var(--color-ink)] transition-colors flex items-center gap-1.5 ${item.label.includes('Sponsor') ? 'font-semibold text-[var(--color-coral)] hover:text-[var(--color-ink)]' : ''}`}
                >
                  {Icon ? <Icon className="w-4 h-4 text-[var(--color-coral)]" /> : null}
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-3">
            <a
              href="https://app.curiousbright.com.ng/login"
              className="btn-secondary hidden sm:inline-flex text-xs px-4 py-2"
            >
              Sign In
            </a>
            <a
              href="https://app.curiousbright.com.ng/register"
              className="btn-primary text-xs px-4 py-2"
            >
              <span>Join Community</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            {/* Mobile hamburger */}
            <button
              type="button"
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 -mr-2 rounded-sm border border-[var(--color-line)] bg-white text-[var(--color-ink)]"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {menuOpen ? (
          <nav className="lg:hidden py-4 border-t border-[var(--color-line)] flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-2 py-2.5 rounded-sm text-sm font-medium text-[var(--color-ink)] hover:bg-white transition-colors"
                >
                  {Icon ? <Icon className="w-4 h-4 text-[var(--color-coral)]" /> : <span className="w-4" />}
                  {item.label}
                </a>
              );
            })}
            <a
              href="https://app.curiousbright.com.ng/login"
              onClick={() => setMenuOpen(false)}
              className="btn-secondary mt-2 text-sm justify-center"
            >
              Sign In
            </a>
          </nav>
        ) : null}
      </div>
    </header>
  );
};
