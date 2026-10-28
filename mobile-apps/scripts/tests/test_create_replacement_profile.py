"""Public dummy fixtures only: never Apple accounts, real keys or signing stores."""
import base64
import copy
from contextlib import redirect_stdout
import datetime as dt
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

SPEC = importlib.util.spec_from_file_location("replacement", Path(__file__).resolve().parents[1] / "create-replacement-profile.py")
replacement = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(replacement)


class FakeAPI:
    def __init__(self, context, store):
        self.context, self.store = context, store
        self.calls, self.posts = [], []
        self.mode, self.candidates, self.paginated = "success", [], False
        self.old = self.profile("old-id", context["name"], context["uuid"], context["cms"], context["created"], context["expires"])
        self.created = self.profile("new-id", replacement.NAME, "22222222-2222-2222-2222-222222222222", b"public UNVERIFIED CMS fixture",
                                    dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1), context["expires"])

    @staticmethod
    def profile(identifier, name, uuid, cms, created, expires):
        return {"type": "profiles", "id": identifier, "attributes": {
            "name": name, "uuid": uuid, "profileState": "ACTIVE", "profileType": "IOS_APP_STORE",
            "createdDate": created.isoformat(), "expirationDate": expires.isoformat(),
            "profileContent": base64.b64encode(cms).decode()}, "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": "bundle-id"}},
                "certificates": {"data": [{"type": "certificates", "id": "cert-id"}]}}}

    def get(self, path):
        self.calls.append(("GET", path))
        if path.startswith("/v1/profiles?") or path.startswith("https://api.appstoreconnect.apple.com/v1/profiles?"):
            if self.paginated and "cursor=last" not in path:
                return {"data": [], "links": {"next": replacement.BASE + "/v1/profiles?cursor=last"}}
            return {"data": [self.old, *self.candidates], "links": {"next": None}}
        if path.startswith("/v1/profiles/old-id?"):
            return {"data": self.old}
        if path.startswith("/v1/profiles/"):
            profile_id = path.split("/", 3)[3].split("?", 1)[0]
            return {"data": next(value for value in self.candidates if value["id"] == profile_id)}
        if path == "/v1/bundleIds/bundle-id":
            return {"data": {"type": "bundleIds", "id": "bundle-id", "attributes": {"identifier": replacement.BUNDLE}}}
        if path == "/v1/certificates/cert-id":
            return {"data": {"type": "certificates", "id": "cert-id", "attributes": {
                "certificateContent": base64.b64encode(self.context["certificate"]).decode()}}}
        raise AssertionError("Unexpected fake API path")

    def post(self, payload):
        assert (self.store / replacement.MARKER).is_file(), "intent must exist before POST"
        self.posts.append(copy.deepcopy(payload))
        if self.mode in ["success", "timeout-created", "conflict-created", "malformed-created", "old-invalid"]:
            self.candidates = [self.created]
        if self.mode == "old-invalid":
            self.old["attributes"]["profileState"] = "INVALID"
        if self.mode.startswith("timeout"):
            raise replacement.SafeError("apple-network-error")
        if self.mode == "conflict-created":
            raise replacement.SafeError("apple-http-409")
        if self.mode == "forbidden":
            raise replacement.SafeError("apple-http-403")
        return {} if self.mode == "malformed-created" else {"data": {"type": "profiles", "id": "new-id"}}


class ReplacementTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[2] / "ios/.build/profile-replacement-tests"
        root.mkdir(parents=True, exist_ok=True)
        temporary = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.store = self.folder / "DoveBevo/signing"
        self.store.mkdir(parents=True)
        now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        self.context = {"cms": b"public old CMS fixture", "certificate": b"public approved certificate fixture",
                        "name": "Public Fixture Original", "uuid": "11111111-1111-1111-1111-111111111111",
                        "created": now - dt.timedelta(days=2), "expires": now + dt.timedelta(days=365)}
        self.api = FakeAPI(self.context, self.store)
        # Public fixture IO deliberately remains in selected OneDrive storage.
        # Only the production path boundary is mocked for business-logic tests;
        # its genuine OneDrive/outside-store/symlink refusals are tested below.
        self.guard = replacement.protected_path
        boundary = patch.object(replacement, "protected_path", side_effect=lambda path, store, existing=True: Path(path))
        boundary.start()
        self.addCleanup(boundary.stop)

    def run_plan(self, apply=False):
        return replacement.create_once(self.api, self.context, self.store, apply)

    def test_default_plan_is_get_only_and_writes_nothing(self):
        result = self.run_plan()
        self.assertEqual(result, {"planVerified": True, "attempt": "20261028a", "wouldCreate": True, "mutationPerformed": False})
        self.assertEqual(self.api.posts, [])
        self.assertEqual(list(self.store.iterdir()), [])

    def test_apply_posts_exact_existing_one_certificate_bundle_and_preserves_old(self):
        original = copy.deepcopy(self.api.old)
        result = self.run_plan(True)
        self.assertEqual(self.api.posts, [{"data": {"type": "profiles", "attributes": {
            "name": "Dove Bevo App Store 20261028a", "profileType": "IOS_APP_STORE"}, "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": "bundle-id"}},
                "certificates": {"data": [{"type": "certificates", "id": "cert-id"}]}}}}])
        self.assertEqual(self.api.old, original)
        self.assertTrue(result["downloadedUnverified"] and result["oldProfileActive"] and result["cryptographicVerificationRequired"])
        self.assertEqual((self.store / replacement.OUTPUT).read_bytes(), b"public UNVERIFIED CMS fixture")
        self.assertGreaterEqual(sum(path.startswith('/v1/profiles/old-id?') for method, path in self.api.calls), 2)

    def test_timeout_after_create_reconciles_without_a_second_post(self):
        self.api.mode = "timeout-created"
        self.assertTrue(self.run_plan(True)["downloadedUnverified"])
        self.assertEqual(len(self.api.posts), 1)
        self.assertTrue((self.store / replacement.MARKER).exists())

    def test_truncated_post_body_immediately_reconciles_created_profile_with_one_post(self):
        backend = self.api
        transport = replacement.AppleAPI(lambda: 'PUBLIC_TOKEN_FIXTURE_ONLY')

        class TruncatedResponse(io.BytesIO):
            status = 201
            def read(self, count):
                raise http.client.IncompleteRead(b'FABRICATED_PRIVATE_RESPONSE_ONLY', 123)

        class Opener:
            def open(self, request, timeout):
                self.marker_was_present = (backend.store / replacement.MARKER).is_file()
                backend.posts.append(json.loads(request.data))
                backend.calls.append(('POST', request.full_url))
                backend.candidates = [backend.created]
                return TruncatedResponse()

        opener = Opener()
        transport.opener = opener

        class API:
            def get(self, path): return backend.get(path)
            def post(self, payload): return transport.post(payload)

        output = io.StringIO()
        with redirect_stdout(output):
            try:
                result = replacement.create_once(API(), self.context, self.store, True)
            except http.client.HTTPException:
                self.fail('Truncated POST body bypassed immediate reconciliation')
        self.assertTrue(result['downloadedUnverified'])
        self.assertTrue(opener.marker_was_present)
        self.assertEqual(len(backend.posts), 1)
        post_index = next(index for index, call in enumerate(backend.calls) if call[0] == 'POST')
        self.assertEqual(backend.calls[post_index + 1], ('GET', '/v1/profiles?limit=100'))
        self.assertEqual(output.getvalue(), '')
        self.assertTrue((self.store / replacement.MARKER).exists())

    def test_unknown_timeout_without_visible_result_is_never_retried(self):
        self.api.mode = "timeout-empty"
        for _ in range(2):
            with self.assertRaisesRegex(replacement.SafeError, "attempt-outcome-unknown"):
                self.run_plan(True)
        self.assertEqual(len(self.api.posts), 1)
        self.assertFalse((self.store / replacement.OUTPUT).exists())

    def test_failed_durable_marker_flush_prevents_post_and_preserves_intent(self):
        with patch.object(replacement.os, 'fsync', side_effect=OSError('PUBLIC_FLUSH_FAILURE')):
            with self.assertRaises(OSError):
                self.run_plan(True)
        self.assertTrue((self.store / replacement.MARKER).exists())
        self.assertEqual(self.api.posts, [])
        with self.assertRaisesRegex(replacement.SafeError, 'attempt-outcome-unknown'):
            self.run_plan(True)
        self.assertEqual(self.api.posts, [])

    def test_conflict_and_malformed_success_reconcile_once_without_retry(self):
        for mode in ["conflict-created", "malformed-created"]:
            with self.subTest(mode=mode):
                store = self.folder / mode
                store.mkdir()
                api = FakeAPI(self.context, store)
                api.mode = mode
                self.assertTrue(replacement.create_once(api, self.context, store, True)["downloadedUnverified"])
                self.assertEqual(len(api.posts), 1)

    def test_forbidden_is_fixed_status_and_never_expands_or_retries(self):
        self.api.mode = "forbidden"
        with self.assertRaisesRegex(replacement.SafeError, "^apple-http-403$"):
            self.run_plan(True)
        with self.assertRaisesRegex(replacement.SafeError, "attempt-outcome-unknown"):
            self.run_plan(True)
        self.assertEqual(len(self.api.posts), 1)

    def test_exact_match_on_later_page_is_reused_without_post(self):
        self.api.paginated = True
        self.api.candidates = [self.api.created]
        self.assertFalse(self.run_plan()["wouldCreate"])
        self.assertTrue(self.run_plan(True)["downloadedUnverified"])
        self.assertEqual(self.api.posts, [])
        self.assertTrue(any('cursor=last' in path for method, path in self.api.calls))

    def test_ambiguous_name_including_invalid_profile_blocks_all_mutations(self):
        other = copy.deepcopy(self.api.created)
        other["id"], other["attributes"]["profileState"] = "other-id", "INVALID"
        self.api.candidates = [self.api.created, other]
        with self.assertRaisesRegex(replacement.SafeError, "profile-match-ambiguous"):
            self.run_plan(True)
        self.assertEqual(self.api.posts, [])
        self.assertEqual(list(self.store.iterdir()), [])

    def test_existing_name_wrong_type_state_uuid_dates_or_relationships_is_not_replaced(self):
        cases = [("profileType", "IOS_APP_DEVELOPMENT"), ("profileState", "INVALID"),
                 ("uuid", self.context["uuid"]), ("createdDate", "2099-01-01T00:00:00Z"),
                 ("expirationDate", "2000-01-01T00:00:00Z")]
        for field, value in cases:
            with self.subTest(field=field):
                candidate = copy.deepcopy(self.api.created)
                candidate["attributes"][field] = value
                self.api.candidates = [candidate]
                with self.assertRaises(replacement.SafeError):
                    self.run_plan(True)
                self.assertEqual(self.api.posts, [])
        for field in ["bundleId", "certificates"]:
            with self.subTest(relationship=field):
                candidate = copy.deepcopy(self.api.created)
                data = candidate["relationships"][field]["data"]
                (data[0] if isinstance(data, list) else data)["id"] = "unapproved-id"
                self.api.candidates = [candidate]
                with self.assertRaisesRegex(replacement.SafeError, "profile-relationship-mismatch"):
                    self.run_plan(True)
                self.assertEqual(self.api.posts, [])

    def test_old_name_uuid_content_and_certificate_must_match_before_post(self):
        for field, value in [("name", "Other profile"), ("uuid", "33333333-3333-3333-3333-333333333333"),
                             ("profileContent", base64.b64encode(b"different public CMS").decode())]:
            with self.subTest(field=field):
                api = FakeAPI(self.context, self.store)
                api.old["attributes"][field] = value
                with self.assertRaises(replacement.SafeError):
                    replacement.create_once(api, self.context, self.store, True)
                self.assertEqual(api.posts, [])
        bad = dict(self.context, certificate=b"other public certificate")
        with self.assertRaisesRegex(replacement.SafeError, "approved-certificate-mismatch"):
            replacement.create_once(self.api, bad, self.store, True)
        self.assertEqual(self.api.posts, [])

    def test_new_profile_must_not_disable_old_profile(self):
        self.api.mode = "old-invalid"
        with self.assertRaisesRegex(replacement.SafeError, "profile-state-or-type-invalid"):
            self.run_plan(True)
        self.assertFalse((self.store / replacement.OUTPUT).exists())
        self.assertTrue((self.store / replacement.MARKER).exists())

    def test_existing_output_and_marker_are_never_overwritten(self):
        output = self.store / replacement.OUTPUT
        output.write_bytes(b"preserve public file")
        with self.assertRaisesRegex(replacement.SafeError, "unverified-output-exists"):
            self.run_plan(True)
        self.assertEqual(output.read_bytes(), b"preserve public file")
        self.assertEqual(self.api.posts, [])
        marker = self.store / replacement.MARKER
        marker.write_text('{"other":"public intent"}')
        with self.assertRaisesRegex(replacement.SafeError, "attempt-marker-mismatch"):
            self.run_plan(True)
        self.assertEqual(marker.read_text(), '{"other":"public intent"}')

    def test_real_boundary_rejects_onedrive_credentials_output_outside_store_and_symlink(self):
        source = self.store / "public-key-fixture.p8"
        source.write_bytes(b"public fixture, not a key")
        with self.assertRaisesRegex(replacement.SafeError, "onedrive-refused"):
            self.guard(source, self.store)
        with self.assertRaisesRegex(replacement.SafeError, "onedrive-refused"):
            self.guard(self.store / replacement.OUTPUT, self.store, existing=False)
        outside = self.folder / "outside.p8"
        outside.write_bytes(b"public outside fixture")
        with self.assertRaisesRegex(replacement.SafeError, "outside-protected-store"):
            self.guard(outside, self.store)
        real = Path.is_symlink
        with patch.object(Path, "is_symlink", new=lambda path: path == source or real(path)):
            with self.assertRaisesRegex(replacement.SafeError, "protected-path-link-refused"):
                self.guard(source, self.store)

    def test_cli_refuses_onedrive_before_reading_any_input_and_never_echoes_raw_errors(self):
        args = ['--team-key', str(self.store / 'private-fixture.p8'), '--key-id', 'PUBLIC1234',
                '--issuer-id', '00000000-0000-0000-0000-000000000001', '--old-profile', str(self.store / 'old'),
                '--approved-certificate', str(self.store / 'certificate')]
        for path in [self.store / 'private-fixture.p8', self.store / 'old', self.store / 'certificate']:
            path.write_bytes(b'PUBLIC_FIXTURE_ONLY')
        output = io.StringIO()
        with patch.dict(os.environ, {'LOCALAPPDATA': str(self.folder)}), patch.object(replacement, 'verify_windows_acl'), \
                patch.object(replacement, 'protected_path', side_effect=self.guard), patch.object(replacement, 'read_bounded') as reader, redirect_stdout(output):
            self.assertEqual(replacement.main(args), 1)
        reader.assert_not_called()
        self.assertEqual(json.loads(output.getvalue()), {'error': 'onedrive-refused'})
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(replacement.main(['--unknown', 'FABRICATED_PRIVATE_KEY_ONLY']), 1)
        self.assertEqual(json.loads(output.getvalue()), {'error': 'invalid-arguments'})

    def test_cli_get_only_plan_never_emits_local_bytes_bearer_or_paths(self):
        paths = [self.store / name for name in ['public-team.p8', 'public-old.mobileprovision', 'public-certificate.cer']]
        for path in paths:
            path.write_bytes(b'FABRICATED_PRIVATE_FIXTURE_ONLY')
        args = ['--team-key', str(paths[0]), '--key-id', 'PUBLIC1234',
                '--issuer-id', '00000000-0000-0000-0000-000000000001', '--old-profile', str(paths[1]),
                '--approved-certificate', str(paths[2])]
        output = io.StringIO()
        real_url = replacement.AppleAPI.url
        with patch.dict(os.environ, {'LOCALAPPDATA': str(self.folder)}), patch.object(replacement, 'verify_windows_acl'), \
                patch.object(replacement, 'local_context', return_value=self.context), \
                patch.object(replacement, 'token_factory', return_value=lambda: 'PUBLIC_BEARER_FIXTURE_ONLY'), \
                patch.object(replacement, 'AppleAPI', return_value=self.api) as api_factory, redirect_stdout(output):
            # Keep the real URL gate used by the business pagination iterator.
            api_factory.url.side_effect = real_url
            self.assertEqual(replacement.main(args), 0)
        self.assertTrue(json.loads(output.getvalue())['planVerified'])
        for private in ['FABRICATED_', 'PUBLIC_BEARER_FIXTURE_ONLY', str(self.store), self.context['name']]:
            self.assertNotIn(private, output.getvalue())
        self.assertEqual(self.api.posts, [])


class NetworkBoundaryTests(unittest.TestCase):
    def test_only_exact_https_apple_read_resources_are_allowed(self):
        for url in ['http://api.appstoreconnect.apple.com/v1/profiles', 'https://evil.invalid/v1/profiles',
                    '//evil.invalid/v1/profiles', replacement.BASE + ':443/v1/profiles',
                    replacement.BASE + '/v1/profiles#fragment', replacement.BASE + '/v1/users']:
            with self.subTest(url=url), self.assertRaises(replacement.SafeError):
                replacement.AppleAPI.url(url)
        self.assertEqual(replacement.AppleAPI.url('/v1/profiles?limit=100'), replacement.BASE + '/v1/profiles?limit=100')
        self.assertIsNone(replacement.NoRedirect().redirect_request(None, None, 302, None, None, 'https://evil.invalid'))

    def test_bounded_response_and_fixed_http403_do_not_disclose_token_or_body(self):
        class Response(io.BytesIO):
            status = 200
            def read(self, count):
                self.count = count
                return super().read(count)
        class Opener:
            def __init__(self, response): self.response = response
            def open(self, request, timeout):
                self.request, self.timeout = request, timeout
                return self.response
        api = replacement.AppleAPI(lambda: 'PUBLIC_JWT_FIXTURE_ONLY')
        response = Response(b'{"data":[]}')
        opener = Opener(response)
        api.opener = opener
        self.assertEqual(api.get('/v1/profiles'), {'data': []})
        self.assertEqual(response.count, replacement.MAX_BYTES + 1)
        self.assertEqual(opener.timeout, 20)
        self.assertEqual(opener.request.get_header('Authorization'), 'Bearer PUBLIC_JWT_FIXTURE_ONLY')
        api.opener = Opener(Response(b'X' * (replacement.MAX_BYTES + 1)))
        with self.assertRaisesRegex(replacement.SafeError, 'apple-response-too-large'):
            api.get('/v1/profiles')
        failure = urllib.error.HTTPError(replacement.BASE + '/v1/profiles', 403, 'FABRICATED_PRIVATE_BODY_ONLY', {}, None)
        with patch.object(api.opener, 'open', side_effect=failure):
            with self.assertRaises(replacement.SafeError) as error:
                api.get('/v1/profiles')
        self.assertEqual(str(error.exception), 'apple-http-403')

    def test_pagination_loop_and_foreign_next_link_fail_closed(self):
        class Loop:
            def __init__(self, link): self.link = link
            def get(self, path): return {'data': [], 'links': {'next': self.link}}
        for link in ['/v1/profiles?limit=100', 'https://evil.invalid/v1/profiles']:
            with self.subTest(link=link), self.assertRaises(replacement.SafeError):
                list(replacement.profiles(Loop(link)))

    def test_network_post_timeout_has_no_automatic_transport_retry(self):
        api = replacement.AppleAPI(lambda: 'PUBLIC_TOKEN_ONLY')
        with patch.object(api.opener, 'open', side_effect=TimeoutError('FABRICATED_PRIVATE_ONLY')) as opened:
            with self.assertRaisesRegex(replacement.SafeError, '^apple-network-error$'):
                api.post({'data': {'type': 'profiles'}})
        self.assertEqual(opened.call_count, 1)

    def test_truncated_http_body_has_only_fixed_network_error_classification(self):
        class Response(io.BytesIO):
            status = 200
            def read(self, count):
                raise http.client.IncompleteRead(b'FABRICATED_PRIVATE_BODY_ONLY', 12)
        api = replacement.AppleAPI(lambda: 'PUBLIC_TOKEN_ONLY')
        with patch.object(api.opener, 'open', return_value=Response()):
            with self.assertRaises(replacement.SafeError) as error:
                api.get('/v1/profiles')
        self.assertEqual(str(error.exception), 'apple-network-error')

    def test_unique_pagination_cannot_silently_exceed_the_bounded_page_limit(self):
        class Pages:
            count = 0
            def get(self, path):
                self.count += 1
                return {'data': [], 'links': {'next': '/v1/profiles?cursor=' + str(self.count)}}
        api = Pages()
        with self.assertRaisesRegex(replacement.SafeError, 'apple-pagination-limit'):
            list(replacement.profiles(api))
        self.assertEqual(api.count, 50)

    def test_jwt_is_short_lived_es256_memory_only_without_generating_a_key(self):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec, utils
        from unittest.mock import Mock
        key = Mock(spec=ec.EllipticCurvePrivateKey)
        key.curve = ec.SECP256R1()
        key.sign.return_value = utils.encode_dss_signature(1, 2)
        public_dummy = b'-----BEGIN PRIVATE KEY-----\nPUBLIC_FIXTURE_ONLY\n-----END PRIVATE KEY-----'
        output = io.StringIO()
        with patch.object(serialization, 'load_pem_private_key', return_value=key), redirect_stdout(output):
            token = replacement.token_factory(public_dummy, 'PUBLIC1234', '00000000-0000-0000-0000-000000000001')()
        header, payload, signature = [base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)) for part in token.split('.')]
        self.assertEqual(json.loads(header), {'alg': 'ES256', 'kid': 'PUBLIC1234', 'typ': 'JWT'})
        claims = json.loads(payload)
        self.assertEqual(claims['aud'], 'appstoreconnect-v1')
        self.assertEqual(claims['exp'] - claims['iat'], 300)
        self.assertEqual(signature, (1).to_bytes(32, 'big') + (2).to_bytes(32, 'big'))
        self.assertEqual(output.getvalue(), '')


class LocalMetadataTests(unittest.TestCase):
    def test_old_cms_uses_existing_metadata_guards_and_exact_approved_certificate(self):
        now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None, microsecond=0)
        certificate = b'public certificate metadata fixture; not a certificate'
        profile = {'Name': 'Public Old Profile', 'UUID': '11111111-1111-1111-1111-111111111111',
                   'TeamIdentifier': [replacement.TEAM], 'ApplicationIdentifierPrefix': [replacement.TEAM],
                   'Platform': ['iOS'], 'CreationDate': now - dt.timedelta(days=1),
                   'ExpirationDate': now + dt.timedelta(days=365), 'DeveloperCertificates': [certificate],
                   'Entitlements': {'application-identifier': replacement.TEAM + '.' + replacement.BUNDLE,
                                    'com.apple.developer.team-identifier': replacement.TEAM,
                                    'get-task-allow': False, 'beta-reports-active': True}}
        response = subprocess.CompletedProcess([], 0, plistlib.dumps(profile), b'PUBLIC_PRIVATE_DIAGNOSTIC_FIXTURE')
        output = io.StringIO()
        with patch.object(replacement.subprocess, 'run', return_value=response) as openssl, redirect_stdout(output):
            context = replacement.local_context(b'public old CMS fixture', certificate)
        self.assertEqual(context['name'], 'Public Old Profile')
        self.assertEqual(context['uuid'], profile['UUID'])
        self.assertEqual(context['certificate'], certificate)
        self.assertEqual(openssl.call_args.kwargs['input'], b'public old CMS fixture')
        self.assertEqual(output.getvalue(), '')
        with patch.object(replacement.subprocess, 'run', return_value=response):
            with self.assertRaisesRegex(replacement.SafeError, 'approved-certificate-mismatch'):
                replacement.local_context(b'public old CMS fixture', b'other public certificate')
        profile['ProvisionedDevices'] = ['PUBLIC_DEVICE_FIXTURE']
        response.stdout = plistlib.dumps(profile)
        with patch.object(replacement.subprocess, 'run', return_value=response):
            with self.assertRaises(ValueError):
                replacement.local_context(b'public old CMS fixture', certificate)


if __name__ == '__main__':
    unittest.main()
