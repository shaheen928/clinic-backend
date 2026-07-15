import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import asyncHandler from "../middleware/asyncHandler.js";
import userModel from "../models/userModel.js";
import admissionModel from "../models/admissionModel.js";

const getDoctorsList = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const doctors = await doctorModel
    .find({
      available: true,
      $or: [
        { scheduledActivationDate: null },
        { scheduledActivationDate: { $lte: new Date(today) } },
      ],
    })
    .select("-password -email");
  res.json({ success: true, doctors });
});

const loginDoctor = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error("Please provide email and password");
  }
  const doctor = await doctorModel.findOne({ email });
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found with this email");
  }
  const isMatch = await bcrypt.compare(password, doctor.password);
  if (!isMatch) {
    res.status(400);
    throw new Error("Invalid credentials");
  }
  const token = jwt.sign({ id: doctor._id }, process.env.JWT_SECRET, {
    expiresIn: "5d",
  });
  res.json({
    success: true,
    token,
    message: `Welcome Back, Dr. ${doctor.name}`,
  });
});

const appointmentDoctor = asyncHandler(async (req, res) => {
  const docId = req.docId;

  const appointments = await appointmentModel
    .find({
      docId,
      isCompleted: false,
      cancelled: false,
    })
    .populate({ path: "docId" })
    .sort({ date: 1, slotTime: 1 });
  const updatedAppointments = [];

  for (const appointment of appointments) {
    const appObj = appointment.toObject();

    let age = "N/A";

    if (appointment.patientDob) {
      const birthDate = new Date(appointment.patientDob);
      const currentDate = new Date();

      let years = currentDate.getFullYear() - birthDate.getFullYear();
      let months = currentDate.getMonth() - birthDate.getMonth();
      let days = currentDate.getDate() - birthDate.getDate();

      if (days < 0) {
        months--;
        const previousMonth = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          0,
        );
        days += previousMonth.getDate();
      }

      if (months < 0) {
        years--;
        months += 12;
      }

      if (years > 0) {
        age = `${years} ${years === 1 ? "Year" : "Years"}`;
      } else if (months > 0) {
        age = `${months} ${months === 1 ? "Month" : "Months"}`;
      } else {
        age = `${days} ${days === 1 ? "Day" : "Days"}`;
      }
    }

    appObj.patientData = {
      name: appointment.patientName || "Unknown Patient",
      gender: appointment.patientGender || "N/A",
      age: age,
    };

    updatedAppointments.push(appObj);
  }

  const isSurgeon =
    appointments.length > 0 ? appointments[0]?.docId?.isSurgeon : false;

  res.json({ success: true, isSurgeon, appointments: updatedAppointments });
});

const appointmentComplete = asyncHandler(async (req, res) => {
  const { appointmentId } = req.body;
  const docId = req.docId;

  const docData = await doctorModel.findById(docId);
  if (!docData || docData.available === false) {
    res.status(400);
    throw new Error(
      "Your account is inactive. You cannot modify appointments.",
    );
  }

  const appointment = await appointmentModel.findById(appointmentId);
  if (!appointment || appointment.docId.toString() !== docId.toString()) {
    res.status(404);
    throw new Error("Appointment not found or unauthorized");
  }
  appointment.isCompleted = true;
  await appointment.save();
  res.json({
    success: true,
    message: "Appointment Marked as Completed Successfully!",
  });
});

const appointmentCancelled = asyncHandler(async (req, res) => {
  const { appointmentId } = req.body;
  const docId = req.docId;
  const docData = await doctorModel.findById(docId);
  if (!docData || docData.available === false) {
    res.status(400);
    throw new Error(
      "Your account is inactive. You cannot modify appointments.",
    );
  }
  const appointment = await appointmentModel.findById(appointmentId);
  if (!appointment || appointment.docId.toString() !== docId.toString()) {
    res.status(404);
    throw new Error("Appointment not found or unauthorized");
  }
  appointment.cancelled = true;
  await appointment.save();
  res.json({ success: true, message: "Appointment Cancelled Successfully!" });
});

const doctorDashboard = asyncHandler(async (req, res) => {
  const docId = req.docId;
  const docData = await doctorModel.findById(docId);

  if (!docData) {
    res.status(404);
    throw new Error("Doctor not found");
  }

  const appointments = await appointmentModel.find({ docId });
  const admissions = await admissionModel.find({ doctorId: docId });

  let earnings = 0;
  let cancelledOPDCount = 0;
  let cancelledSurgeriesCount = 0;
  let activeOPDCount = 0;
  let admittedCount = 0;
  let pendingSurgeriesCount = 0;

  let uniquePatientsSet = new Set();
  let surgerySchedule = [];

  appointments.forEach((item) => {
    const patientName = item.patientName || item.patientData?.name || "Unknown";
    const patientGender =
      item.patientGender || item.patientData?.gender || "N/A";

    if (item.cancelled) {
      cancelledOPDCount += 1;
    } else {
      activeOPDCount += 1;

      const uniquePatientKey = `${patientName.toLowerCase().trim()}_${patientGender.toLowerCase()}`;
      uniquePatientsSet.add(uniquePatientKey);

      if (item.isCompleted && item.payment) {
        const adminCommission =
          item.amount * ((docData.commission || 20) / 100);
        const doctorNetShare = item.amount - adminCommission;
        earnings += doctorNetShare;
      }
    }
  });

  admissions.forEach((admission) => {
    if (
      admission.status === "Cancelled" &&
      admission.admissionType === "Surgery"
    ) {
      cancelledSurgeriesCount += 1;
      return;
    }

    if (
      admission.status === "Admitted" &&
      admission.admissionType === "General"
    ) {
      admittedCount += 1;
    }

    if (
      admission.status === "Scheduled" &&
      admission.admissionType === "Surgery"
    ) {
      pendingSurgeriesCount += 1;

      surgerySchedule.push({
        id: admission._id,
        patientName:
          admission.patientName || admission.patientData?.name || "Patient",
        surgeryName: admission.surgeryDetails?.surgeryName || "General Surgery",
        date: admission.surgeryDetails?.surgeryDate,
        time: admission.surgeryDetails?.surgeryTime,
        theater: admission.surgeryDetails?.operationTheater || "OT-1",
        urgency: admission.surgeryDetails?.urgency || "Routine",
      });
    }

    if (
      admission.admissionType === "Surgery" &&
      admission.surgeryDetails?.surgeryStatus === "Completed"
    ) {
      const surgeryFee = admission.surgeryDetails.surgeryFee || 0;
      const adminCommission = surgeryFee * ((docData.commission || 20) / 100);
      const doctorNetSurgeryShare = surgeryFee - adminCommission;
      earnings += doctorNetSurgeryShare;
    }

    if (admission.totalRounds > 0) {
      const perRoundFee = docData?.roundFee || 0;
      const totalRoundAmount = admission.totalRounds * perRoundFee;

      const adminCommission =
        totalRoundAmount * ((docData.commission || 20) / 100);
      const doctorNetRoundShare = totalRoundAmount - adminCommission;

      earnings += doctorNetRoundShare;
    }
  });

  surgerySchedule.sort(
    (a, b) => new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`),
  );

  const rawLeast = [...appointments].reverse().slice(0, 5);
  const latestAppointments = [];
  for (const appointment of rawLeast) {
    const appObj = appointment.toObject();
    appObj.userData = {
      name:
        appointment.patientName || appointment.patientData?.name || "Patient",
    };
    latestAppointments.push(appObj);
  }

  const dashData = {
    earnings: Math.round(earnings),
    appointments: activeOPDCount,
    cancelledAppointments: cancelledOPDCount,
    cancelledSurgeries: cancelledSurgeriesCount,
    patients: uniquePatientsSet.size,
    admittedPatients: admittedCount,
    pendingSurgeries: pendingSurgeriesCount,
    surgerySchedule,
    latestAppointments,
  };

  res.json({ success: true, dashData });
});

const doctorProfile = asyncHandler(async (req, res) => {
  const docId = req.docId;
  if (!docId) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired doctor session token",
    });
  }

  const doctorData = await doctorModel
    .findById(docId)
    .select(
      "name email speciality fees commission roundFee about available weeklySchedule slots_booked durationEffectiveFrom slotDuration slotDurationHistory isSurgeon",
    );
  if (doctorData) {
    res.json({ success: true, doctorData });
  } else {
    res.status(404).json({ success: false, message: "Doctor not found" });
  }
});

const blockDoctorSlots = asyncHandler(async (req, res) => {
  const docId = req.docId;
  const { slotDate, slotsToBlock } = req.body;
  if (!slotDate || !slotsToBlock || !Array.isArray(slotsToBlock)) {
    res.status(400);
    throw new Error("Missing details or invalid slots format");
  }
  const docData = await doctorModel.findById(docId);
  if (!docData) {
    res.status(404);
    throw new Error("Doctor not found");
  }
  if (docData.available === false) {
    const today = new Date().toISOString().split("T")[0];
    const isFutureDoctor =
      docData.scheduledActivationDate &&
      docData.scheduledActivationDate.toISOString().split("T")[0] > today;
    if (!isFutureDoctor) {
      res.status(400);
      throw new Error(
        "Your account is currently inactive. You cannot modify slots.",
      );
    }
  }
  if (docData.scheduledActivationDate) {
    const activationFormated = docData.scheduledActivationDate
      .toISOString()
      .split("T")[0];
    if (slotDate < activationFormated) {
      res.status(400);
      throw new Error(
        `You cannot block slots before your official joining date (${activationFormated}).`,
      );
    }
  }

  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayName = daysOfWeek[new Date(slotDate).getDay()];
  const dayConfig = docData.weeklySchedule
    ? docData.weeklySchedule[dayName]
    : null;
  if (dayConfig && dayConfig.isAvailable === false) {
    res.status(400);
    throw new Error(
      `This date (${slotDate}) is already set as an 'Off Day' (${dayName}) in your weekly schedule.`,
    );
  }

  let slots_booked = docData.slots_booked || {};
  let currentDaySlots = slots_booked[slotDate] || [];

  for (let time of slotsToBlock) {
    const isBookedBypatient = currentDaySlots.find(
      (slot) => slot.time === time && slot.status === "booked",
    );
    if (isBookedBypatient) {
      res.status(400);
      throw new Error(
        `A patient has already booked this time slot (${time}) and it cannot be blocked.`,
      );
    }
    const isAlreadyBlocked = currentDaySlots.find(
      (slot) => slot.time === time && slot.status === "blocked_by_doctor",
    );
    if (!isAlreadyBlocked) {
      currentDaySlots.push({
        time: time,
        status: "blocked_by_doctor",
      });
    }
  }
  slots_booked[slotDate] = currentDaySlots;
  await doctorModel.findByIdAndUpdate(docId, { slots_booked });
  res.json({
    success: true,
    message: "Your selected slots have been successfully blocked",
  });
});

const updateSlotDuration = asyncHandler(async (req, res) => {
  const docId = req.docId;

  const { slotDuration, effectiveDate } = req.body;

  if (!slotDuration || !effectiveDate) {
    res.status(400);
    throw new Error("Please provide slot duration and effective date");
  }
  const today = new Date().toISOString().split("T")[0];
  if (effectiveDate < today) {
    res.status(400);
    throw new Error("Please select a future date only.");
  }

  const docData = await doctorModel.findById(docId);
  if (!docData) {
    res.status(404);
    throw new Error("Doctor not found");
  }
  if (docData.scheduledActivationDate) {
    const activationFormated = docData.scheduledActivationDate
      .toISOString()
      .split("T")[0];
    if (effectiveDate < activationFormated) {
      res.status(400);
      throw new Error(
        `The effective date cannot be earlier than your official joining date (${activationFormated}).`,
      );
    }
  }
  if (docData.available === false) {
    const isFutureDoctor =
      docData.scheduledActivationDate &&
      docData.scheduledActivationDate.toISOString().split("T")[0] > today;
    if (!isFutureDoctor) {
      res.status(400);
      throw new Error(
        "Your account is currently inactive. You cannot modify slots or schemes.",
      );
    }
  }
  const slots_booked = docData.slots_booked || {};
  const hasFutureBookings = Object.keys(slots_booked).some((dateKey) => {
    if (dateKey >= effectiveDate) {
      return slots_booked[dateKey].some((slot) => slot.status === "booked");
    }
    return false;
  });
  if (hasFutureBookings) {
    res.status(400);
    throw new Error(
      `There are already patient bookings on or after ${effectiveDate}. Please choose a different date.`,
    );
  }
  docData.slotDuration = Number(slotDuration);
  docData.durationEffectiveFrom = effectiveDate;

  if (!docData.slotDurationHistory) {
    docData.slotDurationHistory = [];
  }
  docData.slotDurationHistory.push({
    slotDuration: Number(slotDuration),
    effectiveFrom: effectiveDate,
  });
  await docData.save();
  res.json({
    success: true,
    message: `Your appointment duration has been successfully set to ${slotDuration} minutes starting from ${effectiveDate}.`,
  });
});

const createAdmission = asyncHandler(async (req, res) => {
  const { appointmentId, admissionType, surgeryDetails, notes } = req.body;
  const doctorId = req.docId;

  if (!appointmentId || !admissionType) {
    res.status(400);
    throw new Error("Appointment ID and Admission Type are required");
  }

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }

  if (admissionType === "Surgery" && !doctor.isSurgeon) {
    res.status(403);
    throw new Error(
      "Access Denied: Only surgeons are authorized to schedule operations!",
    );
  }

  const alreadyAdmitted = await admissionModel.findOne({ appointmentId });
  if (alreadyAdmitted) {
    res.status(400);
    throw new Error(
      "This patient has already been admitted or scheduled for surgery!",
    );
  }

  if (admissionType === "General") {
    const newGeneralAdmission = await admissionModel.create({
      doctorId,
      appointmentId,
      admissionType: "General",
      status: "Awaiting Bed",
      notes,
      surgeryDetails: { hasSurgery: false },
    });

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      isCompleted: true,
      admissionStatus: "General",
    });

    return res.status(201).json({
      success: true,
      message: "Admission recommended! Sent to Admin for Bed Allocation. ⏳",
      data: newGeneralAdmission,
    });
  }

  if (admissionType === "Surgery") {
    const { surgeryDate, durationHours, theaterNo, surgeryName, surgeryFee } =
      surgeryDetails || {};

    if (!surgeryDate || !durationHours || !theaterNo || !surgeryName) {
      res.status(400);
      throw new Error("Please provide complete surgery details");
    }

    const reqStartTime = new Date(surgeryDate);
    const reqEndTime = new Date(
      reqStartTime.getTime() + Number(durationHours) * 60 * 60 * 1000,
    );

    const conflictExist = await admissionModel.findOne({
      admissionType: "Surgery",
      status: { $in: ["Admitted", "Scheduled"] },
      "surgeryDetails.theaterNo": theaterNo,
      "surgeryDetails.surgeryStatus": "Pending",
      "surgeryDetails.surgeryDate": { $gte: reqStartTime, $lt: reqEndTime },
    });

    if (conflictExist) {
      res.status(400);
      throw new Error(
        `Operation Theater ${theaterNo} is already booked during this time range!`,
      );
    }

    const newSurgeryAdmission = await admissionModel.create({
      doctorId,
      appointmentId,
      admissionType: "Surgery",
      status: "Scheduled",
      notes,
      surgeryDetails: {
        hasSurgery: true,
        surgeryName,
        surgeryDate,
        durationHours: Number(durationHours),
        theaterNo,
        surgeryFee: Number(surgeryFee) || 0,
        surgeryStatus: "Pending",
      },
    });

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      isCompleted: true,
      admissionStatus: "Surgery",
    });

    return res.status(201).json({
      success: true,
      message: `Operation Scheduled Successfully for ${durationHours} Hour(s)! 📆`,
      data: newSurgeryAdmission,
    });
  }
});

const getAdmissionsList = asyncHandler(async (req, res) => {
  const doctorId = req.docId;

  const admissions = await admissionModel
    .find({
      doctorId,
      status: { $in: ["Admitted", "Scheduled", "Awaiting Bed"] },
    })
    .populate({
      path: "appointmentId",
    })
    .populate({
      path: "doctorId",
      select: "isSurgeon",
    })
    .sort({ createdAt: 1 });

  let isSurgeon = false;
  if (admissions.length > 0) {
    isSurgeon = admissions[0]?.doctorId?.isSurgeon || false;
  } else {
    const doctor = await doctorModel.findById(doctorId);
    isSurgeon = doctor?.isSurgeon || false;
  }

  return res.status(200).json({
    success: true,
    isSurgeon,
    data: admissions,
  });
});
const completeSurgery = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const admission = await admissionModel.findById(id);

  if (!admission) {
    res.status(404);
    throw new Error("Admission record not found");
  }

  admission.status = "Admitted";
  admission.surgeryDetails.surgeryStatus = "Completed";

  admission.notes = `${admission.notes || ""} | [Surgery Completed]`;

  await admission.save();

  return res.status(200).json({
    success: true,
    message: "Surgery completed! Patient is now in ward. 🏥",
    data: admission,
  });
});

const dischargePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { dischargeNotes } = req.body;

  const admission = await admissionModel.findById(id);

  if (!admission) {
    res.status(404);
    throw new Error("Admission record not found");
  }

  admission.status = "Discharged";

  admission.dischargeStatus = "Pending Clearance";

  admission.dischargeDate = new Date();

  if (dischargeNotes) {
    admission.notes = `${admission.notes || ""} | Discharge Notes: ${dischargeNotes}`;
  }

  await admission.save();

  return res.status(200).json({
    success: true,
    message:
      "Medical discharge initiated. Sent to billing counter for clearance! 💳",
    data: admission,
  });
});

const getBookedSlots = asyncHandler(async (req, res) => {
  const { date, theaterNo } = req.query;

  if (!date || !theaterNo) {
    res.status(400);
    throw new Error("Date and Theater Number are required");
  }

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const bookings = await admissionModel
    .find({
      admissionType: "Surgery",
      "surgeryDetails.theaterNo": theaterNo,
      "surgeryDetails.surgeryStatus": "Pending",
      "surgeryDetails.surgeryDate": { $gte: startOfDay, $lte: endOfDay },
    })
    .select(
      "surgeryDetails.surgeryDate surgeryDetails.durationHours surgeryDetails.surgeryName",
    );

  const formattedSlots = bookings.map((item) => {
    const startTime = new Date(item.surgeryDetails.surgeryDate);
    const endTime = new Date(
      startTime.getTime() + item.surgeryDetails.durationHours * 60 * 60 * 1000,
    );

    return {
      surgeryName: item.surgeryDetails.surgeryName,
      start: startTime,
      end: endTime,
      displayTime: `${startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} - ${endTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
    };
  });

  return res.status(200).json({
    success: true,
    slots: formattedSlots,
  });
});

const markPatientRound = asyncHandler(async (req, res) => {
  const { admissionId } = req.params;

  const admission = await admissionModel
    .findById(admissionId)
    .populate("doctorId");

  if (!admission) {
    res.status(404);
    throw new Error("Admission record not found");
  }

  if (admission.status === "Discharged") {
    res.status(400);
    throw new Error("Cannot mark round for a discharged patient");
  }

  admission.totalRounds += 1;

  await admission.save();

  res.status(200).json({
    success: true,
    message: "Round marked successfully! 🩺",
    totalRounds: admission.totalRounds,
  });
});

const cancelSurgery = asyncHandler(async (req, res) => {
  const { admissionId } = req.body;
  const docId = req.docId;

  const admissionRecord = await admissionModel.findById(admissionId);

  if (!admissionRecord) {
    res.status(404);
    throw new Error("Surgery record not found");
  }

  if (admissionRecord.doctorId.toString() !== docId.toString()) {
    res.status(403);
    throw new Error("Unauthorized: You cannot cancel this surgery");
  }

  if (admissionRecord.admissionType !== "Surgery") {
    res.status(400);
    throw new Error("This record is not a surgery type");
  }

  if (admissionRecord.surgeryDetails?.surgeryStatus === "Completed") {
    res.status(400);
    throw new Error("Cannot cancel a surgery that is already completed");
  }

  admissionRecord.status = "Cancelled";
  if (admissionRecord.surgeryDetails) {
    admissionRecord.surgeryDetails.surgeryStatus = "Cancelled";
  }

  await admissionRecord.save();

  if (admissionRecord.appointmentId) {
    await appointmentModel.findByIdAndUpdate(admissionRecord.appointmentId, {
      admissionStatus: "None",
    });
  }

  res.json({
    success: true,
    message: "Surgery has been cancelled successfully",
  });
});

export {
  getDoctorsList,
  loginDoctor,
  appointmentDoctor,
  appointmentComplete,
  appointmentCancelled,
  doctorDashboard,
  doctorProfile,
  blockDoctorSlots,
  updateSlotDuration,
  createAdmission,
  getAdmissionsList,
  completeSurgery,
  dischargePatient,
  getBookedSlots,
  markPatientRound,
  cancelSurgery,
};
