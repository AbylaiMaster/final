require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const moment = require("moment-timezone");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT;
const MONGO_URI = process.env.MONGO_URI;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const JWT_SECRET = process.env.JWT_SECRET;

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

const taskSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    is_complete: { type: Boolean, default: false },
    due_date: { type: Date, required: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    category: { type: String, default: "" },
});

const Task = mongoose.model("Task", taskSchema);

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

const authenticate = (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) return res.status(401).json({ error: "Unauthorized: No token provided" });

    jwt.verify(token.split(" ")[1], JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.user = decoded;
        next();
    });
};

const sendReminder = async (task, userEmail) => {
    if (!userEmail) {
        console.error("No email found for the user, skipping email notification.");
        return;
    }

    const localTime = moment.utc(task.due_date).tz("Asia/Almaty").format("YYYY-MM-DD HH:mm:ss");

    const mailOptions = {
        from: EMAIL_USER,
        to: userEmail,
        subject: `Reminder: Task "${task.title}" is approaching the deadline!`,
        text: `Hello,\n\nYour task "${task.title}" is approaching its deadline.\n\nDetails:\n- Description: ${task.description}\n- Priority: ${task.priority}\n- Category: ${task.category}\n- Due Date (Local Time): ${localTime}\n\nPlease complete it on time!\n\nBest regards,\nTask Manager System`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email reminder sent to ${userEmail}`);
    } catch (error) {
        console.error("❌ Error sending email:", error);
    }
};

app.post("/register", async (req, res) => {
    try {
        const { email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({ email, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ token });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}); 

app.get("/tasks", authenticate, async (req, res) => {
    const tasks = await Task.find({ user: req.user.id });
    res.json(tasks);
});

app.get("/tasks/filter", authenticate, async (req, res) => {
    const { period } = req.query;
    const now = new Date();
    let endDate;

    if (period === "day") {
        endDate = new Date(now);
        endDate.setDate(now.getDate() + 1);
    } else if (period === "week") {
        endDate = new Date(now);
        endDate.setDate(now.getDate() + 7);
    } else if (period === "month") {
        endDate = new Date(now);
        endDate.setMonth(now.getMonth() + 1);
    } else {
        return res.status(400).json({ error: "Invalid period. Use 'day', 'week', or 'month'." });
    }

    const tasks = await Task.find({ user: req.user.id, due_date: { $gte: now, $lte: endDate } });
    res.json(tasks);
});

app.post("/tasks", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }

        const newTask = new Task({
            ...req.body,
            user: req.user.id,
        });

        await newTask.save();

        const now = new Date();
        const deadline = new Date(newTask.due_date);
        const delay = 0.7 * (deadline.getTime() - now.getTime());

        if (delay > 0) {
            setTimeout(() => sendReminder(newTask, user.email), delay);
        }

        res.status(201).json(newTask);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put("/tasks/:id", authenticate, async (req, res) => {
    try {
        const task = await Task.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, req.body, { new: true });
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json(task);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete("/tasks/:id", authenticate, async (req, res) => {
    try {
        const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.user.id });
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json({ message: "Task deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});