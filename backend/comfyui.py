import json
import urllib.request
import urllib.parse
import uuid
import asyncio
import websockets
from typing import Dict, Any

COMFYUI_SERVER = "127.0.0.1:8188"
CLIENT_ID = str(uuid.uuid4())

def queue_prompt(prompt: Dict[str, Any]) -> str:
    """Queues a prompt to the ComfyUI server and returns the prompt_id."""
    p = {"prompt": prompt, "client_id": CLIENT_ID}
    data = json.dumps(p).encode('utf-8')
    req = urllib.request.Request(f"http://{COMFYUI_SERVER}/prompt", data=data)
    try:
        response = urllib.request.urlopen(req)
        response_data = json.loads(response.read())
        return response_data.get("prompt_id")
    except Exception as e:
        print(f"Error queuing prompt: {e}")
        return None

def get_image(filename: str, subfolder: str, folder_type: str) -> bytes:
    """Fetches an image from the ComfyUI server."""
    data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
    url_values = urllib.parse.urlencode(data)
    req = urllib.request.Request(f"http://{COMFYUI_SERVER}/view?{url_values}")
    try:
        with urllib.request.urlopen(req) as response:
            return response.read()
    except Exception as e:
        print(f"Error fetching image: {e}")
        return None

async def listen_for_progress(prompt_id: str, callback=None):
    """Listens to the ComfyUI websocket for progress on a specific prompt_id."""
    ws_url = f"ws://{COMFYUI_SERVER}/ws?clientId={CLIENT_ID}"
    try:
        async with websockets.connect(ws_url) as ws:
            while True:
                out = await ws.recv()
                if isinstance(out, str):
                    message = json.loads(out)
                    if message['type'] == 'executing':
                        data = message['data']
                        if data['node'] is None and data['prompt_id'] == prompt_id:
                            # Execution is done
                            break 
                    elif message['type'] == 'progress':
                        if callback:
                            await callback(message['data'])
                            
    except Exception as e:
        print(f"Websocket error: {e}")

def get_history(prompt_id: str) -> Dict[str, Any]:
    """Gets the history/results for a given prompt_id."""
    req = urllib.request.Request(f"http://{COMFYUI_SERVER}/history/{prompt_id}")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except Exception as e:
        print(f"Error getting history: {e}")
        return {}
