import userModel from "../models/userModel.js";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import asyncHandler from "../middleware/asyncHandler.js";
import Stripe from "stripe";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../config/sendEmail.js";
import otpModel from "../models/otpModel.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address, otp } = req.body;
  if (
    !name ||
    !email ||
    !password ||
    !phone ||
    !address ||
    !address.line1 ||
    !otp
  ) {
    res.status(400);
    throw new Error("All fields including OTP are required");
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error("Please enter a valid email address");
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters long");
  }
  const exists = await userModel.findOne({ email });

  if (exists) {
    res.status(400);
    throw new Error("User already exists");
  }
  const otpRecord = await otpModel.findOne({ email });
  if (!otpRecord) {
    res.status(400);
    throw new Error("OTP expired or not requested. Please request a new code.");
  }

  if (otpRecord.otp !== otp) {
    res.status(400);
    throw new Error("Invalid verification code. Please check again.");
  }

  await otpModel.deleteOne({ _id: otpRecord._id });

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const userData = {
    name,
    email,
    password: hashedPassword,
    phone,
    address,
  };
  const newUser = new userModel(userData);
  const user = await newUser.save();
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.json({
    success: true,
    token,
    message: "Account Verified and Created Successfully! 🚀",
  });
});

const userUpdateProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { name, phone, address, dob, gender } = req.body;
  if (!name || !phone || !gender || !dob) {
    res.status(400);
    throw new Error("Missing Details for profile update");
  }
  const updatedUser = await userModel
    .findByIdAndUpdate(
      userId,
      {
        $set: {
          name,
          phone,
          gender,
          dob,
          address: typeof address === "string" ? JSON.parse(address) : address,
        },
      },
      { new: true },
    )
    .select("-password");
  res.json({
    success: true,
    message: "Profile Updated Successfully",
    user: updatedUser,
  });
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error("Please provide email and password");
  }
  const user = await userModel.findOne({ email });
  if (user && user.password) {
    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });
      return res.json({ success: true, token });
    }
  }
  res.status(401);
  throw new Error("Invalid email or password");
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    res.status(400);
    throw new Error("All fields (Email, OTP, New Password) are required");
  }

  if (newPassword.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters long");
  }

  const otpRecord = await otpModel.findOne({ email });
  if (!otpRecord) {
    res.status(400);
    throw new Error("OTP expired or not requested. Please try again.");
  }

  if (otpRecord.otp !== otp) {
    res.status(400);
    throw new Error("Invalid verification code.");
  }

  const user = await userModel.findOne({ email });
  if (!user) {
    res.status(44);
    throw new Error("User not found.");
  }

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  await otpModel.deleteOne({ _id: otpRecord._id });

  res.status(200).json({
    success: true,
    message: "Password reset successfully! You can login now. 🔑",
  });
});

const bookAppointment = asyncHandler(async (req, res) => {
  const {
    docId,
    slotDate,
    slotTime,
    patientDob,
    patientName,
    patientGender,
    paymentMethod,
  } = req.body;
  const userId = req.userId;
  if (!patientDob || !patientName || !patientGender || !paymentMethod) {
    res.status(400);
    throw new Error("Patient DOB, Gender, and Payment Method are required");
  }
  const docData = await doctorModel.findById(docId).select("-password");
  if (!docData) {
    res.status(404);
    throw new Error("Doctor not found");
  }
  if (!docData.available) {
    res.status(400);
    throw new Error("Doctor is currently not available");
  }

  if (docData.weeklySchedule) {
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

    const dayConfig = docData.weeklySchedule[dayName];

    if (!dayConfig || dayConfig.isAvailable === false) {
      res.status(400);
      throw new Error(
        `Doctor does not take appointments on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s`,
      );
    }

    const timeToMinutes = (timeStr) => {
      if (!timeStr) return 0;
      const [time, modifier] = timeStr.split(" ");
      let [hours, minutes] = time.split(":").map(Number);

      if (hours === 12) {
        hours = modifier === "AM" ? 0 : 12;
      } else if (modifier === "PM") {
        hours += 12;
      }
      return hours * 60 + minutes;
    };

    const slotMinutes = timeToMinutes(slotTime);
    const startMinutes = timeToMinutes(
      dayConfig.startTime || docData.slots_start,
    );
    const endMinutes = timeToMinutes(dayConfig.endTime || docData.slots_end);

    if (slotMinutes < startMinutes || slotMinutes >= endMinutes) {
      const readableStart = dayConfig.startTime || docData.slots_start;
      const readableEnd = dayConfig.endTime || docData.slots_end;

      res.status(400);
      throw new Error(
        `On ${dayName}s, doctor is only available between ${readableStart} and ${readableEnd}`,
      );
    }
  } else {
    if (slotTime < docData.slots_start || slotTime > docData.slots_end) {
      res.status(400);
      throw new Error(
        `Doctor is only available between ${docData.slots_start} and ${docData.slots_end}`,
      );
    }
  }

  let slots_booked = docData.slots_booked || {};
  let currentDaySlots = slots_booked[slotDate] || [];

  const existingSlot = currentDaySlots.find((slot) => slot.time === slotTime);
  if (existingSlot) {
    res.status(400);
    if (existingSlot.status === "blocked_by_doctor") {
      throw new Error(
        "The doctor is not available at this time. Please choose another time.",
      );
    } else {
      throw new Error("This slot is already booked by another patient.");
    }
  }
  const newAppointment = new appointmentModel({
    userId,
    docId,
    slotDate,
    slotTime,
    patientDob,
    patientName,
    patientGender,
    paymentMethod,
    userData: await userModel.findById(userId).select("-password"),
    docData,
    amount: docData.fees,
    date: Date.now(),
  });
  const saveAppointment = await newAppointment.save();

  const updateDoctor = await doctorModel.findOneAndUpdate(
    {
      _id: docId,
      $or: [
        { [`slots_booked.${slotDate}`]: { $exists: false } },
        {
          [`slots_booked.${slotDate}`]: {
            $not: { $elemMatch: { time: slotTime } },
          },
        },
      ],
    },
    {
      $push: {
        [`slots_booked.${slotDate}`]: {
          time: slotTime,
          status: "booked",
          appointmentId: saveAppointment._id,
        },
      },
    },
    { returnDocument: "after" },
  );
  if (!updateDoctor) {
    await appointmentModel.findByIdAndDelete(saveAppointment._id);
    res.status(400);
    throw new Error(
      "Sorry, this slot was just booked by another user! Please try another time.",
    );
  }

  if (paymentMethod === "Stripe") {
    const { origin } = req.headers;
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Appointment with ${docData.name}`,
              },
              unit_amount: docData.fees * 100,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/verify-stripe?success=true&appointmentId=${saveAppointment._id}`,
        cancel_url: `${origin}/verify-stripe?success=false&appointmentId=${saveAppointment._id}`,
      });
      await appointmentModel.findByIdAndUpdate(saveAppointment._id, {
        stripeSessionId: session.id,
      });

      return res.json({
        success: true,
        paymentRequired: true,
        session_url: session.url,
        message: "Redirecting to Stripe payment...",
      });
    } catch (stripeError) {
      console.error("Stripe Detailed Error: =======>", stripeError);
      await appointmentModel.findByIdAndDelete(saveAppointment._id);
      await doctorModel.findByIdAndUpdate(docId, {
        $pull: { [`slots_booked.${slotDate}`]: { time: slotTime } },
      });

      res.status(500);
      throw new Error("Stripe checkout initiation failed. Please try again.");
    }
  }

  res.json({
    success: true,
    paymentRequired: false,
    message: "Appointment Booked Successfully (Cash at Clinic)",
  });
});

const payExistingAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.body;
  const userId = req.userId;
  const { origin } = req.headers;

  if (!appointmentId) {
    res.status(400);
    throw new Error("Appointment ID is required");
  }

  const appointmentData = await appointmentModel.findById(appointmentId);
  if (
    !appointmentData ||
    appointmentData.userId.toString() !== userId.toString()
  ) {
    res.status(404);
    throw new Error("Appointment not found or unauthorized");
  }

  if (appointmentData.cancelled) {
    res.status(400);
    throw new Error("This appointment has already been cancelled.");
  }

  if (appointmentData.payment) {
    res.status(400);
    throw new Error("This appointment is already paid.");
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Appointment with ${appointmentData.docData?.name || "Doctor"}`,
            },
            unit_amount: appointmentData.amount * 100, // فیس سینٹس میں
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/verify-stripe?success=true&appointmentId=${appointmentData._id}`,
      cancel_url: `${origin}/verify-stripe?success=false&appointmentId=${appointmentData._id}`,
    });

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      stripeSessionId: session.id,
    });

    return res.json({
      success: true,
      session_url: session.url,
      message: "Redirecting to Stripe payment...",
    });
  } catch (stripeError) {
    console.error("Stripe Re-initiation Error:", stripeError);
    res.status(500);
    throw new Error("Stripe checkout initiation failed. Please try again.");
  }
});

const listAppointment = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const appointments = await appointmentModel.find({ userId: userId });
  res.json({ success: true, appointments: appointments || [] });
});

const cancelAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.body;
  const userId = req.userId;
  const appointmentData = await appointmentModel.findById(appointmentId);

  if (
    !appointmentData ||
    appointmentData.userId.toString() !== userId.toString()
  ) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized action or appointment not found",
    });
  }
  await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true });

  const { docId, slotDate, slotTime } = appointmentData;
  const docData = await doctorModel.findById(docId);

  let slots_booked = docData.slots_booked || {};
  if (slots_booked[slotDate]) {
    slots_booked[slotDate] = slots_booked[slotDate].filter(
      (e) => e.time !== slotTime,
    );
  }
  await doctorModel.findByIdAndUpdate(docId, { slots_booked });
  res.json({ success: true, message: "Appointment Canelled Successfuly" });
});

const verifyStripe = asyncHandler(async (req, res) => {
  const { appointmentId, success } = req.body;
  const userId = req.userId;

  if (!appointmentId || !success) {
    res.status(400);
    throw new Error("Missing appointmentId or success status");
  }

  const appointmentData = await appointmentModel.findById(appointmentId);
  if (
    !appointmentData ||
    appointmentData.userId.toString() !== userId.toString()
  ) {
    res.status(404);
    throw new Error("Appointment not found or unauthorized");
  }

  if (success === "true" || success === true) {
    try {
      const sessionId = appointmentData.stripeSessionId;

      if (!sessionId) {
        res.status(400);
        throw new Error("Stripe session ID missing from appointment data.");
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        await appointmentModel.findByIdAndUpdate(appointmentId, {
          payment: true,
          paymentMethod: "Stripe",
        });

        return res.json({
          success: true,
          message: "Payment Verified and Confirmed Successfully via Stripe! ",
        });
      } else {
        res.status(400);
        throw new Error(
          "Security Alert: Payment status mismatch on Stripe servers!",
        );
      }
    } catch (stripeError) {
      res.status(400);
      throw new Error(
        stripeError.message || "Stripe verification process failed.",
      );
    }
  } else {
    const { docId, slotDate, slotTime } = appointmentData;

    await doctorModel.findByIdAndUpdate(docId, {
      $pull: { [`slots_booked.${slotDate}`]: { time: slotTime } },
    });

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      cancelled: true,
    });

    return res.status(400).json({
      success: false,
      message: "Payment failed or cancelled by user.",
    });
  }
});

const getAllDoctorsForUsers = asyncHandler(async (req, res) => {
  const doctors = await doctorModel
    .find({ available: true })
    .select(
      "name image degree speciality fees experience slots_start slots_end available weeklySchedule about scheduledActivationDate",
    );

  res.status(200).json({
    success: true,
    doctors,
  });
});

const getDoctorDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const doctor = await doctorModel.findById(id);
  if (!doctor) {
    return res.status(404).json({
      success: false,
      message: "Doctor not found!",
    });
  }

  res.status(200).json({
    success: true,
    message: "Doctor details fetched successfully",
    doctor,
  });
});

const sendOTP = asyncHandler(async (req, res) => {
  const { email, type } = req.body;

  if (!email || !type) {
    res.status(400);
    throw new Error("Email and Type (signup/forgot) are required");
  }

  const existingUser = await userModel.findOne({ email });

  if (type === "signup") {
    if (existingUser) {
      res.status(400);
      throw new Error("User already exists with this email.");
    }
  } else if (type === "forgot") {
    if (!existingUser) {
      res.status(404);
      throw new Error("No account found with this email Address.");
    }
  } else {
    res.status(400);
    throw new Error("Invalid OTP type.");
  }

  const otp = crypto.randomInt(100000, 999999).toString();

  await otpModel.deleteMany({ email });
  await otpModel.create({ email, otp });

  const isSignUp = type === "signup";
  const subject = isSignUp
    ? "ShifaClick - Account Verification OTP"
    : "ShifaClick - Password Reset OTP";
  const purposeText = isSignUp
    ? "creating your account"
    : "resetting your password";
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e4e4; border-radius: 10px;">
      <h2 style="color: #4f46e5; text-align: center;">ShifaClick Verification Code</h2>
      <p>Dear User, Assalam-o-Alaikum,</p>
      <p>Your verification code for ${purposeText} on ShifaClick is provided below. This code is only valid for 5 minutes.</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background-color: #f3f4f6; padding: 10px 20px; border-radius: 8px; color: #1f2937;">
          ${otp}
        </span>
      </div>
      <p style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 40px;">
      If you did not request this code, please ignore this email.
    </p>
    </div>
  `;

  const emailResult = await sendEmail({
    to: email,
    subject: subject,
    htmlContent: htmlContent,
  });

  if (emailResult.success) {
    res
      .status(200)
      .json({ success: true, message: `Verification OTP sent for ${type}!` });
  } else {
    res.status(500);
    throw new Error("Failed to send OTP email.");
  }
});

export {
  registerUser,
  loginUser,
  bookAppointment,
  listAppointment,
  cancelAppointment,
  verifyStripe,
  userUpdateProfile,
  getAllDoctorsForUsers,
  getDoctorDetails,
  payExistingAppointment,
  sendOTP,
  resetPassword,
};
