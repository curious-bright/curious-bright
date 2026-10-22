from django.conf import settings

CURRENCIES = ("NGN", "USD")

PLAN_DEFINITIONS = [
    {
        "code": "free",
        "name": "Free / Basic",
        "tagline": "Everything a small department or study group needs to get started.",
        "seats": 50,
        "storage_gb": 5,
        "video_minutes": 500,
        "interval": "month",
        "custom": False,
        "features": [
            "Up to 50 members",
            "Invitations and domain join",
            "5GB research document storage",
            "500 monthly video call minutes",
            "Study rooms & collaborative chalkboard",
            "Shared knowledge library",
        ],
    },
    {
        "code": "ngo",
        "name": "NGO",
        "tagline": "For education non-profits and community foundations.",
        "seats": 200,
        "storage_gb": 50,
        "video_minutes": 3000,
        "interval": "month",
        "custom": False,
        "features": [
            "Up to 200 members",
            "50GB shared research storage",
            "3,000 monthly video call minutes",
            "Audit log & student account creation",
            "Priority community support",
        ],
    },
    {
        "code": "research_institute",
        "name": "Research Institute",
        "tagline": "For laboratories and advanced academic research centers.",
        "seats": 500,
        "storage_gb": 200,
        "video_minutes": 10000,
        "interval": "month",
        "custom": False,
        "features": [
            "Up to 500 members",
            "200GB research document storage",
            "10,000 monthly video call minutes",
            "Collaborative Research Studio & revisions",
            "Role-based member management & moderation",
        ],
    },
    {
        "code": "university",
        "name": "University",
        "tagline": "For higher education institutions with large faculties.",
        "seats": 2000,
        "storage_gb": 1000,
        "video_minutes": 50000,
        "interval": "month",
        "custom": False,
        "features": [
            "Up to 2,000 members",
            "1TB institution-wide storage",
            "50,000 monthly video call minutes",
            "Auto-domain enrollment & student CSV generator",
            "Dedicated onboarding & custom SLA",
        ],
    },
    {
        "code": "pro",
        "name": "Pro",
        "tagline": "For growing faculties that need oversight.",
        "seats": 500,
        "storage_gb": 100,
        "video_minutes": 5000,
        "interval": "month",
        "custom": False,
        "features": [
            "Up to 500 members",
            "Everything in Free",
            "Audit log",
            "Role-based moderation",
            "Priority support",
        ],
    },
    {
        "code": "enterprise",
        "name": "Enterprise",
        "tagline": "Unlimited seats and a plan shaped around your institution.",
        "seats": 0,
        "storage_gb": 5000,
        "video_minutes": 0,
        "interval": "year",
        "custom": True,
        "features": [
            "Unlimited members",
            "Everything in University",
            "Custom onboarding & procurement support",
            "Dedicated success manager",
        ],
    },
]

DEFAULT_PRICES = {
    "free": {"monthly": {"NGN": 0, "USD": 0}, "annual": {"NGN": 0, "USD": 0}},
    "ngo": {"monthly": {"NGN": 2500000, "USD": 2500}, "annual": {"NGN": 25000000, "USD": 25000}},
    "research_institute": {"monthly": {"NGN": 6000000, "USD": 6000}, "annual": {"NGN": 60000000, "USD": 60000}},
    "university": {"monthly": {"NGN": 15000000, "USD": 15000}, "annual": {"NGN": 150000000, "USD": 150000}},
    "pro": {"monthly": {"NGN": 500000, "USD": 1200}, "annual": {"NGN": 5000000, "USD": 12000}},
    "enterprise": {"monthly": {"NGN": 0, "USD": 0}, "annual": {"NGN": 0, "USD": 0}},
}

SYMBOLS = {"NGN": "₦", "USD": "$"}


def detect_currency_from_request(request):
    """Detect country server-side from IP with manual override.
    Nigeria -> NGN. Everywhere else, including rest of Africa -> USD.
    """
    if not request:
        return "NGN"
    override = (
        request.query_params.get("currency")
        if hasattr(request, "query_params")
        else request.GET.get("currency")
    ) or request.headers.get("X-Currency")
    if override and override.upper() in CURRENCIES:
        return override.upper()

    country = (
        request.headers.get("CF-IPCountry")
        or request.headers.get("X-Country-Code")
        or request.META.get("HTTP_CF_IPCOUNTRY")
        or request.META.get("HTTP_X_COUNTRY_CODE")
        or ""
    ).strip().upper()

    if country:
        return "NGN" if country == "NG" else "USD"

    # Fallback to NGN for local dev
    return "NGN"


def get_plan(code):
    try:
        from .models import PlanTier

        tier = PlanTier.objects.filter(code=code, is_active=True).first()
        if tier:
            return {
                "code": tier.code,
                "name": tier.name,
                "tagline": tier.tagline,
                "seats": tier.seat_limit,
                "storage_gb": tier.storage_limit_gb,
                "video_minutes": tier.video_minutes_limit,
                "interval": "month",
                "custom": tier.code == "enterprise",
                "features": tier.features or [],
            }
    except Exception:
        pass
    return next((plan for plan in PLAN_DEFINITIONS if plan["code"] == code), None)


def amount_for(code, currency, interval="month"):
    currency = (currency or "NGN").upper()
    try:
        from .models import PlanTier

        tier = PlanTier.objects.filter(code=code, is_active=True).first()
        if tier:
            if interval == "year":
                return tier.annual_price_ngn if currency == "NGN" else tier.annual_price_usd
            return tier.monthly_price_ngn if currency == "NGN" else tier.monthly_price_usd
    except Exception:
        pass

    defaults = DEFAULT_PRICES.get(code, {})
    interval_prices = defaults.get("annual" if interval == "year" else "monthly")
    if interval_prices is not None:
        return int(interval_prices.get(currency, 0))
    # backward-compatibility for flat dictionary
    if currency in defaults:
        return int(defaults[currency])
    return 0


def format_amount(minor, currency):
    amount = minor / 100
    if amount == int(amount):
        formatted = f"{int(amount):,}"
    else:
        formatted = f"{amount:,.2f}"
    return f"{SYMBOLS.get(currency, currency + ' ')}{formatted}"


def plans_payload(currency="NGN", interval="month"):
    currency = currency.upper()
    if currency not in CURRENCIES:
        currency = "NGN"
    interval = "year" if str(interval).lower() in ("year", "annual", "annualy", "annually") else "month"
    plans = []
    for definition in PLAN_DEFINITIONS:
        amount = amount_for(definition["code"], currency, interval=interval)
        plans.append(
            {
                **definition,
                "interval": interval,
                "amount": amount,
                "amount_display": "Custom" if definition["custom"] else format_amount(amount, currency),
                "currency": currency,
            }
        )
    return {
        "currency": currency,
        "currencies": list(CURRENCIES),
        "interval": interval,
        "plans": plans,
        "limits": {
            "free": {"seats": 50, "storage_gb": 5, "video_minutes": 500},
            "ngo": {"seats": 200, "storage_gb": 50, "video_minutes": 3000},
            "research_institute": {"seats": 500, "storage_gb": 200, "video_minutes": 10000},
            "university": {"seats": 2000, "storage_gb": 1000, "video_minutes": 50000},
        },
    }

