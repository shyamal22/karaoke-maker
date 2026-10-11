"""Minimal Xero API client for RCK AP automation.

Uses a Xero Custom Connection (OAuth2 client_credentials, machine-to-machine).
Stdlib only — no third-party dependencies, so it runs anywhere Python 3.8+ does.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

TOKEN_URL = "https://identity.xero.com/connect/token"
API_BASE = "https://api.xero.com/api.xro/2.0"
CONNECTIONS_URL = "https://api.xero.com/connections"
SCOPES = "accounting.transactions accounting.contacts.read accounting.settings.read"


class XeroError(RuntimeError):
    pass


class XeroClient:
    def __init__(self, client_id=None, client_secret=None):
        self.client_id = client_id or os.environ.get("XERO_CLIENT_ID")
        self.client_secret = client_secret or os.environ.get("XERO_CLIENT_SECRET")
        if not self.client_id or not self.client_secret:
            raise XeroError(
                "Missing credentials: set XERO_CLIENT_ID and XERO_CLIENT_SECRET "
                "environment variables (see README.md)."
            )
        self._token = None
        self._token_expiry = 0
        self._tenant_id = None

    # --- auth -------------------------------------------------------------

    def _get_token(self):
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        basic = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()
        body = urllib.parse.urlencode(
            {"grant_type": "client_credentials", "scope": SCOPES}
        ).encode()
        req = urllib.request.Request(
            TOKEN_URL,
            data=body,
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        data = self._send(req, auth_call=True)
        self._token = data["access_token"]
        self._token_expiry = time.time() + int(data.get("expires_in", 1800))
        return self._token

    def _tenant(self):
        """Custom connections are bound to one org; /connections returns it."""
        if self._tenant_id is None:
            conns = self._request("GET", CONNECTIONS_URL, absolute=True)
            self._tenant_id = conns[0]["tenantId"] if conns else ""
        return self._tenant_id

    # --- http -------------------------------------------------------------

    def _send(self, req, auth_call=False):
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    raw = resp.read().decode()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as e:
                detail = e.read().decode(errors="replace")[:2000]
                if e.code == 429 and attempt < 3:
                    wait = int(e.headers.get("Retry-After", "5"))
                    time.sleep(max(wait, 2))
                    continue
                raise XeroError(f"HTTP {e.code} on {req.full_url}: {detail}") from e
            except urllib.error.URLError as e:
                if attempt < 3:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise XeroError(f"Network error on {req.full_url}: {e}") from e
        raise XeroError(f"Retries exhausted for {req.full_url}")

    def _request(self, method, path, params=None, payload=None, absolute=False):
        url = path if absolute else f"{API_BASE}/{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = {
            "Authorization": f"Bearer {self._get_token()}",
            "Accept": "application/json",
        }
        if not absolute and self._tenant_id:
            headers["Xero-Tenant-Id"] = self._tenant_id
        data = None
        if payload is not None:
            data = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        return self._send(req)

    # --- api --------------------------------------------------------------

    def get_draft_bills(self):
        """All ACCPAY invoices in DRAFT status, with line items, across pages."""
        self._tenant()
        bills, page = [], 1
        while True:
            result = self._request(
                "GET",
                "Invoices",
                params={
                    "where": 'Type=="ACCPAY"',
                    "Statuses": "DRAFT",
                    "page": page,
                    "unitdp": "4",
                },
            )
            chunk = result.get("Invoices", [])
            bills.extend(chunk)
            if len(chunk) < 100:
                return bills
            page += 1

    def get_bill(self, invoice_id):
        self._tenant()
        result = self._request("GET", f"Invoices/{invoice_id}", params={"unitdp": "4"})
        invoices = result.get("Invoices", [])
        return invoices[0] if invoices else None

    def update_bills(self, invoices):
        """POST updated invoices (partial update keyed by InvoiceID)."""
        self._tenant()
        return self._request(
            "POST",
            "Invoices",
            params={"unitdp": "4", "summarizeErrors": "false"},
            payload={"Invoices": invoices},
        )

    def get_accounts(self):
        self._tenant()
        return self._request("GET", "Accounts").get("Accounts", [])

    def get_tracking_categories(self):
        self._tenant()
        return self._request("GET", "TrackingCategories").get("TrackingCategories", [])
