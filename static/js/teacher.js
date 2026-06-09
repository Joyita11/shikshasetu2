// ─── NAVIGATION ───
// NOTE: We use only 'click' events (NOT touchend) because:
//   1. touch-action:manipulation in CSS already removes the 300ms delay
//   2. touchend fires before the browser processes z-index, causing overlay to steal the tap
//   3. click is reliable across all devices once the delay is gone
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (el) el.classList.add('active');
  closeSidebar();
  loadPage(name);
}

function loadPage(name) {
  if (name === 'dashboard') loadDashboard();
  if (name === 'doubts') loadDoubts();
  if (name === 'students') loadStudents();
  if (name === 'tasks') loadTasks();
  if (name === 'fees') loadFees();
}

// Wire up nav items and logout after DOM is ready
document.addEventListener('DOMContentLoaded', function () {

  // Nav items — simple click only (touch-action:manipulation in CSS removes 300ms delay)
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      showPage(link.getAttribute('data-page'), link);
    });
  });

  // Logout button
  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function (e) {
      e.preventDefault();
      doLogout();
    });
  }

  // Delete student — event delegation on tbody so it works after dynamic re-render
  var studentsTbody = document.getElementById('students-tbody');
  if (studentsTbody) {
    studentsTbody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-delete-id]');
      if (!btn) return;
      deleteStudent(Number(btn.getAttribute('data-delete-id')));
    });
  }

  // Task modal — ChatGPT, Google, Send buttons (wired here to avoid inline onclick)
  var chatgptBtn = document.getElementById('task-chatgpt-btn');
  if (chatgptBtn) chatgptBtn.addEventListener('click', function () { openTaskSearch('chatgpt'); });

  var googleBtn = document.getElementById('task-google-btn');
  if (googleBtn) googleBtn.addEventListener('click', function () { openTaskSearch('google'); });

  var sendTasksBtn = document.getElementById('send-tasks-btn');
  if (sendTasksBtn) sendTasksBtn.addEventListener('click', sendTasks);

});

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

// ─── DASHBOARD ───
async function loadDashboard() {
  const res = await fetch('/api/teacher/stats');
  const d = await res.json();
  document.getElementById('stat-students').textContent = d.total_students;
  document.getElementById('stat-batches').textContent = d.active_batches;
  document.getElementById('stat-fees').innerHTML = `<span style="color:#e74c3c">${d.pending_fees_students}</span> <span style="font-size:14px;color:#666">Students</span>`;
  document.getElementById('stat-doubts').textContent = d.doubts;
}

// ─── DOUBTS ───
let currentDoubtId = null;

async function loadDoubts() {
  const res = await fetch('/api/teacher/doubts');
  const doubts = await res.json();
  const container = document.getElementById('doubts-list');
  if (!doubts.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#666">No doubts yet.</div>';
    return;
  }
  container.innerHTML = doubts.map(d => {
    const initials = d.student_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const date = new Date(d.created_at).toLocaleString();
    const badge = d.status === 'solved'
      ? '<span class="badge-solved">Solved</span>'
      : `<button class="btn-dark" style="font-size:13px;padding:8px 16px" onclick="openAnswerModal(${d.id}, '${escHtml(d.question)}')">Answer</button>`;
    const answerBlock = d.answer
      ? `<div class="doubt-answer"><strong>Your Answer:</strong> ${escHtml(d.answer)}</div>`
      : '';
    return `
      <div class="doubt-card">
        <div class="doubt-meta">
          <div class="doubt-student-info">
            <div class="doubt-avatar">${initials}</div>
            <div>
              <div class="doubt-student-name">${escHtml(d.student_name)}</div>
              <div class="doubt-student-sub">${escHtml(d.subject)} • ${date}</div>
            </div>
          </div>
          ${badge}
        </div>
        <div class="doubt-question">"${escHtml(d.question)}"</div>
        ${answerBlock}
      </div>`;
  }).join('');
}

function openAnswerModal(id, question) {
  currentDoubtId = id;
  document.getElementById('doubt-question-display').textContent = `"${question}"`;
  document.getElementById('doubt-answer').value = '';
  document.getElementById('modal-answer').style.display = 'flex';
}

function searchOnChatGPT() {
  const question = document.getElementById('doubt-question-display').textContent.replace(/^"|"$/g, '');
  window.open('https://chatgpt.com/?q=' + encodeURIComponent(question), '_blank');
}

function searchOnGoogle() {
  const question = document.getElementById('doubt-question-display').textContent.replace(/^"|"$/g, '');
  window.open('https://www.google.com/search?q=' + encodeURIComponent(question), '_blank');
}

async function submitAnswer() {
  const answer = document.getElementById('doubt-answer').value.trim();
  if (!answer) return;
  await fetch(`/api/teacher/doubts/${currentDoubtId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer })
  });
  closeModal('modal-answer');
  loadDoubts();
}

// ─── STUDENTS ───
let editStudentId = null;

async function loadStudents() {
  const res = await fetch('/api/teacher/students');
  const students = await res.json();
  const tbody = document.getElementById('students-tbody');
  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#666">No students yet. Add your first student!</td></tr>';
    return;
  }
  tbody.innerHTML = students.map(s => {
    const initials = s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return `
    <tr>
      <td><div class="name-cell"><div class="student-avatar">${initials}</div>${escHtml(s.name)}</div></td>
      <td>${escHtml(s.class || '')}</td>
      <td><span class="batch-pill">${escHtml(s.batch || '')}</span></td>
      <td>${escHtml(s.school || '')}</td>
      <td>₹${Number(s.fees).toFixed(2)}</td>
      <td>${s.joined_date || ''}</td>
      <td>
        <button class="action-btn" onclick="openEditStudent(${s.id}, ${JSON.stringify(s).replace(/"/g, '&quot;')})">✏️</button>
        <button class="action-btn del" data-delete-id="${s.id}">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function openAddStudent() {
  editStudentId = null;
  document.getElementById('modal-student-title').textContent = 'Add Student';
  ['s-name', 's-password', 's-class', 's-school'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('s-fees').value = '';
  document.getElementById('s-batch').value = '1st Batch';
  // Default joining date to today so teacher only changes it if needed
  document.getElementById('s-joined-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('modal-err').textContent = '';
  document.getElementById('cred-box').style.display = 'none';
  document.getElementById('modal-add-student').style.display = 'flex';
}

function openEditStudent(id, data) {
  editStudentId = id;
  document.getElementById('modal-student-title').textContent = 'Edit Student';
  document.getElementById('s-name').value = data.name || '';
  document.getElementById('s-password').value = '';
  document.getElementById('s-class').value = data.class || '';
  document.getElementById('s-batch').value = data.batch || '1st Batch';
  document.getElementById('s-school').value = data.school || '';
  document.getElementById('s-fees').value = data.fees || '';
  // Populate joining date — fall back to today if not set
  document.getElementById('s-joined-date').value = data.joined_date || new Date().toISOString().slice(0, 10);
  document.getElementById('modal-err').textContent = '';
  document.getElementById('cred-box').style.display = 'none';
  document.getElementById('modal-add-student').style.display = 'flex';
}

async function saveStudent() {
  const err = document.getElementById('modal-err');
  err.textContent = '';
  const name = document.getElementById('s-name').value.trim();
  const password = document.getElementById('s-password').value.trim();
  const cls = document.getElementById('s-class').value.trim();
  const batch = document.getElementById('s-batch').value;
  const school = document.getElementById('s-school').value.trim();
  const fees = document.getElementById('s-fees').value;
  const joinedDate = document.getElementById('s-joined-date').value;  // YYYY-MM-DD

  if (!name) { err.textContent = 'Student name is required.'; return; }

  if (editStudentId) {
    const res = await fetch(`/api/teacher/students/${editStudentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, class: cls, batch, school, fees, joined_date: joinedDate })
    });
    const d = await res.json();
    if (d.success) { closeModal('modal-add-student'); loadStudents(); }
    else err.textContent = d.error || 'Failed.';
  } else {
    const res = await fetch('/api/teacher/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, class: cls, batch, school, fees, joined_date: joinedDate })
    });
    const d = await res.json();
    if (d.success) {
      document.getElementById('cred-login').textContent = d.login_id;
      document.getElementById('cred-pw').textContent = d.password;
      document.getElementById('cred-box').style.display = 'block';
      loadStudents();
      loadDashboard();
    } else {
      err.textContent = d.error || 'Failed.';
    }
  }
}

async function deleteStudent(id) {
  if (!confirm('Delete this student? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/teacher/students/${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.success) {
      await loadStudents();
      await loadDashboard();
    } else {
      alert('Delete failed: ' + (d.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Delete failed: network error. Please try again.');
  }
}

// ─── TASKS ───
let currentTaskStudentId = null;
let uploadedFiles = [];   // array of { name, data } — supports multiple files

async function loadTasks() {
  const studentsRes = await fetch('/api/teacher/students');
  const students = await studentsRes.json();
  const container = document.getElementById('tasks-list');
  if (!students.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#666">Add students first to assign tasks.</div>';
    return;
  }
  container.innerHTML = students.map(s => {
    const initials = s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return `
    <div class="task-assign-card">
      <div style="display:flex;align-items:center">
        <div class="task-student-avatar-sm">${initials}</div>
        <div>
          <div style="font-weight:700;color:#1a1a2e">${escHtml(s.name)}</div>
          <div style="color:#666;font-size:13px">${escHtml(s.batch || '')} • ${escHtml(s.class || '')}</div>
        </div>
      </div>
      <button class="btn-dark" onclick="openTaskModal(${s.user_id}, '${escHtml(s.name)}', '${escHtml(s.batch || '')}')">Assign Task</button>
    </div>`;
  }).join('');
}

function openTaskModal(userId, name, batch) {
  currentTaskStudentId = userId;
  uploadedFiles = [];   // clear files array on each open
  document.getElementById('task-student-name').textContent = name;
  document.getElementById('task-student-batch').textContent = batch;
  document.getElementById('task-title').value = '';
  document.getElementById('task-search-query').value = '';
  document.getElementById('task-items-list').innerHTML = '<div class="task-item-row"><input type="text" placeholder="Task 1" class="task-input"/></div>';
  document.getElementById('uploaded-files-list').innerHTML = '';
  document.getElementById('file-upload').value = '';
  document.getElementById('task-modal-err').style.display = 'none';
  document.getElementById('task-modal-err').textContent = '';
  document.getElementById('modal-assign-task').style.display = 'flex';
}

function addTaskItem() {
  const list = document.getElementById('task-items-list');
  const idx = list.children.length + 1;
  const row = document.createElement('div');
  row.className = 'task-item-row';
  row.innerHTML = `<input type="text" placeholder="Task ${idx}" class="task-input"/>`;
  list.appendChild(row);
}

// Handle multiple file selection — reads each file as base64 and adds to uploadedFiles[]
function handleFileUpload(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  files.forEach(file => {
    // Prevent duplicate names
    if (uploadedFiles.find(f => f.name === file.name)) return;

    const reader = new FileReader();
    reader.onload = e => {
      uploadedFiles.push({ name: file.name, data: e.target.result });
      renderUploadedFiles();
    };
    reader.readAsDataURL(file);
  });

  // Reset the input so the same file can be re-added after removal
  input.value = '';
}

// Render the list of uploaded files with individual remove buttons
function renderUploadedFiles() {
  const list = document.getElementById('uploaded-files-list');
  if (!uploadedFiles.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = uploadedFiles.map((f, idx) => {
    // Truncate long names for display
    const displayName = f.name.length > 30 ? f.name.slice(0, 28) + '…' : f.name;
    const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name);
    return `
    <div style="display:flex;align-items:center;gap:8px;background:var(--cream);border:1.5px solid var(--sand);border-radius:8px;padding:8px 12px">
      <span style="font-size:18px">${isImg ? '🖼' : '📄'}</span>
      <span style="flex:1;font-size:14px;color:var(--ink-2);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(displayName)}</span>
      <button onclick="removeFile(${idx})"
        style="background:var(--red-light);border:none;border-radius:6px;color:var(--red);cursor:pointer;font-size:13px;padding:4px 8px;font-weight:700;font-family:inherit;flex-shrink:0;touch-action:manipulation">✕</button>
    </div>`;
  }).join('');
}

// Remove a file from the list by index
function removeFile(idx) {
  uploadedFiles.splice(idx, 1);
  renderUploadedFiles();
}

// ChatGPT and Google search — uses the title input or a dedicated search field
function openTaskSearch(engine) {
  const query = document.getElementById('task-search-query').value.trim()
    || document.getElementById('task-title').value.trim()
    || 'study material';
  if (engine === 'chatgpt') {
    window.open('https://chatgpt.com/?q=' + encodeURIComponent(query), '_blank');
  } else {
    window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank');
  }
}

async function sendTasks() {
  const err = document.getElementById('task-modal-err');
  err.style.display = 'none';
  err.textContent = '';
  const title = document.getElementById('task-title').value.trim();
  const inputs = document.querySelectorAll('#task-items-list .task-input');
  const items = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
  if (!items.length) {
    err.textContent = 'Add at least one task.';
    err.style.display = 'block';
    return;
  }

  // Send uploadedFiles as JSON array (or empty array if none)
  // study_material is now stored as JSON string: '[{"name":"file.pdf","data":"data:..."}]'
  const res = await fetch('/api/teacher/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_id: currentTaskStudentId,
      title,
      study_material: uploadedFiles.length ? JSON.stringify(uploadedFiles) : '',
      items
    })
  });
  const d = await res.json();
  if (d.success) { closeModal('modal-assign-task'); }
  else { err.textContent = d.error || 'Failed.'; err.style.display = 'block'; }
}

// ─── FEES ───
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CUR_YEAR = new Date().getFullYear();

async function loadFees() {
  const res = await fetch('/api/teacher/fees');
  const students = await res.json();
  const tbody = document.getElementById('fees-tbody');
  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#666">No students yet.</td></tr>';
    return;
  }
  tbody.innerHTML = students.map(s => {
    const pendingSet = new Set(s.fee_months.filter(f => f.status === 'unpaid').map(f => f.month));
    const pills = MONTHS.map(m => {
      const isPending = pendingSet.has(m);
      return `<span class="month-pill ${isPending ? 'pending' : ''}" onclick="toggleFee(${s.user_id}, '${m}', ${CUR_YEAR})">${m}</span>`;
    }).join('');
    return `
    <tr>
      <td><strong>${escHtml(s.name)}</strong></td>
      <td>${escHtml(s.class || '')}</td>
      <td>${escHtml(s.batch || '')}</td>
      <td><div class="month-pills">${pills}</div></td>
      <td><strong>₹${Number(s.total_due).toFixed(2)}</strong></td>
    </tr>`;
  }).join('');
}

async function toggleFee(studentId, month, year) {
  await fetch('/api/teacher/fees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: studentId, month, year })
  });
  loadFees();
}

// ─── UTILS ───
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
});

// Init
loadDashboard();