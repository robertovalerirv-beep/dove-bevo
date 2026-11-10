"""Keep Birrificio Torino's unseeded image candidate exact and app-only."""
import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT=Path(__file__).resolve().parents[3]
MANIFEST=ROOT/"mobile-apps/data/mobile-menu-v2-seeds/e7469250d9f2389a1ce2d7d1ecabf87b37cd36ec4e084a7a9dd463309ceb016d.json"
EXPECTED={
    "bbbvnnn.jpg":("e5adac22aa14f5da3f667d4ef1917d661a750f989a01377c39b26cdd75a7769d",12),
    "bira2.jpg":("47070a8a16168f1d57f62d0905f9a6b1a71954efdec58ce381b69b932f341bba",9),
    "bbbv22.jpg":("97050f306bbbb8e4a87fbad5a15f3f2c3f3d3d5eda4ab3abe6cdd64ccd374764",4),
    "bibitossiz.jpg":("f3a01f76f4b53b100c736f8a06458b36906f913a6655c852e951e33c110d0f90",32),
}


class BirrificioTorinoManifestTests(unittest.TestCase):
    def test_image_sources_and_exact_drink_sizes_are_pinned(self):
        raw=MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),MANIFEST.stem)
        doc=core.validate(raw)
        self.assertEqual(doc["data_version"],"20261108")
        self.assertEqual([(v["venue_key"],v["cell"],v["name"],v["address"])
                          for v in doc["venues"]],
                         [("n1234453071","u0j2r","Birrificio Torino","Via Parma 30")])
        self.assertEqual(len(doc["sources"]),4)
        self.assertEqual(len(doc["offers"]),57)
        self.assertEqual(doc["fees"],[])
        self.assertEqual(doc["fee_coverage"],[])
        self.assertTrue(all(row["currency"]=="EUR"
                            and row["currency_exponent"]==2
                            and row["price_context"]=="regular"
                            and row["serving_ml"] is None
                            and row["condition_text"] is None
                            for row in doc["offers"]))
        for source in doc["sources"]:
            name=source["source_url"].rsplit("/",1)[-1]
            with self.subTest(source=name):
                self.assertEqual(source["source_format"],"jpeg_image_v1")
                self.assertEqual(source["source_url"],
                                 "https://marcopascoli-com-769919.hostingersite.com/wp-content/uploads/2026/11/"+name)
                self.assertEqual(source["use_review_reference"],
                                 "https://www.birrificiotorino.com/")
                self.assertEqual(source["source_sha256"],EXPECTED[name][0])
                self.assertEqual(len(source["image_evidence"]),EXPECTED[name][1])
                self.assertEqual(len([row for row in doc["offers"]
                                      if row["source_id"]==source["id"]]),EXPECTED[name][1])

        actual={(r["name"],r["serving_label"],r["amount_minor"],r["category"])
                for r in doc["offers"]}
        for name in ("La Dròla","Aurora","L’Originale","Clara","Lavaiss","Rufus","22"):
            self.assertTrue({(name,"25 cl",350,"beer_draft"),
                             (name,"50 cl",600,"beer_draft"),
                             (name,"1l",1100,"beer_draft")}.issubset(actual))
        self.assertTrue({
            ("D’ora","25 cl",400,"beer_draft"),
            ("D’ora","50 cl",650,"beer_draft"),
            ("D’ora","1l",1200,"beer_draft"),
            ("Calaide","Bottiglia da 0,75",1500,None),
            ("Gin tonic",None,700,"gin_tonic"),
            ("Gin tonic premium",None,1200,"gin_tonic"),
            ("Negroni",None,700,"negroni"),
            ("Americano",None,700,None),
            ("Birra Spritz",None,600,"spritz"),
        }.issubset(actual))
        self.assertFalse({"Whisky","Rum","Amari"}&{r["name"] for r in doc["offers"]})


if __name__=="__main__": unittest.main()
