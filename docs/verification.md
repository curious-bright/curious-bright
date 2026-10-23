# Organization verification and join requests

Organization verification is the trust boundary between a self-service
institutional workspace and the student accounts it can create. The member app
cannot create organizations; the institutional portal does that and sends
`X-Client-App: institutional`.

## 1. Status model

`Organization.verification_status` has four values:

| Status | Meaning | Can submit/resubmit? | Can create/invite students? | Appears in join search? |
|---|---|---|---|---|
| `unverified` | New organization or domain changed | Yes | No | No |
| `pending` | Application submitted, waiting for the platform review team | No | No | No |
| `verified` | Approved by platform staff | No (verified) | Yes | Yes, if join requests are enabled |
| `rejected` | Changes or evidence are required | Yes | No | No |

Existing memberships and existing students remain active when a status changes
to `unverified`, `pending` or `rejected`. Only new growth — invitations,
student creation, bulk import, account linking, join-request approval and
domain auto-join — is blocked. A verified organization whose email domain is
changed through `PATCH /api/organizations/<slug>/` is automatically returned to
`unverified`, `verified_at` is cleared, auto-join is disabled and an audit
event is written. It must be verified again.

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
- head of institution (Vice-Chancellor, Rector or Dean) for universities.

For a government-funded / public university, the API requires a website,
either a registration number or a registration document, and the head of
institution. This is enforced server-side by `VerificationSubmitSerializer`.

### Official email and domain matching

The website host and the official email domain must match. The backend
normalises `www`, scheme and common subdomain differences. Disposable/free email
providers are rejected. A confirmation email is sent to the official address;
the reviewer can see whether it was confirmed. The confirmation link is a
public, single-use token:

```text
POST /api/organizations/verification/email/<uuid-token>/
```

The token is rotated after confirmation. `POST .../verification/resend/`
sends a fresh link while the address is unconfirmed.

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
3. The API sets the organization to `pending`, records an attempt and writes an
   `OrganizationVerificationEvent`, then emails the official address.
4. Platform staff review the queue in Django admin:
   - `Organization verification` records show the legal details, contact,
     document download, email-confirmation state and event history.
   - Approve with note → `verified`; reject with a required note →
     `rejected`. The service sends an email, creates a notification and writes
     an audit/verification event. Every decision is attributable to the staff
     user.
5. On rejection, the portal shows the reviewer note in the banner and modal.
   The admin corrects fields or uploads a replacement document and resubmits.
   The existing document is kept if no new file is uploaded.
6. A verified organization can create student accounts, invite members, link
   existing accounts and approve join requests. These gates are enforced in the
   API (`_require_verified`), not only by disabling buttons.

Verification submissions are intentionally blocked with HTTP 409 while
`pending` or `verified`. Resubmission is allowed for `unverified` and
`rejected`.

## 4. Student join requests

The member app's **Request to join an organization** flow searches verified
organizations only:

```text
GET /api/organizations/search/?q=<name-or-domain>
```

The search excludes unverified, pending and rejected organizations and
organizations with join requests disabled. A signed-in learner can request to
join:

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
  users;
- a verification modal with status-specific copy, reviewer note, review
  history, document download and resubmission;
- an official-email confirmation status and resend action;
- a **Join requests** navigation item with pending badge, filters, learner
  message and optional decision note;
- disabled student/invite/link controls when the organization is not verified,
  with an explanation pointing back to the banner;
- `/verification/email/<token>` handling that works even when signed out.

The portal sends the `X-Client-App: institutional` header on every API request.
The backend also checks the `Origin`/`Referer` against
`ORG_REGISTRATION_ALLOWED_ORIGINS`. This is a UX guard against accidentally
creating institutions from the member app; it is not a substitute for API
authorization.

## 6. Deployment checklist

- [ ] `ORG_FRONTEND_URL` points to the live portal.
- [ ] `ORG_REGISTRATION_ALLOWED_ORIGINS` includes the exact portal origin(s).
- [ ] `PRIVATE_MEDIA_ROOT` points to persistent private storage.
- [ ] SMTP is configured; verification and join-request emails are not using
      the console backend.
- [ ] `EMAIL_BACKEND`, sender address and DNS records (SPF/DKIM/DMARC) are
      verified.
- [ ] Platform staff know how to review documents and write actionable rejection
      notes.
- [ ] Backups include the private media volume and the database.
- [ ] Public `/media/` routing does **not** expose `private_media`.
- [ ] Search returns no unverified organizations.
- [ ] Smoke test: submit → receive email → confirm → staff approve → create a
      student → approve a join request.
- [ ] Smoke test rejection → portal shows reason → resubmit → pending again.
- [ ] Smoke test changing a verified domain → status returns to unverified and
      student creation is blocked.
