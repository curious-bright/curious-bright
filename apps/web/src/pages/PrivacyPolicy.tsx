import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const Section: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <div className="policy-card">
    <div className="policy-card-header">
      <i className={`bx ${icon}`} style={{ fontSize: '1.1rem', color: 'var(--color-coral)' }} />
      <h2 className="policy-card-title">{title}</h2>
    </div>
    <div className="policy-card-body">{children}</div>
  </div>
);

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'Privacy Policy — Curious Bright';
  }, []);

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div className="policy-badge">
          <i className="bx bx-shield-alt-2" />
          <span>PRIVACY POLICY</span>
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
            fontWeight: 700,
            color: 'var(--color-ink)',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            margin: '0.75rem 0 0.75rem',
          }}
        >
          Your privacy, in plain language
        </h1>
        <p style={{ color: 'var(--color-faded-ink)', maxWidth: '660px', lineHeight: 1.7 }}>
          This policy explains what Curious Bright collects, why we collect it, who processes it,
          how long we keep it, and the choices you have. We do not sell personal data, we do not use
          advertising trackers, and we do not put message contents into analytics.
        </p>
        <div
          style={{
            marginTop: '0.75rem',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-faded-ink)',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span>Version 2026-10-28</span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span>Last updated: 28 October 2026</span>
          <span style={{ opacity: 0.4 }}>•</span>
          <Link to="/terms" style={{ color: 'var(--color-teal)', textDecoration: 'none' }}>
            View Terms of Use →
          </Link>
        </div>
      </div>

      <div className="policy-sections">
        <Section icon="bx-buildings" title="1. Who is responsible for your data">
          <p>
            Curious Bright is an early-stage academic platform designed and operated by the Curious
            Bright development team based in Nigeria (<a href="https://curiousbright.com.ng">curiousbright.com.ng</a>,
            “Curious Bright”, “we”, “us” or “our”). We are the data controller for the personal data
            described in this policy, except where an institution uses the platform to process
            student or staff data on its own behalf — in that case the institution is the controller
            and we act as its processor.
          </p>
          <p>
            We are not yet incorporated as a limited liability company, so there is no company
            registration number to publish. When our registration completes we will add the
            registered legal name, registration number and registered postal address to this section
            and notify members of the change.
          </p>
          <p>
            Contact for privacy questions, rights requests and complaints:{' '}
            <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>.
          </p>
          <p>
            Data Protection Officer: <a href="mailto:dpo@curiousbright.com.ng">dpo@curiousbright.com.ng</a>.
            We do not publish the DPO’s name for privacy reasons, but the mailbox is monitored by a
            named individual accountable for our data protection programme, and we will identify
            them to you or to a regulator on request. Security issues:{' '}
            <a href="mailto:security@curiousbright.com.ng">security@curiousbright.com.ng</a>.
          </p>
        </Section>

        <Section icon="bx-show" title="2. The data we collect">
          <p>We collect only what is needed to run a learning and research community:</p>
          <ul>
            <li>
              <strong>Account data</strong> — username, email address, password hash (or the fact
              that you sign in with Google, see below), profile photo, bio, school or organisation,
              country, subject expertise, and account preferences.
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
              <strong>Content you submit</strong> — posts, comments, research papers, PDFs, study
              room messages, whiteboard snapshots, reports, and peer-review decisions. Content is
              stored on our own infrastructure or our file-storage processor.
            </li>
            <li>
              <strong>Organisation verification data</strong> — legal name, organisation type,
              country, registered address, website, official email address, contact person, contact
              email and phone, registration number, registration documents, head-of-institution
              details, review notes, and audit events. Documents are stored privately and are not
              served from a public media folder.
            </li>
            <li>
              <strong>Usage and activity metadata</strong> — coarse feature events, daily activity
              records used to calculate active-user counts, video-session duration totals, and
              aggregate organisation/platform metrics. We do not record the content of messages or
              calls in these records.
            </li>
            <li>
              <strong>Payment and subscription data</strong> — plan, billing interval, seat count,
              currency, payment status, and a payment reference supplied by Paystack. We do not
              store full card numbers; payment credentials are handled by Paystack.
            </li>
            <li>
              <strong>Communications</strong> — emails we send you (verification, security,
              review, billing, and service notices) and support messages you send us.
            </li>
          </ul>
          <p>
            We do not intentionally collect special-category data (such as health, religious or
            biometric data) through the platform. Do not upload another person’s personal data
            unless you have a lawful basis and their permission where required.
          </p>
          <p>
            <strong>Signing in with Google.</strong> Google sign-in is optional and you can always
            register with an email address and password instead. We request only the OpenID Connect{' '}
            <code>openid</code>, <code>email</code> and <code>profile</code> scopes, and with your
            explicit authorisation Google tells us your name, email address, whether Google has
            verified that address, a profile picture URL and a unique Google user ID. We use that
            information only to create your account, sign you in, prefill your display name and
            avatar, and recognise an existing account that uses the same email address. The exchange
            uses the authorisation-code flow with PKCE, so the code Google issues is verified
            server-side and cannot be replayed from another device.
          </p>
          <p>
            We do not request, receive or store data from Gmail, Drive, Contacts, Calendar, YouTube
            or any other Google service; we keep no Google access or refresh token for ongoing
            access; we do not act on your behalf at Google after sign-in; and we do not use your
            Google information for advertising, cross-site tracking or profiling. Your event data
            records only that an account used Google as its sign-in method, never the Google account
            itself. You can revoke our access at any time in your Google Account under “Data &amp;
            privacy” →{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              third-party sites and apps with access to your account
            </a>{' '}
            — set a Curious Bright password first if you plan to do that. Revoking access does not
            delete your Curious Bright account. Your choice to share data with us through Google is
            also governed by Google’s{' '}
            <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </Section>

        <Section icon="bx-target-lock" title="3. Why we use your data and our lawful bases">
          <p>
            We process personal data only when a lawful basis exists under the Nigeria Data
            Protection Act 2023 (NDPA) and, where it applies to you, the EU General Data Protection
            Regulation (GDPR) or UK GDPR. The bases we rely on are:
          </p>
          <ul>
            <li>
              <strong>Provide the service (contract)</strong> — create and secure accounts, publish
              content, run rooms, deliver messages, verify institutions, and administer
              subscriptions.
            </li>
            <li>
              <strong>Protect the platform and its members (legitimate interests)</strong> — detect
              spam, abuse, fraud, scraping and attacks; enforce our Terms; maintain audit trails;
              and improve reliability.
            </li>
            <li>
              <strong>Verify institutions (contract and legitimate interests)</strong> — confirm
              that an organisation is legitimate, that its official email domain is controlled by
              it, and that its registration evidence is credible before unlocking student accounts.
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
              <strong>Consent</strong> — where we rely on consent (for example, optional analytics
              in a jurisdiction that requires it, or a specific feature), you may withdraw it at
              any time without affecting prior lawful processing.
            </li>
          </ul>
          <p>
            We do not use your data to train third-party AI models, sell insights to advertisers,
            or build advertising profiles.
          </p>
        </Section>

        <Section icon="bx-globe" title="4. Public content and visibility">
          <p>
            Your username, profile photo, bio, school/organisation, badges and published posts are
            visible to other members and, where a post is public, to visitors. Study-room messages
            are visible to room members. Institution verification documents and review notes are
            visible only to authorised organisation admins and the platform review team.
          </p>
          <p>
            You choose post visibility where the product offers it (public, followers, or room
            only). Once content is shared, other people may copy or screenshot it; the platform
            cannot control that. Do not post personal data you are not comfortable sharing.
          </p>
        </Section>

        <Section icon="bx-bar-chart-alt-2" title="5. Analytics and measurement">
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
            enabled, the analytics script is not loaded and no analytics events are sent. Umami is
            configured with <code>data-do-not-track="true"</code> as an additional safeguard.
          </p>
          <p>
            <strong>Admin analytics.</strong> Platform administrators can view aggregate metrics
            (for example, organisation counts, verification funnel, active members, posts, rooms,
            reports and video minutes) generated from our own PostgreSQL database. These reports do
            not include message bodies, private post contents, verification documents, or other
            free-text member content.
          </p>
          <p>
            <strong>Server logs.</strong> Our servers keep request logs (IP address, timestamp,
            method, path, status and user agent) for security, debugging and abuse prevention.
          </p>
        </Section>

        <Section icon="bx-cookie" title="6. Cookies, local storage and similar technologies">
          <p>
            Curious Bright does not use advertising cookies or third-party tracking cookies. We use
            browser local storage for essential session tokens, the selected theme, and a small
            amount of UI state. These are necessary to keep you signed in and to remember your
            preferences. Umami is cookieless. Cloudflare may set strictly necessary security
            cookies at the network edge.
          </p>
          <p>
            You can clear local storage and cookies through your browser, but doing so will sign
            you out and may reset preferences. Blocking essential storage may prevent the service
            from working.
          </p>
        </Section>

        <Section icon="bx-plug" title="7. Who we share data with">
          <p>We use carefully selected processors and infrastructure providers, including:</p>
          <ul>
            <li>
              <strong>Identity provider — Google</strong>, if you choose Sign in with Google. Google
              authenticates you and, with your authorisation, shares your name, email address,
              email-verification status, profile picture and Google user ID with us. Google’s
              privacy policy applies to that exchange, and we never receive your Google password.
            </li>
            <li>
              <strong>Hosting and network</strong> — our cloud host and Cloudflare for DNS, TLS,
              caching, WAF and DDoS protection.
            </li>
            <li>
              <strong>Email delivery</strong> — Resend for transactional email (verification,
              security, review and billing notices). Email content and recipient addresses are
              processed to deliver the message.
            </li>
            <li>
              <strong>Payments</strong> — Paystack for card and local payment processing, fraud
              checks and settlement. Paystack’s own privacy terms apply to payment credentials.
            </li>
            <li>
              <strong>Real-time video</strong> — LiveKit for audio/video rooms. Media is routed
              through the configured LiveKit service; we do not record calls by default.
            </li>
            <li>
              <strong>File storage</strong> — our object storage or Cloudflare R2 for uploaded
              files, with private access controls and short-lived signed URLs for verification
              documents.
            </li>
            <li>
              <strong>Analytics</strong> — our self-hosted Umami instance and PostgreSQL database.
              No third-party advertising or behavioural analytics provider receives member data.
            </li>
          </ul>
          <p>
            We may also disclose data where required by law, to respond to valid legal process, to
            protect the rights and safety of our members or the public, or as part of a merger,
            acquisition or reorganisation (with notice where required). We do not sell personal
            data.
          </p>
        </Section>

        <Section icon="bx-transfer" title="8. International transfers">
          <p>
            We are based in Nigeria and may use service providers in other countries, including
            the European Economic Area, the United Kingdom and the United States. Where personal
            data leaves Nigeria or the EEA/UK, we rely on an appropriate transfer mechanism, such
            as an adequacy decision, standard contractual clauses, or another lawful safeguard,
            and we take steps to ensure the recipient applies appropriate protections.
          </p>
          <p>
            You can ask us for more information about the safeguards used for a particular
            transfer by contacting <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>.
          </p>
        </Section>

        <Section icon="bx-lock-alt" title="9. How we protect your data">
          <ul>
            <li>Passwords are stored as one-way hashes, never in plain text.</li>
            <li>
              Accounts created through Google sign-in have no password on our servers at all; Google
              is the authentication authority for them and we store no Google credential.
            </li>
            <li>
              Authentication uses short-lived access tokens and refresh tokens; tokens are stored
              in browser local storage and sent over HTTPS.
            </li>
            <li>
              Administrative access is restricted, permissioned and logged. Sensitive actions
              create audit events.
            </li>
            <li>
              Verification documents are private. Admin review links are signed and expire after
              five minutes.
            </li>
            <li>
              We apply rate limits, CORS restrictions, secure headers, upload validation and
              monitoring to reduce abuse.
            </li>
            <li>
              We use encryption in transit (HTTPS/TLS) and rely on encrypted storage at rest where
              our providers support it.
            </li>
          </ul>
          <p>
            No system is completely secure. If you believe your account or data has been
            compromised, contact <a href="mailto:security@curiousbright.com.ng">security@curiousbright.com.ng</a>{' '}
            immediately.
          </p>
        </Section>

        <Section icon="bx-time-five" title="10. How long we keep data">
          <ul>
            <li>
              <strong>Account and profile data</strong> — while your account is active and for a
              reasonable period afterwards to handle disputes, backups and legal obligations.
            </li>
            <li>
              <strong>Published content</strong> — while published, and potentially after account
              deletion to preserve academic citation integrity. You can request redaction of
              personal details.
            </li>
            <li>
              <strong>Verification records and documents</strong> — for as long as the organisation
              is active and for a reasonable audit period afterwards, then securely deleted or
              anonymised.
            </li>
            <li>
              <strong>Consent records</strong> — for as long as needed to demonstrate compliance
              with the applicable policy version.
            </li>
            <li>
              <strong>Security and access logs</strong> — generally up to 90 days, unless a longer
              period is needed for an investigation or legal obligation.
            </li>
            <li>
              <strong>Aggregate analytics</strong> — retained in aggregate form; individual
              analytics events are not linked to message contents.
            </li>
            <li>
              <strong>Billing records</strong> — for the period required by tax and accounting law.
            </li>
          </ul>
        </Section>

        <Section icon="bx-user-check" title="11. Your rights">
          <p>
            Depending on your location, you may have the right to access, correct, delete, restrict
            or object to processing of your personal data; to data portability; to withdraw
            consent; and not to be subject to solely automated decisions with legal or similarly
            significant effects. These rights arise under the Nigeria Data Protection Act 2023 and,
            where relevant, the GDPR/UK GDPR. We do not make such automated decisions.
          </p>
          <ul>
            <li>
              <strong>Access and portability</strong> — use “Export my data” in Account Settings or
              email us.
            </li>
            <li>
              <strong>Correction</strong> — update your profile in Account Settings or contact us
              for data you cannot edit.
            </li>
            <li>
              <strong>Deletion</strong> — use “Delete account” in Account Settings or email{' '}
              <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a>. Some
              records may be retained where the law requires it or to preserve published academic
              records.
            </li>
            <li>
              <strong>Objection/restriction</strong> — contact us; we will assess the request and
              explain any lawful basis that requires us to continue.
            </li>
          </ul>
          <p>
            We aim to respond within 30 days. We may need to verify your identity before acting. If
            you are in Nigeria, you can complain to the Nigeria Data Protection Commission (NDPC),
            the regulator established under the Nigeria Data Protection Act 2023. If you are in the
            EEA or UK, you can complain to your local supervisory authority or the UK Information
            Commissioner’s Office.
          </p>
        </Section>

        <Section icon="bx-child" title="12. Children and young people">
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

        <Section icon="bx-refresh" title="13. Changes to this policy">
          <p>
            We may update this policy to reflect changes in our service, technology or legal
            obligations. When we make a material change, we will publish the new version, update
            the “Last updated” date and version number, and ask signed-in members to re-accept the
            updated Terms and Privacy Policy on their next visit. If you do not agree, you may stop
            using the service and request deletion of your account.
          </p>
          <p>
            The version you accepted, and the time of acceptance, are stored so we can demonstrate
            compliance.
          </p>
        </Section>

        <Section icon="bx-envelope" title="14. Contact and complaints">
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
            If you are not satisfied with our response, you may complain to the Nigeria Data
            Protection Commission or your local supervisory authority.
          </p>
        </Section>

        <div className="policy-footer-note">
          This policy is written for our members first. If any part of it is unclear, email{' '}
          <a href="mailto:privacy@curiousbright.com.ng">privacy@curiousbright.com.ng</a> and we will
          explain it plainly, in writing, on request.
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', paddingTop: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/terms" className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.5rem 1.25rem' }}>
            <i className="bx bx-file" />
            Read Terms of Use
          </Link>
          <Link to="/settings" className="btn btn-primary" style={{ fontSize: '0.8125rem', padding: '0.5rem 1.25rem' }}>
            <i className="bx bx-cog" />
            Manage my data
          </Link>
        </div>
      </div>
    </div>
  );
}
