"""
AES-256-GCM encryption at rest for all persisted data.

Key hierarchy (never stored in plaintext):
  MASTER_SECRET (env)
       ↓ PBKDF2-HMAC-SHA256 + DEVICE_SALT → KEK (32 bytes, in memory)
  DATA_KEY (32 random bytes)
       ↓ AES-256-GCM with KEK → data_key.enc (on disk)
  Plaintext files
       ↓ AES-256-GCM with DATA_KEY → *.enc (on disk)

On-disk envelope (all encrypted files):
  MAGIC(4) | VERSION(1) | NONCE(16) | TAG(16) | CIPHERTEXT(n)
"""

import os
import struct
import logging
from pathlib import Path
from typing import Optional

from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA256, HMAC as CryptoHMAC
from Crypto.Random import get_random_bytes

log = logging.getLogger(__name__)

_MAGIC = b"SAGE"
_VERSION = 1
_HEADER_SIZE = 4 + 1 + 16 + 16   # magic + version + nonce + tag
_PBKDF2_ITERS = 600_000

_DATA_KEY: Optional[bytes] = None

DATA_KEY_FILE = Path(os.environ.get("SAGE_DATA_KEY_FILE", "data_key.enc"))
DEVICE_SALT_FILE = Path(os.environ.get("SAGE_SALT_FILE", "device.salt"))


# ── Low-level AES-GCM ────────────────────────────────────────────────────────

def _aes_encrypt(plaintext: bytes, key: bytes) -> bytes:
    nonce = get_random_bytes(16)
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=16)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)
    return _MAGIC + struct.pack("B", _VERSION) + nonce + tag + ciphertext


def _aes_decrypt(blob: bytes, key: bytes) -> bytes:
    if len(blob) < _HEADER_SIZE + 1:
        raise ValueError("Encrypted blob too short")
    if blob[:4] != _MAGIC:
        raise ValueError("Bad magic — not a SAGE encrypted file")
    version = struct.unpack("B", blob[4:5])[0]
    if version != _VERSION:
        raise ValueError(f"Unsupported encryption version {version}")
    nonce = blob[5:21]
    tag = blob[21:37]
    ciphertext = blob[37:]
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=16)
    return cipher.decrypt_and_verify(ciphertext, tag)


# ── Key management ───────────────────────────────────────────────────────────

def _derive_kek(master_secret: str, salt: bytes) -> bytes:
    """Derive Key Encryption Key from parent master secret. ~1.5s on CPU."""
    return PBKDF2(
        master_secret.encode("utf-8"),
        salt,
        dkLen=32,
        count=_PBKDF2_ITERS,
        prf=lambda p, s: CryptoHMAC.new(p, s, SHA256).digest(),
    )


def initialize_encryption(master_secret: str) -> None:
    """
    Called once at startup. Derives KEK, unwraps (or generates) DATA_KEY.
    After this call, `encrypt()` and `decrypt()` are available.
    The master secret is not retained in memory beyond this function.
    """
    global _DATA_KEY

    # 1. Load or generate device salt (ties encryption to this installation)
    if DEVICE_SALT_FILE.exists():
        device_salt = DEVICE_SALT_FILE.read_bytes()
    else:
        device_salt = get_random_bytes(32)
        DEVICE_SALT_FILE.write_bytes(device_salt)
        DEVICE_SALT_FILE.chmod(0o600)
        log.info("Generated new device salt")

    # 2. Derive KEK — never stored
    kek = _derive_kek(master_secret, device_salt)

    # 3. Load or generate DATA_KEY
    if DATA_KEY_FILE.exists():
        wrapped = DATA_KEY_FILE.read_bytes()
        try:
            _DATA_KEY = _aes_decrypt(wrapped, kek)
            log.info("DATA_KEY loaded from %s", DATA_KEY_FILE)
        except Exception:
            log.critical(
                "Failed to unwrap DATA_KEY — wrong master secret or corrupted key file"
            )
            raise RuntimeError(
                "Encryption key decryption failed. Check MASTER_SECRET env var."
            )
    else:
        _DATA_KEY = get_random_bytes(32)
        wrapped = _aes_encrypt(_DATA_KEY, kek)
        DATA_KEY_FILE.write_bytes(wrapped)
        DATA_KEY_FILE.chmod(0o600)
        log.info("Generated and wrapped new DATA_KEY → %s", DATA_KEY_FILE)

    # Scrub KEK from memory (best-effort in Python)
    kek = b"\x00" * len(kek)
    del kek


# ── Public API ───────────────────────────────────────────────────────────────

def encrypt(plaintext: bytes) -> bytes:
    """Encrypt bytes with DATA_KEY. Raises if encryption not initialised."""
    if _DATA_KEY is None:
        raise RuntimeError("Encryption not initialised — call initialize_encryption() at startup")
    return _aes_encrypt(plaintext, _DATA_KEY)


def decrypt(blob: bytes) -> bytes:
    """Decrypt bytes with DATA_KEY."""
    if _DATA_KEY is None:
        raise RuntimeError("Encryption not initialised")
    return _aes_decrypt(blob, _DATA_KEY)


def encrypt_json(obj: dict | list) -> bytes:
    """Convenience: JSON-encode then encrypt."""
    import json
    return encrypt(json.dumps(obj, separators=(",", ":")).encode("utf-8"))


def decrypt_json(blob: bytes) -> dict | list:
    """Convenience: decrypt then JSON-decode."""
    import json
    return json.loads(decrypt(blob).decode("utf-8"))


def rotate_data_key(master_secret: str) -> None:
    """
    Generate a new DATA_KEY and re-encrypt all known encrypted files.
    Call this periodically or after a suspected compromise.
    """
    global _DATA_KEY

    new_data_key = get_random_bytes(32)
    known_files = list(Path(".").glob("*.enc")) + list(Path("sessions").glob("**/*.enc"))

    re_encrypted = {}
    for f in known_files:
        if f == DATA_KEY_FILE:
            continue
        try:
            plaintext = decrypt(f.read_bytes())
            re_encrypted[f] = encrypt_with_key(plaintext, new_data_key)
        except Exception as e:
            log.warning("Could not re-encrypt %s: %s", f, e)

    # Write all re-encrypted files (atomic via temp files)
    for f, blob in re_encrypted.items():
        tmp = f.with_suffix(".tmp")
        tmp.write_bytes(blob)
        tmp.rename(f)

    # Wrap new DATA_KEY and update key file
    device_salt = DEVICE_SALT_FILE.read_bytes()
    kek = _derive_kek(master_secret, device_salt)
    wrapped = _aes_encrypt(new_data_key, kek)
    DATA_KEY_FILE.write_bytes(wrapped)

    _DATA_KEY = new_data_key
    log.info("DATA_KEY rotated; %d files re-encrypted", len(re_encrypted))


def encrypt_with_key(plaintext: bytes, key: bytes) -> bytes:
    """Used only during key rotation."""
    return _aes_encrypt(plaintext, key)
