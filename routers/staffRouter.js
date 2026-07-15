import express from "express";
import authStaff from "../middleware/authStaff.js";
import {
  loginStaff,
  getStaffDashboardData,
  logoutStaff,
} from "../controller/staffController.js";

const staffRouter = express.Router();

staffRouter.post("/login", loginStaff);

staffRouter.get("/dashboard", authStaff, getStaffDashboardData);

staffRouter.post("/logout", authStaff, logoutStaff);

export default staffRouter;
