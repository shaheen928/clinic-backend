import jwt from "jsonwebtoken";

const authUser = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Not Authorized. Login Again" });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
      res.status(401);
      throw new Error("Not Authorized, token missing. Please login again");
    }
    const token_decode = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = token_decode.id;
    next();
  } catch (error) {
    console.log(error);
    res
      .status(401)
      .json({ success: false, message: error.message || "Invalid Token" });
  }
};

export default authUser;
