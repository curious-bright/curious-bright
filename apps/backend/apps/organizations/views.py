from datetime import timedelta
import csv
import io
import secrets
import string

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile

from .models import (
    Organization,
    OrganizationAuditLog,
    OrganizationInvitation,
    OrganizationMembership,
)
from .serializers import (
    InvitationSerializer,
    InviteRequestSerializer,
    MemberSerializer,
    MemberUpdateSerializer,
    MyInvitationSerializer,
    OrganizationCreateSerializer,
    OrganizationSerializer,
    OrganizationUpdateSerializer,
    invite_expiry,
)
from .services import audit, can_manage, role_rank, send_invitation_email

User = get_user_model()


def _org(slug):
    return get_object_or_404(Organization, slug=slug, is_active=True)


def _membership(user, org):
    if not user.is_authenticated:
        return None
    return org.memberships.filter(user=user, status=OrganizationMembership.Status.ACTIVE).first()


def _require_member(request, org):
    if request.user.is_staff:
        return None
    membership = _membership(request.user, org)
    if membership is None:
        raise NotFound("Organization not found.")
    return membership


def _require_admin(request, org):
    if request.user.is_staff:
        return None
    membership = _membership(request.user, org)
    if membership is None or not can_manage(membership.role):
        raise PermissionDenied("You need organization admin access.")
    return membership


def _require_owner(request, org):
    if request.user.is_staff:
        return None
    membership = _membership(request.user, org)
    if membership is None or membership.role != OrganizationMembership.Role.OWNER:
        raise PermissionDenied("Only the organization owner can do that.")
    return membership


def _has_seat(org):
    return org.seat_limit == 0 or org.seats_used < org.seat_limit


def _can_assign(actor_membership, role):
    if role == OrganizationMembership.Role.OWNER:
        return False
    if actor_membership is None:  # platform admin
        return True
    return role_rank(role) < role_rank(actor_membership.role)


class OrganizationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        qs = Organization.objects.filter(is_active=True)
        if not user.is_staff:
            qs = qs.filter(memberships__user=user, memberships__status=OrganizationMembership.Status.ACTIVE)
        return qs.select_related("owner").distinct()

    def get_serializer_class(self):
        if self.request.method == "POST":
            return OrganizationCreateSerializer
        return OrganizationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        org = serializer.save(
            owner=request.user,
            plan_tier=Organization.Plan.FREE,
            seat_limit=50,
        )
        OrganizationMembership.objects.create(
            organization=org,
            user=request.user,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
            title="Owner",
        )
        audit(org, request.user, "organization.created", org, name=org.name)
        return Response(
            OrganizationSerializer(org, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class OrganizationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    lookup_field = "slug"
    queryset = Organization.objects.filter(is_active=True).select_related("owner")

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return OrganizationUpdateSerializer
        return OrganizationSerializer

    def get_object(self):
        org = super().get_object()
        _require_member(self.request, org)
        return org

    def update(self, request, *args, **kwargs):
        org = self.get_object()
        _require_admin(request, org)
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        org = serializer.save()
        audit(org, self.request.user, "organization.updated", org)

    def destroy(self, request, *args, **kwargs):
        org = self.get_object()
        _require_owner(request, org)
        org.is_active = False
        org.save(update_fields=["is_active"])
        audit(org, request.user, "organization.deactivated", org)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MemberListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MemberSerializer

    def get_organization(self):
        return _org(self.kwargs["slug"])

    def get_queryset(self):
        org = self.get_organization()
        self.actor_membership = _require_member(self.request, org)
        qs = org.memberships.select_related("user", "user__profile")
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        member_status = self.request.query_params.get("status")
        if member_status:
            qs = qs.filter(status=member_status)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(user__username__icontains=search)
                | Q(user__email__icontains=search)
                | Q(title__icontains=search)
                | Q(department__icontains=search)
            )
        return qs.order_by("role", "joined_at")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["can_manage"] = bool(
            self.request.user.is_staff
            or (getattr(self, "actor_membership", None) and can_manage(self.actor_membership.role))
        )
        return context


class InviteMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        org = _org(slug)
        actor_membership = _require_admin(request, org)
        payload = request.data
        emails = payload.get("emails")
        if emails is None and payload.get("email"):
            emails = [payload["email"]]
        serializer = InviteRequestSerializer(
            data={**payload, "emails": emails if emails is not None else []}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        role = data["role"]
        if not _can_assign(actor_membership, role):
            raise PermissionDenied("You cannot assign that role.")

        results = []
        used = org.seats_used
        for raw_email in data["emails"]:
            email = raw_email.strip().lower()
            if org.seat_limit and used >= org.seat_limit:
                results.append({"email": email, "success": False, "error": "Seat limit reached."})
                continue
            existing = org.memberships.filter(user__email__iexact=email).first()
            if existing:
                results.append({"email": email, "success": False, "error": "Already a member."})
                continue
            invitation = (
                org.invitations.filter(email__iexact=email, accepted_at__isnull=True, revoked_at__isnull=True)
                .order_by("-created_at")
                .first()
            )
            if invitation and invitation.expires_at > timezone.now():
                results.append(
                    {"email": email, "success": False, "error": "An invitation is already pending."}
                )
                continue
            if invitation:
                invitation.role = role
                invitation.expires_at = invite_expiry(data["expires_days"])
                invitation.invited_by = request.user
                invitation.save(update_fields=["role", "expires_at", "invited_by"])
            else:
                invitation = OrganizationInvitation.objects.create(
                    organization=org,
                    email=email,
                    role=role,
                    invited_by=request.user,
                    expires_at=invite_expiry(data["expires_days"]),
                )
            send_invitation_email(invitation)
            audit(
                org,
                request.user,
                "member.invited",
                invitation,
                email=email,
                role=role,
            )
            used += 1
            results.append(
                {
                    "email": email,
                    "success": True,
                    "invitation_id": invitation.pk,
                    "role": invitation.role,
                    "expires_at": invitation.expires_at,
                }
            )
        return Response({"results": results}, status=status.HTTP_200_OK)


class MemberDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_membership(self, request, slug, pk):
        org = _org(slug)
        actor_membership = _require_admin(request, org)
        membership = get_object_or_404(org.memberships.select_related("user"), pk=pk)
        return org, actor_membership, membership

    def patch(self, request, slug, pk):
        org, actor_membership, membership = self.get_membership(request, slug, pk)
        serializer = MemberUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changes = serializer.validated_data

        is_self = membership.user_id == request.user.id
        target_is_owner = membership.role == OrganizationMembership.Role.OWNER
        if target_is_owner and not is_self and request.user.is_staff is False:
            raise PermissionDenied("The owner's membership cannot be edited.")
        if target_is_owner and changes.get("role") and changes["role"] != membership.role:
            raise PermissionDenied("Transfer ownership before changing the owner's role.")
        if is_self and ("role" in changes or "status" in changes):
            raise PermissionDenied("You cannot change your own role or status.")
        if "role" in changes and not _can_assign(actor_membership, changes["role"]):
            raise PermissionDenied("You cannot assign that role.")
        if (
            actor_membership is not None
            and not is_self
            and role_rank(membership.role) >= role_rank(actor_membership.role)
        ):
            raise PermissionDenied("You cannot manage a member at your role level or above.")

        for field, value in changes.items():
            setattr(membership, field, value)
        membership.save()
        audit(org, request.user, "member.updated", membership, changes=list(changes))
        return Response(MemberSerializer(membership, context={"request": request, "can_manage": True}).data)

    def delete(self, request, slug, pk):
        org = _org(slug)
        membership = get_object_or_404(org.memberships.select_related("user"), pk=pk)
        is_self = membership.user_id == request.user.id
        if membership.role == OrganizationMembership.Role.OWNER:
            raise PermissionDenied("The owner cannot be removed. Transfer ownership first.")
        if is_self:
            membership.delete()
            audit(org, request.user, "member.left", None, username=request.user.username)
            return Response(status=status.HTTP_204_NO_CONTENT)
        actor_membership = _require_admin(request, org)
        if (
            actor_membership is not None
            and role_rank(membership.role) >= role_rank(actor_membership.role)
        ):
            raise PermissionDenied("You cannot remove a member at your role level or above.")
        audit(org, request.user, "member.removed", membership, email=membership.user.email)
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvitationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = InvitationSerializer

    def get_queryset(self):
        org = _org(self.kwargs["slug"])
        self.actor_membership = _require_admin(self.request, org)
        return org.invitations.filter(accepted_at__isnull=True, revoked_at__isnull=True).select_related(
            "invited_by"
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["can_manage"] = True
        return context


class RevokeInvitationView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, slug, pk):
        org = _org(slug)
        _require_admin(request, org)
        invitation = get_object_or_404(org.invitations, pk=pk)
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=["revoked_at"])
        audit(org, request.user, "invitation.revoked", invitation, email=invitation.email)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyInvitationsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MyInvitationSerializer

    def get_queryset(self):
        return (
            OrganizationInvitation.objects.filter(
                email__iexact=self.request.user.email,
                accepted_at__isnull=True,
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .select_related("organization")
            .order_by("-created_at")
        )


class AcceptInvitationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        invitation = get_object_or_404(
            OrganizationInvitation.objects.select_related("organization"), token=token
        )
        if invitation.revoked_at:
            return Response(
                {"code": "invitation_revoked", "message": "This invitation was revoked."},
                status=status.HTTP_410_GONE,
            )
        if invitation.accepted_at:
            return Response(
                {"code": "invitation_used", "message": "This invitation has already been used."},
                status=status.HTTP_409_CONFLICT,
            )
        if invitation.expires_at <= timezone.now():
            return Response(
                {"code": "invitation_expired", "message": "This invitation has expired."},
                status=status.HTTP_410_GONE,
            )
        if request.user.email.lower() != invitation.email.lower():
            return Response(
                {
                    "code": "email_mismatch",
                    "message": "Sign in with the email address this invitation was sent to.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        org = invitation.organization
        membership = org.memberships.filter(user=request.user).first()
        if membership is None and not _has_seat(org):
            return Response(
                {"code": "seat_limit_reached", "message": "This organization has no seats left."},
                status=status.HTTP_409_CONFLICT,
            )
        if membership is None:
            membership = OrganizationMembership.objects.create(
                organization=org,
                user=request.user,
                role=invitation.role,
                status=OrganizationMembership.Status.ACTIVE,
                invited_by=invitation.invited_by,
            )
        else:
            membership.role = invitation.role
            membership.status = OrganizationMembership.Status.ACTIVE
            membership.save(update_fields=["role", "status"])

        invitation.accepted_at = timezone.now()
        invitation.accepted_by = request.user
        invitation.save(update_fields=["accepted_at", "accepted_by"])
        audit(org, request.user, "invitation.accepted", invitation, role=invitation.role)
        return Response(
            OrganizationSerializer(org, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class JoinByDomainView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        email = (request.user.email or "").lower()
        domain = email.rsplit("@", 1)[-1] if "@" in email else ""
        org = Organization.objects.filter(domain=domain, auto_join_domain=True, is_active=True).first()
        if org is None:
            return Response(
                {"code": "no_organization", "message": "No organization accepts that email domain."},
                status=status.HTTP_404_NOT_FOUND,
            )
        membership = org.memberships.filter(user=request.user).first()
        if membership is None:
            if not _has_seat(org):
                return Response(
                    {"code": "seat_limit_reached", "message": "This organization has no seats left."},
                    status=status.HTTP_409_CONFLICT,
                )
            membership = OrganizationMembership.objects.create(
                organization=org,
                user=request.user,
                role=OrganizationMembership.Role.STUDENT,
                status=OrganizationMembership.Status.ACTIVE,
            )
            audit(org, request.user, "member.joined_by_domain", membership)
        return Response(OrganizationSerializer(org, context={"request": request}).data)


class OrganizationStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        org = _org(slug)
        _require_admin(request, org)
        role_counts = dict(
            org.memberships.filter(status=OrganizationMembership.Status.ACTIVE)
            .values_list("role")
            .annotate(total=Count("id"))
        )
        recent = org.audit_logs.select_related("actor")[:10]
        return Response(
            {
                "organization": OrganizationSerializer(org, context={"request": request}).data,
                "roles": role_counts,
                "pending_invitations": org.invitations.filter(
                    accepted_at__isnull=True, revoked_at__isnull=True, expires_at__gt=timezone.now()
                ).count(),
                "seats_used": org.seats_used,
                "seats_remaining": org.seats_remaining,
                "recent_activity": [
                    {
                        "id": row.pk,
                        "action": row.action,
                        "actor": row.actor.username if row.actor else "system",
                        "metadata": row.metadata,
                        "created_at": row.created_at,
                    }
                    for row in recent
                ],
            }
        )


class OrganizationAuditLogView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org = _org(self.kwargs["slug"])
        _require_admin(self.request, org)
        return org.audit_logs.select_related("actor")

    def list(self, request, *args, **kwargs):
        org = _org(self.kwargs["slug"])
        _require_admin(request, org)
        rows = org.audit_logs.select_related("actor")[:100]
        return Response(
            [
                {
                    "id": row.pk,
                    "action": row.action,
                    "actor": row.actor.username if row.actor else "system",
                    "target_type": row.target_type,
                    "target_id": row.target_id,
                    "metadata": row.metadata,
                    "created_at": row.created_at,
                }
                for row in rows
            ]
        )


# ---------------------------------------------------------------------------
# Student accounts, CSV onboarding and account linking
# ---------------------------------------------------------------------------

CSV_COLUMNS = [
    "username",
    "email",
    "first_name",
    "last_name",
    "student_id",
    "department",
    "title",
]


def _unique_username(email: str) -> str:
    base = (email or "student").split("@")[0]
    base = "".join(ch for ch in base if ch.isalnum() or ch in "._-").strip("._-")
    base = base[:24] or "student"
    candidate = base
    suffix = 1
    while User.objects.filter(username=candidate).exists():
        suffix += 1
        candidate = f"{base}{suffix}"[:30]
    return candidate


def _new_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(14))


def _add_or_link_member(
    org,
    *,
    email,
    actor,
    actor_membership,
    role,
    username="",
    first_name="",
    last_name="",
    student_id="",
    department="",
    title="",
):
    """Create a user when needed, then attach an active membership.

    Returns ``(membership, user, temporary_password, created_account)``.
    Raises ``ValueError`` for seat/role problems.
    """
    email = (email or "").strip().lower()
    if "@" not in email:
        raise ValueError("A valid email address is required.")
    if not _can_assign(actor_membership, role):
        raise ValueError("You cannot assign that role.")

    existing = org.memberships.select_related("user").filter(user__email__iexact=email).first()
    if existing:
        # Never let a CSV import or an account link silently demote the
        # organisation owner (or an account at/above the actor's role).
        if existing.role == OrganizationMembership.Role.OWNER:
            raise ValueError("The organization owner already has an account.")
        if role_rank(existing.role) >= role_rank(role) and existing.role != role:
            raise ValueError("That member already has an equal or higher role.")
        existing.status = OrganizationMembership.Status.ACTIVE
        existing.role = role
        if student_id:
            existing.student_id = student_id[:64]
        if department:
            existing.department = department[:120]
        if title:
            existing.title = title[:120]
        existing.save()
        audit(org, actor, "member.linked", existing, email=email, role=role)
        return existing, existing.user, "", False

    user = User.objects.filter(email__iexact=email).first()
    temp_password = ""
    created_account = False
    if user is None:
        if not _has_seat(org):
            raise ValueError("Seat limit reached.")
        desired = (username or "").strip()
        if desired and User.objects.filter(username=desired).exists():
            desired = ""
        user = User.objects.create_user(
            username=desired or _unique_username(email),
            email=email,
            password=_new_password(),
            first_name=(first_name or "").strip()[:150],
            last_name=(last_name or "").strip()[:150],
        )
        temp_password = _new_password()
        user.set_password(temp_password)
        user.save(update_fields=["password"])
        Profile.objects.filter(user=user).update(must_change_password=True)
        created_account = True
    elif not _has_seat(org):
        raise ValueError("Seat limit reached.")

    membership = OrganizationMembership.objects.create(
        organization=org,
        user=user,
        role=role,
        status=OrganizationMembership.Status.ACTIVE,
        student_id=(student_id or "")[:64],
        department=(department or "")[:120],
        title=(title or "")[:120],
        invited_by=actor,
    )
    audit(org, actor, "student.account_created" if created_account else "member.linked", membership)
    return membership, user, temp_password, created_account


class StudentCSVTemplateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="curious-bright-students-template.csv"'
        writer = csv.writer(response)
        writer.writerow(CSV_COLUMNS)
        writer.writerow(
            ["ada.okafor", "ada@school.edu", "Ada", "Okafor", "STU-001", "Computer Science", "Year 2"]
        )
        return response


class OrganizationCSVExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        org = _org(slug)
        _require_admin(request, org)
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{org.slug}-members.csv"'
        writer = csv.writer(response)
        writer.writerow(
            ["username", "email", "first_name", "last_name", "role", "status", "student_id", "department", "title", "joined_at"]
        )
        for membership in org.memberships.select_related("user").order_by("role", "joined_at"):
            writer.writerow(
                [
                    membership.user.username,
                    membership.user.email,
                    membership.user.first_name,
                    membership.user.last_name,
                    membership.role,
                    membership.status,
                    membership.student_id,
                    membership.department,
                    membership.title,
                    membership.joined_at.isoformat(),
                ]
            )
        return response


class BulkStudentImportView(APIView):
    """Import students from a CSV file (or a JSON ``students`` list).

    Existing accounts are linked, never duplicated. New accounts get a
    one-time temporary password in the response; the password is not emailed
    unless the deployment has an email backend configured.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        org = _org(slug)
        actor_membership = _require_admin(request, org)
        rows = []

        upload = request.FILES.get("file")
        if upload is not None:
            try:
                text = upload.read().decode("utf-8-sig")
            except UnicodeDecodeError:
                return Response(
                    {"code": "validation_error", "message": "Upload a UTF-8 CSV file."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            rows = list(csv.DictReader(io.StringIO(text)))
        elif isinstance(request.data.get("students"), list):
            rows = request.data["students"]
        else:
            return Response(
                {"code": "validation_error", "message": "Attach a CSV file or provide a students list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rows:
            return Response(
                {"code": "validation_error", "message": "The CSV file has no student rows."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(rows) > 1000:
            return Response(
                {"code": "validation_error", "message": "Import at most 1,000 students per file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        for index, row in enumerate(rows, start=1):
            email = str(row.get("email") or "").strip().lower()
            if not email:
                results.append({"row": index, "email": "", "success": False, "error": "Email is required."})
                continue
            try:
                with transaction.atomic():
                    membership, user, temp_password, created_account = _add_or_link_member(
                        org,
                        email=email,
                        actor=request.user,
                        actor_membership=actor_membership,
                        role=OrganizationMembership.Role.STUDENT,
                        username=str(row.get("username") or ""),
                        first_name=str(row.get("first_name") or ""),
                        last_name=str(row.get("last_name") or ""),
                        student_id=str(row.get("student_id") or ""),
                        department=str(row.get("department") or ""),
                        title=str(row.get("title") or ""),
                    )
            except ValueError as exc:
                results.append({"row": index, "email": email, "success": False, "error": str(exc)})
                continue
            entry = {
                "row": index,
                "email": email,
                "username": user.username,
                "success": True,
                "created_account": created_account,
                "membership_id": membership.pk,
            }
            if temp_password:
                entry["temporary_password"] = temp_password
            results.append(entry)

        created = sum(1 for row in results if row.get("created_account"))
        linked = sum(1 for row in results if row.get("success") and not row.get("created_account"))
        failed = sum(1 for row in results if not row.get("success"))
        return Response(
            {
                "results": results,
                "summary": {"created": created, "linked": linked, "failed": failed},
            },
            status=status.HTTP_200_OK,
        )


class CreateStudentAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        org = _org(slug)
        actor_membership = _require_admin(request, org)
        email = str(request.data.get("email") or "").strip().lower()
        try:
            membership, user, temp_password, created = _add_or_link_member(
                org,
                email=email,
                actor=request.user,
                actor_membership=actor_membership,
                role=OrganizationMembership.Role.STUDENT,
                username=str(request.data.get("username") or ""),
                first_name=str(request.data.get("first_name") or ""),
                last_name=str(request.data.get("last_name") or ""),
                student_id=str(request.data.get("student_id") or ""),
                department=str(request.data.get("department") or ""),
                title=str(request.data.get("title") or ""),
            )
        except ValueError as exc:
            return Response(
                {"code": "validation_error", "message": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = MemberSerializer(
            membership, context={"request": request, "can_manage": True}
        ).data
        payload["created_account"] = created
        if temp_password:
            payload["temporary_password"] = temp_password
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class LinkMemberAccountView(APIView):
    """Attach an existing Curious Bright account to an organization."""

    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        org = _org(slug)
        actor_membership = _require_admin(request, org)
        username = str(request.data.get("username") or "").strip()
        email = str(request.data.get("email") or "").strip().lower()
        user = None
        if username:
            user = User.objects.filter(username=username).first()
        if user is None and email:
            user = User.objects.filter(email__iexact=email).first()
        if user is None:
            return Response(
                {"code": "not_found", "message": "No account matches that username or email."},
                status=status.HTTP_404_NOT_FOUND,
            )
        role = request.data.get("role") or OrganizationMembership.Role.STUDENT
        if role not in OrganizationMembership.Role.values or role == OrganizationMembership.Role.OWNER:
            return Response(
                {"code": "validation_error", "message": "Choose a valid non-owner role."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            membership, linked_user, _, _ = _add_or_link_member(
                org,
                email=user.email,
                actor=request.user,
                actor_membership=actor_membership,
                role=role,
                username=user.username,
                student_id=str(request.data.get("student_id") or ""),
                department=str(request.data.get("department") or ""),
                title=str(request.data.get("title") or ""),
            )
        except ValueError as exc:
            return Response(
                {"code": "validation_error", "message": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            MemberSerializer(membership, context={"request": request, "can_manage": True}).data,
            status=status.HTTP_201_CREATED,
        )
