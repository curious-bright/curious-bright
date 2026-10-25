# Organization verification and join requests

Organization verification is the trust boundary between a self-service
institutional workspace and the student accounts it can create. The member app
cannot create organizations; the institutional portal does that and sends
`X-Client-App: institutional`.

## 1. Status model

`Organization.verification_status` has six values:

| Status | Meaning | Can submit/resubmit? | Can create/invite students? | Appears in join search? |
|---|---|---|---|---|
| `unverified` | New organization, domain changed, or no complete application | Yes | No | No |
| `email_pending` | Application saved; the official email is not yet confirmed | Yes (the portal normally guides the user through confirmation instead) | No | No |
| `pending_review` | Official email confirmed; waiting for the platform review team | Only when an admin has requested more information | No | No |
| `verified` | Approved by platform staff | No | Yes | Yes, if join requests are enabled |
| `rejected` | Changes or evidence are required | Yes | No | No |
| `suspended` | Workspace restricted for policy, fraud, safety or legal reasons | No | No | No |

### Transitions

```text
unverified
  └─ submit verification ──> email_pending
                               ├─ confirm official email ──> pending_review
                               │                              ├─ approve ──> verified
                               │                              ├─ reject ───> rejected
                               │                              └─ request info (stays pending_review)
                               └─ change official email (stays email_pending)
rejected ── resubmit ──> email_pending or pending_review
verified ── suspend ──> suspended
any non-verified ── suspend ──> suspended
```

- A submission with an unconfirmed official email moves the organization to
  `email_pending`.
- Confirming the official email moves it to `pending_review` and notifies the
  platform review team.
- Approval requires `pending_review` **and** a confirmed official email. The API
  rejects approval with `email_not_confirmed` otherwise.
- “Request more information” keeps the organization in `pending_review` and
  sets `info_requested_at`/`info_request_note`. This is intentionally a flag,
  not a seventh status. The owner can resubmit while the flag is set.
- Rejection requires a note. Suspension requires a reason and sets
  `suspension_reason`; it clears `verified_at`.
- A verified organization that changes its email domain through
  `PATCH /api/organizations/<slug>/` returns to `unverified`, `verified_at` is
  cleared, auto-join is disabled, and an audit event is written. It must be
  verified again.

Existing memberships and existing students remain active when a status changes
to `unverified`, `email_pending`, `pending_review`, `rejected` or `suspended`.
Only new growth — invitations, student creation, bulk import, account linking,
join-request approval and domain auto-join — is blocked.

Every transition writes an `OrganizationVerificationEvent` and an
`OrganizationAuditLog` entry. The portal shows the event history with actor and
timestamp. Platform staff decisions are attributable.

## 2. Verification fields

The organization admin submits:

- legal / registered name;
- organization type: university, research institute, NGO or other;
- country and registered address;
- official website;
- official email on the organization's domain;
- contact person name, role, email and optional phone;
- registration number;
- registration document (PDF, JPEG or PNG);
- whether the institution is government-funded;
- head-of-institution details for government-funded universities:
  - `head_name` (full name);
  - `head_role` (Vice-Chancellor, Rector, Dean or equivalent);
  - `head_email` (official email).

The database keeps the legacy `head_of_institution` column. The API exposes it
as `head_name` and also accepts the legacy key on input.

For a government-funded / public university, the API requires a website,
either a registration number or a registration document, and the head-of-
institution name, role and email. This is enforced server-side by
`VerificationSubmitSerializer`.

### Official email confirmation

The submission sends a confirmation email through the shared
`apps.core.emails.dispatch_email` dispatcher (Resend in production; console in
development). The email contains a single-use link and a six-digit fallback
code.

- Link TTL: **24 hours** (`ORG_VERIFICATION_TOKEN_TTL_HOURS`).
- Code TTL: **15 minutes** (`ORG_VERIFICATION_CODE_TTL_MINUTES`).
- Resend cooldown: **60 seconds**
  (`ORG_VERIFICATION_RESEND_COOLDOWN_SECONDS`).
- Codes are stored as one-way hashes. Five wrong attempts lock the code until a
  new one is issued.
- The link token is rotated after successful confirmation, so a reused link
  returns an error.
- Changing the official email resets confirmation and issues a fresh link/code.
  An email already attached to another verification request is rejected.
- A suspended organization cannot resend or change the official email.
- Public confirmation endpoints do not require authentication:

```text
POST /api/organizations/verification/email/<uuid-token>/
POST /api/organizations/verification/email/confirm-code/
     { "official_email": "...", "code": "123456" }
```

### Domain matching

The website host and the official email domain are compared and the result is
stored as `official_email_domain_matches`. A mismatch is a **review flag**, not a
hard submission block: some institutions legitimately use a separate official
mail domain. The reviewer sees the flag and decides.

### Document privacy and validation

- Allowed extensions: `.pdf`, `.jpg`, `.jpeg`, `.png`.
- Published content types: PDF, JPEG, PNG; the file signature is checked, not
  only the browser-supplied MIME type.
- Maximum size: 10 MB.
- Documents are stored under `PRIVATE_MEDIA_ROOT` using Django private file
  storage. They are **not** under the public `MEDIA_URL` tree.
- `GET /api/organizations/<slug>/verification/document/` streams the file only
  to an organization admin/owner or platform staff, with
  `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- The admin review screen can generate a short-lived signed URL valid for
  **5 minutes**:
  `GET /api/organizations/verification/document/signed/<token>/`.
- Do not put verification uploads behind a public CDN, object-storage public
  bucket or the `/media/` proxy.

The default private root is `apps/backend/private_media`. In production set
`PRIVATE_MEDIA_ROOT` to a persistent private volume and include it in backups.
Never serve it with nginx/Caddy as a static directory.

## 3. Review workflow

1. The organization admin opens the portal and chooses **Complete
   verification** on the persistent banner.
2. The portal submits multipart form data to
   `POST /api/organizations/<slug>/verification/`.
3. The API saves the application, sets the organization to `email_pending`
   (or `pending_review` if the official email was already confirmed), records an
   attempt and writes a `SUBMITTED`/`RESUBMITTED` event.
4. The owner confirms the official email through the link or code. The API sets
   `pending_review`, writes `EMAIL_CONFIRMED`, and emails the platform review
   team.
5. Platform staff review the queue in Django admin:
   - `Organization verification` records show the legal details, contact,
     document download, email-confirmation state, domain-match flag and event
     history.
   - Approve with an optional note → `verified`.
   - Reject with a required note → `rejected`.
   - Request more information with a required note → stays `pending_review`
     with `info_requested_at` set.
   - Suspend with a required reason → `suspended`.
   Every decision sends an email/notification and writes audit/verification
   events.
6. On rejection or an information request, the portal shows the reviewer note
   in the banner and modal. The admin corrects fields or uploads a replacement
   document and resubmits. The existing document is kept if no new file is
   uploaded.
7. A verified organization can create student accounts, invite members, link
   existing accounts and approve join requests. These gates are enforced in the
   API (`_require_verified`), not only by disabling buttons.

Verification submissions are intentionally blocked with HTTP 409 while
`verified` or `suspended`, and while `pending_review` unless an admin has
requested more information. Resubmission is allowed for `unverified`,
`rejected`, `email_pending`, and `pending_review` with an active info request.

## 4. Student join requests

The member app's **Request to join an organization** flow searches verified
organizations only:

```text
GET /api/organizations/search/?q=<name-or-domain>
```

The search excludes unverified, email-pending, pending-review, rejected and
suspended organizations and organizations with join requests disabled. A
signed-in learner can request to join:

```text
GET  /api/organizations/<slug>/join-requests/       (organization admins)
POST /api/organizations/<slug>/join-requests/       (learners)
GET  /api/organizations/join-requests/me/           (learner's own requests)
POST /api/organizations/join-requests/<id>/withdraw/
POST /api/organizations/<slug>/join-requests/<id>/decision/
     { "decision": "approve"|"reject", "note": "..." }
```

Rules:

- The request requires a verified organization with `allow_join_requests=True`.
- A pending request is unique per learner/organization.
- Approval checks verification again, checks seat availability, creates or
  links the learner with the `student` role, writes an audit event, sends a
  notification and sends an email.
- Rejection does not create a membership; it records the note and notifies the
  learner.
- A learner can withdraw a pending request.
- Organization admins can list and filter requests; only organization
  admins/owners or platform staff can review them.
- Platform staff approval is also gated; staff cannot bypass the verified
  requirement for a new student.

## 5. Portal behavior

The portal (`../curious-bright-institutional`) includes:

- a persistent verification banner on every organization screen for owner/admin
  users, with copy for all six statuses;
- a four-step progress tracker (details submitted → official email confirmed →
  admin review → verified);
- a verification modal with status-specific copy, reviewer note, info request,
  suspension reason, review history, document download and resubmission;
- an official-email confirmation panel with resend, email change and six-digit
  code entry;
- head-of-institution fields for government-funded universities;
- a **Join requests** navigation item with pending badge, filters, learner
  message and optional decision note;
- disabled student/invite/link controls when the organization is not verified,
  with an explanation pointing back to the banner;
- `/privacy` and `/terms` pages linked from the footer and consent screens;
- `/verification/email/<token>` handling that works even when signed out.

The portal sends the `X-Client-App: institutional` header on every API request.
The backend also checks the `Origin`/`Referer` against
`ORG_REGISTRATION_ALLOWED_ORIGINS`. This is a UX guard against accidentally
creating institutions from the member app; it is not a substitute for API
authorization.

## 6. Tests and edge cases

Backend tests cover:

- status transitions across all six values;
- valid, expired and reused email confirmation links;
- code expiry, five-attempt lock, and resend cooldown;
- approval blocked before official-email confirmation;
- email change validation and uniqueness;
- signed document URL expiry/authorization;
- request-info and resubmission;
- suspension and approval/rejection notes;
- verification permissions and audit events.

Important edge cases:

- A user may open the email link while signed out; the confirmation endpoint is
  public and single-use.
- A reused or expired link returns a clear error; the owner can resend from the
  portal (subject to cooldown).
- A code is invalidated by a successful link confirmation or a new resend.
- A second click on an already-confirmed link returns “already confirmed” rather
  than re-approving.
- A domain mismatch is visible to reviewers but does not block submission.
- Changing an official email returns the organization to `email_pending` and
  clears `verified_at`.
- A verified organization that changes its domain must be re-verified.
- Suspension blocks resend, email change, submission and student growth.
- Existing members and students are never removed automatically by a status
  change.

## 7. Deployment checklist

- [ ] `ORG_FRONTEND_URL` points to the live portal.
- [ ] `ORG_REGISTRATION_ALLOWED_ORIGINS` includes the exact portal origin(s).
- [ ] `PRIVATE_MEDIA_ROOT` points to persistent private storage.
- [ ] `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, sender address and DNS records
      (SPF/DKIM/DMARC) are verified.
- [ ] `ORG_REVIEW_NOTIFY_EMAIL` is a monitored inbox; the Unfold sidebar badge
      counts `pending_review` organizations even when email alerts are off.
- [ ] `ORG_VERIFICATION_TOKEN_TTL_HOURS=24`,
      `ORG_VERIFICATION_CODE_TTL_MINUTES=15` and
      `ORG_VERIFICATION_RESEND_COOLDOWN_SECONDS=60` are set or defaults accepted.
- [ ] At least one staff account has `core.view_analytics` (or is a superuser)
      for the local admin analytics page; verification review itself uses the
      normal organization model permissions.
- [ ] Platform staff know how to review documents and write actionable notes.
- [ ] Backups include the private media volume and the database.
- [ ] Public `/media/` routing does **not** expose `private_media`.
- [ ] Search returns no unverified organizations.
- [ ] Smoke test: submit → receive email → confirm link → staff approve → create
      a student → approve a join request.
- [ ] Smoke test: submit → request code → wrong code five times → locked; resend
      after cooldown → new code works.
- [ ] Smoke test: rejection → portal shows reason → resubmit → pending review.
- [ ] Smoke test: request more information → portal shows note → resubmit.
- [ ] Smoke test: suspend → student growth blocked; existing members remain.
- [ ] Smoke test: changing a verified domain → status returns to unverified and
      student creation is blocked.
