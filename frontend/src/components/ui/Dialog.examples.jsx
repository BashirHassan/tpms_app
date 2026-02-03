/**
 * Dialog Component Examples
 * 
 * This file demonstrates various ways to use the reusable Dialog component
 * in the DigitalTP system.
 */

import { useState } from 'react';
import { 
  Dialog, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogBody,
  DialogFooter,
  useDialog 
} from '../components/ui/Dialog';
import { AlertProvider, useAlert, AlertDialog } from '../components/ui/AlertDialog';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

// ============================================================================
// EXAMPLE 1: Basic Dialog with Title and Footer
// ============================================================================
export function BasicDialogExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Basic Dialog</Button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Basic Dialog"
        description="This is a simple dialog with a title and description."
        width="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsOpen(false)}>
              Confirm
            </Button>
          </>
        }
      >
        <p>This is the dialog content. It can contain any React components.</p>
      </Dialog>
    </>
  );
}

// ============================================================================
// EXAMPLE 2: Dialog with Custom Width
// ============================================================================
export function CustomWidthDialogExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Wide Dialog</Button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Wide Dialog (2xl)"
        width="2xl" // Options: xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, full
        footer={
          <Button onClick={() => setIsOpen(false)}>Close</Button>
        }
      >
        <p>This dialog uses the 2xl width preset (672px max-width).</p>
        <p className="mt-4">Available width presets:</p>
        <ul className="list-disc list-inside mt-2 text-gray-600">
          <li>xs - 320px</li>
          <li>sm - 384px</li>
          <li>md - 448px (default)</li>
          <li>lg - 512px</li>
          <li>xl - 576px</li>
          <li>2xl - 672px</li>
          <li>3xl - 768px</li>
          <li>4xl - 896px</li>
          <li>5xl - 1024px</li>
          <li>full - full width</li>
        </ul>
      </Dialog>
    </>
  );
}

// ============================================================================
// EXAMPLE 3: Dialog with Scrollable Content
// ============================================================================
export function ScrollableDialogExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Scrollable Dialog</Button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Terms and Conditions"
        maxHeight="60vh" // Custom max height
        footer={
          <>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Decline
            </Button>
            <Button onClick={() => setIsOpen(false)}>
              Accept
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-gray-600">
          {/* Long content that will scroll */}
          {Array.from({ length: 20 }).map((_, i) => (
            <p key={i}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
              Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
          ))}
        </div>
      </Dialog>
    </>
  );
}

// ============================================================================
// EXAMPLE 4: Dialog with Disabled Outside Click
// ============================================================================
export function NoOutsideClickDialogExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Persistent Dialog</Button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Important Action Required"
        closeOnOutsideClick={false} // Clicking outside won't close
        closeOnEscape={false} // Pressing Escape won't close
        footer={
          <Button onClick={() => setIsOpen(false)}>
            I Understand
          </Button>
        }
      >
        <p className="text-red-600">
          This dialog requires explicit action. 
          Clicking outside or pressing Escape will not close it.
        </p>
      </Dialog>
    </>
  );
}

// ============================================================================
// EXAMPLE 5: Dialog with Custom Header (Slot Pattern)
// ============================================================================
export function CustomHeaderDialogExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Custom Header Dialog</Button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        showCloseButton={false}
        header={
          <DialogHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-white">Custom Header</DialogTitle>
                <DialogDescription className="text-blue-100">
                  This header is completely customized
                </DialogDescription>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                ✕
              </button>
            </div>
          </DialogHeader>
        }
        footer={
          <Button onClick={() => setIsOpen(false)}>Close</Button>
        }
      >
        <p>The header slot allows for complete customization of the header area.</p>
      </Dialog>
    </>
  );
}

// ============================================================================
// EXAMPLE 5b: Dialog with Custom Footer (Slot Pattern)
// ============================================================================
export function CustomFooterDialogExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Custom Footer Dialog</Button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Custom Footer Example"
        customFooter={
          <DialogFooter align="between" className="bg-gray-50">
            <p className="text-sm text-gray-500">Step 1 of 3</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Back
              </Button>
              <Button onClick={() => setIsOpen(false)}>
                Next Step
              </Button>
            </div>
          </DialogFooter>
        }
      >
        <p>The customFooter slot allows complete control over the footer area.</p>
        <p className="mt-4 text-gray-600">
          Use <code>customFooter</code> when you need:
        </p>
        <ul className="list-disc list-inside mt-2 text-gray-600">
          <li>Custom alignment (left-aligned text + right-aligned buttons)</li>
          <li>Wizard-style step indicators</li>
          <li>Custom background colors</li>
          <li>Complex layouts with multiple sections</li>
        </ul>
      </Dialog>
    </>
  );
}

// ============================================================================
// EXAMPLE 5c: Dialog Footer Alignment Options
// ============================================================================
export function FooterAlignmentExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [align, setAlign] = useState('end');

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Footer Alignment Demo</Button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Footer Alignment Options"
        customFooter={
          <DialogFooter align={align}>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsOpen(false)}>
              Confirm
            </Button>
          </DialogFooter>
        }
      >
        <div className="space-y-4">
          <p>Choose footer alignment:</p>
          <div className="flex gap-2 flex-wrap">
            {['start', 'center', 'end', 'between', 'around'].map((a) => (
              <Button
                key={a}
                variant={align === a ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAlign(a)}
              >
                {a}
              </Button>
            ))}
          </div>
        </div>
      </Dialog>
    </>
  );
}

// ============================================================================
// EXAMPLE 6: Using the useDialog Hook
// ============================================================================
export function UseDialogHookExample() {
  const dialog = useDialog();
  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleSubmit = () => {
    console.log('Form submitted:', dialog.data, formData);
    dialog.close();
  };

  return (
    <>
      <Button onClick={() => dialog.open({ userId: 123, action: 'edit' })}>
        Open with Hook
      </Button>
      
      <Dialog
        isOpen={dialog.isOpen}
        onClose={dialog.close}
        title={`Editing User #${dialog.data?.userId || ''}`}
        footer={
          <>
            <Button variant="outline" onClick={dialog.close}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </Dialog>
    </>
  );
}

// ============================================================================
// EXAMPLE 7: Using ConfirmDialog for Delete Actions
// ============================================================================
export function ConfirmDialogExample() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
    setShowConfirm(false);
    console.log('Item deleted!');
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setShowConfirm(true)}>
        Delete Item
      </Button>
      
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Item"
        message="Are you sure you want to delete this item? This action cannot be undone."
        confirmText="Delete"
        variant="danger" // danger, warning, info, success
        loading={loading}
        requireText="DELETE" // Optional: require user to type this text to confirm
      />
    </>
  );
}

// ============================================================================
// EXAMPLE 8: Using useAlert Hook (Replaces native alert/confirm)
// ============================================================================
export function AlertHookExample() {
  // Note: Your app must be wrapped with <AlertProvider>
  const { alert, confirm } = useAlert();

  const handleShowAlert = async () => {
    await alert({
      title: 'Success',
      message: 'Your changes have been saved.',
      variant: 'success', // info, success, warning, error
    });
    console.log('Alert closed');
  };

  const handleShowConfirm = async () => {
    const confirmed = await confirm({
      title: 'Delete Account',
      message: 'Are you sure you want to delete your account?',
      variant: 'danger',
      confirmText: 'Delete Account',
      cancelText: 'Keep Account',
    });
    
    if (confirmed) {
      console.log('User confirmed deletion');
    } else {
      console.log('User cancelled');
    }
  };

  return (
    <div className="flex gap-4">
      <Button onClick={handleShowAlert}>Show Alert</Button>
      <Button variant="destructive" onClick={handleShowConfirm}>
        Show Confirm
      </Button>
    </div>
  );
}

// ============================================================================
// EXAMPLE 9: Form Dialog with Validation
// ============================================================================
export function FormDialogExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', status: 'active' });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.code.trim()) newErrors.code = 'Code is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setIsOpen(false);
    console.log('Saved:', form);
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Form Dialog</Button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => !saving && setIsOpen(false)}
        title="Create New Item"
        closeOnOutsideClick={!saving}
        closeOnEscape={!saving}
        footer={
          <>
            <Button 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Input
              label="Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={errors.name}
            />
            {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
          </div>
          <div>
            <Input
              label="Code *"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              error={errors.code}
            />
            {errors.code && <p className="text-sm text-red-600 mt-1">{errors.code}</p>}
          </div>
        </div>
      </Dialog>
    </>
  );
}

export default function DialogExamplesPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Dialog Component Examples</h1>
      
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. Basic Dialog</h2>
        <BasicDialogExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">2. Custom Width</h2>
        <CustomWidthDialogExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. Scrollable Content</h2>
        <ScrollableDialogExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">4. Disabled Outside Click</h2>
        <NoOutsideClickDialogExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">5. Custom Header</h2>
        <CustomHeaderDialogExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">5b. Custom Footer</h2>
        <CustomFooterDialogExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">5c. Footer Alignment</h2>
        <FooterAlignmentExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">6. useDialog Hook</h2>
        <UseDialogHookExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">7. Confirm Dialog</h2>
        <ConfirmDialogExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">8. Alert Hook (useAlert)</h2>
        <AlertHookExample />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">9. Form Dialog</h2>
        <FormDialogExample />
      </section>
    </div>
  );
}
