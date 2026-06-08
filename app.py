from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import sqlite3
import os
import hashlib
import secrets
import string
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'shikshasetu_secret_key_2026')

# ── SESSION: stay logged in for 30 days ──
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
# IMPORTANT: Keep False unless you have HTTPS on your custom domain.
# Render's .onrender.com URLs use HTTPS, but setting True can cause issues
# with the free tier's redirects. Leave False for now.
app.config['SESSION_COOKIE_SECURE'] = False

from whitenoise import WhiteNoise
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/', prefix='static')

# ── DB PATH: /data on Render (persistent disk), local fallback ──
DATA_DIR = '/data' if os.path.isdir('/data') else os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DATA_DIR, 'shikshasetu.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def validate_password(password):
    """Returns (ok, error_message). Rules: 8+ chars, 1 uppercase, 1 lowercase, 1 digit."""
    if len(password) < 8:
        return False, 'Password must be at least 8 characters'
    if not any(c.isupper() for c in password):
        return False, 'Password needs at least one uppercase letter (A-Z)'
    if not any(c.islower() for c in password):
        return False, 'Password needs at least one lowercase letter (a-z)'
    if not any(c.isdigit() for c in password):
        return False, 'Password needs at least one number (0-9)'
    return True, ''

def generate_student_login_id(teacher_id, student_name):
    """Auto-generate a short, mobile-friendly login ID for a student.
    Format: firstname + 4 digits, e.g. 'advik3890'
    Stored as-is (no fake email). Easy to read and type on mobile.
    The @setu.local suffix is gone — students just type e.g. advik3890"""
    name_slug = ''.join(c for c in student_name.lower() if c.isalpha())[:8]
    rand = ''.join(secrets.choice(string.digits) for _ in range(4))
    return f"{name_slug}{rand}"

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('teacher', 'student')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        teacher_id INTEGER REFERENCES users(id),
        class TEXT,
        batch TEXT,
        school TEXT,
        fees REAL DEFAULT 0,
        joined_date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS doubts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        teacher_id INTEGER REFERENCES users(id),
        subject TEXT,
        question TEXT,
        answer TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        teacher_id INTEGER REFERENCES users(id),
        title TEXT,
        study_material TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS task_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER REFERENCES tasks(id),
        description TEXT,
        completed INTEGER DEFAULT 0
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES users(id),
        teacher_id INTEGER REFERENCES users(id),
        month TEXT,
        year INTEGER,
        status TEXT DEFAULT 'unpaid',
        amount REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    conn.commit()
    conn.close()

# ─────────────────────────── AUTH ───────────────────────────

@app.route('/')
def index():
    # ── FIX: If already logged in, skip the landing page and go straight to dashboard ──
    # This is why users were being asked to login every time — the landing page
    # never checked the session, so users landed here after every browser open.
    role = session.get('user_role')
    if role == 'teacher':
        return redirect('/teacher')
    if role == 'student':
        return redirect('/student')
    return render_template('landing.html')

@app.route('/login', methods=['GET'])
def login_page():
    # If already logged in, redirect directly to dashboard
    role = session.get('user_role')
    if role == 'teacher':
        return redirect('/teacher')
    if role == 'student':
        return redirect('/student')
    return render_template('login.html')

@app.route('/signup', methods=['GET'])
def signup_page():
    return render_template('signup.html')

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    name = data.get('name','').strip()
    email = data.get('email','').strip()
    password = data.get('password','')
    role = data.get('role','')
    
    if not all([name, email, password, role]):
        return jsonify({'error': 'All fields required'}), 400

    # FIX 3: Validate password strength for teacher self-signup
    if role == 'teacher':
        ok, msg = validate_password(password)
        if not ok:
            return jsonify({'error': msg}), 400

    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)',
                  (name, email, hash_password(password), role))
        conn.commit()
        return jsonify({'success': True})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already exists'}), 400
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email','').strip().lower()
    password = data.get('password','')
    role = data.get('role','')
    
    conn = get_db()
    c = conn.cursor()

    # Accept either the short login ID (e.g. advik3890) or email address
    # LOWER() on both sides so capitalisation never causes "Invalid password" errors
    user = c.execute(
        'SELECT * FROM users WHERE LOWER(email)=? AND password=?',
        (email.lower(), hash_password(password))
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({'error': 'Invalid email or password'}), 401
    
    if user['role'] != role:
        return jsonify({'error': f'This account is registered as a {user["role"]}, not {role}'}), 401

    # Set permanent session so it survives browser restarts
    session.permanent = True
    session['user_id']    = user['id']
    session['user_name']  = user['name']
    session['user_role']  = user['role']
    session['user_email'] = user['email']
    return jsonify({'success': True, 'role': user['role'], 'name': user['name']})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/me')
def me():
    if 'user_id' not in session:
        return jsonify({'error': 'Not logged in'}), 401
    return jsonify({
        'id':    session['user_id'],
        'name':  session['user_name'],
        'role':  session['user_role'],
        'email': session['user_email']
    })

# ─────────────────────────── TEACHER ───────────────────────────

@app.route('/teacher')
def teacher_dashboard():
    if session.get('user_role') != 'teacher':
        return redirect('/')
    return render_template('teacher.html')

@app.route('/api/teacher/stats')
def teacher_stats():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    total_students = c.execute('SELECT COUNT(*) FROM students WHERE teacher_id=?', (uid,)).fetchone()[0]
    
    batches_raw = c.execute('SELECT DISTINCT batch FROM students WHERE teacher_id=? AND batch IS NOT NULL', (uid,)).fetchall()
    active_batches = len([b for b in batches_raw if b['batch']])
    
    pending_fees_students = c.execute('''
        SELECT COUNT(DISTINCT student_id) FROM fees 
        WHERE teacher_id=? AND status="unpaid"
    ''', (uid,)).fetchone()[0]
    
    doubts = c.execute('SELECT COUNT(*) FROM doubts WHERE teacher_id=? AND status="pending"', (uid,)).fetchone()[0]
    
    conn.close()
    return jsonify({
        'total_students': total_students,
        'active_batches': active_batches,
        'pending_fees_students': pending_fees_students,
        'doubts': doubts
    })

# Students
@app.route('/api/teacher/students', methods=['GET'])
def get_students():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    rows = c.execute('''
        SELECT s.id, u.name, s.class, s.batch, s.school, s.fees, s.joined_date, s.user_id
        FROM students s JOIN users u ON s.user_id = u.id
        WHERE s.teacher_id=?
    ''', (uid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/teacher/students', methods=['POST'])
def add_student():
    """
    FIX 4 & 5: Teacher no longer enters email. We auto-generate a unique internal
    login ID so two students with the same name never collide, and deleted+re-added
    students get a fresh account (old login stops working immediately).
    Returns the generated login_id and password so teacher can share with student.
    """
    uid = session.get('user_id')
    data = request.json
    conn = get_db()
    c = conn.cursor()

    name = data.get('name', '').strip()
    if not name:
        conn.close()
        return jsonify({'error': 'Student name is required'}), 400

    # FIX 3: Validate teacher-set password, or auto-generate a strong one
    raw_password = data.get('password', '').strip()
    if raw_password:
        ok, msg = validate_password(raw_password)
        if not ok:
            conn.close()
            return jsonify({'error': msg}), 400
    else:
        # Auto-generate: 10 chars with guaranteed uppercase + digit
        chars = string.ascii_letters + string.digits
        raw_password = (
            secrets.choice(string.ascii_uppercase) +
            secrets.choice(string.digits) +
            ''.join(secrets.choice(chars) for _ in range(8))
        )
        # Shuffle so uppercase/digit aren't always first
        lst = list(raw_password)
        secrets.SystemRandom().shuffle(lst)
        raw_password = ''.join(lst)

    # FIX 4 & 5: Generate unique internal login ID — teacher never sees/sets it
    login_id = generate_student_login_id(uid, name)
    while c.execute('SELECT id FROM users WHERE email=?', (login_id,)).fetchone():
        login_id = generate_student_login_id(uid, name)  # retry on extreme collision

    try:
        c.execute('INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)',
                  (name, login_id, hash_password(raw_password), 'student'))
        student_user_id = c.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Could not create student, please try again'}), 400

    c.execute('''INSERT INTO students (user_id, teacher_id, class, batch, school, fees, joined_date)
                 VALUES (?,?,?,?,?,?,?)''',
              (student_user_id, uid, data.get('class', ''), data.get('batch', ''),
               data.get('school', ''), float(data.get('fees', 0)),
               data.get('joined_date', '') or datetime.now().strftime('%Y-%m-%d')))
    conn.commit()
    conn.close()
    # Return credentials so teacher can share with student (shown once in UI)
    return jsonify({'success': True, 'login_id': login_id, 'password': raw_password})

@app.route('/api/teacher/students/<int:sid>', methods=['PUT'])
def update_student(sid):
    uid = session.get('user_id')
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    stu = c.execute('SELECT user_id FROM students WHERE id=? AND teacher_id=?', (sid, uid)).fetchone()
    if not stu:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    
    c.execute('UPDATE users SET name=? WHERE id=?', (data['name'], stu['user_id']))
    c.execute('''UPDATE students SET class=?, batch=?, school=?, fees=?, joined_date=? WHERE id=?''',
              (data.get('class',''), data.get('batch',''), data.get('school',''),
               float(data.get('fees',0)),
               data.get('joined_date', '') or datetime.now().strftime('%Y-%m-%d'),
               sid))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/teacher/students/<int:sid>', methods=['DELETE'])
def delete_student(sid):
    """
    FIX 1: Proper cascade delete.
    Steps:
      1. Find the student's user_id (verify ownership)
      2. Delete fees, doubts, task_items, tasks for this teacher-student pair
      3. Delete the students row
      4. Delete the users row — this kills login immediately.
         (Safe because auto-generated login IDs are unique per add, so
          re-adding the student creates a brand new account.)
    """
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()

    row = c.execute('SELECT user_id FROM students WHERE id=? AND teacher_id=?', (sid, uid)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Student not found'}), 404

    student_uid = row['user_id']

    # Delete child records for this teacher-student relationship
    c.execute('DELETE FROM fees   WHERE student_id=? AND teacher_id=?', (student_uid, uid))
    c.execute('DELETE FROM doubts WHERE student_id=? AND teacher_id=?', (student_uid, uid))

    task_ids = [r[0] for r in c.execute(
        'SELECT id FROM tasks WHERE student_id=? AND teacher_id=?', (student_uid, uid)
    ).fetchall()]
    for tid in task_ids:
        c.execute('DELETE FROM task_items WHERE task_id=?', (tid,))
    c.execute('DELETE FROM tasks WHERE student_id=? AND teacher_id=?', (student_uid, uid))

    # Delete the student profile row
    c.execute('DELETE FROM students WHERE id=? AND teacher_id=?', (sid, uid))

    # Delete the user account entirely — login_id was auto-generated and unique,
    # so this is safe. Deleted student can no longer log in at all.
    c.execute('DELETE FROM users WHERE id=?', (student_uid,))

    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Doubts
@app.route('/api/teacher/doubts')
def teacher_doubts():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    rows = c.execute('''
        SELECT d.*, u.name as student_name
        FROM doubts d JOIN users u ON d.student_id = u.id
        WHERE d.teacher_id=?
        ORDER BY d.created_at DESC
    ''', (uid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/teacher/doubts/<int:did>/answer', methods=['POST'])
def answer_doubt(did):
    uid = session.get('user_id')
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE doubts SET answer=?, status="solved" WHERE id=? AND teacher_id=?',
              (data['answer'], did, uid))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Tasks
@app.route('/api/teacher/tasks', methods=['GET'])
def teacher_tasks():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    rows = c.execute('''
        SELECT t.id, t.student_id, u.name as student_name, t.title, t.study_material, t.created_at,
               s.batch
        FROM tasks t
        JOIN users u ON t.student_id = u.id
        JOIN students s ON s.user_id = t.student_id AND s.teacher_id = t.teacher_id
        WHERE t.teacher_id=?
        ORDER BY t.created_at DESC
    ''', (uid,)).fetchall()
    
    result = []
    for r in rows:
        items = c.execute('SELECT * FROM task_items WHERE task_id=?', (r['id'],)).fetchall()
        d = dict(r)
        d['items'] = [dict(i) for i in items]
        result.append(d)
    
    conn.close()
    return jsonify(result)

@app.route('/api/teacher/tasks', methods=['POST'])
def create_task():
    uid = session.get('user_id')
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    c.execute('INSERT INTO tasks (student_id, teacher_id, title, study_material) VALUES (?,?,?,?)',
              (data['student_id'], uid, data.get('title',''), data.get('study_material','')))
    task_id = c.lastrowid
    
    for item in data.get('items', []):
        if item.strip():
            c.execute('INSERT INTO task_items (task_id, description) VALUES (?,?)', (task_id, item))
    
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Fees
@app.route('/api/teacher/fees')
def teacher_fees():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    
    students = c.execute('''
        SELECT s.id as student_id, u.name, s.class, s.batch, s.fees, s.user_id
        FROM students s JOIN users u ON s.user_id = u.id
        WHERE s.teacher_id=?
    ''', (uid,)).fetchall()
    
    result = []
    for stu in students:
        fee_rows = c.execute('''SELECT month, year, status FROM fees 
                                WHERE student_id=? AND teacher_id=?
                                ORDER BY year, 
                                CASE month 
                                  WHEN "Jan" THEN 1 WHEN "Feb" THEN 2 WHEN "Mar" THEN 3
                                  WHEN "Apr" THEN 4 WHEN "May" THEN 5 WHEN "Jun" THEN 6
                                  WHEN "Jul" THEN 7 WHEN "Aug" THEN 8 WHEN "Sep" THEN 9
                                  WHEN "Oct" THEN 10 WHEN "Nov" THEN 11 WHEN "Dec" THEN 12
                                END''',
                             (stu['user_id'], uid)).fetchall()
        
        total_due = c.execute('''SELECT COALESCE(SUM(amount),0) FROM fees 
                                 WHERE student_id=? AND teacher_id=? AND status="unpaid"''',
                              (stu['user_id'], uid)).fetchone()[0]
        
        d = dict(stu)
        d['fee_months'] = [dict(f) for f in fee_rows]
        d['total_due'] = total_due
        result.append(d)
    
    conn.close()
    return jsonify(result)

@app.route('/api/teacher/fees', methods=['POST'])
def add_fee():
    uid = session.get('user_id')
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    stu = c.execute('SELECT fees, user_id FROM students WHERE user_id=? AND teacher_id=?',
                    (data['student_id'], uid)).fetchone()
    if not stu:
        conn.close()
        return jsonify({'error': 'Student not found'}), 404
    
    existing = c.execute('SELECT id FROM fees WHERE student_id=? AND teacher_id=? AND month=? AND year=?',
                         (data['student_id'], uid, data['month'], data['year'])).fetchone()
    if existing:
        c.execute('DELETE FROM fees WHERE id=?', (existing['id'],))
    else:
        c.execute('INSERT INTO fees (student_id, teacher_id, month, year, status, amount) VALUES (?,?,?,?,?,?)',
                  (data['student_id'], uid, data['month'], data['year'], 'unpaid', stu['fees']))
    
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ─────────────────────────── STUDENT ───────────────────────────

@app.route('/student')
def student_dashboard():
    if session.get('user_role') != 'student':
        return redirect('/')
    return render_template('student.html')

@app.route('/api/student/info')
def student_info():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    stu = c.execute('''
        SELECT s.*, u.name, u.email
        FROM students s JOIN users u ON s.user_id = u.id
        WHERE s.user_id=?
    ''', (uid,)).fetchone()
    conn.close()
    if stu:
        return jsonify(dict(stu))
    return jsonify({})

@app.route('/api/student/stats')
def student_stats():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    
    pending_items = c.execute('''
        SELECT COUNT(*) FROM task_items ti
        JOIN tasks t ON ti.task_id = t.id
        WHERE t.student_id=? AND ti.completed=0
    ''', (uid,)).fetchone()[0]
    
    completed_items = c.execute('''
        SELECT COUNT(*) FROM task_items ti
        JOIN tasks t ON ti.task_id = t.id
        WHERE t.student_id=? AND ti.completed=1
    ''', (uid,)).fetchone()[0]
    
    total_due = c.execute('''SELECT COALESCE(SUM(amount),0) FROM fees 
                             WHERE student_id=? AND status="unpaid"''', (uid,)).fetchone()[0]
    
    conn.close()
    return jsonify({
        'pending_tasks': pending_items,
        'completed_tasks': completed_items,
        'total_due': total_due,
        'fees_status': 'UNPAID' if total_due > 0 else 'PAID'
    })

@app.route('/api/student/doubts', methods=['GET'])
def student_doubts():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    rows = c.execute('SELECT * FROM doubts WHERE student_id=? ORDER BY created_at DESC', (uid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/student/doubts', methods=['POST'])
def post_doubt():
    uid = session.get('user_id')
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    stu = c.execute('SELECT teacher_id FROM students WHERE user_id=?', (uid,)).fetchone()
    if not stu:
        conn.close()
        return jsonify({'error': 'No teacher assigned'}), 400
    
    c.execute('INSERT INTO doubts (student_id, teacher_id, subject, question) VALUES (?,?,?,?)',
              (uid, stu['teacher_id'], data['subject'], data['question']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/student/assignments')
def student_assignments():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    tasks = c.execute('SELECT * FROM tasks WHERE student_id=? ORDER BY created_at DESC', (uid,)).fetchall()
    result = []
    for t in tasks:
        items = c.execute('SELECT * FROM task_items WHERE task_id=?', (t['id'],)).fetchall()
        d = dict(t)
        d['items'] = [dict(i) for i in items]
        all_done = all(i['completed'] for i in items) if items else False
        d['status'] = 'completed' if all_done else 'pending'
        result.append(d)
    conn.close()
    return jsonify(result)

@app.route('/api/student/tasks/<int:item_id>/complete', methods=['POST'])
def complete_task(item_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE task_items SET completed=1 WHERE id=?', (item_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/student/fees')
def student_fees():
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    rows = c.execute('''SELECT * FROM fees WHERE student_id=? 
                        ORDER BY year DESC,
                        CASE month 
                          WHEN "Jan" THEN 1 WHEN "Feb" THEN 2 WHEN "Mar" THEN 3
                          WHEN "Apr" THEN 4 WHEN "May" THEN 5 WHEN "Jun" THEN 6
                          WHEN "Jul" THEN 7 WHEN "Aug" THEN 8 WHEN "Sep" THEN 9
                          WHEN "Oct" THEN 10 WHEN "Nov" THEN 11 WHEN "Dec" THEN 12
                        END DESC''', (uid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/student/fees/<int:fid>/pay', methods=['POST'])
def mark_fee_paid(fid):
    uid = session.get('user_id')
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE fees SET status="paid" WHERE id=? AND student_id=?', (fid, uid))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)