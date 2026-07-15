import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  docId: {
    type: String,
    required: true,
    ref: "doctor",
  },
  patientName: {
    type: String,
    required: true,
  },
  slotDate: {
    type: String,
    required: true,
  },
  slotTime: {
    type: String,
    required: true,
  },
  patientDob: {
    type: String,
    required: true,
  },
  patientGender: {
    type: String,
    required: true,
    enum: ["Male", "Female", "Other"],
  },
  userData: {
    type: Object,
    required: true,
  },
  docData: {
    type: Object,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Number,
    required: true,
  },
  payment: {
    type: Boolean,
    default: false,
  },
  stripeSessionId: {
    type: String,
  },
  paymentMethod: {
    type: String,
    enum: ["Cash", "Stripe"],
    default: "Cash",
  },
  cancelled: {
    type: Boolean,
    default: false,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  admissionStatus: {
    type: String,
    enum: ["General", "Surgery", "None"],
    default: "None",
  },
});

const appointmentModel =
  mongoose.models.appointment ||
  mongoose.model("appointment", appointmentSchema);
export default appointmentModel;
