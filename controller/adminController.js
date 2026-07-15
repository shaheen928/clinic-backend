import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import doctorModel from "../models/doctorModel.js";
import asyncHandler from "../middleware/asyncHandler.js";
import appointmentModel from "../models/appointmentModel.js";
import userModel from "../models/userModel.js";
import staffModel from "../models/staffModel.js";
import bedModel from "../models/bedModel.js";
import admissionModel from "../models/admissionModel.js";
import staffScheduleModel from "../models/staffScheduleModel.js";
import expenseModel from "../models/expenseModel.js";
import doctorPayoutModel from "../models/doctorPayoutModel.js";
import staffSalaryModel from "../models/staffSalaryPaymentModel.js";

const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });
    res.json({ success: true, token });
  } else {
    res.status(401);
    throw new Error("Invalid admin credentials");
  }
});

const addDoctor = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    speciality,
    degree,
    about,
    fees,
    roundFee,
    isSurgeon,
    experience,
    commission,
    joiningDate,
    weeklySchedule,
  } = req.body;
  const imageFile = req.file;
  if (
    !name ||
    !email ||
    !password ||
    !speciality ||
    !degree ||
    !about ||
    !fees ||
    !imageFile ||
    !experience
  ) {
    res.status(400);
    throw new Error("Missing Details to add doctor");
  }

  const exists = await doctorModel.findOne({ email });
  if (exists) {
    res.status(400);
    throw new Error("Doctor with this email already exists");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
    resource_type: "image",
  });
  const imageUrl = imageUpload.secure_url;

  let isAvailable = true;
  let futureActivation = null;
  if (joiningDate) {
    const today = new Date().toISOString().split("T")[0];
    if (joiningDate > today) {
      isAvailable = false;
      futureActivation = new Date(joiningDate);
    }
  }

  const doctorData = {
    name,
    email,
    password: hashedPassword,
    speciality,
    degree,
    about,
    fees: Number(fees),
    roundFee: roundFee ? Number(roundFee) : 0,
    isSurgeon: isSurgeon === "true" || isSurgeon === true ? true : false,
    experience,
    image: imageUrl,
    commission: commission ? Number(commission) : 20,
    available: isAvailable,
    scheduledActivationDate: futureActivation,
    weeklySchedule: weeklySchedule
      ? typeof weeklySchedule === "string"
        ? JSON.parse(weeklySchedule)
        : weeklySchedule
      : undefined,
  };

  const newDoctor = new doctorModel(doctorData);
  await newDoctor.save();

  res.json({ success: true, message: "Doctor Added Successfully" });
});
const getDoctorInfo = asyncHandler(async (req, res) => {
  const { docId } = req.params;
  const doctor = await doctorModel.findById(docId).select("-password");
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }

  res.json({ success: true, doctor });
});

const updateDoctorSchedule = asyncHandler(async (req, res) => {
  const { docId, weeklySchedule } = req.body;
  if (!docId || !weeklySchedule) {
    res.status(400);
    throw new Error("Doctor ID and schedule data are required");
  }
  const doctor = await doctorModel.findById(docId);

  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }

  doctor.weeklySchedule =
    typeof weeklySchedule === "string"
      ? JSON.parse(weeklySchedule)
      : weeklySchedule;
  await doctor.save();
  res.json({
    success: true,
    message: "Doctor weekly shift schedule updated successfully",
    weeklySchedule: doctor.weeklySchedule,
  });
});

const allDoctors = asyncHandler(async (req, res) => {
  const doctors = await doctorModel.find({}).select("-password");

  const paidAppointments = await appointmentModel.find({
    cancelled: false,
    payment: true,
    isCompleted: true,
  });

  const activeAdmissions = await admissionModel.find({});

  const allPayouts = await doctorPayoutModel.find({});

  const doctorsWithWallet = doctors.map((doc) => {
    let opdEarning = 0;
    let surgeryEarning = 0;
    let roundEarning = 0;

    const docIdStr = doc._id.toString();
    const docCommissionRate = doc.commission || 20;
    const docRoundFeeRate = doc.roundFee || 0;

    let rawLedger = [];

    const docAppointments = paidAppointments.filter(
      (app) => app.docId.toString() === docIdStr,
    );
    docAppointments.forEach((item) => {
      const adminShare = item.amount * (docCommissionRate / 100);
      const doctorShare = item.amount - adminShare;
      opdEarning += doctorShare;

      rawLedger.push({
        date: item.date ? new Date(item.date) : new Date(),
        description: `OPD Appointment Share - ${item.patientName}`,
        type: "credit",
        amount: Math.round(doctorShare),
      });
    });

    const docAdmissions = activeAdmissions.filter(
      (adm) => adm.doctorId.toString() === docIdStr,
    );

    docAdmissions.forEach((admission) => {
      const totalRounds = admission.totalRounds || 0;
      if (totalRounds > 0) {
        const totalRoundGrossAmount = totalRounds * docRoundFeeRate;
        const adminRoundShare =
          totalRoundGrossAmount * (docCommissionRate / 100);
        const doctorRoundShare = totalRoundGrossAmount - adminRoundShare;
        roundEarning += doctorRoundShare;

        rawLedger.push({
          date: admission.admissionDate || admission.createdAt,
          description: `Ward Rounds Fee (${totalRounds} Rounds)`,
          type: "credit",
          amount: Math.round(doctorRoundShare),
        });
      }

      if (
        admission.admissionType === "Surgery" &&
        admission.surgeryDetails?.hasSurgery &&
        admission.surgeryDetails?.surgeryStatus === "Completed"
      ) {
        const surgeryFee = admission.surgeryDetails.surgeryFee || 0;
        const surgeryAdminShare = surgeryFee * (docCommissionRate / 100);
        const doctorSurgeryShare = surgeryFee - surgeryAdminShare;
        surgeryEarning += doctorSurgeryShare;

        rawLedger.push({
          date: admission.surgeryDetails.surgeryDate || admission.createdAt,
          description: `Surgery Share - ${admission.surgeryDetails.surgeryName || "Procedure"}`,
          type: "credit",
          amount: Math.round(doctorSurgeryShare),
        });
      }
    });

    const doctorPayouts = allPayouts.filter(
      (payout) => payout.doctor.toString() === docIdStr,
    );

    doctorPayouts.forEach((payout) => {
      rawLedger.push({
        date: payout.createdAt || payout.date,
        description: `Hospital Payout (${payout.paymentMode || "Cash"}) - ${payout.notes || "Disbursement"}`,
        type: "debit",
        amount: Math.round(payout.amountPaid || payout.amount || 0),
      });
    });

    rawLedger.sort((a, b) => new Date(a.date) - new Date(b.date));

    let currentRunningBalance = 0;
    const finalLedgerStatements = rawLedger.map((tx) => {
      if (tx.type === "credit") {
        currentRunningBalance += tx.amount;
      } else {
        currentRunningBalance -= tx.amount;
      }

      return {
        date: tx.date,
        notes: tx.description,
        amountPaid: tx.amount,
        isCredit: tx.type === "credit",
        runningBalance: currentRunningBalance,
      };
    });

    const totalEarned = opdEarning + surgeryEarning + roundEarning;
    const totalPaid = doc.totalPaidToDoctor || 0;
    const netPayable = totalEarned - totalPaid;

    return {
      ...doc._doc,
      totalEarned: Math.round(totalEarned),
      totalPaid: Math.round(totalPaid),
      netPayable: Math.round(netPayable),
      totalDoctorRemaining: Math.round(netPayable),
      payouts: finalLedgerStatements.reverse(),
    };
  });

  res.json({ success: true, doctors: doctorsWithWallet });
});

const changeAvailability = asyncHandler(async (req, res) => {
  const { docId, deactivationDate, reactivationDate } = req.body;
  if (!docId) {
    res.status(400);
    throw new Error("Doctor ID is required");
  }
  if (!docId.match(/^[0-9a-fA-F]{24}$/)) {
    res.status(400);
    throw new Error("Invalid Doctor ID format");
  }
  const docData = await doctorModel.findById(docId);
  if (!docData) {
    res.status(404);
    throw new Error("Doctor Not Found");
  }
  if (deactivationDate) {
    const today = new Date().toISOString().split("T")[0];
    if (deactivationDate < today) {
      res.status(400);
      throw new Error("Deactivation date cannot be in the past.");
    }
    if (reactivationDate && reactivationDate <= deactivationDate) {
      res.status(400);
      throw new Error("Reactivation date must be after deactivation date.");
    }
    docData.deactivationDate = new Date(deactivationDate);
    docData.reactivationDate = reactivationDate
      ? new Date(reactivationDate)
      : null;
    await docData.save();
    return res.json({
      success: true,
      message: "Doctor schedule policy has been set successfully.",
      available: docData.available,
    });
  }

  if (docData.available === true && !deactivationDate) {
    const hasActiveAppointments = await appointmentModel.findOne({
      docId: docId,
      isCompleted: false,
      cancelled: false,
    });
    if (hasActiveAppointments) {
      return res.status(400).json({
        success: false,
        errorType: "ACTIVE_APPOINTMENTS_EXIST",
        message: "Cannot deactivate immediately. Active appointments exist.",
      });
    }
  }
  if (docData.available === false) {
    docData.deactivationDate = null;
    docData.reactivationDate = null;
    docData.scheduledActivationDate = null;
  }
  docData.available = !docData.available;
  await docData.save();

  res.json({
    success: true,
    message: `Doctor availability changed to ${docData.available}`,
    available: docData.available,
  });
});

const appointmentsAdmin = asyncHandler(async (req, res) => {
  const appointments = await appointmentModel.find({}).sort({ date: -1 });
  res.json({ success: true, appointments });
});

const adminDashboard = asyncHandler(async (req, res) => {
  const doctorCount = await doctorModel.countDocuments({});
  const totalAppointmentsCount = await appointmentModel.countDocuments({});
  const cancelledAppointmentsCount = await appointmentModel.countDocuments({
    cancelled: true,
  });

  const uniquePatients = await appointmentModel.distinct("patientName");
  const patientCount = uniquePatients.length;

  const allDocs = await doctorModel.find({});
  const docCommissionMap = {};
  const docRoundFeeMap = {};
  let totalDoctorPaidFromDB = 0;

  allDocs.forEach((d) => {
    docCommissionMap[d._id.toString()] = d.commission || 20;
    docRoundFeeMap[d._id.toString()] = d.roundFee || 0;
    totalDoctorPaidFromDB += d.totalPaidToDoctor || 0;
  });

  const paidAppointments = await appointmentModel.find({
    cancelled: false,
    $or: [{ payment: true }, { isCompleted: true }],
  });

  let adminOPDCommissionEarned = 0;
  let doctorOPDShare = 0;
  let counterCashCollection = 0;
  let onlinePaymentCollection = 0;

  paidAppointments.forEach((item) => {
    const docCommissionRate = docCommissionMap[item.docId.toString()] || 20;
    const adminShare = item.amount * (docCommissionRate / 100);

    adminOPDCommissionEarned += adminShare;
    doctorOPDShare += item.amount - adminShare;

    if (item.paymentMethod === "Cash") {
      counterCashCollection += item.amount;
    } else if (item.paymentMethod === "Stripe") {
      onlinePaymentCollection += item.amount;
    }
  });

  const allAdmissions = await admissionModel
    .find({ status: { $in: ["Admitted", "Discharged"] } })
    .populate("bedId");

  let adminBedRevenue = 0;
  let adminSurgeryCommission = 0;
  let adminRoundCommissionEarned = 0;
  let doctorSurgeryShare = 0;
  let doctorTotalRoundShare = 0;
  let activeRunningBills = 0;

  allAdmissions.forEach((admission) => {
    const start = new Date(admission.admissionDate);
    const end =
      admission.status === "Discharged" && admission.dischargeDate
        ? new Date(admission.dischargeDate)
        : new Date();

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    const pricePerDay = admission.bedId?.pricePerDay || 0;
    const totalBedCharges = diffDays * pricePerDay;

    adminBedRevenue += totalBedCharges;

    const docRoundFee = docRoundFeeMap[admission.doctorId.toString()] || 0;
    const totalRoundCharges = (admission.totalRounds || 0) * docRoundFee;

    const docCommissionRate =
      docCommissionMap[admission.doctorId.toString()] || 20;
    const roundAdminShare = totalRoundCharges * (docCommissionRate / 100);

    adminRoundCommissionEarned += roundAdminShare;
    doctorTotalRoundShare += totalRoundCharges - roundAdminShare;

    let surgeryFee = 0;
    let surgeryAdminShare = 0;

    if (
      admission.admissionType === "Surgery" &&
      admission.surgeryDetails?.hasSurgery &&
      admission.surgeryDetails?.surgeryStatus === "Completed"
    ) {
      surgeryFee = admission.surgeryDetails.surgeryFee || 0;
      surgeryAdminShare = surgeryFee * (docCommissionRate / 100);
      adminSurgeryCommission += surgeryAdminShare;
      doctorSurgeryShare += surgeryFee - surgeryAdminShare;
    }

    const totalAdmissionBill = totalBedCharges + totalRoundCharges + surgeryFee;

    if (admission.status === "Discharged" && admission.isPaid) {
      counterCashCollection += totalAdmissionBill;
    } else if (admission.status === "Admitted") {
      activeRunningBills += totalAdmissionBill;
    }
  });

  const allExpenses = await expenseModel.find({});
  let totalDailyExpenses = 0;
  allExpenses.forEach((exp) => {
    totalDailyExpenses += exp.amount;
  });

  const adminGrossRevenue =
    adminOPDCommissionEarned +
    adminBedRevenue +
    adminSurgeryCommission +
    adminRoundCommissionEarned;

  const currentMonthName = new Date().toLocaleString("default", {
    month: "long",
  });
  const monthlySalaryRecords = await staffSalaryModel.find({
    month: currentMonthName,
  });

  let totalStaffSalariesExpense = 0;
  let paidStaffSalaries = 0;
  let pendingStaffSalaries = 0;

  monthlySalaryRecords.forEach((record) => {
    totalStaffSalariesExpense += record.calculatedSalary || 0;
    paidStaffSalaries += record.amountPaid || 0;
    pendingStaffSalaries += record.remainingBalance || 0;
  });

  const staffList = await staffModel.find({ status: "Active" });
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  staffList.forEach((staff) => {
    const hasRecord = monthlySalaryRecords.some(
      (r) => r.staff.toString() === staff._id.toString(),
    );
    if (!hasRecord) {
      const baseSalary = staff.salary || 0;
      let finalCalculatedSalary = baseSalary;

      const joiningDate = new Date(staff.joiningDate);
      if (
        joiningDate.getFullYear() === currentYear &&
        joiningDate.getMonth() === currentMonth
      ) {
        const joinedDay = joiningDate.getDate();
        const activeDaysFromJoining = totalDaysInMonth - joinedDay + 1;
        const perDaySalary = baseSalary / totalDaysInMonth;
        finalCalculatedSalary = perDaySalary * activeDaysFromJoining;
      }

      if (
        staff.deductInactiveDays === true &&
        staff.inactiveDaysThisMonth > 0
      ) {
        const perDaySalary = baseSalary / totalDaysInMonth;
        const deductionAmount = perDaySalary * staff.inactiveDaysThisMonth;
        finalCalculatedSalary = finalCalculatedSalary - deductionAmount;
      }

      finalCalculatedSalary = Math.round(Math.max(0, finalCalculatedSalary));
      totalStaffSalariesExpense += finalCalculatedSalary;
      pendingStaffSalaries += finalCalculatedSalary;
    }
  });

  const doctorTotalShare =
    doctorOPDShare + doctorSurgeryShare + doctorTotalRoundShare;
  const totalDoctorRemaining = doctorTotalShare - totalDoctorPaidFromDB;

  const totalGlobalPayable = totalDoctorRemaining + pendingStaffSalaries;

  const adminNetProfit =
    adminGrossRevenue - totalDailyExpenses - pendingStaffSalaries;

  const totalHospitalInflow = counterCashCollection + onlinePaymentCollection;

  const totalCashOutflow =
    totalDoctorPaidFromDB + paidStaffSalaries + totalDailyExpenses;

  const netCounterCashInsideSafe = totalHospitalInflow - totalCashOutflow;

  const latestAppointments = await appointmentModel
    .find({})
    .sort({ date: -1 })
    .limit(5);

  let monthlyStatus = {};

  paidAppointments.forEach((app) => {
    let targetDate = app.date ? new Date(app.date) : new Date();
    const month = targetDate.toLocaleDateString("en-US", { month: "short" });
    const docCommissionRate = docCommissionMap[app.docId.toString()] || 20;
    const appAdminShare = app.amount * (docCommissionRate / 100);

    if (!monthlyStatus[month]) {
      monthlyStatus[month] = { name: month, earning: 0, adminRevenue: 0 };
    }

    monthlyStatus[month].earning += app.amount;
    monthlyStatus[month].adminRevenue += appAdminShare;
  });

  allAdmissions.forEach((admission) => {
    if (admission.status === "Discharged" && admission.isPaid) {
      let targetDate = admission.dischargeDate
        ? new Date(admission.dischargeDate)
        : new Date();
      const month = targetDate.toLocaleDateString("en-US", { month: "short" });

      const start = new Date(admission.admissionDate);
      const end = new Date(admission.dischargeDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

      const pricePerDay = admission.bedId?.pricePerDay || 0;
      const totalBedCharges = diffDays * pricePerDay;

      const docRoundFee = docRoundFeeMap[admission.doctorId.toString()] || 0;
      const totalRoundCharges = (admission.totalRounds || 0) * docRoundFee;

      let surgeryFee = 0;
      if (
        admission.admissionType === "Surgery" &&
        admission.surgeryDetails?.hasSurgery &&
        admission.surgeryDetails?.surgeryStatus === "Completed"
      ) {
        surgeryFee = admission.surgeryDetails.surgeryFee || 0;
      }

      const totalAdmissionBill =
        totalBedCharges + totalRoundCharges + surgeryFee;

      const docCommissionRate =
        docCommissionMap[admission.doctorId.toString()] || 20;
      const roundAdminShare = totalRoundCharges * (docCommissionRate / 100);
      const surgeryAdminShare = surgeryFee * (docCommissionRate / 100);
      const admissionAdminRevenue =
        totalBedCharges + roundAdminShare + surgeryAdminShare;

      if (!monthlyStatus[month]) {
        monthlyStatus[month] = { name: month, earning: 0, adminRevenue: 0 };
      }

      monthlyStatus[month].earning += totalAdmissionBill;
      monthlyStatus[month].adminRevenue += admissionAdminRevenue;
    }
  });

  const dashData = {
    doctors: doctorCount,
    patients: patientCount,
    appointments: totalAppointmentsCount,
    cancelledAppointments: cancelledAppointmentsCount,

    totalHospitalInflow,
    totalCashOutflow,
    totalGlobalPayable,
    adminGrossRevenue,
    adminNetProfit,

    adminBedRevenue,
    adminSurgeryCommission,
    adminRoundCommission: adminRoundCommissionEarned,
    adminOPDCommission: adminOPDCommissionEarned,
    counterCash: netCounterCashInsideSafe,
    onlineRevenue: onlinePaymentCollection,
    activeRunningBills,
    totalDailyExpenses,

    totalStaffSalariesExpense,
    paidStaffSalaries,
    pendingStaffSalaries,
    doctorTotalShare,
    totalDoctorPaid: totalDoctorPaidFromDB,
    totalDoctorRemaining,

    latestAppointments,
    graphData: Object.values(monthlyStatus),
  };

  res.json({ success: true, dashData });
});

const addStaff = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    role,
    staffType,
    salary,
    password,
    joiningDate,
    deductInactiveDays,
  } = req.body;

  if (!name || !email || !phone || !role || !staffType || !salary) {
    res.status(400);
    throw new Error("All fields are required");
  }

  if (staffType === "Clinical" && !password) {
    res.status(400);
    throw new Error(
      "Password is required for clinical staff to enable login access.",
    );
  }

  const staffExists = await staffModel.findOne({ email });
  if (staffExists) {
    res.status(400);
    throw new Error("Staff member with this email already exists");
  }

  const staffData = {
    name,
    email,
    phone,
    role,
    staffType,
    salary,
    joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
    deductInactiveDays:
      deductInactiveDays !== undefined ? deductInactiveDays : true,
    inactiveDaysThisMonth: 0,
  };

  if (staffType === "Clinical") {
    staffData.password = password;
  }

  const newStaff = await staffModel.create(staffData);

  res.status(201).json({
    success: true,
    message: "Staff member added successfully",
    staff: {
      id: newStaff._id,
      name: newStaff.name,
      email: newStaff.email,
      staffType: newStaff.staffType,
      role: newStaff.role,
    },
  });
});

const getAllStaff = asyncHandler(async (req, res) => {
  const { role, status, month } = req.query;

  let matchQuery = {};
  if (role) matchQuery.role = role;
  if (status) matchQuery.status = status;

  const today = new Date();
  const currentYear = today.getFullYear();

  const filterMonth =
    month || today.toLocaleString("default", { month: "long" });

  const tempDate = new Date(`${filterMonth} 1, ${currentYear}`);
  const currentMonthIndex = isNaN(tempDate.getTime())
    ? today.getMonth()
    : tempDate.getMonth();

  const totalDaysInMonth = new Date(
    currentYear,
    currentMonthIndex + 1,
    0,
  ).getDate();

  if (month) {
    const filterMonthLastDate = new Date(currentYear, currentMonthIndex + 1, 0);
    matchQuery.$or = [
      { joiningDate: { $lte: filterMonthLastDate.toISOString() } },
      { joiningDate: { $lte: filterMonthLastDate } },
      { joiningDate: { $exists: false } },
    ];
  }

  const staffWithSalaries = await staffModel.aggregate([
    { $match: matchQuery },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "staffsalaries",
        localField: "_id",
        foreignField: "staff",
        pipeline: [{ $match: { month: filterMonth } }],
        as: "salaryData",
      },
    },
    {
      $lookup: {
        from: "staffsalaries",
        localField: "_id",
        foreignField: "staff",
        as: "paymentHistory",
      },
    },
    {
      $addFields: {
        salaryRecordExists: { $gt: [{ $size: "$salaryData" }, 0] },
        actualAmountPaid: {
          $ifNull: [{ $arrayElemAt: ["$salaryData.amountPaid", 0] }, 0],
        },
        dbAdvanceDeduction: {
          $ifNull: [{ $arrayElemAt: ["$salaryData.advanceDeduction", 0] }, 0],
        },
        dbNetPayable: {
          $ifNull: [{ $arrayElemAt: ["$salaryData.netPayable", 0] }, 0],
        },
        dbRemainingBalance: {
          $ifNull: [{ $arrayElemAt: ["$salaryData.remainingBalance", 0] }, 0],
        },
        dbCalculatedSalary: {
          $ifNull: [{ $arrayElemAt: ["$salaryData.calculatedSalary", 0] }, 0],
        },
      },
    },
  ]);

  const finalResult = staffWithSalaries.map((staff) => {
    const actualAmountPaid = Number(staff.actualAmountPaid || 0);
    const baseSalary = Number(staff.salary || 0);
    const currentAdvanceInDB = Number(staff.advanceBalance || 0);

    let rawLedger = [];
    const history = staff.paymentHistory || [];

    history.forEach((salaryRecord) => {
      const earned = salaryRecord.calculatedSalary || baseSalary;
      rawLedger.push({
        date: salaryRecord.createdAt || salaryRecord.date,
        description: `Salary Calculated for ${salaryRecord.month}`,
        type: "credit",
        amount: Math.round(earned),
      });

      if (salaryRecord.advanceDeduction > 0) {
        rawLedger.push({
          date: salaryRecord.createdAt || salaryRecord.date,
          description: `Advance Deducted in ${salaryRecord.month}`,
          type: "debit",
          amount: Math.round(salaryRecord.advanceDeduction),
        });
      }

      if (salaryRecord.amountPaid > 0) {
        rawLedger.push({
          date: salaryRecord.createdAt || salaryRecord.date,
          description: `Salary Disbursed for ${salaryRecord.month}`,
          type: "debit",
          amount: Math.round(salaryRecord.amountPaid),
        });
      }
    });

    rawLedger.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBal = 0;
    const detailedStatements = rawLedger.map((tx) => {
      if (tx.type === "credit") runningBal += tx.amount;
      else runningBal -= tx.amount;

      return {
        date: tx.date,
        notes: tx.description,
        amount: tx.amount,
        isCredit: tx.type === "credit",
        runningBalance: runningBal,
      };
    });

    if (staff.status !== "Active") {
      return {
        ...staff,
        monthlySalary: baseSalary,
        totalPaidMonth: actualAmountPaid,
        balance: 0,
        finalCalculatedSalary: 0,
        advanceBalance: currentAdvanceInDB,
        advanceDeducted: 0,
        ledgerStatements: detailedStatements.reverse(),
      };
    }

    if (staff.salaryRecordExists) {
      delete staff.salaryData;
      return {
        ...staff,
        monthlySalary: baseSalary,
        finalCalculatedSalary: staff.dbCalculatedSalary,
        totalPaidMonth: actualAmountPaid,
        balance: staff.dbRemainingBalance,
        advanceBalance: currentAdvanceInDB,
        advanceDeducted: staff.dbAdvanceDeduction,
        ledgerStatements: detailedStatements.reverse(),
      };
    }

    let finalCalculatedSalary = baseSalary;

    if (staff.joiningDate) {
      const joiningDate = new Date(staff.joiningDate);
      if (
        joiningDate.getFullYear() === currentYear &&
        joiningDate.getMonth() === currentMonthIndex
      ) {
        const joinedDay = joiningDate.getDate();
        const activeDaysFromJoining = totalDaysInMonth - joinedDay + 1;
        const perDaySalary = baseSalary / totalDaysInMonth;
        finalCalculatedSalary = perDaySalary * activeDaysFromJoining;
      }
    }

    if (staff.deductInactiveDays === true && staff.inactiveDaysThisMonth > 0) {
      const perDaySalary = baseSalary / totalDaysInMonth;
      const deductionAmount = perDaySalary * staff.inactiveDaysThisMonth;
      finalCalculatedSalary = finalCalculatedSalary - deductionAmount;
    }

    const netSalaryBeforeAdvance = Math.round(
      Math.max(0, finalCalculatedSalary),
    );

    let advanceDeductedThisMonth = 0;
    let finalPayableSalary = netSalaryBeforeAdvance;

    if (currentAdvanceInDB > 0) {
      if (currentAdvanceInDB <= netSalaryBeforeAdvance) {
        advanceDeductedThisMonth = currentAdvanceInDB;
        finalPayableSalary = netSalaryBeforeAdvance - advanceDeductedThisMonth;
      } else {
        advanceDeductedThisMonth = netSalaryBeforeAdvance;
        finalPayableSalary = 0;
      }
    }

    const balance = finalPayableSalary - actualAmountPaid;

    delete staff.salaryData;

    return {
      ...staff,
      monthlySalary: baseSalary,
      finalCalculatedSalary: netSalaryBeforeAdvance,
      actualCalculatedSalaryThisMonth: netSalaryBeforeAdvance,
      totalPaidMonth: actualAmountPaid,
      balance: Math.round(balance < 0 ? 0 : balance),
      advanceBalance: Math.round(currentAdvanceInDB - advanceDeductedThisMonth),
      advanceDeducted: Math.round(advanceDeductedThisMonth),
      ledgerStatements: detailedStatements.reverse(),
    };
  });

  res.json({
    success: true,
    staff: finalResult,
  });
});
const changeStaffStatus = asyncHandler(async (req, res) => {
  const { staffId } = req.body;

  const staff = await staffModel.findById(staffId);
  if (!staff) {
    res.status(404);
    throw new Error("Staff member not found");
  }
  staff.status = staff.status === "Active" ? "Inactive" : "Active";
  await staff.save();
  res.json({
    success: true,
    message: `Staff status changed to ${staff.status}`,
    staff,
  });
});

const addBed = asyncHandler(async (req, res) => {
  const { bedNumber, category, pricePerDay } = req.body;
  if (!bedNumber || !category || !pricePerDay) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }
  const bedExists = await bedModel.findOne({ bedNumber });
  if (bedExists) {
    return res
      .status(400)
      .json({ success: false, message: "Bed number already exists" });
  }
  const newBed = new bedModel({
    bedNumber,
    category,
    pricePerDay,
  });
  await newBed.save();

  res.status(201).json({
    success: true,
    message: "Bed added successfully",
    bed: newBed,
  });
});
const getAllBeds = asyncHandler(async (req, res) => {
  const beds = await bedModel
    .find({})
    .populate("currentPatient", "patientName phone")
    .sort({ createdAt: -1 });
  res.status(200).json({
    success: true,
    beds,
  });
});
const updateBed = asyncHandler(async (req, res) => {
  const { bedId } = req.params;
  const { bedNumber, category, pricePerDay } = req.body;

  const bed = await bedModel.findById(bedId);
  if (!bed) {
    return res.status(404).json({ success: false, message: "Bed not found" });
  }

  if (bedNumber && bedNumber !== bed.bedNumber) {
    const bedExists = await bedModel.findOne({ bedNumber });
    if (bedExists) {
      return res
        .status(400)
        .json({ success: false, message: "Bed number already exists" });
    }
    bed.bedNumber = bedNumber;
  }

  if (category) bed.category = category;
  if (pricePerDay !== undefined) bed.pricePerDay = Number(pricePerDay);

  await bed.save();

  res.status(200).json({
    success: true,
    message: "Bed details updated successfully",
    bed,
  });
});

const updateDoctorProfileByAdmin = asyncHandler(async (req, res) => {
  const { docId } = req.params;
  const { fees, commission, speciality, name, experience, roundFee, about } =
    req.body;

  const doctor = await doctorModel.findById(docId);
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }

  if (fees !== undefined) doctor.fees = Number(fees);
  if (commission !== undefined) doctor.commission = Number(commission);
  if (speciality) doctor.speciality = speciality;
  if (name) doctor.name = name;
  if (experience) doctor.experience = experience;

  if (roundFee !== undefined) doctor.roundFee = Number(roundFee);
  if (about !== undefined) doctor.about = about;

  await doctor.save();

  res.status(200).json({
    success: true,
    message: `Dr. ${doctor.name}'s profile and fees updated successfully!`,
    doctor,
  });
});

const updateStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;
  const { name, role, salary, phone, email, absentDates } = req.body; // 🌟 absentDates وصول کیا

  const staffMember = await staffModel.findById(staffId);
  if (!staffMember) {
    res.status(404);
    throw new Error("Staff member not found");
  }

  if (name) staffMember.name = name;
  if (role) staffMember.role = role;
  if (salary !== undefined) staffMember.salary = Number(salary);
  if (phone) staffMember.phone = phone;
  if (email) staffMember.email = email;

  if (absentDates !== undefined) {
    staffMember.absentDates = absentDates;
  }

  await staffMember.save();
  res.status(200).json({ success: true, staff: staffMember });
});

const getAwaitingAdmissions = asyncHandler(async (req, res) => {
  const admissions = await admissionModel
    .find({
      status: { $in: ["Scheduled", "Awaiting Bed", "Admitted"] },
    })
    .populate({
      path: "appointmentId",
      select: "patientName patientData",
    })
    .populate({
      path: "doctorId",
      select: "name specialization",
    })
    .populate({
      path: "bedId",
      select: "bedNumber category",
    })
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: admissions.length,
    data: admissions,
  });
});

const allocateBed = asyncHandler(async (req, res) => {
  const { admissionId, bedId } = req.body;

  if (!admissionId || !bedId) {
    res.status(400);
    throw new Error("Admission ID and Bed ID are required");
  }

  const admission = await admissionModel.findById(admissionId);
  if (!admission) {
    res.status(404);
    throw new Error("Admission record not found");
  }

  const bed = await bedModel.findById(bedId);
  if (!bed) {
    res.status(404);
    throw new Error("Selected bed not found");
  }

  if (bed.status === "Occupied") {
    res.status(400);
    throw new Error(`Bed ${bed.bedNumber} is already occupied!`);
  }

  bed.status = "Occupied";
  bed.currentPatient = admission.appointmentId;
  await bed.save();

  admission.status = "Admitted";
  admission.bedId = bed._id;
  admission.locationStatus = "In Ward";

  await admission.save();

  res.status(200).json({
    success: true,
    message: `Bed ${bed.bedNumber} (${bed.category}) successfully allocated! 🛏️`,
    data: admission,
  });
});

const assignStaffDuty = asyncHandler(async (req, res) => {
  const { staffId, assignedLocation, shift, dutyDate } = req.body;

  if (!staffId || !assignedLocation || !shift || !dutyDate) {
    res.status(400);
    throw new Error("All fields are required");
  }

  const targetDate = new Date(dutyDate);
  targetDate.setHours(0, 0, 0, 0);

  const existingDuty = await staffScheduleModel.findOne({
    staffId,
    dutyDate: targetDate,
    shift,
  });

  if (existingDuty) {
    res.status(400);
    throw new Error(
      `This staff member is already assigned to the ${shift} shift today at ${existingDuty.assignedLocation}! 🛑`,
    );
  }

  const newSchedule = await staffScheduleModel.create({
    staffId,
    assignedLocation,
    shift,
    dutyDate: targetDate,
  });

  res.status(201).json({
    success: true,
    message: "Staff duty scheduled successfully 📆",
    schedule: newSchedule,
  });
});
const updatePatientLocation = asyncHandler(async (req, res) => {
  const { admissionId, locationStatus } = req.body;

  if (!admissionId || !locationStatus) {
    res.status(400);
    throw new Error("Admission ID and Location Status are required");
  }

  const validLocations = ["In Ward", "In OT", "Recovery"];
  if (!validLocations.includes(locationStatus)) {
    res.status(400);
    throw new Error("Invalid location status");
  }

  const updatedAdmission = await admissionModel.findByIdAndUpdate(
    admissionId,
    { locationStatus },
    { new: true },
  );

  if (!updatedAdmission) {
    res.status(404);
    throw new Error("Admission record not found");
  }

  return res.status(200).json({
    success: true,
    message: `Patient location successfully moved to ${locationStatus} 🏥`,
    data: updatedAdmission,
  });
});

const payDoctor = asyncHandler(async (req, res) => {
  const { doctorId, amountPaid, paymentMode, referenceNo, notes } = req.body;

  if (!doctorId || !amountPaid) {
    res.status(400);
    throw new Error("Doctor ID and amount are required");
  }

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }

  const payout = await doctorPayoutModel.create({
    doctor: doctorId,
    amountPaid: Number(amountPaid),
    paymentMode,
    referenceNo,
    notes,
  });

  doctor.doctorWallet -= Number(amountPaid);
  doctor.totalPaidToDoctor += Number(amountPaid);

  await doctor.save();

  res.status(201).json({
    success: true,
    message: "Doctor payment recorded and wallet updated successfully! 💳",
    data: payout,
  });
});

const payStaffSalary = asyncHandler(async (req, res) => {
  const { staffId, amount, notes, calculatedSalaryThisMonth, paymentMode } =
    req.body;

  if (!staffId || !amount) {
    res.status(400);
    throw new Error("Staff ID and amount are required");
  }

  const p_amount = Number(amount);
  const currentMonth = new Date().toLocaleString("default", { month: "long" });

  const staffMember = await staffModel.findById(staffId);
  if (!staffMember) {
    res.status(404);
    throw new Error("Staff member not found in database");
  }

  let salaryRecord = await staffSalaryModel.findOne({
    staff: staffId,
    month: currentMonth,
  });

  if (!salaryRecord) {
    const baseCalculatedSalary = Number(
      calculatedSalaryThisMonth || staffMember.salary || 0,
    );
    const oldAdvanceBalance = Number(staffMember.advanceBalance || 0);

    let advanceDeductedThisMonth = Math.min(
      oldAdvanceBalance,
      baseCalculatedSalary,
    );

    const netPayableAmount = baseCalculatedSalary - advanceDeductedThisMonth;

    staffMember.advanceBalance = oldAdvanceBalance - advanceDeductedThisMonth;

    salaryRecord = new staffSalaryModel({
      staff: staffId,
      month: currentMonth,
      calculatedSalary: baseCalculatedSalary,
      advanceDeduction: advanceDeductedThisMonth,
      netPayable: netPayableAmount,
      amountPaid: 0,
      remainingBalance: netPayableAmount,
    });
  }

  const oldAmountPaid = Number(salaryRecord.amountPaid || 0);
  const currentNetPayable = Number(salaryRecord.netPayable || 0);

  salaryRecord.amountPaid = oldAmountPaid + p_amount;

  const currentRemainingBeforeThisPay = currentNetPayable - oldAmountPaid;

  if (p_amount > currentRemainingBeforeThisPay) {
    const extraAmountPaid =
      p_amount -
      (currentRemainingBeforeThisPay > 0 ? currentRemainingBeforeThisPay : 0);

    salaryRecord.remainingBalance = 0;

    staffMember.advanceBalance =
      Number(staffMember.advanceBalance || 0) + extraAmountPaid;
  } else {
    salaryRecord.remainingBalance = currentRemainingBeforeThisPay - p_amount;
  }

  salaryRecord.paymentHistory.push({
    amount: p_amount,
    paymentMode: paymentMode || "Cash",
    notes: notes || "",
    date: new Date(),
  });

  await salaryRecord.save();
  await staffMember.save();

  res.status(200).json({
    success: true,
    message: `Salary processed successfully for ${currentMonth}! 💰`,
    advanceBalance: staffMember.advanceBalance,
    data: salaryRecord,
  });
});
const getStaffSalariesByMonth = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    res.status(400);
    throw new Error("Month is required");
  }

  const salaries = await staffSalaryModel
    .find({ month })
    .populate("staff", "name role staffType");

  res.status(200).json({
    success: true,
    data: salaries,
  });
});

const getAllExpenses = asyncHandler(async (req, res) => {
  const { month } = req.query;

  const today = new Date();
  const currentYear = today.getFullYear();

  const filterMonth =
    month || today.toLocaleString("default", { month: "long" });

  const tempDate = new Date(`${filterMonth} 1, ${currentYear}`);
  const currentMonthIndex = isNaN(tempDate.getTime())
    ? today.getMonth()
    : tempDate.getMonth();

  let query = {};

  if (filterMonth) {
    const startDate = new Date(currentYear, currentMonthIndex, 1, 0, 0, 0, 0);

    const endDate = new Date(
      currentYear,
      currentMonthIndex + 1,
      0,
      23,
      59,
      59,
      999,
    );

    query.expenseDate = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  const expenses = await expenseModel.find(query).sort({ expenseDate: -1 });

  res.status(200).json({
    success: true,
    data: expenses,
  });
});

const getFinancialSummary = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    res.status(400);
    throw new Error("Month is required for summary");
  }

  const startDate = new Date(`${month}-01T00:00:00.000Z`);

  const [year, monthNum] = month.split("-");
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  const doctorPayoutsObj = await doctorPayoutModel.aggregate([
    {
      $match: {
        paymentDate: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$amountPaid" },
      },
    },
  ]);
  const totalDoctorPayouts = doctorPayoutsObj[0]?.totalPaid || 0;

  const staffSalariesObj = await staffSalaryModel.aggregate([
    { $match: { month } },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$amountPaid" },
      },
    },
  ]);
  const totalStaffPaid = staffSalariesObj[0]?.totalPaid || 0;

  const expensesObj = await expenseModel.aggregate([
    {
      $match: {
        expenseDate: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);
  const totalExpenses = expensesObj[0]?.totalAmount || 0;

  const grandTotalOutflow = totalDoctorPayouts + totalStaffPaid + totalExpenses;

  res.status(200).json({
    success: true,
    message: "Financial summary fetched successfully",
    data: {
      month,
      totalDoctorPayouts,
      totalStaffPaid,
      totalExpenses,
      grandTotalOutflow,
    },
  });
});
const addHospitalExpense = asyncHandler(async (req, res) => {
  const { title, category, amount, expenseDate, description } = req.body;

  if (!title || !category || !amount) {
    res.status(400);

    throw new Error("Expense name, category, and amount are required");
  }

  const expense = await expenseModel.create({
    title,

    category,

    amount: Number(amount),

    expenseDate: expenseDate || new Date(),

    description,
  });

  res.status(201).json({
    success: true,

    message: "Expense recorded successfully! 🧾",

    data: expense,
  });
});

export {
  loginAdmin,
  addDoctor,
  allDoctors,
  changeAvailability,
  appointmentsAdmin,
  adminDashboard,
  updateDoctorSchedule,
  getDoctorInfo,
  addStaff,
  getAllStaff,
  changeStaffStatus,
  addBed,
  getAllBeds,
  updateBed,
  updateDoctorProfileByAdmin,
  updateStaff,
  getAwaitingAdmissions,
  allocateBed,
  assignStaffDuty,
  updatePatientLocation,
  payDoctor,
  payStaffSalary,
  addHospitalExpense,
  getStaffSalariesByMonth,
  getAllExpenses,
  getFinancialSummary,
};
