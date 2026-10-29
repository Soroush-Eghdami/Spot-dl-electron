#!/usr/bin/env python3
"""
SpotifyDL backend.

Tiny JSON-lines bridge around `spotdl`. Electron starts it once and sends
commands over stdin; the backend answers on stdout.

    {"id": "1", "cmd": "ping"}
    {"id": "2", "cmd": "resolve", "urls": [...], "spotify": {...}}
    {"id": "3", "cmd": "download", "urls": [...], "options": {...}, "spotify": {...}}
    {"id": "4", "cmd": "cancel"}
    {"id": "5", "cmd": "shutdown"}
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
from importlib.metadata import version as package_version
from pathlib import Path
from typing import Any, Dict, List, Optional

PROTOCOL_LOCK = threading.Lock()
_PROTOCOL_OUT = None


# --------------------------------------------------------------------------
# Protocol
# --------------------------------------------------------------------------
def setup_protocol() -> None:
    global _PROTOCOL_OUT

    # Keep the real stdout for ourselves and send library output to stderr,
    # so nothing can corrupt the protocol stream.
    try:
        fd = os.dup(sys.stdout.fileno())
        _PROTOCOL_OUT = os.fdopen(fd, "w", encoding="utf-8", buffering=1, newline="\n")
    except Exception:
        _PROTOCOL_OUT = sys.stdout

    try:
        sys.stdout = sys.stderr
    except Exception:
        pass

    logging.basicConfig(
        level=os.environ.get("SPOTIFYDL_LOG_LEVEL", "WARNING").upper(),
        stream=sys.stderr,
        format="%(levelname)s %(name)s: %(message)s",
    )


def emit(payload: Dict[str, Any]) -> None:
    line = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with PROTOCOL_LOCK:
        try:
            _PROTOCOL_OUT.write(line + "\n")  # type: ignore[union-attr]
            _PROTOCOL_OUT.flush()  # type: ignore[union-attr]
        except Exception:
            pass


# --------------------------------------------------------------------------
# spotdl patches
# --------------------------------------------------------------------------
def install_network_timeouts() -> None:
    """
    The free spotapi client never sets a request timeout, so one stuck CDN
    call can hang forever. Add a timeout and let its retries do the rest.
    """
    try:
        import spotapi.http.request as spotapi_request

        original = spotapi_request.TLSClient.build_request
        if getattr(original, "_spotifydl_patched", False):
            return

        def build_request(self, method, url, **kwargs):  # type: ignore[no-untyped-def]
            kwargs.setdefault("timeout", 30)
            return original(self, method, url, **kwargs)

        build_request._spotifydl_patched = True  # type: ignore[attr-defined]
        spotapi_request.TLSClient.build_request = build_request  # type: ignore[assignment]
    except Exception:
        logging.getLogger("spotifydl").debug(
            "Could not install network timeouts", exc_info=True
        )


def install_hash_cache() -> None:
    """
    spotapi downloads ~75 JS chunks to find GraphQL hashes, and it does this
    for every new client. Remember the result once per process instead.
    """
    try:
        from spotapi.client import BaseClient

        original = BaseClient.get_sha256_hash
        if getattr(original, "_spotifydl_patched", False):
            return

        cache: Dict[str, Any] = {"raw_hashes": None, "js_pack": None}
        lock = threading.Lock()

        def get_sha256_hash(self):  # type: ignore[no-untyped-def]
            if cache["raw_hashes"] is not None:
                self.raw_hashes = cache["raw_hashes"]
                return
            with lock:
                if cache["raw_hashes"] is not None:
                    self.raw_hashes = cache["raw_hashes"]
                    return
                original(self)
                cache["raw_hashes"] = self.raw_hashes

        get_sha256_hash._spotifydl_patched = True  # type: ignore[attr-defined]
        BaseClient.get_sha256_hash = get_sha256_hash  # type: ignore[assignment]
    except Exception:
        logging.getLogger("spotifydl").debug(
            "Could not install hash cache", exc_info=True
        )


def install_progress_tracker() -> None:
    """
    Swap spotdl's fancy TUI tracker for a quiet one that reports byte
    progress, speed and ETA to our callback.
    """
    try:
        from spotdl.download.progress_handler import ProgressHandler, SongTracker

        if getattr(SongTracker, "_spotifydl_patched", False):
            return

        class BridgedSongTracker(SongTracker):
            speed: Optional[float] = None
            eta: Optional[int] = None

            def yt_dlp_progress_hook(self, data: Dict[str, Any]) -> None:
                status = data.get("status")
                if status == "downloading":
                    total = data.get("total_bytes") or data.get("total_bytes_estimate")
                    done = data.get("downloaded_bytes") or 0
                    if total and done:
                        self.progress = 40 + (float(done) / float(total)) * 30
                    self.speed = data.get("speed")
                    self.eta = data.get("eta")
                    self.update("Downloading")
                elif status == "finished":
                    self.progress = 72
                    self.speed = None
                    self.eta = None
                    self.update("Processing")

        def get_new_tracker(self, song):  # type: ignore[no-untyped-def]
            return BridgedSongTracker(self, song)

        ProgressHandler.get_new_tracker = get_new_tracker  # type: ignore[assignment]
        SongTracker._spotifydl_patched = True  # type: ignore[attr-defined]
    except Exception:
        logging.getLogger("spotifydl").debug(
            "Could not install progress tracker", exc_info=True
        )


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
class DownloadCancelled(Exception):
    """Thrown from the progress callback to stop the current track."""


def spotdl_version() -> str:
    try:
        return package_version("spotdl")
    except Exception:
        return "unknown"


def ffmpeg_info() -> Dict[str, Any]:
    exe = shutil.which("ffmpeg")
    if exe is None:
        try:
            from spotdl.utils.ffmpeg import get_ffmpeg_path

            bundled = get_ffmpeg_path()
            if bundled is not None:
                exe = str(bundled)
        except Exception:
            exe = None

    if exe is None:
        return {"available": False, "path": None, "version": None}

    try:
        result = subprocess.run(
            [exe, "-version"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        first = (result.stdout or "").splitlines()[0] if result.stdout else ""
        return {"available": True, "path": exe, "version": first}
    except Exception:
        return {"available": True, "path": exe, "version": None}


def friendly_error(message: str) -> str:
    text = (message or "").strip()
    low = text.lower()
    if not text:
        return "Something went wrong."
    if "rate/request limit" in low or "rate limit" in low or "429" in low:
        return (
            "Spotify rate limit reached. Add your own Spotify Client ID/Secret in "
            "Advanced settings and switch on the official API."
        )
    if "ffmpeg" in low:
        return "ffmpeg is missing or failed. Install ffmpeg and make sure it is on PATH."
    if "clienttoken" in low or "could not get session" in low:
        return "Could not reach Spotify. Check your internet connection and try again."
    if "invalid url" in low or "couldn't get metadata" in low:
        return "That Spotify link could not be read. Check the link and try again."
    if "timed out" in low or "timeout" in low:
        return "Spotify took too long to respond. Please try again."
    if len(text) > 400:
        text = text[:400] + "…"
    return text


def link_kind(url: str) -> str:
    if "/track/" in url:
        return "track"
    if "/album/" in url:
        return "album"
    if "/playlist/" in url:
        return "playlist"
    if "/artist/" in url:
        return "artist"
    if "/episode/" in url:
        return "episode"
    return "link"


def normalize_url(line: str) -> Optional[str]:
    line = line.strip()
    if not line:
        return None
    if line.startswith("spotify:"):
        parts = line.split(":")
        if len(parts) >= 3:
            return f"https://open.spotify.com/{parts[1]}/{parts[2].split('?')[0]}"
        return None
    if line.startswith("http://") or line.startswith("https://"):
        return line
    return None


def song_to_dict(song) -> Dict[str, Any]:  # type: ignore[no-untyped-def]
    return {
        "url": song.url,
        "id": song.song_id,
        "title": song.name,
        "artist": song.artist,
        "artists": list(song.artists or []),
        "album": song.album_name,
        "duration": song.duration,
        "cover": song.cover_url,
        "year": song.year,
        "explicit": bool(song.explicit),
        "trackNumber": song.track_number,
        "listName": song.list_name,
        "listUrl": song.list_url,
        "listPosition": song.list_position,
        "listLength": song.list_length,
        "kind": link_kind(song.url or ""),
    }


# --------------------------------------------------------------------------
# Engine
# --------------------------------------------------------------------------
class Engine:
    def __init__(self) -> None:
        self._client = None
        self._spotify_key: Optional[str] = None
        self._client_lock = threading.Lock()
        self._job_lock = threading.Lock()
        self._cancel = threading.Event()
        self._songs: Dict[str, Any] = {}
        self._songs_lock = threading.Lock()

    # -- spotdl client -----------------------------------------------------
    def _spotify_config(self, spotify: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        from spotdl.utils.config import DEFAULT_CONFIG

        spotify = spotify or {}
        client_id = (spotify.get("clientId") or "").strip()
        client_secret = (spotify.get("clientSecret") or "").strip()
        if not client_id or not client_secret:
            client_id = DEFAULT_CONFIG["client_id"]
            client_secret = DEFAULT_CONFIG["client_secret"]
        return {
            "client_id": client_id,
            "client_secret": client_secret,
            "use_official_api": bool(spotify.get("useOfficialApi")),
        }

    def get_client(
        self,
        spotify: Optional[Dict[str, Any]] = None,
        options: Optional[Dict[str, Any]] = None,
        reset: bool = False,
        progress_callback=None,  # type: ignore[no-untyped-def]
    ):
        from spotdl import Spotdl
        from spotdl.utils.spotify import SpotifyClient

        cfg = self._spotify_config(spotify)
        options = options or {}
        key = json.dumps(cfg, sort_keys=True)

        with self._client_lock:
            if self._client is not None and self._spotify_key == key and not reset:
                client = self._client
            else:
                # spotdl keeps one client per process, so new credentials
                # mean we have to start fresh.
                try:
                    SpotifyClient._instance = None  # type: ignore[attr-defined]
                except Exception:
                    pass

                downloader_settings = {
                    "simple_tui": True,
                    "threads": max(1, min(int(options.get("threads") or 4), 16)),
                    "format": str(options.get("format") or "mp3"),
                    "bitrate": str(options.get("bitrate") or "192k"),
                    "output": str(
                        options.get("output")
                        or "{artists} - {title}.{output-ext}"
                    ),
                    "audio_providers": [
                        str(options.get("audioProvider") or "youtube-music")
                    ],
                    "overwrite": str(options.get("overwrite") or "skip"),
                    "generate_lrc": bool(options.get("generateLrc")),
                    "skip_album_art": bool(options.get("skipAlbumArt")),
                    "print_errors": False,
                    "log_level": "ERROR",
                }

                client = Spotdl(
                    client_id=cfg["client_id"],
                    client_secret=cfg["client_secret"],
                    use_official_api=cfg["use_official_api"],
                    downloader_settings=downloader_settings,
                )
                client.downloader.progress_handler.simple_tui = True
                client.downloader.progress_handler.web_ui = True
                self._client = client
                self._spotify_key = key

            if progress_callback is not None:
                client.downloader.progress_handler.update_callback = progress_callback
            return client

    # -- commands ----------------------------------------------------------
    def ping(self) -> Dict[str, Any]:
        info = {
            "spotdl": spotdl_version(),
            "python": sys.version.split()[0],
            "ffmpeg": ffmpeg_info(),
        }
        try:
            info["ytdlp"] = package_version("yt-dlp")
        except Exception:
            info["ytdlp"] = None
        return info

    def resolve(self, msg: Dict[str, Any]) -> None:
        request_id = msg.get("id")
        raw_urls = msg.get("urls") or []
        urls: List[str] = []
        for raw in raw_urls:
            normalized = normalize_url(str(raw))
            if normalized and normalized not in urls:
                urls.append(normalized)

        if not urls:
            emit(
                {
                    "event": "error",
                    "id": request_id,
                    "message": "Paste at least one Spotify link first.",
                }
            )
            return

        emit({"event": "resolving", "id": request_id, "total": len(urls)})

        client = self.get_client(msg.get("spotify"))

        collections: List[Dict[str, Any]] = []
        found_songs: List[Any] = []
        seen = set()

        for index, url in enumerate(urls):
            emit(
                {
                    "event": "progress",
                    "id": request_id,
                    "step": index + 1,
                    "total": len(urls),
                    "message": f"Reading {link_kind(url)} {index + 1} of {len(urls)}",
                }
            )
            try:
                songs = client.search([url])
                if not songs:
                    raise RuntimeError("No tracks were found for this link.")

                for song in songs:
                    with self._songs_lock:
                        self._songs[song.url] = song
                    if song.url in seen:
                        continue
                    seen.add(song.url)
                    found_songs.append(song)

                first = songs[0]
                name = (
                    first.list_name
                    or (first.name if link_kind(url) == "track" else first.album_name)
                    or url
                )
                collections.append(
                    {
                        "url": url,
                        "kind": link_kind(url),
                        "name": name,
                        "cover": first.cover_url,
                        "count": len(songs),
                    }
                )
            except Exception as exc:  # noqa: BLE001
                logging.getLogger("spotifydl").warning(
                    "Resolve failed for %s", url, exc_info=True
                )
                collections.append(
                    {
                        "url": url,
                        "kind": link_kind(url),
                        "name": url,
                        "count": 0,
                        "error": friendly_error(str(exc)),
                    }
                )

        if not found_songs:
            message = next(
                (c.get("error") for c in collections if c.get("error")),
                "No tracks could be resolved.",
            )
            emit({"event": "error", "id": request_id, "message": message})
            return

        emit(
            {
                "event": "resolved",
                "id": request_id,
                "songs": [song_to_dict(song) for song in found_songs],
                "collections": collections,
            }
        )

    def download(self, msg: Dict[str, Any]) -> None:
        request_id = msg.get("id")
        options = msg.get("options") or {}
        requested: List[str] = []
        for raw in msg.get("urls") or []:
            url = str(raw).strip()
            if url and url not in requested:
                requested.append(url)

        with self._songs_lock:
            songs = [self._songs[u] for u in requested if u in self._songs]
            missing = [u for u in requested if u not in self._songs]

        if missing:
            try:
                client = self.get_client(msg.get("spotify"), options, reset=True)
                for song in client.search(missing):
                    with self._songs_lock:
                        self._songs[song.url] = song
                        if song.url in requested and song.url not in {s.url for s in songs}:
                            songs.append(song)
            except Exception:  # noqa: BLE001
                logging.getLogger("spotifydl").warning(
                    "Could not re-resolve some tracks", exc_info=True
                )

        if not songs:
            emit(
                {
                    "event": "error",
                    "id": request_id,
                    "message": "No tracks to download. Resolve your links again.",
                }
            )
            return

        output_dir = str(options.get("outputDir") or "").strip()
        if not output_dir:
            output_dir = str(Path.home() / "Downloads" / "SpotifyDL")
        try:
            os.makedirs(output_dir, exist_ok=True)
        except Exception as exc:  # noqa: BLE001
            emit(
                {
                    "event": "error",
                    "id": request_id,
                    "message": f"Cannot create output folder: {exc}",
                }
            )
            return

        template = str(options.get("output") or "{artists} - {title}.{output-ext}")
        options = dict(options)
        options["output"] = os.path.join(output_dir, template)

        self._cancel.clear()
        emit(
            {
                "event": "download-start",
                "id": request_id,
                "total": len(songs),
                "outputDir": output_dir,
            }
        )

        last_emit: Dict[str, float] = {}
        skipped_urls = set()
        cancelled = False

        def progress_callback(tracker, message: str) -> None:
            nonlocal cancelled
            if self._cancel.is_set():
                cancelled = True
                raise DownloadCancelled()

            url = tracker.song.url
            if message == "Skipped":
                skipped_urls.add(url)
            now = time.monotonic()
            previous = last_emit.get(url, 0.0)
            if now - previous < 0.12 and message not in ("Done", "Skipped", "Error"):
                return
            last_emit[url] = now

            state = "downloading"
            if message in ("Searching for song",):
                state = "searching"
            elif message in ("Getting lyrics", "Getting audio meta"):
                state = "metadata"
            elif message in ("Converting", "Processing", "Embedding metadata"):
                state = "converting"
            elif message == "Done":
                state = "done"
            elif message == "Skipped":
                state = "skipped"
            elif message == "Error":
                state = "error"

            emit(
                {
                    "event": "track",
                    "id": request_id,
                    "url": url,
                    "state": state,
                    "progress": int(max(0, min(100, round(tracker.progress)))),
                    "message": message,
                    "speed": getattr(tracker, "speed", None),
                    "eta": getattr(tracker, "eta", None),
                }
            )

        client = self.get_client(
            msg.get("spotify"), options, reset=True, progress_callback=progress_callback
        )

        ok = 0
        failed = 0
        skipped = 0

        for index, song in enumerate(songs):
            if self._cancel.is_set():
                cancelled = True
                break

            emit(
                {
                    "event": "track",
                    "id": request_id,
                    "url": song.url,
                    "state": "queued",
                    "progress": 0,
                    "message": f"Queued {index + 1} of {len(songs)}",
                    "speed": None,
                    "eta": None,
                }
            )

            try:
                _, path = client.download(song)
                if self._cancel.is_set():
                    cancelled = True
                    break

                if path is not None:
                    is_skipped = song.url in skipped_urls
                    if is_skipped:
                        skipped += 1
                    else:
                        ok += 1
                    emit(
                        {
                            "event": "track",
                            "id": request_id,
                            "url": song.url,
                            "state": "skipped" if is_skipped else "done",
                            "progress": 100,
                            "message": "Already in your library"
                            if is_skipped
                            else "Downloaded",
                            "path": str(path),
                            "speed": None,
                            "eta": None,
                        }
                    )
                else:
                    failed += 1
                    detail = (
                        client.downloader.errors[-1]
                        if client.downloader.errors
                        else "Track could not be downloaded."
                    )
                    emit(
                        {
                            "event": "track",
                            "id": request_id,
                            "url": song.url,
                            "state": "error",
                            "progress": 0,
                            "message": "Failed",
                            "error": friendly_error(str(detail)),
                        }
                    )
            except DownloadCancelled:
                cancelled = True
                break
            except Exception as exc:  # noqa: BLE001
                logging.getLogger("spotifydl").warning(
                    "Download failed for %s", song.url, exc_info=True
                )
                if self._cancel.is_set():
                    cancelled = True
                    break
                failed += 1
                emit(
                    {
                        "event": "track",
                        "id": request_id,
                        "url": song.url,
                        "state": "error",
                        "progress": 0,
                        "message": "Failed",
                        "error": friendly_error(str(exc)),
                    }
                )

        if cancelled:
            emit(
                {
                    "event": "complete",
                    "id": request_id,
                    "total": len(songs),
                    "ok": ok,
                    "failed": failed,
                    "skipped": skipped,
                    "cancelled": True,
                }
            )
        else:
            emit(
                {
                    "event": "complete",
                    "id": request_id,
                    "total": len(songs),
                    "ok": ok,
                    "failed": failed,
                    "skipped": skipped,
                    "cancelled": False,
                }
            )

    def cancel(self) -> None:
        self._cancel.set()

    # -- job runner --------------------------------------------------------
    def run_job(self, msg: Dict[str, Any]) -> None:
        if not self._job_lock.acquire(blocking=False):
            emit(
                {
                    "event": "error",
                    "id": msg.get("id"),
                    "message": "Another job is still running. Wait for it to finish.",
                }
            )
            return
        try:
            cmd = msg.get("cmd")
            if cmd == "resolve":
                self.resolve(msg)
            elif cmd == "download":
                self.download(msg)
        except Exception as exc:  # noqa: BLE001
            logging.getLogger("spotifydl").error("Job crashed", exc_info=True)
            emit(
                {
                    "event": "error",
                    "id": msg.get("id"),
                    "message": friendly_error(str(exc) or exc.__class__.__name__),
                    "detail": traceback.format_exc(limit=6),
                }
            )
        finally:
            self._job_lock.release()


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def read_stdin_lines():
    # Read the raw stream as UTF-8 so odd filenames can't break decoding.
    stream = sys.stdin
    if stream is None:
        return
    for line in stream:
        yield line


def main() -> int:
    setup_protocol()
    emit({"event": "booting"})
    install_network_timeouts()
    install_hash_cache()
    install_progress_tracker()

    engine = Engine()
    emit({"event": "ready", **engine.ping()})

    for line in read_stdin_lines():
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        cmd = msg.get("cmd")
        if cmd == "shutdown":
            engine.cancel()
            emit({"event": "result", "id": msg.get("id"), "data": {"bye": True}})
            break
        if cmd == "ping":
            emit({"event": "result", "id": msg.get("id"), "data": engine.ping()})
        elif cmd == "cancel":
            engine.cancel()
            emit({"event": "result", "id": msg.get("id"), "data": {"ok": True}})
        elif cmd in ("resolve", "download"):
            threading.Thread(
                target=engine.run_job, args=(msg,), daemon=True
            ).start()
        else:
            emit(
                {
                    "event": "error",
                    "id": msg.get("id"),
                    "message": f"Unknown command: {cmd}",
                }
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
