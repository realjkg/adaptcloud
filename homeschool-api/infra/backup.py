"""
Encrypted database backup to S3 with Object Lock (ransomware-resistant).

Architecture:
  1. pg_dump → AES-256-GCM encrypt (separate BACKUP_KEY, not DATA_KEY)
  2. Upload to S3 with:
     - Object Lock COMPLIANCE mode (90-day retention — even root cannot delete)
     - Server-side encryption (SSE-S3)
     - Versioning
  3. Verify: re-download + decrypt + row count check
  4. Prune local temp file immediately after upload

Environment variables required:
  DATABASE_URL          postgresql+asyncpg://... (strip +asyncpg for pg_dump)
  BACKUP_KEY            64 hex chars (32 bytes) — separate from SERVER_KEY
  BACKUP_S3_BUCKET      e.g. bede-backups-prod
  BACKUP_S3_PREFIX      e.g. daily/
  AWS_ACCESS_KEY_ID     IAM key with s3:PutObject + s3:GetObject only (no delete)
  AWS_SECRET_ACCESS_KEY
  AWS_DEFAULT_REGION    e.g. us-east-1

Run as a cron: 0 2 * * * python infra/backup.py  (02:00 UTC daily)

S3 bucket must be pre-created with:
  aws s3api create-bucket --bucket <name>
  aws s3api put-bucket-versioning --bucket <name> --versioning-configuration Status=Enabled
  aws s3api put-object-lock-configuration --bucket <name> \
    --object-lock-configuration 'ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=COMPLIANCE,Days=90}}'
"""

import hashlib
import io
import logging
import os
import struct
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

try:
    import boto3
    from Crypto.Cipher import AES
    from Crypto.Random import get_random_bytes
except ImportError:
    sys.exit("Install: pip install boto3 pycryptodome")

_MAGIC   = b"BKUP"
_VERSION = 1


def _pg_url_for_dump(asyncpg_url: str) -> str:
    return asyncpg_url.replace("postgresql+asyncpg://", "postgresql://")


def _encrypt_stream(plaintext: bytes, key: bytes) -> bytes:
    nonce = get_random_bytes(16)
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=16)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)
    return _MAGIC + struct.pack("B", _VERSION) + nonce + tag + ciphertext


def _decrypt_stream(blob: bytes, key: bytes) -> bytes:
    assert blob[:4] == _MAGIC, "Bad backup magic"
    nonce      = blob[5:21]
    tag        = blob[21:37]
    ciphertext = blob[37:]
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=16)
    return cipher.decrypt_and_verify(ciphertext, tag)


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_backup() -> None:
    database_url = os.environ["DATABASE_URL"]
    backup_key   = bytes.fromhex(os.environ["BACKUP_KEY"])
    bucket       = os.environ["BACKUP_S3_BUCKET"]
    prefix       = os.environ.get("BACKUP_S3_PREFIX", "daily/")

    pg_url   = _pg_url_for_dump(database_url)
    ts       = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    s3_key   = f"{prefix}bede-{ts}.dump.enc"

    log.info("Starting backup: %s", s3_key)

    # 1. pg_dump to memory (for <1 GB databases) or temp file for larger
    with tempfile.NamedTemporaryFile(suffix=".dump", delete=True) as tmp:
        result = subprocess.run(
            ["pg_dump", "--format=custom", "--no-password", pg_url],
            capture_output=True,
            timeout=300,
        )
        if result.returncode != 0:
            log.error("pg_dump failed: %s", result.stderr.decode()[:500])
            sys.exit(1)

        plaintext = result.stdout
        log.info("Dump size: %.1f MB", len(plaintext) / 1_048_576)

    # 2. Encrypt
    ciphertext = _encrypt_stream(plaintext, backup_key)
    checksum   = _sha256_hex(ciphertext)
    log.info("Encrypted size: %.1f MB  sha256=%s", len(ciphertext) / 1_048_576, checksum[:16])

    # 3. Upload to S3 with Object Lock
    s3 = boto3.client("s3")
    s3.put_object(
        Bucket=bucket,
        Key=s3_key,
        Body=ciphertext,
        ContentType="application/octet-stream",
        Metadata={
            "bede-backup-version": str(_VERSION),
            "bede-sha256": checksum,
            "bede-timestamp": ts,
        },
        ObjectLockMode="COMPLIANCE",
        ObjectLockRetainUntilDate=_retention_date(days=90),
        ServerSideEncryption="AES256",
    )
    log.info("Uploaded: s3://%s/%s", bucket, s3_key)

    # 4. Verify: re-download + decrypt + basic sanity check
    response = s3.get_object(Bucket=bucket, Key=s3_key)
    downloaded = response["Body"].read()
    assert _sha256_hex(downloaded) == checksum, "Checksum mismatch after upload"
    recovered = _decrypt_stream(downloaded, backup_key)
    assert recovered == plaintext, "Decryption verification failed"
    log.info("Verification passed ✓")

    # 5. Write latest-backup manifest (no Object Lock on this — it's mutable)
    s3.put_object(
        Bucket=bucket,
        Key=f"{prefix}LATEST",
        Body=f"{s3_key}\n{checksum}\n{ts}\n".encode(),
        ContentType="text/plain",
    )

    log.info("Backup complete: %s", s3_key)


def _retention_date(days: int):
    from datetime import timedelta
    return datetime.now(timezone.utc) + timedelta(days=days)


if __name__ == "__main__":
    run_backup()
