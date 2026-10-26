"""Validate the final Android manifest and aapt hardware filtering, without an SDK."""

from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ANDROID = "{http://schemas.android.com/apk/res/android}"
IDENTITY = "com.dovebevo.app.preview"
INTERNAL = IDENTITY + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
# iongeolocation-android 2.2.2 uses ConnectivityManager.activeNetwork and
# getNetworkCapabilities for provider choice/error handling. This is a normal
# status permission; it does not request background location.
PERMISSIONS = {
    "android.permission.INTERNET",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_NETWORK_STATE",
}
LOCATION_FEATURES = {
    "android.hardware.location",
    "android.hardware.location.gps",
    "android.hardware.location.network",
}


def check_manifest(root: ET.Element, badging: str) -> None:
    if root.tag != "manifest" or root.get("package") != IDENTITY:
        raise ValueError("Unexpected Android preview identity")
    sdk = root.find("uses-sdk")
    if sdk is None or sdk.get(ANDROID + "minSdkVersion") != "24" or sdk.get(ANDROID + "targetSdkVersion") != "36":
        raise ValueError("Unexpected Android min/target SDK")

    permission_nodes = [node for node in root if node.tag.startswith("uses-permission")]
    if any(node.tag != "uses-permission" or ANDROID + "maxSdkVersion" in node.attrib for node in permission_nodes):
        raise ValueError("Unreviewed conditional permission declaration")
    permissions = {node.get(ANDROID + "name") for node in permission_nodes}
    declarations = root.findall("permission")
    if any(node.get(ANDROID + "name") != INTERNAL or node.get(ANDROID + "protectionLevel") != "signature" for node in declarations):
        raise ValueError("Only the app-private signature permission may be declared")
    if INTERNAL in permissions:
        if len(declarations) != 1:
            raise ValueError("Missing app-private signature permission declaration")
        permissions.remove(INTERNAL)
    if permissions != PERMISSIONS:
        raise ValueError("Unreviewed or missing permission: " + ", ".join(sorted(str(name) for name in permissions.symmetric_difference(PERMISSIONS))))

    app = root.find("application")
    if app is None or app.get(ANDROID + "allowBackup") != "false" or app.get(ANDROID + "usesCleartextTraffic") != "false":
        raise ValueError("Unsafe application backup or cleartext setting")

    location_nodes = [node for node in root.findall("uses-feature") if node.get(ANDROID + "name", "").startswith("android.hardware.location")]
    if any(node.get(ANDROID + "required") != "false" for node in location_nodes):
        raise ValueError("Required location hardware is forbidden")
    if not LOCATION_FEATURES.issubset({node.get(ANDROID + "name") for node in location_nodes}):
        raise ValueError("All location hardware must be explicitly optional")
    if re.search(r"(?m)^\s*uses-(?:implied-)?feature:\s+name=['\"]android\.hardware\.location", badging):
        raise ValueError("aapt badging still requires location hardware")


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: mobile-ci-android-check.py MERGED_MANIFEST AAPT_BADGING", file=sys.stderr)
        return 2
    try:
        check_manifest(ET.parse(sys.argv[1]).getroot(), Path(sys.argv[2]).read_text(encoding="utf-8"))
    except (ValueError, OSError, ET.ParseError) as error:
        print("Android manifest refused: " + str(error), file=sys.stderr)
        return 1
    print("Merged manifest: preview identity, min24/target36, foreground location optional, reviewed normal network state, no backup or cleartext")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
