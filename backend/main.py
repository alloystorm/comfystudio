import json
import asyncio
from typing import List, Dict, Any
from fastapi import FastAPI, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from pydantic import BaseModel
import websockets

from models import Project, GenerationNode, GenerationParams, GenerateRequest, AvailableModels
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

WORKFLOWS_DIR = Path(__file__).parent.parent / "references" / "workflow"
WORKFLOW_REGISTRY = {}

def load_workflows():
    try:
        if (WORKFLOWS_DIR / "t2i_sdxl.json").exists():
            with open(WORKFLOWS_DIR / "t2i_sdxl.json", "r") as f:
                WORKFLOW_REGISTRY["t2i_sdxl"] = {"data": json.load(f), "map": {
                    "sampler": "24", "positive_prompt": "6", "negative_prompt": "7", 
                    "model": "4", "model_field": "ckpt_name", "latent": "5", "save": "27"
                }}
        if (WORKFLOWS_DIR / "t2i_ZIT.json").exists():
            with open(WORKFLOWS_DIR / "t2i_ZIT.json", "r") as f:
                WORKFLOW_REGISTRY["t2i_ZIT"] = {"data": json.load(f), "map": {
                    "sampler": "3", "positive_prompt": "6", "negative_prompt": "7", 
                    "model": "16", "model_field": "unet_name", "latent": "13", "save": "9"
                }}
        if (WORKFLOWS_DIR / "i2v_wan22.json").exists():
            with open(WORKFLOWS_DIR / "i2v_wan22.json", "r") as f:
                WORKFLOW_REGISTRY["i2v_wan22"] = {"data": json.load(f), "map": {
                    "sampler": "85", "positive_prompt": "93", "negative_prompt": "89", 
                    "model": "95", "model_field": "unet_name", "latent": "98", "save": "108"
                }}
    except Exception as e:
        print("Error loading workflows:", e)

load_workflows()

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/models", response_model=AvailableModels)
async def get_models():
    models = comfyui.get_available_models()
    return AvailableModels(checkpoints=models["checkpoints"], unets=models["unets"])

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
    wf_name = node.params.workflow
    if wf_name not in WORKFLOW_REGISTRY:
        print(f"Workflow {wf_name} not found in registry")
        return
        
    wf_info = WORKFLOW_REGISTRY[wf_name]
    workflow = json.loads(json.dumps(wf_info["data"])) # deep copy
    m = wf_info["map"]
    
    # Inject params
    if m.get("sampler") in workflow:
        workflow[m["sampler"]]["inputs"]["seed"] = node.params.seed
        workflow[m["sampler"]]["inputs"]["steps"] = node.params.steps
        workflow[m["sampler"]]["inputs"]["cfg"] = node.params.cfg
    
    if m.get("positive_prompt") in workflow:
        workflow[m["positive_prompt"]]["inputs"]["text"] = node.params.prompt
        
    if m.get("negative_prompt") in workflow:
        workflow[m["negative_prompt"]]["inputs"]["text"] = node.params.negative_prompt
        
    if m.get("model") in workflow and node.params.model:
        workflow[m["model"]]["inputs"][m["model_field"]] = node.params.model
        
    if m.get("latent") in workflow:
        workflow[m["latent"]]["inputs"]["width"] = node.params.width
        workflow[m["latent"]]["inputs"]["height"] = node.params.height
    
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
        save_node_id = m.get("save")
        outputs = history[prompt_id].get("outputs", {})
        if save_node_id in outputs and ("images" in outputs[save_node_id] or "gifs" in outputs[save_node_id]):
            # i2v_wan22 saves as video/gif which is actually in 'gifs' or 'images' depending on format
            media_list = outputs[save_node_id].get("images", outputs[save_node_id].get("gifs", []))
            if media_list:
                image_info = media_list[0]
                filename = image_info["filename"]
                subfolder = image_info["subfolder"]
                folder_type = image_info["type"]
                
                image_bytes = comfyui.get_image(filename, subfolder, folder_type)
                if image_bytes:
                    ext = ".png" if filename.endswith(".png") else ".mp4"
                    # Save to project folder
                    p_dir = projects.get_project_dir(project_id)
                    image_dest = p_dir / f"{node.id}{ext}"
                    with open(image_dest, "wb") as f:
                        f.write(image_bytes)
                    
                    # Update node
                    node.image_filename = f"{node.id}{ext}"
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
