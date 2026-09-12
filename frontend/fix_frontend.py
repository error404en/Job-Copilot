import os
import re

APP_DIR = "app"

for root, _, files in os.walk(APP_DIR):
    for file in files:
        if file.endswith(".tsx"):
            filepath = os.path.join(root, file)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Check if it has a fetch('/api/ or fetch(`/api/ call
            if "fetch('/api/" in content or "fetch(`/api/" in content:
                # Add import if not present
                if "import { apiClient }" not in content:
                    # Find the last import
                    lines = content.split('\n')
                    last_import_idx = -1
                    for i, line in enumerate(lines):
                        if line.startswith("import "):
                            last_import_idx = i
                            
                    import_statement = "import { apiClient } from '@/lib/apiClient'"
                    if last_import_idx != -1:
                        lines.insert(last_import_idx + 1, import_statement)
                    else:
                        lines.insert(0, import_statement)
                        
                    content = '\n'.join(lines)
                
                # Replace fetch calls
                content = content.replace("fetch('/api/", "apiClient.fetch('/api/")
                content = content.replace("fetch(`/api/", "apiClient.fetch(`/api/")
                
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"Updated {filepath}")
