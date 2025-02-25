require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const moment = require("moment-timezone");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://abylai102006:wKfB69Z9dcf0Ji2I@cluster0.7koen.mongodb.net/web_final?retryWrites=true&w=majority&appName=Cluster0";
const EMAIL_USER = process.env.EMAIL_USER || "alshynkalyev@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "eyug jnwj wuyh rnll";

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: "" },
    is_complete: { type: Boolean, default: false },
    due_date: { type: Date, required: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    category: { type: String, default: "" },
    email: { type: String, required: true }
});

const Task = mongoose.model("Task", taskSchema);

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

const sendReminder = async (task) => {
    const localTime = moment.utc(task.due_date).tz("Asia/Almaty").format("YYYY-MM-DD HH:mm:ss");

    const mailOptions = {
        from: EMAIL_USER,
        to: task.email,
        subject: `Reminder about the task: ${task.title}`,
        text: `Hello! We remind you that the task "${task.title}" is close to the deadline. Finish on time!\n\nDeadline: ${localTime}`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Notification sent to ${task.email}`);
};

app.get("/tasks", async (req, res) => {
    const tasks = await Task.find();
    res.json(tasks);
});

app.get("/tasks/filter", async (req, res) => {
    const { period } = req.query;
    const now = new Date();
    let startDate = now;
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

    const tasks = await Task.find({
        due_date: { $gte: startDate, $lte: endDate },
    });

    res.json(tasks);
});

app.post("/tasks", async (req, res) => {
    try {
        const newTask = new Task(req.body);
        await newTask.save();

        const now = new Date();
        const deadline = new Date(newTask.due_date);
        const delay = 0.7 * (deadline.getTime() - now.getTime());

        if (delay > 0) {
            setTimeout(() => sendReminder(newTask), delay);
        }

        res.status(201).json(newTask);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put("/tasks/:id", async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json(task);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete("/tasks/:id", async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json({ message: "Task deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});