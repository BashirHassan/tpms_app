/**
 * Payment Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles student payments for teaching practice (Paystack integration)
 */

const { z } = require('zod');
const crypto = require('crypto');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError, AuthorizationError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      student_id: z.number().int().positive('Student ID is required'),
      amount: z.number().positive('Amount is required'),
      currency: z.enum(['NGN', 'USD']).default('NGN'),
      payment_type: z.enum(['full', 'partial']).default('full'),
      metadata: z.record(z.any()).optional(),
    }),
  }),

  processPayment: z.object({
    body: z.object({
      payment_id: z.number().int().positive('Payment ID is required'),
      paystack_reference: z.string().min(1, 'Paystack reference is required'),
      authorization_code: z.string().optional(),
      channel: z.string().optional(),
      card_type: z.string().optional(),
      bank: z.string().optional(),
    }),
  }),

  verifyPaystack: z.object({
    body: z.object({
      reference: z.string().min(1, 'Reference is required'),
    }),
  }),
};

/**
 * Generate unique payment reference
 */
const generateReference = (institutionId, studentId) => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `TP-${institutionId}-${studentId}-${timestamp}-${random}`.toUpperCase();
};

/**
 * Get all payments
 * GET /:institutionId/payments
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      session_id, student_id, status, payment_type,
      start_date, end_date, search,
      limit = 50, page = 1, offset 
    } = req.query;

    let sql = `
      SELECT sp.*,
             st.registration_number, st.full_name as student_name,
             sess.name as session_name,
             p.name as program_name
      FROM student_payments sp
      LEFT JOIN students st ON sp.student_id = st.id
      LEFT JOIN academic_sessions sess ON sp.session_id = sess.id
      LEFT JOIN programs p ON st.program_id = p.id
      WHERE sp.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND sp.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (student_id) {
      sql += ' AND sp.student_id = ?';
      params.push(parseInt(student_id));
    }
    if (status) {
      sql += ' AND sp.status = ?';
      params.push(status);
    }
    if (payment_type) {
      sql += ' AND sp.payment_type = ?';
      params.push(payment_type);
    }
    if (start_date) {
      sql += ' AND sp.created_at >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND sp.created_at <= ?';
      params.push(end_date + ' 23:59:59');
    }
    // Search by student name, registration number, or payment reference
    if (search) {
      sql += ' AND (st.full_name LIKE ? OR st.registration_number LIKE ? OR sp.reference LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Calculate offset from page if not provided directly
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const offsetNum = offset !== undefined ? parseInt(offset) : (pageNum - 1) * limitNum;

    // Add ordering and pagination
    sql += ' ORDER BY sp.created_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    const payments = await query(sql, params);

    // Parse metadata JSON
    payments.forEach(payment => {
      if (payment.metadata && typeof payment.metadata === 'string') {
        try {
          payment.metadata = JSON.parse(payment.metadata);
        } catch (e) {
          payment.metadata = {};
        }
      }
    });

    res.json({
      success: true,
      data: payments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        offset: offsetNum,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment by ID
 * GET /:institutionId/payments/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const payments = await query(
      `SELECT sp.*,
              st.registration_number, st.full_name as student_name, st.gender,
              sess.name as session_name,
              p.name as program_name, p.code as program_code
       FROM student_payments sp
       LEFT JOIN students st ON sp.student_id = st.id
       LEFT JOIN academic_sessions sess ON sp.session_id = sess.id
       LEFT JOIN programs p ON st.program_id = p.id
       WHERE sp.id = ? AND sp.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (payments.length === 0) {
      throw new NotFoundError('Payment not found');
    }

    const payment = payments[0];

    // Parse metadata JSON
    if (payment.metadata && typeof payment.metadata === 'string') {
      try {
        payment.metadata = JSON.parse(payment.metadata);
      } catch (e) {
        payment.metadata = {};
      }
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create payment (initialize)
 * POST /:institutionId/payments
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, student_id, amount, currency, payment_type, metadata } = req.body;

    // Verify student belongs to institution
    const students = await query(
      'SELECT id, full_name, registration_number FROM students WHERE id = ? AND institution_id = ?',
      [student_id, parseInt(institutionId)]
    );
    if (students.length === 0) {
      throw new ValidationError('Invalid student ID');
    }

    const student = students[0];

    // Verify session belongs to institution
    const sessions = await query(
      'SELECT id, name FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );
    if (sessions.length === 0) {
      throw new ValidationError('Invalid session ID');
    }

    // Check for pending payment
    const pendingPayment = await query(
      `SELECT id FROM student_payments 
       WHERE student_id = ? AND session_id = ? AND institution_id = ? AND status = 'pending'`,
      [student_id, session_id, parseInt(institutionId)]
    );
    if (pendingPayment.length > 0) {
      throw new ConflictError('Student has a pending payment. Complete or cancel it first.');
    }

    // Check if already paid for this session
    const existingPayment = await query(
      `SELECT id FROM student_payments 
       WHERE student_id = ? AND session_id = ? AND institution_id = ? 
         AND status = 'success' AND payment_type = 'full'`,
      [student_id, session_id, parseInt(institutionId)]
    );
    if (existingPayment.length > 0) {
      throw new ConflictError('Student has already made full payment for this session');
    }

    // Generate reference
    const reference = generateReference(parseInt(institutionId), student_id);

    const result = await query(
      `INSERT INTO student_payments 
       (institution_id, session_id, student_id, amount, currency, payment_type, reference, status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        parseInt(institutionId), session_id, student_id, amount,
        currency || 'NGN', payment_type || 'full', reference,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Payment initialized successfully',
      data: {
        id: result.insertId,
        reference,
        amount,
        currency: currency || 'NGN',
        student_name: student.full_name,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Process payment (after Paystack callback)
 * POST /:institutionId/payments/process
 */
const processPayment = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { payment_id, paystack_reference, authorization_code, channel, card_type, bank } = req.body;

    // Get payment
    const payments = await query(
      `SELECT sp.*, st.full_name as student_name, st.registration_number
       FROM student_payments sp
       JOIN students st ON sp.student_id = st.id
       WHERE sp.id = ? AND sp.institution_id = ?`,
      [payment_id, parseInt(institutionId)]
    );

    if (payments.length === 0) {
      throw new NotFoundError('Payment not found');
    }

    const payment = payments[0];

    if (payment.status === 'success') {
      throw new ConflictError('Payment has already been processed');
    }

    // Update payment
    await query(
      `UPDATE student_payments 
       SET paystack_reference = ?, authorization_code = ?, channel = ?, 
           card_type = ?, bank = ?, status = 'success', verified_at = NOW(), updated_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [paystack_reference, authorization_code || null, channel || null, 
       card_type || null, bank || null, payment_id, parseInt(institutionId)]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'student', 'payment_completed', 'student_payment', ?, ?, ?)`,
      [parseInt(institutionId), payment.student_id, payment_id, 
       JSON.stringify({ 
         student_name: payment.student_name, 
         amount: payment.amount,
         reference: payment.reference,
       }), req.ip]
    );

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment_id,
        reference: payment.reference,
        status: 'success',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify Paystack payment (Admin)
 * POST /:institutionId/payments/verify-paystack
 * 
 * Verifies a payment with Paystack and updates/creates the payment record.
 * Handles two scenarios:
 * 1. Pending payment in database - updates status to success
 * 2. No record in database - creates new success record (for missed callbacks)
 */
const verifyPaystack = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { reference } = req.body;

    if (!reference) {
      throw new ValidationError('Reference is required');
    }

    // Get institution's Paystack secret key (decrypted)
    const Institution = require('../models/Institution');
    const institution = await Institution.findById(parseInt(institutionId), true);

    const paystackSecretKey = institution?.paystack_secret_key || process.env.PAYSTACK_SECRET_KEY;

    if (!paystackSecretKey) {
      throw new ValidationError('Paystack not configured for this institution');
    }

    // Check for ANY existing payment with this reference (regardless of status)
    const existingPayments = await query(
      `SELECT sp.*, s.full_name as student_name FROM student_payments sp
       LEFT JOIN students s ON sp.student_id = s.id
       WHERE (sp.reference = ? OR sp.paystack_reference = ?) 
         AND sp.institution_id = ?`,
      [reference, reference, parseInt(institutionId)]
    );

    // If payment exists and is already successful, return early
    if (existingPayments.length > 0 && existingPayments[0].status === 'success') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        data: {
          payment_id: existingPayments[0].id,
          reference: existingPayments[0].reference,
          status: 'success',
          amount: existingPayments[0].amount,
          student_name: existingPayments[0].student_name,
        },
      });
    }

    // Verify with Paystack API
    const paystackService = require('../services/paystackService');
    const verification = await paystackService.verifyTransaction(
      paystackSecretKey,
      reference
    );

    if (!verification.success) {
      // Update existing payment as failed if it exists
      if (existingPayments.length > 0) {
        await query(
          `UPDATE student_payments SET status = 'failed', updated_at = NOW() WHERE id = ?`,
          [existingPayments[0].id]
        );
      }

      return res.json({
        success: false,
        message: verification.error || 'Payment verification failed with Paystack',
        data: { status: 'failed', reference },
      });
    }

    if (verification.data.status !== 'success') {
      // Update existing payment as failed if it exists
      if (existingPayments.length > 0) {
        await query(
          `UPDATE student_payments SET status = 'failed', updated_at = NOW() WHERE id = ?`,
          [existingPayments[0].id]
        );
      }

      return res.json({
        success: false,
        message: `Payment not successful. Status: ${verification.data.status}`,
        data: { 
          status: 'failed', 
          reference,
          paystack_status: verification.data.status,
        },
      });
    }

    const paystackData = verification.data;
    const amountInNaira = paystackData.amount / 100;

    // If existing payment record exists, update it (unless already successful)
    if (existingPayments.length > 0) {
      const payment = existingPayments[0];
      
      // If already verified successfully, skip database update
      if (payment.status === 'success') {
        return res.json({
          success: true,
          message: 'Payment already verified',
          data: {
            payment_id: payment.id,
            reference: payment.reference,
            status: 'success',
            amount: payment.amount,
            currency: payment.currency,
            student_name: payment.student_name,
            already_verified: true,
          },
        });
      }
      
      // Verify amount matches (with tolerance for floating point)
      if (Math.abs(amountInNaira - parseFloat(payment.amount)) > 0.01) {
        throw new ValidationError(`Amount mismatch. Expected ₦${payment.amount}, got ₦${amountInNaira}`);
      }

      // Extract authorization details (may be null for some payment channels like bank_transfer)
      const authCode = paystackData.authorization?.authorization_code || null;
      const cardType = paystackData.authorization?.card_type || null;
      const bankName = paystackData.authorization?.bank || paystackData.authorization?.bank_name || null;
      const channel = paystackData.channel || null;
      
      // Prepare metadata to store
      const storedMetadata = JSON.stringify({
        ...paystackData.metadata,
        gateway_response: paystackData.gatewayResponse,
        paid_at: paystackData.paidAt,
        customer_email: paystackData.customer?.email,
        verified_by_admin: req.user?.email,
        authorization_details: paystackData.authorization ? {
          card_type: cardType,
          last4: paystackData.authorization.last4,
          exp_month: paystackData.authorization.exp_month,
          exp_year: paystackData.authorization.exp_year,
          brand: paystackData.authorization.brand,
          bank: bankName,
          country_code: paystackData.authorization.country_code,
          account_name: paystackData.authorization.account_name,
        } : null,
      });

      await query(
        `UPDATE student_payments 
         SET paystack_reference = ?, authorization_code = ?, channel = ?, 
             card_type = ?, bank = ?, status = 'success', verified_at = NOW(), updated_at = NOW(),
             ip_address = COALESCE(ip_address, ?), user_agent = COALESCE(user_agent, ?), metadata = ?
         WHERE id = ?`,
        [
          paystackData.reference,
          authCode,
          channel,
          cardType,
          bankName,
          req.ip || req.headers['x-forwarded-for'] || null,
          req.headers['user-agent'] || null,
          storedMetadata,
          payment.id
        ]
      );

      // Audit log
      await query(
        `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
         VALUES (?, ?, 'staff', 'admin_payment_verified', 'student_payment', ?, ?, ?)`,
        [parseInt(institutionId), req.user?.id || null, payment.id,
         JSON.stringify({ reference, amount: amountInNaira, previous_status: payment.status, verified_by: req.user?.email }), req.ip]
      );

      return res.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          payment_id: payment.id,
          reference: payment.reference,
          status: 'success',
          amount: payment.amount,
          currency: payment.currency,
          student_name: payment.student_name,
        },
      });
    }

    // No existing record - create a new one from Paystack metadata
    const metadata = paystackData.metadata || {};
    const studentId = metadata.student_id;
    const sessionId = metadata.session_id;

    if (!studentId || !sessionId) {
      throw new ValidationError('Payment metadata is incomplete. Cannot determine student or session.');
    }

    // Verify student belongs to institution
    const [student] = await query(
      'SELECT id, full_name, registration_number FROM students WHERE id = ? AND institution_id = ?',
      [studentId, parseInt(institutionId)]
    );

    if (!student) {
      throw new ValidationError('Student from payment metadata not found in this institution');
    }

    // Verify session belongs to institution
    const [session] = await query(
      'SELECT id, name FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [sessionId, parseInt(institutionId)]
    );

    if (!session) {
      throw new ValidationError('Session from payment metadata not found in this institution');
    }

    // Check for existing successful payment with this reference
    const [existingSuccess] = await query(
      `SELECT id FROM student_payments 
       WHERE student_id = ? AND session_id = ? AND institution_id = ? AND status = 'success'`,
      [studentId, sessionId, parseInt(institutionId)]
    );

    if (existingSuccess) {
      return res.json({
        success: true,
        message: 'Student already has a successful payment for this session',
        data: { 
          payment_id: existingSuccess.id, 
          status: 'already_paid',
          student_name: student.full_name,
        },
      });
    }

    // Extract authorization details (may be null for some payment channels like bank_transfer)
    const authCode = paystackData.authorization?.authorization_code || null;
    const cardType = paystackData.authorization?.card_type || null;
    const bankName = paystackData.authorization?.bank || paystackData.authorization?.bank_name || null;
    const channel = paystackData.channel || null;
    
    // Prepare metadata to store
    const storedMetadata = JSON.stringify({
      ...metadata,
      gateway_response: paystackData.gatewayResponse,
      paid_at: paystackData.paidAt,
      customer_email: paystackData.customer?.email,
      recovered_by_admin: req.user?.email,
      authorization_details: paystackData.authorization ? {
        card_type: cardType,
        last4: paystackData.authorization.last4,
        exp_month: paystackData.authorization.exp_month,
        exp_year: paystackData.authorization.exp_year,
        brand: paystackData.authorization.brand,
        bank: bankName,
        country_code: paystackData.authorization.country_code,
        account_name: paystackData.authorization.account_name,
      } : null,
    });

    // Create new payment record
    const result = await query(
      `INSERT INTO student_payments 
       (institution_id, session_id, student_id, amount, currency, reference, 
        paystack_reference, authorization_code, channel, card_type, bank, status, verified_at,
        ip_address, user_agent, metadata)
       VALUES (?, ?, ?, ?, 'NGN', ?, ?, ?, ?, ?, ?, 'success', NOW(), ?, ?, ?)`,
      [
        parseInt(institutionId),
        sessionId,
        studentId,
        amountInNaira,
        reference,
        paystackData.reference,
        authCode,
        channel,
        cardType,
        bankName,
        req.ip || req.headers['x-forwarded-for'] || null,
        req.headers['user-agent'] || null,
        storedMetadata,
      ]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'admin_payment_recovered', 'student_payment', ?, ?, ?)`,
      [parseInt(institutionId), req.user?.id || null, result.insertId,
       JSON.stringify({ 
         reference, 
         amount: amountInNaira, 
         student_name: student.full_name,
         verified_by: req.user?.email,
         note: 'Payment record created from Paystack verification (missed callback recovery)'
       }), req.ip]
    );

    res.json({
      success: true,
      message: `Payment recovered and verified for ${student.full_name}`,
      data: {
        payment_id: result.insertId,
        reference,
        status: 'success',
        amount: amountInNaira,
        currency: 'NGN',
        student_name: student.full_name,
        session_name: session.name,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment statistics
 * GET /:institutionId/payments/stats
 */
const getStats = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, status, search } = req.query;

    let extraFilter = '';
    const params = [parseInt(institutionId)];
    
    if (session_id) {
      extraFilter += ' AND sp.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (status) {
      extraFilter += ' AND sp.status = ?';
      params.push(status);
    }
    if (search) {
      extraFilter += ' AND (st.full_name LIKE ? OR st.registration_number LIKE ? OR sp.reference LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Overall statistics (with search/status filter applied)
    const [stats] = await query(
      `SELECT 
         COUNT(*) as total_payments,
         SUM(CASE WHEN sp.status = 'success' THEN 1 ELSE 0 END) as successful_payments,
         SUM(CASE WHEN sp.status = 'pending' THEN 1 ELSE 0 END) as pending_payments,
         SUM(CASE WHEN sp.status = 'failed' THEN 1 ELSE 0 END) as failed_payments,
         SUM(CASE WHEN sp.status = 'success' THEN sp.amount ELSE 0 END) as total_collected,
         SUM(CASE WHEN sp.status = 'pending' THEN sp.amount ELSE 0 END) as pending_amount,
         COUNT(DISTINCT CASE WHEN sp.status = 'success' THEN sp.student_id END) as students_paid
       FROM student_payments sp
       LEFT JOIN students st ON sp.student_id = st.id
       WHERE sp.institution_id = ?${extraFilter}`,
      params
    );

    // Get total students and students not paid
    const studentParams = [parseInt(institutionId)];
    let studentSessionFilter = '';
    if (session_id) {
      studentSessionFilter = ' AND s.session_id = ?';
      studentParams.push(parseInt(session_id));
    }

    const [studentCounts] = await query(
      `SELECT 
         COUNT(*) as total_students,
         COUNT(*) - COUNT(DISTINCT sp.student_id) as students_not_paid
       FROM students s
       LEFT JOIN student_payments sp ON s.id = sp.student_id 
         AND sp.status = 'success' 
         AND sp.institution_id = s.institution_id
         ${session_id ? 'AND sp.session_id = s.session_id' : ''}
       WHERE s.institution_id = ?${studentSessionFilter}
         AND s.status = 'active'`,
      studentParams
    );

    // By payment type (use only session filter for aggregate stats)
    const byTypeParams = [parseInt(institutionId)];
    let byTypeFilter = '';
    if (session_id) {
      byTypeFilter = ' AND session_id = ?';
      byTypeParams.push(parseInt(session_id));
    }

    const byType = await query(
      `SELECT payment_type, 
              COUNT(*) as count,
              SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as amount
       FROM student_payments
       WHERE institution_id = ?${byTypeFilter}
       GROUP BY payment_type`,
      byTypeParams
    );

    // Daily trend (last 30 days)
    const dailyTrend = await query(
      `SELECT DATE(created_at) as date,
              COUNT(*) as count,
              SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as amount
       FROM student_payments
       WHERE institution_id = ?${byTypeFilter}
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date`,
      byTypeParams
    );

    res.json({
      success: true,
      data: {
        summary: {
          total_payments: stats.total_payments || 0,
          successful_payments: stats.successful_payments || 0,
          pending_payments: stats.pending_payments || 0,
          failed_payments: stats.failed_payments || 0,
          total_collected: parseFloat(stats.total_collected) || 0,
          pending_amount: parseFloat(stats.pending_amount) || 0,
          students_paid: stats.students_paid || 0,
          total_students: studentCounts.total_students || 0,
          students_not_paid: studentCounts.students_not_paid || 0,
        },
        by_type: byType,
        daily_trend: dailyTrend,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel pending payment
 * POST /:institutionId/payments/:id/cancel
 */
const cancelPayment = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const payments = await query(
      'SELECT * FROM student_payments WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (payments.length === 0) {
      throw new NotFoundError('Payment not found');
    }

    if (payments[0].status !== 'pending') {
      throw new ValidationError('Only pending payments can be cancelled');
    }

    await query(
      `UPDATE student_payments SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Payment cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Paystack webhook handler
 * POST /:institutionId/payments/webhook
 */
const handleWebhook = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const signature = req.headers['x-paystack-signature'];
    
    // Get institution's Paystack secret key (decrypted)
    const Institution = require('../models/Institution');
    const institution = await Institution.findById(parseInt(institutionId), true);

    const paystackSecretKey = institution?.paystack_secret_key || process.env.PAYSTACK_SECRET_KEY;

    if (!paystackSecretKey) {
      throw new ValidationError('Paystack not configured');
    }

    // Verify signature
    const hash = crypto.createHmac('sha512', paystackSecretKey)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== signature) {
      throw new ValidationError('Invalid webhook signature');
    }

    const { event, data } = req.body;

    if (event === 'charge.success') {
      // Find payment record
      const payments = await query(
        `SELECT id, status FROM student_payments 
         WHERE (reference = ? OR paystack_reference = ?) AND institution_id = ?`,
        [data.reference, data.reference, parseInt(institutionId)]
      );

      if (payments.length > 0) {
        // Skip if already verified
        if (payments[0].status === 'success') {
          console.log(`[WEBHOOK] Payment ${data.reference} already verified, skipping update`);
          return res.json({ success: true });
        }

        // Extract authorization details
        const authCode = data.authorization?.authorization_code || null;
        const cardType = data.authorization?.card_type || null;
        const bankName = data.authorization?.bank || data.authorization?.bank_name || null;
        const channel = data.channel || null;
        
        // Prepare metadata to store
        const storedMetadata = JSON.stringify({
          ...data.metadata,
          gateway_response: data.gateway_response,
          paid_at: data.paid_at,
          customer_email: data.customer?.email,
          webhook_received: true,
          authorization_details: data.authorization ? {
            card_type: cardType,
            last4: data.authorization.last4,
            exp_month: data.authorization.exp_month,
            exp_year: data.authorization.exp_year,
            brand: data.authorization.brand,
            bank: bankName,
            country_code: data.authorization.country_code,
            account_name: data.authorization.account_name,
          } : null,
        });

        await query(
          `UPDATE student_payments 
           SET paystack_reference = ?, authorization_code = ?, channel = ?, 
               card_type = ?, bank = ?, status = 'success', verified_at = NOW(), updated_at = NOW(),
               metadata = ?
           WHERE id = ?`,
          [
            data.reference,
            authCode,
            channel,
            cardType,
            bankName,
            storedMetadata,
            payments[0].id
          ]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    // Log error but return 200 to Paystack
    console.error('Webhook error:', error);
    res.json({ success: true });
  }
};

// ============================================================================
// STUDENT PORTAL METHODS
// ============================================================================

/**
 * Get student's payment status
 * GET /portal/payments/status
 */
const getStudentPaymentStatus = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;
    const { session_id } = req.query;

    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    // Get session
    let session;
    if (session_id) {
      [session] = await query(
        'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
        [parseInt(session_id), parseInt(institutionId)]
      );
    } else {
      [session] = await query(
        'SELECT * FROM academic_sessions WHERE institution_id = ? AND is_current = 1',
        [parseInt(institutionId)]
      );
    }

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Get student info
    const [student] = await query(
      'SELECT program_id FROM students WHERE id = ? AND institution_id = ?',
      [parseInt(studentId), parseInt(institutionId)]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Check if payment is required
    const [institution] = await query(
      'SELECT payment_enabled, payment_type, payment_base_amount FROM institutions WHERE id = ?',
      [institutionId]
    );

    if (!institution.payment_enabled || institution.payment_type === 'per_session') {
      return res.json({
        success: true,
        data: {
          required: false,
          status: 'not_required',
          message: 'Payment is not required for students',
        },
      });
    }

    // Get payment amount from institution settings
    const amount = parseFloat(institution.payment_base_amount) || 0;

    // Get ALL payments for history display (not just successful ones)
    const allPayments = await query(
      `SELECT * FROM student_payments 
       WHERE student_id = ? AND session_id = ? AND institution_id = ?
       ORDER BY created_at DESC`,
      [parseInt(studentId), parseInt(session.id), parseInt(institutionId)]
    );

    // Calculate total from SUCCESSFUL payments only
    const successfulPayments = allPayments.filter(p => p.status === 'success');
    const totalPaid = successfulPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const remaining = Math.max(0, amount - totalPaid);

    let status = 'pending';
    if (totalPaid >= amount) {
      status = 'completed';
    } else if (totalPaid > 0) {
      status = 'partial';
    }

    res.json({
      success: true,
      data: {
        required: amount > 0,
        status,
        amount,
        paid: totalPaid,
        remaining,
        currency: 'NGN',
        payments: allPayments.map(p => ({
          id: p.id,
          reference: p.reference,
          amount: parseFloat(p.amount),
          status: p.status,
          created_at: p.created_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initialize payment (student portal)
 * POST /portal/payments/initialize
 */
const initializeStudentPayment = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;
    const { session_id } = req.body;

    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    // Get session
    let session;
    if (session_id) {
      [session] = await query(
        'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
        [parseInt(session_id), institutionId]
      );
    } else {
      [session] = await query(
        'SELECT * FROM academic_sessions WHERE institution_id = ? AND is_current = 1',
        [institutionId]
      );
    }

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Get student info
    const [student] = await query(
      'SELECT * FROM students WHERE id = ? AND institution_id = ?',
      [studentId, institutionId]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Get institution payment config (with decrypted sensitive fields like Paystack keys)
    const Institution = require('../models/Institution');
    const institution = await Institution.findById(institutionId, true);

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    if (!institution.payment_enabled) {
      throw new ValidationError('Payment is not enabled');
    }

    if (institution.payment_type === 'per_session') {
      throw new ValidationError('Payment is handled by institution');
    }

    // Get amount from institution settings
    // Check for program-specific pricing first, fallback to base amount
    let amount = parseFloat(institution.payment_base_amount) || 0;
    
    // If student has a program and program-specific pricing is configured, use that
    if (student.program_id && institution.payment_program_pricing) {
      const programPricing = institution.payment_program_pricing;
      const programAmount = parseFloat(programPricing[student.program_id]);
      if (programAmount > 0) {
        amount = programAmount;
        console.log(`[PAYMENT] Using program-specific pricing for program ${student.program_id}: ₦${amount}`);
      }
    }
    
    if (amount <= 0) {
      throw new ValidationError('No payment amount configured');
    }

    // Get existing payments
    const payments = await query(
      `SELECT SUM(amount) as total FROM student_payments 
       WHERE student_id = ? AND session_id = ? AND institution_id = ? AND status = 'success'`,
      [studentId, session.id, institutionId]
    );

    const totalPaid = parseFloat(payments[0]?.total || 0);
    const remaining = Math.max(0, amount - totalPaid);

    if (remaining <= 0) {
      throw new ValidationError('Payment already completed');
    }

    // Generate reference
    const reference = `TP${institution.code || institutionId}-${studentId}-${Date.now()}`;
    const email = `${student.registration_number}@student.digitaltp.ng`;

    // Use Paystack service - REQUIRED for payment initialization
    const paystackService = require('../services/paystackService');
    
    if (!institution.paystack_secret_key) {
      throw new ValidationError('Payment gateway not configured. Please contact administration.');
    }

    // Get program info for metadata
    const [program] = student.program_id ? await query(
      'SELECT name FROM programs WHERE id = ?',
      [student.program_id]
    ) : [null];

    // Initialize with Paystack - NO database record yet (only save on successful verification)
    // Include split_code if configured for this institution (revenue sharing with platform)
    const paystackResult = await paystackService.initializeTransaction({
      secretKey: institution.paystack_secret_key,
      email,
      amount: remaining * 100, // Convert to kobo
      reference,
      metadata: {
        student_id: studentId,
        session_id: session.id,
        institution_id: institutionId,
        // Rich metadata for transaction details
        student_name: student.full_name,
        registration_number: student.registration_number,
        program_name: program?.name || 'N/A',
        session_name: session.name,
        institution_name: institution.name,
        institution_code: institution.code,
      },
      splitCode: institution.paystack_split_code, // Institution-specific split configuration
    });

    if (!paystackResult.success) {
      console.error('Paystack initialization failed:', paystackResult.error);
      throw new ValidationError(paystackResult.error || 'Failed to initialize payment gateway');
    }

    res.json({
      success: true,
      data: {
        reference,
        amount: remaining,
        currency: 'NGN',
        paystack: {
          accessCode: paystackResult.data.access_code,
          authorizationUrl: paystackResult.data.authorization_url,
          reference: paystackResult.data.reference,
        },
        publicKey: institution.paystack_public_key,
        email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify student payment
 * POST /portal/payments/verify
 * 
 * This is the ONLY place where payment records are created.
 * Payments are only saved after successful Paystack verification (no pending records).
 */
const verifyStudentPayment = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;
    const { reference } = req.body;

    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    if (!reference) {
      throw new ValidationError('Reference is required');
    }

    // Check if already verified
    const [alreadyVerified] = await query(
      `SELECT * FROM student_payments 
       WHERE reference = ? AND student_id = ? AND institution_id = ? AND status = 'success'`,
      [reference, studentId, institutionId]
    );

    if (alreadyVerified) {
      return res.json({
        success: true,
        message: 'Payment already verified',
        data: { status: 'success', reference },
      });
    }

    // Verify with Paystack (get decrypted secret key)
    const Institution = require('../models/Institution');
    const institution = await Institution.findById(institutionId, true);

    if (!institution?.paystack_secret_key) {
      throw new ValidationError('Payment gateway not configured');
    }

    const paystackService = require('../services/paystackService');
    const verification = await paystackService.verifyTransaction(
      institution.paystack_secret_key,
      reference
    );

    if (!verification.success || verification.data.status !== 'success') {
      return res.json({
        success: false,
        message: 'Payment verification failed',
        data: { status: 'failed', reference },
      });
    }

    // Payment verified - extract session_id from metadata
    const paystackData = verification.data;
    const sessionId = paystackData.metadata?.session_id;

    if (!sessionId) {
      // Try to get current session as fallback
      const [currentSession] = await query(
        'SELECT id FROM academic_sessions WHERE institution_id = ? AND is_current = 1',
        [institutionId]
      );
      if (!currentSession) {
        throw new ValidationError('Unable to determine session for payment');
      }
      paystackData.metadata = { ...paystackData.metadata, session_id: currentSession.id };
    }

    // Create or update payment record (amount is in kobo, convert to naira)
    const amountInNaira = paystackData.amount / 100;

    // Check if payment record already exists (from initialization)
    const [existingPayment] = await query(
      'SELECT id, status FROM student_payments WHERE reference = ? AND institution_id = ?',
      [reference, institutionId]
    );

    // Extract authorization details (may be null for some payment channels like bank_transfer)
    const authCode = paystackData.authorization?.authorization_code || null;
    const cardType = paystackData.authorization?.card_type || null;
    const bankName = paystackData.authorization?.bank || paystackData.authorization?.bank_name || null;
    const channel = paystackData.channel || null;
    
    // Prepare metadata to store (includes original Paystack metadata + payment details)
    const storedMetadata = JSON.stringify({
      ...paystackData.metadata,
      gateway_response: paystackData.gatewayResponse,
      paid_at: paystackData.paidAt,
      customer_email: paystackData.customer?.email,
      authorization_details: paystackData.authorization ? {
        card_type: cardType,
        last4: paystackData.authorization.last4,
        exp_month: paystackData.authorization.exp_month,
        exp_year: paystackData.authorization.exp_year,
        brand: paystackData.authorization.brand,
        bank: bankName,
        country_code: paystackData.authorization.country_code,
        account_name: paystackData.authorization.account_name,
      } : null,
    });

    if (existingPayment) {
      // Update existing record
      await query(
        `UPDATE student_payments 
         SET status = 'success', 
             verified_at = NOW(),
             paystack_reference = ?,
             authorization_code = ?,
             channel = ?,
             card_type = ?,
             bank = ?,
             amount = ?,
             ip_address = ?,
             user_agent = ?,
             metadata = ?
         WHERE id = ?`,
        [
          paystackData.reference,
          authCode,
          channel,
          cardType,
          bankName,
          amountInNaira,
          req.ip || req.headers['x-forwarded-for'] || null,
          req.headers['user-agent'] || null,
          storedMetadata,
          existingPayment.id,
        ]
      );
    } else {
      // Insert new record
      await query(
        `INSERT INTO student_payments 
         (institution_id, session_id, student_id, amount, currency, reference, 
          paystack_reference, authorization_code, channel, card_type, bank, status, verified_at,
          ip_address, user_agent, metadata)
         VALUES (?, ?, ?, ?, 'NGN', ?, ?, ?, ?, ?, ?, 'success', NOW(), ?, ?, ?)`,
        [
          institutionId,
          paystackData.metadata.session_id,
          studentId,
          amountInNaira,
          reference,
          paystackData.reference,
          authCode,
          channel,
          cardType,
          bankName,
          req.ip || req.headers['x-forwarded-for'] || null,
          req.headers['user-agent'] || null,
          storedMetadata,
        ]
      );
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'student', 'payment_completed', 'student_payment', ?, ?, ?)`,
      [institutionId, studentId, reference, 
       JSON.stringify({ reference, amount: amountInNaira }), req.ip]
    );

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: { status: 'success', reference, amount: amountInNaira },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getAll,
  getById,
  create,
  processPayment,
  verifyPaystack,
  getStats,
  cancelPayment,
  handleWebhook,
  // Student portal methods
  getStudentPaymentStatus,
  initializeStudentPayment,
  verifyStudentPayment,
};
