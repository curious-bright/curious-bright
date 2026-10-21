from django.conf import settings

CURRENCIES = ("NGN", "USD")

PLAN_DEFINITIONS = [
    {
        "code": "free",
        "name": "Free",
        "tagline": "Everything a small department needs to get started.",
        "seats": 50,
        "interval": "month",
        "custom": False,
        "features": [
            "Up to 50 members",
            "Invitations and domain join",
            "Organization dashboard",
            "Shared knowledge library",
        ],
    },
    {
        "code": "pro",
        "name": "Pro",
        "tagline": "For growing faculties that need oversight.",
        "seats": 500,
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
        "interval": "year",
        "custom": True,
        "features": [
            "Unlimited members",
            "Everything in Pro",
            "Custom onboarding",
            "Invoicing and procurement support",
            "Dedicated success manager",
        ],
    },
]

DEFAULT_PRICES = {
    "pro": {"NGN": 500000, "USD": 1200},
    "enterprise": {"NGN": 0, "USD": 0},
}

SYMBOLS = {"NGN": "₦", "USD": "$"}


def prices():
    configured = getattr(settings, "BILLING_PLAN_PRICES", None) or DEFAULT_PRICES
    merged = {code: dict(DEFAULT_PRICES.get(code, {})) for code in DEFAULT_PRICES}
    for code, value in configured.items():
        merged.setdefault(code, {}).update(value)
    return merged


def get_plan(code):
    return next((plan for plan in PLAN_DEFINITIONS if plan["code"] == code), None)


def amount_for(code, currency):
    currency = (currency or "NGN").upper()
    return int(prices().get(code, {}).get(currency, 0) or 0)


def format_amount(minor, currency):
    amount = minor / 100
    if amount == int(amount):
        formatted = f"{int(amount):,}"
    else:
        formatted = f"{amount:,.2f}"
    return f"{SYMBOLS.get(currency, currency + ' ')}{formatted}"


def plans_payload(currency="NGN"):
    currency = currency.upper()
    if currency not in CURRENCIES:
        currency = "NGN"
    plans = []
    for definition in PLAN_DEFINITIONS:
        amount = amount_for(definition["code"], currency)
        plans.append(
            {
                **definition,
                "amount": amount,
                "amount_display": "Custom" if definition["custom"] else format_amount(amount, currency),
                "currency": currency,
            }
        )
    return {"currency": currency, "currencies": list(CURRENCIES), "plans": plans}
