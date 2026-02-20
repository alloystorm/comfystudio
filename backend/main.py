import json
import asyncio
from typing import List, Dict, Any
from typing import List, Dict, Any
from fastapi import FastAPI, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from pydantic import BaseModel
import websockets

from models import Project, GenerationNode, GenerationParams, GenerateRequest, AvailableModels, TemplateList
import projects
import comfyui
import templates
import workflows

app = FastAPI(title="ComfyStudio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/models", response_model=AvailableModels)
async def get_models():
    models = comfyui.get_available_models()
    return AvailableModels(
        checkpoints=models.get("checkpoints", []), 
        unets=models.get("unets", []),
        loras=models.get("loras", [])
    )

@app.get("/api/templates", response_model=TemplateList)
async def list_templates():
    return templates.get_templates()

@app.post("/api/templates", response_model=TemplateList)
async def update_templates(params: TemplateList):
    templates.save_templates(params)
    return params

@app.get("/api/workflows")
async def list_workflows():
    return workflows.get_workflows()

@app.post("/api/workflows/{name}")
async def update_workflow(name: str, req: Request):
    from models import WorkflowConfig
    body = await req.json()
    config = WorkflowConfig.model_validate(body)
    workflows.save_workflow(name, config)
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
    wf_name = node.params.workflow
    registry = workflows.get_workflows()
    
    if wf_name not in registry:
        print(f"Workflow {wf_name} not found in registry")
        return
        
    wf_info = registry[wf_name]
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
        
    if m.get("lora") in workflow:
        lora_node_id = m["lora"]
        lora_node = workflow.get(lora_node_id)
        
        if lora_node:
            if node.params.bypass_lora or not node.params.lora:
                # Bypass: Find upstream model and clip connected to this LoraLoader
                upstream_model = lora_node["inputs"].get("model")
                upstream_clip = lora_node["inputs"].get("clip")
                
                # Re-route all downstream nodes that point to this LoraLoader
                for n_id, n_data in workflow.items():
                    if n_id == lora_node_id: continue
                    inputs = n_data.get("inputs", {})
                    for k, v in inputs.items():
                        if isinstance(v, list) and len(v) == 2 and v[0] == lora_node_id:
                            # Re-route based on the expected output type (0 for model, 1 for clip)
                            output_idx = v[1]
                            if output_idx == 0 and upstream_model:
                                inputs[k] = upstream_model
                            elif output_idx == 1 and upstream_clip:
                                inputs[k] = upstream_clip
                                
                # Remove the LoraLoader node from the workflow
                del workflow[lora_node_id]
            else:
                # Enable LoRA
                if "lora_field" in m:
                    lora_node["inputs"][m["lora_field"]] = node.params.lora
                # Ensure it remains connected as defined in the template
            
    if m.get("latent") in workflow:
        workflow[m["latent"]]["inputs"]["width"] = node.params.width
        workflow[m["latent"]]["inputs"]["height"] = node.params.height
    
    # Queue prompt
    prompt_id = comfyui.queue_prompt(workflow)
    if not prompt_id:
        node.status = "error"
        node.error = "Failed to queue prompt to ComfyUI."
        projects.add_node_to_project(project_id, node)
        return
        
    async def progress_callback(data):
        val = data.get('value', 0)
        m = data.get('max', 1)
        node.progress = val / m if m > 0 else 0
        projects.add_node_to_project(project_id, node)

    # Check if already completed (cached) before waiting on websocket
    history = comfyui.get_history(prompt_id)
    if prompt_id not in history:
        # Wait for completion
        success = await comfyui.listen_for_progress(prompt_id, callback=progress_callback, timeout=600)
        
        if not success:
            node.status = "error"
            node.error = "Generation timed out or connection lost."
            projects.add_node_to_project(project_id, node)
            return
        
        # Re-fetch history after completion
        history = comfyui.get_history(prompt_id)
    
    # Get history and save image
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
                    node.status = "completed"
                    node.progress = 1.0
                    projects.add_node_to_project(project_id, node)
                else:
                    node.status = "error"
                    node.error = "Failed to fetch image from ComfyUI."
                    projects.add_node_to_project(project_id, node)
        else:
            node.status = "error"
            node.error = "Completed but no image was found in output."
            projects.add_node_to_project(project_id, node)
    else:
        node.status = "error"
        node.error = "Prompt ID not found in history."
        projects.add_node_to_project(project_id, node)

@app.post("/api/generate", response_model=GenerationNode)
async def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    node = GenerationNode(
        parent_id=req.parent_node_id,
        params=req.params,
        status="generating",
        progress=0.0
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
