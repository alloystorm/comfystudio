import json
import asyncio
from typing import List, Dict, Any
from fastapi import FastAPI, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from pydantic import BaseModel
import websockets

from models import Project, GenerationNode, GenerationParams, GenerateRequest
import projects
import comfyui

app = FastAPI(title="ComfyStudio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

with open(Path(__file__).parent / "default_workflow.json", "r") as f:
    DEFAULT_WORKFLOW = json.load(f)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/projects", response_model=List[Project])
async def list_projects():
    return projects.get_all_projects()

@app.post("/api/projects", response_model=Project)
async def create_project(req: Dict[str, str]):
    name = req.get("name", "New Project")
    return projects.create_project(name)

@app.get("/api/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    p = projects.load_project(project_id)
    if not p:
        return {"error": "Project not found"}
    return p

async def run_generation(project_id: str, node: GenerationNode):
    # Prepare workflow
    workflow = DEFAULT_WORKFLOW.copy()
    
    # Inject params
    # 3: KSampler, 6: Positive Prompt, 7: Negative Prompt, 4: Checkpoint, 5: Empty Latent Image
    workflow["3"]["inputs"]["seed"] = node.params.seed
    workflow["3"]["inputs"]["steps"] = node.params.steps
    workflow["3"]["inputs"]["cfg"] = node.params.cfg
    
    workflow["6"]["inputs"]["text"] = node.params.prompt
    workflow["7"]["inputs"]["text"] = node.params.negative_prompt
    
    workflow["4"]["inputs"]["ckpt_name"] = node.params.model
    workflow["5"]["inputs"]["width"] = node.params.width
    workflow["5"]["inputs"]["height"] = node.params.height
    
    # Queue prompt
    prompt_id = comfyui.queue_prompt(workflow)
    if not prompt_id:
        print("Failed to queue prompt")
        return
        
    # Wait for completion
    await comfyui.listen_for_progress(prompt_id)
    
    # Get history and save image
    history = comfyui.get_history(prompt_id)
    if prompt_id in history:
        # Assuming SaveImage is node 9
        outputs = history[prompt_id].get("outputs", {})
        if "9" in outputs and "images" in outputs["9"]:
            image_info = outputs["9"]["images"][0]
            filename = image_info["filename"]
            subfolder = image_info["subfolder"]
            folder_type = image_info["type"]
            
            image_bytes = comfyui.get_image(filename, subfolder, folder_type)
            if image_bytes:
                # Save to project folder
                p_dir = projects.get_project_dir(project_id)
                image_dest = p_dir / f"{node.id}.png"
                with open(image_dest, "wb") as f:
                    f.write(image_bytes)
                
                # Update node
                node.image_filename = f"{node.id}.png"
                projects.add_node_to_project(project_id, node)

@app.post("/api/generate", response_model=GenerationNode)
async def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    node = GenerationNode(
        parent_id=req.parent_node_id,
        params=req.params
    )
    # Add optimistic node
    projects.add_node_to_project(req.project_id, node)
    
    # Run generation in background
    background_tasks.add_task(run_generation, req.project_id, node)
    
    return node

@app.get("/api/projects/{project_id}/images/{filename}")
async def get_project_image(project_id: str, filename: str):
    from fastapi.responses import FileResponse
    p_dir = projects.get_project_dir(project_id)
    image_path = p_dir / filename
    if image_path.exists():
        return FileResponse(image_path)
    return {"error": "Image not found"}

# Mount the frontend directory to serve static files
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    projects.init_projects_dir()
    uvicorn.run(app, host="127.0.0.1", port=8000)
