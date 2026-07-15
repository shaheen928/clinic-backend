import mongoose, { mongo } from "mongoose";
const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Utilities",
        "Medical Supplies",
        "Refreshment",
        "Rent",
        "Maintenance",
        "Others",
      ],
      default: "Others",
    },
    amount: {
      type: Number,
      required: true,
    },
    expenseDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    description: {
      type: String,
      default: "",
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);
const expenseModel =
  mongoose.models.expense || mongoose.model("expense", expenseSchema);
export default expenseModel;
