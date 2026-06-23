"""
Per-family AES-256-GCM encryption.

Key hierarchy:
  Server-wrap path (v1, all families):
    server_wrap_key = HKDF(SERVER_KEY, salt=family_salt,
                           context=b"bede-server-wrap-v1:" + family_id.encode())
    wrapped_DATA_KEY = AES-256-GCM(DATA_KEY, server_wrap_key)  stored in family_keys

  PRF path (Phase 2, parent passkeys with prf extension):
    client_wrap_key = HKDF(prf_output, salt=family_salt, context=b"bede-prf-wrap-v1")
    wrapped_DATA_KEY = AES-256-GCM(DATA_KEY, client_wrap_key)  stored in family_keys

  Recovery path:
    recovery_kek = PBKDF2(code, salt=family_id_bytes, count=300_000, dkLen=32)
    wrapped_DATA_KEY = AES-256-GCM(DATA_KEY, recovery_kek)  stored in family_keys
"""

import hashlib
import hmac
import json
import secrets
import struct
from typing import Optional

from Crypto.Cipher import AES
from Crypto.Hash import HMAC as CryptoHMAC
from Crypto.Hash import SHA256
from Crypto.Protocol.KDF import HKDF, PBKDF2
from Crypto.Random import get_random_bytes

_MAGIC = b"SAGE"
_VERSION = 1
_HEADER_SIZE = 4 + 1 + 16 + 16

_SERVER_KEY: Optional[bytes] = None


def init_server_key(hex_key: str) -> None:
    global _SERVER_KEY
    _SERVER_KEY = bytes.fromhex(hex_key)


def _aes_encrypt(plaintext: bytes, key: bytes) -> bytes:
    nonce = get_random_bytes(16)
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=16)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)
    return _MAGIC + struct.pack("B", _VERSION) + nonce + tag + ciphertext


def _aes_decrypt(blob: bytes, key: bytes) -> bytes:
    if len(blob) < _HEADER_SIZE + 1:
        raise ValueError("Encrypted blob too short")
    if blob[:4] != _MAGIC:
        raise ValueError("Bad magic — not a SAGE-encrypted value")
    version = struct.unpack("B", blob[4:5])[0]
    if version != _VERSION:
        raise ValueError(f"Unsupported encryption version {version}")
    nonce = blob[5:21]
    tag = blob[21:37]
    ciphertext = blob[37:]
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=16)
    return cipher.decrypt_and_verify(ciphertext, tag)


def derive_server_wrap_key(family_id: str, family_salt: bytes) -> bytes:
    if _SERVER_KEY is None:
        raise RuntimeError("SERVER_KEY not initialised — call init_server_key() at startup")
    return HKDF(
        master=_SERVER_KEY,
        key_len=32,
        salt=family_salt,
        hashmod=SHA256,
        context=b"bede-server-wrap-v1:" + family_id.encode(),
    )


def wrap_data_key(data_key: bytes, wrap_key: bytes) -> bytes:
    return _aes_encrypt(data_key, wrap_key)


def unwrap_data_key(wrapped: bytes, wrap_key: bytes) -> bytes:
    return _aes_decrypt(wrapped, wrap_key)


def generate_data_key() -> bytes:
    return get_random_bytes(32)


def new_prf_input() -> bytes:
    return get_random_bytes(32)


def new_family_salt() -> bytes:
    return get_random_bytes(32)


def encrypt(plaintext: bytes, data_key: bytes) -> bytes:
    return _aes_encrypt(plaintext, data_key)


def decrypt(blob: bytes, data_key: bytes) -> bytes:
    return _aes_decrypt(blob, data_key)


def encrypt_json(obj: dict | list, data_key: bytes) -> bytes:
    return encrypt(json.dumps(obj, separators=(",", ":")).encode("utf-8"), data_key)


def decrypt_json(blob: bytes, data_key: bytes) -> dict | list:
    return json.loads(decrypt(blob, data_key).decode("utf-8"))


def hash_recovery_code(code: str, family_id: str) -> bytes:
    return hmac.new(family_id.encode(), code.encode(), hashlib.sha256).digest()


def derive_recovery_kek(code: str, family_id_bytes: bytes) -> bytes:
    return PBKDF2(
        code.encode(),
        family_id_bytes,
        dkLen=32,
        count=300_000,
        prf=lambda p, s: CryptoHMAC.new(p, s, SHA256).digest(),
    )


def generate_recovery_codes(count: int = 8) -> list[str]:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    codes = []
    for _ in range(count):
        chars = [secrets.choice(alphabet) for _ in range(20)]
        code = f"{''.join(chars[0:5])}-{''.join(chars[5:10])}-{''.join(chars[10:15])}-{''.join(chars[15:20])}"
        codes.append(code)
    return codes
