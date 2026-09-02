"""Tests for keyword extraction in backend.search (Mission 038).

Mission 038 replaced the YAKE library with a stdlib-only RAKE implementation,
which is covered by tests here for the first time. The assertions rely on the
deterministic output of the current implementation together with the unchanged
NOISE_WORDS / NOISE_PHRASES / ROLE_PLAY_TITLES filtering that lives downstream
of the extraction call.
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
    assert top == "impact"
    assert full == "impact 2026 artificial intelligence healthcare industry"
    assert len(top.split()) <= len(full.split())
    assert top in full


def test_candidates_are_limited_to_three_words_and_sorted_ascending():
    keywords = _rake_extract_keywords(
        "artificial intelligence healthcare industry standardization committee"
    )
    assert keywords
    for phrase, score in keywords:
        assert isinstance(score, float)
        assert len(phrase.split()) <= 3
    # Sort contract: lower score = more important, exactly what the caller's
    # existing filtering loop iterates in.
    scores = [score for _, score in keywords]
    assert scores == sorted(scores)


def test_existing_noise_and_role_play_filtering_still_works_with_new_engine():
    result = extract_search_keywords(
        "Act as a financial analyst and evaluate the current market in late "
        "2025 for tesla stock"
    )
    assert "financial analyst" not in result
    assert "market in late" not in result
    assert "analyst" not in result
    assert "evaluate" not in result
    assert "tesla" in result


def test_noise_phrase_words_do_not_survive_extraction():
    result = extract_search_keywords(
        "Provide a market analysis for electric vehicles in late 2025"
    )
    assert "late 2025" not in result
    assert "in 2025" not in result
    assert "electric" in result
    assert "vehicles" in result