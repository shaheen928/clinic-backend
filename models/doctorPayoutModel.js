import mongoose from "mongoose";

const doctorPayoutSchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  amountPaid: {
    type: Number,
    required: true  
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Cheque'],
    default: 'Cash'
  },
  referenceNo: {
    type: String, 
    default: ''
  },
  notes: {
    type: String,  
    default: ''
  }
}, { timestamps: true });

 
const doctorPayoutModel = mongoose.models.doctorpayout || mongoose.model('doctorpayout', doctorPayoutSchema);
export default doctorPayoutModel;