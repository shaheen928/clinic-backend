import express from "express";
import {
  loginUser,
  registerUser,
  bookAppointment,
  listAppointment,
  cancelAppointment,
  userUpdateProfile,
  getAllDoctorsForUsers,
  getDoctorDetails,
  verifyStripe,
  payExistingAppointment,
  sendOTP,
  resetPassword,
} from "../controller/userController.js";
import authUser from "../middleware/authUser.js";
import {
  getLiveIndoorBill,
  payIndoorBill,
  verifyIndoorPayment,
} from "../controller/billingController.js";

const userRouter = express.Router();

userRouter.post("/send-otp", sendOTP);
userRouter.post("/register", registerUser);
userRouter.put("/update-profile", authUser, userUpdateProfile);
userRouter.post("/login", loginUser);
userRouter.post("/reset-password", resetPassword);

userRouter.post("/book-appointment", authUser, bookAppointment);
userRouter.post("/pay-appointment", authUser, payExistingAppointment);
userRouter.get("/appointments", authUser, listAppointment);
userRouter.put("/cancel-appointment", authUser, cancelAppointment);
userRouter.get("/doctors", getAllDoctorsForUsers);
userRouter.get("/doctors/:id", getDoctorDetails);
userRouter.post("/verify-stripe", authUser, verifyStripe);
userRouter.get("/live-bill/:id", authUser, getLiveIndoorBill);
userRouter.post("/pay-indoor-bill", authUser, payIndoorBill);
userRouter.post("/verify-indoor-bill", authUser, verifyIndoorPayment);

export default userRouter;
