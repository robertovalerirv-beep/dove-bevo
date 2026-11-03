import hashlib
import re
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[3]
WORKFLOW=ROOT/".github"/"workflows"/"mobile-menu-v2-import.yml"

class WorkflowSafetyTests(unittest.TestCase):
    def test_workflow_hash_pins_match_canonical_lf_source_bytes(self):
        workflow=WORKFLOW.read_text(encoding="utf-8")
        pins=re.findall(r"^  (IMPORTER_SHA256|TRANSPORT_SHA256): ([0-9a-f]{64})$",
                        workflow,re.MULTILINE)
        self.assertEqual(len(pins),2)
        self.assertEqual({name for name,_ in pins},{"IMPORTER_SHA256","TRANSPORT_SHA256"})
        paths={
            "IMPORTER_SHA256":"mobile-apps/tools/mobile-menu-v2-import/import_v2.py",
            "TRANSPORT_SHA256":"mobile-apps/tools/menu-seed/live_import.py",
        }
        for name,pin in pins:
            with self.subTest(name=name):
                canonical=(ROOT/paths[name]).read_bytes().replace(b"\r\n",b"\n")
                self.assertNotIn(b"\r",canonical)
                self.assertEqual(hashlib.sha256(canonical).hexdigest(),pin)

    def test_no_github_expression_is_interpolated_in_shell_script(self):
        lines=WORKFLOW.read_text(encoding="utf-8").splitlines()
        blocks=[]
        for index,line in enumerate(lines):
            if line.strip()!="run: |":
                continue
            indent=len(line)-len(line.lstrip())
            body=[]
            for next_line in lines[index+1:]:
                if next_line.strip() and len(next_line)-len(next_line.lstrip())<=indent:
                    break
                body.append(next_line)
            blocks.append("\n".join(body))
        self.assertGreaterEqual(len(blocks),3)
        self.assertTrue(all("${{" not in block for block in blocks))
        joined="\n".join(blocks)
        self.assertIn('[[ "$GITHUB_REF_NAME" =~ ^mobile-menu-v2-audit/',joined)
        self.assertIn('manifest_sha="${BASH_REMATCH[1]}"',joined)

if __name__=="__main__":
    unittest.main()
