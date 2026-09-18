import asyncio
import io
from fastapi import UploadFile
from fastapi.exceptions import HTTPException
from app.utils.security import sanitize_filename, safe_read_file, validate_pdf_content, validate_image_content

def test_sanitize_filename():
    assert sanitize_filename("normal.pdf") == "normal.pdf"
    assert sanitize_filename("../../../etc/passwd") == "passwd"
    assert sanitize_filename("<script>alert(1)</script>.pdf") == "script_.pdf"
    assert sanitize_filename("file with spaces.jpg") == "file_with_spaces.jpg"
    assert sanitize_filename("\0hidden.pdf") == "hidden.pdf"
    assert sanitize_filename("") == "unnamed_file"

def test_safe_read_file():
    # Test valid size
    class MockInnerFile:
        def read(self, limit=-1):
            return b"A" * 100
    
    class MockFile:
        def __init__(self):
            self.file = MockInnerFile()
            
    contents = safe_read_file(MockFile(), 200)
    assert len(contents) == 100
    
    # Test oversize
    class OversizeInnerFile:
        def read(self, limit=-1):
            return b"A" * 300
            
    class OversizeMockFile:
        def __init__(self):
            self.file = OversizeInnerFile()
            
    try:
        safe_read_file(OversizeMockFile(), 200)
        assert False, "Should have raised HTTPException"
    except HTTPException as e:
        assert e.status_code == 413

def test_validate_pdf():
    assert validate_pdf_content(b"%PDF-1.4\n...") == True
    try:
        validate_pdf_content(b"MZ\x90\x00...")
        assert False, "Should have raised HTTPException"
    except HTTPException:
        pass

def test_validate_image():
    assert validate_image_content(b"\xff\xd8\xff\xe0") == True  # JPEG
    assert validate_image_content(b"\x89PNG\r\n\x1a\n") == True  # PNG
    assert validate_image_content(b"GIF89a") == True  # GIF
    assert validate_image_content(b"RIFF\x00\x00\x00\x00WEBP") == True  # WEBP
    
    try:
        validate_image_content(b"%PDF-1.4")
        assert False, "Should have raised HTTPException"
    except HTTPException:
        pass

if __name__ == "__main__":
    test_sanitize_filename()
    test_safe_read_file()
    test_validate_pdf()
    test_validate_image()
    print("Upload security tests passed!")
