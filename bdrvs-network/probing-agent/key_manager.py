# =============================================================================
# B-DRVS Probing Agent — Key Manager
# Handles ECDSA P-256 key pair generation, loading, and payload signing.
# =============================================================================

import os
import base64
import logging
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend


logger = logging.getLogger(__name__)


def generate_key_pair(private_key_path: str, public_key_path: str) -> None:
    """
    Generates a new ECDSA P-256 key pair and saves both keys as PEM files.
    Called once on first run. Keys are stored locally on the health server.

    The private key never leaves the server — only the public key is
    registered on the blockchain via RegisterServer().
    """
    os.makedirs(os.path.dirname(private_key_path), exist_ok=True)

    logger.info("Generating new ECDSA P-256 key pair...")

    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    # Serialize private key — no encryption for prototype simplicity.
    # In production, encrypt with a passphrase or use a hardware TPM.
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    with open(private_key_path, "wb") as f:
        f.write(private_pem)
    os.chmod(private_key_path, 0o600)  # owner read-only

    with open(public_key_path, "wb") as f:
        f.write(public_pem)

    logger.info(f"Key pair saved to {os.path.dirname(private_key_path)}/")


def load_private_key(private_key_path: str):
    """Loads the ECDSA private key from PEM file."""
    with open(private_key_path, "rb") as f:
        private_key = serialization.load_pem_private_key(
            f.read(),
            password=None,
            backend=default_backend()
        )
    return private_key


def load_public_key_pem(public_key_path: str) -> str:
    """Returns the public key as a PEM string for blockchain registration."""
    with open(public_key_path, "r") as f:
        return f.read()


def sign_payload(private_key, canonical_str: str) -> str:
    """
    Signs the canonical payload string with ECDSA P-256 / SHA-256.

    The canonical string format (must match Go chaincode exactly):
        "<serverID>|<publicIP>|<rttMs:.4f>|<timestamp>"

    Example:
        "LHIMS-KORLE-BU-01|41.57.10.5|12.3456|2026-05-12T12:00:00Z"

    Returns:
        Base64-encoded DER signature string.

    The Go smart contract verifies this signature using crypto/ecdsa
    with the same SHA-256 hash of the canonical string.
    """
    message_bytes = canonical_str.encode("utf-8")

    # Sign — Python's cryptography library produces DER-encoded (r,s) by default
    signature_der = private_key.sign(
        message_bytes,
        ec.ECDSA(hashes.SHA256())
    )

    # Encode to base64 for JSON transmission
    signature_b64 = base64.b64encode(signature_der).decode("utf-8")

    logger.debug(f"Payload signed. Signature length: {len(signature_der)} bytes (DER)")
    return signature_b64


def keys_exist(private_key_path: str, public_key_path: str) -> bool:
    """Returns True if both key files already exist."""
    return os.path.exists(private_key_path) and os.path.exists(public_key_path)
