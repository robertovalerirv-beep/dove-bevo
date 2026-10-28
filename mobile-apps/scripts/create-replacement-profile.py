#!/usr/bin/env python3
"""Coordinator-only Apple profile replacement. Default: verified GET-only plan.

All inputs, the durable one-attempt marker and UNVERIFIED output belong to the
existing protected OS signing store. No certificate/key/bundle changes, secret
publication or cryptographic attestation of the downloaded profile occur here.
Requires the installed cryptography package and Git OpenSSL; installs nothing.
"""
import argparse
import base64
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import ssl
import stat
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

TEAM = "9T359CV674"
BUNDLE = "com.dovebevo.app"
ATTEMPT = "20261028a"
NAME = "Dove Bevo App Store " + ATTEMPT
HOST = "api.appstoreconnect.apple.com"
BASE = "https://" + HOST
MAX_BYTES = 4 * 1024 * 1024
MARKER = "replacement-profile-" + ATTEMPT + ".attempt.json"
OUTPUT = "ios-app-store-" + ATTEMPT + ".UNVERIFIED.mobileprovision"


class SafeError(Exception):
    """Only fixed classifications may cross the CLI boundary."""


def require(condition, code):
    if not condition:
        raise SafeError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_bounded(path):
    with Path(path).open("rb") as stream:
        value = stream.read(MAX_BYTES + 1)
    require(0 < len(value) <= MAX_BYTES, "local-file-size-invalid")
    return value


def no_links(path):
    for item in [path, *path.parents]:
        require(not item.is_symlink(), "protected-path-link-refused")
        if item.exists():
            require(not getattr(item.lstat(), "st_file_attributes", 0) & 0x400, "protected-path-link-refused")


def protected_path(path, store, existing=True):
    path, store = Path(path).absolute(), Path(store).absolute()
    no_links(path)
    resolved = path.resolve(strict=existing)
    require(resolved.is_relative_to(store.resolve(strict=True)), "outside-protected-store")
    require(not any(part.casefold().startswith("onedrive") for part in resolved.parts), "onedrive-refused")
    mirror = os.environ.get("OneDrive")
    require(not mirror or not resolved.is_relative_to(Path(mirror).resolve()), "onedrive-refused")
    require(not resolved.is_relative_to(Path(__file__).resolve().parents[2]), "checkout-refused")
    if existing:
        require(resolved.is_file() and not resolved.is_symlink(), "protected-file-required")
    return resolved


def verify_windows_acl(path, directory=False):
    # Match prepare-signing.ps1: current owner and SYSTEM only. Read ACLs only;
    # never broaden permissions or change the existing protected signing store.
    require(os.name == "nt", "approved-windows-store-required")
    script = r'''$ErrorActionPreference='Stop'
$acl=Get-Acl -LiteralPath $env:DOVEBEVO_PROFILE_CHECK_PATH
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner.Value){exit 2}
if($env:DOVEBEVO_PROFILE_CHECK_DIRECTORY -eq 'true' -and -not $acl.AreAccessRulesProtected){exit 2}
foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
 if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($owner.Value,'S-1-5-18')){exit 2}
}
Write-Output 'protected'
'''
    env = {name: os.environ[name] for name in ["PATH", "SystemRoot", "WINDIR"] if name in os.environ}
    env.update(DOVEBEVO_PROFILE_CHECK_PATH=str(path), DOVEBEVO_PROFILE_CHECK_DIRECTORY=str(directory).lower())
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                            env=env, capture_output=True, text=True, timeout=15,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    require(result.returncode == 0 and result.stdout.strip() == "protected", "protected-acl-required")


def local_context(cms, certificate):
    # Decode the known old input only. -noverify supplies no Apple chain-trust
    # attestation and this XML view makes no DER/source-of-truth assertion.
    openssl = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/usr/bin/openssl.exe"
    decoded = subprocess.run([str(openssl), "cms", "-verify", "-noverify", "-inform", "DER"],
                             input=cms, capture_output=True, timeout=15,
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    require(decoded.returncode == 0 and len(decoded.stdout) <= MAX_BYTES, "old-cms-metadata-unavailable")
    profile = plistlib.loads(decoded.stdout)
    # Existing release metadata guards remain authoritative for the old input.
    spec = importlib.util.spec_from_file_location("release_support", Path(__file__).resolve().parents[1] / "ios/scripts/release_support.py")
    release = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(release)
    metadata = release.validated_profile(profile)
    require(metadata["team"] == TEAM and metadata["bundle"] == BUNDLE, "local-profile-team-or-bundle-mismatch")
    if certificate.startswith(b"-----BEGIN CERTIFICATE-----"):
        certificate = ssl.PEM_cert_to_DER_cert(certificate.decode("ascii"))
    require(profile["DeveloperCertificates"] == [certificate], "approved-certificate-mismatch")
    require(isinstance(profile.get("Name"), str) and 0 < len(profile["Name"]) <= 255, "old-profile-name-invalid")
    created = profile.get("CreationDate")
    require(isinstance(created, dt.datetime), "old-profile-created-date-invalid")
    return {"cms": cms, "certificate": certificate, "name": profile["Name"], "uuid": metadata["uuid"],
            "created": timestamp(created), "expires": timestamp(profile["ExpirationDate"])}


def timestamp(value):
    if isinstance(value, str):
        value = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(isinstance(value, dt.datetime), "profile-date-invalid")
    return value.replace(tzinfo=dt.timezone.utc) if value.tzinfo is None else value.astimezone(dt.timezone.utc)


def token_factory(key_data, key_id, issuer):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, utils
    require(bool(re.fullmatch(r"[A-Z0-9]{10}", key_id)), "team-key-id-invalid")
    require(bool(re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", issuer)), "team-key-issuer-invalid")
    require(key_data.startswith(b"-----BEGIN PRIVATE KEY-----"), "team-key-format-invalid")
    key = serialization.load_pem_private_key(key_data, password=None)
    require(isinstance(key, ec.EllipticCurvePrivateKey) and key.curve.name == "secp256r1", "team-key-format-invalid")

    def encode(value):
        return base64.urlsafe_b64encode(value).rstrip(b"=")

    def token():
        now = int(time.time())
        header = encode(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}, separators=(",", ":")).encode())
        payload = encode(json.dumps({"iss": issuer, "iat": now, "exp": now + 300,
                                     "aud": "appstoreconnect-v1"}, separators=(",", ":")).encode())
        message = header + b"." + payload
        r, s = utils.decode_dss_signature(key.sign(message, ec.ECDSA(hashes.SHA256())))
        return (message + b"." + encode(r.to_bytes(32, "big") + s.to_bytes(32, "big"))).decode("ascii")
    return token


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        return None


class AppleAPI:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    @staticmethod
    def url(path):
        url = urllib.parse.urljoin(BASE, path)
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == "https" and parsed.netloc == HOST and not parsed.fragment,
                "apple-url-refused")
        require(bool(re.fullmatch(r"/v1/(?:profiles(?:/[A-Za-z0-9-]+)?|bundleIds/[A-Za-z0-9-]+|certificates/[A-Za-z0-9-]+)", parsed.path)),
                "apple-endpoint-refused")
        return url

    def request(self, method, path, payload=None):
        url = self.url(path)
        require(method == "GET" or (method == "POST" and urllib.parse.urlsplit(url).path == "/v1/profiles"), "apple-method-refused")
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
        request = urllib.request.Request(url, body, {"Authorization": "Bearer " + self.token(),
                                                    "Content-Type": "application/json", "Accept": "application/json"}, method=method)
        try:
            with self.opener.open(request, timeout=20) as response:
                require(response.status == (201 if method == "POST" else 200), "apple-response-status-invalid")
                raw = response.read(MAX_BYTES + 1)
            require(len(raw) <= MAX_BYTES, "apple-response-too-large")
            document = json.loads(raw)
            require(isinstance(document, dict), "apple-response-invalid")
            return document
        except urllib.error.HTTPError as error:
            status = int(error.code)
            error.close()
            raise SafeError("apple-http-" + str(status)) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise SafeError("apple-network-error") from None
        except (ValueError, UnicodeError):
            raise SafeError("apple-response-invalid") from None

    def get(self, path):
        return self.request("GET", path)

    def post(self, payload):
        return self.request("POST", "/v1/profiles", payload)


def resource(document, kind, resource_id=None):
    value = document.get("data")
    require(isinstance(value, dict) and value.get("type") == kind, "apple-resource-invalid")
    require(isinstance(value.get("id"), str) and re.fullmatch(r"[A-Za-z0-9-]{1,128}", value["id"]), "apple-resource-id-invalid")
    require(resource_id is None or value["id"] == resource_id, "apple-resource-id-mismatch")
    return value


def profiles(api):
    path, seen, count = "/v1/profiles?limit=100", set(), 0
    for _ in range(50):
        canonical = AppleAPI.url(path)
        require(canonical not in seen, "apple-pagination-loop")
        seen.add(canonical)
        page = api.get(path)
        require(isinstance(page.get("data"), list), "apple-profile-list-invalid")
        for item in page["data"]:
            count += 1
            require(count <= 5000 and isinstance(item, dict) and item.get("type") == "profiles", "apple-profile-list-invalid")
            yield item
        path = page.get("links", {}).get("next")
        if path is None:
            return
        require(isinstance(path, str) and bool(path), "apple-pagination-invalid")
    raise SafeError("apple-pagination-limit")


def exact_matches(api, name=None, uuid=None):
    matches = [item for item in profiles(api) if
               (name is not None and item.get("attributes", {}).get("name") == name) or
               (uuid is not None and str(item.get("attributes", {}).get("uuid", "")).upper() == uuid)]
    require(len(matches) <= 1, "profile-match-ambiguous")
    return matches


def read_profile(api, profile_id, context, old=False, pinned=None):
    value = resource(api.get("/v1/profiles/" + profile_id + "?include=bundleId,certificates"), "profiles", profile_id)
    attrs = value["attributes"]
    require(attrs.get("profileState") == "ACTIVE" and attrs.get("profileType") == "IOS_APP_STORE", "profile-state-or-type-invalid")
    require(attrs.get("name") == (context["name"] if old else NAME), "profile-name-mismatch")
    uuid = attrs.get("uuid", "")
    require(isinstance(uuid, str) and re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", uuid), "profile-uuid-invalid")
    require((uuid.upper() == context["uuid"]) == old, "profile-uuid-mismatch")
    created, expires = timestamp(attrs.get("createdDate")), timestamp(attrs.get("expirationDate"))
    now = dt.datetime.now(dt.timezone.utc)
    require(created <= now < expires and created < expires, "profile-dates-invalid")
    if old:
        require(created == context["created"] and expires == context["expires"], "old-profile-date-mismatch")
    relations = value["relationships"]
    bundle = resource({"data": relations["bundleId"]["data"]}, "bundleIds")["id"]
    certificates = relations["certificates"]["data"]
    require(isinstance(certificates, list) and len(certificates) == 1, "profile-certificate-count-invalid")
    certificate = resource({"data": certificates[0]}, "certificates")["id"]
    require(not relations.get("devices", {}).get("data"), "profile-devices-refused")
    ids = {"bundle": bundle, "certificate": certificate}
    require(pinned is None or ids == pinned, "profile-relationship-mismatch")
    bundle_data = resource(api.get("/v1/bundleIds/" + bundle), "bundleIds", bundle)
    require(bundle_data["attributes"].get("identifier") == BUNDLE, "profile-bundle-mismatch")
    cert_data = resource(api.get("/v1/certificates/" + certificate), "certificates", certificate)
    require(base64.b64decode(cert_data["attributes"]["certificateContent"], validate=True) == context["certificate"], "approved-certificate-mismatch")
    cms = base64.b64decode(attrs["profileContent"], validate=True)
    require(0 < len(cms) <= MAX_BYTES, "profile-content-invalid")
    require(not old or cms == context["cms"], "old-profile-content-mismatch")
    return value, ids, cms


def create_once(api, context, store, apply=False):
    old = exact_matches(api, uuid=context["uuid"])
    require(len(old) == 1, "old-profile-unavailable")
    old_id = resource({"data": old[0]}, "profiles")["id"]
    _, ids, _ = read_profile(api, old_id, context, old=True)
    pins = {"version": 1, "attempt": ATTEMPT, "name": NAME, "team": TEAM, "identifier": BUNDLE, "oldProfile": old_id,
            "oldCMS_SHA256": digest(context["cms"]), "certificateSHA256": digest(context["certificate"]), **ids}
    marker, output = store / MARKER, store / OUTPUT
    protected_path(marker, store, existing=False)
    protected_path(output, store, existing=False)
    attempted = marker.exists()
    if attempted:
        require(json.loads(read_bounded(marker)) == pins, "attempt-marker-mismatch")
    matches = exact_matches(api, name=NAME)
    require(not output.exists(), "unverified-output-exists")
    if not apply:
        if matches:
            read_profile(api, resource({"data": matches[0]}, "profiles")["id"], context, pinned=ids)
        require(matches or not attempted, "attempt-outcome-unknown")
        return {"planVerified": True, "attempt": ATTEMPT, "wouldCreate": not bool(matches), "mutationPerformed": False}
    if not matches:
        require(not attempted, "attempt-outcome-unknown")
        # Durable intent before the only POST. Never delete/reset this marker,
        # even on timeout, malformed responses, process death or HTTP rejection.
        with os.fdopen(os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "wb") as stream:
            stream.write(json.dumps(pins, sort_keys=True).encode())
            stream.flush()
            os.fsync(stream.fileno())
        payload = {"data": {"type": "profiles", "attributes": {"name": NAME, "profileType": "IOS_APP_STORE"},
                            "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": ids["bundle"]}},
                                              "certificates": {"data": [{"type": "certificates", "id": ids["certificate"]}]}}}}
        response_id = None
        try:
            response_id = resource(api.post(payload), "profiles")["id"]
        except SafeError as error:
            code = str(error)
            if re.fullmatch(r"apple-http-4[0-9]{2}", code) and code not in {"apple-http-408", "apple-http-409", "apple-http-429"}:
                raise
        matches = exact_matches(api, name=NAME)
        require(len(matches) == 1, "attempt-outcome-unknown")
        candidate_id = resource({"data": matches[0]}, "profiles")["id"]
        require(response_id is None or response_id == candidate_id, "created-profile-id-mismatch")
    candidate_id = resource({"data": matches[0]}, "profiles")["id"]
    require(candidate_id != old_id, "old-profile-replacement-refused")
    _, _, cms = read_profile(api, candidate_id, context, pinned=ids)
    read_profile(api, old_id, context, old=True, pinned=ids)
    with os.fdopen(os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "wb") as stream:
        stream.write(cms)
        stream.flush()
        os.fsync(stream.fileno())
    return {"attempt": ATTEMPT, "downloadedUnverified": True, "cmsSHA256": digest(cms),
            "oldProfileActive": True, "cryptographicVerificationRequired": True}


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise SafeError("invalid-arguments")


def main(argv=None):
    try:
        parser = SafeParser(description=__doc__, allow_abbrev=False)
        for name in ["team-key", "key-id", "issuer-id", "old-profile", "approved-certificate"]:
            parser.add_argument("--" + name, required=True)
        parser.add_argument("--apply", action="store_true", help="Permit at most one protected, non-retrying profile POST")
        args = parser.parse_args(argv)
        store = Path(os.environ["LOCALAPPDATA"]) / "DoveBevo/signing"
        no_links(store)
        require(store.is_dir(), "protected-store-required")
        verify_windows_acl(store, directory=True)
        paths = [protected_path(value, store) for value in [args.team_key, args.old_profile, args.approved_certificate]]
        for path in paths:
            verify_windows_acl(path)
        context = local_context(read_bounded(paths[1]), read_bounded(paths[2]))
        api = AppleAPI(token_factory(read_bounded(paths[0]), args.key_id, args.issuer_id))
        result = create_once(api, context, store, args.apply)
        print(json.dumps(result, sort_keys=True))
        return 0
    except SafeError as error:
        print(json.dumps({"error": str(error)}))
    except KeyboardInterrupt:
        print('{"error":"interrupted-reconcile-before-any-further-action"}')
    except Exception:
        print('{"error":"local-or-api-validation-failed"}')
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
