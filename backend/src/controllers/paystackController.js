import https from 'https';
import crypto from 'crypto';
import { getCollection, getClient } from '../config/db.js';
import { ObjectId } from 'mongodb';
import { createSystemNotification } from './notificationController.js';
import { sendPurchaseEmail, sendAdminAlertEmail } from '../utils/sendPurchaseEmail.js';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;

const toObjectIdIfValid = (identifier) => {
  if (identifier && ObjectId.isValid(identifier)) return new ObjectId(identifier);
  return identifier;
};

const GHANA_MOBILE_MONEY_PROVIDERS = {
  MTN: { code: 'mtn', name: 'MTN Mobile Money', prefixes: ['024', '054', '055', '059'] },
  VODAFONE: { code: 'vod', name: 'Vodafone Cash', prefixes: ['020', '050'] },
  AIRTELTIGO: { code: 'tgo', name: 'AirtelTigo Money', prefixes: ['027', '057', '026', '056'] }
};

const validateMobileMoneyNumber = (phoneNumber, providerCode) => {
  const validationFailures = [];
  const sanitizedNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  if (!/^(0|\+233)?[0-9]{9}$/.test(sanitizedNumber)) {
    validationFailures.push('Invalid phone number format. Use format: 0XXXXXXXXX or +233XXXXXXXXX');
    return { valid: false, errors: validationFailures };
  }
  
  const networkPrefix = sanitizedNumber.startsWith('+233') ? sanitizedNumber.substring(4, 7) : sanitizedNumber.substring(0, 3);
  
  if (providerCode) {
    const matchedProvider = Object.values(GHANA_MOBILE_MONEY_PROVIDERS).find(p => p.code === providerCode.toLowerCase());
    if (!matchedProvider) {
      validationFailures.push('Invalid mobile money provider. Use: mtn, voda, or tigo');
      return { valid: false, errors: validationFailures };
    }
    if (!matchedProvider.prefixes.includes(networkPrefix)) {
      validationFailures.push(`This number (${networkPrefix}) doesn't match ${matchedProvider.name}. Expected prefixes: ${matchedProvider.prefixes.join(', ')}`);
      return { valid: false, errors: validationFailures };
    }
  }
  
  return { 
    valid: true, 
    cleanNumber: sanitizedNumber.startsWith('+233') ? sanitizedNumber : `+233${sanitizedNumber.substring(1)}`,
    provider: Object.values(GHANA_MOBILE_MONEY_PROVIDERS).find(p => p.prefixes.includes(networkPrefix))
  };
};

export const initializePayment = async (req, res) => {
  try {
    const { email, amount, currency = 'GHS', metadata, paymentMethod = 'card', mobileMoneyProvider, mobileMoneyNumber, formId } = req.body;
    const studentId = req.user.id;
    const validationFailures = [];
    
    if (!email) validationFailures.push('Email is required');
    if (!amount || amount <= 0) validationFailures.push('Valid amount is required');
    if (amount < 1) validationFailures.push('Minimum payment amount is GHS 1.00');
    if (amount > 10000) validationFailures.push('Maximum payment amount is GHS 10,000.00');
    
    let verifiedMomoDetails = null;
    if (paymentMethod === 'mobile_money' && mobileMoneyNumber && mobileMoneyProvider) {
      const momoValidation = validateMobileMoneyNumber(mobileMoneyNumber, mobileMoneyProvider);
      if (!momoValidation.valid) validationFailures.push(...momoValidation.errors);
      else verifiedMomoDetails = momoValidation;
    }
    
    if (validationFailures.length) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: validationFailures });
    }

    const amountInPesewas = Math.round(amount * 100);
    const transactionParams = {
      email,
      amount: amountInPesewas,
      currency,
      reference: `glinax_${Date.now()}_${studentId}`,
      callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
      metadata: { userId: studentId, service: 'glinax_premium', paymentMethod, country: 'Ghana', ...metadata }
    };
    
    if (paymentMethod === 'mobile_money') {
      transactionParams.channels = ['mobile_money'];
      if (verifiedMomoDetails) {
        transactionParams.metadata.mobile_money = {
          provider: verifiedMomoDetails.provider.name,
          providerCode: mobileMoneyProvider,
          number: verifiedMomoDetails.cleanNumber
        };
      }
    }
    
    const requestPayload = JSON.stringify(transactionParams);
    const requestOptions = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }
    };

    const paystackCall = https.request(requestOptions, (paystackResponse) => {
      let responseBody = '';
      paystackResponse.on('data', (chunk) => { responseBody += chunk; });
      paystackResponse.on('end', async () => {
        try {
          const parsedResponse = JSON.parse(responseBody);
          if (parsedResponse.status) {
            const documentBase = {
              user_id: new ObjectId(studentId),
              amount: formId ? amountInPesewas : amount,
              currency: formId ? undefined : currency,
              reference: parsedResponse.data.reference,
              status: 'pending',
              payment_method: paymentMethod,
              mobile_money_provider: mobileMoneyProvider || null,
              mobile_money_number: verifiedMomoDetails ? verifiedMomoDetails.cleanNumber : null,
              paystack_data: parsedResponse.data,
              created_at: new Date(),
              updated_at: new Date(),
              metadata: { ...metadata, country: 'Ghana', ip_address: req.ip || req.connection.remoteAddress }
            };

            if (formId) {
              const paymentArchive = await getCollection('payments');
              await paymentArchive.insertOne({ ...documentBase, form_id: toObjectIdIfValid(formId) });
            } else {
              const transactionArchive = await getCollection('transactions');
              await transactionArchive.insertOne(documentBase);
            }
            
            res.json({ success: true, data: { authorization_url: parsedResponse.data.authorization_url, access_code: parsedResponse.data.access_code, reference: parsedResponse.data.reference } });
          } else {
            res.status(400).json({ success: false, message: parsedResponse.message || 'Payment initialization failed' });
          }
        } catch {
          res.status(500).json({ success: false, message: 'Payment service error' });
        }
      });
    });

    paystackCall.on('error', () => res.status(500).json({ success: false, message: 'Payment service unavailable' }));
    paystackCall.write(requestPayload);
    paystackCall.end();
  } catch {
    res.status(500).json({ success: false, message: 'Payment initialization failed' });
  }
};

const fulfillFormPurchase = async (transactionRecord, payloadMetadata) => {
  const mongoClient = await getClient();
  if (!mongoClient) return;

  const dbSession = mongoClient.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const formOwnershipCollection = await getCollection('user_forms');
      const inventoryCollection = await getCollection('form_inventory');
      const registeredUsersCollection = await getCollection('users');
      
      const existingAssignment = await formOwnershipCollection.findOne({ payment_id: transactionRecord._id }, { session: dbSession });
      if (existingAssignment) return;
      
      const targetUniversity = payloadMetadata?.universityName || 'University';
      const fetchedPin = await inventoryCollection.findOneAndUpdate(
        { university_name: targetUniversity, is_used: false },
        { $set: { is_used: true, assigned_to: transactionRecord.user_id, payment_id: transactionRecord._id } },
        { returnDocument: 'after', session: dbSession }
      );
      
      const assignedCredentials = fetchedPin?.value || fetchedPin;
      
      await formOwnershipCollection.insertOne({
        user_id: transactionRecord.user_id,
        form_id: transactionRecord.form_id,
        payment_id: transactionRecord._id,
        purchase_date: new Date(),
        university_name: targetUniversity,
        serial_key: assignedCredentials?.serial_key || null,
        pin: assignedCredentials?.pin || null,
        status: assignedCredentials?.serial_key ? 'fulfilled' : 'pending_pin'
      }, { session: dbSession });
      
      const matchedStudent = await registeredUsersCollection.findOne({ _id: transactionRecord.user_id }, { session: dbSession });
      if (matchedStudent?.email) {
        await sendPurchaseEmail(matchedStudent.email, targetUniversity, assignedCredentials?.serial_key || null, assignedCredentials?.pin || null);
      }

      if (!assignedCredentials?.serial_key) {
        await sendAdminAlertEmail(targetUniversity);
      }
    });
  } finally {
    await dbSession.endSession();
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { reference: paymentRef } = req.params;
    if (!paymentRef) return res.status(400).json({ success: false, message: 'Payment reference is required' });

    const verificationOptions = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${paymentRef}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    };

    const verificationCall = https.request(verificationOptions, (paystackResponse) => {
      let responseBody = '';
      paystackResponse.on('data', chunk => responseBody += chunk);
      paystackResponse.on('end', async () => {
        try {
          const parsedData = JSON.parse(responseBody);
          if (parsedData.status && parsedData.data.status === 'success') {
            const verificationMetadata = parsedData.data.metadata || {};
            const paymentArchive = await getCollection('payments');
            const transactionArchive = await getCollection('transactions');
            const registeredUsersCollection = await getCollection('users');

            const matchedPayment = await paymentArchive.findOne({ reference: paymentRef });

            if (matchedPayment) {
              await paymentArchive.updateOne(
                { reference: paymentRef },
                { $set: { status: 'success', verified_at: new Date(), paystack_verification: parsedData.data } }
              );
              if (matchedPayment.form_id) await fulfillFormPurchase(matchedPayment, verificationMetadata);
            } else {
              await transactionArchive.updateOne(
                { reference: paymentRef },
                { $set: { status: 'success', verified_at: new Date(), paystack_verification: parsedData.data } }
              );
              const targetUserId = parsedData.data.metadata?.userId;
              if (targetUserId) {
                await registeredUsersCollection.updateOne(
                  { _id: new ObjectId(targetUserId) },
                  { $set: { is_premium: true, premium_activated_at: new Date(), premium_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }
                );
              }
            }
            res.json({ success: true, message: 'Payment verified successfully', data: { status: parsedData.data.status, amount: parsedData.data.amount / 100, currency: parsedData.data.currency, paid_at: parsedData.data.paid_at } });
          } else {
            const currentStatus = parsedData?.data?.status;
            const isFailed = currentStatus === 'failed';
            res.status(200).json({ success: !isFailed, message: isFailed ? 'Payment failed' : 'Payment still pending', data: { status: currentStatus || 'pending', amount: parsedData?.data?.amount ? parsedData.data.amount / 100 : undefined, currency: parsedData?.data?.currency, paid_at: parsedData?.data?.paid_at } });
          }
        } catch {
          res.status(500).json({ success: false, message: 'Payment verification error' });
        }
      });
    });

    verificationCall.on('error', () => res.status(500).json({ success: false, message: 'Payment verification service unavailable' }));
    verificationCall.end();
  } catch {
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const rawPayload = req.body;
    const webhookSignature = req.headers['x-paystack-signature'];
    if (!webhookSignature) return res.status(400).json({ success: false, message: 'Missing signature header' });

    const generatedHash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(Buffer.isBuffer(rawPayload) ? rawPayload : Buffer.from(JSON.stringify(rawPayload))).digest('hex');
    const incomingSigBuffer = Buffer.from(String(webhookSignature));
    const generatedHashBuffer = Buffer.from(generatedHash);
    
    if (incomingSigBuffer.length !== generatedHashBuffer.length || !crypto.timingSafeEqual(incomingSigBuffer, generatedHashBuffer)) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const payloadEvent = req.body;
    if (payloadEvent.event === 'charge.success') {
      const { reference, amount, metadata } = payloadEvent.data;
      const paymentArchive = await getCollection('payments');
      const transactionArchive = await getCollection('transactions');
      const formOwnershipCollection = await getCollection('user_forms');
      const registeredUsersCollection = await getCollection('users');

      const matchedPayment = await paymentArchive.findOne({ reference });
      if (matchedPayment) {
        await paymentArchive.updateOne({ reference }, { $set: { status: 'success', webhook_received_at: new Date(), webhook_data: payloadEvent.data } });
        if (matchedPayment.form_id && !(await formOwnershipCollection.findOne({ user_id: matchedPayment.user_id, form_id: matchedPayment.form_id }))) {
          await fulfillFormPurchase(matchedPayment, metadata);
          await createSystemNotification(matchedPayment.user_id.toString(), 'payment_success', { amount: (amount / 100).toFixed(2), transactionId: reference });
        }
      } else {
        await transactionArchive.updateOne({ reference }, { $set: { status: 'successful', webhook_received_at: new Date(), webhook_data: payloadEvent.data } });
        if (metadata?.userId) {
          await registeredUsersCollection.updateOne(
            { _id: new ObjectId(metadata.userId) },
            { $set: { is_premium: true, premium_activated_at: new Date(), premium_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }
          );
        }
      }
    }
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

export const getUserTransactions = async (req, res) => {
  try {
    const studentObjectId = new ObjectId(req.user.id);
    const [standardTransactions, formPayments] = await Promise.all([
      (await getCollection('transactions')).find({ user_id: studentObjectId }).sort({ created_at: -1 }).limit(50).toArray(),
      (await getCollection('payments')).find({ user_id: studentObjectId }).sort({ created_at: -1 }).limit(50).toArray()
    ]);

    const standardizeStatus = (statusIndicator) => ['success', 'successful'].includes(statusIndicator) ? 'success' : (statusIndicator === 'failed' ? 'failed' : 'pending');

    const mappedTransactions = standardTransactions.map(tx => ({ ...tx, status: standardizeStatus(tx.status) }));
    const mappedPayments = formPayments.map(pay => ({
      ...pay,
      type: 'Form Purchase',
      amount_paid: pay.amount_paid ?? (typeof pay.amount === 'number' ? pay.amount / 100 : pay.amount),
      status: standardizeStatus(pay.status),
      university_name: pay.metadata?.universityName || pay.university_name,
      form_name: pay.metadata?.formName || pay.form_name,
      paid_at: pay.paid_at || pay.verified_at || pay.updated_at
    }));

    const consolidatedHistory = [...mappedTransactions, ...mappedPayments]
      .sort((a, b) => new Date(b.created_at || b.paid_at || b.updated_at || 0) - new Date(a.created_at || a.paid_at || a.updated_at || 0))
      .slice(0, 100);

    res.json({ success: true, data: consolidatedHistory });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};
