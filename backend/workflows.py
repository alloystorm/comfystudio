import json
import os
from pathlib import Path
from models import WorkflowConfig, WorkflowConfigMap

WORKFLOWS_DIR = Path(__file__).parent.parent / "references" / "workflow"
WORKFLOW_REGISTRY = {}

def init_workflows_dir():
    os.makedirs(WORKFLOWS_DIR, exist_ok=True)

def load_workflows():
    init_workflows_dir()
    WORKFLOW_REGISTRY.clear()
    
    # Load default hardcoded ones if files exist and we haven't created a central mapping for them
    # But for a robust system, let's keep maps locally in each file or we can just append map dynamically if not present.
    # To support user editing, let's look for any .json file in the workflows directory.
    # We will assume each json file contains BOTH "data" and "map" if it's saved by our system.
    # If it's a raw ComfyUI json, we'll try to wrap it.
    for file in os.listdir(WORKFLOWS_DIR):
        if not file.endswith(".json"): continue
        path = WORKFLOWS_DIR / file
        name = file.replace(".json", "")
        
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = json.load(f)
            
            # Check if it's already wrapped in our format
            if "data" in content and "map" in content:
                WORKFLOW_REGISTRY[name] = content
            else:
                # Legacy raw format - add default empty map or hardcoded
                default_map = {}
                if name == "t2i_sdxl":
                    default_map = {"sampler": "24", "positive_prompt": "6", "negative_prompt": "7", "model": "4", "model_field": "ckpt_name", "latent": "5", "save": "27"}
                elif name == "t2i_ZIT":
                    default_map = {"sampler": "3", "positive_prompt": "6", "negative_prompt": "7", "model": "16", "model_field": "unet_name", "latent": "13", "save": "9", "lora": "28", "lora_field": "lora_name"}
                elif name == "i2v_wan22":
                    default_map = {"sampler": "85", "positive_prompt": "93", "negative_prompt": "89", "model": "95", "model_field": "unet_name", "latent": "98", "save": "108"}
                
                # Resave it wrapped
                wrapped = {"data": content, "map": default_map}
                try:
                    with open(path, "w", encoding="utf-8") as f:
                        json.dump(wrapped, f, indent=2)
                except Exception as ex:
                    print(f"Could not rewrite {file}", ex)
                WORKFLOW_REGISTRY[name] = wrapped

        except Exception as e:
            print("Error loading workflow:", file, e)

def get_workflows():
    load_workflows()
    return WORKFLOW_REGISTRY

def save_workflow(name: str, config: WorkflowConfig):
    init_workflows_dir()
    path = WORKFLOWS_DIR / f"{name}.json"
    with open(path, "w", encoding="utf-8") as f:
        f.write(config.model_dump_json(indent=2))
    WORKFLOW_REGISTRY[name] = config.model_dump()
