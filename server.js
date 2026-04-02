require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');

const app = express();

// --- MongoDB Setup ---
const MONGODB_URI = process.env.MONGODB_URI || null;
let dbClient = null;
let db = null;

const getDB = async () => {
    if (db) return db;
    if (!MONGODB_URI) return null;
    try {
        if (!dbClient) {
            dbClient = new MongoClient(MONGODB_URI, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000,
            });
            await dbClient.connect();
        }
        db = dbClient.db('ar-rasikh');
        return db;
    } catch (err) {
        console.error('MongoDB Error:', err.message);
        return null;
    }
};

// In-memory fallback
let memStore = [];

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// --- DB Helpers ---
const getEnrollments = async () => {
    try {
        const database = await getDB();
        if (database) {
            return await database.collection('enrollments').find({}).sort({ createdAt: -1 }).toArray();
        }
    } catch (err) {
        console.error('Read error:', err.message);
    }
    return memStore;
};

const addEnrollment = async (data) => {
    const enrollment = {
        ...data,
        id: Date.now(),
        date: new Date().toLocaleString('ur-PK'),
        createdAt: new Date()
    };
    try {
        const database = await getDB();
        if (database) {
            await database.collection('enrollments').insertOne(enrollment);
            return enrollment;
        }
    } catch (err) {
        console.error('Write error:', err.message);
    }
    memStore.push(enrollment);
    return enrollment;
};

const removeEnrollment = async (id) => {
    try {
        const database = await getDB();
        if (database) {
            await database.collection('enrollments').deleteOne({ id: Number(id) });
            return;
        }
    } catch (err) {
        console.error('Delete error:', err.message);
    }
    memStore = memStore.filter(e => e.id != id);
};

// --- Email Notification ---
const sendEmail = async (data) => {
    try {
        const user = process.env.EMAIL_USER;
        const pass = process.env.EMAIL_PASS;
        if (!user || user === 'your-email@gmail.com' || !pass) return;
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
        await transporter.sendMail({
            from: `"الراسخ اکیڈمی" <${user}>`,
            to: user,
            subject: 'نیا داخلہ - الراسخ اکیڈمی',
            html: `<div dir="rtl" style="font-family:Arial;padding:20px;border:2px solid #104c3e;border-radius:10px">
                <h2 style="color:#104c3e">نیا داخلہ فارم موصول ہوا</h2>
                <p><b>نام:</b> ${data.name}</p>
                <p><b>فون:</b> ${data.phone}</p>
                <p><b>کورس:</b> ${data.course}</p>
                <p><b>تاریخ:</b> ${data.date}</p>
            </div>`
        });
    } catch (err) {
        console.error('Email error:', err.message);
    }
};

// --- JWT ---
const JWT_SECRET = process.env.JWT_SECRET || 'ar-rasikh-secret-2026';

// --- API Routes ---

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mongodb: !!db });
});

// 1. Enrollment
app.post('/api/enroll', async (req, res) => {
    const { name, phone, course } = req.body;
    if (!name || !phone || !course) {
        return res.status(400).json({ success: false, message: 'براہ کرم تمام معلومات درست فراہم کریں۔' });
    }
    try {
        const saved = await addEnrollment({ name, phone, course });
        sendEmail(saved); // fire and forget
        res.json({ success: true, message: 'آپ کی درخواست موصول ہو گئی ہے۔ شکریہ!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'سرور میں مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔' });
    }
});

// 2. Admin Login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    if (password === adminPass) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
        return res.json({ success: true, token });
    }
    res.status(401).json({ success: false, message: 'غلط پاس ورڈ!' });
});

// 3. Get Enrollments
app.get('/api/admin/enrollments', async (req, res) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(403).json({ message: 'Access Denied' });
    try {
        jwt.verify(token, JWT_SECRET);
        const data = await getEnrollments();
        res.json({ success: true, data });
    } catch (err) {
        res.status(403).json({ message: 'Invalid Token' });
    }
});

// 4. Delete Enrollment
app.delete('/api/admin/enrollments/:id', async (req, res) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access Denied' });
    try {
        jwt.verify(token, JWT_SECRET);
        await removeEnrollment(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(403).json({ message: 'Invalid Token' });
    }
});

// Catch-all: serve index.html for any unknown route
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Export for Vercel
module.exports = app;

// Local dev only
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
}
