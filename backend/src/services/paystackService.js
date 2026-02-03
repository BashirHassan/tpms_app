/**
 * Paystack Service
 * Handles Paystack API integration
 * Uses Node's built-in https module (no axios dependency)
 */

const https = require('https');
const crypto = require('crypto');

class PaystackService {
  constructor() {
    this.baseUrl = 'api.paystack.co';
  }

  /**
   * Generate unique payment reference
   * @param {string} prefix - Reference prefix (e.g., 'DTP')
   * @returns {string}
   */
  generateReference(prefix = 'DTP') {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Make HTTPS request to Paystack API
   * @param {Object} options
   * @param {string} options.method - HTTP method
   * @param {string} options.path - API path
   * @param {string} options.secretKey - Paystack secret key
   * @param {Object} options.data - Request body (for POST)
   * @returns {Promise<Object>}
   */
  makeRequest({ method, path, secretKey, data = null }) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path,
        method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Invalid response from Paystack'));
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Initialize a payment transaction
   * Returns access_code for frontend popup and authorization_url for redirect
   * 
   * @param {Object} options
   * @param {string} options.secretKey - Paystack secret key
   * @param {string} options.email - Customer email
   * @param {number} options.amount - Amount in kobo (NGN * 100)
   * @param {string} options.reference - Unique transaction reference
   * @param {string} options.callbackUrl - URL to redirect after payment (optional)
   * @param {Object} options.metadata - Additional metadata
   * @param {string} options.splitCode - Optional Paystack split code for payment splitting
   */
  async initializeTransaction(options) {
    const { secretKey, email, amount, reference, callbackUrl, metadata = {}, splitCode } = options;

    try {
      const payload = {
        email,
        amount, // Amount in kobo
        reference,
        metadata,
        channels: ['card', 'bank', 'ussd', 'mobile_money', 'bank_transfer'],
      };

      if (callbackUrl) {
        payload.callback_url = callbackUrl;
      }

      // Add split code if provided
      if (splitCode && splitCode.trim()) {
        payload.split_code = splitCode.trim();
      }

      const response = await this.makeRequest({
        method: 'POST',
        path: '/transaction/initialize',
        secretKey,
        data: payload,
      });

      if (!response.status) {
        return {
          success: false,
          error: response.message || 'Failed to initialize transaction',
        };
      }

      return {
        success: true,
        data: {
          authorization_url: response.data.authorization_url,
          access_code: response.data.access_code,
          reference: response.data.reference,
        },
      };
    } catch (error) {
      console.error('Paystack initialization error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify a transaction
   * @param {string} secretKey - Paystack secret key
   * @param {string} reference - Transaction reference
   */
  async verifyTransaction(secretKey, reference) {
    try {
      const response = await this.makeRequest({
        method: 'GET',
        path: `/transaction/verify/${encodeURIComponent(reference)}`,
        secretKey,
      });

      if (!response.status) {
        return {
          success: false,
          error: response.message || 'Verification failed',
        };
      }

      const data = response.data;

      return {
        success: true,
        data: {
          status: data.status,
          reference: data.reference,
          amount: data.amount, // In kobo
          amountNGN: data.amount / 100,
          currency: data.currency,
          channel: data.channel,
          paidAt: data.paid_at,
          customer: data.customer,
          authorization: data.authorization,
          metadata: data.metadata,
          gatewayResponse: data.gateway_response,
        },
      };
    } catch (error) {
      console.error('Paystack verification error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify webhook signature
   * @param {Object} body - Request body
   * @param {string} signature - x-paystack-signature header
   * @param {string} secretKey - Paystack secret key
   * @returns {boolean}
   */
  verifyWebhookSignature(body, signature, secretKey) {
    const hash = crypto
      .createHmac('sha512', secretKey)
      .update(JSON.stringify(body))
      .digest('hex');

    return hash === signature;
  }
}

// Export singleton instance
module.exports = new PaystackService();
