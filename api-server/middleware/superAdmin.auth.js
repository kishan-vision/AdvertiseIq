exports.requireSuperAdmin = (req, res, next) => {
  const userRole = req.customer.role;
  if (userRole === 1) {
    next();
  } else {
    return res.status(403).json({
      message: "Access Forbidden: Super Admins Only",
      isSuccess: false,
    });
  }
};
