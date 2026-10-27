import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("select_simulator", Path(__file__).resolve().parents[1] / "select_simulator.py")
selector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(selector)


def phone(name, identifier, state="Shutdown", available=True):
    return {"name": name, "udid": identifier, "state": state, "isAvailable": available}


class SimulatorSelectionTests(unittest.TestCase):
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
