from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
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
from apps.organizations.services import approve_verification, reject_verification
from apps.organizations.validators import validate_verification_document

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class OrganizationVerificationTests(TestCase):
    def setUp(self):
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
            "head_of_institution": "Professor Example",
        }
        data.update(overrides)
        return data

    def submit(self, **overrides):
        return self.client.post(
            f"/api/organizations/{self.org.slug}/verification/",
            self.payload(**overrides),
            format="json",
        )

    def test_submit_confirms_official_email_and_can_be_approved(self):
        response = self.submit()
        self.assertEqual(response.status_code, 201, response.content)
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.PENDING)
        verification = OrganizationVerification.objects.get(organization=self.org)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("registry@greenfield.edu", mail.outbox[0].to)

        confirm = self.client.post(
            f"/api/organizations/verification/email/{verification.official_email_token}/"
        )
        self.assertEqual(confirm.status_code, 200, confirm.content)
        verification.refresh_from_db()
        self.assertIsNotNone(verification.official_email_verified_at)

        approve_verification(verification, self.owner, "Documents match.")
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.VERIFIED)
        self.assertIsNotNone(self.org.verified_at)
        self.assertTrue(self.org.verification_events.filter(action="approved").exists())

    def test_official_email_must_match_website_domain(self):
        response = self.submit(official_email="person@gmail.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("official email", response.json()["message"].lower())

    def test_public_university_requires_registration_evidence_and_head(self):
        response = self.submit(
            is_government_funded=True,
            registration_number="",
            head_of_institution="",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("registration", response.json()["message"].lower())

    def test_rejected_application_can_be_resubmitted(self):
        self.submit()
        verification = OrganizationVerification.objects.get(organization=self.org)
        reject_verification(verification, self.owner, "The document was unreadable.")
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.REJECTED)

        response = self.submit(address="2 New University Road, Lagos")
        self.assertEqual(response.status_code, 200, response.content)
        self.org.refresh_from_db()
        self.assertEqual(self.org.verification_status, Organization.VerificationStatus.PENDING)
        verification.refresh_from_db()
        self.assertEqual(verification.attempt, 2)
        self.assertTrue(
            self.org.verification_events.filter(action="resubmitted").exists()
        )

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
            {"name": "Portal Org", "domain": "portal.example"},
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
