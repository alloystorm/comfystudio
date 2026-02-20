import json
import os
from pathlib import Path
from models import TemplateList

PROJECTS_DIR = Path(__file__).parent.parent / "Projects"
TEMPLATES_FILE = PROJECTS_DIR / "templates.json"

def init_templates_file():
    os.makedirs(PROJECTS_DIR, exist_ok=True)
    if not TEMPLATES_FILE.exists():
        default_templates = TemplateList()
        with open(TEMPLATES_FILE, "w") as f:
            f.write(default_templates.model_dump_json(indent=2))

def get_templates() -> TemplateList:
    init_templates_file()
    with open(TEMPLATES_FILE, "r") as f:
        return TemplateList.model_validate_json(f.read())

def save_templates(templates: TemplateList):
    init_templates_file()
    with open(TEMPLATES_FILE, "w") as f:
        f.write(templates.model_dump_json(indent=2))
