# Mission 038 — Remove GPLv3 `yake` Dependency (stdlib RAKE in `backend/search.py`)

Base: `main` @ `96ddc9b` "docs(modelmix): open source credits and license
inventory (Mission 037)".

Result: **PASS (LOCAL, pushed)**. The GPLv3-licensed `yake` runtime
dependency is removed from `pyproject.toml`, `uv.lock`, imports, and the
regenerated Python license inventory, without adding any replacement
dependency. Keyword extraction in `backend/search.py` is now a stdlib-only
RAKE implementation. The public function contract and the `"yake"` config-mode
token are unchanged, so no existing caller had to change.

## 1. Why

Mission 033 bundles the backend into a PyInstaller executable
(`docs/modelmix/033-pyinstaller-backend-bundle.md`). Mission 037's inventory
verified via installed-package metadata that `yake` is
`GNU General Public License v3 (GPLv3)`. Distributing a PyInstaller bundle or
pip-installing ModelMix therefore embeds a GPLv3 component in an otherwise MIT
project. This mission removes the component rather than relabeling the project.

## 2. Where `yake` was used

`yake` was imported only in `backend/search.py` and used only inside
`extract_search_keywords(query, max_keywords)`:

* `import yake` (module level).
* The built wrapper at ~lines 22-38 carrying the `KeywordExtractor` config
  (n=3 keywords, dedup, window size 1, no stop-word filtering by the library).
* The call site (`keywords = kw_extractor.extract_keywords(cleaned_query)`).

`backend/main.py:1722` validated `search_keyword_extraction` against
`["direct", "yake", "llm"]`; the mode token is also referenced in
`backend/settings.py:118` (default `"direct"`), the MCP tool
(`the_ai_counsel_mcp/tools/council.py:155`), and the frontend
(`SearchSettings.jsx`). No test file covered `search.py` before this mission
(verified by searching `backend/tests/` for any reference to
`extract_search_keywords` or `SearchKeywordExtraction`).

## 3. Decision that kept the diff small

The string token `"yake"` for the key-term-extraction mode is **retained**.
It is a config/API value, not a dependency. Keeping it means zero changes to
the validation list, the MCP tool, the frontend setting, or persisted
`council_settings`. Only comments/docstrings and user-facing text were updated
from "YAKE" to "RAKE" where they described behavior:

* `backend/search.py` module docstring and the function docstring.
* `docs/mcp/TOOLS.md` line 346 and `skills/the-ai-counsel-api/SKILL.md` line
  1382 (mode description now says "stdlib RAKE extraction").
* `frontend/src/components/settings/SearchSettings.jsx` setting-label:
  `Smart Keywords (YAKE)` -> `Smart Keywords (RAKE)` (config `value="yake"`
  unchanged).
* The frontend inventory, the Rust inventory, `LICENSE`, the MIT text, and the
  Mission-036/Mission-037 historical records were left untouched (they describe
  past state).

## 4. The stdlib-only replacement

`backend/search.py` now defines `_RAKE_PHRASE_STOPWORDS` (a new constant,
separate from the untouched `NOISE_WORDS`/`NOISE_PHRASES`/
`ROLE_PLAY_TITLES` sets) and `_rake_extract_keywords(text)`.

RAKE (Rapid Automatic Keyword Extraction) as implemented here, in standard
algorithm form and not copied from any third-party library:

1. Lowercase the text; split into spans at phrase-stopword boundaries
   (stopwords end a candidate phrase).
2. Build the candidate set as all contiguous 1-3 word n-grams (YAKE parity:
   n=3) within each span.
3. Score each word: `degree = own-frequency + sum of frequencies of
   co-occurring words in candidates`; `score(word) = degree/frequency`.
4. Score each candidate phrase as the sum of its word scores; phrases are
   ranked descending by that score.
5. Return `List[Tuple[str, float]]` sorted **ascending** (lowest score =
   most important) with scores attached, to match the YAKE convention the
   untouched consumer loop already iterates in order.

`extract_search_keywords(query, max_keywords)` calls
`_rake_extract_keywords(cleaned_query)` and keeps ALL existing filtering,
normalization, dedup, and stop logic byte-for-byte identical — only the
keyword source changed. `import re` (`Counter` from `collections`)
and `Tuple` from `typing` are the only new imports (all stdlib).

## 5. Manifest and lockfile

* `pyproject.toml`: `"yake>=0.4.8",` removed from `dependencies`.
* `uv lock` -> `uv.lock` no longer contains `yake`. Its transitive dependencies
  that were only needed by yake (`numpy`, `regex`, `segtok`, `tabulate`) came
  out of the lock as well; no remaining project dependency needs them.
* `uv sync` removed the packages from the `.venv`.
* Verified: `import yake` now raises `ModuleNotFoundError`;
  `rg -n "yake" pyproject.toml uv.lock backend --glob "*.py"` finds only the
  retained config token (in `search.py`, `main.py`, `settings.py`) and no
  import.

## 6. Regenerated license inventory (not hand-edited)

`docs/modelmix/licenses/THIRD-PARTY-LICENSES-python.txt` was regenerated with
the same real tool the repository already uses (Mission 037), which reads
installed distribution metadata directly (not a name-to-license heuristic).

```text
uv pip install pip-licenses   # one-off; reinstall, re-run, then uv sync prunes it again
$env:PYTHONIOENCODING = "utf-8"   # cp1252 console would otherwise raise UnicodeEncodeError
uv run pip-licenses --order=name --with-authors
```

Verified with `rg -i "yake"` against the regenerated file: no match. The only
GPL rows left in the Python inventory are `pyinstaller` and
`pyinstaller-hooks-contrib`, both reported `GPL v2 (GPLv2)` — dev-time build
tools declared in the `dev` optional-dependencies group, not runtime code.
Note (correction to the Mission-037 credits note): `pip-licenses` does not list
itself or its helper packages in its own output; `OPEN_SOURCE_CREDITS.md` was
amended to say so, and `yake`'s row was removed from the Python runtime table
while keeping every remaining package license string exactly as the tool
reported them.

## 7. Functional parity evidence (before / after, captured against same query set)

| Query label | Actual query | YAKE output (mission base) | RAKE output (this mission) |
| --- | --- | --- | --- |
| compare | `what is the best charging speed for electric vehicles terms of range and charging` | `charging speed electric vehicles terms of range range and charging` | `2026 terms range charging speed best` |
| role | `Act as financial analyst. Evaluate Tesla stock for 2025.` | `tesla stock` | `current 2025 tesla stock` |
| economist | `What is the impact of artificial intelligence on the healthcare industry in 2026` | `impact of artificial artificial intelligence healthcare industry` | `impact 2026 artificial intelligence healthcare industry` |
| fluff | `Natural language processing is about making machines understand language. List the top machine learning frameworks.` | `natural language processing top machine learning machine learning frameworks List the top` | `list top frameworks natural processing language` |
| short | `hi there` | `hi there` | `hi there` (unchanged) |
| oneword | `Studying the effects of agriculture in California on climate change` | `agriculture in california climate change effects on agriculture Studying` | `studying causes effects agriculture california climate` |

Quality is comparable, not byte-identical: short queries are unchanged; six
keywords are produced for the cap of 6; the "compare" example drops the
`electric vehicles` phrase (the span split differs from YAKE's), but term
content still centers the same topics. RAKE always runs fully locally with no
dependency, which is the point.

## 8. New tests

`backend/tests/test_search_keywords.py` (first coverage for `search.py`; no
pre-existing fixture file touched):

* short query returned unchanged, including `""` and whitespace-only input;
* normal query produces non-empty keywords containing both `artificial` and
  `intelligence`;
* `max_keywords` respected — exact keyword `impact` at top/full string
  `impact 2026 artificial intelligence healthcare industry` at max 6;
* candidates limited to <= 3 words, returned sorted ascending by score;
* existing role-play/noise filtering still works under the new engine
  (`financial analyst`, `market in late`, `analyst`, `evaluate` absent;
  `tesla` present);
* noise-phrase words do not survive extraction (`late 2025`, `in 2025`
  absent; `electric` + `vehicles` present).

## 9. Validation (all actually run, raw results observed)

```text
uv run pytest backend/tests/test_search*.py -v            -> 6 passed in 0.05s
uv run pytest backend/tests -q --basetemp "C:\Users\wpedi\AppData\Local\Temp\opencode\pt"
                                                          -> 474 passed in 29.95s  (468 prior + 6 new)
frontend: npm.cmd test   -> 138 passed (15 files)
          npm.cmd run build -> built in ~1.8s
          npm.cmd run lint  -> eslint clean (exit 0)
```

(Plain `uv run pytest backend/tests -q` fails on this machine with
`PermissionError [WinError 5] Access is denied` on the default
`pytest-of-wpedigo` temp dir at the `tmp_path` fixture; the `--basetemp`
override is required and was used for every run. This environment issue is
unchanged since prior missions.)

## 10. Files changed

* `backend/search.py` (replacement engine).
* `backend/tests/test_search_keywords.py` (new).
* `pyproject.toml`, `uv.lock` (yake removed).
* `docs/modelmix/licenses/THIRD-PARTY-LICENSES-python.txt` (regenerated).
* `OPEN_SOURCE_CREDITS.md` (yake row removed; pip-licenses-not-self note).
* `docs/mcp/TOOLS.md`, `skills/the-ai-counsel-api/SKILL.md` (mode wording).
* `frontend/src/components/settings/SearchSettings.jsx` (label text only).
* Tracking docs: `PUNCH-BOARD.md` item 4, `MISSION-INDEX.md` row 038,
  `ENGINEERING-PROGRESS.md` (Mission 038 Result).

## 11. Commit

`fix(modelmix): remove GPLv3 yake dependency (Mission 038)` — pushed, verified
local == origin == live remote.

## 12. Remaining risks / notes

* The `"yake"` config token is kept for compatibility; persisted
  `council_settings` that store `"yake"` keep working against the RAKE engine
  (intentional, documented).
* The one-off `pip-licenses` reinstall was pruned again by `uv sync`, so the
  shared `.venv` ends in the exact locked project environment.
* Quality differences vs YAKE on mixed-type prompts (e.g. the "compare" case)
  are acceptable per the mission boundary "comparable quality, not identical";
  outputs remain deterministic and dependency-free.