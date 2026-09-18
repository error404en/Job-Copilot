import socket
import urllib.parse
import ipaddress
from fastapi import HTTPException

def validate_safe_url(url: str) -> bool:
    """
    Validates a URL to prevent Server-Side Request Forgery (SSRF).
    Blocks private IP ranges (loopback, RFC 1918) and cloud metadata services.
    Raises an HTTPException if the URL is unsafe, returns True otherwise.
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL is empty")

    try:
        parsed_url = urllib.parse.urlparse(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid URL format")

    if parsed_url.scheme not in ["http", "https"]:
        raise HTTPException(status_code=400, detail="Only HTTP and HTTPS are allowed")

    hostname = parsed_url.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid hostname")

    try:
        # Resolve to IP to prevent DNS rebinding or obfuscated IPs
        ip_addr = socket.gethostbyname(hostname)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Could not resolve hostname")

    try:
        ip = ipaddress.ip_address(ip_addr)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP address format")

    # Block Private/Reserved/Loopback ranges
    if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_multicast:
        raise HTTPException(status_code=403, detail="Access to private or internal networks is forbidden")

    # Explicitly block AWS metadata IP (169.254.169.254)
    if ip.is_link_local:
        raise HTTPException(status_code=403, detail="Access to metadata services is forbidden")

    return True

import re
import os

def sanitize_filename(filename: str) -> str:
    """
    Sanitizes a filename to prevent path traversal and XSS.
    Keeps only alphanumeric characters, dots, dashes, and underscores.
    """
    if not filename:
        return "unnamed_file"
    # Get the basename to strip any path components
    filename = os.path.basename(filename)
    # Strip null bytes
    filename = filename.replace("\0", "")
    # Keep only safe characters
    filename = re.sub(r'[^a-zA-Z0-9.\-_]', '_', filename)
    # Ensure it's not empty after stripping
    if not filename.strip('_.'):
        return "unnamed_file"
    # Limit length
    return filename[:100]

def safe_read_file(file, max_size_bytes: int) -> bytes:
    """
    Reads a file up to max_size_bytes + 1.
    If the file exceeds max_size_bytes, raises an HTTPException (DoS prevention).
    Returns the file bytes.
    """
    contents = file.file.read(max_size_bytes + 1)
    if len(contents) > max_size_bytes:
        raise HTTPException(
            status_code=413, 
            detail=f"File too large. Maximum allowed size is {max_size_bytes // (1024 * 1024)}MB."
        )
    return contents

def validate_pdf_content(file_bytes: bytes) -> bool:
    """
    Validates that the file bytes start with the PDF magic number '%PDF-'.
    Prevents MIME-type spoofing (e.g., uploading an .exe renamed to .pdf).
    """
    if not file_bytes.startswith(b'%PDF-'):
        raise HTTPException(status_code=400, detail="Invalid PDF file format. The file does not appear to be a valid PDF.")
    return True

def validate_image_content(file_bytes: bytes) -> bool:
    """
    Validates that the file bytes match known image magic numbers (JPEG, PNG, GIF, WEBP).
    """
    # JPEG: FF D8 FF
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    # GIF: 47 49 46 38
    # WEBP: RIFF .... WEBP
    
    if file_bytes.startswith(b'\xff\xd8\xff'):
        return True
    if file_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        return True
    if file_bytes.startswith(b'GIF8'):
        return True
    if file_bytes.startswith(b'RIFF') and b'WEBP' in file_bytes[8:12]:
        return True
        
    raise HTTPException(status_code=400, detail="Invalid image file format. Only JPEG, PNG, GIF, and WEBP are supported.")
