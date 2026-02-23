# ComfyStudio

ComfyStudio is a web-based application designed to manage image and video generations using ComfyUI. It provides a simple project-based workspace that connects directly to a running ComfyUI instance, allowing you to queue prompts, track generation progress, and manage workflows.

## Features

- **Project Management**: Organize your generations into distinct projects.
- **Workflow Integration**: Seamlessly queue prompts and execute ComfyUI workflows from the interface.
- **Live Progress Tracking**: Monitors the generation progress in real-time through websockets.
- **Model & Template Management**: Easily fetch available checkpoints, LoRAs, and unets.

## Prerequisites

- [Python 3.10+](https://www.python.org/downloads/)
- A running instance of [ComfyUI](https://github.com/comfyanonymous/ComfyUI)

## Installation

1. Clone or download the repository.
2. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
3. Create a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   # On Windows
   venv\Scripts\activate
   # On Mac/Linux
   source venv/bin/activate
   ```
4. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Ensure your **ComfyUI** instance is running and accessible (by default at `http://127.0.0.1:8188`).
2. Start the ComfyStudio backend server:
   ```bash
   cd backend
   python main.py
   ```
3. The server will start on `http://127.0.0.1:8000`. By default, it will serve the interactive frontend UI. Open this address in your browser to start using ComfyStudio.

## Project Structure

- `backend/` - Contains the FastAPI backend application, websocket listeners, and configuration for communicating with ComfyUI.
- `frontend/` - Standard HTML/CSS/JS frontend served by the Python backend.
- `Projects/` - The default directory where active project data and generated media are saved.

## License

MIT License
