"""Django settings for the LearnBridge project (knowledge-sharing + research community)."""
import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse, unquote

from django.urls import reverse_lazy
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Local development convenience: read apps/backend/.env if present. Existing
# process environment variables always win, so deployment secrets are never
# overwritten by a checked-out env file.
load_dotenv(BASE_DIR / ".env")


def env(key, default=None):
    return os.environ.get(key, default)


def env_bool(key, default=False):
    return os.environ.get(key, str(default)).lower() in ("1", "true", "yes", "on")


def env_list(key, default=""):
    raw = env(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def env_int(key, default):
    try:
        return int(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-insecure-secret-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
)

INSTALLED_APPS = [
    "unfold",
    "unfold.contrib.filters",
    "unfold.contrib.forms",
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "channels",
    "apps.core",
    "apps.accounts",
    "apps.community",
    "apps.gamification",
    "apps.research",
    "apps.moderation",
    "apps.rooms",
    "apps.organizations",
    "apps.billing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.core.middleware.RequestIDMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.ApiErrorMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

UNFOLD = {
    "SITE_TITLE": "Curious Bright Admin",
    "SITE_HEADER": "Curious Bright",
    "SITE_SUBHEADER": "Community administration",
    "SITE_URL": "/",
    "SITE_SYMBOL": "school",
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "DASHBOARD_CALLBACK": "apps.core.admin.dashboard_callback",
    "COLORS": {
        "primary": {
            "50": "#FFF3F0",
            "100": "#FFE3DC",
            "200": "#FFC7B9",
            "300": "#FFA48D",
            "400": "#FF7A59",
            "500": "#FF5A36",
            "600": "#EE3F19",
            "700": "#C73214",
            "800": "#A02B14",
            "900": "#7F2615",
            "950": "#451008",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "Overview",
                "items": [
                    {
                        "title": "Dashboard",
                        "icon": "space_dashboard",
                        "link": reverse_lazy("admin:index"),
                    },
                ],
            },
            {
                "title": "Community",
                "items": [
                    {"title": "Posts", "icon": "article", "link": reverse_lazy("admin:community_post_changelist")},
                    {"title": "Comments", "icon": "forum", "link": reverse_lazy("admin:community_comment_changelist")},
                    {"title": "Likes", "icon": "thumb_up", "link": reverse_lazy("admin:community_like_changelist")},
                    {"title": "Helpful reactions", "icon": "volunteer_activism", "link": reverse_lazy("admin:community_helpfulreaction_changelist")},
                    {"title": "Equations", "icon": "functions", "link": reverse_lazy("admin:community_equation_changelist")},
                    {"title": "Notifications", "icon": "notifications", "link": reverse_lazy("admin:community_notification_changelist")},
                ],
            },
            {
                "title": "Moderation",
                "items": [
                    {"title": "Reports", "icon": "flag", "link": reverse_lazy("admin:moderation_report_changelist")},
                    {"title": "Moderator applications", "icon": "how_to_reg", "link": reverse_lazy("admin:moderation_moderatorapplication_changelist")},
                ],
            },
            {
                "title": "Study rooms",
                "items": [
                    {"title": "Rooms", "icon": "meeting_room", "link": reverse_lazy("admin:rooms_room_changelist")},
                    {"title": "Messages", "icon": "chat", "link": reverse_lazy("admin:rooms_roommessage_changelist")},
                ],
            },
            {
                "title": "Research",
                "items": [
                    {"title": "Documents", "icon": "science", "link": reverse_lazy("admin:research_researchdocument_changelist")},
                    {"title": "Collaborations", "icon": "handshake", "link": reverse_lazy("admin:research_collaboration_changelist")},
                    {"title": "Revisions", "icon": "history", "link": reverse_lazy("admin:research_researchdocumentrevision_changelist")},
                ],
            },
            {
                "title": "Gamification",
                "items": [
                    {"title": "Badges", "icon": "military_tech", "link": reverse_lazy("admin:gamification_badge_changelist")},
                    {"title": "Awarded badges", "icon": "workspace_premium", "link": reverse_lazy("admin:gamification_userbadge_changelist")},
                ],
            },
            {
                "title": "Accounts",
                "items": [
                    {"title": "Users", "icon": "group", "link": reverse_lazy("admin:accounts_user_changelist")},
                    {"title": "Profiles", "icon": "badge", "link": reverse_lazy("admin:accounts_profile_changelist")},
                    {"title": "Follows", "icon": "person_add", "link": reverse_lazy("admin:accounts_follow_changelist")},
                ],
            },
        ],
    },
}

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


def _database_from_url(url):
    parsed = urlparse(url)
    engine_map = {
        "postgres": "django.db.backends.postgresql",
        "postgresql": "django.db.backends.postgresql",
        "postgresql+psycopg": "django.db.backends.postgresql",
        "sqlite": "django.db.backends.sqlite3",
    }
    driver = parsed.scheme
    engine = engine_map.get(driver, "django.db.backends.postgresql")
    if engine.endswith("sqlite3"):
        path = parsed.path or "db.sqlite3"
        return {"ENGINE": engine, "NAME": BASE_DIR / path.lstrip("/") if not path.startswith("/") else path}
    return {
        "ENGINE": engine,
        "NAME": parsed.path.lstrip("/"),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "localhost",
        "PORT": str(parsed.port or ""),
        "CONN_MAX_AGE": 60,
    }


DATABASE_URL = env("DATABASE_URL")
if DATABASE_URL:
    DATABASES = {"default": _database_from_url(DATABASE_URL)}
elif env_bool("USE_SQLITE", False) or not env("DATABASE_URL"):
    # Local-dev fallback so `manage.py` works without a running Postgres.
    # Production deploys MUST set DATABASE_URL (PostgreSQL).
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

ASGI_APPLICATION = "config.asgi.application"

# WebSockets use Redis in production (required for more than one worker).
# Local dev and tests fall back to an in-process layer.
REDIS_URL = env("REDIS_URL", "")
if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    }

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticatedOrReadOnly",),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.DefaultPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.core.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "200/min",
        "user": "600/min",
        "auth": "10/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
)
CORS_ALLOW_CREDENTIALS = True

# Admin bootstrap (never hardcode credentials in the repo).
ADMIN_USERNAME = env("ADMIN_USERNAME")
ADMIN_EMAIL = env("ADMIN_EMAIL")
ADMIN_PASSWORD = env("ADMIN_PASSWORD")

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

LOGIN_URL = "/admin/login/"

# --- Email (invitations, verification, password reset) ---
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = env_int("EMAIL_PORT", 587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "no-reply@curiousbright.com.ng")
ORG_FRONTEND_URL = env("ORG_FRONTEND_URL", "https://org.curiousbright.com.ng")
APP_FRONTEND_URL = env("APP_FRONTEND_URL", "https://app.curiousbright.com.ng")
BILLING_CALLBACK_URL = env(
    "BILLING_CALLBACK_URL", f"{APP_FRONTEND_URL.rstrip('/')}/payment/verify"
)

# --- Payments (Paystack) ---
PAYSTACK_PUBLIC_KEY = env("PAYSTACK_PUBLIC_KEY", "")
PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY", "")
PAYSTACK_WEBHOOK_SECRET = env("PAYSTACK_WEBHOOK_SECRET", "")
PAYSTACK_API_BASE = env("PAYSTACK_API_BASE", "https://api.paystack.co")

# --- Live video (LiveKit) ---
# Create a project at https://cloud.livekit.io and copy the ws URL + API key.
# Tokens are minted server-side so the API secret never reaches the browser.
LIVEKIT_URL = env("LIVEKIT_URL", "")
LIVEKIT_API_KEY = env("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = env("LIVEKIT_API_SECRET", "")
LIVEKIT_TOKEN_TTL_SECONDS = env_int("LIVEKIT_TOKEN_TTL_SECONDS", 7200)
BILLING_PLAN_PRICES = {
    "pro": {
        "NGN": env_int("BILLING_PRO_NGN", 500000),
        "USD": env_int("BILLING_PRO_USD", 1200),
    }
}

# Reversible content deletion: client undo window + hard-delete horizon.
SOFT_DELETE_UNDO_SECONDS = env_int("SOFT_DELETE_UNDO_SECONDS", 300)
SOFT_DELETE_RETENTION_DAYS = env_int("SOFT_DELETE_RETENTION_DAYS", 30)
