import json
import os
from pathlib import Path
from models import Project, GenerationNode, GenerationParams

PROJECTS_DIR = Path(__file__).parent.parent / "Projects"

def init_projects_dir():
    os.makedirs(PROJECTS_DIR, exist_ok=True)

def get_project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id

def save_project(project: Project):
    p_dir = get_project_dir(project.id)
    os.makedirs(p_dir, exist_ok=True)
    with open(p_dir / "project.json", "w") as f:
        f.write(project.model_dump_json(indent=2))

def load_project(project_id: str) -> Project:
    p_dir = get_project_dir(project_id)
    p_file = p_dir / "project.json"
    if p_file.exists():
        with open(p_file, "r") as f:
            return Project.model_validate_json(f.read())
    return None

def get_all_projects():
    init_projects_dir()
    projects = []
    for d in os.listdir(PROJECTS_DIR):
        p_dir = PROJECTS_DIR / d
        if p_dir.is_dir() and (p_dir / "project.json").exists():
            projects.append(load_project(d))
    # Sort by updated_at descending
    projects.sort(key=lambda x: x.updated_at, reverse=True)
    return projects

def create_project(name: str = "New Project") -> Project:
    init_projects_dir()
    p = Project(name=name)
    save_project(p)
    return p

def add_node_to_project(project_id: str, node: GenerationNode):
    p = load_project(project_id)
    if p:
        p.nodes[node.id] = node
        p.updated_at = node.timestamp
        save_project(p)
        return True
    return False
