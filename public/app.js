const authCard = document.getElementById('auth-card');
const appGrid = document.getElementById('app-grid');
const authForm = document.getElementById('auth-form');
const authTabs = Array.from(document.querySelectorAll('.auth-tab'));
const nameField = document.getElementById('name-field');
const projectList = document.getElementById('project-list');
const projectTitle = document.getElementById('project-title');
const projectDescription = document.getElementById('project-description');
const projectRoleLabel = document.getElementById('project-role');
const totalTasks = document.getElementById('total-tasks');
const pendingTasks = document.getElementById('pending-tasks');
const inprogressTasks = document.getElementById('inprogress-tasks');
const completedTasks = document.getElementById('completed-tasks');
const overdueTasks = document.getElementById('overdue-tasks');
const taskList = document.getElementById('task-list');
const newProjectButton = document.getElementById('new-project-button');
const inviteMemberButton = document.getElementById('invite-member-button');
const deleteProjectButton = document.getElementById('delete-project-button');
const memberDialog = document.getElementById('member-dialog');
const memberForm = document.getElementById('member-form');
const memberEmail = document.getElementById('member-email');
const memberRole = document.getElementById('member-role');
const projectDialog = document.getElementById('project-dialog');
const taskDialog = document.getElementById('task-dialog');
const openTaskForm = document.getElementById('open-task-form');
const logoutButton = document.getElementById('logout-button');
const taskFilter = document.getElementById('task-filter');

let authMode = 'login';
let token = localStorage.getItem('ttm_token');
let projects = [];
let selectedProject = null;
let tasks = [];

function setAuthMode(mode) {
  authMode = mode;
  authTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
  nameField.style.display = mode === 'signup' ? 'block' : 'none';
}

authTabs.forEach((tab) => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
});

async function apiRequest(path, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showApp() {
  authCard.classList.add('hidden');
  appGrid.classList.remove('hidden');
}

function showAuth() {
  authCard.classList.remove('hidden');
  appGrid.classList.add('hidden');
}

async function refreshProjects() {
  const data = await apiRequest('/api/projects');
  projects = data.projects;
  renderProjects();
  if (!selectedProject && projects.length) {
    selectProject(projects[0]);
  }
}

function setProjectRole(role) {
  projectRoleLabel.textContent = `Role: ${role || 'N/A'}`;
  inviteMemberButton.classList.toggle('hidden', role !== 'admin');
  deleteProjectButton.classList.toggle('hidden', role !== 'admin');
}

function renderProjects() {
  projectList.innerHTML = '';
  projects.forEach((project) => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <strong>${project.name}</strong>
      <p>${project.description || 'No description'}</p>
      <p class="project-card-role">Role: ${project.role || 'member'}</p>
    `;
    card.addEventListener('click', () => selectProject(project));
    if (selectedProject && selectedProject.id === project.id) card.classList.add('active');
    projectList.appendChild(card);
  });
}

function selectProject(project) {
  selectedProject = project;
  projectTitle.textContent = project.name;
  projectDescription.textContent = project.description || 'No description added.';
  setProjectRole(project.role);
  renderProjects();
  loadTasks();
}

function formatStatus(status) {
  return status === 'todo' ? 'Pending' : status === 'in-progress' ? 'In Progress' : 'Completed';
}

function renderTasks() {
  taskList.innerHTML = '';
  const filter = taskFilter.value;
  const visible = tasks.filter((task) => filter === 'all' || task.status === filter);
  if (!visible.length) {
    taskList.innerHTML = '<div class="task-card"><p>No tasks found. Add one to get started.</p></div>';
    return;
  }

  visible.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'task-card';
    const assignedText = task.assigned_name ? `Assigned to ${task.assigned_name}` : 'Unassigned';
    const dueText = task.due_date ? `Due ${task.due_date}` : 'No due date';
    card.innerHTML = `
      <strong>${task.title}</strong>
      <p>${task.description || 'No description'}</p>
      <div class="task-meta">
        <span>${assignedText}</span>
        <span>${formatStatus(task.status)}</span>
        <span>${dueText}</span>
      </div>
      <div class="task-card-actions">
        <button class="task-button" data-action="status">Update status</button>
        ${selectedProject?.role === 'admin' ? '<button class="task-button" data-action="delete">Delete</button>' : ''}
      </div>
    `;

    const statusButton = card.querySelector('[data-action="status"]');
    statusButton.addEventListener('click', () => promptUpdateTask(task));

    if (selectedProject?.role === 'admin') {
      const deleteButton = card.querySelector('[data-action="delete"]');
      deleteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteTask(task.id);
      });
    }

    taskList.appendChild(card);
  });
}

async function loadTasks() {
  if (!selectedProject) return;
  const data = await apiRequest(`/api/projects/${selectedProject.id}/tasks`);
  tasks = data.tasks;
  renderTasks();
  refreshDashboard();
}

async function refreshDashboard() {
  const data = await apiRequest('/api/dashboard');
  totalTasks.textContent = data.totalTasks;
  pendingTasks.textContent = data.pendingTasks;
  inprogressTasks.textContent = data.inProgressTasks;
  completedTasks.textContent = data.completedTasks;
  overdueTasks.textContent = data.overdueTasks;
}

async function loginSignup(event) {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const name = document.getElementById('name').value.trim();

  const payload = authMode === 'signup' ? { name, email, password } : { email, password };
  const path = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';

  try {
    const { token: receivedToken } = await apiRequest(path, { method: 'POST', body: JSON.stringify(payload) });
    token = receivedToken;
    localStorage.setItem('ttm_token', token);
    showApp();
    await refreshProjects();
  } catch (error) {
    alert(error.message);
  }
}

async function createProject(event) {
  event.preventDefault();
  const name = document.getElementById('proj-name').value.trim();
  const description = document.getElementById('proj-description').value.trim();
  if (!name) return;
  try {
    await apiRequest('/api/projects', { method: 'POST', body: JSON.stringify({ name, description }) });
    projectDialog.close();
    event.target.reset();
    await refreshProjects();
  } catch (error) {
    alert(error.message);
  }
}

async function createTask(event) {
  event.preventDefault();
  if (!selectedProject) return;
  const title = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-desc').value.trim();
  const assigned_to = document.getElementById('task-assign').value.trim() || undefined;
  const due_date = document.getElementById('task-date').value || undefined;
  if (!title) return;
  try {
    const payload = { title, description, due_date };
    if (assigned_to) payload.assigned_to = assigned_to;
    await apiRequest(`/api/projects/${selectedProject.id}/tasks`, { method: 'POST', body: JSON.stringify(payload) });
    taskDialog.close();
    event.target.reset();
    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  try {
    await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteProject() {
  if (!selectedProject) return;
  if (!confirm('Delete this project and its tasks?')) return;

  try {
    await apiRequest(`/api/projects/${selectedProject.id}`, { method: 'DELETE' });
    selectedProject = null;
    await refreshProjects();
    if (projects.length) {
      selectProject(projects[0]);
    } else {
      projectTitle.textContent = 'Select a project';
      projectDescription.textContent = 'Project details appear here.';
      setProjectRole(null);
      taskList.innerHTML = '';
    }
  } catch (error) {
    alert(error.message);
  }
}

async function inviteMember(event) {
  event.preventDefault();
  if (!selectedProject) return;
  const email = memberEmail.value.trim();
  const role = memberRole.value;
  if (!email) return;

  try {
    await apiRequest(`/api/projects/${selectedProject.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
    memberDialog.close();
    memberForm.reset();
    alert('Member invited successfully.');
  } catch (error) {
    alert(error.message);
  }
}

function promptUpdateTask(task) {
  const newStatus = prompt('Set task status (todo, in-progress, done):', task.status);
  if (!newStatus) return;
  if (!['todo', 'in-progress', 'done'].includes(newStatus)) {
    alert('Status must be todo, in-progress, or done.');
    return;
  }
  apiRequest(`/api/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) })
    .then(() => loadTasks())
    .catch((error) => alert(error.message));
}

function logout() {
  token = null;
  localStorage.removeItem('ttm_token');
  selectedProject = null;
  showAuth();
}

authForm.addEventListener('submit', loginSignup);
newProjectButton.addEventListener('click', () => projectDialog.showModal());
openTaskForm.addEventListener('click', () => taskDialog.showModal());
inviteMemberButton.addEventListener('click', () => memberDialog.showModal());
deleteProjectButton.addEventListener('click', deleteProject);
logoutButton.addEventListener('click', logout);
projectDialog.querySelector('#project-form').addEventListener('submit', createProject);
taskDialog.querySelector('#task-form').addEventListener('submit', createTask);
memberForm.addEventListener('submit', inviteMember);
document.getElementById('close-project-dialog').addEventListener('click', () => projectDialog.close());
document.getElementById('close-task-dialog').addEventListener('click', () => taskDialog.close());
document.getElementById('close-member-dialog').addEventListener('click', () => memberDialog.close());
taskFilter.addEventListener('change', renderTasks);

async function init() {
  setAuthMode('login');
  if (token) {
    try {
      await apiRequest('/api/auth/me');
      showApp();
      await refreshProjects();
    } catch (error) {
      token = null;
      localStorage.removeItem('ttm_token');
      showAuth();
    }
  } else {
    showAuth();
  }
}

init();
