import express from "express";
import { getCollection } from "../config/db.js";
import { ObjectId } from "mongodb";
import authMiddleware from "../middleware/authMiddleware.js";
import axios from "axios";
import crypto from "crypto";
import sendVerificationEmail from "../utils/sendVerificationEmail.js";

const router = express.Router();

/* -------------------- 🟢 GET ALL AVAILABLE FORMS -------------------- */
router.get("/", async (req, res) => {
  try {
    const formsCollection = await getCollection("forms");
    const forms = await formsCollection
      .find({})
      .sort({ created_at: -1 })
      .toArray();
    
    const formattedForms = forms.map(form => ({
      id: form._id.toString(),
      name: form.name,
      university_name: form.university_name,
      description: form.description,
      price: form.price,
      deadline: form.deadline,
      is_available: form.is_available,
      requirements: form.requirements,
      created_at: form.created_at,
      updated_at: form.updated_at
    }));
    
    res.status(200).json({ forms: formattedForms });
  } catch (err) {
    console.error("Error fetching forms:", err.message);
    res.status(500).json({ message: "Error fetching forms" });
  }
});

/* -------------------- 🟢 BUY FORM / INITIALIZE PAYMENT -------------------- */
router.post("/:id/purchase", authMiddleware, async (req, res) => {
  const { form_id, email, payment_method } = req.body;

  if (!form_id || !email) {
    return res.status(400).json({ message: "Form ID and email are required" });
  }

  try {
    const usersCollection = await getCollection("users");
    const formsCollection = await getCollection("forms");
    
    // Get user info
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.id) });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.is_verified) {
      // Generate OTP for email verification
      const otp = Math.floor(100000 + Math.random() * 900000);
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await usersCollection.updateOne(
        { _id: new ObjectId(req.user.id) },
        { 
          $set: { 
            otp_code: otp, 
            otp_expires_at: expires,
            updated_at: new Date()
          } 
        }
      );

      await sendVerificationEmail(user.email, otp);

      return res.status(403).json({
        message: "Email not verified. Verification code sent to your email.",
      });
    }

    // Check if form exists
    const form = await formsCollection.findOne({ _id: new ObjectId(form_id) });
    if (!form) {
      return res.status(404).json({ message: "Form not found or unavailable." });
    }
    const amount = parseFloat(form.price);
    const amountInPesewas = amount * 100;
    const reference = `FORM_${form_id}_${Date.now()}_${req.user.id}`;

    // Initialize Paystack payment
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amountInPesewas,
        reference,
        callback_url: "https://yourfrontend.com/payment/callback",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Save payment info to DB
    const paymentsCollection = await getCollection("payments");
    const newPayment = {
      user_id: new ObjectId(req.user.id),
      form_id: new ObjectId(form_id),
      amount: amountInPesewas,
      reference,
      status: "pending",
      payment_method: payment_method || "paystack",
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const paymentResult = await paymentsCollection.insertOne(newPayment);
    
    const payment = {
      id: paymentResult.insertedId.toString(),
      ...newPayment,
      user_id: req.user.id,
      form_id: form_id
    };

    res.status(200).json({
      message: "Payment initialized successfully",
      authorization_url: response.data.data.authorization_url,
      reference,
      payment,
    });
  } catch (err) {
    console.error("Error buying form:", err.message);
    res.status(500).json({ message: "Error initializing payment for form" });
  }
});

/* -------------------- 🟢 VERIFY PAYMENT AND LINK FORM -------------------- */
router.get("/verify/:reference", authMiddleware, async (req, res) => {
  const { reference } = req.params;

  try {
    // Verify payment with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const { status, amount, customer } = response.data.data;

    // Update payment status
    const paymentsCollection = await getCollection("payments");
    const userFormsCollection = await getCollection("user_forms");
    
    const updateResult = await paymentsCollection.findOneAndUpdate(
      { reference },
      { 
        $set: { 
          status,
          updated_at: new Date()
        } 
      },
      { returnDocument: 'after' }
    );

    if (!updateResult.value) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = updateResult.value;

    // If successful, link form to user
    if (status === "success" && payment.form_id) {
      const formCheck = await userFormsCollection.findOne({
        user_id: payment.user_id,
        form_id: payment.form_id
      });

      if (!formCheck) {
        await userFormsCollection.insertOne({
          user_id: payment.user_id,
          form_id: payment.form_id,
          payment_id: payment._id,
          purchase_date: new Date()
        });
      }
    }

    res.status(200).json({
      message: "Payment verified successfully",
      status,
      payment,
    });
  } catch (err) {
    console.error("Error verifying form payment:", err.message);
    res.status(500).json({ message: "Error verifying form payment" });
  }
});

/* -------------------- 🟢 GET USER'S PURCHASED FORMS -------------------- */
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const userFormsCollection = await getCollection("user_forms");
    const formsCollection = await getCollection("forms");
    
    const userForms = await userFormsCollection
      .find({ user_id: new ObjectId(req.user.id) })
      .sort({ purchase_date: -1 })
      .toArray();
    
    const formIds = userForms.map(uf => uf.form_id);
    const forms = await formsCollection
      .find({ _id: { $in: formIds } })
      .toArray();
    
    const formsMap = new Map(forms.map(f => [f._id.toString(), f]));
    
    const result = userForms.map(uf => {
      const form = formsMap.get(uf.form_id.toString());
      return {
        form_id: form?._id.toString(),
        name: form?.name,
        description: form?.description,
        price: form?.price,
        purchase_date: uf.purchase_date
      };
    });

    res.status(200).json({ forms: result });
  } catch (err) {
    console.error("Error fetching user forms:", err.message);
    res.status(500).json({ message: "Error fetching purchased forms" });
  }
});

export default router;
