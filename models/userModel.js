import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  password: {
    type: String,
    required: true,
  },

  phone: {
    type: String,
    default: "",
  },

  address: {
    type: {
      line1: { type: String, default: "" },
      line2: { type: String, default: "" },
    },
    default: {},
  },
});

const userModel = mongoose.models.user || mongoose.model("user", userSchema);
export default userModel;
