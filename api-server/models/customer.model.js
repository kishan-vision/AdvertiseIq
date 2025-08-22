const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      unique: true,
    },
    phoneNumber: {
      type: Number,
      trim: true,
    },
    password: {
      type: String,
      trim: true,
    },
    otpCode: {
      type: Number,
      default: null,
    },
    otpExpireIn: {
      type: Number,
      default: null,
    },
    accessToken: {
      type: String,
      trim: true,
    },
    refreshToken: {
      type: String,
      trim: true,
    },
    tokenExpire: {
      type: Number,
      trim: true,
    },
    role: {
      type: Number,
    },
    timezone: {
      type: String,
      trim: true,
    },
    country: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "countrie",
    },
    keywordResearchLimit: {
      type: Number,
      default: 1,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "package",
    },
    priceId: {
      type: mongoose.Schema.Types.ObjectId,
      trim: true,
    },
    packageStartDate: {
      type: String,
      trim: true,
    },
    packageEndDate: {
      type: String,
      trim: true,
    },
    priceType: {
      type: mongoose.Schema.Types.Mixed,
      trim: true,
    },
    roleName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      trim: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      trim: true,
    },
    clientId: {
      type: String,
      trim: true,
    },
    clientSecret: {
      type: String,
      trim: true,
    },
    adsRefreshToken: {
      type: String,
      trim: true,
    },
    stringPassword: {
      type: String,
      trim: true,
    },
    vendorClientId: {
      type: String,
      trime: true,
    },
    vendorClientSecret: {
      type: String,
      trime: true,
    },
    vendorRefreshToken: {
      type: String,
      trime: true,
    },
    sellerClientId: {
      type: String,
      trim: true,
    },
    sellerClientSecret: {
      type: String,
      trim: true,
    },
    sellerRefreshToken: {
      type: String,
      trim: true,
    },
    companyName: {
      type: String,
      trime: true,
    },
    companyGstNumber: {
      type: String,
      trime: true,
    },
    companyAddress: {
      type: String,
      trime: true,
    },
    companyWebsite: {
      type: String,
      trim: true,
    },
    companyPhoneNumber: {
      type: String,
      trime: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = new mongoose.model("customer", customerSchema);
