import mongoose from "mongoose";
import bcrypt from "bcrypt";
const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    staffType: {
      type: String,
      enum: ["Clinical", "Support"],
      required: true,
    },
    salary: {
      type: Number,
      required: true,
      default: 0,
    },
    absentDates: {
      type: [String],
      default: [],
    },
    password: {
      type: String,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    inactiveDaysThisMonth: {
      type: Number,
      default: 0,
    },
    deductInactiveDays: {
      type: Boolean,
      default: true,
    },
    advanceBalance: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

staffSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw new Error(error);
  }
});

const staffModel =
  mongoose.models.Staff || mongoose.model("Staff", staffSchema);
export default staffModel;
