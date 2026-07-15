import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },
    speciality: {
      type: String,
      required: true,
    },

    fees: {
      type: Number,
      required: true,
    },
    roundFee: {
      type: Number,
      default: 0,
    },
    isSurgeon: {
      type: Boolean,
      default: false,
    },

    image: {
      type: String,
      required: true,
    },

    degree: {
      type: String,
      required: true,
    },

    experience: {
      type: String,
      required: true,
    },
    commission: {
      type: Number,
      default: 20,
    },
    totalPaidToDoctor: {
      type: Number,
      default: 0,
    },
    doctorWallet: {
      type: Number,
      default: 0,
    },
    slots_start: {
      type: String,
      default: "09:00 AM",
    },
    slots_end: {
      type: String,
      default: "05:00 PM",
    },
    slots_booked: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    slotDurationHistory: [
      {
        slotDuration: { type: Number, default: 20 },
        effectiveFrom: { type: Date },
      },
    ],
    slotDuration: {
      type: Number,
      default: 20,
    },
    durationEffectiveFrom: {
      type: String,
      default: "",
    },

    available: {
      type: Boolean,
      default: true,
    },
    deactivationDate: {
      type: Date,
      default: null,
    },
    reactivationDate: {
      type: Date,
      default: null,
    },
    scheduledActivationDate: {
      type: Date,
      default: null,
    },
    weeklySchedule: {
      monday: {
        isAvailable: { type: Boolean, default: true },
        startTime: { type: String, default: "09:00 AM" },
        endTime: { type: String, default: "05:00 PM" },
      },
      tuesday: {
        isAvailable: { type: Boolean, default: true },
        startTime: { type: String, default: "09:00 AM" },
        endTime: { type: String, default: "05:00 PM" },
      },
      wednesday: {
        isAvailable: { type: Boolean, default: true },
        startTime: { type: String, default: "09:00 AM" },
        endTime: { type: String, default: "05:00 PM" },
      },
      thursday: {
        isAvailable: { type: Boolean, default: true },
        startTime: { type: String, default: "09:00 AM" },
        endTime: { type: String, default: "05:00 PM" },
      },
      friday: {
        isAvailable: { type: Boolean, default: true },
        startTime: { type: String, default: "09:00 AM" },
        endTime: { type: String, default: "05:00 PM" },
      },
      saturday: {
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "09:00 AM" },
        endTime: { type: String, default: "05:00 PM" },
      },
      sunday: {
        isAvailable: { type: Boolean, default: false },
        startTime: { type: String, default: "09:00 AM" },
        endTime: { type: String, default: "05:00 PM" },
      },
    },
    about: {
      type: String,
      required: true,
    },
  },
  { timestamps: true, minimize: false },
);

const doctorModel =
  mongoose.models.doctor || mongoose.model("doctor", doctorSchema);
export default doctorModel;
