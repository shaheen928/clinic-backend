import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv/config";
import "./config/cronJobs.js";

import userRouter from "./routers/userRouter.js";
import doctorRouter from "./routers/doctorRouter.js";
import adminRouter from "./routers/adminRouter.js";
import connectCloudinary from "./config/cloudinary.js";
import staffRouter from "./routers/staffRouter.js";

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log("Using existing mongoDB connection");
    return;
  }

  try {
    const dbUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!dbUri) {
      throw new Error(
        "Database URI (MONGODB_URI/MONGO_URI) is missing in environment variables!",
      );
    }

    await mongoose.connect(dbUri, {
      bufferCommands: false,
    });

    isConnected = true;
    console.log("mongoDB connected Successfully");
  } catch (error) {
    console.log("Database connection error", error);
  }
};

const app = express();
connectCloudinary();

app.use(async (req, res, next) => {
  await connectDB();
  next();
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

app.use(express.json());

app.use("/api/user", userRouter);
app.use("/api/doctor", doctorRouter);
app.use("/api/admin", adminRouter);
app.use("/api/staff", staffRouter);

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("clinic appointment system Backend is running!");
});

app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    message: err.message,
  });
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`server is running on port http://localhost:${PORT}`);
  });
}

export default app;
