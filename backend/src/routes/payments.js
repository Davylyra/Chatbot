import express from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { validatePaymentPayload } from "../middleware/inputValidation.js";
import { 
  initializePayment, 
  verifyPayment, 
  handleWebhook, 
  getUserTransactions 
} from "../controllers/paystackController.js";

const router = express.Router();

// Initialize payment
router.post("/initialize", verifyAuth, validatePaymentPayload, initializePayment);

// Verify payment
router.get("/verify/:reference", verifyAuth, verifyPayment);

// Get user transactions
router.get("/transactions", verifyAuth, getUserTransactions);

// Get payment plans - GHANA PRICING
router.get("/plans", (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 'premium_monthly',
        name: 'Premium Monthly',
        description: 'Unlimited questions, priority support, advanced features',
        amount: 20.00,
        currency: 'GHS',
        interval: 'monthly',
        features: [
          'Unlimited AI conversations',
          'Priority customer support',
          'Advanced university search',
          'Scholarship recommendations',
          'Application deadline reminders',
          'Document analysis and review',
          'Personalized admission guidance'
        ]
      },
      {
        id: 'premium_yearly',
        name: 'Premium Yearly',
        description: 'All premium features with 2 months free',
        amount: 200.00,
        currency: 'GHS',
        interval: 'yearly',
        features: [
          'Unlimited AI conversations',
          'Priority customer support',
          'Advanced university search',
          'Scholarship recommendations',
          'Application deadline reminders',
          'Document analysis and review',
          'Personalized admission guidance',
          '2 months free (Save GHS 40!)'
        ],
        recommended: true
      }
    ]
  });
});

// Get supported mobile money providers
router.get("/mobile-money-providers", (req, res) => {
  res.json({
    success: true,
    data: [
      {
        code: 'mtn',
        name: 'MTN Mobile Money',
        logo: '/logos/mtn.png',
        prefixes: ['024', '054', '055', '059'],
        description: 'Pay with your MTN Mobile Money account',
        active: true
      },
      {
        code: 'vod',
        name: 'Vodafone Cash',
        logo: '/logos/vodafone.png',
        prefixes: ['020', '050'],
        description: 'Pay with your Vodafone Cash account',
        active: true
      },
      {
        code: 'tgo',
        name: 'AirtelTigo Money',
        logo: '/logos/airteltigo.png',
        prefixes: ['027', '057', '026', '056'],
        description: 'Pay with your AirtelTigo Money account',
        active: true
      }
    ]
  });
});

export default router;