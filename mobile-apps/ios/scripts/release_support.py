#!/usr/bin/env python3
"""Local validation for release-ios.sh. No network or third-party modules."""

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid

TEAM = "9T359CV674"
BUNDLE = "com.dovebevo.app"
MAX_IMPORT_DIAGNOSTIC_BYTES = 16 * 1024
# Exact English messages/statuses from Apple's public Security/base/SecBase.h.
# These classify a reported API error, never its underlying cause or CLI exit.
# https://github.com/apple-oss-distributions/Security/blob/main/base/SecBase.h
# https://github.com/apple-oss-distributions/SecurityTool/blob/main/keychain_import.c
IMPORT_FAILURE_MESSAGES = {
    "MAC verification failed during PKCS12 import (wrong password?)": ("pkcs12-verification-failed", -25264),
    "Unable to decode the provided data.": ("data-decode-failed", -26275),
    "Unknown format in import.": ("import-format-unknown", -25257),
    "Import/Export format unsupported.": ("import-format-unsupported", -25256),
    "User interaction is not allowed.": ("interaction-not-allowed", -25308),
    "The user name or passphrase you entered is not correct.": ("authentication-failed", -25293),
    "The specified keychain could not be found.": ("keychain-not-found", -25294),
    "The specified keychain is not a valid keychain file.": ("invalid-keychain", -25295),
    "The specified item already exists in the keychain.": ("duplicate-item", -25299),
}


class ReleaseValidationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ReleaseValidationError(message)


def classify_import_failure(raw):
    if len(raw) > MAX_IMPORT_DIAGNOSTIC_BYTES:
        return {"classification": "diagnostic-too-large"}
    prefix = "security: SecKeychainItemImport: "
    matches = {IMPORT_FAILURE_MESSAGES[line[len(prefix):]]
               for line in raw.decode("utf-8", "replace").splitlines()
               if line.startswith(prefix) and line[len(prefix):] in IMPORT_FAILURE_MESSAGES}
    if len(matches) != 1:
        return {"classification": "unclassified-import-failure"}
    classification, status = matches.pop()
    return {"classification": classification, "osStatus": status}


def import_failure_summary(path):
    try:
        with Path(path).open("rb") as stream:
            return classify_import_failure(stream.read(MAX_IMPORT_DIAGNOSTIC_BYTES + 1))
    except OSError:
        return {"classification": "diagnostic-unavailable"}


def validated_profile(profile, now=None):
    """Validate metadata; Apple security/codesign separately verify signatures."""
    now = now or dt.datetime.now(dt.timezone.utc)
    require(isinstance(profile, dict), "Provisioning profile is not a dictionary")
    value = profile.get("UUID", "")
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", value), "Invalid profile UUID")
    require(str(uuid.UUID(value)).upper() == value.upper(), "Invalid profile UUID")
    require(profile.get("TeamIdentifier") == [TEAM], "Provisioning profile belongs to another team")
    require(profile.get("ApplicationIdentifierPrefix") == [TEAM], "Unexpected App ID prefix")
    require("iOS" in profile.get("Platform", []), "Provisioning profile is not for iOS")
    entitlements = profile.get("Entitlements", {})
    require(isinstance(entitlements, dict), "Invalid profile entitlements")
    require(entitlements.get("application-identifier") == f"{TEAM}.{BUNDLE}", "Profile App ID does not match Dove bevo")
    require(entitlements.get("com.apple.developer.team-identifier") == TEAM, "Profile entitlement team mismatch")
    require(entitlements.get("get-task-allow") is False, "Development/debug provisioning is forbidden")
    require(entitlements.get("beta-reports-active") is True, "Profile is not an App Store Connect distribution profile")
    require("ProvisionedDevices" not in profile, "Device/ad hoc provisioning is forbidden")
    require(profile.get("ProvisionsAllDevices", False) is False, "Enterprise provisioning is forbidden")
    expiration = profile.get("ExpirationDate")
    require(isinstance(expiration, dt.datetime), "Profile expiration is missing")
    expiration = expiration.replace(tzinfo=dt.timezone.utc) if expiration.tzinfo is None else expiration
    require(expiration > now, "Provisioning profile has expired")
    certificates = profile.get("DeveloperCertificates")
    require(isinstance(certificates, list) and len(certificates) == 1, "App Store profile must name one distribution certificate")
    require(isinstance(certificates[0], bytes) and bool(certificates[0]), "Distribution certificate is missing")
    return {
        "uuid": value,
        "team": TEAM,
        "bundle": BUNDLE,
        "expiresAt": expiration.isoformat(),
        "certificateSHA1": hashlib.sha1(certificates[0]).hexdigest().upper(),
    }


def private_base(base, checkout):
    base, checkout = Path(base).resolve(strict=True), Path(checkout).resolve(strict=True)
    require(base.is_dir(), "RUNNER_TEMP must be an existing directory")
    require(not base.is_relative_to(checkout), "RUNNER_TEMP must be outside the checkout")
    require(not any(part.casefold().startswith("onedrive") for part in base.parts), "Signing material cannot be stored in OneDrive")
    require(base != Path(base.anchor), "RUNNER_TEMP cannot be a filesystem root")
    return base


def private_write(path, data):
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)


def decode_secrets(directory, upload):
    # Read credentials only at execution time and never include their values in
    # diagnostics, command lines, source, manifests or project artifacts.
    require(bool(os.environ.get("DOVEBEVO_SIGNING_PASSWORD")), "Signing password is required")
    for name, filename in [
        ("DOVEBEVO_IOS_CERTIFICATE_BASE64", "distribution.p12"),
        ("DOVEBEVO_IOS_PROFILE_BASE64", "distribution.mobileprovision"),
    ]:
        encoded = os.environ.get(name, "")
        require(bool(encoded), f"{name} is required")
        try:
            data = base64.b64decode("".join(encoded.split()), validate=True)
        except (ValueError, TypeError):
            raise ReleaseValidationError(f"{name} is not valid base64") from None
        require(bool(data), f"{name} is empty")
        private_write(directory / filename, data)
    if upload:
        key_id = os.environ.get("DOVEBEVO_ASC_KEY_ID", "")
        issuer = os.environ.get("DOVEBEVO_ASC_ISSUER_ID", "")
        require(re.fullmatch(r"[A-Z0-9]{10}", key_id), "Invalid App Store Connect key ID")
        require(re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", issuer), "Invalid App Store Connect issuer ID")
        key = os.environ.get("DOVEBEVO_ASC_PRIVATE_KEY", "").strip()
        require(key.startswith("-----BEGIN PRIVATE KEY-----\n") and key.endswith("-----END PRIVATE KEY-----"), "App Store Connect key must be a PKCS8 PEM private key")
        keys = directory / "private_keys"
        keys.mkdir(mode=0o700)
        private_write(keys / f"AuthKey_{key_id}.p8", (key + "\n").encode("utf-8"))


def select_identity(metadata, identities):
    matches = []
    for fingerprint, name in re.findall(r'^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"([^"]+)"', identities, re.MULTILINE):
        if (fingerprint.upper() == metadata["certificateSHA1"]
                and name.startswith("Apple Distribution:") and name.endswith(f"({TEAM})")):
            matches.append(fingerprint.upper())
    require(len(matches) == 1, "No unique, valid Apple Distribution identity matches the profile")
    return matches[0]


def export_options(metadata, identity, internal_only=False):
    options = {
        "method": "app-store-connect",
        "destination": "export",
        "teamID": TEAM,
        "signingStyle": "manual",
        "signingCertificate": identity,
        "provisioningProfiles": {BUNDLE: metadata["uuid"]},
        "manageAppVersionAndBuildNumber": False,
        "stripSwiftSymbols": True,
        "uploadSymbols": True,
    }
    if internal_only:
        options["testFlightInternalTestingOnly"] = True
    return options


def profile_roots():
    # Xcode 16+ still loads the previous OS location. These are the only two
    # destinations; there is no environment or caller-supplied path override.
    return [Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles",
            Path.home() / "Library/MobileDevice/Provisioning Profiles"]


def validate_profile_storage(root, checkout):
    require(not root.resolve().is_relative_to(Path(checkout).resolve()), "OS provisioning storage cannot be inside the checkout")
    require(not any(part.casefold().startswith("onedrive") for part in root.resolve().parts), "Provisioning profiles cannot be installed in OneDrive")


def reject_profile_symlinks(path):
    require(not any(part.is_symlink() for part in [path, *path.parents]), "Provisioning profile path cannot contain a symlink")


def descriptor_sha256(descriptor):
    os.lseek(descriptor, 0, os.SEEK_SET)
    digest = hashlib.sha256()
    while block := os.read(descriptor, 64 * 1024):
        digest.update(block)
    return digest.hexdigest()


def save_profile_journal(directory, profiles):
    descriptor, name = tempfile.mkstemp(prefix="installed-profile-", suffix=".tmp", dir=directory)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump({"version": 2, "profiles": profiles}, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, directory / "installed-profile.json")
    finally:
        temporary.unlink(missing_ok=True)


def cleanup_profile_records(profiles):
    changed = False
    for state in profiles:
        if not state["created"]:
            continue
        target = Path(state["path"])
        try:
            require(target.parent in profile_roots(), "Installed profile path is not an approved OS location")
            reject_profile_symlinks(target)
            descriptor = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            try:
                current = os.fstat(descriptor)
                require(stat.S_ISREG(current.st_mode) and current.st_ino == state["inode"] and current.st_dev == state["device"], "Installed profile changed; preserving replacement")
                require(descriptor_sha256(descriptor) == state["sha256"], "Installed profile changed; preserving replacement")
            finally:
                os.close(descriptor)
            latest = target.lstat()
            require(latest.st_ino == current.st_ino and latest.st_dev == current.st_dev and stat.S_ISREG(latest.st_mode), "Installed profile changed; preserving replacement")
            reject_profile_symlinks(target)
            target.unlink()
        except FileNotFoundError:
            continue
        except (OSError, ReleaseValidationError):
            # A replacement at one location must not prevent cleanup of the
            # unchanged files owned at the other location.
            changed = True
    require(not changed, "Installed profile changed or cleanup failed; preserving replacement")


def install_profile(directory, metadata, checkout):
    value = metadata.get("uuid", "")
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", value), "Invalid profile UUID")
    data = (directory / "distribution.mobileprovision").read_bytes()
    targets = []
    for root in profile_roots():
        validate_profile_storage(root, checkout)
        target = root / (value + ".mobileprovision")
        reject_profile_symlinks(target)
        if target.exists():
            require(target.is_file() and target.read_bytes() == data, "Existing profile UUID collides with another file; preserving it")
        else:
            targets.append(target)
    # Preflight both locations before creating either file. Identical existing
    # profiles are never owned by this task, and are never added to the journal.
    profiles = []
    save_profile_journal(directory, profiles)
    try:
        for target in targets:
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            reject_profile_symlinks(target)
            descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
            try:
                current = os.fstat(descriptor)
                state = {"created": True, "path": str(target), "inode": current.st_ino, "device": current.st_dev,
                         "sha256": hashlib.sha256(b"").hexdigest()}
                profiles.append(state)
                # Persist ownership of the empty inode before its first write.
                save_profile_journal(directory, profiles)
                try:
                    offset = 0
                    while offset < len(data):
                        count = os.write(descriptor, data[offset:])
                        require(count > 0, "Provisioning profile write did not progress")
                        offset += count
                finally:
                    # Also journal a short/failed write from the owned descriptor,
                    # so exception cleanup can identify only those actual bytes.
                    state["sha256"] = descriptor_sha256(descriptor)
                    save_profile_journal(directory, profiles)
            finally:
                os.close(descriptor)
    except BaseException:
        cleanup_profile_records(profiles)
        raise


def cleanup_profile(directory):
    state_path = directory / "installed-profile.json"
    if not state_path.exists():
        return
    state = json.loads(state_path.read_text(encoding="utf-8"))
    # Retain cleanup compatibility with the original single-profile journal.
    profiles = state["profiles"] if state.get("version") == 2 else [state]
    cleanup_profile_records(profiles)


def verify_app(app, entitlements, codesign_details, metadata, build, embedded_profile):
    info = plistlib.loads((app / "Info.plist").read_bytes())
    require(info.get("CFBundleIdentifier") == BUNDLE, "Exported bundle identifier mismatch")
    require(str(info.get("CFBundleVersion")) == build, "Exported build number mismatch")
    require(info.get("CFBundleSupportedPlatforms") == ["iPhoneOS"], "Export is not an iOS device app")
    require(entitlements.get("application-identifier") == f"{TEAM}.{BUNDLE}", "Exported App ID entitlement mismatch")
    require(entitlements.get("com.apple.developer.team-identifier") == TEAM, "Exported team entitlement mismatch")
    require(entitlements.get("get-task-allow", False) is False, "Exported app permits debugging")
    require(f"TeamIdentifier={TEAM}" in codesign_details.splitlines(), "Code signature team mismatch")
    require(f"Identifier={BUNDLE}" in codesign_details.splitlines(), "Code signature identifier mismatch")
    embedded = validated_profile(embedded_profile)
    require(embedded == metadata, "Exported provisioning profile differs from validated input")
    return info


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("operation", choices=["private-dir", "decode", "profile", "identity", "options", "install", "cleanup-profile", "keychain-list", "verify", "manifest", "upload-attempt", "upload-receipt", "cleanup-private", "import-failure"])
    parser.add_argument("args", nargs="*")
    parser.add_argument("--internal-only", action="count", default=0)
    parsed = parser.parse_args()
    operation, args = parsed.operation, parsed.args
    if parsed.internal_only > 1 or (parsed.internal_only and operation not in ("options", "manifest")):
        parser.error("--internal-only is allowed once for options or manifest")
    if operation == "private-dir":
        print(tempfile.mkdtemp(prefix="dovebevo-signing-", dir=private_base(args[0], args[1])))
    elif operation == "decode":
        decode_secrets(Path(args[0]), len(args) > 1 and args[1] == "upload")
    elif operation == "import-failure":
        print(json.dumps(import_failure_summary(Path(args[0])), sort_keys=True))
    elif operation == "profile":
        metadata = validated_profile(plistlib.loads(Path(args[0]).read_bytes()))
        Path(args[1]).write_text(json.dumps(metadata), encoding="utf-8")
    elif operation == "identity":
        print(select_identity(json.loads(Path(args[0]).read_text()), Path(args[1]).read_text()))
    elif operation == "options":
        Path(args[2]).write_bytes(plistlib.dumps(export_options(json.loads(Path(args[0]).read_text()), args[1],
                                                             internal_only=bool(parsed.internal_only))))
    elif operation == "install":
        install_profile(Path(args[0]), json.loads(Path(args[1]).read_text()), args[2])
    elif operation == "cleanup-profile":
        cleanup_profile(Path(args[0]))
    elif operation == "keychain-list":
        old = shlex.split(Path(args[0]).read_text())
        subprocess.run(["security", "list-keychains", "-d", "user", "-s"] + args[1:] + old, check=True)
    elif operation == "verify":
        directory = Path(args[0])
        metadata = json.loads((directory / "profile.json").read_text())
        verify_app(directory / "ipa/Payload/DoveBevo.app", plistlib.loads((directory / "entitlements.plist").read_bytes()), (directory / "codesign-details.txt").read_text(), metadata, args[1], plistlib.loads((directory / "embedded-profile.plist").read_bytes()))
        require(hashlib.sha1((directory / "signature-cert-0").read_bytes()).hexdigest().upper() == metadata["certificateSHA1"], "Exported signature uses a different certificate")
    elif operation == "manifest":
        ipa, output, metadata_path, build, commit = args
        metadata = json.loads(Path(metadata_path).read_text())
        manifest = {"bundleIdentifier": BUNDLE, "teamIdentifier": TEAM, "buildNumber": build, "sourceCommit": commit, "ipaSHA256": hashlib.sha256(Path(ipa).read_bytes()).hexdigest(), "profileUUID": metadata["uuid"], "profileExpiresAt": metadata["expiresAt"], "signingCertificateSHA1": metadata["certificateSHA1"], "signaturesVerified": True, "uploadRequested": False}
        manifest["distributionScope"] = "internal-only" if parsed.internal_only else "app-store"
        Path(output).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    elif operation in ("upload-attempt", "upload-receipt"):
        path = Path(args[0])
        manifest = json.loads(path.read_text())
        manifest.update(uploadRequested=True, uploadCommandSucceeded=True if operation == "upload-receipt" else None, appStoreProcessingVerified=False)
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    elif operation == "cleanup-private":
        directory, base = Path(args[0]), private_base(args[1], args[2])
        resolved = directory.resolve(strict=True)
        require(resolved.parent == base and resolved.name.startswith("dovebevo-signing-"), "Refusing cleanup outside the owned signing directory")
        require(not directory.is_symlink(), "Refusing symlink cleanup")
        shutil.rmtree(resolved)


if __name__ == "__main__":
    try:
        main()
    except ReleaseValidationError as error:
        print(f"iOS release validation failed: {error}", file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, IndexError, OSError, plistlib.InvalidFileException, subprocess.CalledProcessError) as error:
        # Deliberately omit raw exception text: decoder/parser errors can quote
        # credential input. The operation and a fixed failure are sufficient.
        print("iOS release validation failed; check signing inputs and release prerequisites", file=sys.stderr)
        sys.exit(1)
