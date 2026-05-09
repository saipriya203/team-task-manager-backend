require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || 'task-manager-secret';

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

function getProjectRole(projectId, userId) {
  const membership = db.data.project_members.find(
    (row) => row.project_id.toString() === projectId.toString() && row.user_id === userId
  );
  return membership ? membership.role : null;
}

function resolveAssignedTo(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    const user = db.data.users.find((u) => u.id === value);
    return user ? value : null;
  }
  const text = value.toString().trim();
  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric > 0) {
    const user = db.data.users.find((u) => u.id === numeric);
    if (user) return user.id;
  }
  const userByEmail = db.data.users.find((u) => u.email === text.toLowerCase());
  return userByEmail ? userByEmail.id : null;
}

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }

  const normalizedEmail = email.toLowerCase();
  const existing = db.data.users.find((user) => user.email === normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Email already exists.' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const created_at = new Date().toISOString();
  const user = {
    id: db.nextId('users'),
    name,
    email: normalizedEmail,
    password_hash,
    created_at,
  };
  db.data.users.push(user);
  db.save();

  const token = createToken(user);
  res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.data.users.find((item) => item.email === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = createToken(user);
  res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.data.users.find((item) => item.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at } });
});

app.get('/api/projects', authMiddleware, (req, res) => {
  const memberships = db.data.project_members.filter((pm) => pm.user_id === req.user.id);
  const projects = memberships.map((membership) => {
    const project = db.data.projects.find((item) => item.id === membership.project_id);
    return project ? { ...project, role: membership.role } : null;
  }).filter(Boolean);
  res.json({ projects });
});

app.post('/api/projects', authMiddleware, (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required.' });
  }

  const project = {
    id: db.nextId('projects'),
    name,
    description: description || '',
    owner_id: req.user.id,
    created_at: new Date().toISOString(),
  };
  db.data.projects.push(project);
  db.data.project_members.push({ project_id: project.id, user_id: req.user.id, role: 'admin' });
  db.save();

  res.status(201).json({ project });
});

app.get('/api/projects/:projectId', authMiddleware, (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (!role) {
    return res.status(403).json({ error: 'Access denied to this project.' });
  }

  const project = db.data.projects.find((item) => item.id.toString() === projectId.toString());
  if (!project) return res.status(404).json({ error: 'Project not found.' });

  const members = db.data.project_members
    .filter((pm) => pm.project_id.toString() === projectId.toString())
    .map((pm) => {
      const user = db.data.users.find((u) => u.id === pm.user_id);
      return user ? { id: user.id, name: user.name, email: user.email, role: pm.role } : null;
    })
    .filter(Boolean);

  res.json({ project, members, role });
});

app.post('/api/projects/:projectId/members', authMiddleware, (req, res) => {
  const { projectId } = req.params;
  const { email, role } = req.body;
  const projectRole = getProjectRole(projectId, req.user.id);
  if (projectRole !== 'admin') {
    return res.status(403).json({ error: 'Only project admins can invite members.' });
  }
  if (!email || !role || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Valid email and role are required.' });
  }

  const user = db.data.users.find((item) => item.email === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const existing = db.data.project_members.find(
    (pm) => pm.project_id.toString() === projectId.toString() && pm.user_id === user.id
  );
  if (existing) {
    return res.status(409).json({ error: 'User is already a project member.' });
  }

  db.data.project_members.push({ project_id: parseInt(projectId, 10), user_id: user.id, role });
  db.save();
  res.status(201).json({ message: 'Member invited successfully.' });
});

app.get('/api/projects/:projectId/tasks', authMiddleware, (req, res) => {
  const { projectId } = req.params;
  if (!getProjectRole(projectId, req.user.id)) {
    return res.status(403).json({ error: 'Access denied to this project.' });
  }

  const tasks = db.data.tasks
    .filter((task) => task.project_id.toString() === projectId.toString())
    .map((task) => {
      const assignedUser = db.data.users.find((u) => u.id === task.assigned_to);
      return { ...task, assigned_name: assignedUser?.name || null };
    })
    .sort((a, b) => {
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && !b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

  res.json({ tasks });
});

app.post('/api/projects/:projectId/tasks', authMiddleware, (req, res) => {
  const { projectId } = req.params;
  const { title, description, assigned_to, due_date } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Task title is required.' });
  }
  if (!getProjectRole(projectId, req.user.id)) {
    return res.status(403).json({ error: 'Access denied to this project.' });
  }

  const assignedToId = resolveAssignedTo(assigned_to);
  if (assigned_to && assignedToId === null) {
    return res.status(404).json({ error: 'Assigned user not found.' });
  }

  const now = new Date().toISOString();
  const task = {
    id: db.nextId('tasks'),
    project_id: parseInt(projectId, 10),
    title,
    description: description || '',
    assigned_to: assignedToId,
    status: 'todo',
    due_date: due_date || null,
    created_at: now,
    updated_at: now,
  };
  db.data.tasks.push(task);
  db.save();
  res.status(201).json({ task });
});

app.delete('/api/projects/:projectId', authMiddleware, (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete projects.' });
  }

  const projectIndex = db.data.projects.findIndex((project) => project.id.toString() === projectId.toString());
  if (projectIndex === -1) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  db.data.projects.splice(projectIndex, 1);
  db.data.project_members = db.data.project_members.filter((pm) => pm.project_id.toString() !== projectId.toString());
  db.data.tasks = db.data.tasks.filter((task) => task.project_id.toString() !== projectId.toString());
  db.save();

  res.json({ message: 'Project deleted.' });
});

app.put('/api/tasks/:taskId', authMiddleware, (req, res) => {
  const { taskId } = req.params;
  const { title, description, assigned_to, status, due_date } = req.body;
  const task = db.data.tasks.find((item) => item.id.toString() === taskId.toString());
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  const role = getProjectRole(task.project_id, req.user.id);
  if (!role) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const newStatus = status || task.status;
  if (!['todo', 'in-progress', 'done'].includes(newStatus)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const assignedToId = assigned_to !== undefined ? resolveAssignedTo(assigned_to) : task.assigned_to;
  if (assigned_to !== undefined && assignedToId === null) {
    return res.status(404).json({ error: 'Assigned user not found.' });
  }

  task.title = title || task.title;
  task.description = description !== undefined ? description : task.description;
  task.assigned_to = assignedToId;
  task.status = newStatus;
  task.due_date = due_date !== undefined ? due_date : task.due_date;
  task.updated_at = new Date().toISOString();
  db.save();

  res.json({ task });
});

app.delete('/api/tasks/:taskId', authMiddleware, (req, res) => {
  const { taskId } = req.params;
  const taskIndex = db.data.tasks.findIndex((item) => item.id.toString() === taskId.toString());
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  const task = db.data.tasks[taskIndex];
  const role = getProjectRole(task.project_id, req.user.id);
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete tasks.' });
  }

  db.data.tasks.splice(taskIndex, 1);
  db.save();
  res.json({ message: 'Task deleted.' });
});

app.get('/api/dashboard', authMiddleware, (req, res) => {
  const projectIds = db.data.project_members
    .filter((pm) => pm.user_id === req.user.id)
    .map((pm) => pm.project_id);

  const tasks = db.data.tasks.filter((task) => projectIds.includes(task.project_id));
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const pendingTasks = tasks.filter((task) => task.status === 'todo').length;
  const inProgressTasks = tasks.filter((task) => task.status === 'in-progress').length;
  const overdueTasks = tasks.filter(
    (task) => task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
  ).length;

  res.json({ totalTasks, pendingTasks, inProgressTasks, completedTasks, overdueTasks });
});

app.get('*', (req, res) => {
  res.sendFile(require('path').resolve('public/index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
