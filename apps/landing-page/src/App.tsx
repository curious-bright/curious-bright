import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { LiveSandbox } from './components/LiveSandbox';
import { InstitutionalBanner } from './components/InstitutionalBanner';
import { SponsorSection } from './components/SponsorSection';
import { Footer } from './components/Footer';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfUse } from './pages/TermsOfUse';

function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col relative selection:bg-[rgba(255,90,54,0.15)] selection:text-[var(--color-ink)]">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Features />
        <LiveSandbox />
        <InstitutionalBanner />
        <SponsorSection />
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfUse />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
