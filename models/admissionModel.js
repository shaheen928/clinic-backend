import mongoose from "mongoose";

const admissionSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "appointment",
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "doctor",
      required: true,
    },
    bedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bed",
      default: null,
    },

    admissionType: {
      type: String,
      enum: ["General", "Surgery"],
      required: true,
    },

    admissionDate: { type: Date, default: Date.now },
    dischargeDate: { type: Date },

    status: {
      type: String,
      enum: [
        "Awaiting Bed",
        "Admitted",
        "Discharged",
        "Cancelled",
        "Scheduled",
      ],
      default: "Awaiting Bed",
    },

    dischargeStatus: {
      type: String,
      enum: ["Active", "Pending Clearance", "Cleared"],
      default: "Active",
    },

    locationStatus: {
      type: String,
      enum: ["In Ward", "In OT", "Recovery"],
      default: "In Ward",
    },

    totalRounds: {
      type: Number,
      default: 0,
    },

    surgeryDetails: {
      hasSurgery: { type: Boolean, default: false },
      surgeryName: { type: String },
      surgeryDate: { type: Date },
      durationHours: { type: Number, default: 1 },
      theaterNo: { type: String },
      surgeryFee: { type: Number, default: 0 },
      surgeryStatus: {
        type: String,
        enum: ["Pending", "Completed", "Cancelled"],
        default: "Pending",
      },
    },

    isPaid: {
      type: Boolean,
      default: false,
    },

    stripeSessionId: {
      type: String,
      default: null,
    },

    notes: { type: String },
  },
  { timestamps: true },
);

const admissionModel =
  mongoose.models.admission || mongoose.model("admission", admissionSchema);
export default admissionModel;
