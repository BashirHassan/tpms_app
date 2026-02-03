import { useCallback, useRef } from 'react';
import PaystackPop from '@paystack/inline-js';

/**
 * Custom hook for Paystack Inline (Popup) Payment
 * Following JEI pattern - uses access_code for resuming transactions
 * 
 * IMPORTANT: Never trust frontend success callbacks alone. Always verify on the backend.
 */
const usePaystackInline = () => {
  const popupRef = useRef(null);

  /**
   * Resume a transaction using access_code from backend initialization
   * @param {Object} options - Payment options
   * @param {string} options.accessCode - Access code from backend initialization
   * @param {Function} options.onSuccess - Callback when payment popup closes (NOT trusted for verification)
   * @param {Function} options.onCancel - Callback when user cancels payment
   * @param {Function} options.onError - Callback when an error occurs
   * @returns {Promise<void>}
   */
  const resumeTransaction = useCallback(async ({
    accessCode,
    onSuccess,
    onCancel,
    onError,
  }) => {
    if (!accessCode) {
      onError?.(new Error('Access code is required'));
      return;
    }

    try {
      const popup = new PaystackPop();
      popupRef.current = popup;

      // Paystack inline-js v2 resumeTransaction signature:
      // resumeTransaction(accessCode: string, callbacks: { onSuccess, onCancel, onError, onLoad })
      const callbacks = {
        onSuccess: (response) => {
          // IMPORTANT: This callback only indicates the popup closed after payment
          // The actual payment success must be verified on the backend
          console.log('Paystack popup success callback:', response);
          onSuccess?.(response);
        },
        onCancel: () => {
          console.log('Paystack popup cancelled by user');
          onCancel?.();
        },
        onError: (error) => {
          console.error('Paystack popup error:', error);
          onError?.(error);
        },
        onLoad: (response) => {
          console.log('Paystack popup loaded:', response);
        },
      };

      // Call resumeTransaction with correct signature (accessCode, callbacks)
      popup.resumeTransaction(accessCode, callbacks);
    } catch (error) {
      console.error('Failed to open Paystack popup:', error);
      onError?.(error);
    }
  }, []);

  /**
   * Cancel/close the current popup (if open)
   */
  const cancelPayment = useCallback(() => {
    if (popupRef.current) {
      try {
        popupRef.current = null;
      } catch (error) {
        console.error('Error cancelling payment:', error);
      }
    }
  }, []);

  return {
    resumeTransaction,
    cancelPayment,
  };
};

export default usePaystackInline;
