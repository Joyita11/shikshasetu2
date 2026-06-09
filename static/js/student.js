// ─── SIDEBAR MOBILE ───
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

// ─── NAVIGATION ───
// NOTE: We use only 'click' events (NOT touchend) because:
//   1. touch-action:manipulation in CSS already removes the 300ms delay
//   2. touchend fires before the browser processes z-index, causing overlay to steal the tap
//   3. click is reliable across all devices once the delay is gone
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
  if (name === 'assignments') loadAssignments();
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

});

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

const QUOTES = [
  { text: '"Your education is a dress rehearsal for a life that is yours to lead."', author: '— Theodore Roosevelt' },
  { text: '"Education is the most powerful weapon which you can use to change the world."', author: '— Nelson Mandela' },
  { text: '"The beautiful thing about learning is that no one can take it away from you."', author: '— B.B. King' },
  { text: '"An investment in knowledge pays the best interest."', author: '— Benjamin Franklin' },
];

// ─── DASHBOARD ───
async function loadDashboard() {
  const meRes = await fetch('/api/me');
  const me = await meRes.json();
  const firstName = me.name ? me.name.split(' ')[0] : 'Dreamer';
  document.getElementById('stu-greeting').textContent = `Hello, ${firstName}! 👋`;

  const res = await fetch('/api/student/stats');
  const d = await res.json();

  document.getElementById('stu-pending-tasks').innerHTML = `${d.pending_tasks} <span style="font-size:16px;color:#666">Items</span>`;
  document.getElementById('stu-completed-tasks').textContent = `↑${d.completed_tasks} Completed`;
  document.getElementById('stu-fees-status').textContent = d.fees_status;
  document.getElementById('stu-fees-status').style.color = d.fees_status === 'UNPAID' ? '#e74c3c' : '#22c55e';
  document.getElementById('stu-fees-due').textContent = d.total_due > 0 ? `Due: ₹${d.total_due}` : 'All clear!';

  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  document.getElementById('quote-text').textContent = q.text;
  document.getElementById('quote-author').textContent = q.author;
}

// ─── DOUBTS ───
async function loadDoubts() {
  const res = await fetch('/api/student/doubts');
  const doubts = await res.json();
  const list = document.getElementById('recent-doubts-list');
  if (!doubts.length) {
    list.innerHTML = '<div style="color:#666;font-size:14px">No doubts posted yet.</div>';
    return;
  }
  list.innerHTML = doubts.map(d => {
    const statusBadge = d.status === 'solved'
      ? '<span class="doubt-status-solved">Solved</span>'
      : '<span class="doubt-status-pending">pending</span>';
    const date = new Date(d.created_at).toLocaleString();
    let answerBlock = '';
    if (d.answer || d.answer_files) {
      let filesHtml = '';
      if (d.answer_files) {
        try {
          const files = JSON.parse(d.answer_files);
          if (Array.isArray(files) && files.length) {
            filesHtml = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">` +
              files.map(f => {
                const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name);
                return `<a href="${f.data}" download="${escHtml(f.name)}"
                  style="display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#16a34a;border:1.5px solid #86efac;border-radius:7px;padding:5px 10px;font-size:12px;font-weight:700;text-decoration:none">
                  ${isImg ? '🖼' : '📄'} ${escHtml(f.name)}
                </a>`;
              }).join('') + `</div>`;
          }
        } catch(e) {}
      }
      answerBlock = `<div style="background:#f0fdf4;border-radius:8px;padding:10px;margin-top:10px;font-size:13px;color:#374151;border-left:3px solid #22c55e">
        <strong>Teacher:</strong> ${d.answer ? escHtml(d.answer) : '<em style="color:#6b7280">See attached file(s) below</em>'}
        ${filesHtml}
      </div>`;
    }
    return `
    <div class="doubt-card-student">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        ${statusBadge}
        <span style="font-size:12px;color:#9ca3af">${date}</span>
      </div>
      <div style="font-weight:700;color:#1a1a2e">${escHtml(d.subject)}</div>
      <div style="color:#666;font-size:14px;margin-top:4px">${escHtml(d.question)}</div>
      ${answerBlock}
    </div>`;
  }).join('');
}

async function submitDoubt() {
  const subject = document.getElementById('doubt-subject').value;
  const question = document.getElementById('doubt-question').value.trim();
  const err = document.getElementById('doubt-err');
  const succ = document.getElementById('doubt-succ');
  err.textContent = ''; succ.textContent = '';

  if (!subject || !question) { err.textContent = 'Please fill subject and question.'; return; }

  const res = await fetch('/api/student/doubts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, question })
  });
  const d = await res.json();
  if (d.success) {
    succ.textContent = 'Doubt submitted successfully!';
    document.getElementById('doubt-question').value = '';
    document.getElementById('doubt-subject').value = '';
    loadDoubts();
  } else {
    err.textContent = d.error || 'Failed to submit doubt.';
  }
}

// ─── ASSIGNMENTS ───
async function loadAssignments() {
  const res = await fetch('/api/student/assignments');
  const assignments = await res.json();
  const container = document.getElementById('assignments-list');
  if (!assignments.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#666">No assignments yet.</div>';
    return;
  }
  container.innerHTML = assignments.map(a => {
    const statusBadge = a.status === 'completed'
      ? '<span class="assignment-status-completed">COMPLETED</span>'
      : '<span class="assignment-status-pending">PENDING</span>';
    const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    // study_material is now a JSON array: [{name, data}, ...]
    // Fall back gracefully for old single-file format (bare base64 string)
    let studyMaterialHtml = '';
    if (a.study_material) {
      try {
        const files = JSON.parse(a.study_material);  // new format: array
        if (Array.isArray(files) && files.length) {
          studyMaterialHtml = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">` +
            files.map(f => {
              const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name);
              return `<a href="${f.data}" download="${escHtml(f.name)}"
                style="display:inline-flex;align-items:center;gap:6px;background:var(--teal-light);color:var(--teal);border:1.5px solid var(--teal);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:700;text-decoration:none">
                ${isImg ? '🖼' : '📄'} ${escHtml(f.name)}
              </a>`;
            }).join('') + `</div>`;
        }
      } catch (e) {
        // Old single-file format — render as before
        studyMaterialHtml = `<a href="${a.study_material}" download="study_material"
          style="color:#2563eb;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px">📥 Study Material</a>`;
      }
    }
    const items = a.items.map(item => {
      const isDone = item.completed;
      return `
      <div class="task-check-item" onclick="${isDone ? '' : `completeTask(${item.id})`}">
        <div class="task-check-circle ${isDone ? 'done' : ''}">
          ${isDone ? '✓' : ''}
        </div>
        <span class="${isDone ? 'task-text-done' : ''}">${escHtml(item.description)}</span>
      </div>`;
    }).join('');
    return `
    <div class="assignment-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        ${statusBadge}
        ${studyMaterialHtml}
      </div>
      <div style="color:#666;font-size:14px;margin:6px 0 14px">Assigned on ${date}</div>
      <div style="font-weight:700;margin-bottom:10px">Tasks</div>
      ${items}
    </div>`;
  }).join('');
}

async function completeTask(itemId) {
  await fetch(`/api/student/tasks/${itemId}/complete`, { method: 'POST' });
  loadAssignments();
  loadDashboard();
}

// ─── FEES ───
async function loadFees() {
  const res = await fetch('/api/student/fees');
  const data = await res.json();

  const fees = Array.isArray(data) ? data : (data.fees || []);
  const tbody = document.getElementById('fees-tbody-student');
  if (!fees.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#666">No fee records found.</td></tr>';
    return;
  }

  tbody.innerHTML = fees.map(f => {
    const isPaid = f.status === 'paid';
    const statusBadge = isPaid
      ? '<span class="fee-status-paid">✓ Paid</span>'
      : '<span class="fee-status-unpaid">✗ Unpaid</span>';
    const actionBtn = isPaid
      ? '<span class="completed-action">✓ Completed</span>'
      : `<button class="btn-mark-paid" onclick="markPaid(${f.id})">Mark as Paid</button>`;
    return `
    <tr>
      <td data-label="Month">${escHtml(f.month)}</td>
      <td data-label="Year">${f.year}</td>
      <td data-label="Status">${statusBadge}</td>
      <td data-label="Action">${actionBtn}</td>
      <td data-label="Amount">₹${Number(f.amount).toFixed(2)}</td>
    </tr>`;
  }).join('');
}

async function markPaid(feeId) {
  await fetch(`/api/student/fees/${feeId}/pay`, { method: 'POST' });
  loadFees();
  loadDashboard();
}

// ─── UTILS ───
function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Init
loadDashboard();