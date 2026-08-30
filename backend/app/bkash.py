import json
import os
import threading
import time
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import requests


class BkashConfigurationError(RuntimeError):
    pass


class BkashAPIError(RuntimeError):
    pass


class BkashClient:
    """Small server-side client for bKash Checkout (URL based) APIs.

    Merchant credentials are read only from environment variables and are never
    sent to the browser or written to the database.
    """

    def __init__(self):
        self.base_url = os.getenv("BKASH_BASE_URL", "").rstrip("/")
        self.username = os.getenv("BKASH_USERNAME", "")
        self.password = os.getenv("BKASH_PASSWORD", "")
        self.app_key = os.getenv("BKASH_APP_KEY", "")
        self.app_secret = os.getenv("BKASH_APP_SECRET", "")
        self.refund_base_url = os.getenv("BKASH_REFUND_BASE_URL", "").rstrip("/")
        self._token: Optional[str] = None
        self._token_expires_at = 0.0
        self._token_lock = threading.Lock()
        self.session = requests.Session()

    @property
    def configured(self) -> bool:
        return all([
            self.base_url,
            self.username,
            self.password,
            self.app_key,
            self.app_secret,
        ])

    def configuration_status(self) -> Dict[str, Any]:
        return {
            "configured": self.configured,
            "base_url_configured": bool(self.base_url),
            "credentials_configured": all([
                self.username,
                self.password,
                self.app_key,
                self.app_secret,
            ]),
        }

    def _require_configured(self) -> None:
        if not self.configured:
            raise BkashConfigurationError(
                "bKash merchant credentials are not configured. Set BKASH_BASE_URL, "
                "BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY and BKASH_APP_SECRET."
            )

    def _grant_token(self) -> str:
        self._require_configured()
        response = self.session.post(
            f"{self.base_url}/tokenized/checkout/token/grant",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "username": self.username,
                "password": self.password,
            },
            json={"app_key": self.app_key, "app_secret": self.app_secret},
            timeout=30,
        )
        data = self._json_response(response)
        token = data.get("id_token")
        if not token:
            raise BkashAPIError(self._error_message(data, "bKash token generation failed"))
        try:
            lifetime = int(data.get("expires_in", 3600))
        except (TypeError, ValueError):
            lifetime = 3600
        self._token = token
        # Refresh before bKash's normal one-hour expiry. This also avoids
        # requesting a token on every donation.
        self._token_expires_at = time.time() + max(60, lifetime - 600)
        return token

    def _get_token(self, force: bool = False) -> str:
        with self._token_lock:
            if not force and self._token and time.time() < self._token_expires_at:
                return self._token
            return self._grant_token()

    def _headers(self, force_token: bool = False) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": self._get_token(force=force_token),
            "X-App-Key": self.app_key,
        }

    @staticmethod
    def _json_response(response: requests.Response) -> Dict[str, Any]:
        try:
            data = response.json()
        except ValueError as exc:
            raise BkashAPIError("bKash returned an invalid response") from exc
        if response.status_code >= 400:
            raise BkashAPIError(BkashClient._error_message(data, f"bKash HTTP {response.status_code}"))
        return data

    @staticmethod
    def _error_message(data: Dict[str, Any], fallback: str) -> str:
        return (
            data.get("errorMessage")
            or data.get("errorMessageEn")
            or data.get("statusMessage")
            or fallback
        )

    def _post(self, path: str, payload: Dict[str, Any], *, retry_token: bool = True) -> Dict[str, Any]:
        self._require_configured()
        try:
            response = self.session.post(
                f"{self.base_url}{path}",
                headers=self._headers(),
                json=payload,
                timeout=30,
            )
            data = self._json_response(response)
        except requests.RequestException as exc:
            raise BkashAPIError("Could not connect to the bKash payment service") from exc

        # An expired/invalid token can be refreshed once. Never retry a
        # completed payment/refund operation for other errors.
        invalid_token = str(data.get("errorCode", "")) in {"2019", "2020", "2079"}
        if retry_token and invalid_token:
            self._get_token(force=True)
            return self._post(path, payload, retry_token=False)
        return data

    def create_payment(
        self,
        *,
        amount: float,
        payer_reference: str,
        callback_url: str,
        merchant_invoice_number: str,
    ) -> Dict[str, Any]:
        data = self._post(
            "/tokenized/checkout/create",
            {
                "mode": "0011",
                "payerReference": payer_reference,
                "callbackURL": callback_url,
                "amount": f"{amount:.2f}",
                "currency": "BDT",
                "intent": "sale",
                "merchantInvoiceNumber": merchant_invoice_number,
            },
        )
        if data.get("statusCode") != "0000" or not data.get("paymentID") or not data.get("bkashURL"):
            raise BkashAPIError(self._error_message(data, "bKash payment creation failed"))
        return data

    def execute_payment(self, payment_id: str) -> Dict[str, Any]:
        data = self._post("/tokenized/checkout/execute", {"paymentID": payment_id})
        if data.get("statusCode") != "0000" and data.get("transactionStatus") != "Completed":
            raise BkashAPIError(self._error_message(data, "bKash payment confirmation failed"))
        return data

    def query_payment(self, payment_id: str) -> Dict[str, Any]:
        data = self._post("/tokenized/checkout/payment/status", {"paymentID": payment_id})
        if data.get("statusCode") not in (None, "0000") and not data.get("transactionStatus"):
            raise BkashAPIError(self._error_message(data, "bKash payment verification failed"))
        return data

    def _refund_root(self) -> str:
        if self.refund_base_url:
            return self.refund_base_url
        # bKash's refund API is versioned as /v2. If BKASH_BASE_URL ends with
        # an onboarding API version (for example /v1.2.0-beta), use the same
        # host as the refund root.
        parsed = urlparse(self.base_url)
        return f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else self.base_url

    def _refund_post(
        self,
        path: str,
        payload: Dict[str, Any],
        *,
        retry_token: bool = True,
    ) -> Dict[str, Any]:
        self._require_configured()
        url = f"{self._refund_root()}{path}"
        try:
            response = self.session.post(url, headers=self._headers(), json=payload, timeout=30)
            data = self._json_response(response)
        except requests.RequestException as exc:
            raise BkashAPIError("Could not connect to the bKash refund service") from exc

        invalid_token = str(data.get("externalCode", "")) == "2079" or str(data.get("errorCode", "")) in {"2019", "2020", "2079"}
        if retry_token and invalid_token:
            self._get_token(force=True)
            return self._refund_post(path, payload, retry_token=False)
        return data

    def refund_payment(
        self,
        *,
        payment_id: str,
        trx_id: str,
        amount: float,
        sku: str,
        reason: str,
    ) -> Dict[str, Any]:
        data = self._refund_post(
            "/v2/tokenized-checkout/refund/payment/transaction",
            {
                "paymentId": payment_id,
                "trxId": trx_id,
                "refundAmount": f"{amount:.2f}",
                "sku": sku[:255],
                "reason": reason[:255],
            },
        )
        if data.get("refundTransactionStatus") != "Completed":
            raise BkashAPIError(self._error_message(data, "bKash refund failed"))
        return data

    def refund_status(self, *, payment_id: str, trx_id: str) -> Dict[str, Any]:
        return self._refund_post(
            "/v2/tokenized-checkout/refund/payment/status",
            {"paymentId": payment_id, "trxId": trx_id},
        )


bkash_client = BkashClient()


def sanitize_bkash_response(data: Optional[Dict[str, Any]]) -> str:
    """Store an auditable API response without retaining a full wallet number."""
    if not data:
        return "{}"
    clean = dict(data)
    msisdn = clean.get("customerMsisdn") or clean.get("payerReference")
    if isinstance(msisdn, str) and len(msisdn) >= 7 and msisdn.startswith("01"):
        masked = f"{msisdn[:3]}****{msisdn[-4:]}"
        if "customerMsisdn" in clean:
            clean["customerMsisdn"] = masked
        if "payerReference" in clean:
            clean["payerReference"] = masked
    return json.dumps(clean, ensure_ascii=False, default=str)
