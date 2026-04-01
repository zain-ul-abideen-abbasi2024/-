require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'enrollments.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    if (req.method === 'POST') console.log('Body:', req.body);
    next();
});

app.use(express.static(path.join(__dirname, '.')));

// Helper function to read/write JSON
const readEnrollments = () => {
    if (!fs.existsSync(DATA_FILE)) return [];
    const data = fs.readFileSync(DATA_FILE);
    return JSON.parse(data);
};

const saveEnrollment = (newEnroll) => {
    const enrollments = readEnrollments();
    newEnroll.id = Date.now();
    newEnroll.date = new Date().toLocaleString('ur-PK');
    enrollments.push(newEnroll);
    fs.writeFileSync(DATA_FILE, JSON.stringify(enrollments, null, 2));
    return newEnroll;
};

// --- Notifications ---

// Email Notification
const sendEmailAlert = async (studentData) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: `"الراسخ اکیڈمی" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER, // Alret yourself
            subject: 'نیا داخلہ (New Enrollment) - الراسخ اکیڈمی',
            html: `
                <div dir="rtl" style="font-family: Arial, sans-serif; border: 1px solid #104c3e; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #104c3e;">نیا داخلہ فارم موصول ہوا ہے</h2>
                    <p><b>نام:</b> ${studentData.name}</p>
                    <p><b>فون:</b> ${studentData.phone}</p>
                    <p><b>کورس:</b> ${studentData.course}</p>
                    <p><b>تاریخ:</b> ${studentData.date}</p>
                </div>
            `
        };

        if (process.env.EMAIL_USER !== 'your-email@gmail.com') {
            await transporter.sendMail(mailOptions);
            console.log('Email alert sent.');
        }
    } catch (error) {
        console.error('Email Error:', error);
    }
};

// WhatsApp Notification placeholder
const sendWhatsAppAlert = async (studentData) => {
    try {
        const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER;
        // Example with CallMeBot (Personal Notification)
        // URL: https://api.callmebot.com/whatsapp.php?phone=[number]&text=[message]&apikey=[key]
        
        const message = `*نیا داخلہ (Ar-Rasikh Academy)*\n\n*نام:* ${studentData.name}\n*فون:* ${studentData.phone}\n*کورس:* ${studentData.course}\n*تاریخ:* ${studentData.date}`;
        
        if (process.env.WHATSAPP_API_KEY !== 'your-callmebot-apikey') {
            const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
            const url = `https://api.callmebot.com/whatsapp.php?phone=${adminNumber}&text=${encodeURIComponent(message)}&apikey=${process.env.WHATSAPP_API_KEY}`;
            await fetch(url);
            console.log('WhatsApp alert sent.');
        }
    } catch (error) {
        console.error('WhatsApp Error:', error);
    }
};

// --- API Routes ---

// 1. Enrollment Submission
app.post('/api/enroll', async (req, res) => {
    const { name, phone, course } = req.body;
    
    if (!name || !phone || !course) {
        return res.status(400).json({ success: false, message: 'براہ کرم تمام معلومات درست فراہم کریں۔' });
    }

    try {
        const saved = saveEnrollment({ name, phone, course });
        
        // Background alerts
        sendEmailAlert(saved);
        sendWhatsAppAlert(saved);

        res.status(200).json({ success: true, message: 'آپ کی درخواست موصول ہو گئی ہے۔ شکریہ!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'سرور میں مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔' });
    }
});

// 2. Admin Login
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

    if (password === adminPass) {
        const token = jwt.sign({ role: 'admin' }, 'secret_key', { expiresIn: '1h' });
        return res.json({ success: true, token });
    }

    res.status(401).json({ success: false, message: 'غلط پاس ورڈ!' });
});

// 3. Get Enrollments (Protected)
app.get('/api/admin/enrollments', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).send('Access Denied');

    const token = authHeader.split(' ')[1];
    try {
        jwt.verify(token, 'secret_key');
        const enrollments = readEnrollments();
        res.json({ success: true, data: enrollments });
    } catch (err) {
        res.status(403).send('Invalid Token');
    }
});

// 4. Delete Enrollment (Protected)
app.delete('/api/admin/enrollments/:id', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).send('Access Denied');

    try {
        jwt.verify(token, 'secret_key');
        const { id } = req.params;
        let enrollments = readEnrollments();
        enrollments = enrollments.filter(e => e.id != id);
        fs.writeFileSync(DATA_FILE, JSON.stringify(enrollments, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(403).send('Invalid Token');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
