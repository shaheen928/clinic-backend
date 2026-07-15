 
 import asyncHandler from "../middleware/asyncHandler.js";
import admissionModel from "../models/admissionModel.js";
import appointmentModel from "../models/appointmentModel.js";
import bedModel from "../models/bedModel.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const calculateLiveBillHelper = (admission, appointment, bed) => {
  const entryDate = new Date(admission.admissionDate);
   const endDate = admission.dischargeDate ? new Date(admission.dischargeDate) : new Date();
  
  const timeDiff = endDate.getTime() - entryDate.getTime();
  let totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
  if (totalDays <= 0) totalDays = 1;  

  const bedRate = bed ? bed.pricePerDay : 0;
  const totalBedFee = totalDays * bedRate;
  const surgeryFee = admission.surgeryDetails?.surgeryFee || 0;
  
  const perRoundRate = appointment?.docData?.roundFees || appointment?.docData?.roundFee || 0;
  const totalDoctorRoundFee = (admission.totalRounds || 0) * perRoundRate;

  const grandTotal = totalBedFee + surgeryFee + totalDoctorRoundFee;

  return {
    totalDays,
    totalBedFee,
    surgeryFee,
    perRoundRate,
    totalDoctorRoundFee,
    grandTotal,
  };
};

  const getAdminBillingDashboard = asyncHandler(async (req, res) => {
   const unpaidAppointments = await appointmentModel.find({
    payment: false, 
    isCancelled: { $ne: true }, 
  });

  const appointmentBillingList = unpaidAppointments.map((app) => ({
    appointmentId: app._id,
    patientName: app.patientName,
    doctorName: app.docData?.name || "Doctor",
    appointmentDate: app.slotDate,
    slotTime: app.slotTime,
    feeAmount: app.amount, 
    type: "OPD / Checkup",
  }));

   const activeAdmissions = await admissionModel.find({
    $or: [
      { status: "Admitted" },
      { status: "Discharged", dischargeStatus: "Pending Clearance" }
    ]
  });
  
  const indoorBillingList = [];

  for (let admission of activeAdmissions) {
    const appointment = await appointmentModel.findById(admission.appointmentId);
    const bed = admission.bedId ? await bedModel.findById(admission.bedId) : null;

    const bill = calculateLiveBillHelper(admission, appointment, bed);

    indoorBillingList.push({
      admissionId: admission._id,
      appointmentId: admission.appointmentId,
      patientName: appointment ? appointment.patientName : "Unknown",
      bedNumber: bed ? bed.bedNumber : "Not Assigned",
      admissionType: admission.admissionType,
      status: admission.status, // Admitted یا Discharged
      dischargeStatus: admission.dischargeStatus || "Pending Clearance",
      totalDays: bill.totalDays,
      grandTotal: bill.grandTotal,
      type: "Indoor Admission",
    });
  }

  res.status(200).json({
    success: true,
    data: {
      counterBookings: appointmentBillingList,
      indoorAdmissions: indoorBillingList,
    },
  });
});
 
  const markBillAsPaidByAdmin = asyncHandler(async (req, res) => {
  const { admissionId } = req.body;

  const admission = await admissionModel.findById(admissionId);
  if (!admission) {
    res.status(404);
    throw new Error("Admission record not found");
  }

   const appointment = await appointmentModel.findByIdAndUpdate(
    admission.appointmentId,
    { payment: true, paymentMethod: "Cash" },
    { new: true },
  );

  if (!appointment) {
    res.status(404);
    throw new Error("Associated appointment not found");
  }

   admission.status = "Discharged";
  if (!admission.dischargeDate) {
    admission.dischargeDate = new Date();  
  }
  admission.isPaid = true; 
  admission.dischargeStatus = "Cleared";  
  await admission.save();

   if (admission.bedId) {
    await bedModel.findByIdAndUpdate(admission.bedId, {
      status: "Available",
      currentPatient: null,
    });
  }

  res.status(200).json({
    success: true,
    message: "Bill marked as PAID and discharge account cleared successfully!",
  });
});

  const markAppointmentAsPaid = asyncHandler(async (req, res) => {
  const { appointmentId } = req.body;

  const appointment = await appointmentModel.findByIdAndUpdate(
    appointmentId,
    { payment: true, paymentMethod: "Cash" },
    { new: true }
  );

  if (!appointment) {
    res.status(404);
    throw new Error("Appointment not found");
  }

  res.status(200).json({ success: true, message: "Appointment checkup fee received successfully!" });
});

  const getLiveIndoorBill = asyncHandler(async (req, res) => {
  const { id } = req.params; 

  let admission = await admissionModel.findById(id);
  if (!admission) {
    admission = await admissionModel.findOne({ appointmentId: id });
  }

  if (!admission) {
    res.status(404);
    throw new Error("Admission record not found for the given ID");
  }

  const appointment = await appointmentModel.findById(admission.appointmentId);
  const bed = admission.bedId ? await bedModel.findById(admission.bedId) : null;

  const bill = calculateLiveBillHelper(admission, appointment, bed);

  res.status(200).json({
    success: true,
    data: {
      admissionId: admission._id,
      patientName: appointment ? appointment.patientName : "Unknown Patient",
      admissionType: admission.admissionType,
      status: admission.status,
       dischargeStatus: admission.dischargeStatus || (admission.isPaid ? "Cleared" : "Pending Clearance"),
      locationStatus: admission.locationStatus,
      totalDaysCharged: bill.totalDays,
      wardCategory: bed ? bed.category : "General",
      bedNumber: bed ? bed.bedNumber : "Not Assigned",
      breakdown: {
        totalBedFee: bill.totalBedFee,
        surgeryFee: bill.surgeryFee,
        totalRounds: admission.totalRounds,
        perRoundRate: bill.perRoundRate, 
        totalDoctorRoundFee: bill.totalDoctorRoundFee,
      },
      grandTotal: bill.grandTotal,
      isPaid: admission.isPaid || false,
      paymentMethod: appointment ? appointment.paymentMethod : "Cash",
    },
  });
});

  const payIndoorBill = asyncHandler(async (req, res) => {
  const { appointmentId } = req.body;
  const { origin } = req.headers;

  if (!appointmentId) {
    res.status(400);
    throw new Error("Appointment ID is required");
  }

  const admission = await admissionModel.findOne({ appointmentId });
  if (!admission) {
    res.status(404);
    throw new Error("Active admission record not found");
  }

  const appointment = await appointmentModel.findById(admission.appointmentId);
  const bed = admission.bedId ? await bedModel.findById(admission.bedId) : null;

  const bill = calculateLiveBillHelper(admission, appointment, bed);

  if (bill.grandTotal <= 0) {
     res.status(400);
    throw new Error("Bill amount must be greater than 0");
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd", 
            product_data: {
              name: `Indoor Hospital Bill - ${appointment ? appointment.patientName : "Patient"}`,
              description: `Bed charges, Surgery fee, and Doctor rounds for ${bill.totalDays} days.`,
            },
            unit_amount: bill.grandTotal * 100, 
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/verify-indoor-stripe?success=true&appointmentId=${appointmentId}`,
      cancel_url: `${origin}/verify-indoor-stripe?success=false&appointmentId=${appointmentId}`,
    });

    await admissionModel.findByIdAndUpdate(admission._id, {
      stripeSessionId: session.id,
    });

    return res.json({
      success: true,
      session_url: session.url,
      message: "Redirecting to Stripe for Indoor bill payment...",
    });
  } catch (stripeError) {
    console.error("Indoor Stripe Error:", stripeError);
    res.status(500);
    throw new Error("Stripe checkout initiation failed for indoor bill.");
  }
});

 const verifyIndoorPayment = asyncHandler(async (req, res) => {
  const { appointmentId, success } = req.body;

  if (!appointmentId || success === undefined) {
    res.status(400);
    throw new Error("Missing required parameters");
  }

  const admission = await admissionModel.findOne({ appointmentId });
  if (!admission) {
    res.status(404);
    throw new Error("Admission record not found");
  }

  if (success === "true" || success === true) {
    try {
      const sessionId = admission.stripeSessionId;
      if (!sessionId) {
        res.status(400);
        throw new Error("Stripe session ID missing from admission data.");
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
          await appointmentModel.findByIdAndUpdate(admission.appointmentId, {
           payment: true,
           paymentMethod: "Stripe"
         });

          await admissionModel.findByIdAndUpdate(admission._id, {
          isPaid: true,
          status: "Discharged",
          dischargeStatus: "Cleared",  
          ifNotSetDischargeDate: admission.dischargeDate ? admission.dischargeDate : new Date()
        });

         if (admission.bedId) {
          await bedModel.findByIdAndUpdate(admission.bedId, {
            status: "Available",
            currentPatient: null,
          });
        }

        return res.json({
          success: true,
          message: "Indoor Hospital Bill Paid & Confirmed Successfully!",
        });
      } else {
        res.status(400);
        throw new Error("Payment verification failed on Stripe servers.");
      }
    } catch (stripeError) {
      res.status(400);
      throw new Error(stripeError.message || "Indoor payment verification failed.");
    }
  } else {
    return res.status(400).json({
      success: false,
      message: "Indoor bill payment was cancelled or failed.",
    });
  }
});

export {
  verifyIndoorPayment,
  payIndoorBill,
  getLiveIndoorBill,
  markAppointmentAsPaid,
  markBillAsPaidByAdmin,
  getAdminBillingDashboard
};
 