"""
Configuration for the demo payment service.

The SERVICE_VERSION env var controls behavior:
  - v1.40: All requests healthy (stable baseline)
  - v1.41: Bug introduced — null payment_method causes 500 errors deterministically
  - v1.42: Bug fixed — null check restored

This must be deterministic on every run — no randomness.
"""

import os

SERVICE_VERSION = os.environ.get("SERVICE_VERSION", "v1.41")
SERVICE_NAME = "payment-service"
SERVICE_PORT = int(os.environ.get("PORT", "8000"))
