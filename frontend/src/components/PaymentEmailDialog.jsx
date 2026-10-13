/**
 * Confirmation dialog shown before a student's payment is initialized.
 * Lets the student optionally enter an email to receive the Paystack
 * transaction receipt. If left blank, `onConfirm(undefined)` is called and
 * the backend falls back to its generated placeholder email.
 *
 * Usage:
 *   <PaymentEmailDialog
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     onConfirm={(email) => { setOpen(false); handlePayment(email); }}
 *   />
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './ui/Button';
import { IconMail, IconX } from '@tabler/icons-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};
const panelVariants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0,  scale: 1    },
  exit:    { opacity: 0, y: 12, scale: 0.98 },
};
const modalTransition = { duration: 0.2, ease: 'easeOut' };

export function PaymentEmailDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Get a Payment Receipt',
  description = 'Enter an email to receive your payment receipt, or continue without one.',
  confirmText = 'Proceed to Pay',
  cancelText = 'Cancel',
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = email.trim();

    if (!trimmed) {
      onConfirm(undefined);
      return;
    }

    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Invalid email address');
      return;
    }

    onConfirm(trimmed);
  };

  const handleClose = () => onClose();

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={modalTransition}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={handleClose}
          onKeyDown={handleKeyDown}
        >
          <motion.div
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={modalTransition}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <IconMail className="w-6 h-6 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-600 mt-1">{description}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <IconX className="w-5 h-5" />
              </Button>
            </div>

            {/* Email input */}
            <form onSubmit={handleSubmit} className="mt-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address (optional)
              </label>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                  error
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                }`}
                autoComplete="email"
              />
              {error && (
                <p className="mt-1.5 text-sm text-red-600">{error}</p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" type="button" onClick={handleClose}>
                  {cancelText}
                </Button>
                <Button type="submit">
                  {confirmText}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default PaymentEmailDialog;
