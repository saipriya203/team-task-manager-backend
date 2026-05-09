const newTaskInput = document.getElementById('new-task');
const addTaskButton = document.getElementById('add-task-button');
const taskList = document.getElementById('task-list');
const filterButtons = document.querySelectorAll('.filter-button');

let tasks = [];
let currentFilter = 'all';

function loadTasks() {
  const storedTasks = localStorage.getItem('taskManagerTasks');
  try {
    tasks = storedTasks ? JSON.parse(storedTasks) : [];
  } catch (error) {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem('taskManagerTasks', JSON.stringify(tasks));
}

function renderTasks() {
  taskList.innerHTML = '';

  const visibleTasks = tasks.filter((task) => {
    if (currentFilter === 'active') return !task.completed;
    if (currentFilter === 'completed') return task.completed;
    return true;
  });

  if (visibleTasks.length === 0) {
    const emptyMessage = document.createElement('li');
    emptyMessage.className = 'task-item';
    emptyMessage.textContent = 'No tasks yet. Add your first task!';
    taskList.appendChild(emptyMessage);
    return;
  }

  visibleTasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = 'task-item';

    const left = document.createElement('div');
    left.className = 'task-left';

    const check = document.createElement('button');
    check.type = 'button';
    check.className = `task-check${task.completed ? ' completed' : ''}`;
    check.innerHTML = task.completed ? '<span>✓</span>' : '';
    check.addEventListener('click', () => toggleTask(task.id));

    const label = document.createElement('span');
    label.className = `task-label${task.completed ? ' completed' : ''}`;
    label.textContent = task.text;

    left.append(check, label);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.textContent = '✕';
    deleteButton.addEventListener('click', () => deleteTask(task.id));

    item.append(left, deleteButton);
    taskList.appendChild(item);
  });
}

function addTask() {
  const text = newTaskInput.value.trim();
  if (!text) {
    newTaskInput.focus();
    return;
  }

  tasks.unshift({
    id: Date.now().toString(),
    text,
    completed: false,
  });

  newTaskInput.value = '';
  saveTasks();
  renderTasks();
}

function toggleTask(taskId) {
  tasks = tasks.map((task) =>
    task.id === taskId ? { ...task, completed: !task.completed } : task
  );
  saveTasks();
  renderTasks();
}

function deleteTask(taskId) {
  tasks = tasks.filter((task) => task.id !== taskId);
  saveTasks();
  renderTasks();
}

function setFilter(filterName) {
  currentFilter = filterName;
  filterButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === filterName);
  });
  renderTasks();
}

addTaskButton.addEventListener('click', addTask);
newTaskInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addTask();
  }
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => setFilter(button.dataset.filter));
});

loadTasks();
renderTasks();
