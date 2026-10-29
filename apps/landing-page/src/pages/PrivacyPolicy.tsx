import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ArrowLeft,
  Shield,
  Eye,
  Lock,
  Globe,
  Trash2,
  Users,
  FileText,
  KeyRound,
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
          Curious Bright is an open-access academic platform for sharing research, teaching and
          collaborating. This policy explains exactly what personal data we collect, why we collect
          it, who processes it, how long we keep it, and the choices you have. We do not sell
          personal data, we do not run advertising trackers, and we never put the contents of your
          messages into analytics.
        </p>
        <div className="policy-meta">
          <span>Version 2026-10-28</span>
          <span className="policy-meta-dot">•</span>
          <span>Last updated: 28 October 2026</span>
          <span className="policy-meta-dot">•</span>
          <Link to="/terms" style={{ color: 'var(--color-teal)' }}>Terms of Use →</Link>
        </div>
      </div>

      <div className="policy-content">
        <Section icon={<Shield size={18} />} title="1. Who we are and who is responsible for your data">
          <p>
            Curious Bright is an early-stage academic platform designed and operated by the Curious
            Bright development team based in Nigeria (
            <a href="https://curiousbright.com.ng">curiousbright.com.ng</a>, “Curious Bright”, “we”,
            “us” or “our”). We are the data controller for the personal data described in this
            policy, except where a school or institution uses the platform to process its own
            students’ and staff’s data, in which case that institution is the controller and we act
            as its processor.
          </p>
          <p>
            We are not yet incorporated as a limited liability company, so there is no company
            registration number to publish. When our registration completes we will add the
            registered legal name, registration number and registered postal address to this
            section and notify members of the change.
          </p>
          <p>
            Privacy contact and data rights requests:{' '}
            <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a> — monitored
            by the founder and by the Data Protection Officer function below.
          </p>
          <p>
            Data Protection Officer: <strong>dpo@curiousbright.com.ng</strong>. We do not name the
            DPO publicly for privacy reasons, but the mailbox is monitored by a named individual
            accountable for our data protection programme, and we will identify them to you on
            request or to any regulator on request.
          </p>
          <p>
            Security issues: <a href="mailto:security@curiousbright.com.ng">security@curiousbright.com.ng</a>.
            General enquiries: <a href="mailto:hello@curiousbright.com.ng">hello@curiousbright.com.ng</a>.
          </p>
        </Section>

        <Section icon={<Eye size={18} />} title="2. What we collect">
          <ul>
            <li>
              <strong>Account data</strong> — username, email address, password hash (or the fact
              that you sign in with Google, see section 3), profile photo, bio, school or
              organisation, country, subject expertise, and account preferences.
            </li>
            <li>
              <strong>Google sign-in data</strong> — if you choose “Continue with Google”: your
              Google account name, email address, profile picture and a stable Google user
              identifier. We never receive or store your Google password.
            </li>
            <li>
              <strong>Authentication and security data</strong> — verification codes and their
              hashes, timestamps, password-reset tokens, session and refresh tokens, IP address,
              browser user agent, and security/audit logs.
            </li>
            <li>
              <strong>Content you submit</strong> — posts, comments, questions, answers, research
              papers, PDFs/EPUBs, study-room messages, whiteboard snapshots, reports, and
              peer-review decisions.
            </li>
            <li>
              <strong>Organisation verification data</strong> — legal name, organisation type,
              country, registered address, website, official email, contact person, contact email
              and phone, registration number, registration documents, head-of-institution details,
              review notes, and audit events. Documents are stored privately and are never served
              from a public media folder.
            </li>
            <li>
              <strong>Usage and activity metadata</strong> — coarse feature events, daily activity
              records used to calculate active-user counts, video-session duration totals, and
              aggregate platform/organisation metrics. These records do not contain the content of
              messages or calls.
            </li>
            <li>
              <strong>Payment data</strong> — plan, billing interval, seat count, currency, payment
              status, and a Paystack transaction reference. We do not store full card numbers.
            </li>
            <li>
              <strong>Communications</strong> — emails we send you (verification, security, review,
              billing and service notices) and support messages you send us.
            </li>
          </ul>
          <p>
            We do not intentionally collect special-category data such as health, religious or
            biometric information. Please do not upload another person’s personal data unless you
            have a lawful basis to do so.
          </p>
        </Section>

        <Section icon={<KeyRound size={18} />} title="3. Signing in with Google">
          <p>
            You may create and access your Curious Bright account using your Google account instead
            of a password. Google sign-in is optional; you can always register and sign in with an
            email address and password.
          </p>
          <p>
            <strong>What we request from Google.</strong> We use the OpenID Connect{' '}
            <code>openid</code>, <code>email</code> and <code>profile</code> scopes. In response to
            your explicit authorisation, Google provides us with your name, email address, whether
            Google has verified that email address, a profile picture URL, and a unique Google user
            ID. The sign-in flow uses the authorisation-code flow with PKCE, so the code is
            exchanged by our servers using credentials that are never exposed to your browser.
          </p>
          <p>
            <strong>What we use it for.</strong> Only to create your Curious Bright account, to
            authenticate you when you sign in, to prefill your display name and avatar on your
            profile, and to match your account to an existing one if you previously registered with
            the same email address.
          </p>
          <p>
            <strong>What we do not do.</strong> We do not request, receive or store data from
            Gmail, Google Drive, Contacts, Calendar, YouTube or any other Google service. We do not
            retain a Google access or refresh token for ongoing access, we do not ask Google for
            permission to act on your behalf after sign-in has completed, and we do not use your
            Google information for advertising, cross-site tracking or profiling.
          </p>
          <p>
            <strong>Retention.</strong> We keep your Google user ID, name, email address and profile
            picture for as long as your Curious Bright account exists. You can change your name and
            avatar inside Curious Bright without affecting your Google account, and Google
            sign-in accounts can add a password later from Account Settings.
          </p>
          <p>
            <strong>Withdrawing Google’s authorisation.</strong> You can revoke Curious Bright’s
            access at any time in your Google Account under “Data &amp; privacy” →{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              Third-party sites and apps with access to your account
            </a>
            . Revoking access does not delete your Curious Bright account, but you will need to sign
            in another way; set a password first if you plan to revoke access. To delete your
            Curious Bright account instead, see section 11.
          </p>
          <p>
            Your decision to share information through Google is also governed by Google’s{" "}
            <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>{' '}
            and{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </Section>

        <Section icon={<FileText size={18} />} title="4. Why we use your data and our lawful bases">
          <p>
            We process personal data only when a lawful basis exists under the Nigeria Data
            Protection Act 2023 (NDPA) and, where it applies to you, the EU General Data Protection
            Regulation (GDPR) or UK GDPR. The bases we rely on are:
          </p>
          <ul>
            <li>
              <strong>Provide the service (contract)</strong> — create and secure accounts,
              authenticate you (password, email code or Google sign-in), publish content, run study
              rooms and calls, deliver messages, verify institutions, and administer subscriptions.
            </li>
            <li>
              <strong>Protect the platform and its members (legitimate interests)</strong> — detect
              spam, abuse, fraud, scraping and attacks; enforce our Terms of Use; maintain audit
              trails; and improve reliability.
            </li>
            <li>
              <strong>Verify institutions (contract and legitimate interests)</strong> — confirm that
              an organisation is legitimate, controls its official email domain, and has credible
              registration evidence before unlocking student accounts.
            </li>
            <li>
              <strong>Communicate with you (contract and legitimate interests)</strong> — send
              verification, security, review, billing and essential service notices. We do not send
              marketing email without a separate opt-in where the law requires it.
            </li>
            <li>
              <strong>Comply with law (legal obligation)</strong> — retain records where required,
              respond to valid legal process, and prevent prohibited transactions.
            </li>
            <li>
              <strong>Consent</strong> — where we rely on consent, such as your choice to sign in
              with Google, your optional cookies in jurisdictions that require it, or a specific
              feature, you may withdraw consent at any time without affecting processing that
              already happened lawfully.
            </li>
          </ul>
          <p>
            We do not use your data to train third-party artificial-intelligence models, we do not
            sell insights to advertisers, and we do not build advertising profiles.
          </p>
        </Section>

        <Section icon={<Users size={18} />} title="5. Public content and visibility">
          <p>
            Your username, profile photo, bio, school or organisation, badges and published posts
            are visible to other members and, where a post is public, to visitors. Study-room
            messages are visible to the members of that room. Institution verification documents and
            review notes are visible only to authorised organisation admins and our review team.
          </p>
          <p>
            You choose post visibility wherever the product offers it. Once content is shared, other
            people may copy, quote or screenshot it, and we cannot undo that. Do not publish personal
            data you are not comfortable sharing.
          </p>
        </Section>

        <Section icon={<Globe size={18} />} title="6. Analytics, cookies and local storage">
          <p>
            <strong>Product analytics (Umami).</strong> We run a self-hosted instance of Umami at{' '}
            <code>analytics.curiousbright.com.ng</code>. It is cookieless, uses no advertising
            identifiers, does not track you across other websites, and never receives message
            contents, email addresses, names, document contents, search queries or payment details.
            We record coarse events such as <code>sign_up</code>, <code>login</code>,{' '}
            <code>email_verified</code>, <code>post_created</code>, <code>follow</code>,{' '}
            <code>chat_started</code>, <code>org_registered</code>, <code>org_email_verified</code>,{' '}
            <code>org_approved</code> and <code>payment_success</code>, together with page paths and
            basic technical metadata (browser, operating system, language, screen size and
            approximate country). Our client suppresses page titles and referrers so that dynamic
            content and external search queries are not sent. Umami derives a rotating, salted
            anonymous session identifier from the request IP address and user agent to count visits;
            raw IP addresses are not stored as analytics fields. Sign-in-method events record only
            whether an account used Google or a password, never the Google account itself.
          </p>
          <p>
            We honour the browser’s Do Not Track signal and the Global Privacy Control. When either
            is enabled, the analytics script is not loaded and no events are sent. Umami is
            configured with <code>data-do-not-track="true"</code> as an additional safeguard.
          </p>
          <p>
            <strong>Admin analytics.</strong> Platform administrators can view aggregate metrics
            (organisation counts, verification funnel, active members, posts, rooms, reports and
            video minutes) computed from our own PostgreSQL database. Those reports do not include
            message bodies, private post contents, verification documents or other free-text member
            content.
          </p>
          <p>
            <strong>Cookies and local storage.</strong> We do not use advertising cookies or
            third-party tracking cookies. We use browser local storage for essential session tokens,
            your selected theme and small pieces of interface state, because these are necessary to
            keep you signed in and remember your preferences. Umami is cookieless. Cloudflare may set
            strictly necessary security cookies at the network edge, and Google may set its own
            cookies when you visit Google’s sign-in pages — Google’s privacy policy covers those.
            Clearing storage signs you out and may reset preferences; blocking it prevents the
            service from working.
          </p>
        </Section>

        <Section icon={<Globe size={18} />} title="7. Who we share data with">
          <p>We share personal data with a small number of carefully selected service providers:</p>
          <ul>
            <li>
              <strong>Identity provider — Google</strong>, if you choose Sign in with Google. Google
              authenticates you and, with your authorisation, tells us your name, email address,
              email-verification status, profile picture and Google user ID. Google’s own privacy
              policy applies to that exchange. We do not receive your Google password.
            </li>
            <li>
              <strong>Hosting and network</strong> — our cloud host and Cloudflare for DNS, TLS,
              caching, WAF and DDoS protection.
            </li>
            <li>
              <strong>Email delivery</strong> — Resend for transactional email (verification,
              security, review and billing notices). Recipient addresses and message content are
              processed only to deliver the message.
            </li>
            <li>
              <strong>Payments</strong> — Paystack for card and local payment processing, fraud checks
              and settlement. Paystack’s privacy terms apply to payment credentials.
            </li>
            <li>
              <strong>Real-time video and audio</strong> — LiveKit for study-room calls. Media is
              routed through the configured LiveKit service and is not recorded by default.
            </li>
            <li>
              <strong>File storage</strong> — object storage with private access controls and
              short-lived signed URLs for verification documents.
            </li>
            <li>
              <strong>Analytics</strong> — our self-hosted Umami instance and PostgreSQL database. No
              advertising or behavioural-analytics provider receives member data.
            </li>
          </ul>
          <p>
            If an institution administers your account, its admins can see your profile, activity
            and the organisation’s content within the permissions you have granted them. We may also
            disclose data where required by law, in response to valid legal process, to protect the
            rights and safety of our members or the public, or as part of a merger, acquisition or
            reorganisation (with notice where required). <strong>We do not sell personal data.</strong>
          </p>
        </Section>

        <Section icon={<Globe size={18} />} title="8. International transfers">
          <p>
            We are based in Nigeria and use service providers in other countries, including the
            United States (for example Google and Resend), the European Economic Area and the United
            Kingdom. Where personal data leaves Nigeria or the EEA/UK, we rely on an appropriate
            transfer mechanism, such as an adequacy decision, standard contractual clauses, or another
            lawful safeguard, and we take steps to ensure the recipient applies comparable protection.
          </p>
          <p>
            Ask for details about a specific transfer at{' '}
            <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>.
          </p>
        </Section>

        <Section icon={<Lock size={18} />} title="9. How we protect your data">
          <ul>
            <li>Passwords are stored as one-way hashes, never in plain text.</li>
            <li>
              Accounts created with Google sign-in have no password on our servers at all; Google is
              the authentication authority for them, and we store no Google credential.
            </li>
            <li>
              Authentication uses short-lived access tokens and refresh tokens over HTTPS. Google’s
              authorisation code is exchanged server-side using the PKCE verifier, so it cannot be
              replayed from another device.
            </li>
            <li>
              Administrative access is restricted, permissioned and logged; sensitive actions create
              audit events.
            </li>
            <li>Verification documents are private and admin review links are signed, expiring after five minutes.</li>
            <li>We apply rate limits, CORS restrictions, secure headers, upload validation and monitoring.</li>
            <li>We encrypt data in transit with TLS and rely on encryption at rest where providers support it.</li>
          </ul>
          <p>
            No system is completely secure. If you believe your account or data has been compromised,
            email <a href="mailto:security@curiousbright.com.ng">security@curiousbright.com.ng</a>{' '}
            immediately and change your password (or Google password) right away.
          </p>
        </Section>

        <Section icon={<Trash2 size={18} />} title="10. How long we keep your data">
          <ul>
            <li>
              <strong>Account and profile data</strong> — while your account is active, and for a
              reasonable period afterwards to handle disputes, backups and legal obligations.
            </li>
            <li>
              <strong>Published content</strong> — while published, and potentially after account
              deletion to preserve academic citation integrity. You can ask us to redact personal
              details from it.
            </li>
            <li>
              <strong>Verification records and documents</strong> — for the life of the relationship
              plus a reasonable audit period, then securely deleted or anonymised.
            </li>
            <li>
              <strong>Consent records</strong> — the policy version you accepted and the time of
              acceptance are kept as long as needed to demonstrate compliance.
            </li>
            <li>
              <strong>Security and access logs</strong> — generally up to 90 days, unless a longer
              period is needed for an investigation or a legal obligation.
            </li>
            <li>
              <strong>Aggregate analytics</strong> — retained in aggregate form; individual events are
              never linked to message contents.
            </li>
            <li>
              <strong>Billing records</strong> — for the period required by Nigerian tax and
              accounting law.
            </li>
          </ul>
        </Section>

        <Section icon={<Shield size={18} />} title="11. Your rights and choices">
          <p>
            Depending on where you live, you may have the right to access, correct, delete, restrict
            or object to the processing of your personal data; to data portability; to withdraw
            consent; and not to be subject to a decision based solely on automated processing that
            has legal or similarly significant effects. These rights arise under the Nigeria Data
            Protection Act 2023 and, where relevant, the GDPR or UK GDPR. We do not make such
            automated decisions.
          </p>
          <ul>
            <li>
              <strong>Access and portability</strong> — use “Export my data” in Account Settings, or
              email us and we will provide a machine-readable copy.
            </li>
            <li>
              <strong>Correction</strong> — edit your profile in Account Settings, or contact us about
              data you cannot change yourself.
            </li>
            <li>
              <strong>Deletion</strong> — use “Delete account” in Account Settings, or email{' '}
              <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>. Some
              records may be kept where the law requires it or to preserve published academic work.
            </li>
            <li>
              <strong>Objection and restriction</strong> — contact us and we will assess the request
              and explain any lawful basis that requires us to continue processing.
            </li>
            <li>
              <strong>Sign-in method</strong> — switch between password and Google sign-in at any
              time, or revoke Google’s access as described in section 3.
            </li>
          </ul>
          <p>
            We aim to respond within 30 days and may need to verify your identity first. If you are in
            Nigeria you can complain to the Nigeria Data Protection Commission (NDPC), the regulator
            established by the Nigeria Data Protection Act 2023. If you are in the EEA or the UK you
            can complain to your local supervisory authority or to the UK Information
            Commissioner’s Office. You can also contact Google at{' '}
            <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a> if you
            believe our use of Google sign-in is the problem, and we will address it.
          </p>
        </Section>

        <Section icon={<Users size={18} />} title="12. Children and young people">
          <p>
            Curious Bright is intended for learners aged 13 and over. In the EEA/UK we require users
            to be at least 16 unless a lower age is permitted by local law and appropriate safeguards
            apply. If you are under 18, use the platform with the knowledge and, where required, the
            consent of a parent or guardian.
          </p>
          <p>
            Institutions that create student accounts are responsible for obtaining any required
            parental or guardian consent and for ensuring the platform is appropriate for their
            students. If we learn that we collected data from a child below the applicable age without
            the required consent, we take reasonable steps to delete it.
          </p>
        </Section>

        <Section icon={<FileText size={18} />} title="13. Changes to this policy, and how to contact us">
          <p>
            We update this policy when our service, technology or legal obligations change. When we
            make a material change we publish the new version, update the version number and “Last
            updated” date above, and ask signed-in members to accept the updated Terms and Privacy
            Policy at their next visit. If you do not agree, you may stop using the service and
            request deletion of your account.
          </p>
          <ul>
            <li>
              <strong>Privacy and data rights:</strong>{' '}
              <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>
            </li>
            <li>
              <strong>Data Protection Officer:</strong>{' '}
              <a href="mailto:dpo@curiousbright.com.ng">dpo@curiousbright.com.ng</a>
            </li>
            <li>
              <strong>Security disclosures:</strong>{' '}
              <a href="mailto:security@curiousbright.com.ng">security@curiousbright.com.ng</a>
            </li>
            <li>
              <strong>General:</strong>{' '}
              <a href="mailto:hello@curiousbright.com.ng">hello@curiousbright.com.ng</a>
            </li>
            <li>
              <strong>Website:</strong>{' '}
              <a href="https://curiousbright.com.ng" target="_blank" rel="noopener noreferrer">
                curiousbright.com.ng
              </a>
            </li>
          </ul>
          <p>
            If you are not satisfied with our response, you may complain to the Nigeria Data Protection
            Commission or to your local supervisory authority.
          </p>
        </Section>

        <div className="policy-footer-note">
          This policy is written for our members first. If any part of it is unclear, email{' '}
          <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a> and we will
          explain it plainly, in writing, on request.
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
