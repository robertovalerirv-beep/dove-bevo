# Diario di avanzamento

Una voce per sessione, la più recente in alto. Ogni voce: data, milestone, cosa è stato fatto, prove (comandi ed esito), cosa resta, cosa verificare a mano.

---

## 2026-10-11 · Sessione 1 · M-1 (specifica)

**Fatto**
- Letto `docs/BRIEF.md` v2 (spostato da radice a `docs/`), intervista su 9 punti ambigui; decisioni D-01…D-26 in `docs/SPEC.md` sezione 3.
- Scritti `docs/SPEC.md` (77 funzionalità con verifica, sezione 18) e `docs/feature_list.json` generato dalle stesse tabelle (tutte `passes: false`).
- ADR 0001–0007 in `docs/adr/` (stato: proposta).
- `init.sh`, `CLAUDE.md`, subagent `spec-reviewer`, `security-reviewer`, `ux-a11y-reviewer`, hook `protect-files.sh` e `format-and-lint.sh`, `.claude/claude-security-guidance.md`.
- Configurazione proposta in `.claude/settings.proposed.json` (non ancora attiva, D-20).
- `git init` con branch `main`; nessun commit (in attesa di approvazione).

**Prove**
- Vettore di test geohash verificato: (45.4642, 9.19) → `u0nd9`.
- `docs/feature_list.json`: 77 voci (M0 11, M1 15, M2 16, M3 10, M4 10, M5 10, M6 5).
- `protect-files.sh` (input JSON come lo invia Claude Code, percorsi Windows assoluti): exit 2 su `.dev.vars`, `.dev.vars.staging`, `.env`, `package-lock.json`, migrazione presente su `main` (repo temporaneo); exit 0 su `.dev.vars.example`, `src/app/main.ts`, migrazione nuova.
- `format-and-lint.sh`: exit 0 senza tooling installato (prima di M0).
- `bash init.sh`: riconosce lo stato pre-M0, documenti presenti, `features: 0/77 passing`.
- `CLAUDE.md`: 68 righe. Script `.sh` con terminatori LF; `.gitattributes` forza LF.
- Aggiunti `.gitignore` (segreti, `public/data/`, foto evals) e `.gitattributes`.
- Aggiunta rispetto al BRIEF: quota di 20 segnalazioni al giorno (SPEC 13.3) e rotta `POST /api/venues/confirm` (necessaria per D-05).

**Ambiente rilevato**
- Windows 11, Git Bash, Node 24.18, npm 11.16, Python 3.13, git 2.54, `gh` autenticato. Mancano `jq` (gli hook usano Node) e `osmium` (import solo in CI, D-24). UI UX Pro Max 2.13 installato come plugin.

**Chiusura M-1**
- Roberto ha approvato SPEC 1.0 e chiesto a Claude di attivare la configurazione.
- `.claude/settings.proposed.json` → `.claude/settings.json` (attiva). Prova: un `Write` su `.dev.vars.hooktest` è stato respinto dalla regola deny.
- SPEC e ADR 0001–0007 segnati come approvati/accettati.
- Identità git del solo repository: Roberto Valeri <roberto.valeri.rv@gmail.com>.
- Commit iniziale su `main` e tag `spec-approved` (base della guardia della feature list, D-21).

**Prossimo passo**
`/clear`, poi il prompt di ripresa (BRIEF sezione 17) con milestone **M0**. Prerequisiti M0 per Roberto: SPEC sezione 21.
