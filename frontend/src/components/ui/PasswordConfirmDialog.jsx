/**
 * Reusable password-confirmation dialog.
 * `onConfirm` is an async function that receives the entered password.
 * The dialog stays open (showing an inline error) if `onConfirm` throws,
 * and closes automatically on success.
 *
 * Hook usage (recommended):
 *   const { confirmWithAction, DialogComponent } = usePasswordConfirmDialog();
 *   // in JSX: {DialogComponent}
 *   // in handler:
 *   confirmWithAction(
 *     { title: '...', description: '...' },
 *     async (password) => { await api.doSomething(password); }
 *   );
 */

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './Button';
import { IconLock, IconX } from '@tabler/icons-react';

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

export function PasswordConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  description = 'Enter your current password to continue.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setLoading(false);
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your current password');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err?.response?.data?.message || 'Incorrect password');
      setPassword('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) onClose();
  };

  return (
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
          onKeyDown={(e) => e.key === 'Escape' && !loading && onClose()}
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
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <IconLock className="w-6 h-6 text-amber-600" />
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
                disabled={loading}
              >
                <IconX className="w-5 h-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter your current password"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                  error
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-amber-500 focus:border-amber-500'
                }`}
                disabled={loading}
                autoComplete="current-password"
              />
              {error && (
                <p className="mt-1.5 text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" type="button" onClick={handleClose} disabled={loading}>
                  {cancelText}
                </Button>
                <Button type="submit" loading={loading} disabled={!password || loading}>
                  {confirmText}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function usePasswordConfirmDialog() {
  const [state, setState] = useState({ isOpen: false, config: {} });
  const actionRef = useRef(null);

  const confirmWithAction = (config, action) => {
    actionRef.current = action;
    setState({ isOpen: true, config });
  };

  const handleConfirm = async (password) => {
    await actionRef.current(password);
    setState({ isOpen: false, config: {} });
  };

  const handleClose = () => setState({ isOpen: false, config: {} });

  const DialogComponent = (
    <PasswordConfirmDialog
      isOpen={state.isOpen}
      onClose={handleClose}
      onConfirm={handleConfirm}
      {...state.config}
    />
  );

  return { confirmWithAction, DialogComponent };
}

export default PasswordConfirmDialog;
