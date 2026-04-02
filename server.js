require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MongoDB Setup ---
const MONGODB_URI = process.env.MONGODB_URI;
let db = null;

const connectDB = async () => {
    if (db) return db;
    if (!MONGODB_URI) {
        console.warn('MONGODB_URI not set. Data will not be persisted.');
        return null;
    }
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('ar-rasikh');
        console.log('Connected to MongoDB Atlas');
        return db;
    } catch (err) {
        console.error('MongoDB connection error:', err);
        return null;
    }
};

// In-memory fallback (when MongoDB is not available)
let memoryEnrollments = [];

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve Static Files (Front-End)
app.use(express.static(path.join(__dirname, '.')));

// --- DB Helper Functions ---
const getEnrollments = async () => {
    const database = await connectDB();
    if (database) {
        return await database.collection('enrollments').find({}).toArray();
    }
    return memoryEnrollments;
};

const addEnrollment = async (data) => {
    const enrollment = {
        ...data,
        id: Date.now(),
        date: new Date().toLocaleString('ur-PK'),
        createdAt: new Date()
    };
    const database = await connectDB();
    if (database) {
        await database.collection('enrollments').insertOne(enrollment);
    } else {
        memoryEnrollments.push(enrollment);
    }
    return enrollment;
};

const deleteEnrollmentById = async (id) => {
    const database = await connectDB();
    if (database) {
        await database.collection('enrollments').deleteOne({ id: parseInt(id) });
    } else {
        memoryEnrollments = memoryEnrollments.filter(e => e.id != id);
    }
};

// --- Notifications ---
const sendEmailAlert = async (studentData) => {
    try {
        if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-email@gmail.com') return;
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
            from: `"الراسخ اکیڈمی" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: 'نیا داخلہ (New Enrollment) - الراسخ اکیڈمی',
            html: `
                <div dir="rtl" style="font-family: Arial; border: 2px solid #104c3e; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #104c3e;">نیا داخلہ فارم موصول ہوا ہے</h2>
                    <p><b>نام:</b> ${studentData.name}</p>
                    <p><b>فون:</b> ${studentData.phone}</p>
                    <p><b>کورس:</b> ${studentData.course}</p>
                    <p><b>تاریخ:</b> ${studentData.date}</p>
                </div>
            `
        });
        console.log('Email sent successfully.');
    } catch (err) {
        console.error('Email Error:', err.message);
    }
};

const sendWhatsAppAlert = async (studentData) => {
    try {
        if (!process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_API_KEY === 'your-callmebot-apikey') return;
        const message = `*نیا داخلہ - الراسخ اکیڈمی*\n\n*نام:* ${studentData.name}\n*فون:* ${studentData.phone}\n*کورس:* ${studentData.course}`;
        const url = `https://api.callmebot.com/whatsapp.php?phone=${process.env.WHATSAPP_ADMIN_NUMBER}&text=${encodeURIComponent(message)}&apikey=${process.env.WHATSAPP_API_KEY}`;
        const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
        await fetch(url);
        console.log('WhatsApp alert sent.');
    } catch (err) {
        console.error('WhatsApp Error:', err.message);
    }
};

// --- JWT Secret ---
const JWT_SECRET = process.env.JWT_SECRET || 'ar-rasikh-secret-2026';

// --- API Routes ---

// 1. Enrollment Submission
app.post('/api/enroll', async (req, res) => {
    const { name, phone, course } = req.body;
    if (!name || !phone || !course) {
        return res.status(400).json({ success: false, message: 'براہ کرم تمام معلومات درست فراہم کریں۔' });
    }
    try {
        const saved = await addEnrollment({ name, phone, course });
        sendEmailAlert(saved);
        sendWhatsAppAlert(saved);
        res.status(200).json({ success: true, message: 'آپ کی درخواست موصول ہو گئی ہے۔ شکریہ!' });
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

// 3. Get Enrollments (Protected)
app.get('/api/admin/enrollments', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ message: 'Access Denied' });
    const token = authHeader.split(' ')[1];
    try {
        jwt.verify(token, JWT_SECRET);
        const enrollments = await getEnrollments();
        res.json({ success: true, data: enrollments });
    } catch (err) {
        res.status(403).json({ message: 'Invalid Token' });
    }
});

// 4. Delete Enrollment (Protected)
app.delete('/api/admin/enrollments/:id', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access Denied' });
    try {
        jwt.verify(token, JWT_SECRET);
        await deleteEnrollmentById(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(403).json({ message: 'Invalid Token' });
    }
});

// 5. Catch-all: serve index.html for any unknown route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Export for Vercel
module.exports = app;

// Local development only
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}
