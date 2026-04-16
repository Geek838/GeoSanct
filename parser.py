"""
NAPR PDF parser for shareholder extraction and Georgian-to-Latin transliteration.

The parser scans a Georgian registry extract PDF, locates the shareholder section,
extracts shareholder rows from tables or free-form text, transliterates names into
English, and returns a structured JSON document.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Iterable

import pdfplumber
from pdfminer.pdfparser import PDFSyntaxError
from pydantic import BaseModel, ConfigDict, Field


LOGGER = logging.getLogger("napr_parser")

SECTION_KEYWORDS = ("მეწილეები", "პარტნიორები")
STOP_KEYWORDS = (
    "ხელმძღვანელობა",
    "დირექტორი",
    "საგადასახადო",
    "იურიდიული მისამართი",
    "რეგისტრაციის",
)
ID_PATTERN = re.compile(r"\b\d{9}|\b\d{11}\b")
PERCENT_PATTERN = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")

GEORGIAN_TO_LATIN = {
    "ა": "a",
    "ბ": "b",
    "გ": "g",
    "დ": "d",
    "ე": "e",
    "ვ": "v",
    "ზ": "z",
    "თ": "t",
    "ი": "i",
    "კ": "k",
    "ლ": "l",
    "მ": "m",
    "ნ": "n",
    "ო": "o",
    "პ": "p",
    "ჟ": "zh",
    "რ": "r",
    "ს": "s",
    "ტ": "t",
    "უ": "u",
    "ფ": "p",
    "ქ": "k",
    "ღ": "gh",
    "ყ": "q",
    "შ": "sh",
    "ჩ": "ch",
    "ც": "ts",
    "ძ": "dz",
    "წ": "ts",
    "ჭ": "ch",
    "ხ": "kh",
    "ჯ": "j",
    "ჰ": "h",
}


class Shareholder(BaseModel):
    """Normalized shareholder record extracted from the PDF."""

    model_config = ConfigDict(extra="forbid")

    name_georgian: str = Field(..., description="Shareholder name as written in the PDF.")
    name_english: str = Field(..., description="Transliterated shareholder name.")
    ownership_percentage: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Ownership share percentage.",
    )
    identification_number: str = Field(
        ...,
        description="Personal or corporate identification number.",
    )


class EntityReport(BaseModel):
    """Top-level structured output for the entity PDF."""

    model_config = ConfigDict(extra="forbid")

    shareholders: list[Shareholder] = Field(
        default_factory=list,
        description="Extracted shareholders from the registry extract.",
    )


def normalize_text(value: str) -> str:
    """Remove PDF artifacts and normalize whitespace."""

    cleaned = value.replace("\u00a0", " ").replace("\u200b", "")
    cleaned = cleaned.replace("\r", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", cleaned).strip(" |;\t")


def capitalize_transliterated_name(value: str) -> str:
    """Capitalize each word in the transliterated output."""

    return " ".join(part.capitalize() for part in value.split())


def georgian_to_latin(text: str) -> str:
    """
    Transliterate Georgian text to Latin characters using the required mapping.

    Characters outside the mapping are preserved. Georgian text is mapped in
    lowercase first, then each word is capitalized to produce name-like output.
    """

    transliterated_parts: list[str] = []
    for char in text:
        mapped = GEORGIAN_TO_LATIN.get(char.lower(), char)
        transliterated_parts.append(mapped)

    transliterated = "".join(transliterated_parts)
    transliterated = normalize_text(transliterated)
    return capitalize_transliterated_name(transliterated)


def parse_percentage(value: str) -> float | None:
    """Extract a percentage float from a line of text."""

    match = PERCENT_PATTERN.search(value)
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def extract_identification_number(value: str) -> str | None:
    """Extract a 9-digit or 11-digit identifier from a text fragment."""

    match = ID_PATTERN.search(value)
    if not match:
        return None
    return match.group(0)


def looks_like_name(value: str) -> bool:
    """Return True if the value looks like a plausible shareholder name."""

    if not value:
        return False
    if value.isdigit():
        return False
    return any("\u10a0" <= char <= "\u10ff" or char.isalpha() for char in value)


def build_shareholder(name: str, percentage: float, id_number: str) -> Shareholder:
    """Create a validated Shareholder model from parsed fields."""

    clean_name = normalize_text(name)
    return Shareholder(
        name_georgian=clean_name,
        name_english=georgian_to_latin(clean_name),
        ownership_percentage=percentage,
        identification_number=id_number,
    )


def parse_table_rows(table: list[list[str | None]]) -> list[Shareholder]:
    """Parse shareholders from a table extracted by pdfplumber."""

    shareholders: list[Shareholder] = []
    for row in table:
        row_values = [normalize_text(cell or "") for cell in row if cell and normalize_text(cell)]
        if not row_values:
            continue

        row_text = " ".join(row_values)
        percentage = parse_percentage(row_text)
        id_number = extract_identification_number(row_text)
        if percentage is None or id_number is None:
            continue

        name_candidates = [
            cell
            for cell in row_values
            if cell != id_number and "%" not in cell and looks_like_name(cell)
        ]
        if not name_candidates:
            continue

        shareholders.append(build_shareholder(name_candidates[0], percentage, id_number))

    return shareholders


def collect_relevant_lines(text: str) -> list[str]:
    """Collect lines from the shareholder section until the next major section."""

    lines = [normalize_text(line) for line in text.splitlines()]
    relevant_lines: list[str] = []
    in_section = False

    for line in lines:
        if not line:
            continue
        if any(keyword in line for keyword in SECTION_KEYWORDS):
            in_section = True
            continue
        if in_section and any(keyword in line for keyword in STOP_KEYWORDS):
            break
        if in_section:
            relevant_lines.append(line)

    return relevant_lines


def parse_text_lines(lines: Iterable[str]) -> list[Shareholder]:
    """Parse shareholders from whitespace-based text lines."""

    shareholders: list[Shareholder] = []
    seen_keys: set[tuple[str, str]] = set()

    for line in lines:
        percentage = parse_percentage(line)
        id_number = extract_identification_number(line)
        if percentage is None or id_number is None:
            continue

        name_fragment = PERCENT_PATTERN.sub("", line)
        name_fragment = name_fragment.replace(id_number, "")
        name_fragment = normalize_text(name_fragment)
        if not looks_like_name(name_fragment):
            continue

        key = (name_fragment, id_number)
        if key in seen_keys:
            continue

        shareholders.append(build_shareholder(name_fragment, percentage, id_number))
        seen_keys.add(key)

    return shareholders


def deduplicate_shareholders(shareholders: list[Shareholder]) -> list[Shareholder]:
    """Remove duplicates while preserving input order."""

    deduplicated: list[Shareholder] = []
    seen: set[tuple[str, str, float]] = set()

    for shareholder in shareholders:
        key = (
            shareholder.name_georgian,
            shareholder.identification_number,
            shareholder.ownership_percentage,
        )
        if key in seen:
            continue
        deduplicated.append(shareholder)
        seen.add(key)

    return deduplicated


def extract_ubo_data(pdf_path: str) -> str:
    """
    Extract shareholder data from a NAPR PDF and return JSON.

    Args:
        pdf_path: Absolute or relative path to the NAPR extract PDF.

    Returns:
        A pretty-printed JSON string conforming to EntityReport.
    """

    shareholders: list[Shareholder] = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_number, page in enumerate(pdf.pages, start=1):
                page_text = page.extract_text() or ""
                if not any(keyword in page_text for keyword in SECTION_KEYWORDS):
                    continue

                LOGGER.info("Shareholder section detected on page %s", page_number)

                tables = page.extract_tables() or []
                for table in tables:
                    shareholders.extend(parse_table_rows(table))

                if not shareholders:
                    relevant_lines = collect_relevant_lines(page_text)
                    shareholders.extend(parse_text_lines(relevant_lines))

                if shareholders:
                    break
    except PDFSyntaxError as exc:
        LOGGER.error("Failed to parse PDF. The file may be corrupted or signature-damaged: %s", exc)
        report = EntityReport()
        return json.dumps(report.model_dump(), ensure_ascii=False, indent=2)
    except Exception as exc:
        LOGGER.error("Unexpected PDF extraction error: %s", exc)
        report = EntityReport()
        return json.dumps(report.model_dump(), ensure_ascii=False, indent=2)

    report = EntityReport(shareholders=deduplicate_shareholders(shareholders))
    return json.dumps(report.model_dump(), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    test_pdf_path = Path("./downloads/404852174_extract.pdf")
    print(extract_ubo_data(str(test_pdf_path)))
