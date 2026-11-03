import re
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[3]
WORKFLOW=ROOT/".github"/"workflows"/"mobile-menu-v2-import.yml"

class WorkflowSafetyTests(unittest.TestCase):
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
