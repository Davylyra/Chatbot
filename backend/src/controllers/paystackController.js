import https from 'https';
import crypto from 'crypto';
import { getCollection } from '../config/db.js';
import { ObjectId } from 'mongodb';
import { createSystemNotification } from './notificationController.js';

// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;

const toObjectIdIfValid = (value) => {
  if (value && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return value;
};

// GHANA MOBILE MONEY PROVIDERS - PRODUCTION READY
const GHANA_MOBILE_MONEY_PROVIDERS = {
  MTN: { code: 'mtn', name: 'MTN Mobile Money', prefixes: ['024', '054', '055', '059'] },
  VODAFONE: { code: 'vod', name: 'Vodafone Cash', prefixes: ['020', '050'] },
  AIRTELTIGO: { code: 'tgo', name: 'AirtelTigo Money', prefixes: ['027', '057', '026', '056'] }
};

// Validate Ghana mobile money number
const validateMobileMoneyNumber = (phoneNumber, provider) => {
  const errors = [];
  
  // Remove spaces and special characters
  const cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Check if it's a valid Ghana number format
  if (!/^(0|\+233)?[0-9]{9}$/.test(cleanNumber)) {
    errors.push('Invalid phone number format. Use format: 0XXXXXXXXX or +233XXXXXXXXX');
    return { valid: false, errors };
  }
  
  // Extract the prefix (first 3 digits after country code)
  let prefix;
  if (cleanNumber.startsWith('+233')) {
    prefix = cleanNumber.substring(4, 7);
  } else if (cleanNumber.startsWith('0')) {
    prefix = cleanNumber.substring(0, 3);
  } else {
    prefix = cleanNumber.substring(0, 3);
  }
  
  // Validate provider prefix
  if (provider) {
    const providerInfo = Object.values(GHANA_MOBILE_MONEY_PROVIDERS).find(
      p => p.code === provider.toLowerCase()
    );
    
    if (!providerInfo) {
      errors.push('Invalid mobile money provider. Use: mtn, voda, or tigo');
      return { valid: false, errors };
    }
    
    if (!providerInfo.prefixes.includes(prefix)) {
      errors.push(`This number (${prefix}) doesn't match ${providerInfo.name}. Expected prefixes: ${providerInfo.prefixes.join(', ')}`);
      return { valid: false, errors };
    }
  }
  
  return { 
    valid: true, 
    cleanNumber: cleanNumber.startsWith('+233') ? cleanNumber : `+233${cleanNumber.substring(1)}`,
    provider: Object.values(GHANA_MOBILE_MONEY_PROVIDERS).find(
      p => p.prefixes.includes(prefix)
    )
  };
};

// Initialize payment with Paystack - ENHANCED FOR GHANA
// FIXED: Enhanced payment initialization with Mobile Money support and form purchases
export const initializePayment = async (req, res) => {
  try {
    const {
      email,
      amount,
      currency = 'GHS',
      metadata,
      paymentMethod = 'card', // 'card' or 'mobile_money'
      mobileMoneyProvider, // 'mtn', 'vod', 'tgo'
      mobileMoneyNumber,
      formId // For form purchases
    } = req.body;
    const userId = req.user.id;

    // Validation
    const errors = [];
    
    if (!email) errors.push('Email is required');
    if (!amount || amount <= 0) errors.push('Valid amount is required');
    if (amount < 1) errors.push('Minimum payment amount is GHS 1.00');
    if (amount > 10000) errors.push('Maximum payment amount is GHS 10,000.00');
    
    // Mobile Money number/provider are optional when user completes details on Paystack checkout.
    let mobileMoneyValidation = null;
    if (paymentMethod === 'mobile_money' && mobileMoneyNumber && mobileMoneyProvider) {
      const validation = validateMobileMoneyNumber(mobileMoneyNumber, mobileMoneyProvider);
      if (!validation.valid) {
        errors.push(...validation.errors);
      } else {
        mobileMoneyValidation = validation;
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Convert amount to pesewas (Paystack uses pesewas for GHS)
    const amountInPesewas = Math.round(amount * 100);
    
    console.log(`💳 Initializing ${paymentMethod} payment: GHS ${amount} for user ${userId}`);

    // Build payment parameters with Ghana-specific enhancements
    const paymentParams = {
      email,
      amount: amountInPesewas,
      currency,
      reference: `glinax_${Date.now()}_${userId}`,
      callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
      metadata: {
        userId,
        service: 'glinax_premium',
        paymentMethod,
        country: 'Ghana',
        ...metadata
      }
    };
    
    // Add mobile money specific parameters
    if (paymentMethod === 'mobile_money') {
      paymentParams.channels = ['mobile_money']; // Restrict to mobile money only
      if (mobileMoneyValidation) {
        paymentParams.metadata.mobile_money = {
          provider: mobileMoneyValidation.provider.name,
          providerCode: mobileMoneyProvider,
          number: mobileMoneyValidation.cleanNumber
        };
      }
    }
    
    const params = JSON.stringify(paymentParams);

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      }
    };

    const paystackRequest = https.request(options, (paystackResponse) => {
      let data = '';

      paystackResponse.on('data', (chunk) => {
        data += chunk;
      });

      paystackResponse.on('end', async () => {
        try {
          const response = JSON.parse(data);
          
          if (response.status) {
            // Handle form purchases vs general payments
            if (formId) {
              // Form purchase - save to payments collection
              const paymentsCollection = await getCollection('payments');
              await paymentsCollection.insertOne({
                user_id: new ObjectId(userId),
                form_id: toObjectIdIfValid(formId),
                amount: amountInPesewas,
                reference: response.data.reference,
                status: 'pending',
                payment_method: paymentMethod,
                mobile_money_provider: mobileMoneyProvider || null,
                mobile_money_number: mobileMoneyValidation ? mobileMoneyValidation.cleanNumber : null,
                paystack_data: response.data,
                created_at: new Date(),
                updated_at: new Date(),
                metadata: {
                  ...metadata,
                  country: 'Ghana',
                  ip_address: req.ip || req.connection.remoteAddress
                }
              });
            } else {
              // General payment - save to transactions collection
              const transactionsCollection = await getCollection('transactions');
              await transactionsCollection.insertOne({
                user_id: new ObjectId(userId),
                reference: response.data.reference,
                amount: amount,
                currency,
                status: 'pending',
                payment_method: paymentMethod,
                mobile_money_provider: mobileMoneyProvider || null,
                mobile_money_number: mobileMoneyValidation ? mobileMoneyValidation.cleanNumber : null,
                paystack_data: response.data,
                created_at: new Date(),
                updated_at: new Date(),
                metadata: {
                  ...metadata,
                  country: 'Ghana',
                  ip_address: req.ip || req.connection.remoteAddress
                }
              });
            }
            
            console.log(`✅ Payment initialized: ${response.data.reference}`);

            res.json({
              success: true,
              data: {
                authorization_url: response.data.authorization_url,
                access_code: response.data.access_code,
                reference: response.data.reference
              }
            });
          } else {
            res.status(400).json({
              success: false,
              message: response.message || 'Payment initialization failed'
            });
          }
        } catch (error) {
          console.error('Paystack response parsing error:', error);
          res.status(500).json({
            success: false,
            message: 'Payment service error'
          });
        }
      });
    });

    paystackRequest.on('error', (error) => {
      console.error('Paystack request error:', error);
      res.status(500).json({
        success: false,
        message: 'Payment service unavailable'
      });
    });

    paystackRequest.write(params);
    paystackRequest.end();

  } catch (error) {
    console.error('Initialize payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment initialization failed'
    });
  }
};

// Verify payment
export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Payment reference is required'
      });
    }

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${reference}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      }
    };

    const paystackRequest = https.request(options, (paystackResponse) => {
      let data = '';

      paystackResponse.on('data', (chunk) => {
        data += chunk;
      });

      paystackResponse.on('end', async () => {
        try {
          const response = JSON.parse(data);
          
          if (response.status && response.data.status === 'success') {
            const reference = req.params.reference;
            const metadata = response.data.metadata || {};

            // Check if this is a form purchase or general payment
            const paymentsCollection = await getCollection('payments');
            const transactionsCollection = await getCollection('transactions');
            const userFormsCollection = await getCollection('user_forms');

            // Check payments collection first (form purchases)
            const paymentRecord = await paymentsCollection.findOne({ reference });

            if (paymentRecord) {
              // This is a form purchase
              await paymentsCollection.updateOne(
                { reference },
                {
                  $set: {
                    status: 'success',
                    verified_at: new Date(),
                    paystack_verification: response.data
                  }
                }
              );

              // Link form to user if payment successful
              if (paymentRecord.form_id) {
                const formCheck = await userFormsCollection.findOne({
                  user_id: paymentRecord.user_id,
                  form_id: paymentRecord.form_id
                });

                if (!formCheck) {
                  await userFormsCollection.insertOne({
                    user_id: paymentRecord.user_id,
                    form_id: paymentRecord.form_id,
                    payment_id: paymentRecord._id,
                    purchase_date: new Date()
                  });
                  console.log(`✅ Form ${paymentRecord.form_id} linked to user ${String(paymentRecord.user_id)}`);
                }
              }
            } else {
              // This is a general payment (premium subscription)
              const usersCollection = await getCollection('users');

              await transactionsCollection.updateOne(
                { reference },
                {
                  $set: {
                    status: 'success',
                    verified_at: new Date(),
                    paystack_verification: response.data
                  }
                }
              );

              // Update user's premium status
              const userId = response.data.metadata?.userId;
              if (userId) {
                await usersCollection.updateOne(
                  { _id: new ObjectId(userId) },
                  {
                    $set: {
                      is_premium: true,
                      premium_activated_at: new Date(),
                      premium_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
                    }
                  }
                );
              }
            }

            res.json({
              success: true,
              message: 'Payment verified successfully',
              data: {
                status: response.data.status,
                amount: response.data.amount / 100, // Convert back from pesewas
                currency: response.data.currency,
                paid_at: response.data.paid_at
              }
            });
          } else {
            const currentStatus = response?.data?.status;
            const isFailed = currentStatus === 'failed';

            res.status(200).json({
              success: !isFailed,
              message: isFailed ? 'Payment failed' : 'Payment still pending',
              data: {
                status: currentStatus || 'pending',
                amount: response?.data?.amount ? response.data.amount / 100 : undefined,
                currency: response?.data?.currency,
                paid_at: response?.data?.paid_at
              }
            });
          }
        } catch (error) {
          console.error('Payment verification parsing error:', error);
          res.status(500).json({
            success: false,
            message: 'Payment verification error'
          });
        }
      });
    });

    paystackRequest.on('error', (error) => {
      console.error('Payment verification request error:', error);
      res.status(500).json({
        success: false,
        message: 'Payment verification service unavailable'
      });
    });

    paystackRequest.end();

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
};

// Webhook handler for Paystack
export const handleWebhook = async (req, res) => {
  try {
    // Paystack sends raw body; route uses express.raw so req.body will be a Buffer
    const rawBody = req.body;
    const signatureHeader = req.headers['x-paystack-signature'];

    if (!signatureHeader) {
      console.warn('⚠️ Paystack webhook missing signature header');
      return res.status(400).json({ success: false, message: 'Missing signature header' });
    }

    const computedHash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(JSON.stringify(rawBody)))
      .digest('hex');

    // Use timing-safe comparison
    const signatureBuffer = Buffer.from(String(signatureHeader));
    const computedBuffer = Buffer.from(computedHash);
    if (signatureBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, computedBuffer)) {
      console.warn('⚠️ Paystack webhook signature mismatch');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body;
    
    if (event.event === 'charge.success') {
      const { reference, status, amount, currency, metadata } = event.data;

      // Check if this is a form purchase or general payment
      const paymentsCollection = await getCollection('payments');
      const transactionsCollection = await getCollection('transactions');
      const userFormsCollection = await getCollection('user_forms');
      const usersCollection = await getCollection('users');

      // Check payments collection first (form purchases)
      const paymentRecord = await paymentsCollection.findOne({ reference });

      if (paymentRecord) {
        // This is a form purchase
        await paymentsCollection.updateOne(
          { reference },
          {
            $set: {
              status: 'success',
              webhook_received_at: new Date(),
              webhook_data: event.data
            }
          }
        );

        // Link form to user if payment successful
        if (paymentRecord.form_id) {
          const formCheck = await userFormsCollection.findOne({
            user_id: paymentRecord.user_id,
            form_id: paymentRecord.form_id
          });

          if (!formCheck) {
            await userFormsCollection.insertOne({
              user_id: paymentRecord.user_id,
              form_id: paymentRecord.form_id,
              payment_id: paymentRecord._id,
              purchase_date: new Date()
            });
            console.log(`✅ Form ${paymentRecord.form_id} linked to user via webhook`);

            // Send success notification
            await createSystemNotification(paymentRecord.user_id.toString(), 'payment_success', {
              amount: (amount / 100).toFixed(2), // Convert from pesewas
              transactionId: reference
            });
          }
        }
      } else {
        // This is a general payment (premium subscription)
        await transactionsCollection.updateOne(
          { reference },
          {
            $set: {
              status: 'successful',
              webhook_received_at: new Date(),
              webhook_data: event.data
            }
          }
        );

        // Activate premium for user
        if (metadata && metadata.userId) {
          await usersCollection.updateOne(
            { _id: new ObjectId(metadata.userId) },
            {
              $set: {
                is_premium: true,
                premium_activated_at: new Date(),
                premium_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              }
            }
          );
        }
      }

      console.log(`✅ Payment confirmed via webhook: ${reference}`);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
};

// Get user transactions
export const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const userObjectId = new ObjectId(userId);
    const transactionsCollection = await getCollection('transactions');
    const paymentsCollection = await getCollection('payments');

    const [transactions, payments] = await Promise.all([
      transactionsCollection
        .find({ user_id: userObjectId })
        .sort({ created_at: -1 })
        .limit(50)
        .toArray(),
      paymentsCollection
        .find({ user_id: userObjectId })
        .sort({ created_at: -1 })
        .limit(50)
        .toArray()
    ]);

    const normalizeStatus = (status) => {
      if (status === 'success' || status === 'successful') return 'success';
      if (status === 'failed') return 'failed';
      return 'pending';
    };

    const normalizedTransactions = transactions.map((tx) => ({
      ...tx,
      status: normalizeStatus(tx.status)
    }));

    const normalizedPayments = payments.map((payment) => ({
      ...payment,
      type: 'Form Purchase',
      amount_paid: payment.amount_paid ?? (typeof payment.amount === 'number' ? payment.amount / 100 : payment.amount),
      status: normalizeStatus(payment.status),
      university_name: payment.metadata?.universityName || payment.university_name,
      form_name: payment.metadata?.formName || payment.form_name,
      paid_at: payment.paid_at || payment.verified_at || payment.updated_at
    }));

    const merged = [...normalizedTransactions, ...normalizedPayments]
      .sort((a, b) => new Date(b.created_at || b.paid_at || b.updated_at || 0) - new Date(a.created_at || a.paid_at || a.updated_at || 0))
      .slice(0, 100);

    res.json({
      success: true,
      data: merged
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
};
