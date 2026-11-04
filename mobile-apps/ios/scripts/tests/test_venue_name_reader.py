"""Execute the actual fixed reader against owned DOM doubles, without a browser.

These negative cases exercise the shipped JavaScript, not a reimplementation.
Actual WebKit layout and the production DOM still require the live Mac UI case.
"""

import json
from pathlib import Path
import re
import shutil
import subprocess
import textwrap
import unittest


SOURCE = Path(__file__).resolve().parents[2] / "App/VenueNameReader.swift"
HARNESS = r"""
const vm = require('node:vm');
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const results = input.cases.map((scenario) => {
    const s = Object.assign({
        href: 'https://www.dovebevo.com/bar/n123?c=u0nd9',
        name: 'Caffè Centrale 🍹', selectedKey: 'n123',
        mapCount: 1, sheetCount: 1, paperCount: 1, headingCount: 1,
        headingShape: 'direct',
        bare: true, modal: true, connected: true, hidden: false,
        inert: false, hiddenHeading: false, display: 'block',
        visibility: 'visible', opacity: '1', width: 300, height: 40,
        headingY: 100, dialogY: 20, clientRects: 1
    }, scenario);
    const rect = (y, width, height) => Object.freeze({
        x: 0, y, width, height, left: 0, right: width, top: y, bottom: y + height
    });
    const body = Object.freeze({ parentElement: null, getAttribute: () => null });
    const heading = Object.freeze({
        textContent: s.name, isConnected: s.connected, parentElement: body, getAttribute: () => null,
        closest: () => s.hiddenHeading || s.inert ? body : null,
        getBoundingClientRect: () => rect(s.headingY, s.width, s.height),
        getClientRects: () => Array(s.clientRects).fill(1)
    });
    const matchingHeadingCount = s.headingShape === 'unrelated' ? 0 :
        s.headingShape === 'both' ? 2 * s.headingCount : s.headingCount;
    const paper = Object.freeze({ querySelectorAll: (selector) => {
        if (selector !== ':scope > h2.scontrino__name, :scope > header.mobile-venue__identity > h2.scontrino__name') {
            throw new Error('unexpected paper heading selector');
        }
        return Array(matchingHeadingCount).fill(heading);
    }});
    const dialog = Object.freeze({
        isConnected: s.connected, parentElement: body,
        matches: (selector) => selector === ':modal' ? s.modal : s.bare,
        closest: () => s.hidden || s.inert ? body : null,
        getAttribute: (attribute) => {
            if (attribute !== 'aria-label') throw new Error('unexpected dialog attribute');
            return Object.hasOwn(s, 'ariaLabel') ? s.ariaLabel : s.name;
        },
        getBoundingClientRect: () => rect(s.dialogY, 350, 500),
        getClientRects: () => [1],
        querySelectorAll: (selector) => {
            if (selector === ':scope > .sheet__body > .scontrino > .scontrino__paper') {
                return Array(s.paperCount).fill(paper);
            }
            if (selector === ':scope > .sheet__body > .scontrino > .scontrino__paper > h2.scontrino__name') {
                return s.headingShape === 'direct' ? Array(s.paperCount * s.headingCount).fill(heading) : [];
            }
            if (selector === ':scope > .sheet__body > .scontrino > .scontrino__paper > h2.scontrino__name, :scope > .sheet__body > .scontrino > .scontrino__paper > header.mobile-venue__identity > h2.scontrino__name') {
                return Array(s.paperCount * matchingHeadingCount).fill(heading);
            }
            throw new Error('unexpected dialog selector');
        }
    });
    const map = Object.freeze({ getAttribute: (attribute) => {
        if (attribute !== 'data-selected') throw new Error('unexpected map attribute');
        return s.selectedKey;
    }});
    const document = Object.freeze({ visibilityState: 'visible',
        documentElement: Object.freeze({ getAttribute: () => s.marker === false ? null : '1' }),
        querySelectorAll: (selector) => {
        if (selector === 'section.map[data-selected]') return Array(s.mapCount).fill(map);
        if (selector === 'dialog.sheet[open]') return Array(s.sheetCount).fill(dialog);
        throw new Error('unexpected document selector');
    }});
    // Safari 16 supports iteration, but has no URLSearchParams.size getter.
    class OlderWebKitURL extends URL {
        get searchParams() {
            return new Proxy(super.searchParams, { get(target, key) {
                if (key === 'size') return undefined;
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
            }});
        }
    }
    const context = {
        URL: s.olderWebKit ? OlderWebKitURL : URL,
        location: Object.freeze({ href: s.href }), document,
        innerWidth: 390, innerHeight: 844,
        window: Object.freeze({ innerWidth: 390, innerHeight: 844 }),
        getComputedStyle: (element) => Object.freeze({
            display: element === heading ? s.display : 'block',
            visibility: element === heading ? s.visibility : 'visible',
            opacity: element === heading ? s.opacity : '1'
        })
    };
    try { return { value: vm.runInNewContext(input.script, context, { timeout: 1000 }) }; }
    catch (error) { return { rejected: true }; }
});
process.stdout.write(JSON.stringify(results));
"""


class VenueNameReaderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = shutil.which("node")
        if cls.node is None:
            raise unittest.SkipTest("Node is unavailable; actual-reader owned-DOM checks require its existing runtime")
        source = SOURCE.read_text(encoding="utf-8")
        match = re.search(r'static let script = #"""(.*?)"""#', source, re.DOTALL)
        if match is None:
            raise AssertionError("The bookmark reader must be a fixed raw JavaScript constant")
        cls.script = textwrap.dedent(match.group(1))

    def read(self, cases, script=None):
        result = subprocess.run(
            [self.node, "-e", HARNESS], input=json.dumps({"script": script or self.script, "cases": cases}),
            text=True, encoding="utf-8", capture_output=True, check=True, timeout=15,
        )
        return json.loads(result.stdout)

    def assert_rejected(self, cases):
        for scenario, result in zip(cases, self.read(cases), strict=True):
            self.assertTrue(result.get("rejected") or result.get("value") is None, scenario)

    def test_returns_only_the_actual_public_name_href_and_selected_venue_key(self):
        actual = self.read([{}, {"name": "A"}, {"name": "  Caffè Centrale  "}])
        self.assertEqual(actual[0]["value"], {
            "href": "https://www.dovebevo.com/bar/n123?c=u0nd9", "name": "Caffè Centrale 🍹", "selectedKey": "n123"
        })
        self.assertEqual(actual[1]["value"]["name"], "A")
        self.assertEqual(actual[2]["value"]["name"], "Caffè Centrale")

    def test_actual_both_platform_readers_work_without_url_search_params_size(self):
        java = SOURCE.parents[2] / "android/app/src/main/java/com/dovebevo/app/VenueHeadingReader.java"
        source = java.read_text(encoding="utf-8")
        block = re.search(r'SCRIPT = """(.*?)""";', source, re.DOTALL)
        self.assertIsNotNone(block)
        android = textwrap.dedent(block.group(1)).replace("\\\\", "\\")
        base = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9"
        for script in [self.script, android]:
            with self.subTest(platform="android" if script == android else "ios"):
                for heading_shape in ["direct", "nested"]:
                    actual = self.read([{"olderWebKit": True, "href": base, "headingShape": heading_shape}], script)[0]
                    self.assertIsNotNone(actual.get("value"), (heading_shape, actual))
                for bad in [base + "&c=u0nd8", base + "&token=private", base + "#private"]:
                    self.assertIsNone(self.read([{"olderWebKit": True, "href": bad}], script)[0].get("value"))
                self.assertIsNone(self.read([{"olderWebKit": True, "href": base, "marker": False}], script)[0].get("value"))
                for hh in ["0", "1"]:
                    focused = base + "&drink=beer_draft&hh=" + hh
                    for heading_shape in ["direct", "nested"]:
                        self.assertIsNotNone(self.read([{"olderWebKit": True, "href": focused,
                                                         "headingShape": heading_shape}], script)[0].get("value"))
                for bad_shape in ["unrelated", "both"]:
                    self.assertIsNone(self.read([{"olderWebKit": True, "href": base,
                                                  "headingShape": bad_shape}], script)[0].get("value"))
                for paper_count in [0, 2]:
                    self.assertIsNone(self.read([{"olderWebKit": True, "href": base,
                                                  "headingShape": "nested", "paperCount": paper_count}], script)[0].get("value"))
                for bad in ["&drink=beer_draft", "&hh=1", "&drink=unknown&hh=0", "&drink=spritz&hh=2",
                            "&drink=spritz&hh=0&hh=1", "&drink=spritz&drink=water&hh=0",
                            "&%64rink=spritz&hh=0", "&drink=spritz&hh=0&token=private", "&drink=spritz&hh=0#private"]:
                    self.assertIsNone(self.read([{"olderWebKit": True, "href": base + bad}], script)[0].get("value"))
                # Demonstrate the compatibility counterexample using the actual reader.
                broken = (script.replace("pairs.length", "url.searchParams.size")
                          .replace("[...url.searchParams].length", "url.searchParams.size")
                          .replace("[...route.searchParams].length", "route.searchParams.size"))
                self.assertTrue(broken != script, "Compatibility mutation must actually change both real readers")
                self.assertIsNone(self.read([{"olderWebKit": True, "href": base}], broken)[0].get("value"))

    def test_precommit_old_heading_cannot_be_saved_for_the_new_url(self):
        self.assert_rejected([
            {"href": "https://www.dovebevo.com/bar/w456?c=u0nd8", "selectedKey": "n123", "name": "Vecchio locale"},
            {"selectedKey": "w456"}, {"mapCount": 0}, {"mapCount": 2},
            {"href": "https://www.dovebevo.com/"}, {"href": "https://evil.example/bar/n123?c=u0nd9"},
            {"href": "https://www.dovebevo.com/bar/n123?c=u0nd9&token=private"},
        ])

    def test_loading_duplicate_hidden_inert_and_overlaid_sheets_reject(self):
        self.assert_rejected([
            {"bare": False}, {"modal": False}, {"sheetCount": 0}, {"sheetCount": 2},
            {"paperCount": 0}, {"paperCount": 2}, {"headingCount": 0}, {"headingCount": 2},
            {"hidden": True}, {"hiddenHeading": True},
            {"inert": True}, {"connected": False}, {"display": "none"}, {"visibility": "hidden"},
            {"opacity": "0"}, {"width": 0}, {"height": 0}, {"clientRects": 0}, {"dialogY": -1000},
        ])

    def test_focused_saved_drink_accepts_current_italian_header_without_weaker_identity(self):
        focused = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=beer_draft&hh=0"
        value = self.read([{"href": focused, "headingShape": "nested"}])[0]["value"]
        self.assertEqual(value, {"href": focused, "name": "Caffè Centrale 🍹", "selectedKey": "n123"})
        self.assert_rejected([
            {"href": focused, "headingShape": "nested", "selectedKey": "w456"},
            {"href": focused, "headingShape": "nested", "headingCount": 2},
            {"href": focused, "headingShape": "nested", "paperCount": 2},
        ])

    def test_scrolled_heading_is_accepted_without_a_viewport_intersection_requirement(self):
        value = self.read([{"headingY": -600}])[0]["value"]
        self.assertEqual(value["name"], "Caffè Centrale 🍹")

    def test_name_must_equal_the_dialog_label_and_be_nonempty_bounded_well_formed_text(self):
        self.assert_rejected([
            {"ariaLabel": "Altro locale"}, {"name": ""}, {"name": "  "}, {"name": "a" * 121},
            {"name": "🍹" * 61}, {"name": "Bar\nNuovo"}, {"name": "Bar\tNuovo"},
            {"name": "Bar\x00"}, {"name": "Bar\x85"}, {"name": "Bar\ufffd"},
            {"name": "Bar\ud800"}, {"name": "Bar\udc00"}, {"name": "Bar\ud800x"},
        ])
        for result in self.read([{"name": "a" * 120}, {"name": "🍹" * 60}]):
            self.assertIsNotNone(result["value"])


if __name__ == "__main__":
    unittest.main()
