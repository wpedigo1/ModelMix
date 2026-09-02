"""Tests for keyword extraction in backend.search (Mission 038).

Mission 038 replaced the YAKE library with a stdlib-only RAKE implementation,
which is covered by tests here for the first time. The assertions rely on the
deterministic output of the current implementation together with the unchanged
NOISE_WORDS / NOISE_PHRASES / ROLE_PLAY_TITLES filtering that lives downstream
of the extraction call.

RAKE's real sort convention applies: a higher degree/frequency word score means
a word is more central, so the extraction returns the highest-scored (most
important) phrases first. The semantic tests below assert the subject phrase
must appear contiguously in the output - shape-only tests ("is non-empty")
cannot catch an inverted sort, which is exactly the regression these guard.
"""

from backend.search import (
    _rake_extract_keywords,
    extract_search_keywords,
)


def test_short_query_returned_unchanged():
    assert extract_search_keywords("hi there") == "hi there"
    assert extract_search_keywords("Tesla") == "Tesla"
    assert extract_search_keywords("") == ""
    assert extract_search_keywords("   ") == ""


def test_normal_query_returns_nonempty_keywords():
    result = extract_search_keywords(
        "What is the impact of artificial intelligence on the healthcare industry in 2026"
    )
    assert isinstance(result, str)
    assert result
    assert "artificial" in result
    assert "intelligence" in result


def test_max_keywords_is_respected():
    query = (
        "What is the impact of artificial intelligence on the healthcare "
        "industry in 2026"
    )
    top = extract_search_keywords(query, max_keywords=1)
    full = extract_search_keywords(query, max_keywords=6)
    assert top == "artificial intelligence"
    assert full == "artificial intelligence healthcare industry"
    assert len(top.split()) <= len(full.split())
    assert top in full


def test_candidates_are_limited_to_three_words_and_sorted_descending():
    keywords = _rake_extract_keywords(
        "artificial intelligence healthcare industry standardization committee"
    )
    assert keywords
    for phrase, score in keywords:
        assert isinstance(score, float)
        assert len(phrase.split()) <= 3
    # RAKE convention: HIGHER degree/frequency score = more central/important,
    # so the list is ordered highest-score-first, which is exactly the
    # direction the caller's existing filtering loop iterates in.
    scores = [score for _, score in keywords]
    assert scores == sorted(scores, reverse=True)


def test_existing_noise_and_role_play_filtering_still_works_with_new_engine():
    result = extract_search_keywords(
        "Act as a financial analyst and evaluate the current market in late "
        "2025 for tesla stock"
    )
    # Role-play titles and noise phrases are still stripped.
    assert "financial analyst" not in result
    assert "market in late" not in result
    assert "analyst" not in result
    # The multi-word subject phrase is the top-ranked phrase and survives:
    # 'evaluate' (a single-word noise token) is dropped while the subject
    # phrase 'tesla stock' carries the query intent.
    assert result == "tesla stock"


def test_noise_phrase_words_do_not_survive_extraction():
    result = extract_search_keywords(
        "Provide a market analysis for electric vehicles in late 2025"
    )
    assert "late 2025" not in result
    assert "in 2025" not in result
    assert "electric" in result
    assert "vehicles" in result


def test_subject_phrase_survives_extraction_unaltered():
    # Semantic check, not just shape: a clear multi-word subject phrase must
    # appear contiguously in the returned keywords. This assertion fails under
    # an inverted RAKE sort, where the low-scored noise leads (e.g.
    # 'economic arguments income universal basic' for this query).
    result = extract_search_keywords(
        "Discuss the economic arguments for universal basic income"
    )
    assert "universal basic income" in result


def test_climate_change_policy_phrase_survives_extraction():
    # Same semantic guarantee for a different subject phrase: the contiguous
    # multi-word subject must survive, not merely some of its words.
    result = extract_search_keywords(
        "Compare the main climate change policy proposals for 2026"
    )
    assert "climate change policy" in result