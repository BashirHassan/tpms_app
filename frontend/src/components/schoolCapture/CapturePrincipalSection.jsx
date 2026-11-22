/**
 * Principal half of the capture panel (name auto upper-cased, Nigerian phone).
 */

import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../../context/ToastContext';
import { schoolCaptureApi } from '../../api/schoolCapture';
import { formatDateTime } from '../../utils/helpers';
import { NIGERIAN_PHONE, errorMessage } from './captureConstants';
import { IconAlertTriangle, IconCircleCheck, IconClock } from '@tabler/icons-react';

export default function CapturePrincipalSection({ school, onSubmitted }) {
  const { toast } = useToast();
  const request = school.principal_request;
  const current = school.current || {};

  const [name, setName] = useState((current.principal_name || '').toUpperCase());
  const [phone, setPhone] = useState(current.principal_phone || '');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!school.can_submit_principal && request && request.status !== 'rejected') {
    const isPending = request.status === 'pending';
    const Icon = isPending ? IconClock : IconCircleCheck;
    return (
      <div className={`rounded-lg border p-3 ${isPending ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}`}>
        <p className={`flex items-center gap-2 text-sm font-semibold ${isPending ? 'text-blue-800' : 'text-green-800'}`}>
          <Icon className="h-4 w-4 shrink-0" />
          {isPending ? 'Awaiting review by the TP unit' : 'Approved'}
        </p>
        <p className="mt-1.5 break-words text-sm text-gray-800">{request.principal_name}</p>
        <p className="text-sm text-gray-600">{request.principal_phone}</p>
        <p className="mt-1 text-xs text-gray-500">
          {request.by_me ? 'Submitted by you' : 'Submitted by another supervisor'} ·{' '}
          {formatDateTime(request.submitted_at, '-')}
        </p>
      </div>
    );
  }
  if (!school.can_submit_principal) {
    return <p className="text-sm text-gray-500">Principal details cannot be submitted for this school right now.</p>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (name.trim().length < 3) errs.name = 'Principal name must be at least 3 characters';
    if (!NIGERIAN_PHONE.test(phone.trim())) errs.phone = 'Enter a valid Nigerian phone number (e.g. 08012345678)';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      await schoolCaptureApi.submitPrincipal(school.id, {
        proposed_principal_name: name.trim(),
        proposed_principal_phone: phone.trim(),
      });
      toast.success('Principal details submitted for approval');
      await onSubmitted();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to submit principal details'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {request?.status === 'rejected' && (
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
          <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-red-800">Your last submission was rejected</p>
            <p className="mt-0.5 break-words text-red-700">{request.rejection_reason || 'No reason was given.'}</p>
            <p className="mt-1 text-xs text-red-600">Please correct the details below and resubmit.</p>
          </div>
        </div>
      )}
      <Input
        label="Principal's full name"
        value={name}
        error={errors.name}
        autoComplete="off"
        onChange={(e) => setName(e.target.value.toUpperCase())}
        placeholder="e.g. MRS ADA OBI"
      />
      <Input
        label="Principal's phone number"
        type="tel"
        inputMode="tel"
        value={phone}
        error={errors.phone}
        autoComplete="off"
        onChange={(e) => setPhone(e.target.value)}
        placeholder="08012345678"
      />
      <Button type="submit" size="lg" className="h-12 w-full" loading={submitting} disabled={submitting}>
        Submit principal details for approval
      </Button>
    </form>
  );
}
