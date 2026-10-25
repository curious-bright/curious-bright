import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ArrowLeft,
  Shield,
  Eye,
  Lock,
  Database,
  Globe,
  Trash2,
  Users,
  FileText,
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

export const PrivacyPolicy: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = 'Privacy Policy — Curious Bright';
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
          <Shield size={14} />
          <span>PRIVACY POLICY</span>
        </div>
        <h1>Your privacy, in plain language</h1>
        <p>
          Curious Bright is an open-access academic platform. This policy explains what we
          collect, why we collect it, who processes it, how long we keep it, and the choices
          you have. We do not sell personal data, use advertising trackers, or put message
          contents into analytics.
        </p>
        <div className="policy-meta">
          <span>Version 2026-10-25</span>
          <span className="policy-meta-dot">•</span>
          <span>Last updated: 25 October 2026</span>
          <span className="policy-meta-dot">•</span>
          <Link to="/terms" style={{ color: 'var(--color-teal)' }}>Terms of Use →</Link>
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
          working policy draft. The legal entity name, registered address, company registration
          number and Data Protection Officer details are placeholders and must be completed and
          reviewed by qualified Nigerian and, where relevant, EU/UK privacy counsel before launch.
        </div>

        <Section icon={<Database size={18} />} title="1. Who is responsible for your data">
          <p>
            Curious Bright is operated by <strong>[LEGAL ENTITY NAME]</strong>, a company
            registered in Nigeria with registration number <strong>[COMPANY REGISTRATION NUMBER]</strong>{' '}
            and registered address <strong>[REGISTERED ADDRESS]</strong> (“Curious Bright”, “we”,
            “us” or “our”). We are the data controller for the personal data described here,
            except where an institution uses the platform to process student or staff data on its
            own behalf.
          </p>
          <p>
            Privacy contact: <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>.
            Data Protection Officer: <strong>[DPO NAME]</strong>,{' '}
            <a href="mailto:dpo@curiousbright.com.ng">dpo@curiousbright.com.ng</a>, postal address{' '}
            <strong>[DPO POSTAL ADDRESS]</strong>. These details are placeholders until the DPO
            appointment is confirmed.
          </p>
        </Section>

        <Section icon={<Eye size={18} />} title="2. What we collect">
          <ul>
            <li>
              <strong>Account data</strong> — username, email address, password hash, profile photo,
              bio, school or organisation, country, subject expertise, and preferences.
            </li>
            <li>
              <strong>Authentication and security data</strong> — verification codes and their
              hashes, timestamps, password-reset tokens, session and refresh tokens, IP address,
              browser user agent, and security/audit logs.
            </li>
            <li>
              <strong>Content you submit</strong> — posts, comments, papers, PDFs/EPUBs, study-room
              messages, whiteboard snapshots, reports, and peer-review decisions.
            </li>
            <li>
              <strong>Organisation verification data</strong> — legal name, organisation type,
              country, registered address, website, official email, contact person, contact email
              and phone, registration number, registration documents, head-of-institution details,
              review notes, and audit events. Documents are stored privately and are not served
              from a public media folder.
            </li>
            <li>
              <strong>Usage and activity metadata</strong> — coarse feature events, daily activity
              records used to calculate active-user counts, video-session duration totals, and
              aggregate organisation/platform metrics. We do not record message or call contents
              in these records.
            </li>
            <li>
              <strong>Payment data</strong> — plan, billing interval, seat count, currency, payment
              status, and a Paystack reference. We do not store full card numbers.
            </li>
            <li>
              <strong>Communications</strong> — emails we send you (verification, security, review,
              billing, and service notices) and support messages you send us.
            </li>
          </ul>
          <p>
            We do not intentionally collect special-category data (such as health, religious or
            biometric data) through the platform. Do not upload another person’s personal data
            unless you have a lawful basis and their permission where required.
          </p>
        </Section>

        <Section icon={<FileText size={18} />} title="3. Why we use your data">
          <ul>
            <li>
              <strong>Provide the service (contract)</strong> — create and secure accounts, publish
              content, run rooms, deliver messages, verify institutions, and administer
              subscriptions.
            </li>
            <li>
              <strong>Protect the platform (legitimate interests)</strong> — detect spam, abuse,
              fraud, scraping and attacks; enforce our Terms; maintain audit trails; and improve
              reliability.
            </li>
            <li>
              <strong>Verify institutions (contract and legitimate interests)</strong> — confirm
              that an organisation is legitimate, controls its official email domain, and has
              credible registration evidence before unlocking student accounts.
            </li>
            <li>
              <strong>Communicate (contract and legitimate interests)</strong> — send verification,
              security, review, billing and essential service notices. We do not send marketing
              email without a separate opt-in where required.
            </li>
            <li>
              <strong>Comply with law (legal obligation)</strong> — retain records where required,
              respond to lawful requests, and prevent prohibited transactions.
            </li>
            <li>
              <strong>Consent</strong> — where we rely on consent, you may withdraw it at any time
              without affecting prior lawful processing.
            </li>
          </ul>
          <p>We do not use your data to train third-party AI models or build advertising profiles.</p>
        </Section>

        <Section icon={<Users size={18} />} title="4. Public content and visibility">
          <p>
            Your username, profile photo, bio, school/organisation, badges and published posts are
            visible to other members and, where a post is public, to visitors. Study-room messages
            are visible to room members. Institution verification documents and review notes are
            visible only to authorised organisation admins and the platform review team.
          </p>
          <p>
            You choose post visibility where the product offers it. Once content is shared, other
            people may copy or screenshot it. Do not post personal data you are not comfortable
            sharing.
          </p>
        </Section>

        <Section icon={<Globe size={18} />} title="5. Analytics and cookies">
          <p>
            <strong>Product analytics (Umami).</strong> We use a self-hosted instance of Umami at{' '}
            <code>analytics.curiousbright.com.ng</code>. It is cookieless, does not use advertising
            identifiers or track you across other websites, and does not receive message contents,
            email addresses, names, search queries, document contents, or payment details. We record
            coarse events such as <code>sign_up</code>, <code>email_verified</code>,{' '}
            <code>post_created</code>, <code>follow</code>, <code>chat_started</code>,{' '}
            <code>org_registered</code>, <code>org_email_verified</code>, <code>org_approved</code>{' '}
            and <code>payment_success</code>, together with page paths and basic technical metadata
            (browser, operating system, language, screen size, and approximate country). Our client
            suppresses page titles and referrers so dynamic content and external search queries are
            not sent. Umami derives a rotating, salted anonymous session identifier from the request
            IP address and user-agent to count visits; raw IP addresses are not stored as analytics
            fields.
          </p>
          <p>
            We honour the browser’s Do Not Track signal and Global Privacy Control. When either is
            enabled, the analytics script is not loaded and no events are sent. Umami is configured
            with <code>data-do-not-track="true"</code> as an additional safeguard.
          </p>
          <p>
            <strong>Admin analytics.</strong> Platform administrators can view aggregate metrics
            (organisation counts, verification funnel, active members, posts, rooms, reports and
            video minutes) generated from our own PostgreSQL database. These reports do not include
            message bodies, private post contents, verification documents, or other free-text
            member content.
          </p>
          <p>
            <strong>Cookies and local storage.</strong> We do not use advertising cookies or
            third-party tracking cookies. We use browser local storage for essential session
            tokens, selected theme, and small UI state. Umami is cookieless. Cloudflare may set
            strictly necessary security cookies at the network edge. Clearing storage will sign you
            out and may reset preferences.
          </p>
        </Section>

        <Section icon={<Globe size={18} />} title="6. Who we share data with">
          <ul>
            <li><strong>Hosting and network</strong> — our cloud host and Cloudflare for DNS, TLS, caching, WAF and DDoS protection.</li>
            <li><strong>Email delivery</strong> — Resend for transactional email.</li>
            <li><strong>Payments</strong> — Paystack for card and local payment processing, fraud checks and settlement.</li>
            <li><strong>Real-time video</strong> — LiveKit for audio/video rooms. We do not record calls by default.</li>
            <li><strong>File storage</strong> — object storage with private access controls and short-lived signed URLs for verification documents.</li>
            <li><strong>Analytics</strong> — our self-hosted Umami instance and PostgreSQL database. No third-party advertising or behavioural analytics provider receives member data.</li>
          </ul>
          <p>
            We may disclose data where required by law, to respond to valid legal process, to
            protect rights and safety, or as part of a merger, acquisition or reorganisation (with
            notice where required). We do not sell personal data.
          </p>
        </Section>

        <Section icon={<Globe size={18} />} title="7. International transfers">
          <p>
            We are based in Nigeria and may use service providers in other countries, including
            the EEA, the UK and the United States. Where personal data leaves Nigeria or the
            EEA/UK, we rely on an appropriate transfer mechanism, such as an adequacy decision,
            standard contractual clauses, or another lawful safeguard, and take steps to ensure the
            recipient applies appropriate protections.
          </p>
        </Section>

        <Section icon={<Lock size={18} />} title="8. How we protect your data">
          <ul>
            <li>Passwords are stored as one-way hashes, never in plain text.</li>
            <li>Authentication uses short-lived access tokens and refresh tokens over HTTPS.</li>
            <li>Administrative access is restricted, permissioned and logged; sensitive actions create audit events.</li>
            <li>Verification documents are private. Admin review links are signed and expire after five minutes.</li>
            <li>We apply rate limits, CORS restrictions, secure headers, upload validation and monitoring.</li>
            <li>We use encryption in transit and rely on encrypted storage at rest where providers support it.</li>
          </ul>
          <p>
            No system is completely secure. Report concerns to{' '}
            <a href="mailto:security@curiousbright.com.ng">security@curiousbright.com.ng</a>.
          </p>
        </Section>

        <Section icon={<Trash2 size={18} />} title="9. How long we keep data">
          <ul>
            <li><strong>Account and profile data</strong> — while active and for a reasonable period afterwards for disputes, backups and legal obligations.</li>
            <li><strong>Published content</strong> — while published, and potentially after account deletion to preserve academic citation integrity. You can request redaction of personal details.</li>
            <li><strong>Verification records and documents</strong> — for the active relationship plus a reasonable audit period, then securely deleted or anonymised.</li>
            <li><strong>Consent records</strong> — as long as needed to demonstrate compliance with the applicable policy version.</li>
            <li><strong>Security and access logs</strong> — generally up to 90 days unless needed for an investigation or legal obligation.</li>
            <li><strong>Aggregate analytics</strong> — retained in aggregate form; individual events are not linked to message contents.</li>
            <li><strong>Billing records</strong> — for the period required by tax and accounting law.</li>
          </ul>
        </Section>

        <Section icon={<Shield size={18} />} title="10. Your rights">
          <p>
            Depending on your location, you may have the right to access, correct, delete, restrict
            or object to processing; to data portability; to withdraw consent; and not to be
            subject to solely automated decisions with legal or similarly significant effects. We
            do not make such automated decisions.
          </p>
          <ul>
            <li><strong>Access and portability</strong> — use “Export my data” in Account Settings or email us.</li>
            <li><strong>Correction</strong> — update your profile in Account Settings or contact us for data you cannot edit.</li>
            <li><strong>Deletion</strong> — use “Delete account” in Account Settings or email <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>. Some records may be retained where required by law or to preserve published academic records.</li>
            <li><strong>Objection/restriction</strong> — contact us; we will assess the request and explain any lawful basis that requires us to continue.</li>
          </ul>
          <p>
            We aim to respond within 30 days and may need to verify your identity. If you are in
            Nigeria, you can complain to the Nigeria Data Protection Commission (NDPC). If you are
            in the EEA or UK, you can complain to your local supervisory authority or the UK
            Information Commissioner’s Office.
          </p>
        </Section>

        <Section icon={<Users size={18} />} title="11. Children and young people">
          <p>
            Curious Bright is intended for learners aged 13 and over. In the EEA/UK, we require
            users to be at least 16 unless a lower age is permitted by local law and appropriate
            safeguards apply. If you are under 18, you should use the platform with the knowledge
            and, where required, consent of a parent or guardian.
          </p>
          <p>
            Institutions that create student accounts are responsible for obtaining any required
            parental or guardian consent and for ensuring that use of the platform is appropriate
            for their students. If we learn that we have collected data from a child below the
            applicable age without the required consent, we will take reasonable steps to delete
            it.
          </p>
        </Section>

        <Section icon={<Shield size={18} />} title="12. Changes and contact">
          <p>
            We may update this policy to reflect changes in our service, technology or legal
            obligations. When we make a material change, we will publish the new version, update
            the version number and “Last updated” date, and ask signed-in members to re-accept the
            updated Terms and Privacy Policy on their next visit. If you do not agree, you may stop
            using the service and request deletion of your account. The version you accepted, and
            the time of acceptance, are stored so we can demonstrate compliance.
          </p>
          <ul>
            <li><strong>Privacy and data rights:</strong> <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a></li>
            <li><strong>Data Protection Officer:</strong> <a href="mailto:dpo@curiousbright.com.ng">dpo@curiousbright.com.ng</a></li>
            <li><strong>Security disclosures:</strong> <a href="mailto:security@curiousbright.com.ng">security@curiousbright.com.ng</a></li>
            <li><strong>General:</strong> <a href="mailto:hello@curiousbright.com.ng">hello@curiousbright.com.ng</a></li>
          </ul>
        </Section>

        <div className="policy-footer-note">
          This draft is provided for transparency and product development. It is not legal advice.
          The placeholders for the legal entity, address and DPO must be completed, and the policy
          must be reviewed by qualified counsel before it is relied on as the final public policy.
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
