// API base URL
const API_URL = '/api';

// State
let currentProject = null;
let currentTimeline = [];
let activeNodeId = null;
let availableModels = { checkpoints: [], unets: [] };

// DOM Elements
const viewDashboard = document.getElementById('view-dashboard');
const viewWorkspace = document.getElementById('view-workspace');
const btnDashboard = document.getElementById('btn-dashboard');
const btnNewProject = document.getElementById('btn-new-project');
const projectGrid = document.getElementById('project-grid');
const timelineContainer = document.getElementById('timeline-container');

// Settings Elements
const elWorkflow = document.getElementById('input-workflow');
const elPrompt = document.getElementById('input-prompt');
const elNegative = document.getElementById('input-negative');
const elModel = document.getElementById('input-model');
const elSeed = document.getElementById('input-seed');
const elSteps = document.getElementById('input-steps');
const elCfg = document.getElementById('input-cfg');
const btnRandomSeed = document.getElementById('btn-random-seed');
const btnGenerate = document.getElementById('btn-generate');

// Canvas Elements
const activeImage = document.getElementById('active-image');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const generationLoader = document.getElementById('generation-loader');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    initEvents();
    await fetchModels();
    loadDashboard();
});

async function fetchModels() {
    try {
        const res = await fetch(`${API_URL}/models`);
        availableModels = await res.json();
        updateModelDropdown();
    } catch (e) {
        console.error("Failed to fetch models", e);
    }
}

function updateModelDropdown() {
    elModel.innerHTML = '';
    const wf = elWorkflow.value;
    let options = [];

    // t2i_sdxl uses checkpoints. ZIT and wan22 use unets.
    if (wf === 't2i_sdxl') {
        options = availableModels.checkpoints || [];
    } else {
        options = availableModels.unets || [];
    }

    if (options.length === 0) {
        elModel.innerHTML = '<option value="">No models found</option>';
        return;
    }

    options.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        elModel.appendChild(opt);
    });
}

function initEvents() {
    btnDashboard.addEventListener('click', () => {
        showView('dashboard');
        loadDashboard();
    });

    btnNewProject.addEventListener('click', async () => {
        const name = prompt("Enter project name:");
        if (name) {
            await createProject(name);
        }
    });

    btnRandomSeed.addEventListener('click', () => {
        elSeed.value = Math.floor(Math.random() * 1000000000);
    });

    btnGenerate.addEventListener('click', async () => {
        await generateImage();
    });

    elWorkflow.addEventListener('change', () => {
        updateModelDropdown();
    });
}

function showView(viewName) {
    viewDashboard.classList.remove('active');
    viewWorkspace.classList.remove('active');
    btnDashboard.classList.remove('active');

    if (viewName === 'dashboard') {
        viewDashboard.classList.add('active');
        btnDashboard.classList.add('active');
    } else {
        viewWorkspace.classList.add('active');
    }
}

async function loadDashboard() {
    try {
        const res = await fetch(`${API_URL}/projects`);
        const projects = await res.json();

        projectGrid.innerHTML = '';
        projects.forEach(p => {
            const card = document.createElement('div');
            card.className = 'project-card';

            // Get latest image if exists
            let thumbUrl = '';
            const nodeIds = Object.keys(p.nodes);
            if (nodeIds.length > 0) {
                // Find latest node
                const nodes = Object.values(p.nodes).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                if (nodes[0].image_filename) {
                    thumbUrl = `${API_URL}/projects/${p.id}/images/${nodes[0].image_filename}`;
                }
            }

            const thumbStyle = thumbUrl ? `background-image: url('${thumbUrl}')` : '';
            const thumbIcon = thumbUrl ? '' : '<i class="fa-regular fa-image"></i>';

            card.innerHTML = `
                <div class="project-thumb" style="${thumbStyle}">${thumbIcon}</div>
                <div class="project-info">
                    <h3>${p.name}</h3>
                    <p>${new Date(p.updated_at).toLocaleDateString()} · ${nodeIds.length} generations</p>
                </div>
            `;

            card.addEventListener('click', () => openProject(p.id));
            projectGrid.appendChild(card);
        });
    } catch (e) {
        console.error("Error loading dashboard", e);
    }
}

async function createProject(name) {
    try {
        const res = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const project = await res.json();
        openProject(project.id);
    } catch (e) {
        console.error("Error creating project", e);
    }
}

async function openProject(id) {
    try {
        const res = await fetch(`${API_URL}/projects/${id}`);
        currentProject = await res.json();

        // Rebuild timeline structure (simple linear for now, based on timestamps)
        currentTimeline = Object.values(currentProject.nodes).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        showView('workspace');
        renderTimeline();

        if (currentTimeline.length > 0) {
            selectNode(currentTimeline[currentTimeline.length - 1].id);
        } else {
            // New Default State
            activeNodeId = null;
            elPrompt.value = '';
            activeImage.style.display = 'none';
            canvasPlaceholder.style.display = 'block';
        }
    } catch (e) {
        console.error("Error opening project", e);
    }
}

function renderTimeline() {
    timelineContainer.innerHTML = '';
    currentTimeline.forEach(node => {
        const el = document.createElement('div');
        el.className = `timeline-node ${node.id === activeNodeId ? 'active' : ''}`;

        let thumbUrl = '';
        if (node.image_filename) {
            thumbUrl = `${API_URL}/projects/${currentProject.id}/images/${node.image_filename}`;
        }

        const thumbStyle = thumbUrl ? `background-image: url('${thumbUrl}')` : '';
        const thumbIcon = thumbUrl ? '' : '<i class="fa-solid fa-hourglass-half"></i>';

        el.innerHTML = `
            <div class="node-thumb" style="${thumbStyle}">${thumbIcon}</div>
            <div class="node-info">
                <div class="node-prompt">${node.params.prompt || 'Empty prompt'}</div>
                <div class="node-meta">${node.params.seed} · ${node.params.steps} steps</div>
            </div>
        `;

        el.addEventListener('click', () => selectNode(node.id));
        timelineContainer.appendChild(el);
    });
}

function selectNode(id) {
    activeNodeId = id;
    const node = currentProject.nodes[id];
    if (!node) return;

    // Populate settings
    if (node.params.workflow) elWorkflow.value = node.params.workflow;
    updateModelDropdown();
    elPrompt.value = node.params.prompt;
    elNegative.value = node.params.negative_prompt;
    if (node.params.model) elModel.value = node.params.model;
    elSeed.value = node.params.seed;
    elSteps.value = node.params.steps;
    elCfg.value = node.params.cfg;

    // Show image
    if (node.image_filename) {
        const isVideo = node.image_filename.endsWith('.mp4');
        activeImage.style.display = 'none';

        // Remove existing video element if any
        const existingVideo = document.getElementById('active-video');
        if (existingVideo) existingVideo.remove();

        if (isVideo) {
            const vid = document.createElement('video');
            vid.id = 'active-video';
            vid.src = `${API_URL}/projects/${currentProject.id}/images/${node.image_filename}`;
            vid.autoplay = true;
            vid.loop = true;
            vid.controls = true;
            vid.style.maxWidth = '100%';
            vid.style.maxHeight = '100%';
            document.getElementById('image-viewer').appendChild(vid);
        } else {
            activeImage.src = `${API_URL}/projects/${currentProject.id}/images/${node.image_filename}`;
            activeImage.style.display = 'block';
        }
        canvasPlaceholder.style.display = 'none';
    } else {
        activeImage.style.display = 'none';
        const existingVideo = document.getElementById('active-video');
        if (existingVideo) existingVideo.remove();
        canvasPlaceholder.style.display = 'block';
    }

    renderTimeline();
}

async function generateImage() {
    if (!currentProject) return;

    const params = {
        workflow: elWorkflow.value,
        prompt: elPrompt.value,
        negative_prompt: elNegative.value,
        model: elModel.value,
        seed: parseInt(elSeed.value),
        steps: parseInt(elSteps.value),
        cfg: parseFloat(elCfg.value),
        width: 1024,
        height: 1024
    };

    generationLoader.style.display = 'flex';

    try {
        const res = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: currentProject.id,
                parent_node_id: activeNodeId,
                params: params
            })
        });

        const newNode = await res.json();

        // Optimistically add to timeline
        currentProject.nodes[newNode.id] = newNode;
        currentTimeline.push(newNode);
        selectNode(newNode.id);

        // Poll for completion (naive approach, websockets would be better for production)
        pollForCompletion(newNode.id);

    } catch (e) {
        console.error("Generation failed", e);
        generationLoader.style.display = 'none';
    }
}

function pollForCompletion(nodeId) {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`${API_URL}/projects/${currentProject.id}`);
            const p = await res.json();
            const node = p.nodes[nodeId];

            if (node && node.image_filename) {
                clearInterval(interval);
                currentProject = p;
                currentTimeline = Object.values(currentProject.nodes).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                if (activeNodeId === nodeId) {
                    selectNode(nodeId);
                    generationLoader.style.display = 'none';
                }
            }
        } catch (e) {
            console.error(e);
        }
    }, 2000);
}
