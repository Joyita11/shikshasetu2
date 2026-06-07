# ShikshaSetu 🎓

A full-stack tuition management platform for teachers and students.

---

## Tech Stack
- **Backend:** Python + Flask
- **Database:** SQLite (file-based, zero setup, easy to deploy)
- **Frontend:** HTML + CSS + Vanilla JavaScript

---

## Project Structure
```
shikshasetu/
├── app.py                 # Flask backend (all API routes)
├── requirements.txt       # Python dependencies
├── shikshasetu.db         # SQLite database (auto-created on first run)
├── static/
│   ├── css/style.css      # All styles
│   └── js/
│       ├── teacher.js     # Teacher dashboard logic
│       └── student.js     # Student dashboard logic
└── templates/
    ├── landing.html       # Homepage
    ├── login.html         # Login page
    ├── signup.html        # Sign up page
    ├── teacher.html       # Teacher dashboard
    └── student.html       # Student dashboard
```

---

## Setup & Run (Local)

### Step 1 – Prerequisites
Make sure you have **Python 3.8+** installed:
```bash
python --version
```

### Step 2 – Create a virtual environment
```bash
cd shikshasetu
python -m venv venv
```

Activate it:
- **Windows:** `venv\Scripts\activate`
- **Mac/Linux:** `source venv/bin/activate`

### Step 3 – Install dependencies
```bash
pip install -r requirements.txt
```

### Step 4 – Run the app
```bash
python app.py
```

### Step 5 – Open in browser
Visit: **http://localhost:5000**

---

## How to Use

### Teacher Flow
1. Go to http://localhost:5000 → click **Sign Up**
2. Select role: **Teacher**, fill name/email/password → Create Account
3. Login as Teacher
4. **Add Students** from the Students tab (creates login credentials for them)
5. **Assign Tasks** to students
6. **Solve Doubts** posted by students
7. **Due Fees** tab – click month pills to mark them as pending (red) or clear (green)

### Student Flow
1. Teacher adds the student (email + password set by teacher)
2. Student logs in at http://localhost:5000/login with role **Student**
3. **Post Doubts** – ask questions, see teacher answers
4. **Assignments** – view tasks, mark them complete
5. **Due Fees** – see pending fees, mark as paid

---

## Deploy to Render (Free Hosting)

### Step 1 – Create a `Procfile`
```
web: python app.py
```

### Step 2 – Update app.py for production port
The app already reads the PORT from environment. Change the last line:
```python
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
```

### Step 3 – Push to GitHub
```bash
git init
git add .
git commit -m "ShikshaSetu initial commit"
git remote add origin https://github.com/YOUR_USERNAME/shikshasetu.git
git push -u origin main
```

### Step 4 – Deploy on Render
1. Go to https://render.com → New → **Web Service**
2. Connect your GitHub repo
3. Set **Build Command:** `pip install -r requirements.txt`
4. Set **Start Command:** `python app.py`
5. Click **Deploy** – you'll get a free `.onrender.com` URL!

> SQLite database persists on Render's disk between deploys.
> For production scale, you can swap SQLite for PostgreSQL (free on Render too) by changing just the `get_db()` function.

---

## Deploy to Railway (Alternative)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

---

## Features

| Feature | Teacher | Student |
|---------|---------|---------|
| Dashboard with stats | ✅ | ✅ |
| Student management (add/edit/delete) | ✅ | – |
| Assign tasks with study material | ✅ | – |
| Mark task completion | – | ✅ |
| Solve student doubts | ✅ | – |
| Post doubts | – | ✅ |
| Fee tracking (month-wise) | ✅ | ✅ |
| Mark fees paid | – | ✅ |
