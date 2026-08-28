"""
Demo Payment Service — Agent Guardian

A small FastAPI payment service with a controllable bug across versions:
  - v1.40: healthy baseline
  - v1.41: null payment_method bug (deterministic 500s)
  - v1.42: bug fixed

Monitoring simulation exposes request_count, error_count, error_rate, latency
with a predictable error-rate spike when running v1.41.
"""

import time
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from config import SERVICE_VERSION, SERVICE_NAME

# ─── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title=f"{SERVICE_NAME} ({SERVICE_VERSION})",
    description="Demo payment service for Agent Guardian incident response testing",
    version=SERVICE_VERSION,
)

# ─── In-memory state ──────────────────────────────────────────────────────────

payments_db: dict[str, dict] = {}

# Monitoring counters — deterministic, no randomness
metrics = {
    "request_count": 0,
    "error_count": 0,
    "latency_sum_ms": 0.0,
}


# ─── Models ────────────────────────────────────────────────────────────────────

class PaymentRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: Optional[str] = None
    metadata: dict = {}


class PaymentResponse(BaseModel):
    payment_id: str
    amount: float
    currency: str
    payment_method: Optional[str]
    status: str
    version: str


# ─── Version-dependent payment processing ─────────────────────────────────────

def process_payment_v140(payment: PaymentRequest) -> dict:
    """v1.40: Stable baseline — validates payment_method before use."""
    if not payment.payment_method:
        raise ValueError("payment_method is required")

    method = payment.payment_method.strip().lower()
    return {
        "method": method,
        "status": "completed",
    }


def process_payment_v141(payment: PaymentRequest) -> dict:
    """v1.41: BUG — removed null check for payment_method.
    
    When payment_method is None, calling .lower() raises AttributeError.
    This is deterministic: every request with null payment_method WILL fail.
    """
    # BUG: No null check — this line crashes when payment_method is None
    method = payment.payment_method.lower()  # type: ignore[union-attr]
    return {
        "method": method,
        "status": "completed",
    }


def process_payment_v142(payment: PaymentRequest) -> dict:
    """v1.42: Fix — null check restored with explicit error message."""
    if payment.payment_method is None:
        raise ValueError("payment_method is required")

    method = payment.payment_method.lower()
    return {
        "method": method,
        "status": "completed",
    }


# Version dispatch — deterministic, no randomness
VERSION_HANDLERS = {
    "v1.40": process_payment_v140,
    "v1.41": process_payment_v141,
    "v1.42": process_payment_v142,
}


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Service health check."""
    error_rate = (
        (metrics["error_count"] / metrics["request_count"] * 100)
        if metrics["request_count"] > 0
        else 0.0
    )
    avg_latency = (
        (metrics["latency_sum_ms"] / metrics["request_count"])
        if metrics["request_count"] > 0
        else 0.0
    )

    status = "healthy"
    if error_rate > 10:
        status = "degraded"
    elif error_rate > 50:
        status = "down"

    return {
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "status": status,
        "error_rate": round(error_rate, 2),
        "avg_latency_ms": round(avg_latency, 2),
    }


@app.get("/metrics")
def get_metrics():
    """Monitoring simulation endpoint.
    
    Returns request_count, error_count, error_rate, latency.
    Produces a predictable error-rate spike after v1.41 deploys.
    """
    error_rate = (
        (metrics["error_count"] / metrics["request_count"] * 100)
        if metrics["request_count"] > 0
        else 0.0
    )
    avg_latency = (
        (metrics["latency_sum_ms"] / metrics["request_count"])
        if metrics["request_count"] > 0
        else 0.0
    )

    return {
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "request_count": metrics["request_count"],
        "error_count": metrics["error_count"],
        "error_rate": round(error_rate, 2),
        "avg_latency_ms": round(avg_latency, 2),
    }


@app.post("/payments", response_model=PaymentResponse)
def create_payment(payment: PaymentRequest):
    """Create a payment. Behavior depends on SERVICE_VERSION."""
    start_time = time.monotonic()
    metrics["request_count"] += 1

    handler = VERSION_HANDLERS.get(SERVICE_VERSION)
    if handler is None:
        raise HTTPException(
            status_code=500,
            detail=f"Unknown service version: {SERVICE_VERSION}",
        )

    try:
        result = handler(payment)
    except (AttributeError, ValueError) as e:
        # Track the error in metrics
        elapsed_ms = (time.monotonic() - start_time) * 1000
        metrics["error_count"] += 1
        metrics["latency_sum_ms"] += elapsed_ms

        raise HTTPException(
            status_code=500,
            detail={
                "error": str(e),
                "version": SERVICE_VERSION,
                "payment_method": payment.payment_method,
                "trace_id": f"trace-{uuid.uuid4().hex[:8]}",
            },
        )

    # Success path
    elapsed_ms = (time.monotonic() - start_time) * 1000
    metrics["latency_sum_ms"] += elapsed_ms

    payment_id = f"pay_{uuid.uuid4().hex[:8]}"
    payment_record = {
        "payment_id": payment_id,
        "amount": payment.amount,
        "currency": payment.currency,
        "payment_method": result["method"],
        "status": result["status"],
        "version": SERVICE_VERSION,
    }
    payments_db[payment_id] = payment_record

    return PaymentResponse(**payment_record)


@app.get("/payments/{payment_id}")
def get_payment(payment_id: str):
    """Retrieve a payment by ID."""
    metrics["request_count"] += 1

    if payment_id not in payments_db:
        raise HTTPException(status_code=404, detail="Payment not found")

    return payments_db[payment_id]


# ─── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    from config import SERVICE_PORT

    print(f"Starting {SERVICE_NAME} {SERVICE_VERSION} on port {SERVICE_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT)
