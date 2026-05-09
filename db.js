const fs = require('fs');
const path = require('path');

const dbFile = path.resolve(process.env.DB_FILE || 'data.json');
const seed = {
  users: [],
  projects: [],
  project_members: [],
  tasks: [],
};

let data = seed;
if (fs.existsSync(dbFile)) {
  try {
    data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch (error) {
    data = seed;
  }
}

function save() {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

function nextId(collection) {
  const items = data[collection];
  if (!items || !items.length) return 1;
  return Math.max(...items.map((item) => item.id || 0)) + 1;
}

module.exports = {
  data,
  save,
  nextId,
};
