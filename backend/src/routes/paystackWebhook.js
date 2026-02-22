/**
 * PAYSTACK WEBHOOK HANDLER - PRODUCTION READY
 * CRITICAL: Handles payment verification with signature validation
 * 
 * This endpoint receives webhooks from Paystack when payment status changes.
 * It verifies the signature, updates payment records, and triggers fulfillment actions.
 * 
 * Security: HMAC-SHA512 signature verification required
 */

import express from 'express';
import crypto from 'crypto';
import { getCollection } from '../config/db.js';
import { ObjectId } from 'mongodb';
import { createSystemNotification } from '../controllers/notificationController.js';

const router = express.Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * CRITICAL: Verify Paystack webhook signature
 * Prevents fake payment notifications
 */
function verifyPaystackSignature(req) {
  const signature = req.headers['x-paystack-signature'];
  const body = req.rawBody; // Use raw body, not parsed JSON
  
  if (!signature) {
    console.warn('⚠️ Missing Paystack signature header');
    return false;
  }
  
  try {
    // Compute HMAC-SHA512 of request body using secret key
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(body)
      .digest('hex');
    
    // Compare signatures (constant time to prevent timing attacks)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
    
    if (isValid) {
      console.log('✅ Paystack signature verified');
      return true;
    } else {
      console.error('❌ SECURITY: Invalid Paystack signature - possible attack!');
      return false;
    }
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

/**
 * Parse raw body middleware for webhook signature verification
 * MUST come before express.json()
 * CRITICAL: Stores raw body in req.rawBody for HMAC verification
 */
router.use((req, res, next) => {
  if (req.path === '/paystack') {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      // CRITICAL: Store raw body for signature verification
      req.rawBody = data;
      try {
        req.body = JSON.parse(data);
        next();
      } catch (e) {
        console.error('❌ Failed to parse webhook JSON:', e);
        req.body = {};
        res.status(400).json({ success: false, message: 'Invalid JSON in webhook body' });
      }
    });
  } else {
    express.json()(req, res, next);
  }
});

/**
 * Main webhook endpoint - Handles all Paystack events
 * Path: POST /api/payments/webhook
 */
router.post('/', async (req, res) => {
  try {
    // CRITICAL: Verify signature first
    if (!verifyPaystackSignature(req)) {
      console.error('🚨 SECURITY ALERT: Webhook signature verification failed!');
      return res.status(403).json({
        success: false,
        message: 'Signature verification failed'
      });
    }

    const { event, data } = req.body;

    console.log(`📥 Paystack webhook received: ${event}`, {
      event,
      reference: data?.reference,
      amount: data?.amount,
      status: data?.status,
      customer: data?.customer?.email
    });

    // Only process charge.success events (payment confirmed)
    if (event === 'charge.success') {
      await handleChargeSuccess(data, res);
    } else if (event === 'charge.failed') {
      await handleChargeFailed(data, res);
    } else if (event === 'subscription.created') {
      console.log('📝 Subscription created:', data.subscription_code);
      res.json({ success: true, message: 'Subscription event processed' });
    } else {
      console.log(`ℹ️ Unhandled event: ${event}`);
      res.json({ success: true, message: `Event ${event} received but not processed` });
    }

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
});

/**
 * Handle successful charge (charge.success event)
 * Updates payment status, fulfills order, sends notifications
 */
async function handleChargeSuccess(data, res) {
  try {
    const {
      reference,
      amount,
      currency,
      status,
      customer,
      metadata,
      paid_at,
      authorization
    } = data;

    console.log('💳 Processing successful charge:', {
      reference,
      amount: amount / 100, // Paystack returns amount in kobo
      currency,
      customer: customer?.email,
      metadata
    });

    // Update payment record in database
    const paymentsCollection = await getCollection('payments');
    const transactionsCollection = await getCollection('transactions');
    const usersCollection = await getCollection('users');

    // Check if this is a form payment or general transaction
    const paymentRecord = await paymentsCollection.findOne({ reference });
    const isFormPayment = !!paymentRecord;

    if (isFormPayment && paymentRecord) {
      // UPDATE FORM PAYMENT
      console.log('📋 Updating form payment record');
      
      const updateResult = await paymentsCollection.updateOne(
        { reference },
        {
          $set: {
            status: 'success',
            amount_paid: amount / 100, // Convert from kobo
            currency,
            paid_at: new Date(paid_at),
            authorization: authorization,
            webhook_verified: true,
            verified_at: new Date(),
            metadata: {
              ...paymentRecord.metadata,
              verification_timestamp: new Date().toISOString(),
              paystack_reference: reference
            }
          }
        }
      );

      if (updateResult.modifiedCount === 0) {
        console.warn('⚠️ Payment record was not updated (may have been updated before)');
      } else {
        console.log('✅ Payment record updated to "success"');
      }

      // FULFILL ACTION: Grant access to form or digital product
      const userId = paymentRecord.user_id;
      const formId = paymentRecord.form_id;

      if (userId && formId) {
        const userCollection = await getCollection('users');
        
        // Mark form as purchased/accessible for user
        const purchaseResult = await userCollection.updateOne(
          { _id: new ObjectId(userId) },
          {
            $addToSet: {
              purchased_forms: new ObjectId(formId),
              payment_history: {
                form_id: new ObjectId(formId),
                reference,
                amount: amount / 100,
                purchased_at: new Date(),
                status: 'success'
              }
            }
          }
        );

        if (purchaseResult.modifiedCount > 0) {
          console.log('✅ Form access granted to user:', userId);
          
          // Send notification to user
          try {
            const user = await userCollection.findOne({ _id: new ObjectId(userId) });
            if (user && global.io) {
              global.io.to(`user_${userId}`).emit('notification', {
                type: 'payment_success',
                title: '✅ Payment Successful',
                message: `Your form purchase has been completed. Access granted!`,
                timestamp: new Date().toISOString(),
                metadata: {
                  reference,
                  formId,
                  amount: amount / 100
                }
              });
              console.log('📢 Payment success notification sent to user');
            }

            // Create system notification
            await createSystemNotification({
              userId,
              title: 'Payment Successful',
              message: 'Your form purchase is now active. You can now access the form.',
              type: 'payment_success',
              data: { reference, formId }
            });
          } catch (notifErr) {
            console.warn('⚠️ Could not send payment notification:', notifErr.message);
          }
        }
      }

    } else {
      // UPDATE GENERAL TRANSACTION
      console.log('💰 Updating general transaction record');
      
      const transactionRecord = await transactionsCollection.findOne({ reference });
      
      if (transactionRecord) {
        const updateResult = await transactionsCollection.updateOne(
          { reference },
          {
            $set: {
              status: 'success',
              amount_paid: amount / 100,
              currency,
              paid_at: new Date(paid_at),
              authorization: authorization,
              webhook_verified: true,
              verified_at: new Date()
            }
          }
        );

        if (updateResult.modifiedCount > 0) {
          console.log('✅ Transaction record updated to "success"');

          // Send success notification
          const userId = transactionRecord.user_id;
          if (userId && global.io) {
            global.io.to(`user_${userId}`).emit('notification', {
              type: 'payment_success',
              title: '✅ Payment Successful',
              message: `Payment of GHS ${amount / 100} has been received and verified.`,
              timestamp: new Date().toISOString(),
              metadata: { reference, amount: amount / 100 }
            });
          }
        }
      }
    }

    // SUCCESS RESPONSE
    console.log('✅ Charge success webhook processed');
    res.json({
      success: true,
      message: 'Payment verified and processed',
      reference
    });

  } catch (error) {
    console.error('❌ Error handling charge success:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Handle failed charge (charge.failed event)
 */
async function handleChargeFailed(data, res) {
  try {
    const { reference, reason, authorization } = data;

    console.log('❌ Processing failed charge:', {
      reference,
      reason,
      authorization
    });

    const paymentsCollection = await getCollection('payments');
    const transactionsCollection = await getCollection('transactions');

    // Update payment record
    const paymentRecord = await paymentsCollection.findOne({ reference });
    
    if (paymentRecord) {
      await paymentsCollection.updateOne(
        { reference },
        {
          $set: {
            status: 'failed',
            failure_reason: reason,
            failed_at: new Date()
          }
        }
      );

      // Send failure notification to user
      if (paymentRecord.user_id && global.io) {
        global.io.to(`user_${paymentRecord.user_id}`).emit('notification', {
          type: 'payment_failed',
          title: '❌ Payment Failed',
          message: `Payment failed: ${reason}. Please try again or contact support.`,
          timestamp: new Date().toISOString(),
          metadata: { reference, reason }
        });
      }
    } else {
      // Try general transaction
      const transRecord = await transactionsCollection.findOne({ reference });
      if (transRecord) {
        await transactionsCollection.updateOne(
          { reference },
          {
            $set: {
              status: 'failed',
              failure_reason: reason,
              failed_at: new Date()
            }
          }
        );
      }
    }

    console.log('✅ Charge failure webhook processed');
    res.json({
      success: true,
      message: 'Failed charge recorded',
      reference
    });

  } catch (error) {
    console.error('❌ Error handling charge failure:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing failed charge',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export default router;
