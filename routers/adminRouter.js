import express from "express";
import {
  loginAdmin,
  addDoctor,
  allDoctors,
  changeAvailability,
  appointmentsAdmin,
  adminDashboard,
  getDoctorInfo,
  updateDoctorSchedule,
  addStaff,
  getAllStaff,
  changeStaffStatus,
  addBed,
  getAllBeds,
  updateBed,
  updateDoctorProfileByAdmin,
  updateStaff,
  allocateBed,
  assignStaffDuty,
  getAwaitingAdmissions,
  updatePatientLocation,
  payDoctor,
  payStaffSalary,
  addHospitalExpense,
  getStaffSalariesByMonth,
  getAllExpenses,
  getFinancialSummary,
} from "../controller/adminController.js";
import authAdmin from "../middleware/authAdmin.js";
import upload from "../middleware/multer.js";
import {
  getAdminBillingDashboard,
  getLiveIndoorBill,
  markAppointmentAsPaid,
  markBillAsPaidByAdmin,
} from "../controller/billingController.js";

const adminRouter = express.Router();

adminRouter.post("/login", loginAdmin);
adminRouter.post("/add-doctor", authAdmin, upload.single("image"), addDoctor);

adminRouter.get("/all-doctors", authAdmin, allDoctors);
adminRouter.post("/change-availability", authAdmin, changeAvailability);
adminRouter.get("/appointments", authAdmin, appointmentsAdmin);
adminRouter.get("/admin-dashboard", authAdmin, adminDashboard);
adminRouter.post("/update-schedule", updateDoctorSchedule);
adminRouter.get("/doctor-info/:docId", getDoctorInfo);
adminRouter.post("/add-staff", addStaff);
adminRouter.get("/all-staff", getAllStaff);
adminRouter.post("/change-staff-status", changeStaffStatus);
adminRouter.post("/add-bed", authAdmin, addBed);
adminRouter.get("/get-beds", authAdmin, getAllBeds);
adminRouter.put("/update-bed/:bedId", authAdmin, updateBed);
adminRouter.put("/update-doctor/:docId", authAdmin, updateDoctorProfileByAdmin);
adminRouter.put("/update-staff/:staffId", authAdmin, updateStaff);
adminRouter.post("/admissions/allocate-bed", authAdmin, allocateBed);
adminRouter.post("/staff/assign-duty", authAdmin, assignStaffDuty);
adminRouter.get("/admissions/awaiting", authAdmin, getAwaitingAdmissions);
adminRouter.put("/admissions/update-location", updatePatientLocation);
adminRouter.post("/pay-doctor", authAdmin, payDoctor);
adminRouter.post("/pay-staff", authAdmin, payStaffSalary);
adminRouter.post("/add-expense", authAdmin, addHospitalExpense);
adminRouter.get("/staff-salaries", authAdmin, getStaffSalariesByMonth);
adminRouter.get("/expenses", authAdmin, getAllExpenses);
adminRouter.get("/summary", authAdmin, getFinancialSummary);
adminRouter.get("/live-bill/:admissionId", authAdmin, getLiveIndoorBill);
adminRouter.post("/mark-paid", authAdmin, markBillAsPaidByAdmin);
adminRouter.get("/billing-dashboard", authAdmin, getAdminBillingDashboard);
adminRouter.post("/mark-appointment-paid", authAdmin, markAppointmentAsPaid);

export default adminRouter;
