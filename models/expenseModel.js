 
import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true
    },  
    expenseDate: {
      type: Date,
      default: Date.now  
    },  
    description: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

 const expenseModel = mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
export default expenseModel;