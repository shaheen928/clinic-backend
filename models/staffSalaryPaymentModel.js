import mongoose from "mongoose";
const staffSalarySchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    month: {
      type: String,
      required: true,
    },
    calculatedSalary: {
      type: Number,
      required: true,
    },
    advanceDeduction: {
      type: Number,
      default: 0,
    },
    netPayable: {
      type: Number,
      required: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    remainingBalance: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["Unpaid", "Partially Paid", "Paid", "Overpaid"],
      default: "Unpaid",
    },
    paymentHistory: [
      {
        amount: Number,
        date: { type: Date, default: Date.now },
        paymentMode: {
          type: String,
          enum: ["Cash", "Bank Transfer"],
          default: "Cash",
        },
        notes: String,
      },
    ],
  },
  { timestamps: true },
);

staffSalarySchema.pre("save", function () {
  if (this.amountPaid >= this.netPayable) {
    this.remainingBalance = 0;
  } else {
    this.remainingBalance = this.netPayable - this.amountPaid;
  }

  if (this.amountPaid === 0) {
    this.status = "Unpaid";
  } else if (this.amountPaid < this.netPayable) {
    this.status = "Partially Paid";
  } else if (this.amountPaid === this.netPayable) {
    this.status = "Paid";
  } else {
    this.status = "Overpaid";
  }
});

const staffSalaryModel =
  mongoose.models.staffSalary ||
  mongoose.model("staffSalary", staffSalarySchema);
export default staffSalaryModel;
