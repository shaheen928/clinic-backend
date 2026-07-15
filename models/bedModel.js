import mongoose from 'mongoose'


const bedSchema = new mongoose.Schema(
  {
  bedNumber: {
    type: String,
    required: true,
    unique: true,  
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ["General Ward", "ICU", "CCU", "Private Room", "Semi-Private"],
  },
  pricePerDay: {
    type: Number,
    required: true,
    default: 0,
  },
  status: {
    type: String,
    required: true,
    enum: ["Available", "Occupied"],
    default: "Available",  
  },
  currentPatient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "appointment", 
    default: null,
  },
},{ timestamps: true }
);
const bedModel = mongoose.models.bed || mongoose.model("bed", bedSchema);
export default bedModel;