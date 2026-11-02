import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

SPEC = importlib.util.spec_from_file_location("select_simulator", Path(__file__).resolve().parents[1] / "select_simulator.py")
selector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(selector)


def phone(name, identifier, state="Shutdown", available=True):
    return {"name": name, "udid": identifier, "state": state, "isAvailable": available}


class SimulatorSelectionTests(unittest.TestCase):
    def model_inventory(self):
        renamed = phone("iPhone 17", "wrong-type", "Booted")
        renamed["deviceTypeIdentifier"] = "type16e"
        actual = phone("CI phone", "actual17")
        actual["deviceTypeIdentifier"] = "type17"
        return {"devicetypes": [
            {"identifier": "type17", "name": "iPhone 17", "productFamily": "iPhone"},
            {"identifier": "type16e", "name": "iPhone 16e", "productFamily": "iPhone"},
        ], "devices": {"com.apple.CoreSimulator.SimRuntime.iOS-26-2": [renamed, actual]}}

    def test_model_pin_uses_actual_type_and_preserves_no_model_selection(self):
        inventory = self.model_inventory()
        self.assertEqual(selector.select_simulator(inventory, "26.2", runtime_version="26.2", device_model="iPhone 17")[1]["udid"], "actual17")
        self.assertEqual(selector.select_simulator(inventory, "26.2")[1]["udid"], "wrong-type")

    def test_renamed_or_unavailable_other_type_cannot_satisfy_model(self):
        inventory = self.model_inventory()
        inventory['devices']['com.apple.CoreSimulator.SimRuntime.iOS-26-2'][1]['isAvailable'] = False
        with self.assertRaises(ValueError):
            selector.select_simulator(inventory, "26.2", device_model="iPhone 17")
        inventory['devices']['com.apple.CoreSimulator.SimRuntime.iOS-26-2'].pop()
        with self.assertRaises(ValueError):
            selector.select_simulator(inventory, "26.2", device_model="iPhone 17")

    def test_requested_id_must_match_model_and_runtime(self):
        inventory = self.model_inventory()
        self.assertEqual(selector.select_simulator(inventory, "26.2", "actual17", "26.2", "iPhone 17")[1]["udid"], "actual17")
        with self.assertRaises(ValueError):
            selector.select_simulator(inventory, "26.2", "wrong-type", "26.2", "iPhone 17")

    def test_missing_ambiguous_or_wrong_family_model_type_fails(self):
        cases = [[], [{"identifier": "type17", "name": "iPhone 17", "productFamily": "iPad"}],
                 [{"name": "iPhone 17", "productFamily": "iPhone"}],
                 [{"identifier": 17, "name": "iPhone 17", "productFamily": "iPhone"}],
                 [{"identifier": "type17", "name": "iPhone 17", "productFamily": "iPhone"},
                  {"identifier": "other", "name": "iPhone 17", "productFamily": "iPhone"}],
                 [{"identifier": "type17", "name": "iPhone 17", "productFamily": "iPhone"},
                  {"identifier": "type17", "name": "iPhone 16e", "productFamily": "iPhone"}]]
        for types in cases:
            inventory = self.model_inventory()
            inventory['devicetypes'] = types
            with self.subTest(types=types), self.assertRaises(ValueError):
                selector.select_simulator(inventory, "26.2", device_model="iPhone 17")

    def test_model_name_is_exact_plain_and_bounded(self):
        for model in ["", "iPhone 17\n", " iPhone 17", "iPhone 17 ", "iPhone 17; echo", "iPhone $(id)",
                      "iPhone 17/../../", "iphone 17", "iPhone １７", "iPhone " + "x" * 1000, 17]:
            with self.subTest(model=str(model)[:25]), self.assertRaises(ValueError):
                selector.select_simulator(self.model_inventory(), "26.2", device_model=model)

    def test_actual_cli_resolves_model_and_prints_inventory_type(self):
        result = subprocess.run([sys.executable, '-B', str(Path(selector.__file__)), '--sdk-version', '26.2',
                                 '--runtime-version', '26.2', '--device-model', 'iPhone 17'],
                                input=json.dumps(self.model_inventory()), capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'actual17')
        self.assertIn('actual model iPhone 17', result.stderr)

    def mixed_inventory(self):
        return {"devices": {
            "com.apple.CoreSimulator.SimRuntime.iOS-26-2": [phone("iPhone 17", "pinned")],
            "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [phone("iPhone 17", "newer", "Booted")],
        }}

    def test_exact_runtime_pin_wins_over_newer_booted_same_major(self):
        self.assertEqual(selector.select_simulator(self.mixed_inventory(), "26.2", runtime_version="26.2")[1]["udid"], "pinned")
        self.assertEqual(selector.select_simulator(self.mixed_inventory(), "26.2")[1]["udid"], "newer")

    def test_requested_id_must_match_exact_pin(self):
        self.assertEqual(selector.select_simulator(self.mixed_inventory(), "26.2", "pinned", "26.2")[1]["udid"], "pinned")
        with self.assertRaises(ValueError):
            selector.select_simulator(self.mixed_inventory(), "26.2", "newer", "26.2")

    def test_unavailable_or_different_sdk_major_pin_fails_without_fallback(self):
        for pin in ["26.4", "26.2.0", "18.5"]:
            with self.subTest(pin=pin), self.assertRaises(ValueError):
                selector.select_simulator(self.mixed_inventory(), "26.2", runtime_version=pin)
        inventory = self.mixed_inventory()
        inventory['devices']['com.apple.CoreSimulator.SimRuntime.iOS-26-2'][0]['isAvailable'] = False
        with self.assertRaises(ValueError):
            selector.select_simulator(inventory, "26.2", runtime_version="26.2")

    def test_runtime_pin_is_strict_and_bounded(self):
        for pin in ["", "26.2\n", " 26.2", "26.2 ", "026.2", "26.02", "26.2.0.0", "1000.2",
                    "26..2", "26.2-beta", "26/2", "26;2", "２６.２", "9" * 10000, 26]:
            with self.subTest(pin=str(pin)[:25]), self.assertRaises(ValueError):
                selector.select_simulator(self.mixed_inventory(), "26.2", runtime_version=pin)

    def test_old_booted_runtime_cannot_override_newest_matching_sdk_runtime(self):
        inventory = {"devices": {
            "com.apple.CoreSimulator.SimRuntime.iOS-18-5": [phone("iPhone 16 Pro", "old", "Booted")],
            "com.apple.CoreSimulator.SimRuntime.iOS-26-1": [phone("iPhone 17", "older")],
            "com.apple.CoreSimulator.SimRuntime.iOS-26-2": [phone("iPhone 17", "newest")],
        }}
        version, device = selector.select_simulator(inventory, "26.2")
        self.assertEqual(version, (26, 2))
        self.assertEqual(device["udid"], "newest")

    def test_no_matching_sdk_runtime_fails_instead_of_silently_using_stale_os(self):
        inventory = {"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-18-5": [phone("iPhone 16 Pro", "old")]}}
        with self.assertRaises(ValueError):
            selector.select_simulator(inventory, "26.2")

    def test_explicit_older_runtime_override_remains_available_for_compatibility_tests(self):
        inventory = {"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-18-5": [phone("iPhone 16 Pro", "explicit")]}}
        self.assertEqual(selector.select_simulator(inventory, "26.2", "explicit")[1]["udid"], "explicit")

    def test_unavailable_devices_and_ipads_are_not_selected(self):
        inventory = {"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-26-2": [
            phone("iPhone 17", "unavailable", available=False), phone("iPad Pro", "ipad"), phone("iPhone 17 Pro", "available"),
        ]}}
        self.assertEqual(selector.select_simulator(inventory, "26.2")[1]["udid"], "available")


if __name__ == "__main__":
    unittest.main()
