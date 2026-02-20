// API base URL
const API_URL = '/api';

// State
let currentProject = null;
let currentTimeline = [];
let activeNodeId = null;
let availableModels = { checkpoints: [], unets: [], loras: [] };
let currentTemplates = { characters: [], locations: [], environments: [], styles: [] };
let availableWorkflows = {};

// DOM Elements
const viewWorkspace = document.getElementById('view-workspace');
const btnSettings = document.getElementById('btn-settings');
const btnNewProject = document.getElementById('btn-new-project');
const timelineContainer = document.getElementById('timeline-container');

const viewDashboard = document.getElementById('view-dashboard');

// Header Elements
const btnDashboard = document.getElementById('btn-dashboard');
const labelCurrentProject = document.getElementById('label-current-project');
const projectGrid = document.getElementById('project-grid');
const modalSettings = document.getElementById('modal-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveTemplates = document.getElementById('btn-save-templates');

const editSelWorkflow = document.getElementById('edit-sel-workflow');
const btnNewWorkflow = document.getElementById('btn-new-workflow');
const btnSaveWorkflow = document.getElementById('btn-save-workflow');
const editWfJson = document.getElementById('edit-wf-json');
const editWfName = document.getElementById('edit-wf-name');
const editWfSampler = document.getElementById('edit-wf-sampler');
const editWfPos = document.getElementById('edit-wf-pos');
const editWfNeg = document.getElementById('edit-wf-neg');
const editWfModel = document.getElementById('edit-wf-model');
const editWfModelField = document.getElementById('edit-wf-model-field');
const editWfLora = document.getElementById('edit-wf-lora');
const editWfLoraField = document.getElementById('edit-wf-lora-field');
const editWfLatent = document.getElementById('edit-wf-latent');
const editWfSave = document.getElementById('edit-wf-save');

// Settings Elements
const elWorkflow = document.getElementById('input-workflow');
const elPrompt = document.getElementById('input-prompt');
const elNegative = document.getElementById('input-negative');
const elModel = document.getElementById('input-model');
const elLora = document.getElementById('input-lora');
const bypassLora = document.getElementById('bypass-lora');
const loraContainer = document.getElementById('lora-container');
const elSeed = document.getElementById('input-seed');
const elSteps = document.getElementById('input-steps');
const elCfg = document.getElementById('input-cfg');
const elWidth = document.getElementById('input-width');
const elAspectRatio = document.getElementById('input-aspect-ratio');
const elOrientation = document.getElementById('input-orientation');
const elDimensions = document.getElementById('text-dimensions');
const randSeed = document.getElementById('rand-seed');
const btnGenerate = document.getElementById('btn-generate');
const btnIterate = document.getElementById('btn-iterate');
const btnBranch = document.getElementById('btn-branch');

// Template Elements
const editCharacters = document.getElementById('edit-characters');
const editLocations = document.getElementById('edit-locations');
const editEnvironments = document.getElementById('edit-environments');
const editStyles = document.getElementById('edit-styles');
const selCharacter = document.getElementById('sel-character');
const selLocation = document.getElementById('sel-location');
const selEnvironment = document.getElementById('sel-environment');
const selStyle = document.getElementById('sel-style');
const randCharacter = document.getElementById('rand-character');
const randLocation = document.getElementById('rand-location');
const randEnvironment = document.getElementById('rand-environment');
const randStyle = document.getElementById('rand-style');

// Canvas Elements
const activeImage = document.getElementById('active-image');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const generationLoader = document.getElementById('generation-loader');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    initEvents();
    await fetchModels();
    await fetchTemplates();
    await fetchWorkflows();
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

async function fetchTemplates() {
    try {
        const res = await fetch(`${API_URL}/templates`);
        currentTemplates = await res.json();
        populateTemplateDropdowns();
    } catch (e) {
        console.error("Failed to fetch templates", e);
    }
}

function populateTemplateDropdowns() {
    const drops = [
        { el: selCharacter, list: currentTemplates.characters, label: 'Character' },
        { el: selLocation, list: currentTemplates.locations, label: 'Location' },
        { el: selEnvironment, list: currentTemplates.environments, label: 'Environment' },
        { el: selStyle, list: currentTemplates.styles, label: 'Style' },
    ];

    drops.forEach(d => {
        d.el.innerHTML = `<option value="">-- ${d.label} --</option>`;
        d.list.forEach(item => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = item;
            d.el.appendChild(opt);
        });
    });
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
    } else {
        options.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            elModel.appendChild(opt);
        });
    }

    // Handle LoRA
    const wfInfo = availableWorkflows[wf];
    if (wfInfo && wfInfo.map && wfInfo.map.lora) {
        loraContainer.style.display = 'flex';
        elLora.innerHTML = '<option value="">-- Select LoRA --</option>';
        if (availableModels.loras) {
            availableModels.loras.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                elLora.appendChild(opt);
            });
        }
    } else {
        loraContainer.style.display = 'none';
        bypassLora.checked = false;
        elLora.value = '';
    }
}

function initEvents() {
    btnDashboard.addEventListener('click', () => {
        showView('dashboard');
        loadDashboard();
    });

    btnSettings.addEventListener('click', () => {
        modalSettings.classList.add('active');
        loadTemplateSettings();
        populateSettingsWorkflows();
    });

    btnCloseSettings.addEventListener('click', () => {
        modalSettings.classList.remove('active');
        populateWorkflowDropdownMain(); // Update main UI on close
    });

    // Modal Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });

    btnSaveTemplates.addEventListener('click', async () => {
        await saveTemplateSettings();
    });

    editSelWorkflow.addEventListener('change', () => loadWorkflowSettings(editSelWorkflow.value));

    btnNewWorkflow.addEventListener('click', () => {
        editSelWorkflow.value = "";
        editWfName.value = "new_workflow";
        editWfJson.value = "{\n  \n}";
        editWfSampler.value = "";
        editWfPos.value = "";
        editWfNeg.value = "";
        editWfModel.value = "";
        editWfModelField.value = "";
        editWfLora.value = "";
        editWfLoraField.value = "";
        editWfLatent.value = "";
        editWfSave.value = "";
    });

    btnSaveWorkflow.addEventListener('click', async () => await saveWorkflowSettings());

    btnNewProject.addEventListener('click', async () => {
        const promptText = prompt("Enter initial prompt (this will be the project name):");
        if (promptText) {
            await createProject(promptText);
            elPrompt.value = promptText;
        }
    });

    // Tag inserters
    document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            const pos = elPrompt.selectionStart;
            const text = elPrompt.value;
            elPrompt.value = text.substring(0, pos) + tag + text.substring(elPrompt.selectionEnd);
            elPrompt.selectionStart = elPrompt.selectionEnd = pos + tag.length;
            elPrompt.focus();
        });
    });

    btnGenerate.addEventListener('click', async () => {
        await generateImage();
    });

    elWorkflow.addEventListener('change', () => {
        updateModelDropdown();
    });

    btnIterate.addEventListener('click', async () => {
        if (!randSeed.checked) {
            const currentSeed = parseInt(elSeed.value) || 0;
            elSeed.value = currentSeed + 1;
        }
        await generateImage();
    });

    btnBranch.addEventListener('click', async () => {
        if (!activeNodeId || !currentProject) return alert("Select an image to branch from first.");

        const activeNode = currentProject.nodes[activeNodeId];
        if (!activeNode) return;

        const defaultPrompt = activeNode.params.prompt_template || activeNode.params.prompt || "";
        const promptText = prompt("Enter initial prompt for the branched project:", defaultPrompt);

        if (promptText) {
            try {
                // Create project
                const res = await fetch(`${API_URL}/projects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: promptText })
                });
                const newProj = await res.json();

                // Switch context to newly created project
                await openProject(newProj.id);

                // Set the prompt to the string provided by the user
                elPrompt.value = promptText;

                // Immediately generate the first image using copied parameters
                await generateImage();
            } catch (e) {
                console.error("Error branching project", e);
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            btnGenerate.click();
        } else if (e.shiftKey && e.key === 'Enter') {
            e.preventDefault();
            btnIterate.click();
        }
    });

    elWidth.addEventListener('input', updateDimensions);
    elAspectRatio.addEventListener('change', updateDimensions);
    elOrientation.addEventListener('change', updateDimensions);
}

function loadTemplateSettings() {
    editCharacters.value = currentTemplates.characters.join('\n');
    editLocations.value = currentTemplates.locations.join('\n');
    editEnvironments.value = currentTemplates.environments.join('\n');
    editStyles.value = currentTemplates.styles.join('\n');
}

async function saveTemplateSettings() {
    const payload = {
        characters: editCharacters.value.split('\n').map(s => s.trim()).filter(s => s),
        locations: editLocations.value.split('\n').map(s => s.trim()).filter(s => s),
        environments: editEnvironments.value.split('\n').map(s => s.trim()).filter(s => s),
        styles: editStyles.value.split('\n').map(s => s.trim()).filter(s => s)
    };
    try {
        const res = await fetch(`${API_URL}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        currentTemplates = await res.json();
        populateTemplateDropdowns();
        btnSaveTemplates.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
        setTimeout(() => btnSaveTemplates.innerHTML = '<i class="fa-solid fa-save"></i> Save Templates', 2000);
    } catch (e) {
        console.error("Failed to save templates", e);
    }
}

async function fetchWorkflows() {
    try {
        const res = await fetch(`${API_URL}/workflows`);
        availableWorkflows = await res.json();
        populateWorkflowDropdownMain();
    } catch (e) { console.error(e); }
}

function populateWorkflowDropdownMain() {
    const val = elWorkflow.value;
    elWorkflow.innerHTML = '';
    for (const [name, wf] of Object.entries(availableWorkflows)) {
        const opt = document.createElement('option');
        opt.value = name;

        let label = name;
        if (name === "t2i_sdxl") label = "Text to Image (SDXL/Pony)";
        else if (name === "t2i_ZIT") label = "Text to Image (Z Image Turbo)";
        else if (name === "i2v_wan22") label = "Image to Video (Wan 2.2V)";

        opt.textContent = label;
        elWorkflow.appendChild(opt);
    }
    if (availableWorkflows[val]) elWorkflow.value = val;
    updateModelDropdown();
}

function populateSettingsWorkflows() {
    editSelWorkflow.innerHTML = '<option value="">-- Custom New --</option>';
    for (const name of Object.keys(availableWorkflows)) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        editSelWorkflow.appendChild(opt);
    }
    if (Object.keys(availableWorkflows).length > 0) {
        editSelWorkflow.value = Object.keys(availableWorkflows)[0];
        loadWorkflowSettings(editSelWorkflow.value);
    }
}

function loadWorkflowSettings(name) {
    if (!name || !availableWorkflows[name]) return;
    const wf = availableWorkflows[name];
    editWfName.value = name;
    editWfJson.value = JSON.stringify(wf.data, null, 2);
    editWfSampler.value = wf.map.sampler || "";
    editWfPos.value = wf.map.positive_prompt || "";
    editWfNeg.value = wf.map.negative_prompt || "";
    editWfModel.value = wf.map.model || "";
    editWfModelField.value = wf.map.model_field || "";
    editWfLora.value = wf.map.lora || "";
    editWfLoraField.value = wf.map.lora_field || "";
    editWfLatent.value = wf.map.latent || "";
    editWfSave.value = wf.map.save || "";
}

async function saveWorkflowSettings() {
    const name = editWfName.value.trim();
    if (!name) return alert("Please provide a Workflow API Name");

    let data;
    try {
        data = JSON.parse(editWfJson.value);
    } catch (e) {
        return alert("Invalid JSON format for workflow data");
    }

    const payload = {
        data: data,
        map: {
            sampler: editWfSampler.value.trim() || null,
            positive_prompt: editWfPos.value.trim() || null,
            negative_prompt: editWfNeg.value.trim() || null,
            model: editWfModel.value.trim() || null,
            model_field: editWfModelField.value.trim() || null,
            lora: editWfLora.value.trim() || null,
            lora_field: editWfLoraField.value.trim() || null,
            latent: editWfLatent.value.trim() || null,
            save: editWfSave.value.trim() || null
        }
    };

    try {
        const res = await fetch(`${API_URL}/workflows/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        btnSaveWorkflow.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
        setTimeout(() => btnSaveWorkflow.innerHTML = '<i class="fa-solid fa-save"></i> Save Workflow', 2000);

        await fetchWorkflows(); // refresh
        editSelWorkflow.value = name;
    } catch (e) { console.error(e); alert("Failed to save workflow"); }
}

function getCalculatedHeight() {
    let width = parseInt(elWidth.value) || 1024;
    const ar = elAspectRatio.value;
    const isPortrait = elOrientation.value === 'Portrait';

    let [wRatio, hRatio] = ar.split(':').map(Number);
    if (wRatio !== hRatio && isPortrait) {
        const temp = wRatio;
        wRatio = hRatio;
        hRatio = temp;
    }

    let height = Math.round(width * (hRatio / wRatio));
    // Round to nearest 8
    return Math.round(height / 8) * 8;
}

function updateDimensions() {
    const w = parseInt(elWidth.value) || 1024;
    const h = getCalculatedHeight();
    if (elDimensions) {
        elDimensions.textContent = `Final Size: ${w} × ${h}`;
    }
}

function showView(viewName) {
    viewDashboard.classList.remove('active');
    viewWorkspace.classList.remove('active');

    if (viewName === 'dashboard') {
        viewDashboard.classList.add('active');
        loadDashboard();
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
            const el = document.createElement('div');
            el.className = 'project-card';

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

            el.innerHTML = `
                <div class="project-thumb" style="${thumbStyle}">${thumbIcon}</div>
                <div class="project-info">
                    <h3>${p.name}</h3>
                    <p>${nodeIds.length} generations</p>
                </div>
            `;

            el.addEventListener('click', (e) => {
                e.preventDefault();
                openProject(p.id);
            });
            projectGrid.appendChild(el);
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
        labelCurrentProject.textContent = currentProject.name;

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
        if (node.image_filename && node.status === 'completed') {
            thumbUrl = `${API_URL}/projects/${currentProject.id}/images/${node.image_filename}`;
        }

        const thumbStyle = thumbUrl ? `background-image: url('${thumbUrl}')` : '';
        let thumbIcon = '';
        if (!thumbUrl) {
            if (node.status === 'error') {
                thumbIcon = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i>';
            } else if (node.status === 'generating') {
                thumbIcon = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>';
            } else {
                thumbIcon = '<i class="fa-solid fa-hourglass-half"></i>';
            }
        }

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
    elPrompt.value = node.params.prompt_template || node.params.prompt; // Show raw prompt
    elNegative.value = node.params.negative_prompt;
    if (node.params.model) elModel.value = node.params.model;

    // LoRA State Restoration
    bypassLora.checked = !!node.params.bypass_lora;
    if (node.params.lora) elLora.value = node.params.lora;

    elSeed.value = node.params.seed;
    elSteps.value = node.params.steps;
    elCfg.value = node.params.cfg;
    if (node.params.width) elWidth.value = node.params.width;
    if (node.params.aspect_ratio) elAspectRatio.value = node.params.aspect_ratio;
    if (node.params.orientation) elOrientation.value = node.params.orientation;

    if (node.params.template_values) {
        selCharacter.value = node.params.template_values.character || '';
        selLocation.value = node.params.template_values.location || '';
        selEnvironment.value = node.params.template_values.environment || '';
        selStyle.value = node.params.template_values.style || '';
    } else {
        selCharacter.value = ''; selLocation.value = ''; selEnvironment.value = ''; selStyle.value = '';
    }

    updateDimensions();

    // Handle Generation Overlays
    const errorOverlay = document.getElementById('generation-error');
    const errorMsg = document.getElementById('error-message');
    const progressText = document.getElementById('generation-progress-text');

    generationLoader.style.display = 'none';
    if (errorOverlay) errorOverlay.style.display = 'none';

    if (node.status === 'error') {
        if (errorOverlay) {
            errorOverlay.style.display = 'flex';
            errorMsg.textContent = node.error || "Generation failed";
        }
        canvasPlaceholder.style.display = 'none';
    } else if (node.status === 'generating') {
        generationLoader.style.display = 'flex';
        if (progressText) {
            const pct = Math.round((node.progress || 0) * 100);
            progressText.textContent = `Generating... ${pct}%`;
        }
        canvasPlaceholder.style.display = 'none';
    }

    // Show image
    if (node.image_filename && node.status === 'completed') {
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
        if (node.status !== 'generating' && node.status !== 'error') {
            canvasPlaceholder.style.display = 'block';
        }
    }

    renderTimeline();
}

async function generateImage() {
    if (!currentProject) return;

    if (randSeed.checked) {
        elSeed.value = Math.floor(Math.random() * 1000000000);
    }

    const rawPrompt = elPrompt.value;
    const tv = {};

    // Resolve randomizers and populate template values
    if (randCharacter.checked && currentTemplates.characters.length) {
        tv.character = currentTemplates.characters[Math.floor(Math.random() * currentTemplates.characters.length)];
        selCharacter.value = tv.character; // update UI
    } else {
        tv.character = selCharacter.value;
    }

    if (randLocation.checked && currentTemplates.locations.length) {
        tv.location = currentTemplates.locations[Math.floor(Math.random() * currentTemplates.locations.length)];
        selLocation.value = tv.location;
    } else {
        tv.location = selLocation.value;
    }

    if (randEnvironment.checked && currentTemplates.environments.length) {
        tv.environment = currentTemplates.environments[Math.floor(Math.random() * currentTemplates.environments.length)];
        selEnvironment.value = tv.environment;
    } else {
        tv.environment = selEnvironment.value;
    }

    if (randStyle.checked && currentTemplates.styles.length) {
        tv.style = currentTemplates.styles[Math.floor(Math.random() * currentTemplates.styles.length)];
        selStyle.value = tv.style;
    } else {
        tv.style = selStyle.value;
    }

    let finalPrompt = rawPrompt;
    if (tv.character) finalPrompt = finalPrompt.replace(/\{character\}/gi, tv.character);
    if (tv.location) finalPrompt = finalPrompt.replace(/\{location\}/gi, tv.location);
    if (tv.environment) finalPrompt = finalPrompt.replace(/\{environment\}/gi, tv.environment);
    if (tv.style) finalPrompt = finalPrompt.replace(/\{style\}/gi, tv.style);

    const tvClean = {};
    for (const [k, v] of Object.entries(tv)) {
        if (v) tvClean[k] = v;
    }

    const params = {
        workflow: elWorkflow.value,
        prompt: finalPrompt,
        prompt_template: rawPrompt,
        template_values: tvClean,
        negative_prompt: elNegative.value,
        model: elModel.value,
        lora: elLora.value,
        bypass_lora: bypassLora.checked,
        seed: parseInt(elSeed.value),
        steps: parseInt(elSteps.value),
        cfg: parseFloat(elCfg.value),
        width: parseInt(elWidth.value) || 1024,
        height: getCalculatedHeight(),
        aspect_ratio: elAspectRatio.value,
        orientation: elOrientation.value
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

            if (node.status === 'completed' && node.image_filename) {
                clearInterval(interval);
                currentProject = p;
                currentTimeline = Object.values(currentProject.nodes).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                if (activeNodeId === nodeId) {
                    selectNode(nodeId);
                }
            } else if (node.status === 'error') {
                clearInterval(interval);
                currentProject = p;
                currentTimeline = Object.values(currentProject.nodes).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                if (activeNodeId === nodeId) {
                    selectNode(nodeId);
                }
            } else if (node.status === 'generating') {
                if (activeNodeId === nodeId) {
                    const pct = Math.round((node.progress || 0) * 100);
                    const progressText = document.getElementById('generation-progress-text');
                    if (progressText) progressText.textContent = `Generating... ${pct}%`;
                }
            }
        } catch (e) {
            console.error(e);
        }
    }, 2000);
}
