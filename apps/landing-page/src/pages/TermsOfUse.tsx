import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ArrowLeft,
  FileText,
  Users,
  Upload,
  AlertTriangle,
  Ban,
  Scale,
  RefreshCcw,
  Shield,
} from 'lucide-react';
import { colors } from '@curious-bright/ui-kit';

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <div className="policy-section">
    <div className="policy-section-header">
      <div className="policy-section-icon">{icon}</div>
      <h2>{title}</h2>
    </div>
    <div className="policy-section-body">{children}</div>
  </div>
);

export const TermsOfUse: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = 'Terms of Use — Curious Bright';
  }, []);

  return (
    <div className="policy-page">
      <header className="policy-nav">
        <div className="policy-nav-inner">
          <Link to="/" className="policy-nav-logo">
            <div className="policy-nav-logo-icon" style={{ backgroundColor: colors.ink }}>
              <BookOpen size={16} color="#F7F6F2" />
            </div>
            <span>Curious Bright</span>
          </Link>
          <Link to="/" className="policy-back-btn">
            <ArrowLeft size={14} />
            Back to Home
          </Link>
        </div>
      </header>

      <div className="policy-hero">
        <div className="policy-hero-badge">
          <FileText size={14} />
          <span>TERMS OF USE</span>
        </div>
        <h1>The rules of the notebook</h1>
        <p>
          These Terms govern your use of Curious Bright. They are written to be readable, but they
          are a legal agreement. By creating an account, using the service, or creating an
          organisation workspace, you agree to them.
        </p>
        <div className="policy-meta">
          <span>Version 2026-10-25</span>
          <span className="policy-meta-dot">•</span>
          <span>Last updated: 25 October 2026</span>
          <span className="policy-meta-dot">•</span>
          <Link to="/privacy" style={{ color: 'var(--color-teal)' }}>Privacy Policy →</Link>
        </div>
      </div>

      <div className="policy-content">
        <div
          style={{
            padding: '0.9rem 1rem',
            border: '1.5px solid var(--color-mustard)',
            background: 'rgba(244, 180, 61, 0.08)',
            borderRadius: '4px',
            color: 'var(--color-faded-ink)',
            fontSize: '0.82rem',
            lineHeight: 1.65,
          }}
        >
          <strong style={{ color: 'var(--color-ink)' }}>Legal review required.</strong> This is a
          working terms draft. The legal entity name, registered address, company registration
          number and contact details are placeholders and must be completed and reviewed by
          qualified Nigerian counsel before launch.
        </div>

        <Section icon={<FileText size={18} />} title="1. The agreement">
          <p>
            These Terms of Use (“Terms”) are a binding agreement between you and{' '}
            <strong>[LEGAL ENTITY NAME]</strong>, a company registered in Nigeria with registration
            number <strong>[COMPANY REGISTRATION NUMBER]</strong> and registered address{' '}
            <strong>[REGISTERED ADDRESS]</strong> (“Curious Bright”, “we”, “us” or “our”).
          </p>
          <p>
            If you use Curious Bright on behalf of an institution, you confirm that you are
            authorised to accept these Terms for that institution. The institution is responsible
            for its members’ use of the workspace and for any student-data obligations that apply
            to it. Our <Link to="/privacy">Privacy Policy</Link> forms part of these Terms.
          </p>
        </Section>

        <Section icon={<Users size={18} />} title="2. Eligibility and accounts">
          <ul>
            <li>You must be at least 13 years old (or 16 in the EEA/UK, unless local law permits a lower age with safeguards).</li>
            <li>If you are under 18, you should use Curious Bright with the knowledge and, where required, consent of a parent or guardian.</li>
            <li>You must provide accurate information and keep it up to date.</li>
            <li>You are responsible for your password, devices and account activity. Do not share your credentials.</li>
            <li>One person should not maintain multiple accounts to evade limits, bans or moderation.</li>
            <li>We may require email verification and, for organisations, additional verification before certain features are unlocked.</li>
          </ul>
        </Section>

        <Section icon={<Shield size={18} />} title="3. Institutional workspaces and verification">
          <p>
            Organisation owners and admins can create a workspace, invite members and request
            verification. Verification may require a legal name, country, address, website,
            official email address, registration number or document, and details of the head of
            institution. We may review these details manually.
          </p>
          <p>Verification statuses include:</p>
          <ul>
            <li><strong>Unverified</strong> — no complete application has been submitted.</li>
            <li><strong>Email Pending</strong> — the official email has not yet been confirmed.</li>
            <li><strong>Pending Admin Review</strong> — the application is awaiting platform review.</li>
            <li><strong>Verified</strong> — the application was approved; student features may be unlocked.</li>
            <li><strong>Rejected</strong> — the application needs correction; the institution may resubmit.</li>
            <li><strong>Suspended</strong> — access has been restricted for policy, fraud, safety or legal reasons.</li>
          </ul>
          <p>
            Submitting false, misleading, expired or third-party documents is a serious violation.
            We may reject, suspend or report an organisation, and we may preserve evidence where
            necessary. Verification is not a guarantee of an institution’s quality, accreditation
            or conduct.
          </p>
        </Section>

        <Section icon={<Upload size={18} />} title="4. Content you submit">
          <p>When you upload or publish content, you confirm that:</p>
          <ul>
            <li>You are the author or have all rights and permissions needed to share it.</li>
            <li>It does not infringe copyright, trade marks, privacy, confidentiality or other rights.</li>
            <li>It is not defamatory, fraudulent, obscene, hateful or otherwise unlawful.</li>
            <li>You have consent for any third-party personal data it contains.</li>
            <li>It does not contain malware or instructions for causing harm.</li>
          </ul>
          <p>
            You keep ownership of your content. You grant Curious Bright a non-exclusive,
            royalty-free, worldwide licence to host, store, cache, display, distribute and make
            available the content you publish, and to create technical copies needed to operate the
            service. This licence ends when the content is deleted, except for backups, legal
            records, and content already shared or cited by others.
          </p>
          <p>
            Unless you state a different licence, published papers are made available under{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
              Creative Commons Attribution 4.0 (CC BY 4.0)
            </a>
            . You are responsible for ensuring that the licence you choose is consistent with the
            rights you hold.
          </p>
        </Section>

        <Section icon={<AlertTriangle size={18} />} title="5. Community and study rooms">
          <p>When you use community spaces, rooms, messages or video, you agree to:</p>
          <ul>
            <li>Treat everyone with respect. Harassment, threats, hate speech, sexual exploitation and bullying are prohibited.</li>
            <li>Do not share another person’s private information without their explicit permission.</li>
            <li>Do not use the platform to cheat, plagiarise, impersonate, or coordinate academic dishonesty.</li>
            <li>Do not spam, flood, scrape, automate, or attempt to overwhelm rooms or members.</li>
            <li>Do not record or broadcast a call without the knowledge and consent of participants where required by law.</li>
            <li>Follow room-specific rules and the reasonable instructions of moderators.</li>
          </ul>
          <p>
            Video and audio rooms are provided through LiveKit. We do not record calls by default.
            Participants are responsible for complying with recording and consent laws in their
            jurisdiction.
          </p>
        </Section>

        <Section icon={<Ban size={18} />} title="6. Prohibited uses">
          <p>You must not:</p>
          <ul>
            <li>Break authentication, access controls, rate limits, or security features.</li>
            <li>Upload malware, phishing content, or code designed to disrupt the service.</li>
            <li>Scrape or harvest member data or content in bulk without written permission.</li>
            <li>Use the API or upload features for unauthorised commercial data aggregation.</li>
            <li>Upload textbooks, papers or datasets you obtained illegally or without permission.</li>
            <li>Create accounts to evade a suspension, ban, seat limit or moderation decision.</li>
            <li>Use the service to violate sanctions, export controls, privacy law or other applicable law.</li>
            <li>Misrepresent your identity, affiliation, qualifications or authority to act for an institution.</li>
          </ul>
        </Section>

        <Section icon={<Scale size={18} />} title="7. Moderation and enforcement">
          <p>
            We may review, reject, unpublish, restrict or remove content; limit features; suspend
            or terminate accounts or organisations; and preserve or report evidence where we
            reasonably believe these Terms or the law have been violated. We aim to act
            proportionately and to explain material decisions.
          </p>
          <p>
            You can report content through the in-app report feature. Moderation appeals can be
            sent to <a href="mailto:moderation@curiousbright.com.ng">moderation@curiousbright.com.ng</a>.
            Verification decisions can be discussed with the review team at{' '}
            <a href="mailto:verification@curiousbright.com.ng">verification@curiousbright.com.ng</a>.
          </p>
        </Section>

        <Section icon={<Scale size={18} />} title="8. Plans, payments and subscriptions">
          <ul>
            <li>Some features require a paid organisation plan. Prices, seat limits and features are shown at checkout and may change with notice.</li>
            <li>Payments are processed by Paystack. You authorise us and Paystack to charge the agreed amount and applicable taxes.</li>
            <li>Subscriptions renew according to the interval shown unless cancelled. Cancellation stops future renewals but does not automatically refund the current period.</li>
            <li>We may suspend paid features if a payment fails, is reversed or is disputed.</li>
            <li>Refunds are provided where required by law or expressly stated at purchase. Contact <a href="mailto:billing@curiousbright.com.ng">billing@curiousbright.com.ng</a>.</li>
            <li>You are responsible for keeping billing contacts and organisation details accurate.</li>
          </ul>
        </Section>

        <Section icon={<Shield size={18} />} title="9. Analytics and privacy choices">
          <p>
            We use a self-hosted, cookieless Umami instance for coarse product analytics and our own
            PostgreSQL database for aggregate administrator reporting. We honour Do Not Track and
            Global Privacy Control. We do not send message bodies, names, email addresses, search
            queries, document contents or payment details to analytics. See the{' '}
            <Link to="/privacy">Privacy Policy</Link> for details and choices.
          </p>
        </Section>

        <Section icon={<FileText size={18} />} title="10. Open source and branding">
          <p>
            Parts of the Curious Bright platform may be released under an open-source licence. Your
            use of those components is governed by the applicable licence. The Curious Bright name,
            logos, visual identity and domain names are not licensed for reuse without our prior
            written permission, except for accurate references to the service.
          </p>
        </Section>

        <Section icon={<AlertTriangle size={18} />} title="11. Disclaimers and liability">
          <p>
            Curious Bright is provided on an “as is” and “as available” basis. To the fullest extent
            permitted by law, we disclaim implied warranties of merchantability, fitness for a
            particular purpose, non-infringement, accuracy and uninterrupted availability. Academic
            content, verification statuses and user statements represent the views or conduct of
            their authors, not a guarantee or endorsement by Curious Bright.
          </p>
          <p>
            To the fullest extent permitted by law, Curious Bright and its directors, employees,
            contractors and partners will not be liable for indirect, incidental, special,
            consequential or punitive damages, loss of profits, loss of data, loss of goodwill, or
            business interruption arising from your use of the service. Our total aggregate
            liability for direct claims relating to the service will not exceed the greater of (a)
            the amount you paid to Curious Bright for the service in the twelve months before the
            event giving rise to the claim, or (b) ₦50,000 (or the equivalent in your currency).
            Nothing in these Terms excludes liability that cannot be excluded by law, including
            liability for fraud or death/personal injury caused by negligence.
          </p>
        </Section>

        <Section icon={<Shield size={18} />} title="12. Indemnity, termination and governing law">
          <p>
            You agree to indemnify and hold harmless Curious Bright and its personnel from claims,
            losses, liabilities and reasonable costs arising from content you submit, your breach of
            these Terms, your violation of law, or your infringement of another person’s rights.
          </p>
          <p>
            You may stop using the service at any time and delete your account from Account
            Settings. We may suspend or terminate access where you materially breach these Terms,
            create risk, fail to pay, or where required by law. On termination, your right to use
            the service ends; provisions that by their nature should survive will survive.
          </p>
          <p>
            These Terms are governed by the laws of the Federal Republic of Nigeria, without regard
            to conflict-of-law rules. Before starting formal proceedings, contact us at{' '}
            <a href="mailto:legal@curiousbright.com.ng">legal@curiousbright.com.ng</a> and attempt
            to resolve the dispute in good faith for at least 30 days. Subject to mandatory consumer
            protections, disputes will be brought in the courts of competent jurisdiction in
            Nigeria.
          </p>
        </Section>

        <Section icon={<RefreshCcw size={18} />} title="13. Changes and contact">
          <p>
            We may update these Terms. When we make a material change, we will publish the new
            version, update the version number and “Last updated” date, and ask signed-in members to
            re-accept the updated Terms and Privacy Policy on their next visit. If you do not agree,
            you may stop using the service and delete your account.
          </p>
          <ul>
            <li><strong>General:</strong> <a href="mailto:hello@curiousbright.com.ng">hello@curiousbright.com.ng</a></li>
            <li><strong>Legal:</strong> <a href="mailto:legal@curiousbright.com.ng">legal@curiousbright.com.ng</a></li>
            <li><strong>Privacy:</strong> <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a></li>
            <li><strong>Moderation appeals:</strong> <a href="mailto:moderation@curiousbright.com.ng">moderation@curiousbright.com.ng</a></li>
            <li><strong>Billing:</strong> <a href="mailto:billing@curiousbright.com.ng">billing@curiousbright.com.ng</a></li>
            <li><strong>Registered address:</strong> <strong>[REGISTERED ADDRESS]</strong></li>
          </ul>
        </Section>

        <div className="policy-footer-note">
          By accessing or using Curious Bright, you acknowledge that you have read and understood
          these Terms and agree to be bound by them. This draft is not legal advice and must be
          reviewed by qualified counsel before it is relied on as the final public terms.
        </div>
      </div>

      <footer className="policy-page-footer">
        <p>© {new Date().getFullYear()} Curious Bright. Open Source &amp; Open Access.</p>
        <div className="policy-page-footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <span>•</span>
          <Link to="/terms">Terms of Use</Link>
          <span>•</span>
          <Link to="/">Home</Link>
        </div>
      </footer>
    </div>
  );
};
