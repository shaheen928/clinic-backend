import express from "express";
import {
  appointmentCancelled,
  appointmentComplete,
  appointmentDoctor,
  blockDoctorSlots,
  cancelSurgery,
  completeSurgery,
  createAdmission,
  dischargePatient,
  doctorDashboard,
  doctorProfile,
  getAdmissionsList,
  getBookedSlots,
  getDoctorsList,
  loginDoctor,
  markPatientRound,
  updateSlotDuration,
} from "../controller/doctorController.js";
import authDoctor from "../middleware/authDoctor.js";

const doctorRouter = express.Router();

doctorRouter.get("/list", getDoctorsList);
doctorRouter.post("/login", loginDoctor);
doctorRouter.get("/appointments", authDoctor, appointmentDoctor);
doctorRouter.post("/complete-appointment", authDoctor, appointmentComplete);
doctorRouter.post("/cancel-appoinrment", authDoctor, appointmentCancelled);
doctorRouter.get("/get-profile", authDoctor, doctorProfile);
doctorRouter.get("/doctor-dashboard", authDoctor, doctorDashboard);
doctorRouter.post("/block-slots", authDoctor, blockDoctorSlots);
doctorRouter.post("/update-duration", authDoctor, updateSlotDuration);
doctorRouter.post("/create-admission", authDoctor, createAdmission);
doctorRouter.get("/admissions-list", authDoctor, getAdmissionsList);
doctorRouter.put("/complete-surgery/:id", authDoctor, completeSurgery);
doctorRouter.put("/discharge-patient/:id", authDoctor, dischargePatient);
doctorRouter.get("/booked-slots", authDoctor, getBookedSlots);
doctorRouter.post("/mark-round/:admissionId", authDoctor, markPatientRound);
doctorRouter.post("/cancel-surgery", authDoctor, cancelSurgery);

export default doctorRouter;
