from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

class GenerationParams(BaseModel):
    workflow: str = "t2i_sdxl"
    prompt: str
    negative_prompt: str = ""
    model: str = ""
    seed: int
    steps: int = 20
    cfg: float = 8.0
    width: int = 1024
    height: int = 1024
    aspect_ratio: str = "1:1"
    orientation: str = "Landscape"

class AvailableModels(BaseModel):
    checkpoints: List[str] = []
    unets: List[str] = []

class GenerationNode(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    parent_id: Optional[str] = None
    params: GenerationParams
    image_filename: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "New Project"
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    nodes: Dict[str, GenerationNode] = {}
    
class GenerateRequest(BaseModel):
    project_id: str
    parent_node_id: Optional[str] = None
    params: GenerationParams
