import React from 'react';
import { Link } from 'react-router-dom';
import websiteLogo from '../assets/website-logo.svg';


export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-[var(--color-line)] pt-16 pb-12 text-sm text-[var(--color-faded-ink)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-6 gap-10 pb-12 border-b border-[var(--color-line)]">
          
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <img src={websiteLogo} alt="Curious Bright" style={{ height: 32, width: 'auto' }} />
            </div>

            <p className="text-xs leading-relaxed text-[var(--color-faded-ink)] max-w-sm">
              A free, open platform where students, researchers, and teachers publish research and work on it together, live, in one place.
            </p>

            <div className="font-mono text-[11px] text-[var(--color-faded-ink)] flex items-center gap-2 pt-2">
              <span className="px-2 py-0.5 rounded-sm bg-[#F7F6F2] border border-[var(--color-line)]">
                OPEN ACCESS
              </span>
              <span>•</span>
              <span className="px-2 py-0.5 rounded-sm bg-[#F7F6F2] border border-[var(--color-line)]">
                ZERO STATUS DOTS
              </span>
            </div>
          </div>

          {/* Column 1: Platform Navigation */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-ink)]">
              Platform
            </h4>
            <ul className="space-y-2 text-xs">
              <li><a href="https://app.curiousbright.com.ng/browse" className="hover:text-[var(--color-ink)] transition-colors">Open Library</a></li>
              <li><a href="https://app.curiousbright.com.ng/community" className="hover:text-[var(--color-ink)] transition-colors">Study Rooms</a></li>
              <li><a href="https://app.curiousbright.com.ng/submit" className="hover:text-[var(--color-ink)] transition-colors">Submit Manuscript</a></li>
              <li><a href="https://app.curiousbright.com.ng/moderate" className="hover:text-[var(--color-ink)] transition-colors">Moderation Queue</a></li>
              <li><a href="/#sponsor" className="hover:text-[var(--color-coral)] font-semibold text-[var(--color-coral)] transition-colors">♥ Sponsor Us</a></li>
            </ul>
          </div>

          {/* Column 2: Institutions & Outreach */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-ink)]">
              Institutions
            </h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/pricing" className="hover:text-[var(--color-ink)] transition-colors">Plans &amp; Pricing</Link></li>
              <li><a href="https://org.curiousbright.com.ng" className="hover:text-[var(--color-ink)] transition-colors">Institutional Portal</a></li>
              <li><a href="https://app.curiousbright.com.ng/moderate" className="hover:text-[var(--color-ink)] transition-colors">Become a Moderator</a></li>
              <li><a href="https://app.curiousbright.com.ng/join-organization" className="hover:text-[var(--color-ink)] transition-colors">Join an Organization</a></li>
            </ul>
          </div>

          {/* Column 3: Account */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-ink)]">
              Account
            </h4>
            <ul className="space-y-2 text-xs">
              <li><a href="https://app.curiousbright.com.ng/login" className="hover:text-[var(--color-ink)] transition-colors">Sign In</a></li>
              <li><a href="https://app.curiousbright.com.ng/register" className="hover:text-[var(--color-ink)] transition-colors">Join Workspace</a></li>
            </ul>
          </div>

          {/* Column 4: Legal */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-ink)]">
              Legal
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/privacy" className="hover:text-[var(--color-ink)] transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-[var(--color-ink)] transition-colors">
                  Terms of Use
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/curious-bright"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--color-ink)] transition-colors"
                >
                  Open Source (GPL-3.0)
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[var(--color-faded-ink)]">
          <div>
            &copy; {new Date().getFullYear()} Curious Bright. Bridging the gap in academics.
          </div>

          <div className="flex items-center gap-4">
            <Link to="/pricing" className="hover:text-[var(--color-ink)] transition-colors">Pricing</Link>
            <span>•</span>
            <Link to="/privacy" className="hover:text-[var(--color-ink)] transition-colors">Privacy</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-[var(--color-ink)] transition-colors">Terms</Link>
            <span>•</span>
            <span>Free for Education Worldwide</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
