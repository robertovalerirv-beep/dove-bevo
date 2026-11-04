"""Execute the shipped isolated read against owned DOM doubles, without networking.

Real WebKit geometry and Swift value validation are separate hosted Mac cases.
"""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import unittest


IOS = Path(__file__).resolve().parents[2]
HARNESS = r"""
const vm = require('node:vm');
const {URL} = require('node:url');
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const results = input.cases.map((scenario) => {
  const s = Object.assign({href:'https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9',name:'Actual venue',selected:'n123',marker:true,paperCount:1,headingCount:1,priceCount:1,hidden:false,priceY:100,modal:true,dialogCount:1,priceKey:'n123',priceName:'Actual venue',version:'1',provenance:'Da menu online · Fonte verificata il 2026-11-02'},scenario);
  const rect=(y)=>({x:0,y,left:0,top:y,right:300,bottom:y+100,width:300,height:100});
  const body={parentElement:null,getAttribute:()=>null,closest:()=>null};
  const heading={parentElement:body,isConnected:true,textContent:s.name,closest:()=>null,getBoundingClientRect:()=>rect(20),getClientRects:()=>[1]};
  const paper={querySelectorAll:(selector)=>{
    if(selector===':scope > h2.scontrino__name, :scope > header.mobile-venue__identity > h2.scontrino__name')return Array(s.headingCount).fill(heading);
    throw new Error('unexpected paper selector');
  }};
  let dialog;
  const attributes={'data-dovebevo-share':'1','data-version':s.version,'data-venue':s.priceKey,'data-venue-name':s.priceName,'data-drink':'spritz','data-drink-name':'Spritz','data-hh':'1','data-amount-minor':'650','data-currency':'GBP','data-serving':'Drink singolo','data-provenance':s.provenance,'data-confirmations':'0','data-tier':'affare','data-location':'London'};
  const price={parentElement:body,isConnected:true,closest:()=>s.hidden?body:null,getAttribute:(key)=>attributes[key]??null,getBoundingClientRect:()=>rect(s.priceY),getClientRects:()=>[1]};
  dialog={parentElement:body,isConnected:true,closest:()=>null,matches:(selector)=>selector===':modal'?s.modal:true,getAttribute:()=>s.name,getBoundingClientRect:()=>rect(0),getClientRects:()=>[1],querySelectorAll:(selector)=>{
    if(selector===':scope > .sheet__body > .scontrino > .scontrino__paper')return Array(s.paperCount).fill(paper);
    if(selector==="[data-dovebevo-share='1']")return Array(s.priceCount).fill(price);
    throw new Error('unexpected modal selector');
  }};
  const map={getAttribute:()=>s.selected};
  const document={documentElement:{getAttribute:()=>s.marker?'1':null},querySelectorAll:(selector)=>{
    if(selector==='section.map[data-selected]')return[map];
    if(selector==='dialog.sheet[open]')return[dialog];
    if(selector==='dialog[open]')return Array(s.dialogCount).fill(dialog);
    throw new Error('unexpected document selector');
  },querySelector:(selector)=>{
    if(selector==='dialog.sheet.sheet--bare[open]')return dialog;
    throw new Error('unexpected single selector');
  }};
  const window={innerWidth:390,innerHeight:700};window.top=s.iframe?{}:window;
  const style=()=>({display:'block',visibility:'visible',opacity:'1'});
  return vm.runInNewContext(input.script,{URL,document,window,location:{href:s.href},getComputedStyle:style},{timeout:500});
});
process.stdout.write(JSON.stringify(results));
"""


class PriceShareReaderTests(unittest.TestCase):
    def run_reader(self, cases):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node is required to execute the real reader")
        pattern = r'static let script = #"""(.*?)"""#'
        venue = re.search(pattern, (IOS / "App/VenueNameReader.swift").read_text(encoding="utf-8"), re.S).group(1)
        share = re.search(pattern, (IOS / "App/PriceShareSnapshot.swift").read_text(encoding="utf-8"), re.S).group(1)
        share = share.replace(r"\#(VenueNameReader.script)", venue)
        result = subprocess.run([node, "-e", HARNESS], input=json.dumps({"script": share, "cases": cases}),
                                capture_output=True, text=True, timeout=10, check=True)
        return json.loads(result.stdout)

    def test_actual_read_returns_only_exact_visible_price_contract(self):
        value, = self.run_reader([{}])
        self.assertEqual(value["venue"], "n123")
        self.assertEqual(value["venueName"], "Actual venue")
        self.assertEqual(value["amountMinor"], "650")
        self.assertEqual(value["currency"], "GBP")
        self.assertEqual(value["confirmations"], "0")
        self.assertEqual(len(value), 14)
        self.assertNotIn("paidOn", value)

    def test_wrong_page_key_name_hidden_duplicate_offscreen_and_frame_are_rejected(self):
        scenarios = [{"href":"https://evil.invalid/mobile/?path=%2Fbar%2Fn123&c=u0nd9"},
                     {"href":"https://www.dovebevo.com/bar/n123?c=u0nd9"},
                     {"marker":False}, {"selected":"n124"}, {"priceKey":"n124"}, {"priceName":"Wrong venue"},
                     {"hidden":True}, {"paperCount":0}, {"paperCount":2}, {"headingCount":0},
                     {"headingCount":2}, {"priceCount":0}, {"priceCount":2}, {"priceY":800},
                     {"modal":False}, {"dialogCount":2}, {"iframe":True}, {"provenance":"a" * 1025}]
        self.assertEqual(self.run_reader(scenarios), [None] * len(scenarios))

    def test_new_native_alerts_retire_pending_share_and_information_keeps_navigation_fence(self):
        browser = (IOS / "App/BrowserViewController.swift").read_text(encoding="utf-8")
        for name in ["showLocationHelp()", "showAlert(title: String, message: String)"]:
            entry = browser.split("private func " + name, 1)[1].split("\n    private func", 1)[0]
            self.assertIn("invalidateShareCapture()", entry, name)
            self.assertLess(entry.index("invalidateShareCapture()"), entry.index("present(alert"))
        disappearing = browser.split("override func viewWillDisappear", 1)[1].split("override func viewDidAppear", 1)[0]
        self.assertIn("invalidateBookmarkCapture()", disappearing)
        invalidate = browser.split("private func invalidateBookmarkCapture()", 1)[1].split("private func showBookmarkError", 1)[0]
        self.assertIn("invalidateShareCapture()", invalidate)
        available = browser.split("private var canSharePage:", 1)[1].split("func refreshNavigationControls", 1)[0]
        self.assertIn("navigationController?.topViewController === self", available)
        information = browser.split("private func showInformation()", 1)[1].split("private func showPrivacy()", 1)[0]
        self.assertIn("pushViewController(information", information)

    def test_owned_webkit_fixture_is_mounted_before_loading_and_keeps_reader_deadlines(self):
        source = (IOS / "Tests/PriceShareTests.swift").read_text(encoding="utf-8")
        fixture = source.split("func testActualIsolatedWebKitReaderRequiresCurrentVisibleVenueAndSinglePriceMarker()", 1)[1].split("@MainActor private func evaluate", 1)[0]
        self.assertIn("OwnedReferenceWindow(root: host)", fixture)
        self.assertLess(fixture.index("OwnedReferenceWindow(root: host)"), fixture.index("web.loadSimulatedRequest"))
        self.assertIn("web.window === mounted.window", fixture)
        self.assertIn("mounted.window.isKeyWindow", fixture)
        self.assertIn("timeout: 45", fixture)
        self.assertIn("guard navigationResult == .completed", fixture)
        evaluator = source.split("@MainActor private func evaluate", 1)[1].split("@MainActor private func descendants", 1)[0]
        self.assertIn("timeout: 5", evaluator)

    def test_approved_jpegs_are_byte_exact_and_every_category_has_real_photo(self):
        root = IOS / "App/Assets.xcassets"
        evidence = json.loads((IOS / "Design/reference-artwork-provenance.json").read_text(encoding="utf-8"))
        hashes = {row["name"]: row for row in evidence}
        names = ["DrinkBeer", "DrinkSpritz", "DrinkNegroni", "DrinkSbagliato", "DrinkGinTonic", "DrinkWine", "DrinkAlcoholFree", "DrinkWater", "CommunityCheers"]
        for name in names:
            image_set = root / (name + ".imageset")
            images = json.loads((image_set / "Contents.json").read_text(encoding="utf-8"))["images"]
            self.assertEqual(len(images), 1)
            path = image_set / images[0]["filename"]
            proof = hashes[path.stem]
            self.assertEqual(path.suffix, ".jpg")
            self.assertEqual(path.stat().st_size, proof["jpeg_bytes"])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), proof["jpeg_sha256"])
            self.assertEqual((proof["width"], proof["height"]), (1536, 1024))


if __name__ == "__main__":
    unittest.main()
