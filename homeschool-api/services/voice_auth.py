"""
Speaker verification for student identity checks.

Two-tier approach:
  1. resemblyzer (GE2E-trained 256-dim embeddings) if available → more accurate
  2. librosa MFCC + cosine similarity fallback → reliable, no model download

Confidence thresholds (tuned for a single-child home environment):
  ≥ 0.82  → HIGH    (auto-pass)
  0.68–0.82 → MEDIUM (parent can override)
  < 0.68  → LOW     (deny, retry)
"""
import io
import json
import logging
import os
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

# ── Try resemblyzer; fall back to MFCC ─────────────────────────────────────
_encoder = None
_USE_RESEMBLYZER = False

try:
    from resemblyzer import VoiceEncoder, preprocess_wav as _rz_preprocess  # type: ignore

    _encoder = VoiceEncoder()
    _USE_RESEMBLYZER = True
    logger.info("Voice auth: using resemblyzer (GE2E model)")
except Exception:
    logger.info("Voice auth: resemblyzer unavailable, using librosa MFCC fallback")

# ── Profile storage ──────────────────────────────────────────────────────────
PROFILES_PATH = Path(os.environ.get("VOICE_PROFILES_PATH", "voice_profiles.json"))
THRESHOLD_HIGH = 0.82
THRESHOLD_MEDIUM = 0.68


def _load_profiles() -> dict:
    if PROFILES_PATH.exists():
        with open(PROFILES_PATH) as f:
            return json.load(f)
    return {}


def _save_profiles(profiles: dict) -> None:
    with open(PROFILES_PATH, "w") as f:
        json.dump(profiles, f, indent=2)


# ── Audio loading ────────────────────────────────────────────────────────────

def _load_wav(audio_bytes: bytes, target_sr: int = 16000) -> np.ndarray:
    """Read audio bytes → mono float32 numpy array at target_sr."""
    buf = io.BytesIO(audio_bytes)
    data, sr = sf.read(buf, dtype="float32", always_2d=False)

    # Mix stereo → mono
    if data.ndim > 1:
        data = data.mean(axis=1)

    # Resample if needed (simple linear, avoids scipy dependency issues)
    if sr != target_sr:
        try:
            from scipy.signal import resample_poly  # type: ignore
            from math import gcd

            g = gcd(target_sr, sr)
            data = resample_poly(data, target_sr // g, sr // g)
        except Exception:
            # Last-resort: numpy linear interpolation
            old_len = len(data)
            new_len = int(old_len * target_sr / sr)
            data = np.interp(
                np.linspace(0, old_len - 1, new_len),
                np.arange(old_len),
                data,
            ).astype(np.float32)

    return data.astype(np.float32)


# ── Feature extraction ───────────────────────────────────────────────────────

def _extract_embedding_resemblyzer(audio: np.ndarray) -> np.ndarray:
    embedding = _encoder.embed_utterance(audio)  # type: ignore
    return embedding


def _extract_embedding_mfcc(audio: np.ndarray, sr: int = 16000) -> np.ndarray:
    """MFCC + delta features, time-averaged → fixed-length vector."""
    import librosa  # type: ignore

    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20)
    delta = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)
    features = np.concatenate([mfcc, delta, delta2], axis=0)
    # Normalise per frame, then take mean
    features = (features - features.mean(axis=1, keepdims=True)) / (
        features.std(axis=1, keepdims=True) + 1e-9
    )
    return features.mean(axis=1)  # shape (60,)


def _extract_embedding(audio: np.ndarray) -> np.ndarray:
    if _USE_RESEMBLYZER:
        return _extract_embedding_resemblyzer(audio)
    return _extract_embedding_mfcc(audio)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


# ── Public API ───────────────────────────────────────────────────────────────

class ConfidenceLevel:
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


def enroll_student(student_name: str, audio_samples: list[bytes]) -> dict:
    """
    Create a voice profile from 2–5 audio samples.
    Averages embeddings for robustness across recording conditions.
    """
    if not audio_samples:
        raise ValueError("At least one audio sample is required")

    embeddings = []
    for idx, raw in enumerate(audio_samples):
        try:
            audio = _load_wav(raw)
            emb = _extract_embedding(audio)
            embeddings.append(emb)
        except Exception as e:
            logger.warning("Sample %d failed to process: %s", idx, e)

    if not embeddings:
        raise ValueError("No samples could be processed")

    mean_embedding = np.mean(embeddings, axis=0)
    # Normalise to unit sphere for stable cosine comparisons
    mean_embedding = mean_embedding / (np.linalg.norm(mean_embedding) + 1e-9)

    profiles = _load_profiles()
    profiles[student_name] = {
        "embedding": mean_embedding.tolist(),
        "num_samples": len(embeddings),
        "method": "resemblyzer" if _USE_RESEMBLYZER else "mfcc",
    }
    _save_profiles(profiles)

    return {
        "student_name": student_name,
        "samples_used": len(embeddings),
        "method": profiles[student_name]["method"],
    }


def verify_student(student_name: str, audio_bytes: bytes) -> dict:
    """
    Compare audio against stored profile.
    Returns score (0–1), level, and a pass/warn/fail decision.
    """
    profiles = _load_profiles()
    if student_name not in profiles:
        return {"verified": False, "score": 0.0, "level": ConfidenceLevel.LOW,
                "message": "No voice profile found — please ask a parent to enrol your voice first."}

    stored = np.array(profiles[student_name]["embedding"])

    try:
        audio = _load_wav(audio_bytes)
        embedding = _extract_embedding(audio)
        embedding = embedding / (np.linalg.norm(embedding) + 1e-9)
        score = _cosine_similarity(embedding, stored)
    except Exception as e:
        logger.error("Verification failed: %s", e)
        return {"verified": False, "score": 0.0, "level": ConfidenceLevel.LOW,
                "message": "Could not process audio — please try again."}

    if score >= THRESHOLD_HIGH:
        level = ConfidenceLevel.HIGH
        verified = True
        message = "Voice recognised! Welcome back."
    elif score >= THRESHOLD_MEDIUM:
        level = ConfidenceLevel.MEDIUM
        verified = False
        message = "Voice is a partial match — a parent can approve to continue."
    else:
        level = ConfidenceLevel.LOW
        verified = False
        message = "Voice not recognised — please try again or ask a parent."

    return {
        "verified": verified,
        "score": round(score, 4),
        "level": level,
        "message": message,
        "student_name": student_name,
    }


def list_profiles() -> list[str]:
    return list(_load_profiles().keys())


def delete_profile(student_name: str) -> bool:
    profiles = _load_profiles()
    if student_name in profiles:
        del profiles[student_name]
        _save_profiles(profiles)
        return True
    return False


def parent_override(student_name: str) -> dict:
    """Parent can approve a medium-confidence session without re-recording."""
    return {
        "verified": True,
        "score": None,
        "level": ConfidenceLevel.MEDIUM,
        "message": f"Parent approved session for {student_name}.",
        "parent_override": True,
    }
