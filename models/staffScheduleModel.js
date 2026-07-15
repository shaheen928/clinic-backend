// import mongoose from "mongoose";

// const staffScheduleSchema = new mongoose.Schema(
//   {
//     staffId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "staff",
//       required: true,
//     },
//     wardCategory: {
//       type: String,
//       required: true,
//       enum: ["General Ward", "ICU", "CCU", "Private Room", "Semi-Private"],
//     },
//     shift: {
//       type: String,
//       required: true,
//       enum: ["Morning", "Evening", "Night"],
//     },
//     dutyDate: {
//       type: Date,
//       required: true,
//     },
//   },
//   { timestamps: true }
// );

//  staffScheduleSchema.index({ staffId: 1, dutyDate: 1, }, { unique: true });

// const staffScheduleModel =
//   mongoose.models.staffSchedule || mongoose.model("staffSchedule", staffScheduleSchema);

// export default staffScheduleModel;

import mongoose from "mongoose";

const staffScheduleSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "staff",
      required: true,
    },
    assignedLocation: {
      type: String,
      required: true,
    },
    shift: {
      type: String,
      required: true,
      enum: ["Morning", "Evening", "Night"],
    },
    dutyDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

staffScheduleSchema.index(
  { staffId: 1, dutyDate: 1, shift: 1 },
  { unique: true },
);

const staffScheduleModel =
  mongoose.models.staffSchedule ||
  mongoose.model("staffSchedule", staffScheduleSchema);

export default staffScheduleModel;
