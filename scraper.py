"""
Asynchronous Playwright scraper for the Georgian National Agency of Public Registry.

This script performs a browser-driven search against the public registry website,
waits for client-rendered UI elements explicitly, and attempts to download the
entity extract PDF for a given registry number.

Notes:
- The implementation uses Playwright for all initial navigation and interaction.
- It intentionally avoids bot-evasion techniques or CAPTCHA bypassing. If the
  site presents access challenges, the scraper logs the issue and exits
  gracefully.
- Selectors on dynamic websites can change over time. A few selector fallbacks
  are included, but you may need to update them if the site structure changes.
"""

from __future__ import annotations

import asyncio
import logging
import random
from pathlib import Path
from typing import Iterable, Optional

from playwright.async_api import (
    Browser,
    BrowserContext,
    Download,
    Locator,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)


LOGGER = logging.getLogger("napr_scraper")

NAPR_URL = "https://enreg.reestri.gov.ge/main.php"
DEFAULT_TIMEOUT_MS = 25_000
VIEWPORT = {"width": 1920, "height": 1080}

# A small pool of mainstream desktop user agents. One is chosen at random per run.
USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) "
        "Gecko/20100101 Firefox/125.0"
    ),
]


async def human_delay(low: float = 1.2, high: float = 3.5) -> None:
    """Sleep for a randomized interval to avoid unnatural, back-to-back actions."""

    await asyncio.sleep(random.uniform(low, high))


async def first_visible_locator(
    page: Page,
    selectors: Iterable[str],
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> Locator:
    """
    Return the first selector whose element becomes visible.

    Raises:
        PlaywrightTimeoutError: If none of the provided selectors become visible.
    """

    last_error: Optional[Exception] = None
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            await locator.wait_for(state="visible", timeout=timeout_ms)
            LOGGER.info("Matched selector: %s", selector)
            return locator
        except PlaywrightTimeoutError as exc:
            last_error = exc
            LOGGER.debug("Selector not visible yet: %s", selector)

    raise PlaywrightTimeoutError(
        f"None of the expected selectors became visible: {list(selectors)}"
    ) from last_error


async def looks_like_captcha(page: Page) -> bool:
    """Best-effort check for common CAPTCHA or challenge indicators."""

    challenge_markers = (
        "captcha",
        "verify you are human",
        "cloudflare",
        "security check",
        "access denied",
    )

    try:
        content = (await page.content()).lower()
    except Exception:
        return False

    return any(marker in content for marker in challenge_markers)


async def build_context(playwright: Playwright) -> tuple[Browser, BrowserContext]:
    """
    Launch a standard Chromium session configured for reliable automation.

    The context enables downloads, sets a realistic viewport, and applies a
    mainstream desktop user agent. It does not attempt to bypass site controls.
    """

    user_agent = random.choice(USER_AGENTS)
    browser = await playwright.chromium.launch(headless=True)
    context = await browser.new_context(
        accept_downloads=True,
        user_agent=user_agent,
        viewport=VIEWPORT,
        locale="en-US",
        timezone_id="Asia/Tbilisi",
        java_script_enabled=True,
    )
    context.set_default_timeout(DEFAULT_TIMEOUT_MS)
    LOGGER.info("Browser context created with desktop viewport and randomized UA.")
    return browser, context


async def wait_for_results(page: Page) -> None:
    """Wait for the search results region or table to appear."""

    await first_visible_locator(
        page,
        selectors=(
            "table",
            '[role="table"]',
            "tbody tr",
            "tr",
            "text=ამონაწერი",
            "text=Extract",
        ),
        timeout_ms=DEFAULT_TIMEOUT_MS,
    )


async def find_matching_result_row(page: Page, registry_number: str) -> Locator:
    """
    Find a row that contains the exact registry number.

    This is intentionally tolerant because the site is client-rendered and
    selector details may vary over time.
    """

    candidate_selectors = (
        f"tr:has-text('{registry_number}')",
        f"tbody tr:has-text('{registry_number}')",
        f'[role="row"]:has-text("{registry_number}")',
        f"text={registry_number}",
    )

    return await first_visible_locator(page, candidate_selectors, timeout_ms=15_000)


async def trigger_extract_download(
    page: Page,
    row: Locator,
    registry_number: str,
    output_dir: Path,
) -> Path:
    """
    Click the extract action and save the downloaded PDF to the target directory.

    Returns:
        The final saved PDF path.
    """

    file_path = output_dir / f"{registry_number}_extract.pdf"

    # The site can expose the extract action using Georgian or English labels.
    action_candidates = (
        row.get_by_role("link", name="ამონაწერი"),
        row.get_by_role("button", name="ამონაწერი"),
        row.get_by_role("link", name="Extract"),
        row.get_by_role("button", name="Extract"),
        row.locator("a:has-text('ამონაწერი')").first,
        row.locator("a:has-text('Extract')").first,
        row.locator("button:has-text('ამონაწერი')").first,
        row.locator("button:has-text('Extract')").first,
        row.locator("a[href*='pdf']").first,
    )

    action_locator: Optional[Locator] = None
    for candidate in action_candidates:
        try:
            await candidate.wait_for(state="visible", timeout=3_000)
            action_locator = candidate
            break
        except PlaywrightTimeoutError:
            continue

    if action_locator is None:
        raise PlaywrightTimeoutError(
            "Could not find an extract action in the matching results row."
        )

    LOGGER.info("Attempting to download extract PDF for %s", registry_number)
    async with page.expect_download(timeout=DEFAULT_TIMEOUT_MS) as download_info:
        await human_delay()
        await action_locator.click()

    download: Download = await download_info.value
    suggested_name = download.suggested_filename
    LOGGER.info("Download started. Suggested filename: %s", suggested_name)
    await download.save_as(str(file_path))
    LOGGER.info("Saved extract PDF to %s", file_path)
    return file_path


async def scrape_napr_entity(registry_number: str, output_dir: str) -> Optional[Path]:
    """
    Search the NAPR registry and download the extract PDF for a registry number.

    Args:
        registry_number: Public registry identifier to search for.
        output_dir: Directory where the extracted PDF should be saved.

    Returns:
        Path to the saved PDF on success, otherwise None.
    """

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    browser: Optional[Browser] = None
    context: Optional[BrowserContext] = None

    try:
        async with async_playwright() as playwright:
            browser, context = await build_context(playwright)
            page = await context.new_page()

            LOGGER.info("Opening NAPR site: %s", NAPR_URL)
            await page.goto(NAPR_URL, wait_until="domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)

            if await looks_like_captcha(page):
                LOGGER.error("Challenge or CAPTCHA detected on initial page load.")
                return None

            search_input = await first_visible_locator(
                page,
                selectors=(
                    "input[type='text']",
                    "input[name*='search']",
                    "input[id*='search']",
                    "input[placeholder*='ID']",
                    "input",
                ),
            )

            LOGGER.info("Search input is ready. Entering registry number %s", registry_number)
            await human_delay()
            await search_input.click()
            await human_delay()
            await search_input.fill(registry_number)

            search_button = await first_visible_locator(
                page,
                selectors=(
                    "button:has-text('Search')",
                    "input[type='submit']",
                    "button[type='submit']",
                    "a:has-text('Search')",
                    "button",
                ),
                timeout_ms=10_000,
            )

            LOGGER.info("Submitting search form.")
            await human_delay()
            await search_button.click()

            if await looks_like_captcha(page):
                LOGGER.error("Challenge or CAPTCHA detected after search submission.")
                return None

            LOGGER.info("Waiting for search results to render.")
            await wait_for_results(page)

            row = await find_matching_result_row(page, registry_number)
            LOGGER.info("Found matching result row for registry number %s", registry_number)

            pdf_path = await trigger_extract_download(page, row, registry_number, output_path)
            return pdf_path

    except PlaywrightTimeoutError as exc:
        LOGGER.error("Timed out while interacting with the NAPR site: %s", exc)
        LOGGER.error(
            "The site may be unavailable, selectors may have changed, or an access challenge may be present."
        )
        return None
    except Exception as exc:
        LOGGER.error("Unexpected scraping failure: %s", exc, exc_info=True)
        return None
    finally:
        if context is not None:
            await context.close()
        if browser is not None:
            await browser.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    downloads_dir = Path("./downloads")
    downloads_dir.mkdir(parents=True, exist_ok=True)

    result = asyncio.run(scrape_napr_entity("404852174", str(downloads_dir)))
    if result:
        LOGGER.info("Scrape completed successfully: %s", result)
    else:
        LOGGER.error("Scrape did not complete successfully.")
