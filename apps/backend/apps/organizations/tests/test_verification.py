import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.organizations.models import (
    Organization,
    OrganizationJoinRequest,
    OrganizationMembership,
    OrganizationVerification,
)
from apps.organizations.services import (
    VerificationError,
    approve_verification,
    reject_verification,
    request_more_information,
    signed_document_url,
    suspend_organization,
)
from apps.organizations.validators import validate_verification_document

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_PROVIDER="console",
    EMAIL_DELIVERY_ASYNC=False,
    ORG_REVIEW_NOTIFY_EMAIL="",
    ORG_VERIFICATION_RESEND_COOLDOWN_SECONDS=60,
    ORG_VERIFICATION_TOKEN_TTL_HOURS=24,
    ORG_VERIFICATION_CODE_TTL_MINUTES=15,
)
class OrganizationVerificationTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        self.owner = User.objects.create_user(
            username="verifyowner",
            email="owner@greenfield.edu",
            password="Str0ng!Passw0rd99",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.org = Organization.objects.create(
            name="Greenfield University",
            domain="greenfield.edu",
            owner=self.owner,
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role=OrganizationMembership.Role.OWNER,
        )

    def payload(self, **overrides):
        data = {
            "legal_name": "Greenfield University",
            "org_type": "university",
            "country": "Nigeria",
            "address": "1 University Road, Lagos",
            "website": "https://greenfield.edu",
            "official_email": "registry@greenfield.edu",
            "contact_name": "Ada Okafor",
            "contact_role": "Registrar",
            "contact_email": "ada@greenfield.edu",
            "contact_phone": "+2348000000000",
            "registration_number": "RC-12345",
            "is_government_funded": False,
            "head_name": "Professor Example",
            "head_role": "Vice-Chancellor",
            "head_email": "vc@greenfield.edu",
        }
        data.update(overrides)
        return data

    def submit(self, **overrides):
        return self.client.post(
            f"/api/organizations/{self.org.slug}/verification/",
            self.payload(**overrides),
            format="json",
        )

    def verification(self):
        return OrganizationVerification.objects.get(organization=self.org)

    def email_code(self, index=0):
        body = mail.outbox[index].body
        match = re.search(r"code: (\d{6})", body)
        self.assertIsNotNone(match, body)
        return match.group(1)

    def confirm(self, verification=None):
        verification = verification or self.verification()
        return self.client.post(
            f"/api/organizations/verification/email/{verification.official_email_token}/"
        )

    def test_submit_starts_email_pending_then_confirmation_moves_to_review(self):
        response = self.submit()
        self.assertEqual(response.status_code, 201, response.content)
        self.org.refresh_from_db()
        self.assertEqual(
            self.org.verification_status, Organization.VerificationStatus.EMAIL_PENDING
        )
        verification = self.verification()
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("registry@greenfield.edu", mail.outbox[0].to)
        self.assertIn("/verification/email/", mail.outbox[0].body)

        confirm = self.confirm(verification)
        self.assertEqual(confirm.status_code, 200, confirm.content)
        self.org.refresh_from_db()
        verification.refresh_from_db()
        self.assertEqual(
            self.org.verification_status,
            Organization.VerificationStatus.PENDING_REVIEW,
        )
        self.assertIsNotNone(verification.official_email_verified_at)
        self.assertTrue(
            self.org.verification_events.filter(action="email_confirmed").exists()
        )

        approve_verification(verification, self.owner, "Documents match.")
        self.org.refresh_from_db()
        self.assertEqual(
            self.org.verification_status, Organization.VerificationStatus.VERIFIED
        )
        self.assertEqual(self.org.country, "Nigeria")
        self.assertIsNotNone(self.org.verified_at)
        self.assertTrue(self.org.verification_events.filter(action="approved").exists())
        self.assertTrue(
            any("verified on Curious Bright" in message.subject for message in mail.outbox)
        )

    def test_verification_emails_use_branded_templates(self):
        self.submit()
        html = mail.outbox[0].alternatives[0][0]
        self.assertIn("cb-card", html)
        self.assertIn("Confirm official email", html)
        self.assertIn(str(self.verification().official_email_token), html)
        self.assertIn(self.email_code(), html)

        verification = self.verification()
        self.confirm(verification)
        verification.refresh_from_db()
        approve_verification(verification, self.owner, "Documents match.")
        approved_html = next(
            message.alternatives[0][0]
            for message in mail.outbox
            if "verified on Curious Bright" in message.subject
        )
        self.assertIn("cb-card", approved_html)
        self.assertIn("Open the portal", approved_html)

    def test_confirmation_code_is_valid_and_single_use(self):
        self.submit()
        verification = self.verification()
        code = self.email_code()
        response = self.client.post(
            "/api/organizations/verification/email/confirm-code/",
            {"official_email": verification.official_email, "code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.json()["status"],
            Organization.VerificationStatus.PENDING_REVIEW,
        )
        replay = self.client.post(
            "/api/organizations/verification/email/confirm-code/",
            {"official_email": verification.official_email, "code": code},
            format="json",
        )
        self.assertEqual(replay.status_code, 409)
        self.assertEqual(replay.json()["code"], "already_confirmed")

    def test_expired_confirmation_link_is_rejected(self):
        self.submit()
        verification = self.verification()
        verification.official_email_token_expires_at = timezone.now() - timedelta(seconds=1)
        verification.save(update_fields=["official_email_token_expires_at"])
        response = self.confirm(verification)
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["code"], "token_expired")

    def test_expired_code_is_rejected(self):
        self.submit()
        verification = self.verification()
        code = self.email_code()
        verification.official_email_code_expires_at = timezone.now() - timedelta(seconds=1)
        verification.save(update_fields=["official_email_code_expires_at"])
        response = self.client.post(
            "/api/organizations/verification/email/confirm-code/",
            {"official_email": verification.official_email, "code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["code"], "code_expired")

    def test_five_wrong_codes_lock_the_confirmation_code(self):
        self.submit()
        verification = self.verification()
        correct = self.email_code()
        wrong = "000000" if correct != "000000" else "111111"
        response = None
        for _ in range(5):
            response = self.client.post(
                "/api/organizations/verification/email/confirm-code/",
                {"official_email": verification.official_email, "code": wrong},
                format="json",
            )
        self.assertEqual(response.status_code, 429, response.content)
        self.assertEqual(response.json()["code"], "too_many_attempts")
        verification.refresh_from_db()
        self.assertEqual(verification.official_email_code_attempts, 5)
        self.assertIsNone(verification.official_email_verified_at)

    def test_confirmation_link_cannot_be_reused(self):
        self.submit()
        verification = self.verification()
        token = verification.official_email_token
        self.assertEqual(self.confirm(verification).status_code, 200)
        response = self.client.post(f"/api/organizations/verification/email/{token}/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "invalid_token")

    def test_approval_is_blocked_until_official_email_is_confirmed(self):
        self.submit()
        verification = self.verification()
        with self.assertRaises(VerificationError) as ctx:
            approve_verification(verification, self.owner, "Looks good.")
        self.assertEqual(ctx.exception.code, "email_not_confirmed")
        self.org.refresh_from_db()
        self.assertEqual(
            self.org.verification_status, Organization.VerificationStatus.EMAIL_PENDING
        )
        self.assertIsNone(self.org.verified_at)

    def test_domain_mismatch_is_flagged_for_review_not_blocked(self):
        response = self.submit(official_email="person@gmail.com")
        self.assertEqual(response.status_code, 201, response.content)
        verification = self.verification()
        self.assertFalse(verification.official_email_domain_matches)
        self.assertEqual(verification.official_email, "person@gmail.com")

    def test_public_university_requires_registration_evidence_and_head(self):
        response = self.submit(
            is_government_funded=True,
            registration_number="",
            head_name="",
            head_email="",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("registration", response.json()["message"].lower())

        response = self.submit(
            is_government_funded=True,
            head_name="",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("vice-chancellor", response.json()["message"].lower())

        response = self.submit(
            is_government_funded=True,
            head_role="",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("role", response.json()["message"].lower())

        response = self.submit(
            is_government_funded=True,
            head_email="",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json()["message"].lower())

    def test_rejected_application_can_be_resubmitted(self):
        self.submit()
        verification = self.verification()
        self.confirm(verification)
        verification.refresh_from_db()
        reject_verification(verification, self.owner, "The document was unreadable.")
        self.org.refresh_from_db()
        self.assertEqual(
            self.org.verification_status, Organization.VerificationStatus.REJECTED
        )

        response = self.submit(address="2 New University Road, Lagos")
        self.assertEqual(response.status_code, 200, response.content)
        self.org.refresh_from_db()
        self.assertEqual(
            self.org.verification_status,
            Organization.VerificationStatus.PENDING_REVIEW,
        )
        verification.refresh_from_db()
        self.assertEqual(verification.attempt, 2)
        self.assertTrue(
            self.org.verification_events.filter(action="resubmitted").exists()
        )

    def test_resend_is_cooled_down_and_rotates_the_code(self):
        self.submit()
        verification = self.verification()
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/verification/resend/"
        )
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["code"], "cooldown")
        self.assertEqual(len(mail.outbox), 1)

        verification.official_email_last_sent_at = timezone.now() - timedelta(seconds=61)
        verification.save(update_fields=["official_email_last_sent_at"])
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/verification/resend/"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 2)
        new_code = self.email_code(1)
        verification.refresh_from_db()
        old_code = self.email_code(0)
        self.assertNotEqual(old_code, new_code)
        self.assertEqual(
            self.client.post(
                "/api/organizations/verification/email/confirm-code/",
                {"official_email": verification.official_email, "code": old_code},
                format="json",
            ).json()["code"],
            "invalid_code",
        )
        self.assertEqual(
            self.client.post(
                "/api/organizations/verification/email/confirm-code/",
                {"official_email": verification.official_email, "code": new_code},
                format="json",
            ).status_code,
            200,
        )

    def test_official_email_cannot_be_attached_to_two_organizations(self):
        first = self.submit()
        self.assertEqual(first.status_code, 201, first.content)

        other = Organization.objects.create(
            name="Second University",
            domain="second.edu",
            owner=self.owner,
        )
        OrganizationMembership.objects.create(
            organization=other,
            user=self.owner,
            role=OrganizationMembership.Role.OWNER,
        )
        response = self.client.post(
            f"/api/organizations/{other.slug}/verification/",
            self.payload(official_email="registry@greenfield.edu"),
            format="json",
        )
        self.assertEqual(response.status_code, 409, response.content)
        self.assertEqual(response.json()["code"], "email_in_use")
        self.assertFalse(
            OrganizationVerification.objects.filter(organization=other).exists()
        )

    def test_official_email_can_be_changed_and_requires_reconfirmation(self):
        self.submit()
        self.confirm()
        verification = self.verification()
        self.assertIsNotNone(verification.official_email_verified_at)
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/verification/official-email/",
            {"official_email": "registrar@greenfield.edu"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.org.refresh_from_db()
        verification.refresh_from_db()
        self.assertEqual(
            self.org.verification_status, Organization.VerificationStatus.EMAIL_PENDING
        )
        self.assertIsNone(verification.official_email_verified_at)
        self.assertEqual(verification.official_email, "registrar@greenfield.edu")
        self.assertIn("registrar@greenfield.edu", mail.outbox[-1].to)
        self.assertTrue(
            self.org.verification_events.filter(action="email_changed").exists()
        )

    def test_request_more_information_keeps_pending_review_and_allows_resubmit(self):
        self.submit()
        verification = self.verification()
        self.confirm(verification)
        verification.refresh_from_db()
        request_more_information(verification, self.owner, "Please add a council letter.")
        self.org.refresh_from_db()
        verification.refresh_from_db()
        self.assertEqual(
            self.org.verification_status,
            Organization.VerificationStatus.PENDING_REVIEW,
        )
        self.assertIsNotNone(verification.info_requested_at)
        self.assertEqual(verification.info_request_note, "Please add a council letter.")

        response = self.submit(address="3 University Road, Lagos")
        self.assertEqual(response.status_code, 200, response.content)
        self.org.refresh_from_db()
        verification.refresh_from_db()
        self.assertEqual(
            self.org.verification_status,
            Organization.VerificationStatus.PENDING_REVIEW,
        )
        self.assertIsNone(verification.info_requested_at)
        self.assertTrue(
            self.org.verification_events.filter(action="resubmitted").exists()
        )

    def test_suspended_organization_cannot_resubmit(self):
        self.submit()
        verification = self.verification()
        self.confirm(verification)
        verification.refresh_from_db()
        approve_verification(verification, self.owner, "Approved.")
        self.org.refresh_from_db()
        suspend_organization(self.org, self.owner, "Fraudulent documents.")
        self.org.refresh_from_db()
        self.assertEqual(
            self.org.verification_status, Organization.VerificationStatus.SUSPENDED
        )
        self.assertEqual(self.org.suspension_reason, "Fraudulent documents.")
        response = self.submit(address="New address")
        self.assertEqual(response.status_code, 409)

    def test_verified_organization_domain_change_requires_reverification(self):
        self.submit()
        verification = self.verification()
        self.confirm(verification)
        verification.refresh_from_db()
        approve_verification(verification, self.owner, "Approved.")
        self.org.refresh_from_db()
        self.org.auto_join_domain = True
        self.org.save(update_fields=["auto_join_domain"])

        response = self.client.patch(
            f"/api/organizations/{self.org.slug}/",
            {"domain": "new-greenfield.edu"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.org.refresh_from_db()
        self.assertEqual(
            self.org.verification_status, Organization.VerificationStatus.UNVERIFIED
        )
        self.assertIsNone(self.org.verified_at)
        self.assertFalse(self.org.auto_join_domain)
        self.assertTrue(
            self.org.verification_events.filter(action="domain_changed").exists()
        )

    def test_admin_pending_review_email_is_sent_after_confirmation(self):
        with self.settings(ORG_REVIEW_NOTIFY_EMAIL="review@example.com"):
            self.submit()
            self.confirm()
        self.assertTrue(any("review@example.com" in message.to for message in mail.outbox))

    def test_unverified_org_is_gated_from_member_growth(self):
        invite = self.client.post(
            f"/api/organizations/{self.org.slug}/members/invite/",
            {"emails": ["student@greenfield.edu"], "role": "student"},
            format="json",
        )
        self.assertEqual(invite.status_code, 403)
        student = self.client.post(
            f"/api/organizations/{self.org.slug}/students/",
            {"email": "student@greenfield.edu"},
            format="json",
        )
        self.assertEqual(student.status_code, 403)

        outsider = User.objects.create_user(
            username="seeker", email="seeker@example.com", password="Str0ng!Passw0rd99"
        )
        self.client.force_authenticate(user=outsider)
        self.assertEqual(
            self.client.post(
                f"/api/organizations/{self.org.slug}/join-requests/", {}, format="json"
            ).status_code,
            403,
        )
        search = self.client.get("/api/organizations/search/")
        self.assertFalse(any(row["slug"] == self.org.slug for row in search.json()))

    def test_unverified_org_cannot_approve_a_join_request(self):
        requester = User.objects.create_user(
            username="pendingjoiner",
            email="pendingjoiner@example.com",
            password="Str0ng!Passw0rd99",
        )
        join_request = OrganizationJoinRequest.objects.create(
            organization=self.org,
            user=requester,
            message="Please let me in.",
        )
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/join-requests/{join_request.pk}/decision/",
            {"decision": "approve", "note": "Welcome!"},
            format="json",
        )
        self.assertEqual(response.status_code, 403, response.content)
        join_request.refresh_from_db()
        self.assertEqual(join_request.status, OrganizationJoinRequest.Status.PENDING)
        self.assertFalse(
            OrganizationMembership.objects.filter(
                organization=self.org, user=requester
            ).exists()
        )

    def test_join_request_approval_creates_student_membership(self):
        self.org.verification_status = Organization.VerificationStatus.VERIFIED
        self.org.verified_at = timezone.now()
        self.org.save(update_fields=["verification_status", "verified_at"])
        requester = User.objects.create_user(
            username="joiner",
            email="joiner@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client.force_authenticate(user=requester)
        created = self.client.post(
            f"/api/organizations/{self.org.slug}/join-requests/",
            {"message": "I study here."},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        request_id = created.json()["id"]

        self.client.force_authenticate(user=self.owner)
        listed = self.client.get(f"/api/organizations/{self.org.slug}/join-requests/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["status"], "pending")

        decision = self.client.post(
            f"/api/organizations/{self.org.slug}/join-requests/{request_id}/decision/",
            {"decision": "approve", "note": "Welcome!"},
            format="json",
        )
        self.assertEqual(decision.status_code, 200, decision.content)
        self.assertTrue(
            OrganizationMembership.objects.filter(
                organization=self.org,
                user=requester,
                role=OrganizationMembership.Role.STUDENT,
                status=OrganizationMembership.Status.ACTIVE,
            ).exists()
        )
        self.assertEqual(
            OrganizationJoinRequest.objects.get(pk=request_id).status,
            OrganizationJoinRequest.Status.APPROVED,
        )
        self.assertTrue(any("joiner@example.com" in message.to for message in mail.outbox))

    def test_join_request_rejection_does_not_create_membership(self):
        self.org.verification_status = Organization.VerificationStatus.VERIFIED
        self.org.save(update_fields=["verification_status"])
        requester = User.objects.create_user(
            username="declined",
            email="declined@example.com",
            password="Str0ng!Passw0rd99",
        )
        self.client.force_authenticate(user=requester)
        created = self.client.post(
            f"/api/organizations/{self.org.slug}/join-requests/", {}, format="json"
        )
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/join-requests/{created.json()['id']}/decision/",
            {"decision": "reject", "note": "We could not confirm your affiliation."},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(
            OrganizationMembership.objects.filter(
                organization=self.org, user=requester
            ).exists()
        )
        self.assertEqual(
            response.json()["decision_note"], "We could not confirm your affiliation."
        )

    def test_organization_creation_is_restricted_to_the_institutional_portal(self):
        self.assertEqual(
            self.client.post(
                "/api/organizations/",
                {"name": "Main App Org", "domain": "main.example"},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/organizations/",
                {"name": "Main App Org", "domain": "main.example"},
                format="json",
                HTTP_ORIGIN="https://app.curiousbright.com.ng",
            ).status_code,
            403,
        )
        allowed = self.client.post(
            "/api/organizations/",
            {
                "name": "Portal Org",
                "domain": "portal.example",
                "accept_terms": True,
                "accept_privacy": True,
            },
            format="json",
            HTTP_X_CLIENT_APP="institutional",
        )
        self.assertEqual(allowed.status_code, 201, allowed.content)

    def test_private_document_is_only_downloadable_by_reviewers(self):
        document = SimpleUploadedFile(
            "registration.pdf",
            b"%PDF-1.4\nverification document\n",
            content_type="application/pdf",
        )
        response = self.client.post(
            f"/api/organizations/{self.org.slug}/verification/",
            {**self.payload(), "registration_document": document},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.content)
        verification = OrganizationVerification.objects.get(organization=self.org)
        self.assertIn("private_media", verification.registration_document.storage.location)

        download = self.client.get(
            f"/api/organizations/{self.org.slug}/verification/document/"
        )
        self.assertEqual(download.status_code, 200)

        outsider = User.objects.create_user(
            username="nosy", email="nosy@example.com", password="Str0ng!Passw0rd99"
        )
        self.client.force_authenticate(user=outsider)
        self.assertEqual(
            self.client.get(
                f"/api/organizations/{self.org.slug}/verification/document/"
            ).status_code,
            403,
        )

        staff = User.objects.create_user(
            username="reviewer",
            email="reviewer@example.com",
            password="Str0ng!Passw0rd99",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)
        self.assertEqual(
            self.client.get(
                f"/api/organizations/{self.org.slug}/verification/document/"
            ).status_code,
            200,
        )

        signed = self.client.get(signed_document_url(verification))
        self.assertEqual(signed.status_code, 200)
        invalid = self.client.get(
            "/api/organizations/verification/document/signed/not-a-valid-token/"
        )
        self.assertEqual(invalid.status_code, 403)

        verification.registration_document.delete(save=False)


class VerificationDocumentValidatorTests(TestCase):
    def test_rejects_executable_and_disguised_files(self):
        with self.assertRaises(ValidationError):
            validate_verification_document(
                SimpleUploadedFile("malware.exe", b"MZ", content_type="application/octet-stream")
            )
        with self.assertRaises(ValidationError):
            validate_verification_document(
                SimpleUploadedFile("fake.pdf", b"not a pdf", content_type="application/pdf")
            )

    def test_accepts_pdf_signature(self):
        upload = SimpleUploadedFile(
            "document.pdf", b"%PDF-1.7\ncontent", content_type="application/pdf"
        )
        self.assertIs(validate_verification_document(upload), upload)
