"""Exercise the actual embedded store selector without running Apple tools."""

import ast
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "capture-ipad.sh"
embedded = SCRIPT.read_text().split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
module = ast.parse(embedded)
definitions = ast.Module(body=[node for node in module.body
                              if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef))], type_ignores=[])
scope = {}
exec(compile(definitions, str(SCRIPT), "exec"), scope)
select_device = scope["select_device"]


def device(kind, suffix, *, available=True):
    return {"name": "Actual device", "deviceTypeIdentifier": kind, "isAvailable": available,
            "state": "Shutdown", "udid": f"00000000-0000-4000-8000-{suffix:012d}"}


def inventory():
    types = [{"identifier": key, "name": name, "productFamily": family} for key, name, family in [
        ("ipad13", "iPad Pro 13-inch (M5)", "iPad"), ("ipad11", "iPad Pro 11-inch (M5)", "iPad"),
        ("max", "iPhone 17 Pro Max", "iPhone"), ("plus", "iPhone 16 Plus", "iPhone"),
        ("air", "iPhone Air", "iPhone"), ("phone", "iPhone 17", "iPhone"),
    ]]
    runtimes = [{"identifier": f"com.apple.CoreSimulator.SimRuntime.iOS-26-{minor}",
                 "version": f"26.{minor}", "isAvailable": True} for minor in [2, 5]]
    devices = {runtime["identifier"]: [device("ipad13", minor * 10 + 1), device("max", minor * 10 + 2)]
               for minor, runtime in zip([2, 5], runtimes)}
    return {"devicetypes": types, "runtimes": runtimes, "devices": devices}


class CaptureSelectionTests(unittest.TestCase):
    def test_exact_pin_selects_actual_qualifying_ipad_and_large_phone(self):
        for family, kind in [("ipad", "ipad13"), ("iphone-large", "max")]:
            with self.subTest(family=family):
                version, selected_type, _ = select_device(inventory(), "26.2", family, "26.2")
                self.assertEqual(version, (26, 2))
                self.assertEqual(selected_type["identifier"], kind)
                self.assertEqual(select_device(inventory(), "26.2", family)[0], (26, 5))

    def test_unavailable_missing_or_sdk_mismatched_pin_never_falls_back(self):
        for family in ["ipad", "iphone-large"]:
            for pin in ["26.4", "26.2.0", "18.5"]:
                with self.subTest(family=family, pin=pin), self.assertRaises(ValueError):
                    select_device(inventory(), "26.2", family, pin)
            unavailable = inventory()
            unavailable["runtimes"][0]["isAvailable"] = False
            with self.assertRaises(ValueError):
                select_device(unavailable, "26.2", family, "26.2")
            unavailable = inventory()
            for item in unavailable["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-26-2"]:
                item["isAvailable"] = False
            with self.assertRaises(ValueError):
                select_device(unavailable, "26.2", family, "26.2")

    def test_runtime_pin_is_strict_and_bounded(self):
        for pin in ["", "26.2\n", "026.2", "26.02", "26.2.0.0", "1000.2", "26..2", "26.2-beta",
                    "26/2", "２６.２", "9" * 10000, 26]:
            with self.subTest(pin=str(pin)[:25]), self.assertRaises(ValueError):
                select_device(inventory(), "26.2", "ipad", pin)

    def test_pin_preserves_actual_model_qualification_and_rejects_renamed_devices(self):
        for family, wrong_type, fake_name in [("ipad", "ipad11", "iPad Pro 13-inch"),
                                               ("iphone-large", "phone", "iPhone 17 Pro Max")]:
            values = inventory()
            fake = device(wrong_type, 99)
            fake["name"] = fake_name
            values["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-26-2"] = [fake]
            with self.subTest(family=family), self.assertRaises(ValueError):
                select_device(values, "26.2", family, "26.2")

    def test_large_phone_air_and_plus_remain_valid_actual_types(self):
        for kind in ["air", "plus"]:
            values = inventory()
            values["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-26-2"] = [device(kind, 99)]
            with self.subTest(kind=kind):
                self.assertEqual(select_device(values, "26.2", "iphone-large", "26.2")[1]["identifier"], kind)


if __name__ == "__main__":
    unittest.main()
