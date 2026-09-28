"""Fetching the two upstream archives.

The primary is authoritative and its ``Last-Modified`` tracks the real last draw, so
it supports conditional requests. The fallback is regenerated nightly regardless of
whether a draw happened, so its ``Last-Modified`` says nothing about freshness and is
never used as a signal -- only its content is.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .model import LottoError

PRIMARY_URL = "https://www.brightstarlottery.it/STORICO_ESTRAZIONI_LOTTO/storico.zip"
FALLBACK_URL = "https://www.lottoscientifico.com/archivio/lotto.zip"

PRIMARY_MEMBER_SUFFIX = ".txt"
FALLBACK_MEMBER_SUFFIX = ".dbf"

USER_AGENT = "lotto-archive/1.0 (+https://github.com/; automated archive updater)"
TIMEOUT = 60
MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class Fetched:
    """Result of a (possibly conditional) download."""

    url: str
    status: int
    content: bytes | None
    etag: str | None
    last_modified: str | None

    @property
    def not_modified(self) -> bool:
        return self.status == 304


def build_session() -> requests.Session:
    """A session that retries on transient failures and identifies itself."""
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=2,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "HEAD"}),
        raise_on_status=False,
    )
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers["User-Agent"] = USER_AGENT
    return session


def fetch(
    session: requests.Session,
    url: str,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
) -> Fetched:
    """Download ``url``, honouring conditional-request headers when supplied."""
    headers: dict[str, str] = {}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    response = session.get(url, headers=headers, timeout=TIMEOUT)
    if response.status_code == 304:
        return Fetched(url, 304, None, etag, last_modified)
    if response.status_code != 200:
        raise LottoError(f"{url}: HTTP {response.status_code}")
    if len(response.content) > MAX_DOWNLOAD_BYTES:
        raise LottoError(f"{url}: response larger than {MAX_DOWNLOAD_BYTES} bytes")
    return Fetched(
        url,
        200,
        response.content,
        response.headers.get("ETag"),
        response.headers.get("Last-Modified"),
    )


def unzip_single(data: bytes, suffix: str, *, url: str = "") -> bytes:
    """Extract the one member ending in ``suffix`` from an in-memory zip."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise LottoError(f"{url or 'download'}: not a valid zip ({exc})") from None
    with archive:
        members = [n for n in archive.namelist() if n.lower().endswith(suffix)]
        if len(members) != 1:
            raise LottoError(
                f"{url or 'download'}: expected exactly one '*{suffix}' member, "
                f"found {archive.namelist()}"
            )
        info = archive.getinfo(members[0])
        if info.file_size > MAX_DOWNLOAD_BYTES:
            raise LottoError(f"{url or 'download'}: member {members[0]} is implausibly large")
        return archive.read(info)


def fetch_primary(
    session: requests.Session,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
) -> tuple[Fetched, str | None]:
    """Fetch the primary archive; returns the response and the decoded text."""
    result = fetch(session, PRIMARY_URL, etag=etag, last_modified=last_modified)
    if result.not_modified:
        return result, None
    raw = unzip_single(result.content, PRIMARY_MEMBER_SUFFIX, url=PRIMARY_URL)
    return result, raw.decode("ascii", errors="strict")


def fetch_fallback(session: requests.Session) -> tuple[Fetched, bytes]:
    """Fetch the fallback archive; returns the response and the raw DBF bytes."""
    result = fetch(session, FALLBACK_URL)
    return result, unzip_single(result.content, FALLBACK_MEMBER_SUFFIX, url=FALLBACK_URL)
