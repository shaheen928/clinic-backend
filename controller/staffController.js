import asyncHandler from "../middleware/asyncHandler.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import staffModel from "../models/staffModel.js";
import admissionModel from "../models/admissionModel.js";
import staffScheduleModel from "../models/staffScheduleModel.js";

 const loginStaff = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const staff = await staffModel.findOne({ email });
  console.log("staff", staff);
  if (!staff) {
    res.status(404);
    throw new Error("Staff member not found");
  }

  const isMatch = await bcrypt.compare(password, staff.password);
  if (!isMatch) {
    res.status(400);
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign({ id: staff._id }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

  res.status(200).json({
    success: true,
    token,
    message: `Welcome back, ${staff.name}!`,
    staff: {
      id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      assignedWard: staff.assignedWard,
    },
  });
});

 const getStaffDashboardData = asyncHandler(async (req, res) => {
  const staffId = req.staffId;

  const staff = await staffModel.findById(staffId).select("name staffType");
  if (!staff) {
    res.status(444);
    throw new Error("Staff member not found");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentDuty = await staffScheduleModel.findOne({
    staffId,
    dutyDate: today,
  });

  const dutyWard = currentDuty ? currentDuty.assignedLocation : "Not Assigned";
  const shiftType = currentDuty ? currentDuty.shift : "Off Duty";

  let shiftTiming = "No Active Shift";
  if (shiftType.toLowerCase() === "morning")
    shiftTiming = "08:00 AM - 04:00 PM";
  if (shiftType.toLowerCase() === "evening")
    shiftTiming = "04:00 PM - 12:00 AM";
  if (shiftType.toLowerCase() === "night") shiftTiming = "12:00 AM - 08:00 AM";

  let filteredAdmissions = [];

  if (dutyWard !== "Not Assigned") {
    const allActiveAdmissions = await admissionModel
      .find({
        status: "Admitted",
      })
      .populate({
        path: "bedId",
        model: "bed",
        select: "bedNumber category",
        options: { strictPopulate: false },
      })
      .populate({
        path: "doctorId",
        model: "doctor",
        select: "name",
        options: { strictPopulate: false },
      })
      .populate({
        path: "appointmentId",
        model: "appointment",
        select: "patientName patientDob patientGender userId",
        options: { strictPopulate: false },
        populate: {
          path: "userId",
          model: "user",
          select: "phone contact email",
          options: { strictPopulate: false },
        },
      });

    filteredAdmissions = allActiveAdmissions.filter((admission) => {
      return admission.bedId && admission.bedId.category === dutyWard;
    });
  }

  res.status(200).json({
    success: true,
    data: {
      staffName: staff.name,
      dutyWard,
      shiftType,
      shiftTiming,
      indoorAdmissions: filteredAdmissions,
    },
  });
});

 const logoutStaff = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Staff logged out successfully from server session.",
  });
});

export {
  logoutStaff,
  getStaffDashboardData,
  loginStaff
};